// Style hub logic: daily check-in streaks, closet score, budget, challenges and the yearly "Wrapped" stats.
// Everything is computed on the device from your closet, wear log and check-ins.
import { state, activeGarments, kvGet, kvSet, garmentById } from './db.js';
import { todayStr, addDays } from './weather.js';
import { primaryColor, deltaE } from './color.js';
import { colorFit, profile, styleDNA } from './profile.js';
import { gapMatrix, GAP_OCCASIONS, GAP_BANDS, outfitCounter, bestBuys } from './insights.js';
import { costPerWear, wearsOf } from './actions.js';
import { garmentName } from './util.js';

const pause = () => new Promise((r) => setTimeout(r, 0));

// ---------- wear log by day ----------
export function wearDays() {
  const days = new Map();
  for (const w of state.wear) { if (!days.has(w.wornOn)) days.set(w.wornOn, new Set()); days.get(w.wornOn).add(w.garmentId); }
  return days;
}

// ---------- check-ins (mirror selfie each day) ----------
export async function checkins() { return (await kvGet('checkins')) || []; }
export async function addCheckin(c) {
  const list = (await checkins()).filter((x) => x.date !== c.date);
  list.push(c); list.sort((a, b) => a.date.localeCompare(b.date));
  await kvSet('checkins', list.slice(-400));
  return list;
}
export function streakOf(dates) {
  const set = new Set(dates); let d = todayStr(); let n = 0;
  if (!set.has(d)) d = addDays(d, -1); // today not done yet: the streak is still alive from yesterday
  while (set.has(d)) { n++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const x of [...set].sort()) { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { current: n, best, doneToday: set.has(todayStr()) };
}

// ---------- closet score 0-100 ----------
export async function closetScore() {
  const pool = activeGarments();
  const core = pool.filter((g) => ['top', 'bottom', 'dress', 'footwear'].includes(g.category));
  if (core.length < 4) return null;
  // 1. versatility: everyday outfits per core piece
  const count = outfitCounter(); const outfits = count(pool); await pause();
  const perItem = outfits / core.length;
  const versatility = Math.min(1, Math.log10(1 + perItem) / Math.log10(1 + 40));
  // 2. coverage: occasion x weather cells with at least two outfits
  const m = gapMatrix(pool); await pause();
  let cells = 0, ok = 0; for (const o of GAP_OCCASIONS) for (const b of GAP_BANDS) { cells++; if (m[o][b.key] >= 2) ok++; }
  const coverage = ok / cells;
  // 3. use: share of pieces worn in the last 90 days
  const since = addDays(todayStr(), -90); const worn = new Set(state.wear.filter((w) => w.wornOn >= since).map((w) => w.garmentId));
  const use = state.wear.length ? pool.filter((g) => worn.has(g.id)).length / pool.length : 0.5;
  // 4. colors: tops/layers that suit you (or a calm neutral share without a color season)
  const p = profile(); const face = pool.filter((g) => ['top', 'outerwear', 'dress'].includes(g.category));
  const colors = face.length ? (p.season ? face.filter((g) => colorFit(primaryColor(g).hex, p.season).verdict !== 'avoid').length / face.length : 0.7) : 0.5;
  // 5. balance: tops, bottoms and shoes in a healthy ratio (about 3 : 2 : 1)
  const n = (c) => pool.filter((g) => g.category === c).length;
  const t = n('top') + n('dress'), b = n('bottom') + n('dress'), f = n('footwear');
  const balance = Math.min(1, Math.min(b / Math.max(1, t * 0.66), f / Math.max(1, t * 0.33), t / Math.max(1, b * 1.5)));
  const parts = [
    { k: 'versatility', label: 'Versatility', v: versatility, w: 30, tip: 'Pieces that mix with many others (neutral bottoms, plain tops, white sneakers) raise this most.' },
    { k: 'coverage', label: 'Occasions & weather covered', v: coverage, w: 25, tip: 'Some occasions or temperatures have almost no outfits — check Insights → gaps.' },
    { k: 'use', label: 'Clothes you actually wear', v: use, w: 20, tip: 'Wear forgotten pieces (try the “Forgotten five” challenge) or declutter them.' },
    { k: 'colors', label: 'Colors that suit you', v: colors, w: 15, tip: p.season ? `Choose tops in your ${p.seasonName} palette.` : 'Set your color season in My style for this part.' },
    { k: 'balance', label: 'Tops / bottoms / shoes balance', v: balance, w: 10, tip: 'Aim for roughly 3 tops for every 2 bottoms and 1 pair of shoes.' },
  ];
  const score = Math.round(parts.reduce((s, x) => s + x.v * x.w, 0));
  const weakest = parts.slice().sort((a, b2) => a.v * a.w - b2.v * b2.w - (a.w - b2.w) * 0.01).slice(0, 2);
  let buy = null; try { buy = (await bestBuys({ limit: 1 })).list[0] || null; } catch { /* optional */ }
  return { score, parts, weakest, outfits, buy, grade: score >= 85 ? 'Excellent' : score >= 70 ? 'Strong' : score >= 50 ? 'Good' : 'Getting there' };
}

// ---------- budget ----------
export async function budget() { return (await kvGet('budget')) || { monthly: 0 }; }
export const saveBudget = (b) => kvSet('budget', b);
const monthOf = (d) => (d || '').slice(0, 7);
export function purchases() {
  return state.garments.filter((g) => g.price && !g.demo).map((g) => ({ g, date: g.purchasedAt || todayStr(new Date(g.createdAt || Date.now())), price: +g.price })).sort((a, b) => b.date.localeCompare(a.date));
}
export async function budgetReport() {
  const b = await budget(); const all = purchases(); const m = monthOf(todayStr());
  const month = all.filter((x) => monthOf(x.date) === m);
  const spent = month.reduce((s, x) => s + x.price, 0);
  const months = []; let d = todayStr(); for (let i = 0; i < 6; i++) { const k = monthOf(d); months.unshift({ k, label: new Date(k + '-15').toLocaleDateString(undefined, { month: 'short' }), spent: all.filter((x) => monthOf(x.date) === k).reduce((s, x) => s + x.price, 0) }); d = addDays(k + '-01', -1); }
  const byCat = {}; for (const x of month) byCat[x.g.category] = (byCat[x.g.category] || 0) + x.price;
  const last = all[0]?.date; const noBuyDays = last ? Math.max(0, Math.round((new Date(todayStr()) - new Date(last)) / 864e5)) : null;
  return { monthly: b.monthly || 0, spent, left: (b.monthly || 0) - spent, month, months, byCat, noBuyDays };
}
// "This would use 60% of what's left this month" for the Shop verdict
export async function budgetNote(price) {
  if (!price) return null; const r = await budgetReport(); if (!r.monthly) return null;
  if (r.left <= 0) return { tone: 'bad', text: `You are already over this month’s clothing budget.` };
  const share = price / r.left;
  return share > 1 ? { tone: 'bad', text: `This costs more than the ${Math.round(r.left)} left in this month’s budget.` } : { tone: share > 0.5 ? 'warn' : 'good', text: `Uses ${Math.round(share * 100)}% of what’s left in this month’s budget.` };
}

// ---------- challenges (progress comes from your wear log and check-ins) ----------
const famHex = (g) => primaryColor(g).name;
export const CHALLENGES = [
  { id: 'rainbow', title: '7 days, 7 colors', desc: 'Wear a top in a different color every day for a week.', days: 7, goal: 7, badge: 'Rainbow', progress: (st, D) => new Set(dayList(st, 7).flatMap((d) => [...(D.get(d) || [])].map(garmentById).filter((g) => g && ['top', 'dress'].includes(g.category)).map(famHex).slice(0, 1))).size },
  { id: 'forgotten', title: 'Forgotten five', desc: 'Wear 5 pieces you haven’t worn in 60+ days, within 2 weeks.', days: 14, goal: 5, badge: 'Rediscoverer', progress: (st, D) => { const before = new Set(state.wear.filter((w) => w.wornOn < st && w.wornOn >= addDays(st, -60)).map((w) => w.garmentId)); return new Set(dayList(st, 14).flatMap((d) => [...(D.get(d) || [])]).filter((id) => !before.has(id))).size; } },
  { id: 'checkin7', title: 'Mirror week', desc: 'Do the daily mirror check-in 7 days in a row.', days: 7, goal: 7, badge: 'Mirror pro', progress: (st, D, C) => C.filter((c) => c.date >= st && c.date <= addDays(st, 6)).length },
  { id: 'norepeat', title: 'No repeats', desc: '10 days in a row without repeating an outfit.', days: 10, goal: 10, badge: 'Fresh fit', progress: (st, D) => { const seen = new Set(); let n = 0; for (const d of dayList(st, 10)) { const k = [...(D.get(d) || [])].sort().join('|'); if (!k) continue; if (seen.has(k)) break; seen.add(k); n++; } return n; } },
  { id: 'accessorize', title: 'Accessorize', desc: 'Wear at least one accessory on 5 days this week.', days: 7, goal: 5, badge: 'Finisher', progress: (st, D) => dayList(st, 7).filter((d) => [...(D.get(d) || [])].some((id) => ['accessory', 'headwear'].includes(garmentById(id)?.category))).length },
  { id: 'nobuy', title: 'No-buy month', desc: 'Buy no new clothes for 30 days — shop your own closet.', days: 30, goal: 30, badge: 'Mindful', progress: (st) => { const bought = purchases().some((x) => x.date >= st); return bought ? 0 : Math.min(30, Math.round((new Date(todayStr()) - new Date(st)) / 864e5) + 1); } },
  { id: 'tonal', title: 'Tonal week', desc: '3 outfits where top and bottom are the same color family.', days: 7, goal: 3, badge: 'Monochrome', progress: (st, D) => dayList(st, 7).filter((d) => { const its = [...(D.get(d) || [])].map(garmentById).filter(Boolean); const t = its.find((g) => g.category === 'top'), b = its.find((g) => g.category === 'bottom'); return t && b && deltaE(primaryColor(t).lab, primaryColor(b).lab) < 22; }).length },
];
function dayList(start, n) { const out = []; for (let i = 0; i < n; i++) { const d = addDays(start, i); if (d > todayStr()) break; out.push(d); } return out; }
export async function challengeState() {
  const s = (await kvGet('challenges')) || { joined: {}, badges: {} };
  const D = wearDays(); const C = await checkins();
  const rows = CHALLENGES.map((c) => {
    const st = s.joined[c.id]; if (!st) return { c, joined: false, badge: s.badges[c.id] };
    const n = Math.min(c.goal, c.progress(st, D, C));
    const end = addDays(st, c.days - 1); const over = todayStr() > end;
    return { c, joined: true, start: st, end, n, done: n >= c.goal, failed: over && n < c.goal, daysLeft: Math.max(0, Math.round((new Date(end) - new Date(todayStr())) / 864e5)), badge: s.badges[c.id] };
  });
  // award badges
  let changed = false;
  for (const r of rows) if (r.done && !s.badges[r.c.id]) { s.badges[r.c.id] = todayStr(); r.badge = s.badges[r.c.id]; r.justWon = true; changed = true; }
  if (changed) await kvSet('challenges', s);
  return rows;
}
export async function joinChallenge(id, on = true) {
  const s = (await kvGet('challenges')) || { joined: {}, badges: {} };
  if (on) s.joined[id] = todayStr(); else delete s.joined[id];
  await kvSet('challenges', s);
}

// ---------- Wardrobe Wrapped ----------
export async function wrappedStats(year = new Date().getFullYear()) {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  let wear = state.wear.filter((w) => w.wornOn >= from && w.wornOn <= to);
  const allTime = wear.length < 10; if (allTime) wear = state.wear.slice();
  const days = new Set(wear.map((w) => w.wornOn));
  const counts = {}; for (const w of wear) counts[w.garmentId] = (counts[w.garmentId] || 0) + 1;
  const ranked = Object.entries(counts).map(([id, n]) => ({ g: garmentById(id), n })).filter((x) => x.g).sort((a, b) => b.n - a.n);
  const colorCount = {}; for (const x of ranked) { if (!['top', 'bottom', 'dress', 'outerwear'].includes(x.g.category)) continue; const c = primaryColor(x.g); colorCount[c.name] = colorCount[c.name] || { n: 0, hex: c.hex }; colorCount[c.name].n += x.n; }
  const colorTop = Object.entries(colorCount).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([name, v]) => ({ name, hex: v.hex, n: v.n }));
  const pool = activeGarments();
  const value = pool.filter((g) => g.price && wearsOf(g.id).length >= 3).map((g) => ({ g, cpw: costPerWear(g) })).sort((a, b) => a.cpw - b.cpw)[0] || null;
  const since = addDays(todayStr(), -120); const wornRecently = new Set(state.wear.filter((w) => w.wornOn >= since).map((w) => w.garmentId));
  const forgotten = pool.filter((g) => !wornRecently.has(g.id) && ['top', 'bottom', 'dress', 'outerwear'].includes(g.category)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0] || null;
  const outfits = new Set(); const byDay = wearDays(); for (const d of days) outfits.add([...(byDay.get(d) || [])].sort().join('|'));
  const C = await checkins(); const st = streakOf(C.map((c) => c.date));
  let dna = null; try { dna = styleDNA(pool); } catch { /* optional */ }
  const bought = purchases().filter((x) => x.date >= from && x.date <= to);
  return { year, allTime, wears: wear.length, days: days.size, outfits: outfits.size, top: ranked.slice(0, 3), colorTop, value, forgotten, checkins: C.length, bestStreak: st.best, dna, pieces: pool.length, bought: bought.length, spent: bought.reduce((s, x) => s + x.price, 0), name: profile().name || '' };
}
export const pieceName = garmentName;
