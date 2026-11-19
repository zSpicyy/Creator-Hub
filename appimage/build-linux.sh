#!/bin/sh
# Baut Creator-Hub-x86_64.AppImage: ./build-linux.sh 1.2.3
set -e
V="$1"; [ -n "$V" ] || { echo "Version fehlt"; exit 2; }
R=/home/claude; cd $R
export GOPROXY=off GOFLAGS=-mod=mod GOOS=linux GOARCH=amd64
REPO=$(tr -d ' \n' < release/github-repo.txt 2>/dev/null || true)
LD="-s -w -X kit/setup.Version=$V -X kit/update.GitHubRepo=$REPO -X kit/solo.Bundled=1"
(cd video && CGO_ENABLED=0 go build -trimpath -ldflags "$LD" -o dist/linux/Videoschnitt .)
(cd mp3cutter && CGO_ENABLED=0 go build -trimpath -ldflags "$LD" -o dist/linux/MP3-Schneider .)
(cd image && CGO_ENABLED=0 go build -trimpath -ldflags "$LD" -o dist/linux/Bildbearbeitung .)
gzip -9 -c image/dist/linux/Bildbearbeitung > hub/payload/linux/Bildbearbeitung.gz
(cd motion && CGO_ENABLED=0 go build -trimpath -ldflags "$LD" -o dist/linux/Motion-Design .)
gzip -9 -c motion/dist/linux/Motion-Design > hub/payload/linux/Motion-Design.gz
gzip -9 -c video/dist/linux/Videoschnitt > hub/payload/linux/Videoschnitt.gz
gzip -9 -c mp3cutter/dist/linux/MP3-Schneider > hub/payload/linux/MP3-Schneider.gz
(cd streampilot && CGO_ENABLED=0 go build -trimpath -ldflags "$LD" -o dist/linux/StreamPilot .)
gzip -9 -c streampilot/dist/linux/StreamPilot > hub/payload/linux/StreamPilot.gz
(cd hub && CGO_ENABLED=0 go build -trimpath -ldflags "$LD" -o ../hub-dist-umw/linux/Dateityp-Umwandler ./cmd/umwandler)
gzip -9 -c hub-dist-umw/linux/Dateityp-Umwandler > hub/payload/linux/Dateityp-Umwandler.gz
[ -f macos/icons/Motion-Design-256.png ] || python3 macos/make-icons.py macos/icons
cp macos/icons/Dateityp-Umwandler-256.png hub/payload/linux/Dateityp-Umwandler.png
cp macos/icons/Videoschnitt-256.png hub/payload/linux/Videoschnitt.png
cp macos/icons/MP3-Schneider-256.png hub/payload/linux/MP3-Schneider.png
cp macos/icons/StreamPilot-256.png hub/payload/linux/StreamPilot.png
cp macos/icons/Bildbearbeitung-256.png hub/payload/linux/Bildbearbeitung.png
cp macos/icons/Motion-Design-256.png hub/payload/linux/Motion-Design.png
A=$R/appimage/AppDir; rm -rf $A; mkdir -p $A/usr/bin $A/usr/share/icons/hicolor/256x256/apps $A/usr/share/applications
(cd hub && go build -trimpath -ldflags "$LD" -o $A/usr/bin/Creator-Hub .)
cp macos/icons/hub-256.png $A/creator-hub.png; cp macos/icons/hub-256.png $A/usr/share/icons/hicolor/256x256/apps/creator-hub.png
ln -s creator-hub.png $A/.DirIcon
cat > $A/creator-hub.desktop <<D
[Desktop Entry]
Type=Application
Name=Creator Hub
Comment=All the tools a content creator needs
Comment[de]=Alle Werkzeuge für Content Creator
Exec=Creator-Hub
Icon=creator-hub
Terminal=false
Categories=AudioVideo;Graphics;Utility;
StartupWMClass=CreatorHub
X-AppImage-Version=$V
D
cp $A/creator-hub.desktop $A/usr/share/applications/
cat > $A/AppRun <<'D'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/bin/Creator-Hub" "$@"
D
chmod 755 $A/AppRun $A/usr/bin/Creator-Hub
cd appimage
GOOS= GOARCH= go build -o /tmp/aibuild ./cmd/build
CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Tag=CHSETUPVER-$V-END" -o dist/runtime ./cmd/runtime
mkdir -p dist
/tmp/aibuild $A dist/runtime dist/Creator-Hub-x86_64.AppImage
