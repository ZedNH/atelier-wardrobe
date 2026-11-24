// Wardrobe intelligence: gap analysis, cost-per-wear, dead stock, palette map, capsule, shopping advisor.
import { OCCASIONS, SUBTYPES, CATEGORIES, CATEGORY_LABEL } from './enums.js';
import { state, activeGarments } from './db.js';
import { countOutfits, lastWornMap, weatherOk, quickPair, clearPairCache, formalityOk } from './recommender.js';
import { manualWeather, todayStr, fmtTemp } from './weather.js';
import { makeColor, deltaE, primaryColor, NAMED_COLORS, isNeutralName } from './color.js';
import { deriveWarmth, deriveSeason, mean, garmentName, cosine, DAY } from './util.js';
import { costPerWear, wearsOf } from './actions.js';
import { defaultFabric as defaultFabricFor } from './pipeline.js';
import { suitsWear, colorFit, profile, myRegion, SEASONS as SKIN_SEASONS } from './profile.js';

export const GAP_OCCASIONS = ['casual', 'smart_casual', 'work', 'business', 'formal', 'active'];
export const GAP_BANDS = [
  { key: 'hot', label: 'Hot', temp: 31 }, { key: 'warm', label: 'Warm', temp: 23 }, { key: 'mild', label: 'Mild', temp: 15 },
  { key: 'cold', label: 'Cold', temp: 6 }, { key: 'freezing', label: 'Freezing', temp: -4 },
];

const allClean = () => 'clean';
function cellCtx(occ, band, pool) {
  return { occasion: occ, weather: manualWeather(band.temp, 0, 6), pool, laundry: allClean };
}

export function gapMatrix(pool = activeGarments()) {
  clearPairCache();
  const m = {};
  for (const o of GAP_OCCASIONS) { m[o] = {}; for (const b of GAP_BANDS) m[o][b.key] = countOutfits(cellCtx(o, b, pool)); }
  return m;
}

export function makeVirtual(spec) {
  const { subtype, hex, pattern = 'solid', fabric, name, formality } = spec;
  const meta = SUBTYPES[subtype];
  const fab = fabric || defaultFabricFor(subtype);
  const warmth = deriveWarmth(subtype, fab, meta.cat);
  return {
    id: 'virtual:' + subtype + ':' + hex + ':' + Math.random().toString(36).slice(2, 6), virtual: true, name: name || '',
    category: meta.cat, subtype, colors: [makeColor(hex)], pattern, fabric: fab, formality: formality || meta.f, fit: meta.fit,
    warmth, season: deriveSeason(warmth, fab, meta.cat), status: 'active', needsReview: false, laundry: { state: 'clean' },
  };
}

