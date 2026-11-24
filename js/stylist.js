// Stylist chat brain: deterministic intent routing over the user's own wardrobe data. Free, offline, private.
import { OCCASIONS, CATEGORY_LABEL, SUBTYPES } from './enums.js';
import { state, activeGarments } from './db.js';
import { recommend, needsLayer, lastWornMap } from './recommender.js';
import { parseRequest } from './context.js';
import { weatherFor, manualWeather, todayStr, addDays, fmtTemp } from './weather.js';
import { gapReport, costPerWearReport, deadStock, wardrobeStats, bestBuys } from './insights.js';
import { packTrip, planWeek } from './plan.js';
import { wearsOf } from './actions.js';
import { isWeekend, myRegion } from './profile.js';
import { normalizeBangla } from './i18n.js';
import { profile, SEASONS, BODY, bodyLabel, myWear, styleDNA, VIBES, streak, colorFit } from './profile.js';
import { primaryColor } from './color.js';
import { esc, garmentName, fmtMoney, cap } from './util.js';

export const STARTERS_SA = ['Eid outfit for tomorrow', 'What to wear to a biye?', 'kal office e ki porbo?', 'Pohela Boishakh look'];
export const STARTERS = ['What should I wear today?', 'Style my navy blazer', 'Dinner date tonight, it’s cold', 'Which colors suit me?', 'Pack for 4 days', 'What should I buy next?', 'What haven’t I worn lately?', 'Surprise me'];

