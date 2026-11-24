// Vision pipeline, all on-device: quality gate -> segmentation -> trim -> LAB colors.
import { rgbToLab, extractColors } from './color.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c;
}

export async function fileToCanvas(fileOrBlob, maxSide = 1024) {
  let bmp;
  try { bmp = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(fileOrBlob); });
  }
  const w = bmp.width, h = bmp.height, s = Math.min(1, maxSide / Math.max(w, h));
  const c = makeCanvas(w * s, h * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export function scaleCanvas(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  if (s === 1) return src;
  const c = makeCanvas(src.width * s, src.height * s);
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export const canvasToBlob = (c, type = 'image/png', q = 0.9) => new Promise((r) => c.toBlob(r, type, q));

// ---- 1. Pre-flight quality check: Laplacian variance (blur), mean luminance (exposure) ----
export function qualityCheck(src) {
  const c = scaleCanvas(src, 256);
  const { data, width: w, height: h } = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  const g = new Float32Array(w * h);
  let lum = 0;
  for (let i = 0; i < w * h; i++) { const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]; g[i] = v; lum += v; }
  lum /= w * h;
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const L = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
    s += L; s2 += L * L; n++;
  }
  const blur = s2 / n - (s / n) ** 2;
  const issues = [];
  if (blur < 40) issues.push('blurry');
  if (lum < 45) issues.push('too dark');
  if (lum > 235) issues.push('overexposed');
  return { ok: issues.length === 0, blur: Math.round(blur), lum: Math.round(lum), issues };
}

