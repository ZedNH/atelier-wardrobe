// Planning: multi-day no-repeat scheduler with laundry simulation, and the trip packing solver.
import { OCCASIONS } from './enums.js';
import { state, activeGarments } from './db.js';
import { recommend, generate, clearPairCache } from './recommender.js';
import { getForecast, dayWeather, addDays, todayStr } from './weather.js';
import { washLimit } from './actions.js';

const weekday = (d) => new Date(d + 'T12:00:00').getDay();

export async function planWeek({ start = todayStr(), days = 7, occasions = null, noRepeatDays = state.settings.noRepeatDays ?? 5, laundryDay = state.settings.laundryDay ?? 0, locked = {} } = {}) {
  clearPairCache();
  let fc = null;
  try { fc = state.settings.location ? await getForecast(state.settings.location) : null; } catch { fc = null; }
  // simulated laundry + wear log
  const wears = new Map(); // garmentId -> wears since wash (simulated)
  for (const g of activeGarments()) wears.set(g.id, g.laundry?.state === 'dirty' ? Infinity : g.laundry?.wearsSinceWash || 0);
  const simWear = [...state.wear];
  const plan = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    if (i > 0 && weekday(date) === laundryDay) for (const k of wears.keys()) wears.set(k, 0);
    const occasion = occasions?.[i] || (weekday(date) === 0 || weekday(date) === 6 ? 'casual' : 'work');
    const weather = dayWeather(fc, date);
    const recent = new Set(simWear.filter((w) => { const d = (new Date(date) - new Date(w.wornOn)) / 86400e3; return d > 0 && d <= noRepeatDays; }).map((w) => w.garmentId));
    const exclude = activeGarments().filter((g) => recent.has(g.id) && ['top', 'bottom', 'dress'].includes(g.category)).map((g) => g.id);
    const ctx = {
      occasion, date, weather, count: 1, explore: false, exclude, wear: simWear,
      laundry: (g) => (wears.get(g.id) >= washLimit(g) ? 'dirty' : 'clean'),
    };
    let items;
    if (locked[date]) items = locked[date].map((id) => state.garments.find((g) => g.id === id)).filter(Boolean);
    else {
      let r = recommend(ctx);
      if (!r.outfits.length) { r = recommend({ ...ctx, exclude: [] }); } // relax no-repeat before giving up
      items = r.outfits[0]?.items || [];
      plan.push({ date, occasion, weather, items, rationale: r.outfits[0]?.rationale || r.reason, score: r.outfits[0]?.total, relaxed: !!(r.outfits.length && ctx.exclude.length && !items.length) });
    }
    if (locked[date]) plan.push({ date, occasion, weather, items, rationale: 'Locked by you', locked: true });
    for (const g of items) { wears.set(g.id, (wears.get(g.id) || 0) + 1); simWear.push({ garmentId: g.id, wornOn: date, outfitId: 'plan:' + date }); }
  }
  return plan;
}

const WEAR_CAP = { top: 2, bottom: 3, dress: 2, footwear: 99, outerwear: 99, accessory: 99, headwear: 99 };

// Packing solver: minimum item set covering every planned day x occasion, respecting forecast + item cap.
export async function packTrip({ loc = null, start, nights = 4, occasionMix = { casual: 1 }, cap = 15 }) {
  clearPairCache();
  let fc = null;
  if (loc) { try { fc = await getForecast(loc, false); } catch { fc = null; } }
  const days = [];
  for (let i = 0; i <= nights; i++) days.push(addDays(start, i));
  const slots = [];
  for (const d of days) for (const [occ, n] of Object.entries(occasionMix)) for (let k = 0; k < n; k++) slots.push({ date: d, occasion: occ, weather: dayWeather(fc, d) });
  // hardest first: most formal, then coldest
  slots.sort((a, b) => (OCCASIONS[b.occasion].f - OCCASIONS[a.occasion].f) || ((a.weather?.feels ?? 20) - (b.weather?.feels ?? 20)));
  const packed = new Map(); const uses = new Map(); const plan = [];
  for (const s of slots) {
    const ctx = { occasion: s.occasion, date: s.date, weather: s.weather, laundry: () => 'clean', explore: false };
    const { cands } = generate(ctx, { maxBases: 220 });
    let best = null, bv = -Infinity;
    for (const c of cands.slice(0, 500)) {
      if (c.items.some((g) => (uses.get(g.id) || 0) >= (WEAR_CAP[g.category] ?? 99))) continue;
      const fresh = c.items.filter((g) => !packed.has(g.id)).length;
      if (packed.size + fresh > cap && fresh > 0) continue;
      const v = c.total - 0.09 * fresh;
      if (v > bv) { bv = v; best = c; }
    }
    if (!best) { // relax the cap rather than leave a day uncovered
      best = cands.find((c) => !c.items.some((g) => (uses.get(g.id) || 0) >= (WEAR_CAP[g.category] ?? 99))) || cands[0];
    }
    if (best) for (const g of best.items) { packed.set(g.id, g); uses.set(g.id, (uses.get(g.id) || 0) + 1); }
    plan.push({ ...s, items: best?.items || [], score: best?.total });
  }
  plan.sort((a, b) => a.date.localeCompare(b.date) || OCCASIONS[a.occasion].f - OCCASIONS[b.occasion].f);
  const covered = plan.filter((p) => p.items.length).length;
  return { plan, packed: [...packed.values()], covered, total: slots.length, overCap: packed.size > cap, forecast: !!fc };
}
