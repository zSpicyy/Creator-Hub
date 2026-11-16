// Dateityp-Umwandler im Browser: ffmpeg.wasm (ffmpeg für den Browser) mit denselben Einstellungen wie die App (formats.go).
// Die Eingabedatei wird nicht kopiert, sondern direkt gelesen (WORKERFS), damit auch größere Dateien gehen.
const CORE_VER = '0.12.6', CORES = [`https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VER}/dist/umd/`, `https://unpkg.com/@ffmpeg/core@${CORE_VER}/dist/umd/`];
let CORE = CORES[0], wasmBlobURL = null;
const CACHE = 'creatorhub-models-v1';
let core = null, loading = false, done = 0, error = '', logs = [], progress = null;

async function wasmURL(onp) {
  if (wasmBlobURL) return wasmBlobURL;
  const key = 'https://cache.creatorhub.local/ffmpeg/' + CORE_VER + '/ffmpeg-core.wasm';
  try { const c = await caches.open(CACHE); const r = await c.match(key); if (r) return wasmBlobURL = URL.createObjectURL(await r.blob()); } catch (e) {}
  let last = null;
  for (let i = 0; i < 4; i++) { const base = CORES[i % 2];
    try { const r = await fetch(base + 'ffmpeg-core.wasm'); if (!r.ok) throw new Error('HTTP ' + r.status);
      const total = 32129114, rd = r.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done: d, value } = await rd.read(); if (d) break; parts.push(value); got += value.length; onp(Math.min(.99, got / total)); }
      const blob = new Blob(parts, { type: 'application/wasm' }); CORE = base;
      try { const c = await caches.open(CACHE); await c.put(key, new Response(blob)); } catch (e) {}
      return wasmBlobURL = URL.createObjectURL(blob);
    } catch (e) { last = e; } }
  throw last || new Error('keine Verbindung');
}
async function ensure(onp) {
  if (core) return; loading = true; error = ''; done = 0;
  try {
    const wasm = await wasmURL(p => { done = p * .9; onp && onp(done); });
    if (!self.createFFmpegCore) importScripts(CORE + 'ffmpeg-core.js');
    core = await self.createFFmpegCore({ mainScriptUrlOrBlob: CORE + 'ffmpeg-core.js#' + btoa(JSON.stringify({ wasmURL: wasm })) });
    core.setLogger(({ message }) => { logs.push(message); if (logs.length > 400) logs.shift(); });
    core.setProgress(({ progress: p }) => { if (progress && p >= 0 && p <= 1) progress(p); });
    try { core.FS.mkdir('/in'); } catch (e) {}
    done = 1;
  } catch (e) { error = 'Das Umwandlungsprogramm ließ sich nicht laden (' + (e.message || e) + '). Prüfe deine Internetverbindung.'; core = null; throw new Error(error); }
  finally { loading = false; }
}
function exec(args, onp) { logs = []; progress = onp || null; core.exec(...args); const ret = core.ret; core.reset(); progress = null; return ret; }
function mount(file) { try { core.FS.unmount('/in'); } catch (e) {} core.FS.mount(core.FS.filesystems.WORKERFS, { files: [file] }, '/in'); return '/in/' + file.name; }
function unmount() { try { core.FS.unmount('/in'); } catch (e) {} }
const rm = p => { try { core.FS.unlink(p); } catch (e) {} };

