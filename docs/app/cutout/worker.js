// Freisteller im Browser: dieselben vier Schritte wie in der App (engine.go), nach JavaScript übertragen.
//  1. IS-Net sucht das Motiv im ganzen Bild.  2. Bei kleinem Motiv ein zweiter, feinerer Durchgang.
//  3. Farbiger Guided Filter am Rand.  4. Randfarben vom alten Hintergrund befreien (Blur Fusion).
importScripts('../ai.js');
const MODEL = { file: 'isnet-general-use.onnx', size: 178648008, sha256: '60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a',
  sources: [new URL('../../models/isnet-general-use.onnx', self.location.href).href,
    'https://huggingface.co/fofr/comfyui/resolve/main/rembg/isnet-general-use.onnx',
    'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx'] };
const NET = 1024, WORK = 2048;
let sess = null, loading = false, done = 0, error = '';
const memo = new Map(); // Projekt -> {I, m}

// ---------- Ebenen ----------
const plane = (w, h, ch) => ({ w, h, ch, p: new Float32Array(w * h * ch) });
function rgbPlane(img) { // durchsichtig -> weiß
  const { width: w, height: h, data: s } = img, o = plane(w, h, 3);
  for (let i = 0, n = w * h; i < n; i++) { const a = s[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) o.p[i * 3 + c] = (s[i * 4 + c] * a + 255 * (1 - a)) / 255; }
  return o;
}
function resize(s, x0, y0, sw, sh, dw, dh) {
  const o = plane(dw, dh, s.ch), ch = s.ch, fx = sw / dw, fy = sh / dh, acc = new Float64Array(ch);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const d = (y * dw + x) * ch;
    if (fx > 1 || fy > 1) {
      const xa = Math.floor(x * fx), ya = Math.floor(y * fy);
      const xb = Math.min(Math.max(Math.ceil((x + 1) * fx), xa + 1), sw), yb = Math.min(Math.max(Math.ceil((y + 1) * fy), ya + 1), sh);
      acc.fill(0);
      for (let yy = ya; yy < yb; yy++) { let r = ((y0 + yy) * s.w + x0 + xa) * ch; for (let xx = 0; xx < (xb - xa); xx++, r += ch) for (let c = 0; c < ch; c++) acc[c] += s.p[r + c]; }
      const n = (xb - xa) * (yb - ya); for (let c = 0; c < ch; c++) o.p[d + c] = acc[c] / n; continue;
    }
    const sx = (x + .5) * fx - .5, sy = (y + .5) * fy - .5, ix = Math.floor(sx), iy = Math.floor(sy), tx = sx - ix, ty = sy - iy;
    const xa = Math.min(Math.max(ix, 0), sw - 1), xb = Math.min(Math.max(ix + 1, 0), sw - 1), ya = Math.min(Math.max(iy, 0), sh - 1), yb = Math.min(Math.max(iy + 1, 0), sh - 1);
    const p00 = ((y0 + ya) * s.w + x0 + xa) * ch, p10 = ((y0 + ya) * s.w + x0 + xb) * ch, p01 = ((y0 + yb) * s.w + x0 + xa) * ch, p11 = ((y0 + yb) * s.w + x0 + xb) * ch;
    for (let c = 0; c < ch; c++) o.p[d + c] = (s.p[p00 + c] * (1 - tx) + s.p[p10 + c] * tx) * (1 - ty) + (s.p[p01 + c] * (1 - tx) + s.p[p11 + c] * tx) * ty;
  }
  return o;
}
function box(s, r) {
  if (r < 1) return { ...s, p: s.p.slice() };
  const { w, h, ch } = s, t = plane(w, h, ch), o = plane(w, h, ch), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { const row = y * w * ch; for (let c = 0; c < ch; c++) { let sum = 0; for (let i = -r; i <= r; i++) sum += s.p[row + Math.min(Math.max(i, 0), w - 1) * ch + c];
    for (let x = 0; x < w; x++) { t.p[row + x * ch + c] = sum / n; sum += s.p[row + Math.min(x + r + 1, w - 1) * ch + c] - s.p[row + Math.max(x - r, 0) * ch + c]; } } }
  for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) { let sum = 0; for (let i = -r; i <= r; i++) sum += t.p[(Math.min(Math.max(i, 0), h - 1) * w + x) * ch + c];
    for (let y = 0; y < h; y++) { o.p[(y * w + x) * ch + c] = sum / n; sum += t.p[(Math.min(y + r + 1, h - 1) * w + x) * ch + c] - t.p[(Math.max(y - r, 0) * w + x) * ch + c]; } }
  return o;
}
async function runNet(img, x0, y0, w, h) {
  const inp = resize(img, x0, y0, w, h, NET, NET), n = NET * NET, data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { data[i] = inp.p[i * 3] - .5; data[n + i] = inp.p[i * 3 + 1] - .5; data[2 * n + i] = inp.p[i * 3 + 2] - .5; }
  const r = await runSession(sess, data, [1, 3, NET, NET]);
  if (r.data.length < n) throw new Error('Die KI hat ein unerwartetes Ergebnis geliefert.');
  const out = r.data.slice(0, n); let lo = Infinity, hi = -Infinity; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-6) hi = lo + 1; for (let i = 0; i < n; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}