export const ARCHETYPES = [
  { subtype: 'sweater', hex: '#3a3d42', name: 'charcoal knit sweater', fabric: 'knit' },
  { subtype: 'blazer', hex: '#1f2a44', name: 'navy blazer', fabric: 'wool' },
  { subtype: 'oxford shirt', hex: '#f7f7f5', name: 'white oxford shirt' },
  { subtype: 'dress shirt', hex: '#f7f7f5', name: 'white dress shirt' },
  { subtype: 'dress trousers', hex: '#111111', name: 'black dress trousers', fabric: 'wool' },
  { subtype: 'turtleneck', hex: '#111111', name: 'black fine-knit turtleneck', fabric: 'wool' },
  { subtype: 'heels', hex: '#111111', name: 'black heels', fabric: 'leather' },
  { subtype: 'oxford shirt', hex: '#9cc3e6', name: 'light blue oxford shirt' },
  { subtype: 't-shirt', hex: '#f7f7f5', name: 'white t-shirt' },
  { subtype: 'polo', hex: '#1f2a44', name: 'navy polo' },
  { subtype: 'linen shirt', hex: '#efe6d2', name: 'cream linen shirt', fabric: 'linen' },
  { subtype: 'jeans', hex: '#2c3e5c', name: 'dark indigo jeans', fabric: 'denim' },
  { subtype: 'chinos', hex: '#d8c3a0', name: 'beige chinos' },
  { subtype: 'dress trousers', hex: '#808285', name: 'grey dress trousers', fabric: 'wool' },
  { subtype: 'shorts', hex: '#a89a6c', name: 'khaki shorts' },
  { subtype: 'sneakers', hex: '#f7f7f5', name: 'white leather sneakers', fabric: 'leather' },
  { subtype: 'chelsea boots', hex: '#111111', name: 'black chelsea boots', fabric: 'leather' },
  { subtype: 'loafers', hex: '#6b4a32', name: 'brown loafers', fabric: 'leather' },
  { subtype: 'oxford shoes', hex: '#111111', name: 'black oxford shoes', fabric: 'leather' },
  { subtype: 'overcoat', hex: '#b88a56', name: 'camel wool overcoat', fabric: 'wool' },
  { subtype: 'raincoat', hex: '#6b6b2e', name: 'olive rain jacket', fabric: 'synthetic' },
  { subtype: 'puffer', hex: '#111111', name: 'black puffer jacket', fabric: 'synthetic' },
  { subtype: 'cocktail dress', hex: '#111111', name: 'black cocktail dress', fabric: 'silk' },
  { subtype: 'suit jacket', hex: '#3a3d42', name: 'charcoal suit jacket', fabric: 'wool' },
  { subtype: 'running shoes', hex: '#808285', name: 'grey running shoes', fabric: 'synthetic' },
  { subtype: 'activewear top', hex: '#111111', name: 'black training top', fabric: 'synthetic' },
  { subtype: 'joggers', hex: '#3a3d42', name: 'charcoal joggers' },
  { subtype: 'blouse', hex: '#f7f7f5', name: 'white silk blouse', fabric: 'silk' },
  { subtype: 'skirt', hex: '#111111', name: 'black midi skirt' },
  { subtype: 'flats', hex: '#d8c3a0', name: 'nude ballet flats', fabric: 'leather' },
  { subtype: 'trench coat', hex: '#d8c3a0', name: 'beige trench coat', fabric: 'cotton' },
  { subtype: 'shirt dress', hex: '#1f2a44', name: 'navy shirt dress' },
  { subtype: 'derby shoes', hex: '#6b4a32', name: 'brown derby shoes', fabric: 'leather' },
];

const total = (m) => Object.values(m).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);

// Only cells where you are short (≤ maxBefore outfits) are re-counted — that's where a purchase matters.
export function outfitsUnlocked(virtual, pool = activeGarments(), base = null, maxBefore = Infinity) {
  base = base || gapMatrix(pool);
  const after = {};
  const withV = [...pool, virtual];
  for (const o of GAP_OCCASIONS) { after[o] = {}; for (const b of GAP_BANDS) after[o][b.key] = base[o][b.key] > maxBefore ? base[o][b.key] : countOutfits(cellCtx(o, b, withV)); }
  let gained = 0, weighted = 0; const cells = [];
  for (const o of GAP_OCCASIONS) for (const b of GAP_BANDS) {
    const before = base[o][b.key], d = after[o][b.key] - before;
    if (d > 0) {
      gained += d;
      weighted += d * (before === 0 ? 8 : before <= 3 ? 4 : before <= 10 ? 1.5 : before < 40 ? 0.5 : 0.1);
      cells.push({ occasion: o, band: b.key, before, after: after[o][b.key] });
    }
  }
  cells.sort((x, y) => x.before - y.before);
  return { gained, weighted, cells, after };
}

export async function gapReport(pool = activeGarments()) {
  const pause = () => new Promise((r) => setTimeout(r, 0));
  const matrix = gapMatrix(pool);
  await pause();
  const weak = [];
  for (const o of GAP_OCCASIONS) for (const b of GAP_BANDS) if (matrix[o][b.key] <= 1) weak.push({ occasion: o, band: b, n: matrix[o][b.key] });
  const owned = (a) => pool.some((g) => g.subtype === a.subtype && deltaE(primaryColor(g).lab, makeColor(a.hex).lab) < 12);
  const suggestions = [];
  for (const a of ARCHETYPES.filter((x) => !owned(x) && suitsWear(x.subtype))) {
    const v = makeVirtual(a);
    const r = outfitsUnlocked(v, pool, matrix, 10);
    suggestions.push({ archetype: a, ...r, fixes: r.cells.filter((c) => c.before <= 1).length });
    await pause(); // keep the screen responsive between candidates
  }
  suggestions.splice(0, suggestions.length, ...suggestions.filter((s) => s.gained > 0).sort((x, y) => y.weighted - x.weighted).slice(0, 5));
  // headline, e.g. "you have 4 summer smart-casual outfits and 0 winter formal ones"
  let best = null, worst = null;
  for (const o of GAP_OCCASIONS) for (const b of GAP_BANDS) {
    const n = matrix[o][b.key];
    if (!best || n > best.n) best = { o, b, n };
    if (!worst || n < worst.n) worst = { o, b, n };
  }
  const headline = best && worst ? `You have ${best.n >= 99 ? '99+' : best.n} ${best.b.label.toLowerCase()}-weather ${OCCASIONS[best.o].label.toLowerCase()} outfits and ${worst.n} ${worst.b.label.toLowerCase()}-weather ${OCCASIONS[worst.o].label.toLowerCase()} ones.` : '';
  const top = suggestions[0];
  const advice = top ? `One ${top.archetype.name} would create ${top.gained} new outfit${top.gained === 1 ? '' : 's'}${top.fixes ? ` and fill ${top.fixes} empty slot${top.fixes === 1 ? '' : 's'}` : ''}.` : 'No single staple would add many outfits — your wardrobe is well covered.';
  return { matrix, weak, suggestions, headline, advice };
}

