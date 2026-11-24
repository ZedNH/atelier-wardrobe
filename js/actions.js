// Domain actions: wear log (drives laundry, novelty, cost-per-wear and training), feedback, laundry, corrections.
import { SUBTYPES } from './enums.js';
import { state, uid, saveGarment, saveOutfit, addWear, addFeedback, addCorrection, saveSettings } from './db.js';
import { learn, noteShown } from './learning.js';
import { todayStr } from './weather.js';
import { DAY } from './util.js';

const FABRIC_WASH = { wool: 2, leather: 3, linen: 0.7, silk: 0.8, denim: 1.3, knit: 1.2 };
export function washLimit(g) {
  if (['footwear', 'accessory', 'headwear'].includes(g.category)) return Infinity;
  const base = SUBTYPES[g.subtype]?.wash ?? 3;
  return Math.max(1, Math.round(base * (FABRIC_WASH[g.fabric] || 1)));
}

export function ensureLaundry(g) {
  if (!g.laundry) g.laundry = { state: 'clean', wearsSinceWash: 0, lastWashedAt: null };
  return g.laundry;
}

// clean -> worn -> dirty -> washing -> clean
export async function markWorn(g) {
  const l = ensureLaundry(g);
  l.wearsSinceWash += 1;
  const lim = washLimit(g);
  if (l.wearsSinceWash >= lim) { l.state = 'dirty'; l.dirtySince = Date.now(); }
  else if (lim !== Infinity) l.state = 'worn';
  await saveGarment(g);
}
export async function setLaundry(g, st) {
  const l = ensureLaundry(g);
  l.state = st;
  if (st === 'washing') l.washingSince = Date.now();
  if (st === 'dirty') l.dirtySince = Date.now();
  if (st === 'clean') { l.wearsSinceWash = 0; l.lastWashedAt = Date.now(); }
  await saveGarment(g);
}

// Auto-reset so stale laundry state never strands the closet.
export async function laundryHousekeeping() {
  const now = Date.now();
  const laundryDay = state.settings.laundryDay; // 0..6 or -1 off
  for (const g of state.garments) {
    const l = g.laundry; if (!l) continue;
    if (l.state === 'washing' && now - (l.washingSince || 0) > 36 * 3600e3) await setLaundry(g, 'clean');
    else if (l.state === 'dirty' && laundryDay >= 0 && l.dirtySince) {
      const d = new Date(l.dirtySince); const next = new Date(d); next.setHours(20, 0, 0, 0);
      while (next.getDay() !== laundryDay || next <= d) next.setDate(next.getDate() + 1);
      if (now > next.getTime()) await setLaundry(g, 'clean');
    }
  }
}

export async function washAllDirty() {
  for (const g of state.garments) if (g.laundry?.state === 'dirty' || g.laundry?.state === 'worn') await setLaundry(g, 'washing');
}

function contextSnapshot(ctx) {
  if (!ctx) return null;
  const { occasion, date, weather, mustInclude, ignoreWeather } = ctx;
  return { occasion, date, weather, mustInclude, ignoreWeather };
}

export async function recordSuggestion(o, ctx) {
  const row = {
    id: uid(), source: 'suggested', items: o.items.map((g) => ({ garmentId: g.id, slot: g.category })),
    context: contextSnapshot(ctx), score: o.total, parts: o.parts, features: o.features, rationale: o.rationale,
    stretch: !!o.stretch, createdAt: Date.now(),
  };
  noteShown(o.items);
  await saveOutfit(row);
  await addFeedback({ id: uid(), outfitId: row.id, type: 'shown', createdAt: Date.now() });
  return row;
}

export async function feedback(outfitRow, type, items) {
  await addFeedback({ id: uid(), outfitId: outfitRow.id, type, createdAt: Date.now() });
  learn(type, outfitRow.features, items);
}

export async function logWear(items, { ctx = null, fromOutfit = null, date = todayStr(), rating = null, features = null, source = 'worn' } = {}) {
  const row = {
    id: uid(), source: 'worn', items: items.map((g) => ({ garmentId: g.id, slot: g.category })),
    context: contextSnapshot(ctx), score: fromOutfit?.score ?? null, parts: fromOutfit?.parts ?? null,
    features: features || fromOutfit?.features || null, rationale: fromOutfit?.rationale || null, basedOn: fromOutfit?.id || null,
    createdAt: Date.now(), wornOn: date, manual: source === 'manual',
  };
  await saveOutfit(row);
  for (const g of items) {
    await addWear({ id: uid(), outfitId: row.id, garmentId: g.id, wornOn: date, rating, createdAt: Date.now() });
    await markWorn(g);
  }
  if (fromOutfit) await addFeedback({ id: uid(), outfitId: fromOutfit.id, type: 'accepted', createdAt: Date.now() });
  learn('worn', row.features, items);
  return row;
}

export async function saveManualOutfit(items, name, features, ctx) {
  const row = { id: uid(), source: 'manual', name, items: items.map((g) => ({ garmentId: g.id, slot: g.category })), features, context: contextSnapshot(ctx), createdAt: Date.now() };
  await saveOutfit(row);
  learn('manual', features, items);
  return row;
}

// Attribute corrections train perception, not taste — kept in their own stream.
export async function correctAttribute(g, key, value) {
  const from = g[key];
  if (JSON.stringify(from) === JSON.stringify(value)) return;
  g[key] = value;
  g.attrSource = { ...(g.attrSource || {}), [key]: 'user' };
  if (g.confidence) g.confidence[key] = 1;
  await addCorrection({ id: uid(), garmentId: g.id, key, from, to: value, modelVersion: g.modelVersion || null, createdAt: Date.now() });
  await saveGarment(g);
}

export function wearsOf(gid) { return state.wear.filter((w) => w.garmentId === gid); }
export function costPerWear(g) {
  const n = wearsOf(g.id).length;
  if (!g.price) return null;
  return n ? g.price / n : g.price;
}
export function outfitsContaining(gid) {
  return state.outfits.filter((o) => (o.source === 'worn' || o.source === 'manual') && o.items.some((i) => i.garmentId === gid));
}

export async function trackTagCall() {
  const day = todayStr();
  const t = state.settings.tagStats || { day, count: 0, total: 0 };
  if (t.day !== day) { t.day = day; t.count = 0; }
  t.count++; t.total = (t.total || 0) + 1;
  await saveSettings({ tagStats: t });
  return t;
}
export const tagCapReached = () => { const t = state.settings.tagStats; return t && t.day === todayStr() && t.count >= (state.settings.dailyTagCap || 300); };
export { DAY };