// ---- 2. Segmentation: border-seeded LAB flood fill (works on any reasonably plain background) ----
export function segmentLocal(src) {
  const W = src.width, H = src.height;
  const ms = Math.min(1, 300 / Math.max(W, H));
  const mw = Math.max(8, Math.round(W * ms)), mh = Math.max(8, Math.round(H * ms));
  const small = makeCanvas(mw, mh); const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(src, 0, 0, mw, mh);
  const px = sctx.getImageData(0, 0, mw, mh).data;
  const N = mw * mh; const lab = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const l = rgbToLab([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]); lab[i * 3] = l[0]; lab[i * 3 + 1] = l[1]; lab[i * 3 + 2] = l[2]; }
  const b = Math.max(2, Math.round(Math.min(mw, mh) * 0.03));
  const border = [];
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (x < b || y < b || x >= mw - b || y >= mh - b) border.push(y * mw + x);
  // background model: k-means (k=3) over border pixels
  let centers = [0, 0.5, 0.99].map((f) => { const i = border[Math.floor(f * (border.length - 1))]; return [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]]; });
  for (let it = 0; it < 8; it++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (const i of border) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < centers.length; j++) { const c = centers[j]; const d = (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2; if (d < bd) { bd = d; bi = j; } }
      const a = acc[bi]; a[0] += lab[i * 3]; a[1] += lab[i * 3 + 1]; a[2] += lab[i * 3 + 2]; a[3]++;
    }
    centers = acc.map((a, j) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3], a[3]] : centers[j]));
  }
  centers = centers.filter((c) => (c[3] || 0) > border.length * 0.06);
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let bd = Infinity;
    for (const c of centers) { const d = (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2; if (d < bd) bd = d; }
    dist[i] = Math.sqrt(bd);
  }
  const bd = border.map((i) => dist[i]).sort((a, c) => a - c);
  const p90 = bd[Math.floor(bd.length * 0.9)] || 0;
  const T = Math.max(9, Math.min(30, p90 * 1.5 + 7));
  // light, low-colour backgrounds (typical product photos, white sheets, walls): anything near-white/grey that is
  // connected to the border is background — this removes textured specks and soft shadows that caused halos
  const bg0 = centers[0] || [100, 0, 0];
  const lightBg = bg0[0] > 72 && Math.hypot(bg0[1], bg0[2]) < 14;
  const isLightBgPx = (i) => lab[i * 3] > bg0[0] - 16 && Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]) < 13;
  // flood fill from border
  const bg = new Uint8Array(N); const q = new Int32Array(N); let qh = 0, qt = 0;
  for (const i of border) if (dist[i] < T || (lightBg && isLightBgPx(i))) { bg[i] = 1; q[qt++] = i; }
  while (qh < qt) {
    const i = q[qh++]; const x = i % mw, y = (i / mw) | 0;
    const nb = [x > 0 ? i - 1 : -1, x < mw - 1 ? i + 1 : -1, y > 0 ? i - mw : -1, y < mh - 1 ? i + mw : -1];
    for (const n of nb) {
      if (n < 0 || bg[n]) continue;
      const local = Math.sqrt((lab[i * 3] - lab[n * 3]) ** 2 + (lab[i * 3 + 1] - lab[n * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[n * 3 + 2]) ** 2);
      if (dist[n] < T || (dist[n] < T * 1.6 && local < 3.5) || (lightBg && isLightBgPx(n) && dist[n] < T * 2.4)) { bg[n] = 1; q[qt++] = n; }
    }
  }
  let fg = new Uint8Array(N); for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 1;
  fg = morph(fg, mw, mh, 'erode'); fg = morph(fg, mw, mh, 'dilate');
  fg = keepMainComponents(fg, mw, mh);
  fg = fillHoles(fg, mw, mh);
  let cnt = 0; for (let i = 0; i < N; i++) cnt += fg[i];
  const frac = cnt / N;
  const spread = centers.length > 1 ? Math.max(...centers.slice(1).map((c) => Math.hypot(c[0] - centers[0][0], c[1] - centers[0][1], c[2] - centers[0][2]))) : 0;
  const confidence = frac < 0.04 || frac > 0.97 ? 0 : Math.max(0.2, Math.min(0.95, 1 - spread / 80 - (frac > 0.85 ? 0.3 : 0)));
  if (confidence === 0) return null;
  // full-resolution matte: hard inside/outside from the coarse mask, soft graded edge vs the LOCAL background colour
  const W2 = src.width, H2 = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W2, H2);
  const alpha = new Uint8ClampedArray(W2 * H2);
  const band = new Uint8Array(W2 * H2);
  const kx = mw / W2, ky = mh / H2;
  // low-res edge band (fg pixels next to bg, plus their neighbours)
  const edgeLow = new Uint8Array(N);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = y * mw + x; let mixed = false;
    for (let dy = -2; dy <= 2 && !mixed; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) continue; if (fg[yy * mw + xx] !== fg[i]) { mixed = true; break; } }
    edgeLow[i] = mixed ? 1 : 0;
  }
  for (let y = 0; y < H2; y++) { const ly = Math.min(mh - 1, (y * ky) | 0); for (let x = 0; x < W2; x++) { const li = ly * mw + Math.min(mw - 1, (x * kx) | 0); const i = y * W2 + x; if (edgeLow[li]) band[i] = 1; else alpha[i] = fg[li] ? 255 : 0; } }
  const bgm = bgColorMap(sd.data, W2, H2, (i) => !band[i] && alpha[i] === 0);
  // noise of the background around its local colour sets the soft-edge range
  let s = 0, n = 0; for (let i = 0; i < W2 * H2; i += 37) if (!band[i] && alpha[i] === 0) { const [br, bgg, bb] = bgm.at(i % W2, (i / W2) | 0); s += Math.hypot(sd.data[i * 4] - br, sd.data[i * 4 + 1] - bgg, sd.data[i * 4 + 2] - bb); n++; }
  const d0 = Math.max(10, (n ? s / n : 10) * 2.2), d1 = d0 + 42;
  for (let i = 0; i < W2 * H2; i++) {
    if (!band[i]) continue;
    const [br, bgg, bb] = bgm.at(i % W2, (i / W2) | 0);
    const d = Math.hypot(sd.data[i * 4] - br, sd.data[i * 4 + 1] - bgg, sd.data[i * 4 + 2] - bb);
    alpha[i] = Math.max(0, Math.min(255, ((d - d0) / (d1 - d0)) * 255));
  }
  return finishMatte(src, sd, alpha, band, bgm, confidence, frac);
}

// ---- matting helpers (shared by the built-in cutout and the AI cutout) ----
// Low-res map of the background colour, learned from known-background pixels and grown inwards.
function bgColorMap(data, W, H, isBg, cell = 6) {
  const mw = Math.ceil(W / cell), mh = Math.ceil(H / cell), M = mw * mh;
  let r = new Float32Array(M), g = new Float32Array(M), b = new Float32Array(M); const n = new Float32Array(M);
  let gr = 0, gg = 0, gb = 0, gn = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = y * W + x; if (!isBg(i)) continue; const j = ((y / cell) | 0) * mw + ((x / cell) | 0); r[j] += data[i * 4]; g[j] += data[i * 4 + 1]; b[j] += data[i * 4 + 2]; n[j]++; gr += data[i * 4]; gg += data[i * 4 + 1]; gb += data[i * 4 + 2]; gn++; }
  let known = new Uint8Array(M);
  for (let j = 0; j < M; j++) if (n[j]) { r[j] /= n[j]; g[j] /= n[j]; b[j] /= n[j]; known[j] = 1; }
  for (let pass = 0; pass < 24; pass++) {
    let changed = false; const k2 = known.slice(); const r2 = r.slice(), g2 = g.slice(), b2 = b.slice();
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const j = y * mw + x; if (known[j]) continue;
      let sr = 0, sg = 0, sb = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) continue; const k = yy * mw + xx; if (known[k]) { sr += r[k]; sg += g[k]; sb += b[k]; c++; } }
      if (c) { r2[j] = sr / c; g2[j] = sg / c; b2[j] = sb / c; k2[j] = 1; changed = true; }
    }
    r = r2; g = g2; b = b2; known = k2; if (!changed) break;
  }
  const mr = gn ? gr / gn : 245, mg = gn ? gg / gn : 245, mb = gn ? gb / gn : 245;
  for (let j = 0; j < M; j++) if (!known[j]) { r[j] = mr; g[j] = mg; b[j] = mb; }
  return { at: (x, y) => { const j = Math.min(mh - 1, (y / cell) | 0) * mw + Math.min(mw - 1, (x / cell) | 0); return [r[j], g[j], b[j]]; } };
}

