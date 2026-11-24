// All color math happens in CIE LAB. RGB distance does not match perception.

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const linToSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));

export function rgbToLab([r, g, b]) {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / Xn;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / Yn;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / Zn;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = fInv(fx) * Xn, Y = fInv(fy) * Yn, Z = fInv(fz) * Zn;
  const R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  const G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  const B = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
  return [linToSrgb(R), linToSrgb(G), linToSrgb(B)];
}
export const hexToLab = (hex) => rgbToLab(hexToRgb(hex));
export const labToHex = (lab) => rgbToHex(labToRgb(lab));
export const chroma = ([, a, b]) => Math.hypot(a, b);
export const hueDeg = ([, a, b]) => ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;

// CIEDE2000
export function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}
// fast squared euclidean for k-means inner loop
const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

// Named buckets. neutral = pairs with anything.
export const NAMED_COLORS = [
  ['black', '#111111', true], ['charcoal', '#3a3d42', true], ['grey', '#808285', true], ['light grey', '#c4c6c8', true],
  ['white', '#f7f7f5', true], ['cream', '#efe6d2', true], ['beige', '#d8c3a0', true], ['camel', '#b88a56', true],
  ['khaki', '#a89a6c', true], ['brown', '#6b4a32', true], ['navy', '#1f2a44', true], ['denim', '#4a6585', true],
  ['blue', '#2f62c9', false], ['light blue', '#9cc3e6', false], ['teal', '#1f7a7a', false], ['green', '#3a8a3e', false],
  ['olive', '#6b6b2e', true], ['mint', '#a8dcc0', false], ['yellow', '#f0d23c', false], ['mustard', '#c99a2e', false],
  ['orange', '#e07a2e', false], ['rust', '#a64b26', false], ['red', '#c8302c', false], ['burgundy', '#6e1f2e', false],
  ['pink', '#ee9cb6', false], ['hot pink', '#d93a7e', false], ['purple', '#6a3d9a', false], ['lavender', '#b8a6dc', false],
].map(([name, hex, neutral]) => ({ name, hex, neutral, lab: hexToLab(hex) }));
const NAMED_BY = Object.fromEntries(NAMED_COLORS.map((c) => [c.name, c]));

export function nearestNamed(lab) {
  let best = NAMED_COLORS[0], bd = Infinity;
  for (const c of NAMED_COLORS) { const d = deltaE(lab, c.lab); if (d < bd) { bd = d; best = c; } }
  return best;
}
export const isNeutralName = (name) => !!NAMED_BY[name]?.neutral;
export const namedHex = (name) => NAMED_BY[name]?.hex || '#999999';

export function makeColor(hex, share = 1) {
  const lab = hexToLab(hex);
  const named = nearestNamed(lab);
  return { hex, lab: lab.map((v) => +v.toFixed(2)), share: +share.toFixed(3), name: named.name, neutral: named.neutral };
}

// k-means++ in LAB over sampled pixels
export function kmeansLab(points, k, iters = 12) {
  if (points.length === 0) return [];
  k = Math.min(k, points.length);
  const centers = [points[Math.floor(points.length / 2)].slice()];
  while (centers.length < k) {
    let sum = 0; const dist = points.map((p) => { const d = Math.min(...centers.map((c) => d2(p, c))); sum += d; return d; });
    let r = Math.random() * sum, idx = 0;
    for (; idx < dist.length - 1; idx++) { r -= dist[idx]; if (r <= 0) break; }
    centers.push(points[idx].slice());
  }
  const assign = new Int32Array(points.length);
  for (let it = 0; it < iters; it++) {
    const acc = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < centers.length; j++) { const d = d2(points[i], centers[j]); if (d < bd) { bd = d; bi = j; } }
      assign[i] = bi; const a = acc[bi]; a[0] += points[i][0]; a[1] += points[i][1]; a[2] += points[i][2]; a[3]++;
    }
    for (let j = 0; j < centers.length; j++) if (acc[j][3]) centers[j] = [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]];
  }
  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < points.length; i++) counts[assign[i]]++;
  return centers.map((c, j) => ({ lab: c, share: counts[j] / points.length })).filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}

// Extract up to 2 dominant colors from RGBA pixels, using alpha as the mask.
export function extractColors(imageData, maxSamples = 5000) {
  const { data, width, height } = imageData;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const pts = [];
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if (data[o + 3] < 200) continue;
    pts.push(rgbToLab([data[o], data[o + 1], data[o + 2]]));
  }
  if (pts.length < 10) return [makeColor('#808080', 1)];
  let clusters = kmeansLab(pts, 5);
  // drop highlight/shadow clusters (near-white / near-black, low chroma) when real colors dominate
  const isExtreme = (c) => (c.lab[0] > 93 || c.lab[0] < 9) && chroma(c.lab) < 8;
  const nonExtremeShare = clusters.filter((c) => !isExtreme(c)).reduce((s, c) => s + c.share, 0);
  if (nonExtremeShare > 0.35) clusters = clusters.filter((c) => !isExtreme(c));
  // merge perceptually identical clusters
  const merged = [];
  for (const c of clusters) {
    const m = merged.find((x) => deltaE(x.lab, c.lab) < 10);
    if (m) { const t = m.share + c.share; m.lab = m.lab.map((v, i) => (v * m.share + c.lab[i] * c.share) / t); m.share = t; }
    else merged.push({ lab: c.lab.slice(), share: c.share });
  }
  merged.sort((a, b) => b.share - a.share);
  const tot = merged.reduce((s, c) => s + c.share, 0);
  const out = merged.slice(0, 2).filter((c, i) => i === 0 || c.share / tot > 0.12);
  return out.map((c) => makeColor(labToHex(c.lab), c.share / tot));
}

// Pairwise color harmony 0..1 — explicit styling rules over named buckets + LAB distance.
export function pairHarmony(c1, c2) {
  const n1 = c1.neutral, n2 = c2.neutral;
  const pair = [c1.name, c2.name].sort().join('+');
  if (pair === 'black+navy') return { s: 0.55, cls: 'contentious' };
  if (pair === 'black+brown') return { s: 0.5, cls: 'contentious' };
  const dE = deltaE(c1.lab, c2.lab);
  const dL = Math.abs(c1.lab[0] - c2.lab[0]);
  if (n1 && n2) {
    // neutral on neutral: some lightness contrast reads best
    return { s: dE < 6 ? 0.78 : 0.82 + Math.min(dL, 40) / 400, cls: 'neutral' };
  }
  if (n1 || n2) return { s: 0.9, cls: 'neutral-anchored' };
  const h1 = hueDeg(c1.lab), h2 = hueDeg(c2.lab);
  let dh = Math.abs(h1 - h2); if (dh > 180) dh = 360 - dh;
  const sat = chroma(c1.lab) > 45 && chroma(c2.lab) > 45;
  let s, cls;
  if (dE < 12) { s = 0.72; cls = 'monochrome'; }
  else if (dh < 35) { s = 0.8 - (dL < 8 ? 0.1 : 0); cls = 'analogous'; }
  else if (dh > 150) { s = 0.7; cls = 'complementary'; }
  else if (dh > 100) { s = 0.5; cls = 'triadic'; }
  else { s = 0.32; cls = 'clashing'; }
  if (sat && cls !== 'monochrome' && cls !== 'analogous') s -= 0.15;
  return { s: Math.max(0.05, s), cls };
}

export const primaryColor = (g) => (g.colors && g.colors[0]) || makeColor('#808080');
