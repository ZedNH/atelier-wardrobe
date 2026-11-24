// Deterministic constraint-and-score engine: filter -> generate -> score -> diversify -> explain.
// Hard constraints are absolute. The engine can never suggest an item the user does not own.
import { SUBTYPES, OCCASIONS, BOLD_PATTERNS } from './enums.js';
import { pairHarmony, primaryColor, chroma } from './color.js';
import { state, activeGarments } from './db.js';
import { prefScore } from './learning.js';
import { flatterScore, isModest, wearsHijab } from './profile.js';
import { deltaE, hexToLab } from './color.js';
import { clamp, mean, variance, garmentName, cap, DAY } from './util.js';
import { fmtTemp, todayStr } from './weather.js';

export const DEFAULT_WEIGHTS = { harmony: 0.23, formality: 0.18, weather: 0.14, pattern: 0.09, silhouette: 0.08, novelty: 0.09, preference: 0.09, flattering: 0.13 };
export const WEIGHT_LABEL = { harmony: 'Color harmony', formality: 'Formality coherence', weather: 'Weather fit', pattern: 'Pattern balance', silhouette: 'Silhouette balance', novelty: 'Novelty', preference: 'Personal preference', flattering: 'Flatters you (color + body)' };

export function weights() {
  const w = { ...DEFAULT_WEIGHTS, ...(state.settings.weights || {}) };
  const s = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  for (const k in w) w[k] /= s;
  return w;
}

const SLOT_WARMTH = { top: 1, bottom: 0.7, dress: 1.5, outerwear: 1.0, footwear: 0.3, headwear: 0.5, accessory: 0.6 };
export const warmthTarget = (feels) => clamp(3 + (26 - feels) * 0.3, 2.2, 12.5);
export const outfitWarmth = (items) => items.reduce((s, g) => s + (g.warmth || 0) * (SLOT_WARMTH[g.category] || 0), 0);

export function needsLayer(wx) {
  if (!wx) return { required: false, recommended: false };
  const spread = Math.abs((wx.morning ?? wx.tMin) - (wx.evening ?? wx.tMin));
  return {
    required: wx.feels < 12,
    recommended: wx.feels < 17 || (spread >= 7 && wx.feels < 26) || (wx.evening ?? 99) < 15 || (wx.rainProb >= 55 && wx.feels < 24),
    spread,
  };
}

// ---------- Stage 1: hard filter ----------
export function weatherOk(g, wx) {
  if (!wx) return true;
  const t = wx.feels, meta = SUBTYPES[g.subtype] || {};
  const w = g.warmth || 0;
  if (w >= 4 && t > 18) return false;                                   // no wool coat at 32°C
  if (g.category === 'outerwear' && w >= 3 && t > 22) return false;
  if (g.category === 'outerwear' && t > 27 && !(meta.rain && wx.rainProb >= 50)) return false;
  if (g.category === 'top' && w >= 3 && t > 25) return false;
  if (g.category === 'outerwear' && t < 6 && w < 3) return false;              // denim jacket alone near freezing
  if (g.category === 'outerwear' && t < -2 && w < 4) return false;
  if ((g.category === 'bottom' || g.category === 'dress') && w <= 1 && t < 10 && g.subtype !== 'skirt') return false;
  if (g.subtype === 'shorts' && t < 14) return false;
  if (g.subtype === 'sandals' && t < 15) return false;
  if (g.subtype === 'tank top' && t < 16) return false;
  if (meta.cold && t > 13) return false;
  if (wx.rainProb >= 60 && (meta.noRain || g.fabric === 'suede')) return false;
  // sticky heat (e.g. Dhaka summer): no heavy, non-breathable fabrics
  if (humidHot(wx) && ['wool', 'knit', 'leather', 'suede'].includes(g.fabric) && ['top', 'bottom', 'dress', 'outerwear'].includes(g.category)) return false;
  return true;
}
export const humidHot = (wx) => !!wx && (wx.humidity ?? 0) >= 70 && wx.feels >= 26;
const BREATH = { linen: 1, cotton: 0.95, silk: 0.6, canvas: 0.6, denim: 0.5, synthetic: 0.45, knit: 0.3, wool: 0.2, leather: 0.1, suede: 0.15 };
export function breathability(items) {
  const core = items.filter((g) => ['top', 'bottom', 'dress', 'outerwear'].includes(g.category));
  return core.length ? mean(core.map((g) => BREATH[g.fabric] ?? 0.6)) : 0.7;
}