function bbox(m, th) {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.p[y * m.w + x] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const mx = Math.floor((x1 - x0) * 8 / 100) + 8, my = Math.floor((y1 - y0) * 8 / 100) + 8;
  return [Math.max(0, x0 - mx), Math.max(0, y0 - my), Math.min(m.w, x1 + 1 + mx), Math.min(m.h, y1 + 1 + my)];
}
async function matte(img, prog) {
  const { w, h } = img;
  const m1 = await runNet(img, 0, 0, w, h); prog(.45);
  let m = resize({ w: NET, h: NET, ch: 1, p: m1 }, 0, 0, NET, NET, w, h);
  const b = bbox(m, .15);
  if (b) { const [x0, y0, x1, y1] = b;
    if ((x1 - x0) * (y1 - y0) < w * h * 72 / 100 && x1 - x0 > 24 && y1 - y0 > 24) {
      const m2 = await runNet(img, x0, y0, x1 - x0, y1 - y0);
      const fine = resize({ w: NET, h: NET, ch: 1, p: m2 }, 0, 0, NET, NET, x1 - x0, y1 - y0), o = plane(w, h, 1);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m.p[y * w + x] > .02) o.p[y * w + x] = fine.p[(y - y0) * (x1 - x0) + x - x0];
      for (let i = 0; i < m.p.length; i++) { const v = m.p[i], t = Math.min(Math.max((v - .75) / .2, 0), 1); o.p[i] = Math.max(o.p[i], v * t * t * (3 - 2 * t)); }
      m = o;
    } }
  prog(.85); m = refine(img, m); prog(1); return m;
}
async function region(img, x0, y0, x1, y1) {
  const m2 = await runNet(img, x0, y0, x1 - x0, y1 - y0);
  const full = plane(img.w, img.h, 1), fine = resize({ w: NET, h: NET, ch: 1, p: m2 }, 0, 0, NET, NET, x1 - x0, y1 - y0);
  for (let y = y0; y < y1; y++) full.p.set(fine.p.subarray((y - y0) * (x1 - x0), (y - y0 + 1) * (x1 - x0)), y * img.w + x0);
  const rf = refine(img, full), o = plane(x1 - x0, y1 - y0, 1);
  for (let y = y0; y < y1; y++) o.p.set(rf.p.subarray(y * img.w + x0, y * img.w + x1), (y - y0) * (x1 - x0));
  return o;
}
function refine(I, p) {
  const { w, h } = I, n = w * h, r = Math.max(3, Math.floor(Math.max(w, h) / 300)), eps = 1e-4;
  const mI = box(I, r), mp = box(p, r), Ip = plane(w, h, 3), II = plane(w, h, 6);
  for (let i = 0; i < n; i++) { const rr = I.p[i * 3], g = I.p[i * 3 + 1], bl = I.p[i * 3 + 2], pv = p.p[i];
    Ip.p[i * 3] = rr * pv; Ip.p[i * 3 + 1] = g * pv; Ip.p[i * 3 + 2] = bl * pv;
    II.p[i * 6] = rr * rr; II.p[i * 6 + 1] = rr * g; II.p[i * 6 + 2] = rr * bl; II.p[i * 6 + 3] = g * g; II.p[i * 6 + 4] = g * bl; II.p[i * 6 + 5] = bl * bl; }
  const mIp = box(Ip, r), mII = box(II, r), A = plane(w, h, 3), B = plane(w, h, 1);
  for (let i = 0; i < n; i++) {
    const mr = mI.p[i * 3], mg = mI.p[i * 3 + 1], mb = mI.p[i * 3 + 2], pm = mp.p[i];
    const cr = mIp.p[i * 3] - mr * pm, cg = mIp.p[i * 3 + 1] - mg * pm, cb = mIp.p[i * 3 + 2] - mb * pm;
    const a11 = mII.p[i * 6] - mr * mr + eps, a12 = mII.p[i * 6 + 1] - mr * mg, a13 = mII.p[i * 6 + 2] - mr * mb;
    const a22 = mII.p[i * 6 + 3] - mg * mg + eps, a23 = mII.p[i * 6 + 4] - mg * mb, a33 = mII.p[i * 6 + 5] - mb * mb + eps;
    const i11 = a22 * a33 - a23 * a23, i12 = a13 * a23 - a12 * a33, i13 = a12 * a23 - a13 * a22, i22 = a11 * a33 - a13 * a13, i23 = a12 * a13 - a11 * a23, i33 = a11 * a22 - a12 * a12;
    const det = a11 * i11 + a12 * i12 + a13 * i13;
    if (Math.abs(det) < 1e-18) { B.p[i] = pm; continue; }
    const ar = (i11 * cr + i12 * cg + i13 * cb) / det, ag = (i12 * cr + i22 * cg + i23 * cb) / det, ab = (i13 * cr + i23 * cg + i33 * cb) / det;
    A.p[i * 3] = ar; A.p[i * 3 + 1] = ag; A.p[i * 3 + 2] = ab; B.p[i] = pm - ar * mr - ag * mg - ab * mb;
  }
  const mA = box(A, r), mB = box(B, r);
  let band = plane(w, h, 1); for (let i = 0; i < n; i++) if (p.p[i] > .03 && p.p[i] < .97) band.p[i] = 1;
  band = box(band, r);
  const o = plane(w, h, 1);
  for (let i = 0; i < n; i++) { let v = p.p[i];
    if (band.p[i] > 0) { const q = mA.p[i * 3] * I.p[i * 3] + mA.p[i * 3 + 1] * I.p[i * 3 + 1] + mA.p[i * 3 + 2] * I.p[i * 3 + 2] + mB.p[i]; v = Math.min(Math.max(q, 0), 1); }
    if (v < .02) v = 0; else if (v > .98) v = 1; o.p[i] = v; }
  return o;
}
function foreground(I, a) {
  const { w, h } = I, n = w * h, F = { w, h, ch: 3, p: I.p.slice() }, Bg = { w, h, ch: 3, p: I.p.slice() };
  for (const r of [Math.max(12, Math.floor(Math.max(w, h) / 22)), Math.max(2, Math.floor(Math.max(w, h) / 260))]) {
    const ba = box(a, r), Fa = plane(w, h, 3), Ba = plane(w, h, 3);
    for (let i = 0; i < n; i++) { const al = a.p[i]; for (let c = 0; c < 3; c++) { Fa.p[i * 3 + c] = F.p[i * 3 + c] * al; Ba.p[i * 3 + c] = Bg.p[i * 3 + c] * (1 - al); } }
    const bF = box(Fa, r), bB = box(Ba, r);
    for (let i = 0; i < n; i++) { const al = a.p[i], m = ba.p[i];
      for (let c = 0; c < 3; c++) { const f = bF.p[i * 3 + c] / (m + 1e-5), b = bB.p[i * 3 + c] / (1 - m + 1e-5), v = f + al * (I.p[i * 3 + c] - al * f - (1 - al) * b);
        F.p[i * 3 + c] = Math.min(Math.max(v, 0), 1); Bg.p[i * 3 + c] = b; } }
  }
  for (let i = 0; i < n; i++) if (a.p[i] >= .995) { F.p[i * 3] = I.p[i * 3]; F.p[i * 3 + 1] = I.p[i * 3 + 1]; F.p[i * 3 + 2] = I.p[i * 3 + 2]; }
  return F;
}
const to8 = v => v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + .5) | 0;

