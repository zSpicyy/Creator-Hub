# Packt „Creator Hub.app“ samt Anleitung als ZIP und behält die Ausführungsrechte (für den Finder).
import os, sys, zipfile, stat
src, readme, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(src):
        dirs.sort()
        for d in dirs:
            p = os.path.join(root, d); rel = os.path.relpath(p, src) + '/'
            zi = zipfile.ZipInfo(rel); zi.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10; zi.create_system = 3
            z.writestr(zi, b'')
        for f in sorted(files):
            p = os.path.join(root, f); rel = os.path.relpath(p, src)
            mode = 0o755 if os.access(p, os.X_OK) else 0o644
            zi = zipfile.ZipInfo(rel); zi.external_attr = (stat.S_IFREG | mode) << 16; zi.create_system = 3
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, open(p, 'rb').read())
    zi = zipfile.ZipInfo('LIESMICH - READ ME.txt'); zi.external_attr = (stat.S_IFREG | 0o644) << 16; zi.create_system = 3
    z.writestr(zi, open(readme, 'rb').read())
print('ok:', out, os.path.getsize(out) // 1024, 'KB')