function availabilityOk(g, ctx) {
  if (g.status !== 'active' || g.needsReview) return false;
  if (g.neverSuggest) return false;
  if (ctx.exclude?.includes(g.id)) return false;
  if (ctx.available && !ctx.available.has(g.id)) return false;
  const ls = ctx.laundry ? ctx.laundry(g) : g.laundry?.state;
  if (ls === 'washing') return false;
  if (ls === 'dirty') {
    // stale-state guard: an item dirty for over a week is demoted, not blocked
    const since = g.laundry?.dirtySince || 0;
    if (ctx.laundry || Date.now() - since < 7 * DAY) return false;
  }
  return true;
}

function formalityOk(g, occ) {
  if (g.subtype === 'hijab') return true; // worn for every occasion by those who wear it
  if (g.category === 'accessory' || g.category === 'headwear') {
    if (occ.f >= 4 && g.category === 'headwear' && !['hat', 'tupi'].includes(g.subtype)) return false;
    if (g.subtype === 'tie' && occ.f < 4) return false;
    if (g.subtype === 'tupi' && !occ.trad) return false;
    return Math.abs((g.formality || 3) - occ.f) <= 2;
  }
  const f = g.formality || 3;
  const trad = SUBTYPES[g.subtype]?.trad;
  // traditional pieces carry their own formality at festivals (a cotton panjabi is right for Eid)
  if (f < (occ.trad && trad ? occ.min - 1 : occ.min) || f > occ.max) return false;
  if (g.subtype === 'lungi' && occ.f > 1) return false;
  if ((occ.modest || isModest()) && ['shorts', 'tank top'].includes(g.subtype)) return false;
  if (occ.active) {
    const m = SUBTYPES[g.subtype] || {};
    if (g.category === 'footwear' && !(m.active || g.subtype === 'sneakers')) return false;
    if (g.category === 'outerwear' && !['fleece', 'raincoat', 'puffer', 'hoodie'].includes(g.subtype)) return false;
    if (g.category === 'dress') return false;
  }
  return true;
}

export function eligible(ctx) {
  const occ = OCCASIONS[ctx.occasion] || OCCASIONS.casual;
  const wx = ctx.ignoreWeather ? null : ctx.weather;
  const pool = ctx.pool || activeGarments();
  const must = new Set(ctx.mustInclude || []);
  const out = { top: [], bottom: [], dress: [], footwear: [], outerwear: [], accessory: [], headwear: [] };
  const rejected = [];
  for (const g of pool) {
    if (!availabilityOk(g, ctx)) { rejected.push([g, 'unavailable']); continue; }
    const mustHave = must.has(g.id);
    if (!mustHave && !weatherOk(g, wx)) { rejected.push([g, 'weather']); continue; }
    if (!mustHave && !formalityOk(g, occ)) { rejected.push([g, 'formality']); continue; }
    (out[g.category] || (out[g.category] = [])).push(g);
  }
  return { slots: out, rejected, occ, wx };
}

// ---------- Scoring components ----------
function colorsOf(items) { return items.filter((g) => g.category !== 'accessory').map(primaryColor); }

export function harmonyScore(items) {
  const cols = colorsOf(items);
  if (cols.length < 2) return { s: 0.85, cls: 'single' };
  const scores = []; const classes = {};
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    const h = pairHarmony(cols[i], cols[j]);
    // footwear matters a little less than top/bottom
    const wgt = items[i]?.category === 'footwear' || items[j]?.category === 'footwear' ? 0.6 : 1;
    scores.push([h.s, wgt]); classes[h.cls] = (classes[h.cls] || 0) + wgt;
  }
  let s = scores.reduce((a, [v, w]) => a + v * w, 0) / scores.reduce((a, [, w]) => a + w, 0);
  const top = items.find((g) => g.category === 'top' || g.category === 'dress');
  const bot = items.find((g) => g.category === 'bottom');
  if (top && bot) {
    const dL = Math.abs(primaryColor(top).lab[0] - primaryColor(bot).lab[0]);
    if (dL > 15 && dL < 65) s += 0.05;
  }
  const cls = Object.entries(classes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
  return { s: clamp(s, 0, 1), cls };
}