// ---------- Bilder ----------
async function grayPNG(m) { const img = new ImageData(m.w, m.h); for (let i = 0; i < m.w * m.h; i++) { const v = to8(m.p[i]); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; } return encode(img); }
async function viewPlane(id, viewBlob) { const c = memo.get(id); if (c && c.I) return c.I; const bmp = await decode(viewBlob); const I = rgbPlane(pixels(bmp)); memo.set(id, { ...(c || {}), I }); return I; }
async function maskFrom(blob, w, h, alpha) { const bmp = await decode(blob); const img = pixels(bmp, w, h); const m = plane(w, h, 1); for (let i = 0; i < w * h; i++) m.p[i] = img.data[i * 4 + (alpha ? 3 : 0)] / 255; return m; }
function thumbOf(img, side) { const [tw, th] = fitSize(img.width, img.height, side); const c = canvas(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); const d = canvas(tw, th), x = d.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, tw, th); return d.convertToBlob({ type: 'image/png' }); }
// writeDerived: Farben ohne Saum (fg) und Vorschaubild
async function derived(I, m) {
  const F = foreground(I, m), { w, h } = I, fg = new ImageData(w, h), cut = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) { const r = to8(F.p[i * 3]), g = to8(F.p[i * 3 + 1]), b = to8(F.p[i * 3 + 2]);
    fg.data[i * 4] = cut.data[i * 4] = r; fg.data[i * 4 + 1] = cut.data[i * 4 + 1] = g; fg.data[i * 4 + 2] = cut.data[i * 4 + 2] = b; fg.data[i * 4 + 3] = 255; cut.data[i * 4 + 3] = to8(m.p[i]); }
  return { fg: await encode(fg), thumb: await thumbOf(cut, 420) };
}
async function ensure(prog) {
  if (sess) return;
  loading = true; error = ''; done = 0;
  try { const buf = await fetchModel(MODEL, p => { done = p * .95; prog && prog(done); }); sess = await makeSession(buf); done = 1; }
  catch (e) { error = e.message; throw e; } finally { loading = false; }
}