// Clean the alpha (drop specks, tighten edges), remove background colour bleeding into edge pixels, then trim.
function finishMatte(src, sd, alpha, band, bgm, confidence = 0.85, frac = 0) {
  const W = src.width, H = src.height, d = sd.data;
  // tighten: an edge pixel can't be more opaque than its neighbourhood average (kills 1-px fringes)
  const a2 = alpha.slice();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!band[i]) continue;
    const avg = (alpha[i - 1] + alpha[i + 1] + alpha[i - W] + alpha[i + W] + alpha[i]) / 5;
    a2[i] = Math.min(alpha[i], avg) < 40 ? 0 : Math.min(alpha[i], avg + 30);
  }
  removeSpecks(a2, W, H);
  for (let i = 0; i < W * H; i++) {
    const a = a2[i];
    if (a > 0 && a < 250) { // un-premultiply the background out of the edge colour
      const [br, bg, bb] = bgm.at(i % W, (i / W) | 0); const t = a / 255;
      d[i * 4] = Math.max(0, Math.min(255, (d[i * 4] - (1 - t) * br) / t));
      d[i * 4 + 1] = Math.max(0, Math.min(255, (d[i * 4 + 1] - (1 - t) * bg) / t));
      d[i * 4 + 2] = Math.max(0, Math.min(255, (d[i * 4 + 2] - (1 - t) * bb) / t));
    }
    d[i * 4 + 3] = a;
  }
  const out = makeCanvas(W, H); out.getContext('2d').putImageData(sd, 0, 0);
  let fg = 0; for (let i = 0; i < W * H; i += 7) if (a2[i] > 128) fg++;
  return { canvas: trimAlpha(out), confidence, frac: frac || (fg * 7) / (W * H) };
}

// remove small opaque islands (background specks) at reduced resolution
function removeSpecks(alpha, W, H) {
  const s = Math.max(1, Math.round(Math.max(W, H) / 320)); const mw = Math.ceil(W / s), mh = Math.ceil(H / s);
  const m = new Uint8Array(mw * mh);
  for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) if (alpha[y * W + x] > 100) m[((y / s) | 0) * mw + ((x / s) | 0)] = 1;
  const lab = new Int32Array(mw * mh); const sizes = [0]; const q = new Int32Array(mw * mh); let next = 1;
  for (let st = 0; st < m.length; st++) {
    if (!m[st] || lab[st]) continue;
    let qh = 0, qt = 0; q[qt++] = st; lab[st] = next; let size = 0;
    while (qh < qt) { const i = q[qh++]; size++; const x = i % mw; for (const nb of [x > 0 ? i - 1 : -1, x < mw - 1 ? i + 1 : -1, i - mw, i + mw]) if (nb >= 0 && nb < m.length && m[nb] && !lab[nb]) { lab[nb] = next; q[qt++] = nb; } }
    sizes.push(size); next++;
  }
  const max = Math.max(0, ...sizes); const keep = sizes.map((z) => z >= Math.max(6, max * 0.04));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const li = Math.min(mh - 1, (y / s) | 0) * mw + Math.min(mw - 1, (x / s) | 0);
    if (lab[li] && !keep[lab[li]]) alpha[y * W + x] = 0; // pixel belongs to a tiny island
  }
}

// AI cutout: turn the model's alpha into a clean, halo-free matte
export function matteFromAlpha(src, mask) {
  const W = src.width, H = src.height;
  const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
  const alpha = new Uint8ClampedArray(W * H); const band = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const v = mask[i]; alpha[i] = v < 25 ? 0 : v > 230 ? 255 : Math.round(((v - 25) / 205) * 255); }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const v = alpha[i]; if ((v > 0 && v < 255) || alpha[i - 1] !== v || alpha[i + 1] !== v || alpha[i - W] !== v || alpha[i + W] !== v) band[i] = 1; }
  const bgm = bgColorMap(sd.data, W, H, (i) => alpha[i] === 0);
  return finishMatte(src, sd, alpha, band, bgm, 0.9, 0);
}