export function formalityScore(items, occ) {
  const fs = items.filter((g) => g.category !== 'accessory' && g.category !== 'headwear').map((g) => g.formality || 3);
  const coh = clamp(1 - variance(fs) / 1.6, 0, 1);
  const close = clamp(1 - Math.abs(mean(fs) - occ.f) / 2.5, 0, 1);
  return 0.6 * coh + 0.4 * close;
}

export function patternScore(items) {
  const pats = items.filter((g) => g.category !== 'accessory').map((g) => g.pattern).filter((p) => BOLD_PATTERNS.has(p));
  if (pats.length === 0) return 0.85;
  if (pats.length === 1) return 1;
  if (pats.length === 2) return pats[0] !== pats[1] ? 0.4 : 0.25;
  return 0.05;
}

const SIL = {
  'oversized|slim': 1, 'oversized|regular': 0.8, 'oversized|relaxed': 0.45, 'oversized|oversized': 0.3,
  'relaxed|slim': 0.95, 'relaxed|regular': 0.85, 'relaxed|relaxed': 0.55, 'relaxed|oversized': 0.4,
  'regular|slim': 0.9, 'regular|regular': 0.85, 'regular|relaxed': 0.8, 'regular|oversized': 0.6,
  'slim|slim': 0.8, 'slim|regular': 0.9, 'slim|relaxed': 0.85, 'slim|oversized': 0.7,
};
export function silhouetteScore(items) {
  const top = items.find((g) => g.category === 'top');
  const bot = items.find((g) => g.category === 'bottom');
  const outer = items.find((g) => g.category === 'outerwear');
  if (!top || !bot) return 0.85;
  let s = SIL[`${top.fit || 'regular'}|${bot.fit || 'regular'}`] ?? 0.8;
  if (outer && ['blazer', 'suit jacket'].includes(outer.subtype) && top.fit === 'oversized') s -= 0.25;
  if (outer && outer.fit === 'oversized' && bot.fit === 'oversized') s -= 0.2;
  return clamp(s, 0, 1);
}

export function lastWornMap(wear = state.wear) {
  const m = new Map();
  for (const w of wear) { const prev = m.get(w.garmentId); if (!prev || w.wornOn > prev) m.set(w.garmentId, w.wornOn); }
  return m;
}
const daysSince = (dateStr, ref) => (dateStr ? Math.max(0, Math.round((new Date(ref + 'T12:00:00') - new Date(dateStr + 'T12:00:00')) / DAY)) : null);

function comboKey(items) { return items.filter((g) => ['top', 'bottom', 'dress'].includes(g.category)).map((g) => g.id).sort().join('|'); }
export function recentCombos(ref, days = 14, wear = state.wear) {
  const byOutfit = new Map();
  for (const w of wear) {
    if (daysSince(w.wornOn, ref) > days) continue;
    if (!byOutfit.has(w.outfitId)) byOutfit.set(w.outfitId, []);
    byOutfit.get(w.outfitId).push(w.garmentId);
  }
  const keys = new Set();
  for (const ids of byOutfit.values()) {
    const gs = ids.map((id) => state.garments.find((g) => g.id === id)).filter(Boolean);
    keys.add(comboKey(gs));
  }
  return keys;
}

export function noveltyScore(items, ctx) {
  const ref = ctx.date || todayStr();
  const lw = ctx._lastWorn || lastWornMap(ctx.wear);
  const core = items.filter((g) => g.category !== 'accessory');
  const per = core.map((g) => { const d = daysSince(lw.get(g.id), ref); return d == null ? 1 : 1 - Math.exp(-d / 9); });
  let s = mean(per);
  const combos = ctx._combos || recentCombos(ref, 14, ctx.wear);
  if (combos.has(comboKey(items))) s *= 0.4;
  if (items.some((g) => g.laundry?.state === 'worn')) s -= 0.05;
  return clamp(s, 0, 1);
}