serve({
  async status() { return { ready: !!sess || await hasModel(MODEL), loading, done, error, step: '' }; },
  async install(a, prog) { await ensure(prog); return { ready: true }; },
  // Bild öffnen: Arbeitsgröße (max. 2048) ohne Durchsicht + Vorschaubild
  async prepare({ file }) {
    const bmp = await decode(file); const W = bmp.width, H = bmp.height;
    const v = fitBitmap(bmp, WORK); for (let i = 0; i < v.data.length; i += 4) { const a = v.data[i + 3] / 255; for (let c = 0; c < 3; c++) v.data[i + c] = Math.round(v.data[i + c] * a + 255 * (1 - a)); v.data[i + 3] = 255; }
    return { W, H, MW: v.width, MH: v.height, view: await encode(v), thumb: await thumbOf(v, 420) };
  },
  async compute({ id, view }, prog) {
    await ensure(p => prog(p * .05, 'ai'));
    const I = await viewPlane(id, view);
    const m = await matte(I, d => prog(.05 + d * .8));
    memo.set(id, { I, m });
    const mask = await grayPNG(m), d = await derived(I, m);
    return { mask, maskKI: mask, fg: d.fg, thumb: d.thumb };
  },
  // Maske nach Pinsel-Nacharbeit (aus dem Alphakanal des Browsers)
  async mask({ id, view, blob, w, h }) {
    const I = await viewPlane(id, view); const m = await maskFrom(blob, w, h, true);
    memo.set(id, { I, m });
    const d = await derived(I, m); return { mask: await grayPNG(m), fg: d.fg, thumb: d.thumb };
  },
  async region({ id, view, mask, x0, y0, x1, y1, mode }) {
    await ensure();
    const I = await viewPlane(id, view);
    let m = memo.get(id) && memo.get(id).m; if (!m) m = mask ? await maskFrom(mask, I.w, I.h, false) : plane(I.w, I.h, 1);
    const rm = await region(I, x0, y0, x1, y1);
    if (mode !== 'add') m.p.fill(0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { let v = rm.p[(y - y0) * (x1 - x0) + x - x0]; if (mode === 'add') v = Math.max(v, m.p[y * I.w + x]); m.p[y * I.w + x] = v; }
    memo.set(id, { I, m });
    const d = await derived(I, m); return { mask: await grayPNG(m), fg: d.fg, thumb: d.thumb };
  },
  // Ergebnis in voller Größe: Maske und Farbkorrektur weich hochrechnen, Schärfe aus dem Original
  async export({ id, view, mask, file, bg, format }, prog) {
    const I = await viewPlane(id, view);
    let m = memo.get(id) && memo.get(id).m; if (!m) m = await maskFrom(mask, I.w, I.h, false);
    const F = foreground(I, m);
    let full = null; try { full = file ? pixels(await decode(file)) : null; } catch (e) { full = null; }
    const W = full ? full.width : I.w, H = full ? full.height : I.h, out = new ImageData(W, H);
    if (!full) { for (let i = 0; i < W * H; i++) { out.data[i * 4] = to8(F.p[i * 3]); out.data[i * 4 + 1] = to8(F.p[i * 3 + 1]); out.data[i * 4 + 2] = to8(F.p[i * 3 + 2]); out.data[i * 4 + 3] = to8(m.p[i]); } }
    else {
      const D = plane(I.w, I.h, 4);
      for (let i = 0; i < I.w * I.h; i++) { D.p[i * 4] = F.p[i * 3] - I.p[i * 3]; D.p[i * 4 + 1] = F.p[i * 3 + 1] - I.p[i * 3 + 1]; D.p[i * 4 + 2] = F.p[i * 3 + 2] - I.p[i * 3 + 2]; D.p[i * 4 + 3] = m.p[i]; }
      const fx = I.w / W, fy = I.h / H, s = full.data, d = out.data;
      for (let y = 0; y < H; y++) {
        const sy = (y + .5) * fy - .5, iy = sy < 0 ? -1 : Math.floor(sy), ty = sy - iy, ya = Math.min(Math.max(iy, 0), I.h - 1), yb = Math.min(Math.max(iy + 1, 0), I.h - 1);
        for (let x = 0; x < W; x++) {
          const sx = (x + .5) * fx - .5, ix = sx < 0 ? -1 : Math.floor(sx), tx = sx - ix, xa = Math.min(Math.max(ix, 0), I.w - 1), xb = Math.min(Math.max(ix + 1, 0), I.w - 1);
          const p00 = (ya * I.w + xa) * 4, p10 = (ya * I.w + xb) * 4, p01 = (yb * I.w + xa) * 4, p11 = (yb * I.w + xb) * 4, o = (y * W + x) * 4;
          const u = c => (D.p[p00 + c] * (1 - tx) + D.p[p10 + c] * tx) * (1 - ty) + (D.p[p01 + c] * (1 - tx) + D.p[p11 + c] * tx) * ty;
          const al = u(3), sa = s[o + 3] / 255;
          for (let c = 0; c < 3; c++) { let v = s[o + c] / 255; if (al < .995) v += u(c); d[o + c] = to8(v); }
          d[o + 3] = to8(al * sa);
        }
        if (y % 256 === 0) prog(y / H * .9);
      }
    }
    let blob;
    if (/^#[0-9a-f]{6}$/i.test(bg || '')) {
      const c = canvas(W, H), x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, W, H); const t = canvas(W, H); t.getContext('2d').putImageData(out, 0, 0); x.drawImage(t, 0, 0);
      blob = await c.convertToBlob(format === 'jpg' ? { type: 'image/jpeg', quality: .95 } : { type: 'image/png' });
    } else blob = await encode(out);
    return { blob, ext: blob.type === 'image/jpeg' ? 'jpg' : 'png' };
  },
  async forget({ id }) { memo.delete(id); return true; },
});