function morph(m, w, h, op) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = op === 'erode' ? 1 : 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      const p = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : m[yy * w + xx];
      if (op === 'erode' && !p) v = 0; if (op === 'dilate' && p) v = 1;
    }
    out[y * w + x] = v;
  }
  return out;
}
function keepMainComponents(m, w, h) {
  const lab = new Int32Array(m.length); let next = 1; const sizes = [0];
  const q = new Int32Array(m.length);
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s]) continue;
    let qh = 0, qt = 0; q[qt++] = s; lab[s] = next; let size = 0;
    while (qh < qt) {
      const i = q[qh++]; size++; const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (n >= 0 && n < m.length && m[n] && !lab[n]) { lab[n] = next; q[qt++] = n; }
    }
    sizes.push(size); next++;
  }
  const max = Math.max(0, ...sizes);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) if (lab[i] && sizes[lab[i]] >= max * 0.12) out[i] = 1;
  return out;
}
function fillHoles(m, w, h) {
  // background regions not connected to the border are holes inside the garment -> fill
  const reach = new Uint8Array(m.length); const q = new Int32Array(m.length); let qh = 0, qt = 0;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const i = y * w + x; if (!m[i] && !reach[i]) { reach[i] = 1; q[qt++] = i; } }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const i = y * w + x; if (!m[i] && !reach[i]) { reach[i] = 1; q[qt++] = i; } }
  while (qh < qt) { const i = q[qh++]; const x = i % w; for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (n >= 0 && n < m.length && !m[n] && !reach[n]) { reach[n] = 1; q[qt++] = n; } }
  const out = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) out[i] = m[i] || !reach[i] ? 1 : 0;
  // holes larger than 6% of the frame are probably real gaps (e.g. between trouser legs) — keep those open
  return out;
}

// Upsample a binary/float low-res mask to full resolution with feathered edges, then cut and trim.
export function applyMask(src, mask, mw, mh, confidence = 0.8, frac = 0) {
  const W = src.width, H = src.height;
  const mc = makeCanvas(mw, mh); const mctx = mc.getContext('2d');
  const md = mctx.createImageData(mw, mh);
  for (let i = 0; i < mw * mh; i++) { const v = mask[i] > 1 ? mask[i] : mask[i] * 255; md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255; md.data[i * 4 + 3] = v; }
  mctx.putImageData(md, 0, 0);
  const out = makeCanvas(W, H); const octx = out.getContext('2d', { willReadFrequently: true });
  octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  octx.filter = `blur(${Math.max(0.6, W / mw * 0.45)}px)`;
  octx.drawImage(mc, 0, 0, W, H);
  octx.filter = 'none';
  octx.globalCompositeOperation = 'source-in';
  octx.drawImage(src, 0, 0);
  octx.globalCompositeOperation = 'source-over';
  return { canvas: trimAlpha(out), confidence, frac };
}

export function trimAlpha(c, padFrac = 0.04) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * padFrac);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// Manual crop fallback (always available): rectangle in source pixel coords, no bg removal.
export function cropCanvas(src, r) {
  const out = makeCanvas(r.w, r.h);
  out.getContext('2d').drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return out;
}

export function colorsFromCanvas(c) {
  const s = scaleCanvas(c, 220);
  return extractColors(s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height));
}

// Rough pattern guess without AI: lightness spread + edge density inside the mask.
export function patternHeuristic(c) {
  const s = scaleCanvas(c, 160);
  const { data, width: w, height: h } = s.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, s.width, s.height);
  const L = new Float32Array(w * h); const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { m[i] = data[i * 4 + 3] > 200 ? 1 : 0; L[i] = rgbToLab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])[0]; }
  let edges = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!m[i] || !m[i + 1] || !m[i + w]) continue;
    n++; if (Math.abs(L[i] - L[i + 1]) + Math.abs(L[i] - L[i + w]) > 14) edges++;
  }
  const density = n ? edges / n : 0;
  if (density < 0.05) return { pattern: 'solid', conf: 0.6 };
  if (density < 0.12) return { pattern: 'textured', conf: 0.35 };
  return { pattern: 'graphic', conf: 0.25 };
}

// Composite a cutout on a neutral background (what the AI model sees: cutout, not the room).
export function onNeutral(c, size = 336, bg = '#ffffff') {
  const out = makeCanvas(size, size); const ctx = out.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  const s = Math.min(size / c.width, size / c.height) * 0.92;
  ctx.drawImage(c, (size - c.width * s) / 2, (size - c.height * s) / 2, c.width * s, c.height * s);
  return out;
}
