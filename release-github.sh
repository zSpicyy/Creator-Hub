#!/bin/sh
# Veröffentlicht eine neue Version auf GitHub (alle drei Systeme) – danach bekommen alle Installationen
# das Update automatisch angeboten.
#
#   ./release-github.sh 1.2.0 "Was ist neu (Deutsch)" "What's new (English)"
#
# Voraussetzungen (einmalig):
#   1. Projekt auf GitHub anlegen (öffentlich, damit die Apps ohne Anmeldung laden können)
#   2. Name in release/github-repo.txt eintragen, z. B.  meinname/creator-hub
#   3. gh auth login   (GitHub-Kommandozeile anmelden)
set -e
V="$1"; DE="$2"; EN="$3"
[ -n "$V" ] || { echo "Version fehlt"; exit 2; }
cd /home/claude
REPO=$(tr -d ' \n' < release/github-repo.txt 2>/dev/null || true)
[ -n "$REPO" ] || { echo "release/github-repo.txt ist leer – bitte name/projekt eintragen."; exit 2; }
./build-all.sh "$V"
D=release/out/$V; rm -rf $D; mkdir -p $D
cp installer/dist/Creator-Hub-Setup.exe appimage/dist/Creator-Hub-x86_64.AppImage \
   macos/dist/Creator-Hub-macOS-AppleSilicon.zip macos/dist/Creator-Hub-macOS-Intel.zip $D/
(cd release && GOPROXY=off GOFLAGS=-mod=mod go run . make -version "$V" -github "$REPO" \
   -windows ../$D/Creator-Hub-Setup.exe -linux ../$D/Creator-Hub-x86_64.AppImage \
   -mac-arm64 ../$D/Creator-Hub-macOS-AppleSilicon.zip -mac-amd64 ../$D/Creator-Hub-macOS-Intel.zip \
   -notes-de "$DE" -notes-en "$EN" -key creatorhub-release.key -out ../$D/latest.json)
# Sicherheitsnetz: der private Schlüssel darf nie mit hochgeladen werden
ls $D | grep -qi '\.key$' && { echo "Schlüssel im Upload-Ordner – Abbruch."; exit 1; }
# Releases dürfen hier nicht direkt angelegt werden: Dateien in einen Upload-Zweig schieben,
# die GitHub-Automatik (.github/workflows/release.yml) macht daraus das Release und löscht den Zweig.
G=/home/claude/creator-hub
git -C $G fetch -q origin main && git -C $G checkout -q -B "upload/v$V" FETCH_HEAD
rm -rf $G/release; mkdir -p $G/release; cp $D/* $G/release/
printf '%s\n\n%s\n' "$DE" "$EN" > $G/release/NOTES.md
ls $G/release | grep -qi '\.key$' && { echo "Schlüssel im Upload – Abbruch."; exit 1; }
git -C $G add release && git -C $G -c user.name="zSpicyy" -c user.email="maxmeisteryt@gmail.com" commit -q -m "Upload v$V"
git -C $G push -q origin "upload/v$V"
git -C $G checkout -q main
echo "Hochgeladen – GitHub legt das Release in etwa einer Minute an:"
echo "https://github.com/$REPO/releases/tag/v$V"