export function featuresOf(items, ctx, occ) {
  const top = items.find((g) => g.category === 'top' || g.category === 'dress');
  const bot = items.find((g) => g.category === 'bottom');
  const cols = colorsOf(items);
  const core = items.filter((g) => g.category !== 'accessory');
  const wx = ctx.ignoreWeather ? null : ctx.weather;
  const h = harmonyScore(items);
  return {
    contrast: top && bot ? Math.abs(primaryColor(top).lab[0] - primaryColor(bot).lab[0]) / 100 : 0,
    chroma: mean(cols.map((c) => chroma(c.lab))) / 60,
    neutralShare: mean(cols.map((c) => (c.neutral ? 1 : 0))),
    patterns: core.filter((g) => BOLD_PATTERNS.has(g.pattern)).length / 2,
    formalityDelta: (mean(core.map((g) => g.formality || 3)) - occ.f) / 2,
    warmthOver: wx ? (outfitWarmth(items) - warmthTarget(wx.feels)) / 4 : 0,
    layered: items.some((g) => g.category === 'outerwear') ? 1 : 0,
    relaxed: mean(core.filter((g) => ['top', 'bottom', 'outerwear', 'dress'].includes(g.category)).map((g) => (g.fit === 'relaxed' || g.fit === 'oversized' ? 1 : 0))),
    tonal: h.cls === 'monochrome' || h.cls === 'analogous' || h.cls === 'neutral' ? 1 : 0,
  };
}

export function scoreOutfit(items, ctx) {
  const occ = OCCASIONS[ctx.occasion] || OCCASIONS.casual;
  const wx = ctx.ignoreWeather ? null : ctx.weather;
  const W = ctx._weights || weights();
  const h = harmonyScore(items);
  let weather = 0.75, warmth = outfitWarmth(items), target = null;
  if (wx) {
    target = warmthTarget(wx.feels);
    weather = Math.exp(-(((warmth - target) / 2.8) ** 2));
    const layer = needsLayer(wx);
    const hasOuter = items.some((g) => g.category === 'outerwear');
    if (layer.recommended && !hasOuter) weather *= 0.75;
    if (wx.rainProb >= 50 && items.some((g) => SUBTYPES[g.subtype]?.rain)) weather = Math.min(1, weather + 0.1);
    if (humidHot(wx)) weather *= 0.7 + 0.3 * breathability(items);
    if (wx.rainProb >= 60 && wx.feels >= 22) { const shoe = items.find((g) => g.category === 'footwear'); if (shoe && ['sandals', 'kolhapuri'].includes(shoe.subtype)) weather = Math.min(1, weather + 0.05); }
  }
  const features = featuresOf(items, ctx, occ);
  const fl = flatterScore(items);
  const parts = {
    flattering: fl.s,
    harmony: h.s,
    formality: formalityScore(items, occ),
    weather,
    pattern: patternScore(items),
    silhouette: silhouetteScore(items),
    novelty: noveltyScore(items, ctx),
    preference: prefScore(features, items),
  };
  let total = 0; for (const k in W) total += W[k] * (parts[k] ?? 0);
  // demote stale-dirty items rather than blocking them
  if (items.some((g) => g.laundry?.state === 'dirty')) total -= 0.08;
  let cl = 0; for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) cl += clash(items[i], items[j]);
  total -= 0.5 * cl;
  // festivals: traditional pieces and the occasion's color palette
  let occNote = null;
  if (occ.trad) {
    const core = items.filter((g) => ['top', 'bottom', 'dress', 'outerwear'].includes(g.category));
    const share = core.length ? core.filter((g) => SUBTYPES[g.subtype]?.trad).length / core.length : 0;
    total += 0.12 * share - (share === 0 ? 0.06 : 0);
    if (occ.colors) {
      const main = items.find((g) => g.category === 'dress') || items.find((g) => g.category === 'top');
      if (main) { const d = Math.min(...occ.colors.map((hx) => deltaE(primaryColor(main).lab, labOf(hx)))); total += 0.07 * clamp(1 - d / 30, 0, 1); if (d < 14 && share > 0) occNote = occ.note; }
    }
    if (!occNote && share >= 0.5) occNote = `traditional look for ${occ.label}`;
  }
  const humidNote = wx && humidHot(wx) && breathability(items) >= 0.85 ? `breathable fabrics for ${Math.round(wx.humidity)}% humidity` : null;
  return { total, parts, features, harmonyClass: h.cls, warmth, target, flatterNote: fl.note, flatterNotes: fl.notes, occNote, humidNote };
}

