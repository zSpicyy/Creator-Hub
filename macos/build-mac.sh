#!/bin/sh
# Baut Creator Hub für macOS: ./build-mac.sh 1.2.3
# Ergebnis: dist/Creator-Hub-macOS-AppleSilicon.zip und dist/Creator-Hub-macOS-Intel.zip
set -e
V="$1"; [ -n "$V" ] || { echo "Version fehlt"; exit 2; }
R=/home/claude; M=$R/macos; cd $R
export GOPROXY=off GOFLAGS=-mod=mod GOOS=darwin CGO_ENABLED=0
REPO=$(tr -d ' \n' < release/github-repo.txt 2>/dev/null || true)
LD="-s -w -X kit/setup.Version=$V -X kit/update.GitHubRepo=$REPO -X kit/solo.Bundled=1"
[ -f $M/icons/Motion-Design.icns ] || python3 $M/make-icons.py $M/icons
mkdir -p $M/dist
for A in arm64 amd64; do
  export GOARCH=$A
  P=hub/payload/darwin-$A; rm -rf $P; mkdir -p $P
  (cd video && go build -trimpath -ldflags "$LD" -o dist/darwin-$A/Videoschnitt .)
  (cd mp3cutter && go build -trimpath -ldflags "$LD" -o dist/darwin-$A/MP3-Schneider .)
  (cd image && go build -trimpath -ldflags "$LD" -o dist/darwin-$A/Bildbearbeitung .)
  gzip -9 -c image/dist/darwin-$A/Bildbearbeitung > $P/Bildbearbeitung.gz
  (cd motion && go build -trimpath -ldflags "$LD" -o dist/darwin-$A/Motion-Design .)
  gzip -9 -c motion/dist/darwin-$A/Motion-Design > $P/Motion-Design.gz
  gzip -9 -c video/dist/darwin-$A/Videoschnitt > $P/Videoschnitt.gz
  gzip -9 -c mp3cutter/dist/darwin-$A/MP3-Schneider > $P/MP3-Schneider.gz
  (cd streampilot && go build -trimpath -ldflags "$LD" -o dist/darwin-$A/StreamPilot .)
  gzip -9 -c streampilot/dist/darwin-$A/StreamPilot > $P/StreamPilot.gz
  # Social-Planer vorerst nicht: (cd kanalwerk && go build -trimpath -ldflags "$LD" -o dist/darwin-$A/Social-Planer .)
  # gzip -9 -c kanalwerk/dist/darwin-$A/Social-Planer > $P/Social-Planer.gz
  (cd hub && go build -trimpath -ldflags "$LD" -o ../hub-dist-umw/darwin-$A/Dateityp-Umwandler ./cmd/umwandler)
  gzip -9 -c hub-dist-umw/darwin-$A/Dateityp-Umwandler > $P/Dateityp-Umwandler.gz
  cp $M/icons/Videoschnitt.icns $M/icons/MP3-Schneider.icns $M/icons/Bildbearbeitung.icns $M/icons/Dateityp-Umwandler.icns $M/icons/Motion-Design.icns $M/icons/StreamPilot.icns $P/
  B=$M/build/$A/"Creator Hub.app"; rm -rf "$M/build/$A"; mkdir -p "$B/Contents/MacOS" "$B/Contents/Resources"
  (cd hub && go build -trimpath -ldflags "$LD" -o "$B/Contents/MacOS/Creator-Hub" .)
  cp $M/icons/hub.icns "$B/Contents/Resources/icon.icns"
  cat > "$B/Contents/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Creator Hub</string>
<key>CFBundleDisplayName</key><string>Creator Hub</string>
<key>CFBundleIdentifier</key><string>app.creatorhub.hub</string>
<key>CFBundleExecutable</key><string>Creator-Hub</string>
<key>CFBundleIconFile</key><string>icon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$V</string>
<key>CFBundleVersion</key><string>$V</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>LSApplicationCategoryType</key><string>public.app-category.video</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>
P
  printf 'APPL????' > "$B/Contents/PkgInfo"
  N=AppleSilicon; [ $A = amd64 ] && N=Intel
  python3 -I $M/zipapp.py "$M/build/$A" $M/LIESMICH.txt $M/dist/Creator-Hub-macOS-$N.zip
done
ls -l $M/dist