export function costPerWearReport() {
  const items = state.garments.filter((g) => g.status !== 'donated' && !g.needsReview).map((g) => ({ g, wears: wearsOf(g.id).length, cpw: costPerWear(g) }));
  const priced = items.filter((x) => x.g.price);
  const byCat = {};
  for (const x of priced) { const c = (byCat[x.g.category] ||= { spent: 0, wears: 0, n: 0 }); c.spent += x.g.price; c.wears += x.wears; c.n++; }
  return {
    items: priced.sort((a, b) => b.cpw - a.cpw),
    byCategory: Object.entries(byCat).map(([cat, v]) => ({ cat, label: CATEGORY_LABEL[cat], ...v, cpw: v.wears ? v.spent / v.wears : v.spent })).sort((a, b) => b.cpw - a.cpw),
    unpriced: items.filter((x) => !x.g.price).length,
    totalSpent: priced.reduce((s, x) => s + x.g.price, 0),
  };
}

export function deadStock(todayWeather = null, days = 90) {
  const lw = lastWornMap(); const now = Date.now(); const ref = todayStr();
  const pool = activeGarments();
  const myFormality = mean(state.wear.map((w) => state.garments.find((g) => g.id === w.garmentId)?.formality).filter(Boolean)) || 2.8;
  const out = [];
  for (const g of pool) {
    const last = lw.get(g.id);
    const idle = last ? Math.round((new Date(ref) - new Date(last)) / DAY) : Math.round((now - (g.createdAt || now)) / DAY);
    if (idle < days) continue;
    let reason;
    if (g.neverSuggest) reason = 'You excluded it from suggestions';
    else if (g.laundry?.state === 'dirty' || g.laundry?.state === 'washing') reason = 'Stuck in the laundry';
    else if (todayWeather && !weatherOk(g, todayWeather)) reason = 'Wrong season for the current weather';
    else if ((g.formality || 3) >= 4 && myFormality <= 2.8) reason = 'Too formal for how you usually dress';
    else if ((g.formality || 3) <= 1 && myFormality >= 3.4) reason = 'Too casual for how you usually dress';
    else {
      const occ = OCCASIONS[myFormality >= 3.4 ? 'work' : myFormality >= 2.6 ? 'smart_casual' : 'casual'];
      const partnerCat = g.category === 'top' ? 'bottom' : g.category === 'bottom' ? 'top' : null;
      if (partnerCat) {
        const partners = pool.filter((p) => p.category === partnerCat && quickPair(g, p, OCCASIONS.casual) >= 0.66 || (p.category === partnerCat && quickPair(g, p, occ) >= 0.66));
        reason = partners.length === 0 ? `No matching ${partnerCat} in your wardrobe` : 'Low score — other pieces keep winning';
      } else reason = 'Low score — other pieces keep winning';
    }
    out.push({ g, idle, reason, neverWorn: !last });
  }
  const groups = {};
  for (const x of out) (groups[x.reason] ||= []).push(x);
  return { items: out.sort((a, b) => b.idle - a.idle), groups };
}