// gleiche Parameter wie ffmpegArgs in formats.go
function args(src, out, f, quality) {
  const a = ['-hide_banner', '-nostdin', '-y', '-i', src, '-map_metadata', '0'], q = (h, m, s) => quality === 'high' ? h : quality === 'small' ? s : m, vf = [];
  switch (f) {
    case 'mp3': a.push('-vn', '-c:a', 'libmp3lame', '-b:a', q('320k', '192k', '128k')); break;
    case 'wav': a.push('-vn', '-c:a', 'pcm_s16le'); break;
    case 'flac': a.push('-vn', '-c:a', 'flac'); break;
    case 'm4a': a.push('-vn', '-c:a', 'aac', '-b:a', q('256k', '192k', '128k')); break;
    case 'ogg': a.push('-vn', '-c:a', 'libvorbis', '-q:a', q('8', '5', '3')); break;
    case 'opus': a.push('-vn', '-c:a', 'libopus', '-b:a', q('192k', '128k', '64k')); break;
    case 'aiff': a.push('-vn', '-c:a', 'pcm_s16be'); break;
    case 'wma': a.push('-vn', '-c:a', 'wmav2', '-b:a', q('256k', '192k', '128k')); break;
    case 'mp4': case 'mov': case 'mkv':
      vf.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
      a.push('-c:v', 'libx264', '-preset', 'medium', '-crf', q('18', '23', '28'), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k');
      if (f !== 'mkv') a.push('-movflags', '+faststart'); break;
    // VP9 stürzt in der Browser-Fassung von ffmpeg ab, darum hier VP8 (ebenfalls WebM)
    case 'webm': a.push('-c:v', 'libvpx', '-b:v', q('8M', '4M', '1500k'), '-crf', q('6', '10', '20'), '-qmin', '0', '-qmax', q('30', '40', '50'), '-c:a', 'libopus', '-b:a', '128k'); break;
    case 'avi': a.push('-c:v', 'mpeg4', '-q:v', q('2', '5', '9'), '-c:a', 'libmp3lame', '-b:a', '192k'); break;
    case 'gif': vf.push('fps=15', "scale='min(640,iw)':-2:flags=lanczos", 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'); a.push('-an', '-loop', '0'); break;
    case 'png': a.push('-frames:v', '1', '-c:v', 'png'); break;
    case 'jpg': a.push('-frames:v', '1', '-c:v', 'mjpeg', '-q:v', q('2', '4', '8'), '-pix_fmt', 'yuvj420p'); break;
    case 'webp': a.push('-frames:v', '1', '-c:v', 'libwebp', '-quality', q('95', '85', '70')); break;
    case 'bmp': a.push('-frames:v', '1', '-c:v', 'bmp'); break;
    case 'tiff': a.push('-frames:v', '1', '-c:v', 'tiff'); break;
    case 'ico': vf.push("scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease"); a.push('-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba'); break;
  }
  if (vf.length) a.push(f === 'gif' ? '-filter_complex' : '-vf', vf.join(','));
  return a.concat([out]);
}
// AVIF: ffmpeg.wasm hat keinen AV1-Encoder; Einzelbild wird über ffmpeg gelesen und mit libavif (jsquash) kodiert.
// Qualität wie in der App (libaom crf 20/30/40, umgerechnet auf die Skala 0–100).
let avif = null;
async function avifEncode(png, quality) {
  if (!avif) { const m = await import('https://cdn.jsdelivr.net/npm/@jsquash/avif@1.3.0/encode.js/+esm');
    const wasm = await (await fetch('https://cdn.jsdelivr.net/npm/@jsquash/avif@1.3.0/codec/enc/avif_enc.wasm')).arrayBuffer();
    await m.init(await WebAssembly.compile(wasm)); avif = m; }
  const bm = await createImageBitmap(new Blob([png], { type: 'image/png' })); const c = new OffscreenCanvas(bm.width, bm.height), x = c.getContext('2d'); x.drawImage(bm, 0, 0);
  const q = { high: 68, medium: 52, small: 37 }[quality] || 52;
  return new Blob([await avif.default(x.getImageData(0, 0, bm.width, bm.height), { quality: q, speed: 6 })], { type: 'image/avif' });
}
function friendly() {
  const s = logs.join('\n').toLowerCase();
  if (/unknown encoder|encoder not found/.test(s)) return 'Dieses Zielformat geht im Browser nicht. In der App klappt es.';
  if (/invalid data found|moov atom not found/.test(s)) return 'Die Datei ist beschädigt oder kein Medium, das ich lesen kann.';
  if (/does not contain any stream|output file does not contain/.test(s)) return 'In der Datei steckt nichts, was sich in dieses Format umwandeln lässt.';
  if (/out of memory|cannot enlarge memory|memory access out of bounds/.test(s)) return 'Die Datei ist zu groß für den Browser. In der App gibt es keine Größengrenze.';
  const l = logs.filter(Boolean); return l.length ? l[l.length - 1] : 'Die Umwandlung ist fehlgeschlagen.';
}
// Infos wie ffprobe, aus der Ausgabe von „ffmpeg -i“
function probeLogs() {
  const s = logs.join('\n'); const r = { dur: 0, w: 0, h: 0, hasV: false, hasA: false, codec: '' };
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(s); if (d) r.dur = +d[1] * 3600 + +d[2] * 60 + +d[3];
  for (const line of s.split('\n')) {
    const v = /Stream #.*Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})/.exec(line); if (v && !r.hasV) { r.hasV = true; r.codec = v[1]; r.w = +v[2]; r.h = +v[3]; }
    const a = /Stream #.*Audio: (\w+)/.exec(line); if (a) { r.hasA = true; if (!r.codec) r.codec = a[1]; }
  }
  return r;
}
let chain = Promise.resolve();
self.onmessage = e => {
  const { id, op, args: a } = e.data, prog = (p) => self.postMessage({ id, progress: p });
  const run = async () => {
    try {
      let res;
      if (op === 'status') res = { ready: !!core, loading, done, error };
      else if (op === 'install') { await ensure(prog); res = { ready: true }; }
      else if (op === 'probe') { await ensure(); const p = mount(a.file); exec(['-hide_banner', '-i', p]); unmount(); res = probeLogs(); }
      else if (op === 'convert') {
        await ensure(); const p = mount(a.file), out = '/out.' + (a.target === 'avif' ? 'png' : a.ext);
        const ret = exec(a.target === 'avif' ? ['-hide_banner', '-nostdin', '-y', '-i', p, '-frames:v', '1', '-c:v', 'png', '-pix_fmt', 'rgba', out] : args(p, out, a.target, a.quality), prog);
        let blob = null; try { const data = core.FS.readFile(out); if (data && data.length) blob = new Blob([data]); } catch (x) {}
        rm(out); unmount();
        if (ret !== 0 || !blob) throw new Error(friendly());
        if (a.target === 'avif') blob = await avifEncode(await blob.arrayBuffer(), a.quality);
        res = { blob };
      }
      else if (op === 'thumb') { // Vorschaubild für den Verlauf
        await ensure(); const p = mount(a.file); const r = exec(['-hide_banner', '-y', ...(a.video ? ['-ss', String(Math.min(1, (a.dur || 0) / 2))] : []), '-i', p, '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '5', '/t.jpg']);
        let blob = null; try { blob = new Blob([core.FS.readFile('/t.jpg')], { type: 'image/jpeg' }); } catch (x) {} rm('/t.jpg'); unmount(); res = r === 0 ? blob : null;
      }
      else throw new Error('Unbekannt: ' + op);
      self.postMessage({ id, ok: true, result: res });
    } catch (err) {
      let msg = err && err.message || String(err);
      if (err instanceof WebAssembly.RuntimeError || /memory access out of bounds|unreachable/.test(msg)) { core = null; msg = 'Die Datei ist zu groß oder zu ungewöhnlich für den Browser. In der App klappt es.'; }
      self.postMessage({ id, ok: false, error: msg });
    }
  };
  if (op === 'status') run(); else chain = chain.then(run);
};
