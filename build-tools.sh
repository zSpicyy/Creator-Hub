#!/bin/sh
# Baut jedes Werkzeug als eigenständigen Download für alle vier Systeme (läuft ohne den Hub).
# Nach build-all.sh aufrufen: ./build-tools.sh 1.2.3  ->  tools-dist/<Werkzeug>-<System>
set -e
V="$1"; [ -n "$V" ] || { echo "Version fehlt"; exit 2; }
R=/home/claude; cd $R
export GOPROXY=off GOFLAGS=-mod=mod CGO_ENABLED=0
REPO=$(tr -d ' \n' < release/github-repo.txt 2>/dev/null || true)
LD="-s -w -X kit/setup.Version=$V -X kit/update.GitHubRepo=$REPO"
O=${OUT:-$R/tools-dist}; W=$O.build; rm -rf $O $W; mkdir -p $O $W
[ -f macos/icons/Social-Planer.icns ] || python3 macos/make-icons.py macos/icons
# Name | Quelle (Ordner und Paket) | Titel | englischer Titel | was es nachlädt | Logo | Farbe
LIST="Videoschnitt|video|.|Videoschnitt|Video Editor|ffmpeg|video|#8a5ef0
Bildbearbeitung|image|.|Bildbearbeitung|Image Editor||image|#3f78f0
Motion-Design|motion|.|Motion Design|Motion Design|ffmpeg|motion|#4f5bd5
MP3-Schneider|mp3cutter|.|MP3 Schneider|MP3 Splitter||mp3|#f0663a
Dateityp-Umwandler|hub|./cmd/umwandler|Dateityp-Umwandler|File Converter|ffmpeg|convert|#1fc4b8
Upscaler|hub|./cmd/upscaler|Upscaler|Upscaler|ai:upscale|upscale|#33c97c
Freisteller|hub|./cmd/freisteller|Hintergrund-Entferner|Background Remover|ai:cutout|cutout|#e0449a
StreamPilot|streampilot|.|StreamPilot|StreamPilot||streampilot|#7c4dff"
# Social-Planer ist vorerst „Kommt bald“ und wird nicht mitgebaut: Social-Planer|kanalwerk|.|Social-Planer|Social-Planer||kanalwerk|#ff6b4a
[ -n "$ONLY" ] && LIST=$(echo "$LIST" | grep "^$ONLY|")
GOOS= GOARCH= go build -C appimage -o /tmp/aibuild ./cmd/build
echo "$LIST" | while IFS='|' read N DIR PKG T TE NEED LOGO COL; do
  # Windows: die .exe ist das Programm selbst
  if [ "$SYS" != linux ]; then
    (cd $DIR && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD -H windowsgui" -o $O/$N-Windows.exe $PKG)
    # Windows-Installer: richtet das Werkzeug samt KI/ffmpeg ein (toolsetup/)
    [ -f macos/icons/$N.syso ] || python3 tools/mksyso.py /home/claude/hub/web/logos/$LOGO.svg macos/icons/$N.syso >/dev/null
    cp macos/icons/$N.syso toolsetup/icon_windows_amd64.syso
    cp hub/web/logos/$LOGO.svg toolsetup/payload/logo.svg
    gzip -9 -c $O/$N-Windows.exe > toolsetup/payload/tool.exe.gz
    (cd toolsetup && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD -H windowsgui -X main.Tool=$N -X 'main.Title=$T' -X 'main.TitleEN=$TE' -X 'main.Color=$COL' -X main.Needs=$NEED -X main.Tag=CHTOOLSETUP-$V-END" -o $O/$N-Setup.exe .)
  fi
  # Linux: AppImage
  A=$W/$N.AppDir; mkdir -p $A/usr/bin $A/usr/share/icons/hicolor/256x256/apps $A/usr/share/applications
  (cd $DIR && GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$LD" -o $A/usr/bin/$N $PKG)
  ID=creator-hub-$(echo $N | tr 'A-Z' 'a-z')
  cp macos/icons/$N-256.png $A/$ID.png; cp macos/icons/$N-256.png $A/usr/share/icons/hicolor/256x256/apps/$ID.png; ln -s $ID.png $A/.DirIcon
  cat > $A/$ID.desktop <<D
[Desktop Entry]
Type=Application
Name=$TE
Name[de]=$T
Comment=Creator Hub
Exec=$N
Icon=$ID
Terminal=false
Categories=AudioVideo;Graphics;Utility;
X-AppImage-Version=$V
D
  cp $A/$ID.desktop $A/usr/share/applications/
  printf '#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/usr/bin/%s" "$@"\n' "$N" > $A/AppRun
  chmod 755 $A/AppRun $A/usr/bin/$N
  (cd appimage && GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X main.Tag=CHTOOLVER-$V-END -X 'main.Name=$T'" -o $W/runtime-$N ./cmd/runtime)
  /tmp/aibuild $A $W/runtime-$N $O/$N-Linux-x86_64.AppImage
  # macOS: App im ZIP, je einmal für Apple-Chip und Intel
  [ "$SYS" = linux ] || for G in arm64 amd64; do
    B=$W/mac-$G-$N/"$T.app"; mkdir -p "$B/Contents/MacOS" "$B/Contents/Resources"
    (cd $DIR && GOOS=darwin GOARCH=$G go build -trimpath -ldflags "$LD" -o "$B/Contents/MacOS/$N" $PKG)
    cp macos/icons/$N.icns "$B/Contents/Resources/icon.icns"
    cat > "$B/Contents/Info.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>$T</string>
<key>CFBundleDisplayName</key><string>$T</string>
<key>CFBundleIdentifier</key><string>app.creatorhub.$(echo $N | tr -d '-' | tr 'A-Z' 'a-z')</string>
<key>CFBundleExecutable</key><string>$N</string>
<key>CFBundleIconFile</key><string>icon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$V</string>
<key>CFBundleVersion</key><string>$V</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>
P
    printf 'APPL????' > "$B/Contents/PkgInfo"
    S=AppleSilicon; [ $G = amd64 ] && S=Intel
    sed "s/@T@/$T/g" macos/LIESMICH-Werkzeug.txt > $W/liesmich-$N.txt
    python3 -I macos/zipapp.py "$W/mac-$G-$N" $W/liesmich-$N.txt $O/$N-macOS-$S.zip >/dev/null
  done
  echo "fertig: $N"
done
rm -rf $W
[ -n "$ONLY$OUT" ] && exit 0
mkdir -p /mnt/user-data/outputs/Werkzeuge && rm -f /mnt/user-data/outputs/Werkzeuge/* && cp $O/* /mnt/user-data/outputs/Werkzeuge/
ls -l $O | awk '{print $5, $9}'; du -sh $O