export function paletteMap(pool = activeGarments()) {
  const counts = {};
  for (const g of pool) for (const [i, c] of (g.colors || []).entries()) {
    const w = i === 0 ? 1 : 0.4 * (c.share || 0.3) / 0.3;
    counts[c.name] = (counts[c.name] || 0) + w;
  }
  const tot = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const list = Object.entries(counts).map(([name, v]) => ({ name, share: v / tot, hex: NAMED_COLORS.find((c) => c.name === name)?.hex, neutral: isNeutralName(name) })).sort((a, b) => b.share - a.share);
  const staples = ['white', 'black', 'navy', 'grey', 'beige'];
  const missingNeutrals = staples.filter((s) => !counts[s]);
  // neighbours of dominant chromatic colors that are missing
  const chromatic = list.filter((c) => !c.neutral).slice(0, 3);
  const neighbours = [];
  for (const c of chromatic) {
    const lab = NAMED_COLORS.find((n) => n.name === c.name).lab;
    const near = NAMED_COLORS.filter((n) => !n.neutral && n.name !== c.name && !counts[n.name]).map((n) => ({ n, d: deltaE(lab, n.lab) })).sort((a, b) => a.d - b.d)[0];
    if (near && !neighbours.includes(near.n.name)) neighbours.push(near.n.name);
  }
  const neutralShare = list.filter((c) => c.neutral).reduce((s, c) => s + c.share, 0);
  return { list, missingNeutrals, neighbours, neutralShare };
}

// Capsule: greedy pick of n items maximizing distinct valid outfits (coverage objective).
export function capsule(n = 15, occasions = ['casual', 'smart_casual', 'work'], temp = 16) {
  clearPairCache();
  const pool = activeGarments().filter((g) => ['top', 'bottom', 'dress', 'footwear', 'outerwear'].includes(g.category));
  const ctxs = occasions.map((o) => ({ occasion: o, weather: manualWeather(temp), laundry: allClean }));
  const score = (set) => ctxs.reduce((s, c) => s + countOutfits({ ...c, pool: set }, { cap: 999 }), 0);
  const potential = (g) => pool.filter((p) => p.id !== g.id && p.category !== g.category).reduce((s, p) => s + (quickPair(g, p, OCCASIONS.smart_casual) >= 0.66 ? 1 : 0), 0);
  const pot = new Map(pool.map((g) => [g.id, potential(g)]));
  const chosen = []; let cur = 0;
  // seed so the coverage objective has something to grow: best top, bottom and shoe by potential
  for (const cat of ['top', 'bottom', 'footwear']) {
    const best = pool.filter((g) => g.category === cat).sort((a, b) => pot.get(b.id) - pot.get(a.id))[0];
    if (best && chosen.length < n) chosen.push(best);
  }
  cur = score(chosen);
  while (chosen.length < Math.min(n, pool.length)) {
    let best = null, bv = -Infinity;
    for (const g of pool) {
      if (chosen.includes(g)) continue;
      const v = score([...chosen, g]) - cur + pot.get(g.id) * 0.01;
      if (v > bv) { bv = v; best = g; }
    }
    if (!best) break;
    chosen.push(best); cur = score(chosen);
  }
  return { items: chosen, outfits: cur };
}

