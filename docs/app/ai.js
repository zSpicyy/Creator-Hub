// Gemeinsam für die Rechen-Worker: ONNX Runtime im Browser laden und KI-Modelle einmalig holen.
// Die Modelle sind dieselben wie in der App; jede Datei wird gegen ihre SHA-256-Prüfsumme geprüft
// und danach im Browser gespeichert (Cache), damit sie nur einmal geladen wird.
const ORT_VER = '1.23.2', ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
let ortReady = null;
function loadOrt() {
  if (ortReady) return ortReady;
  ortReady = (async () => {
    importScripts(ORT_BASE + 'ort.webgpu.min.js');
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
    ort.env.logLevel = 'error';
  })();
  return ortReady;
}
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const CACHE = 'creatorhub-models-v1', KEY = 'https://cache.creatorhub.local/models/';
async function cachedModel(m) {
  try { const c = await caches.open(CACHE); const r = await c.match(KEY + m.file); if (r) return await r.arrayBuffer(); } catch (e) {}
  return null;
}
async function hasModel(m) { try { const c = await caches.open(CACHE); return !!(await c.match(KEY + m.file)); } catch (e) { return false; } }
// Lädt ein Modell aus den Quellen der Reihe nach (zuerst neben der Webseite, dann Spiegel), mit Fortschritt 0..1.
async function fetchModel(m, onp) {
  const have = await cachedModel(m); if (have) return have;
  let last = null;
  for (const src of m.sources) {
    try {
      const r = await fetch(src, { mode: 'cors' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const total = +r.headers.get('content-length') || m.size || 0;
      const rd = r.body.getReader(); const parts = []; let got = 0, t = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; const n = Date.now(); if (onp && n - t > 150) { t = n; onp(total ? Math.min(.99, got / total) : 0); } }
      const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
      const sum = hex(await crypto.subtle.digest('SHA-256', buf));
      if (sum !== m.sha256) throw new Error('Prüfsumme stimmt nicht');
      try { const c = await caches.open(CACHE); await c.put(KEY + m.file, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (e) {}
      onp && onp(1);
      return buf.buffer;
    } catch (e) { last = e; }
  }
  throw new Error('Die KI ließ sich nicht laden (' + (last && last.message || 'keine Verbindung') + '). Prüfe deine Internetverbindung.');
}
// Sitzung: mit Grafikkarte (WebGPU), sonst Prozessor (WebAssembly)
async function makeSession(buf) {
  await loadOrt();
  if (self.navigator && navigator.gpu) {
    try { const s = await ort.InferenceSession.create(buf, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' }); s.__ep = 'webgpu'; s.__buf = buf; return s; } catch (e) {}
  }
  const s = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); s.__ep = 'wasm'; return s;
}
// Kann die Grafikkarte etwas nicht, wird die Sitzung einmalig auf dem Prozessor neu angelegt.
async function runSession(s, data, shape) {
  const feeds = {}; feeds[s.inputNames[0]] = new ort.Tensor('float32', data, shape);
  let out;
  try { out = await (s.__real || s).run(feeds); }
  catch (e) { if (s.__ep !== 'webgpu' || s.__real || !s.__buf) throw e; s.__real = await ort.InferenceSession.create(s.__buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); s.__ep = 'wasm'; out = await s.__real.run(feeds); }
  const r = s.__real || s; const t = out[r.outputNames[0]];
  return { data: t.data instanceof Float32Array ? t.data : Float32Array.from(t.data), dims: t.dims };
}
// Nachrichten vom Hauptfenster: {id, op, args} -> {id, ok, result} bzw. {id, progress}
function serve(ops) {
  let chain = Promise.resolve();
  self.onmessage = e => {
    const { id, op, args } = e.data;
    const progress = (p, step) => self.postMessage({ id, progress: p, step });
    const run = async () => {
      try { const fn = ops[op]; if (!fn) throw new Error('Unbekannt: ' + op); const r = await fn(args || {}, progress); self.postMessage({ id, ok: true, result: r }); }
      catch (err) { self.postMessage({ id, ok: false, error: err && err.message || String(err) }); }
    };
    // Abfragen sofort, Rechenarbeit nacheinander (eine KI-Rechnung gleichzeitig, wie in der App)
    if (op === 'status') run(); else chain = chain.then(run);
  };
}
// Bilder lesen und schreiben (OffscreenCanvas)
async function decode(blob) { return await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
function canvas(w, h) { return new OffscreenCanvas(w, h); }
function pixels(bmp, w, h) { const c = canvas(w || bmp.width, h || bmp.height), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height); return x.getImageData(0, 0, c.width, c.height); }
async function encode(img, type, q) { const c = canvas(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); return await c.convertToBlob({ type: type || 'image/png', quality: q }); }
// Fit: auf höchstens side Pixel Kantenlänge (wie upscale.Fit in der App), schrittweise halbiert für saubere Verkleinerung
function fitSize(w, h, side) { if (w <= side && h <= side) return [w, h]; const k = side / Math.max(w, h); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; }
function fitBitmap(bmp, side) {
  const [tw, th] = fitSize(bmp.width, bmp.height, side);
  let src = bmp, w = bmp.width, h = bmp.height;
  while (w / 2 >= tw && h / 2 >= th) { const c = canvas(Math.round(w / 2), Math.round(h / 2)), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; }
  const c = canvas(tw, th), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, tw, th);
  return x.getImageData(0, 0, tw, th);
}