const LABS = new Map();
const labOf = (hx) => { let v = LABS.get(hx); if (!v) { v = hexToLab(hx); LABS.set(hx, v); } return v; };

// ---------- Stage 2: candidate generation ----------
// Pairwise compatibility is cached (context-independent colour harmony is the expensive part).
const harmCache = new Map();
export function clearPairCache() { harmCache.clear(); }
function cachedHarmony(a, b) {
  const k = a.id < b.id ? `${a.id}|${b.id}|${a.updatedAt || 0}|${b.updatedAt || 0}` : `${b.id}|${a.id}|${b.updatedAt || 0}|${a.updatedAt || 0}`;
  let v = harmCache.get(k);
  if (v === undefined) { v = pairHarmony(primaryColor(a), primaryColor(b)).s; if (harmCache.size > 200000) harmCache.clear(); harmCache.set(k, v); }
  return v;
}
export function quickPair(a, b, occ) {
  const h = cachedHarmony(a, b);
  const fd = Math.abs((a.formality || 3) - (b.formality || 3));
  const fs = clamp(1 - fd / 2.5, 0, 1);
  const close = clamp(1 - Math.abs(((a.formality || 3) + (b.formality || 3)) / 2 - occ.f) / 2.5, 0, 1);
  const pat = BOLD_PATTERNS.has(a.pattern) && BOLD_PATTERNS.has(b.pattern) ? 0.3 : 1;
  const sil = a.category === 'top' && b.category === 'bottom' ? SIL[`${a.fit || 'regular'}|${b.fit || 'regular'}`] ?? 0.8 : 0.85;
  const trad = SUBTYPES[a.subtype]?.trad && SUBTYPES[b.subtype]?.trad ? 0.05 : 0; // panjabi + pajama, kurti + churidar…
  return 0.4 * h + 0.2 * fs + 0.15 * close + 0.15 * pat + 0.1 * sil + trad - clash(a, b);
}
// Pairings a South Asian stylist would never make: saree with loafers or a belt, panjabi with a tie…
const DRAPED = new Set(['saree', 'lehenga', 'salwar kameez', 'anarkali', 'kurti', 'panjabi', 'kurta', 'sherwani', 'pajama', 'churidar', 'salwar', 'dhoti']);
const WESTERN_SHOES = new Set(['loafers', 'oxford shoes', 'derby shoes', 'sneakers', 'running shoes', 'canvas shoes', 'boots', 'chelsea boots', 'suede shoes']);
export function clash(a, b) {
  const pair = (x, y) => DRAPED.has(x.subtype) && (
    (y.category === 'footwear' && WESTERN_SHOES.has(y.subtype) && ['saree', 'lehenga', 'salwar kameez', 'anarkali', 'sherwani', 'dhoti'].includes(x.subtype) ? 0.25 : 0)
    + (['belt', 'tie'].includes(y.subtype) ? 0.4 : 0)
    + (y.category === 'outerwear' && !SUBTYPES[y.subtype]?.trad && ['saree', 'lehenga', 'sherwani'].includes(x.subtype) ? 0.2 : 0));
  return pair(a, b) + pair(b, a);
}

function bestCompanions(base, list, occ, n) {
  return list.map((x) => ({ x, q: mean(base.map((b) => quickPair(b, x, occ))) })).sort((a, b) => b.q - a.q).slice(0, n).map((e) => e.x);
}