// Shopping advisor: how many new outfits would this unlock, and is it a duplicate?
export function adviseItem(virtual, embedding = null) {
  const pool = activeGarments();
  const r = outfitsUnlocked(virtual, pool);
  const dupes = pool.filter((g) => g.category === virtual.category && (
    (g.subtype === virtual.subtype && deltaE(primaryColor(g).lab, primaryColor(virtual).lab) < 12) ||
    (embedding && g.embedding && cosine(embedding, g.embedding) > 0.9)));
  // Uncapped count of outfits it joins in everyday occasions, compared with how many outfits each piece of the
  // same kind you already own takes part in (large closets saturate the gap matrix, so this is the fair test).
  const sa = myRegion() === 'sa';
  const occs = sa ? ['casual', 'smart_casual', 'work', 'eid'] : ['casual', 'smart_casual', 'work'];
  const ctxs = occs.map((o) => ({ occasion: o, weather: manualWeather(sa ? 27 : 16, 0, 6), laundry: allClean }));
  const count = (set) => ctxs.reduce((s, c) => s + countOutfits({ ...c, pool: set }, { cap: 100000 }), 0);
  const base = count(pool);
  const joins = count([...pool, virtual]) - base;
  const peers = pool.filter((g) => g.category === virtual.category && ['top', 'bottom', 'dress', 'footwear'].includes(g.category)).slice(0, 14);
  const peerJoins = peers.map((g) => base - count(pool.filter((x) => x.id !== g.id)));
  const beats = peerJoins.length ? peerJoins.filter((n) => n < joins).length / peerJoins.length : 1;
  r.gained = Math.max(r.gained, joins);
  const label = { footwear: 'shoes', dress: 'dresses and full outfits', accessory: 'accessories', headwear: 'headwear', outerwear: 'layers' }[virtual.category] || `${virtual.category}s`;
  let verdict;
  if (dupes.length) verdict = { tone: 'bad', text: `Don't buy — it duplicates ${dupes.length === 1 ? 'your ' + garmentName(dupes[0]) : dupes.length + ' things you own'}.` };
  else if (joins >= 3 && beats >= 0.6) verdict = { tone: 'good', text: `Strong buy — it unlocks ${joins} new outfits, more than ${Math.round(beats * 100)}% of your ${label} manage.` };
  else if (joins >= 3 && beats >= 0.3) verdict = { tone: 'ok', text: `Reasonable — it unlocks ${joins} new outfits, about average for your ${label}.` };
  else verdict = { tone: 'bad', text: joins ? `Skip it — it unlocks only ${joins} new outfit${joins === 1 ? '' : 's'}, fewer than most of your ${label}.` : 'Skip it — almost nothing you own goes with it.' };
  let colorNote = null;
  const p = profile();
  if (p.season && ['top', 'dress', 'outerwear', 'headwear'].includes(virtual.category)) {
    const f = colorFit(primaryColor(virtual).hex, p.season);
    colorNote = f.verdict === 'great' ? `Great color for you — it sits in your ${p.seasonName} palette.` : f.verdict === 'ok' ? `Workable color for your ${p.seasonName} coloring; keep it away from your face or pair with a palette color.` : `This color fights your ${p.seasonName} coloring near the face — choose a palette shade instead.`;
    if (f.verdict === 'avoid' && verdict.tone !== 'bad') verdict = { tone: 'ok', text: verdict.text + ' But check the color.' };
  }
  return { ...r, dupes, verdict, colorNote };
}