const STOP = new Set(['what', 'goes', 'with', 'my', 'the', 'style', 'how', 'to', 'wear', 'can', 'i', 'should', 'match', 'pair', 'a', 'an', 'and', 'for', 'outfit', 'outfits', 'ideas', 'idea', 'give', 'me', 'some', 'around', 'using', 'build', 'look', 'looks', 'please', 'would', 'this', 'that', 'it', 'on', 'of', 'in']);
export function findGarment(text) {
  const words = text.toLowerCase().replace(/[^a-z\- ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return null;
  let best = null, bs = 0;
  for (const g of activeGarments()) {
    const name = `${garmentName(g)} ${g.subtype} ${g.category} ${(g.colors || []).map((c) => c.name).join(' ')}`.toLowerCase();
    let s = 0; for (const w of words) if (name.includes(w)) s += w.length > 4 ? 1.2 : 1;
    if (g.name && words.every((w) => g.name.toLowerCase().includes(w))) s += 1;
    if (s > bs) { bs = s; best = g; }
  }
  return bs >= 1 ? best : null;
}

async function todayWx(date = todayStr()) { try { return (await weatherFor(date)) || null; } catch { return null; } }
const ul = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const link = (href, t) => `<a href="${href}">${t}</a>`;

export async function answer(text, opts = {}) {
  text = normalizeBangla(text);
  const t = text.toLowerCase().trim();
  const pool = activeGarments();
  const p = profile();
  const hasCloset = pool.length >= 6;

  if (/^(hi|hello|hey|yo|help|what can you do|start)\b/.test(t)) {
    return { html: `<p>Hi${p.name ? ' ' + esc(p.name) : ''}! I’m your stylist — I only ever suggest clothes you actually own. Ask me for an outfit for any occasion, how to style a specific piece, which colors suit you, what to pack, what to buy next, or what’s been sitting unworn.</p>`, chips: STARTERS.slice(0, 6) };
  }
  if (/colou?rs?.*(suit|for me|best|flatter)|my (colou?r )?season|palette|skin ?tone|undertone/.test(t)) {
    if (!p.season) return { html: `<p>I don’t know your coloring yet. It takes 30 seconds — answer three questions or analyze a selfie — and then every suggestion favors shades that light up your face.</p><p>${link('#/profile?step=color', 'Find my colors →')}</p>` };
    const S = SEASONS[p.season];
    const face = pool.filter((g) => ['top', 'dress', 'outerwear'].includes(g.category));
    const great = face.filter((g) => colorFit(primaryColor(g).hex, p.season).verdict === 'great');
    return { html: `<p>You’re a <b>${esc(p.seasonName)}</b>. ${esc(S.mood)} Best metal: ${esc(S.metal)}.</p><p class="small">Your best shades:</p><div class="pal-inline">${S.best.map((h) => `<span style="background:${h}"></span>`).join('')}</div><p class="small mt">Keep these away from your face:</p><div class="pal-inline">${S.avoid.map((h) => `<span style="background:${h}"></span>`).join('')}</div>${face.length ? `<p class="mt">${great.length} of your ${face.length} tops and layers are in your palette${great.length ? ` — e.g. ${great.slice(0, 3).map((g) => esc(garmentName(g))).join(', ')}` : ''}.</p>` : ''}`, chips: ['What should I wear today?', 'What should I buy next?'] };
  }
  if (/body|shape|figure|proportion|flatter|petite|tall\b/.test(t)) {
    if (!p.bodyShape) return { html: `<p>Tell me your body shape and height and I’ll favor proportions that flatter you.</p><p>${link('#/profile?step=body', 'Set my body shape →')}</p>` };
    const B = BODY[p.bodyShape];
    return { html: `<p>For a <b>${esc(bodyLabel(p.bodyShape, myWear()))}</b> shape${p.height ? ` (${p.height})` : ''}: ${esc(B.tip.toLowerCase())}.</p>${ul(B.tips.map(esc).concat(p.height === 'petite' ? ['One color head-to-toe and cropped jackets add height'] : p.height === 'tall' ? ['You can carry oversized pieces, wide trousers and bold contrast'] : []))}<p class="small muted">These rules are already part of every outfit score (“Flatters you”).</p>` };
  }
  if (/my style|style dna|archetype|what.*my style|describe my style/.test(t)) {
    if (!pool.length) return { html: '<p>Add some clothes first and I’ll read your style from them.</p>' };
    const d = styleDNA(pool);
    return { html: `<p>Your closet reads as <b>${esc(d.archetype)}</b> — mostly ${esc(VIBES[d.top[0]].label.toLowerCase())} with a ${esc(VIBES[d.top[1]].label.toLowerCase())} streak, weighted by what you actually wore in the last 90 days.</p><p>${link('#/me', 'See your Style DNA →')}</p>` };
  }
  if (/\bbuy|shop|missing|gap|should i get|need to get|invest/.test(t)) {
    if (!hasCloset) return { html: '<p>Add a few more pieces first — I need at least a handful of tops, bottoms and shoes to spot real gaps.</p>' };
    await new Promise((r) => setTimeout(r, 20));
    const res = await bestBuys({ limit: 5 });
    if (!res.list.length) return { html: '<p>Honestly? Nothing. No single piece would add many outfits — your wardrobe is well covered. The most sustainable purchase is the one you skip.</p>' };
    return { html: `<p>You can make about <b>${res.base}</b> everyday outfits now. If you buy one thing, these would unlock the most <b>new</b> outfits with clothes you already own:</p>${ul(res.list.map((r) => `<b>${esc(r.v.name)}</b> — +${r.joins} outfits${r.fit ? ` <span class="faint">· ${r.fit.verdict === 'avoid' ? 'pick a shade from your palette' : 'good color for you'}</span>` : ''}`))}<p class="small muted">${link('#/shop', 'See all best buys')} — or screenshot something you want to buy and I'll count how many outfits it unlocks.</p>`, chips: ['What haven’t I worn lately?', 'Surprise me'] };
  }
  if (/pack|trip|travel|vacation|holiday|getaway/.test(t)) {
    if (!hasCloset) return { html: '<p>I need a few more clothes in your closet before I can pack for you.</p>' };
    const m = t.match(/(\d+)\s*(day|night)/); const nights = m ? Math.max(0, +m[1] - (m[2].startsWith('day') ? 1 : 0)) : 3;
    const mix = { casual: 1 }; if (/work|business|conference|meeting/.test(t)) mix.work = 1; if (/dinner|wedding|party|gala/.test(t)) mix.cocktail = 1; if (/gym|hike|run|active/.test(t)) mix.active = 1;
    const r = await packTrip({ loc: null, start: addDays(todayStr(), 1), nights, occasionMix: mix, cap: 15 });
    const byCat = {}; for (const g of r.packed) (byCat[g.category] ||= []).push(g);
    return { html: `<p>For ${nights + 1} day${nights ? 's' : ''} (${Object.keys(mix).map((k) => OCCASIONS[k].label.toLowerCase()).join(' + ')}), pack <b>${r.packed.length} pieces</b> — they cover ${r.covered}/${r.total} outfits.</p>${ul(Object.entries(byCat).map(([c, gs]) => `<b>${CATEGORY_LABEL[c]}:</b> ${gs.map((g) => esc(garmentName(g))).join(', ')}`))}<p class="small muted">Add a destination for forecast-aware packing in ${link('#/plan?tab=trip', 'Plan → Trip')}.</p>` };
  }
  if (/\bweek\b|plan my|next 7/.test(t)) {
    if (!hasCloset) return { html: '<p>Add a few more clothes first, then I’ll plan a no-repeat week.</p>' };
    const plan = await planWeek({ start: todayStr() });
    return { html: `<p>Here’s a no-repeat week with simulated laundry:</p>${ul(plan.map((d) => `<b>${new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</b> · ${OCCASIONS[d.occasion].label}: ${d.items.length ? d.items.filter((g) => g.category !== 'accessory').map((g) => esc(garmentName(g))).join(', ') : 'no outfit possible'}`))}<p>${link('#/plan', 'Open it in Plan →')}</p>` };
  }
  if (/laundry|dirty|wash/.test(t)) {
    const l = state.garments.filter((g) => g.status === 'active' && ['dirty', 'washing'].includes(g.laundry?.state));
    return { html: l.length ? `<p>${l.length} piece${l.length > 1 ? 's are' : ' is'} out of rotation:</p>${ul(l.map((g) => `${esc(garmentName(g))} <span class="faint">(${g.laundry.state})</span>`))}<p class="small muted">I never suggest dirty or washing items.</p>` : '<p>Everything is clean — the whole closet is available.</p>' };
  }
  if (/haven.?t( i)? (been )?worn|not worn|unworn|least worn|dead stock|forgot|neglect|never worn|sitting unworn|in a while/.test(t)) {
    const d = deadStock(await todayWx(), 45);
    if (!d.items.length) return { html: '<p>Nothing has been idle for 45+ days. Great rotation.</p>' };
    return { html: `<p>These have been waiting the longest:</p>${ul(d.items.slice(0, 6).map((x) => `${link('#/closet/' + x.g.id, esc(garmentName(x.g)))} — ${x.neverWorn ? 'never worn' : `${x.idle} days`} <span class="faint">· ${esc(x.reason)}</span>`))}<p class="small">Want an outfit built around one? Try “style my ${esc(garmentName(d.items[0].g))}”.</p>`, chips: [`Style my ${garmentName(d.items[0].g)}`] };
  }
  if (/most worn|favou?rite|wear the most|go-to/.test(t)) {
    const st = wardrobeStats();
    return { html: `<p>Your most-worn pieces:</p>${ul(st.most.filter((x) => x.n).map((x) => `${link('#/closet/' + x.g.id, esc(garmentName(x.g)))} — ${x.n} wears`))}` };
  }
  if (/spent|worth|value|cost per wear|money|expensive/.test(t)) {
    const c = costPerWearReport();
    if (!c.items.length) return { html: '<p>Add prices to your garments (on each item page) and I’ll calculate value and cost per wear.</p>' };
    const best = c.items[c.items.length - 1], worst = c.items[0];
    return { html: `<p>Your priced wardrobe is worth <b>${fmtMoney(c.totalSpent)}</b>.</p>${ul([`Best value: <b>${esc(garmentName(best.g))}</b> at ${fmtMoney(best.cpw)} per wear`, `Most expensive per wear: <b>${esc(garmentName(worst.g))}</b> at ${fmtMoney(worst.cpw)} (${worst.wears} wears)`])}` };
  }
  if (/streak|how am i doing|progress|achievement/.test(t)) {
    const s = streak();
    return { html: `<p>You’re on a <b>${s}-day</b> logging streak. ${s >= 7 ? 'Brilliant.' : 'Log what you wear each day to keep it going.'}</p><p>${link('#/me', 'See all achievements →')}</p>` };
  }
  if (/weather|temperature|forecast|is it cold|is it hot|rain today/.test(t)) {
    const wx = await todayWx();
    if (!wx) return { html: `<p>I don’t have live weather — set your city in ${link('#/settings', 'Settings')}.</p>` };
    const l = needsLayer(wx);
    return { html: `<p>Feels like <b>${fmtTemp(wx.feels)}</b> (${esc(wx.desc.toLowerCase())}), ${fmtTemp(wx.morning)} in the morning and ${fmtTemp(wx.evening)} in the evening, ${Math.round(wx.rainProb)}% chance of rain.</p><p>${l.required ? 'You need a proper outer layer.' : l.recommended ? 'Bring a layer you can take off.' : 'No extra layer needed.'}${wx.rainProb >= 50 ? ' Take an umbrella and skip suede.' : ''}</p>`, chips: ['What should I wear today?'] };
  }

  // ---- outfit requests ----
  if (!hasCloset) return { html: `<p>I need a few more clothes before I can style you — about 5 tops, 3 bottoms and 2 pairs of shoes. ${link('#/add', 'Add clothes')} or ${link('#/settings?demo=1', 'load the demo wardrobe')}.</p>` };
  const surprise = /surprise|something new|different|bold|out of my comfort/.test(t);
  const pieceAsk = /(goes with|go with|style (my|the|this)|how (do|can|should) i wear|pair with|match with|what to wear with|wear with)/.test(t);
  const { ctx: pc, notes } = parseRequest(text, {});
  let must = pc.mustInclude;
  if (pieceAsk || !must) { const g = findGarment(text.replace(/.*?(goes with|go with|style|wear|pair with|match with)/i, '')); if (pieceAsk && g) must = [g.id]; }
  const date = pc.date || todayStr();
  let weather = await todayWx(date);
  if (weather && pc.tempShift) weather = { ...weather, feels: weather.feels + pc.tempShift, morning: weather.morning + pc.tempShift, evening: weather.evening + pc.tempShift };
  if (weather && pc.rainOverride != null) weather = { ...weather, rainProb: pc.rainOverride };
  if (!weather && pc.tempShift) weather = manualWeather(18 + pc.tempShift);
  const dow = new Date(date + 'T12:00:00').getDay();
  const occasion = pc.occasion || (isWeekend(dow) ? 'casual' : 'work');
  const ctx = { occasion, date, weather, ignoreWeather: !!pc.ignoreWeather, mustInclude: must || [], count: surprise ? 3 : 2, explore: true, excludeCombos: opts.exclude };
  const res = recommend(ctx);
  if (!res.outfits.length) return { html: `<p>I couldn’t build a complete outfit for that: ${esc(res.reason || 'nothing fits these constraints')}. Try another occasion or check your laundry.</p>` };
  const outs = surprise ? [res.outfits.find((o) => o.stretch) || res.outfits[res.outfits.length - 1]] : res.outfits;
  const g = must?.length ? state.garments.find((x) => x.id === must[0]) : null;
  const intro = g ? `Here’s how I’d wear your <b>${esc(garmentName(g))}</b>` : surprise ? 'Something a little different — a stretch pick from pieces you rarely combine' : `For ${esc(OCCASIONS[occasion].label.toLowerCase())}${date !== todayStr() ? ` on ${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })}` : ' today'}`;
  const ctxBits = [weather && !ctx.ignoreWeather ? `${fmtTemp(weather.feels)}${weather.rainProb >= 50 ? `, ${Math.round(weather.rainProb)}% rain` : ''}` : null, ...notes.filter((n) => !Object.values(OCCASIONS).some((o) => n.startsWith(o.label)))].filter(Boolean);
  return { html: `<p>${intro}${ctxBits.length ? ` <span class="faint">(${esc(ctxBits.join(' · '))})</span>` : ''}:</p>`, outfits: outs.map((o) => ({ o, ctx })), chips: g ? ['Show me another way', 'What should I buy next?'] : ['Make it more casual', 'Dress it up', 'Surprise me'] };
}

// Follow-ups that refine the last outfit request
export function refine(text, last) {
  const t = text.toLowerCase();
  if (!last) return null;
  if (/more casual|dress (it )?down|relax/.test(t)) return `${cap(OCCASIONS.casual.label)} version of ${last}`;
  if (/dress (it )?up|smarter|more formal|fancier/.test(t)) return `dress up ${last}`;
  if (/another|different one|other option|show me more/.test(t)) return last;
  return null;
}
export { lastWornMap, wearsOf };
