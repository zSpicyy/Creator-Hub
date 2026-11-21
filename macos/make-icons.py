# Rendert die SVG-Logos als PNG (für Linux) und baut .icns-Dateien (für macOS).
# Aufruf: python3 make-icons.py <ausgabeordner>
import io, struct, sys, os
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
logos = {'hub': '/home/claude/hub/web/logos/hub.svg', 'Videoschnitt': '/home/claude/hub/web/logos/video.svg', 'MP3-Schneider': '/home/claude/hub/web/logos/mp3.svg', 'Bildbearbeitung': '/home/claude/hub/web/logos/image.svg', 'Dateityp-Umwandler': '/home/claude/hub/web/logos/convert.svg', 'Motion-Design': '/home/claude/hub/web/logos/motion.svg', 'Upscaler': '/home/claude/hub/web/logos/upscale.svg', 'Freisteller': '/home/claude/hub/web/logos/cutout.svg', 'StreamPilot': '/home/claude/hub/web/logos/streampilot.svg', 'Kanalwerk': '/home/claude/hub/web/logos/kanalwerk.svg'}
def render(svg):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1024, 'height': 1024})
        svgtxt = open(svg).read()
        pg.set_content('<html><body style="margin:0;background:transparent"><div style="width:1024px;height:1024px">' + svgtxt.replace('<svg ', '<svg style="width:1024px;height:1024px;display:block" ', 1) + '</div></body></html>')
        pg.wait_for_timeout(300)
        png = pg.screenshot(omit_background=True, clip={'x': 0, 'y': 0, 'width': 1024, 'height': 1024}); b.close()
    return Image.open(io.BytesIO(png)).convert('RGBA')
def pngbytes(img, size):
    buf = io.BytesIO(); img.resize((size, size), Image.LANCZOS).save(buf, 'PNG'); return buf.getvalue()
for name, svg in logos.items():
    img = render(svg)
    # macOS-Symbole haben etwas Rand (Apple-Raster: 824 von 1024 px)
    pad = Image.new('RGBA', (1024, 1024)); pad.paste(img.resize((864, 864), Image.LANCZOS), (80, 80))
    entries = [(b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024), (b'ic11', 32), (b'ic12', 64), (b'ic13', 256), (b'ic14', 512)]
    body = b''.join(t + struct.pack('>I', 8 + len(d)) + d for t, d in ((t, pngbytes(pad, s)) for t, s in entries))
    open(os.path.join(out, name + '.icns'), 'wb').write(b'icns' + struct.pack('>I', 8 + len(body)) + body)
    for s in (256, 512):
        img.resize((s, s), Image.LANCZOS).save(os.path.join(out, f'{name}-{s}.png'))
    print(name, 'ok')
