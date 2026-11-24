// Declutter & resell: decide sell / donate / try-again / keep for every piece from real wear data,
// estimate resale value, and run a 30-wears challenge. All rules are transparent — each item says why.
import { state, activeGarments, saveSettings } from './db.js';
import { lastWornMap, quickPair } from './recommender.js';
import { OCCASIONS } from './enums.js';
import { primaryColor, deltaE } from './color.js';
import { profile, colorFit, myRegion } from './profile.js';
import { wearsOf } from './actions.js';
import { todayStr } from './weather.js';
import { DAY, garmentName } from './util.js';

const RESALE = (wears) => (wears === 0 ? 0.55 : wears <= 5 ? 0.45 : wears <= 15 ? 0.32 : 0.2);

export function declutterPlan() {
  const pool = activeGarments();
  const lw = lastWornMap(); const ref = new Date(todayStr()).getTime();
  const prices = pool.map((g) => g.price).filter(Boolean).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const keepUntil = state.settings.declutterKeep || {};
  const p = profile();
  const rows = pool.filter((g) => ['top', 'bottom', 'dress', 'outerwear', 'footwear'].includes(g.category)).map((g) => {
    const wears = wearsOf(g.id).length;
    const last = lw.get(g.id);
    const owned = Math.max(1, Math.round((Date.now() - (g.createdAt || Date.now())) / DAY));
    const idle = last ? Math.round((ref - new Date(last).getTime()) / DAY) : owned;
    const partnerCat = g.category === 'top' ? ['bottom'] : g.category === 'bottom' ? ['top'] : g.category === 'dress' ? ['footwear'] : ['top', 'bottom', 'dress'];
    const partners = pool.filter((x) => partnerCat.includes(x.category) && quickPair(g, x, OCCASIONS.smart_casual) >= 0.66).length;
    const twins = pool.filter((x) => x.id !== g.id && x.subtype === g.subtype && deltaE(primaryColor(x).lab, primaryColor(g).lab) < 12);
    const twinWorn = twins.some((x) => wearsOf(x.id).length > wears);
    const fit = p.season && ['top', 'dress', 'outerwear'].includes(g.category) ? colorFit(primaryColor(g).hex, p.season) : null;
    const resale = g.price ? Math.round(g.price * RESALE(wears)) : null;
    const reasons = [];
    let action = 'keep';
    const snoozed = keepUntil[g.id] && keepUntil[g.id] > Date.now();
    if (!snoozed && g.status === 'active') {
      const longIdle = idle >= 180 || (!last && owned >= 90);
      if (longIdle) {
        reasons.push(last ? `not worn for ${idle} days` : `never worn in ${owned} days`);
        if (twinWorn) reasons.push(`you have ${twins.length === 1 ? 'a similar' : twins.length + ' similar'} piece you wear more`);
        if (fit?.verdict === 'avoid') reasons.push(`the color isn’t great on your ${p.seasonName} coloring`);
        if (partners <= 1) reasons.push('almost nothing in your closet goes with it');
        if (partners >= 4 && !twinWorn && fit?.verdict !== 'avoid') { action = 'try'; reasons.push(`but it makes ${partners}+ outfits — give it one more week`); }
        else action = g.price && g.price >= median * 0.8 && wears <= 15 ? 'sell' : 'donate';
      } else if (idle >= 60 && partners >= 3) { action = 'try'; reasons.push(`idle for ${idle} days but works with ${partners} pieces`); }
      else if (twinWorn && wears <= 2 && owned >= 120) { action = g.price && g.price >= median ? 'sell' : 'donate'; reasons.push('a near-duplicate of something you wear more'); }
    }
    if (action === 'keep') reasons.push(last ? `worn ${wears}× · last ${idle === 0 ? 'today' : idle + ' days ago'}` : 'new — give it time');
    return { g, action, reasons, wears, idle, partners, resale, fit, twins: twins.length };
  });
  const by = (a) => rows.filter((r) => r.action === a).sort((x, y) => (y.resale || 0) - (x.resale || 0) || y.idle - x.idle);
  const sell = by('sell'), donate = by('donate'), tryAgain = by('try'), keep = by('keep');
  const worn90 = rows.filter((r) => r.idle <= 90).length;
  return {
    sell, donate, tryAgain, keep,
    resaleTotal: sell.reduce((s, r) => s + (r.resale || 0), 0),
    utilization: rows.length ? worn90 / rows.length : 0,
    total: rows.length,
  };
}

export async function snoozeKeep(id, days = 90) {
  const k = { ...(state.settings.declutterKeep || {}), [id]: Date.now() + days * DAY };
  await saveSettings({ declutterKeep: k });
}

// ---------------- 30-wears challenge ----------------
export const challenge = () => state.settings.challenge || null;
export function suggestChallenge(n = 6) {
  const warm = myRegion() === 'sa';
  const pool = activeGarments().filter((g) => ['top', 'bottom', 'dress', 'outerwear', 'footwear'].includes(g.category) && !(warm && (g.season === 'winter' || (g.warmth || 0) >= 4)));
  return pool.map((g) => ({ g, w: wearsOf(g.id).length, p: pool.filter((x) => x.category !== g.category && quickPair(g, x, OCCASIONS.smart_casual) >= 0.66).length }))
    .filter((x) => x.w < 30 && x.p >= 2).sort((a, b) => (b.p - a.p) || (a.w - b.w)).slice(0, n).map((x) => x.g);
}
export async function startChallenge(ids) { await saveSettings({ challenge: { ids, startedAt: Date.now() } }); }
export async function stopChallenge() { await saveSettings({ challenge: null }); }
export function challengeStatus() {
  const c = challenge(); if (!c) return null;
  const items = c.ids.map((id) => state.garments.find((g) => g.id === id)).filter(Boolean).map((g) => ({ g, wears: wearsOf(g.id).length }));
  const done = items.filter((x) => x.wears >= 30).length;
  const progress = items.length ? items.reduce((s, x) => s + Math.min(30, x.wears), 0) / (items.length * 30) : 0;
  const next = items.filter((x) => x.wears < 30).sort((a, b) => a.wears - b.wears)[0] || null;
  return { items, done, progress, next, days: Math.round((Date.now() - c.startedAt) / DAY) };
}
export { garmentName };