// ---------------- Best buys: which single new piece unlocks the most outfits with what you own ----------------
const BUY_TYPES = {
  top: ['t-shirt', 'polo', 'oxford shirt', 'dress shirt', 'blouse', 'sweater', 'kurti', 'panjabi'],
  bottom: ['jeans', 'chinos', 'dress trousers', 'skirt', 'joggers', 'palazzo', 'pajama'],
  footwear: ['sneakers', 'loafers', 'chelsea boots', 'heels', 'flats', 'sandals', 'nagra'],
  outerwear: ['blazer', 'denim jacket', 'cardigan', 'trench coat'],
  dress: ['casual dress', 'shirt dress', 'salwar kameez', 'saree'],
};
const BUY_COLORS = {
  top: ['#f7f7f5', '#111111', '#1f2a44', '#808285', '#9cc3e6', '#d8c3a0', '#6b6b2e', '#6e1f2e'],
  bottom: ['#1f2a44', '#111111', '#d8c3a0', '#808285', '#6b6b2e', '#f7f7f5'],
  jeans: ['#2c3e5c', '#4a6585', '#111111'],
  footwear: ['#f7f7f5', '#111111', '#6b4a32', '#b88a56'],
  outerwear: ['#1f2a44', '#b88a56', '#111111', '#808285', '#4a6585'],
  dress: ['#111111', '#1f2a44', '#6e1f2e', '#efe6d2', '#1f7a7a'],
};
// Uncapped number of everyday outfits a set of clothes makes (casual / smart casual / work, + Eid in South Asia)
export function outfitCounter() {
  const sa = myRegion() === 'sa';
  const occs = sa ? ['casual', 'smart_casual', 'work', 'eid'] : ['casual', 'smart_casual', 'work'];
  const ctxs = occs.map((o) => ({ occasion: o, weather: manualWeather(sa ? 27 : 16, 0, 6), laundry: allClean }));
  return (set) => ctxs.reduce((s, c) => s + countOutfits({ ...c, pool: set }, { cap: 100000 }), 0);
}
// How many new outfits each candidate would unlock — used to compare several things you're thinking of buying
export async function rankCandidates(virtuals) {
  const pool = activeGarments(); const count = outfitCounter(); const base = count(pool);
  const out = [];
  for (const v of virtuals) {
    const dupe = pool.some((g) => g.subtype === v.subtype && deltaE(primaryColor(g).lab, primaryColor(v).lab) < 12);
    out.push({ v, joins: count([...pool, v]) - base, dupe });
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

export async function bestBuys({ limit = 8, onProgress } = {}) {
  const pool = activeGarments();
  const sa = myRegion() === 'sa'; const p = profile();
  const count = outfitCounter();
  clearPairCache();
  const base = count(pool);
  const cands = [];
  for (const [cat, types] of Object.entries(BUY_TYPES)) for (const st of types) {
    if (!SUBTYPES[st] || !suitsWear(st) || (SUBTYPES[st].trad && !sa)) continue;
    const cols = [...(st === 'jeans' ? BUY_COLORS.jeans : BUY_COLORS[cat]), ...(SKIN_SEASONS[p.season] && ['top', 'dress', 'outerwear'].includes(cat) ? SKIN_SEASONS[p.season].best.slice(0, 4) : [])];
    for (const hex of [...new Set(cols)]) {
      const owned = pool.some((g) => g.subtype === st && deltaE(primaryColor(g).lab, makeColor(hex).lab) < 14);
      if (!owned) cands.push({ cat, st, hex });
    }
  }
  const out = []; let i = 0; let slice = performance.now();
  await new Promise((r) => setTimeout(r, 0));
  for (const c of cands) {
    if (performance.now() - slice > 24) { onProgress?.(i / cands.length); await new Promise((r) => setTimeout(r, 0)); slice = performance.now(); }
    const v = makeVirtual({ subtype: c.st, hex: c.hex, name: `${makeColor(c.hex).name} ${c.st}` });
    const joins = count([...pool, v]) - base;
    const fit = p.season && ['top', 'dress', 'outerwear'].includes(c.cat) ? colorFit(c.hex, p.season) : null;
    const score = joins * (fit ? (fit.verdict === 'great' ? 1.15 : fit.verdict === 'avoid' ? 0.55 : 1) : 1);
    if (joins > 0) out.push({ v, cat: c.cat, joins, fit, score });
    i++;
  }
  // best colour per type, then the strongest types — a varied shopping list
  const bestPerType = new Map();
  for (const r of out.sort((a, b) => b.score - a.score)) if (!bestPerType.has(r.v.subtype)) bestPerType.set(r.v.subtype, r);
  const perCat = {};
  const list = [...bestPerType.values()].filter((r) => (perCat[r.cat] = (perCat[r.cat] || 0) + 1) <= 3).slice(0, limit);
  for (const r of list) r.preview = previewOutfit(r.v, pool);
  return { base, list, tried: cands.length };
}

// One example outfit built around a (virtual or real) piece, from what you own
const NEEDS = { top: ['bottom', 'footwear'], bottom: ['top', 'footwear'], footwear: ['top', 'bottom'], dress: ['footwear'], outerwear: ['top', 'bottom', 'footwear'] };
export function previewOutfit(item, pool = activeGarments(), occasion = 'smart_casual') {
  const occ = OCCASIONS[occasion] || OCCASIONS.casual;
  const chosen = [item];
  for (const cat of NEEDS[item.category] || []) {
    let best = null, bs = -1;
    for (const g of pool) {
      if (g.category !== cat || g.id === item.id) continue;
      const s = Math.min(...chosen.map((c) => quickPair(c, g, occ)));
      if (s > bs) { bs = s; best = g; }
    }
    if (best) chosen.push(best);
  }
  return chosen.slice(1);
}

export function wardrobeStats() {
  const pool = activeGarments(); const lw = lastWornMap(); const ref = todayStr();
  const worn30 = pool.filter((g) => { const d = lw.get(g.id); return d && (new Date(ref) - new Date(d)) / DAY <= 30; }).length;
  const counts = {}; for (const w of state.wear) counts[w.garmentId] = (counts[w.garmentId] || 0) + 1;
  const most = pool.map((g) => ({ g, n: counts[g.id] || 0 })).sort((a, b) => b.n - a.n).slice(0, 5);
  const outfitsWorn = new Set(state.wear.map((w) => w.outfitId)).size;
  const byCat = {}; for (const c of CATEGORIES) byCat[c] = pool.filter((g) => g.category === c).length;
  return { total: pool.length, rotation: pool.length ? worn30 / pool.length : 0, worn30, most, outfitsWorn, byCat };
}

export { fmtTemp, formalityOk };