export function generate(ctx, { maxBases = 160 } = {}) {
  const el = eligible(ctx);
  const { slots: S, occ, wx } = el;
  const must = (ctx.mustInclude || []).map((id) => state.garments.find((g) => g.id === id) || ctx.pool?.find((g) => g.id === id)).filter(Boolean);
  const mustOf = (cat) => must.filter((g) => g.category === cat);
  const ref = ctx.date || todayStr();
  const lw = lastWornMap(ctx.wear);
  const cctx = { ...ctx, _lastWorn: lw, _combos: recentCombos(ref, 14, ctx.wear), _weights: weights() };

  // base combinations: top x bottom, or dress
  let bases = [];
  const tops = mustOf('top').length ? mustOf('top') : S.top;
  const bots = mustOf('bottom').length ? mustOf('bottom') : S.bottom;
  const dresses = mustOf('dress').length ? mustOf('dress') : S.dress;
  const baseOnlyDress = mustOf('dress').length > 0;
  const baseOnlyTB = mustOf('top').length > 0 || mustOf('bottom').length > 0;
  if (!baseOnlyDress) for (const t of tops) for (const b of bots) bases.push({ items: [t, b], q: quickPair(t, b, occ) });
  if (!baseOnlyTB) for (const d of dresses) bases.push({ items: [d], q: 0.8 + 0.1 * clamp(1 - Math.abs((d.formality || 3) - occ.f) / 2, 0, 1) });

  // anchor-first: when the space is big, build only around priority anchors
  if (bases.length > maxBases) {
    const prio = (g) => { const d = daysSince(lw.get(g.id), ref); return (d == null ? 60 : Math.min(d, 60)) + (g.favorite ? 25 : 0) + Math.random() * 10; };
    const anchors = new Set([...tops, ...bots, ...dresses].sort((a, b) => prio(b) - prio(a)).slice(0, 20).map((g) => g.id));
    const anchored = bases.filter((b) => b.items.some((g) => anchors.has(g.id)));
    const rest = bases.filter((b) => !b.items.some((g) => anchors.has(g.id))).sort((a, b) => b.q - a.q).slice(0, Math.floor(maxBases / 3));
    bases = anchored.sort((a, b) => b.q - a.q).slice(0, maxBases - rest.length).concat(rest);
  }
  bases.sort((a, b) => b.q - a.q); bases = bases.slice(0, maxBases);

  const shoesAll = mustOf('footwear').length ? mustOf('footwear') : S.footwear;
  const outerAll = mustOf('outerwear').length ? mustOf('outerwear') : S.outerwear;
  const layer = needsLayer(ctx.ignoreWeather ? null : wx);
  const outerRequired = mustOf('outerwear').length > 0 || (layer.required && outerAll.length > 0);
  const accAll = mustOf('accessory').length ? mustOf('accessory') : S.accessory;
  const hijabs = S.headwear.filter((h) => h.subtype === 'hijab');
  const headAll = mustOf('headwear').length ? mustOf('headwear')
    : wearsHijab() && hijabs.length ? hijabs
    : S.headwear.filter((h) => h.subtype !== 'hijab' && ((occ.trad && h.subtype === 'tupi' && occ.modest) || (wx && ((SUBTYPES[h.subtype]?.cold && wx.feels < 10) || (SUBTYPES[h.subtype]?.sun && wx.uv >= 6)))));
  const dupattas = accAll.filter((a) => a.subtype === 'dupatta');
  const wantsDupatta = (base) => base.some((g) => ['salwar kameez', 'anarkali', 'lehenga', 'kurti'].includes(g.subtype));

  const cands = [];
  for (const base of bases) {
    const shoes = shoesAll.length ? bestCompanions(base.items, shoesAll, occ, 3) : [null];
    const outers = outerAll.length ? bestCompanions(base.items, outerAll, occ, 3) : [];
    const outerOpts = outerRequired ? outers : [null, ...outers];
    if (!outerOpts.length) outerOpts.push(null);
    const dup = dupattas.length && wantsDupatta(base.items);
    const acc = dup ? bestCompanions(base.items, dupattas, occ, 1)[0] : accAll.length ? bestCompanions(base.items, accAll.filter((a) => a.subtype !== 'dupatta'), occ, 1)[0] : null;
    const head = headAll.length ? bestCompanions(base.items, headAll, occ, 1)[0] : null;
    for (const s of shoes) for (const o of outerOpts) {
      if (!s && shoesAll.length === 0 && !ctx.allowNoShoes) continue;
      const items = [o, ...base.items, s, head].filter(Boolean);
      if (acc && (dup || mustOf('accessory').length || Math.random() < 0.6)) items.push(acc);
      const sc = scoreOutfit(items, cctx);
      cands.push({ items, ...sc });
    }
  }
  cands.sort((a, b) => b.total - a.total);
  return { cands, eligible: el, layer };
}

