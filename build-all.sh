#!/bin/sh
# Baut alle Installer: Windows-Setup, Linux-AppImage, macOS (Apple Silicon + Intel). ./build-all.sh 1.2.3
set -e
V="$1"; [ -n "$V" ] || { echo "Version fehlt"; exit 2; }
cd /home/claude
export GOPROXY=off GOFLAGS=-mod=mod
REPO=$(tr -d ' \n' < release/github-repo.txt 2>/dev/null || true)
LD="-s -w -H windowsgui -X kit/setup.Version=$V -X kit/update.GitHubRepo=$REPO -X kit/solo.Bundled=1"
(cd video && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/Videoschnitt.exe .)
gzip -9 -c video/dist/Videoschnitt.exe > hub/payload/windows/Videoschnitt.exe.gz
(cd mp3cutter && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/MP3-Schneider.exe .)
gzip -9 -c mp3cutter/dist/MP3-Schneider.exe > hub/payload/windows/MP3-Schneider.exe.gz
(cd streampilot && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/StreamPilot.exe .)
gzip -9 -c streampilot/dist/StreamPilot.exe > hub/payload/windows/StreamPilot.exe.gz
(cd image && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/Bildbearbeitung.exe .)
gzip -9 -c image/dist/Bildbearbeitung.exe > hub/payload/windows/Bildbearbeitung.exe.gz
(cd motion && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/Motion-Design.exe .)
gzip -9 -c motion/dist/Motion-Design.exe > hub/payload/windows/Motion-Design.exe.gz
(cd hub && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o ../hub-dist-umw/Dateityp-Umwandler.exe ./cmd/umwandler)
gzip -9 -c hub-dist-umw/Dateityp-Umwandler.exe > hub/payload/windows/Dateityp-Umwandler.exe.gz
(cd hub && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/Creator-Hub.exe .)
gzip -9 -c hub/dist/Creator-Hub.exe > installer/payload/Creator-Hub.exe.gz
(cd installer && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD -X main.Tag=CHSETUPVER-$V-END" -o dist/Creator-Hub-Setup.exe .)
appimage/build-linux.sh "$V"
macos/build-mac.sh "$V"
./build-tools.sh "$V"
cp installer/dist/Creator-Hub-Setup.exe appimage/dist/Creator-Hub-x86_64.AppImage macos/dist/Creator-Hub-macOS-AppleSilicon.zip macos/dist/Creator-Hub-macOS-Intel.zip /mnt/user-data/outputs/
sync
ls -l /mnt/user-data/outputs/
