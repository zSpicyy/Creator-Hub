// Upscaler im Browser: Real-ESRGAN ×4 in Kacheln mit Überlappung (wie aiengine.go), danach bei Bedarf
// mit Lanczos sauber auf den gewünschten Faktor (wie resample.go). Bei 8-fach rechnet die KI zweimal.
importScripts('../ai.js');
const MODEL = { file: 'realesr-general-x4v3-dn50.onnx', size: 4900000, sha256: '152a44621a7906878d0a580c0347e8bcce78bafeb949af99383fba13e81f253a',
  sources: [new URL('../../models/realesr-general-x4v3-dn50.onnx', self.location.href).href,
    'https://huggingface.co/techycoder/realesrgan-general-x4v3/resolve/main/realesr-general-x4v3-dn50.onnx'] };
const MAXPX = 140e6; // größer schafft ein Browser nicht zuverlässig
let sess = null, loading = false, done = 0, error = '';
const srcs = new Map(); // Projekt -> {w,h,data,opaque}

async function ensure(prog) {
  if (sess) return; loading = true; error = ''; done = 0;
  try { const buf = await fetchModel(MODEL, p => { done = p * .95; prog && prog(done); }); sess = await makeSession(buf); done = 1; }
  catch (e) { error = e.message; throw e; } finally { loading = false; }
}
async function source(id, file) {
  let s = srcs.get(id); if (s) return s;
  const bmp = await decode(file); const img = pixels(bmp); let opaque = true;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) { opaque = false; break; }
  s = { w: img.width, h: img.height, data: img.data, opaque }; srcs.clear(); srcs.set(id, s); return s;
}
const clampi = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const to8 = v => v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + .5) | 0;
// fit wie in der App: Flächenmittel, Farben nach Deckkraft gewichtet
function fit(s, side) {
  const { w, h } = s; if (w <= side && h <= side) return { w, h, data: s.data };
  const k = side / Math.max(w, h), nw = Math.max(1, (w * k) | 0), nh = Math.max(1, (h * k) | 0), d = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) { const y0 = Math.floor(y * h / nh), y1 = Math.max(Math.floor((y + 1) * h / nh), y0 + 1);
    for (let x = 0; x < nw; x++) { const x0 = Math.floor(x * w / nw), x1 = Math.max(Math.floor((x + 1) * w / nw), x0 + 1); let r = 0, g = 0, b = 0, al = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const p = (yy * w + xx) * 4, a = s.data[p + 3]; r += s.data[p] * a; g += s.data[p + 1] * a; b += s.data[p + 2] * a; al += a; c++; }
      const o = (y * nw + x) * 4; if (al > 0) { d[o] = r / al; d[o + 1] = g / al; d[o + 2] = b / al; } d[o + 3] = al / c; } }
  return { w: nw, h: nh, data: d };
}
async function toBlob(img, type, q, flat) {
  const c = canvas(img.w, img.h), x = c.getContext('2d'); const id = new ImageData(img.data, img.w, img.h);
  if (flat) { const t = canvas(img.w, img.h); t.getContext('2d').putImageData(id, 0, 0); x.fillStyle = '#fff'; x.fillRect(0, 0, img.w, img.h); x.drawImage(t, 0, 0); }
  else x.putImageData(id, 0, 0);
  return c.convertToBlob({ type: type || 'image/png', quality: q });
}
// ---------- KI ×4 in Kacheln ----------
async function ai4(s, prog) {
  const F = 224, P = 12, T = F - 2 * P, W = s.w * 4, H = s.h * 4;
  if (W * H > MAXPX) throw new Error('Das Ergebnis wäre zu groß für den Browser. Nimm einen kleineren Faktor oder die App – dort gibt es keine Größengrenze.');
  const out = new Uint8ClampedArray(W * H * 4), inp = new Float32Array(3 * F * F), FF = F * F;
  const tilesY = Math.ceil(s.h / T), tilesX = Math.ceil(s.w / T); let n = 0;
  for (let y0 = 0; y0 < s.h; y0 += T) { const th = Math.min(T, s.h - y0);
    for (let x0 = 0; x0 < s.w; x0 += T) { const tw = Math.min(T, s.w - x0);
      for (let iy = 0; iy < F; iy++) { const sy = clampi(y0 - P + iy, 0, s.h - 1);
        for (let ix = 0; ix < F; ix++) { const sx = clampi(x0 - P + ix, 0, s.w - 1), p = (sy * s.w + sx) * 4, o = iy * F + ix;
          inp[o] = s.data[p] / 255; inp[FF + o] = s.data[p + 1] / 255; inp[2 * FF + o] = s.data[p + 2] / 255; } }
      const r = await runSession(sess, inp, [1, 3, F, F]); const d = r.dims, nhwc = d.length === 4 && d[3] === 3, OF = nhwc ? d[2] : d[3];
      if (OF !== 4 * F) throw new Error('Das KI-Modell vergrößert nicht um ×4.');
      const pl = OF * OF, o8 = r.data;
      for (let oy = 0; oy < th * 4; oy++) { const sy = 4 * P + oy, dr = ((y0 * 4 + oy) * W + x0 * 4) * 4;
        for (let ox = 0; ox < tw * 4; ox++) { const sx = 4 * P + ox, dd = dr + ox * 4;
          if (nhwc) { const o = (sy * OF + sx) * 3; out[dd] = to8(o8[o]); out[dd + 1] = to8(o8[o + 1]); out[dd + 2] = to8(o8[o + 2]); }
          else { const o = sy * OF + sx; out[dd] = to8(o8[o]); out[dd + 1] = to8(o8[pl + o]); out[dd + 2] = to8(o8[2 * pl + o]); }
          out[dd + 3] = 255; } }
      prog && prog(++n / (tilesX * tilesY));
    } }
  if (!s.opaque) { // Transparenz weich mitvergrößern
    for (let oy = 0; oy < H; oy++) { const fy = (oy + .5) / 4 - .5, y1 = Math.floor(fy), wy = fy - y1, ya = clampi(y1, 0, s.h - 1), yb = clampi(y1 + 1, 0, s.h - 1);
      for (let ox = 0; ox < W; ox++) { const fx = (ox + .5) / 4 - .5, x1 = Math.floor(fx), wx = fx - x1, xa = clampi(x1, 0, s.w - 1), xb = clampi(x1 + 1, 0, s.w - 1);
        const al = (x, y) => s.data[(y * s.w + x) * 4 + 3];
        out[(oy * W + ox) * 4 + 3] = (al(xa, ya) * (1 - wx) + al(xb, ya) * wx) * (1 - wy) + (al(xa, yb) * (1 - wx) + al(xb, yb) * wx) * wy + .5; } } }
  return { w: W, h: H, data: out, opaque: s.opaque };
}
// ---------- Lanczos3 (premultipliziert), zeilenweise mit kleinem Zwischenspeicher ----------
function lanczos3(x) { x = Math.abs(x); if (x < 1e-9) return 1; if (x >= 3) return 0; const px = Math.PI * x; return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px); }
function taps(outN, srcN, scale) {
  let support = 3, stretch = 1; if (scale < 1) { stretch = 1 / scale; support *= stretch; }
  const n = Math.ceil(support) * 2 + 1, t = new Array(outN);
  for (let o = 0; o < outN; o++) { const c = (o + .5) / scale - .5, f = Math.floor(c) - (n >> 1) + 1, w = new Float32Array(n); let sum = 0;
    for (let k = 0; k < n; k++) { w[k] = lanczos3((c - (f + k)) / stretch); sum += w[k]; } for (let k = 0; k < n; k++) w[k] /= sum; t[o] = { start: f, w }; }
  return t;
}
function scale(s, factor, prog) {
  const OW = Math.max(1, Math.round(s.w * factor)), OH = Math.max(1, Math.round(s.h * factor));
  if (OW * OH > MAXPX) throw new Error('Das Ergebnis wäre zu groß für den Browser. Nimm einen kleineren Faktor oder die App – dort gibt es keine Größengrenze.');
  const hx = taps(OW, s.w, OW / s.w), vy = taps(OH, s.h, OH / s.h), out = new Uint8ClampedArray(OW * OH * 4), rows = new Map();
  const hrow = y => { y = clampi(y, 0, s.h - 1); let r = rows.get(y); if (r) return r; r = new Float32Array(OW * 4); const b = y * s.w * 4;
    for (let o = 0; o < OW; o++) { const t = hx[o]; let R = 0, G = 0, B = 0, A = 0;
      for (let k = 0; k < t.w.length; k++) { const i = b + clampi(t.start + k, 0, s.w - 1) * 4, a = s.data[i + 3] / 255, wt = t.w[k]; R += s.data[i] * a * wt; G += s.data[i + 1] * a * wt; B += s.data[i + 2] * a * wt; A += s.data[i + 3] * wt; }
      r[o * 4] = R; r[o * 4 + 1] = G; r[o * 4 + 2] = B; r[o * 4 + 3] = A; }
    rows.set(y, r); return r; };
  const acc = new Float32Array(OW * 4);
  for (let y = 0; y < OH; y++) { const t = vy[y]; acc.fill(0);
    for (const k of rows.keys()) if (k < t.start - 1) rows.delete(k);
    for (let k = 0; k < t.w.length; k++) { const r = hrow(t.start + k), wt = t.w[k]; for (let x = 0; x < OW * 4; x++) acc[x] += r[x] * wt; }
    const o = y * OW * 4;
    for (let x = 0; x < OW; x++) { let al = acc[x * 4 + 3]; al = al < 0 ? 0 : al > 255 ? 255 : al; const k = al > .5 ? 255 / al : 1;
      for (let c = 0; c < 3; c++) { let v = acc[x * 4 + c] * k; out[o + x * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v + .5; } out[o + x * 4 + 3] = al + .5; }
    if (prog && y % 64 === 0) prog(y / OH);
  }
  return { w: OW, h: OH, data: out, opaque: s.opaque };
}
// KI-Weg wie aiPipeline: >4,5-fach zweimal KI (erst auf das Doppelte), sonst ×4 und Lanczos auf den Faktor
async function pipeline(s, factor, prog) {
  if (factor > 4.5) { const x4 = await ai4(s, d => prog(d * .15)); const mid = scale(x4, .5, d => prog(.15 + d * .05)); s = mid; factor /= 2; const inner = prog; prog = d => inner(.2 + d * .8); }
  const x4 = await ai4(s, d => prog(Math.abs(factor - 4) < 1e-6 ? d : d * .85));
  if (Math.abs(factor - 4) < 1e-6) return x4;
  return scale(x4, factor / 4, d => prog(.85 + d * .15));
}
serve({
  async status() { return { ready: !!sess || await hasModel(MODEL), loading, done, error, step: '' }; },
  async install(a, prog) { await ensure(prog); return { ready: true }; },
  async prepare({ id, file }) {
    const s = await source(id, file);
    const pv = fit(s, 1800), th = fit(s, 320);
    return { W: s.w, H: s.h, preview: await toBlob(pv), thumb: await toBlob(th, 'image/jpeg', .82, true) };
  },
  // Ausschnitt zum Vergleichen (wie sample in der App)
  async sample({ id, file, x, y, f, bw, bh, raw, ai }) {
    const s = await source(id, file); f = Math.min(64, Math.max(1.1, f || 4));
    bw = Math.min(Math.max(bw || 360, 100), 2000); bh = Math.min(Math.max(bh || 280, 100), 1400);
    let cw = Math.max(8, ((bw / f) | 0) + 1), ch = Math.max(8, ((bh / f) | 0) + 1); cw = Math.min(cw, s.w); ch = Math.min(ch, s.h);
    const x0 = clampi(((x * s.w) | 0) - (cw >> 1), 0, s.w - cw), y0 = clampi(((y * s.h) | 0) - (ch >> 1), 0, s.h - ch);
    const crop = (X0, Y0, W, H) => { const d = new Uint8ClampedArray(W * H * 4); for (let yy = 0; yy < H; yy++) d.set(s.data.subarray(((Y0 + yy) * s.w + X0) * 4, ((Y0 + yy) * s.w + X0 + W) * 4), yy * W * 4); return { w: W, h: H, data: d, opaque: s.opaque }; };
    if (raw) return await toBlob(crop(x0, y0, cw, ch));
    if (!ai) throw new Error('KI fehlt');
    await ensure();
    const pad = 16, px0 = Math.max(0, x0 - pad), py0 = Math.max(0, y0 - pad), px1 = Math.min(s.w, x0 + cw + pad), py1 = Math.min(s.h, y0 + ch + pad);
    const big = await ai4(crop(px0, py0, px1 - px0, py1 - py0));
    const ox = (x0 - px0) * 4, oy = (y0 - py0) * 4, img = { w: cw * 4, h: ch * 4, data: new Uint8ClampedArray(cw * ch * 64), opaque: s.opaque };
    for (let yy = 0; yy < ch * 4; yy++) img.data.set(big.data.subarray(((oy + yy) * big.w + ox) * 4, ((oy + yy) * big.w + ox + cw * 4) * 4), yy * cw * 16);
    if (f > 4.5) { const half = scale(img, .5); const i8 = await ai4(half); return await toBlob(Math.abs(f - 8) < 1e-6 ? i8 : scale(i8, f / 8)); }
    return await toBlob(Math.abs(f - 4) < 1e-6 ? img : scale(img, f / 4));
  },
  async render({ id, file, factor, format, quality }, prog) {
    await ensure(); const s = await source(id, file); const r = await pipeline(s, factor, prog);
    const blob = format === 'jpg' ? await toBlob(r, 'image/jpeg', (quality || 95) / 100, true) : await toBlob(r);
    return { blob, w: r.w, h: r.h };
  },
  async forget({ id }) { srcs.delete(id); return true; },
});