// ---------- Stage 4: diversify + explain ----------
function sim(a, b) {
  const A = new Set(a.items.map((g) => g.id)), B = new Set(b.items.map((g) => g.id));
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const jac = inter / (A.size + B.size - inter);
  const ta = a.items.find((g) => g.category === 'top' || g.category === 'dress'), tb = b.items.find((g) => g.category === 'top' || g.category === 'dress');
  const sameColor = ta && tb && primaryColor(ta).name === primaryColor(tb).name ? 0.2 : 0;
  return jac + sameColor;
}

export function recommend(ctx) {
  const count = ctx.count || 3;
  const gen = generate(ctx);
  const { eligible: el, layer } = gen;
  const cands = ctx.excludeCombos ? gen.cands.filter((c) => !ctx.excludeCombos.has(outfitKey(c.items))) : gen.cands;
  if (!cands.length) return { outfits: [], eligible: el, reason: gen.cands.length ? 'You have seen every good combination for this context — try another occasion.' : whyEmpty(el) };
  const chosen = [cands[0]];
  const stretchSlot = ctx.explore !== false && count >= 3 ? count - 1 : -1; // ~1 in 4 suggestions is a stretch
  while (chosen.length < count) {
    const isStretch = chosen.length === stretchSlot;
    let best = null, bv = -Infinity;
    for (const c of cands.slice(0, 600)) {
      if (chosen.includes(c)) continue;
      const ms = Math.max(...chosen.map((x) => sim(c, x)));
      if (ms >= 0.99) continue;
      const v = isStretch ? (c.total >= cands[0].total * 0.82 ? c.parts.novelty * 0.6 + c.total * 0.4 - 0.5 * ms : -Infinity) : 0.7 * c.total - 0.3 * ms;
      if (v > bv) { bv = v; best = c; }
    }
    if (!best) break;
    if (isStretch) best = { ...best, stretch: true };
    chosen.push(best);
  }
  return { outfits: chosen.map((c) => ({ ...c, rationale: rationale(c, ctx, layer) })), eligible: el, total: cands.length };
}

export const outfitKey = (items) => items.filter((g) => ['top', 'bottom', 'dress', 'outerwear', 'footwear'].includes(g.category)).map((g) => g.id).sort().join('|');

function whyEmpty(el) {
  const S = el.slots;
  if (!S.footwear.length) return 'No clean footwear fits this occasion and weather.';
  if (!S.dress.length && (!S.top.length || !S.bottom.length)) {
    if (!S.top.length) return 'No clean top fits this occasion and weather.';
    return 'No clean bottom fits this occasion and weather.';
  }
  return 'Nothing combines well under these constraints.';
}

const PHRASE = {
  harmony: (o) => ({ 'neutral-anchored': 'neutral-anchored palette', neutral: 'easy neutral palette', monochrome: 'tonal, monochrome look', analogous: 'analogous colors that sit together', complementary: 'complementary colors', triadic: 'bold color mix', contentious: 'a daring color pairing', single: 'one-piece look' }[o.harmonyClass] || 'colors that work'),
  formality: () => 'formality matches the occasion',
  weather: (o, ctx) => (ctx.weather ? 'warmth matches the forecast' : 'balanced layers'),
  pattern: (o) => (o.parts.pattern === 1 ? 'one statement pattern' : 'clean solids'),
  silhouette: () => 'balanced silhouette',
  preference: () => 'matches your style profile',
  flattering: (o) => o.flatterNote,
};

