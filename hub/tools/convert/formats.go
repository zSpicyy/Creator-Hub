package convert

import (
	"path/filepath"
	"strings"
)

type Format struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Cat   string `json:"cat"` // audio | video | image
	Ext   string `json:"ext"`
	Note  string `json:"note,omitempty"`
}

var formats = []Format{
	{"mp3", "MP3", "audio", "mp3", "Spielt jedes Gerät ab"},
	{"wav", "WAV", "audio", "wav", "Volle Qualität, große Datei"},
	{"flac", "FLAC", "audio", "flac", "Volle Qualität, kleiner als WAV"},
	{"m4a", "M4A", "audio", "m4a", "Gut für iPhone und Apple"},
	{"ogg", "OGG", "audio", "ogg", ""},
	{"opus", "Opus", "audio", "opus", "Sehr kleine Datei, guter Klang"},
	{"aiff", "AIFF", "audio", "aiff", ""},
	{"wma", "WMA", "audio", "wma", ""},
	{"mp4", "MP4", "video", "mp4", "Spielt jedes Gerät ab"},
	{"mkv", "MKV", "video", "mkv", "Behält mehrere Tonspuren"},
	{"webm", "WebM", "video", "webm", "Für Webseiten"},
	{"mov", "MOV", "video", "mov", ""},
	{"avi", "AVI", "video", "avi", ""},
	{"gif", "GIF", "video", "gif", "Bewegtes Bild ohne Ton"},
	{"png", "PNG", "image", "png", "Volle Qualität, durchsichtiger Hintergrund bleibt"},
	{"jpg", "JPG", "image", "jpg", ""},
	{"webp", "WebP", "image", "webp", ""},
	{"bmp", "BMP", "image", "bmp", ""},
	{"tiff", "TIFF", "image", "tiff", ""},
	{"ico", "ICO", "image", "ico", "Programm-Symbol, höchstens 256 × 256"},
	{"avif", "AVIF", "image", "avif", "Sehr kleine Datei, neue Geräte"},
}

var audioExt = set("mp3 wav flac m4a aac ogg oga opus wma aiff aif ape alac amr ac3 dts mka mp2 wv")
var videoExt = set("mp4 mkv webm mov avi wmv flv mpg mpeg m4v 3gp ts mts m2ts vob ogv divx asf f4v rm rmvb")
var imageExt = set("png jpg jpeg webp bmp tif tiff gif ico avif heic heif jxl tga ppm pgm pbm pcx exr hdr psd")

func set(s string) map[string]bool {
	m := map[string]bool{}
	for _, v := range strings.Fields(s) {
		m[v] = true
	}
	return m
}

// kindOf bestimmt die Art der Quelldatei aus der Endung. Unbekanntes wird als "unknown" gemeldet und trotzdem versucht.
func kindOf(path string) string {
	e := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
	switch {
	case audioExt[e]:
		return "audio"
	case videoExt[e]:
		return "video"
	case imageExt[e]:
		return "image"
	}
	return "unknown"
}

func findFormat(id string) *Format {
	for i := range formats {
		if formats[i].ID == id {
			return &formats[i]
		}
	}
	return nil
}

// possible sagt, ob aus der Quelle das Ziel entstehen kann.
func possible(src string, f *Format) bool {
	switch src {
	case "audio":
		return f.Cat == "audio"
	case "video":
		return true // Video → Video, Ton herausziehen, Einzelbild oder GIF
	case "image":
		return f.Cat == "image" || f.ID == "gif"
	}
	return true
}

// ffmpegArgs baut die Parameter. quality: high | medium | small
func ffmpegArgs(src, out string, f *Format, srcKind, quality string) []string {
	a := []string{"-hide_banner", "-nostdin", "-y", "-i", src, "-map_metadata", "0"}
	q := func(h, m, s string) string {
		switch quality {
		case "high":
			return h
		case "small":
			return s
		}
		return m
	}
	var vf []string
	switch f.ID {
	// Audio
	case "mp3":
		a = append(a, "-vn", "-c:a", "libmp3lame", "-b:a", q("320k", "192k", "128k"))
	case "wav":
		a = append(a, "-vn", "-c:a", "pcm_s16le")
	case "flac":
		a = append(a, "-vn", "-c:a", "flac")
	case "m4a":
		a = append(a, "-vn", "-c:a", "aac", "-b:a", q("256k", "192k", "128k"))
	case "ogg":
		a = append(a, "-vn", "-c:a", "libvorbis", "-q:a", q("8", "5", "3"))
	case "opus":
		a = append(a, "-vn", "-c:a", "libopus", "-b:a", q("192k", "128k", "64k"))
	case "aiff":
		a = append(a, "-vn", "-c:a", "pcm_s16be")
	case "wma":
		a = append(a, "-vn", "-c:a", "wmav2", "-b:a", q("256k", "192k", "128k"))
	// Video
	case "mp4", "mov", "mkv":
		vf = append(vf, "pad=ceil(iw/2)*2:ceil(ih/2)*2")
		a = append(a, "-c:v", "libx264", "-preset", "medium", "-crf", q("18", "23", "28"), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k")
		if f.ID == "mp4" || f.ID == "mov" {
			a = append(a, "-movflags", "+faststart")
		}
	case "webm":
		a = append(a, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", q("26", "32", "38"), "-row-mt", "1", "-c:a", "libopus", "-b:a", "128k")
	case "avi":
		a = append(a, "-c:v", "mpeg4", "-q:v", q("2", "5", "9"), "-c:a", "libmp3lame", "-b:a", "192k")
	case "gif":
		vf = append(vf, "fps=15", "scale='min(640,iw)':-2:flags=lanczos", "split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse")
		a = append(a, "-an", "-loop", "0")
	// Bilder
	case "png":
		a = append(a, "-frames:v", "1", "-c:v", "png")
	case "jpg":
		a = append(a, "-frames:v", "1", "-c:v", "mjpeg", "-q:v", q("2", "4", "8"), "-pix_fmt", "yuvj420p")
	case "webp":
		a = append(a, "-frames:v", "1", "-c:v", "libwebp", "-quality", q("95", "85", "70"))
	case "bmp":
		a = append(a, "-frames:v", "1", "-c:v", "bmp")
	case "tiff":
		a = append(a, "-frames:v", "1", "-c:v", "tiff")
	case "ico":
		vf = append(vf, "scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease")
		a = append(a, "-frames:v", "1", "-c:v", "png", "-pix_fmt", "rgba")
	case "avif":
		a = append(a, "-frames:v", "1", "-c:v", "libaom-av1", "-still-picture", "1", "-crf", q("20", "30", "40"), "-cpu-used", "6")
	}
	if len(vf) > 0 {
		if f.ID == "gif" {
			a = append(a, "-filter_complex", strings.Join(vf, ","))
		} else {
			a = append(a, "-vf", strings.Join(vf, ","))
		}
	}
	return append(a, "-progress", "pipe:1", "-nostats", out)
}