export function rationale(o, ctx, layer) {
  const items = o.items;
  const by = (c) => items.find((g) => g.category === c);
  const top = by('top'), bot = by('bottom'), dress = by('dress'), outer = by('outerwear');
  let lead = dress ? `The ${garmentName(dress)}` : `${cap(garmentName(bot))} with the ${garmentName(top)}`;
  if (outer) lead += ` under the ${garmentName(outer)}`;
  const bits = [];
  const wx = ctx.ignoreWeather ? null : ctx.weather;
  if (wx) {
    let t = fmtTemp(wx.feels);
    if (layer?.spread >= 7 && outer) t += `, layer for the ${fmtTemp(Math.min(wx.morning, wx.evening))} ${wx.evening < wx.morning ? 'evening' : 'morning'}`;
    if (wx.rainProb >= 50) t += `, ${Math.round(wx.rainProb)}% rain`;
    bits.push(t);
  }
  bits.push((OCCASIONS[ctx.occasion] || OCCASIONS.casual).label.toLowerCase());
  // novelty fact from real data
  const lw = lastWornMap(ctx.wear); const ref = ctx.date || todayStr();
  let nov = null, nd = -1;
  for (const g of items.filter((x) => x.category !== 'accessory')) {
    const d = daysSince(lw.get(g.id), ref);
    const v = d == null ? 9999 : d;
    if (v > nd) { nd = v; nov = g; }
  }
  const W = weights();
  const contrib = Object.keys(W).map((k) => [k, W[k] * ((o.parts[k] ?? 0) - 0.6)]).sort((a, b) => b[1] - a[1]);
  const reasons = [o.occNote, o.humidNote].filter(Boolean);
  for (const [k] of contrib) {
    if (reasons.length >= 3) break;
    if (k === 'novelty') {
      if (nov && nd >= 7) reasons.push(nd === 9999 ? `you haven't worn the ${garmentName(nov)} yet` : `you haven't worn the ${garmentName(nov)} in ${nd} days`);
      continue;
    }
    const ph = PHRASE[k]?.(o, ctx);
    if (ph) reasons.push(ph);
  }
  return `${lead} — ${bits.join(', ')}${reasons.length ? ', ' + reasons.join('; ') : ''}.`;
}

// ---------- Fast counting for insights (gap analysis, capsule, shopping advisor) ----------
export function countOutfits(ctx, { threshold = 0.74, cap: capN = 99 } = {}) {
  const { slots: S, occ, wx } = eligible(ctx);
  const layer = needsLayer(ctx.ignoreWeather ? null : wx);
  if (!S.footwear.length) return 0;
  if (layer.required && !S.outerwear.length) return 0;
  let n = 0;
  const shoeOk = (base) => S.footwear.filter((s) => base.every((b) => quickPair(b, s, occ) >= threshold - 0.08)).length;
  for (const t of S.top) for (const b of S.bottom) {
    if (quickPair(t, b, occ) < threshold) continue;
    n += shoeOk([t, b]);
    if (n >= capN) return capN;
  }
  for (const d of S.dress) { n += shoeOk([d]); if (n >= capN) return capN; }
  return n;
}

export function compatHint(item, chosen, ctx) {
  const occ = OCCASIONS[ctx.occasion] || OCCASIONS.casual;
  const others = chosen.filter((g) => g && g.id !== item.id);
  const fOk = formalityOk(item, occ);
  const wOk = weatherOk(item, ctx.ignoreWeather ? null : ctx.weather);
  if (!others.length) return { q: fOk && wOk ? 0.75 : 0.4, fOk, wOk };
  const q = mean(others.map((o) => quickPair(o, item, occ)));
  return { q: q - (fOk ? 0 : 0.15) - (wOk ? 0 : 0.15), fOk, wOk };
}

export { formalityOk };
