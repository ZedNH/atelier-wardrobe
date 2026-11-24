import { OCCASIONS, MIN_WARDROBE } from '../enums.js';
import { state, activeGarments, saveSettings, garmentById, del } from '../db.js';
import { recommend, outfitKey, WEIGHT_LABEL, weights, needsLayer } from '../recommender.js';
import { weatherFor, manualWeather, todayStr, addDays, fmtTemp } from '../weather.js';
import { recordSuggestion, feedback, logWear, saveManualOutfit } from '../actions.js';
import { renderOutfit, shareOutfit } from '../preview.js';
import { parseRequest, eventsOn } from '../context.js';
import { profile } from '../profile.js';
import { myOccasions, isWeekend } from '../profile.js';
import { esc, garmentName } from '../util.js';
import { $, $$, toast, chips, seg, bindChips, bar, emptyState, icon, ring, haptic, watchLook, hydrateImages } from './dom.js';
import { wxIcon } from './icons.js';
import { laundryModal } from './closet.js';
import { env, isInstalled } from '../install.js';

const S = { date: null, occasion: null, mustInclude: [], tempShift: 0, rainOverride: null, ignoreWeather: false, notes: [], manualTemp: 20, seen: new Set(), eventTitle: null };
const HARM = { 'neutral-anchored': 'Neutral-anchored', neutral: 'All neutrals', monochrome: 'Tonal', analogous: 'Analogous', complementary: 'Complementary', triadic: 'Color mix', contentious: 'Daring pair', single: 'One piece' };

function defaultOccasion(date) {
  const ev = eventsOn(date)[0];
  if (ev) { S.eventTitle = ev.title; return ev.occasion; }
  const d = new Date(date + 'T12:00:00').getDay();
  return isWeekend(d) ? 'casual' : 'work';
}

export async function render(view, r) {
  const around = r.query.get('around');
  if (around) { S.mustInclude = [around]; S.seen = new Set(); }
  const q0 = r.query.get('q');
  if (!S.date || (S.date < todayStr())) S.date = todayStr();
  if (!S.occasion) S.occasion = defaultOccasion(S.date);
  if (q0) applyAsk(q0);
  const pool = activeGarments();
  const pending = state.garments.filter((g) => g.needsReview && g.status === 'active').length;
  const counts = { top: pool.filter((g) => g.category === 'top' || g.category === 'dress').length, bottom: pool.filter((g) => g.category === 'bottom' || g.category === 'dress').length, footwear: pool.filter((g) => g.category === 'footwear').length };
  const enough = counts.top >= MIN_WARDROBE.top && counts.bottom >= MIN_WARDROBE.bottom && counts.footwear >= MIN_WARDROBE.footwear;
  const hour = new Date().getHours();
  if (state.settings.lastOpen !== todayStr()) saveSettings({ lastOpen: todayStr() });
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = profile().name;
  const loggedToday = state.wear.some((w) => w.wornOn === todayStr());
  const events = eventsOn(S.date);
  const laundryN = state.garments.filter((g) => g.status === 'active' && ['dirty', 'washing'].includes(g.laundry?.state)).length;
  const p = profile();

  view.innerHTML = `
    <section class="hero">
      <div><p class="eyebrow">${new Date(S.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>${greeting}${name ? `,<br><em>${esc(name)}</em>` : ''}</h1>
        <p class="lede">${enough ? `Three looks from your own closet, chosen for ${esc(OCCASIONS[S.occasion].label.toLowerCase())}${p.seasonName ? `, your ${esc(p.seasonName)} colors` : ''} and today’s weather.` : 'Let’s get your closet ready — a few more pieces and your first looks appear here.'}</p></div>
      <div class="wxbox" id="wxCard"><div class="row"><div class="spinner sm"></div><span class="muted small">Checking the weather…</span></div></div>
    </section>
    ${pending ? `<a class="banner" href="#/review"><span class="row nowrap">${icon('search', 18)}<span><b>${pending}</b> new item${pending > 1 ? 's' : ''} waiting for a quick check</span></span><span class="btn small primary">Review</span></a>` : ''}
    ${hour >= 18 && !loggedToday && S.date === todayStr() && enough ? `<a class="banner" href="#/builder?log=1"><span class="row nowrap">${icon('pen', 18)}<span><b>What did you wear today?</b> Logging it is the strongest learning signal.</span></span><span class="btn small">Log outfit</span></a>` : ''}
    ${showInstallBanner() ? `<div class="banner" id="instBanner"><span class="row nowrap">${icon('phone', 18)}<span><b>Install Atelier on your phone</b> — full-screen, offline, one tap from your home screen.</span></span><span class="row nowrap"><button class="btn small primary" id="instGo">Install</button><button class="btn small ghost icon" id="instX" aria-label="Dismiss">${icon('x', 14)}</button></span></div>` : ''}
    ${needsBackup() ? `<a class="banner" href="#/settings?backup=1"><span class="row nowrap">${icon('refresh', 18)}<span><b>Back up your wardrobe</b> — ${state.settings.lastBackup ? 'it’s been a while' : 'you haven’t backed up yet'}. One tap to Google Drive.</span></span><span class="btn small">Back up</span></a>` : ''}
    ${!p.gender ? `<a class="banner" href="#/profile"><span class="row nowrap">${icon('user', 18)}<span><b>Complete your style profile</b> — gender, body shape and colors make every look more flattering.</span></span><span class="btn small primary">Start</span></a>` : ''}
    <div class="qa">
      <a href="#/stylist">${icon('sparkles', 20)}<span>Ask stylist<small>Chat about any outfit</small></span></a>
      <a href="#/builder">${icon('layers', 20)}<span>Build a look<small>Mix it yourself</small></span></a>
      <a href="#/plan">${icon('calendar', 20)}<span>Plan week<small>No repeats</small></span></a>
      <a href="#/plan?tab=trip">${icon('suitcase', 20)}<span>Pack a trip<small>Fewest items</small></span></a>
      <a href="#/tryon">${icon('figure', 20)}<span>Try-On<small>See it on you</small></span></a>
      <a href="#/tryon?tab=rate">${icon('target', 20)}<span>Rate my look<small>Mirror photo</small></span></a>
      <a href="#/shop">${icon('bag', 20)}<span>Should I buy?<small>Check before you buy</small></span></a>
      <a href="#/declutter">${icon('leaf', 20)}<span>Declutter<small>Sell, donate, keep</small></span></a>
      <a href="#/insights">${icon('chart', 20)}<span>Insights<small>Gaps & value</small></span></a>
      <a href="#/me?s=lookbook">${icon('book', 20)}<span>Lookbook<small>Saved looks</small></span></a>
      <button id="qaLaundry">${icon('laundry', 20)}<span>Laundry<small>${laundryN ? laundryN + ' in the basket' : 'All clean'}</small></span></button>
    </div>
    ${!enough ? progressCard(counts) : ''}
    <section class="section">
      <div class="ctx">
        <div class="row between">${seg('date', [[todayStr(), 'Today'], [addDays(todayStr(), 1), 'Tomorrow'], [addDays(todayStr(), 2), new Date(addDays(todayStr(), 2) + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })]], S.date)}</div>
        ${chips('occ', myOccasions().map(([k, o]) => [k, o.label]), S.occasion)}
        ${events.length ? `<div class="row">${events.map((e) => `<button class="chip ev" data-occ="${e.occasion}">${icon('calendar', 14)} ${e.time ? esc(e.time) + ' · ' : ''}${esc(e.title)} → ${OCCASIONS[e.occasion].label}</button>`).join('')}</div>` : ''}
        <form class="ask" id="ask">${icon('sparkles', 18)}<input name="q" placeholder="Describe your day — “dinner, then somewhere cold”" autocomplete="off"><button class="btn small primary">Style me</button></form>
        <div id="ctxNotes" class="ctx-notes"></div>
      </div>
    </section>
    <section class="section">
      <div class="section-h"><div><p class="eyebrow">Curated for you</p><h2>Today’s looks</h2></div><div class="row"><div class="seg" data-chips="vmode">${[['flatlay', 'Flat-lay'], ['mannequin', 'Mannequin']].map(([v, l]) => `<button class="chip ${(state.settings.view || 'flatlay') === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div><button class="btn small" id="reshuffle">${icon('refresh', 16)} Reshuffle</button></div></div>
      <div id="outfits" class="looks">${'<div class="skeleton"></div>'.repeat(3)}</div>
    </section>
    ${enough ? `<section class="section card" id="buyTeaser"><div class="card-h"><h2>${icon('bag', 18)} What to buy next</h2><a class="btn small" href="#/shop">See all</a></div><p class="small muted" style="margin-top:0">One new piece that would unlock the most new outfits with what you already own.</p><div class="bb-grid" id="buyList"><div class="skeleton" style="height:120px"></div></div><a class="btn block mt" href="#/shop">${icon('image', 16)} Check something you want to buy</a></section>` : ''}`;
  if (enough) setTimeout(() => buyTeaser(view), 1500); // after the looks, in the background

  bindChips(view, 'date', (v) => { S.date = v; S.occasion = defaultOccasion(v); S.seen = new Set(); render(view, { query: new URLSearchParams() }); });
  bindChips(view, 'occ', (v) => { S.occasion = v; S.seen = new Set(); refresh(); });
  bindChips(view, 'vmode', async (v) => { await saveSettings({ view: v }); refresh(); });
  $$('.ev', view).forEach((b) => b.addEventListener('click', () => { S.occasion = b.dataset.occ; S.seen = new Set(); render(view, { query: new URLSearchParams() }); }));
  const ig = $('#instGo', view); if (ig) ig.onclick = async () => (await import('./installui.js')).openInstall();
  const ix = $('#instX', view); if (ix) ix.onclick = () => { try { localStorage.setItem('installBannerOff', '1'); } catch { /* ignore */ } $('#instBanner', view).remove(); };
  $('#qaLaundry', view).onclick =() => laundryModal(() => render(view, { query: new URLSearchParams() }));
  $('#ask', view).addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim(); if (!q) return;
    const n = applyAsk(q);
    render(view, { query: new URLSearchParams() });
    if (!n) toast('No specific hints found — showing your usual picks.');
  });
  $('#reshuffle', view).onclick = () => refresh(true);
  renderNotes();
  const wx = await loadWeather(view);
  S._wx = wx;
  if (enough || pool.length >= 4) refresh(false);
  else $('#outfits', view).innerHTML = `<div style="grid-column:1/-1">${emptyState('shirt', 'Add a few more clothes', 'About 5 tops, 3 bottoms and 2 pairs of shoes are needed for a sensible suggestion. Below that I’d rather say so than show weak outfits.', `<div class="row center"><a class="btn primary" href="#/add">${icon('plus', 16)} Add clothes</a><a class="btn" href="#/settings?demo=1">Try the demo wardrobe</a></div>`)}</div>`;

  function renderNotes() {
    const box = $('#ctxNotes', view); const bits = [];
    if (S.eventTitle && S.occasion === defaultOccasion(S.date)) bits.push(`<span class="pill">${icon('calendar', 12)} ${esc(S.eventTitle)}</span>`);
    for (const n of S.notes) bits.push(`<span class="pill accent">${esc(n)}</span>`);
    for (const id of S.mustInclude) { const g = garmentById(id); if (g) bits.push(`<span class="pill good">Built around: ${esc(garmentName(g))} <button class="btn ghost small icon" data-unmust="${id}" style="min-height:20px;width:20px" aria-label="Remove">${icon('x', 12)}</button></span>`); }
    if (bits.length) bits.push(`<button class="btn small ghost" id="clearCtx">Clear</button>`);
    box.innerHTML = bits.join(' ');
    $$('[data-unmust]', box).forEach((b) => b.onclick = () => { S.mustInclude = S.mustInclude.filter((x) => x !== b.dataset.unmust); S.seen = new Set(); renderNotes(); refresh(); });
    const c = $('#clearCtx', box); if (c) c.onclick = () => { Object.assign(S, { mustInclude: [], tempShift: 0, rainOverride: null, ignoreWeather: false, notes: [] }); S.seen = new Set(); history.replaceState(null, '', '#/today'); render(view, { query: new URLSearchParams() }); };
  }

  function ctxObj() {
    let weather = S._wx ? { ...S._wx } : null;
    if (weather && S.tempShift) { weather.feels += S.tempShift; weather.morning += S.tempShift; weather.evening += S.tempShift; }
    if (weather && S.rainOverride != null) weather.rainProb = S.rainOverride;
    return { occasion: S.occasion, date: S.date, weather, ignoreWeather: S.ignoreWeather, mustInclude: S.mustInclude, count: 3, explore: state.settings.explore !== false, excludeCombos: S.seen };
  }

  async function refresh(reshuffle = false) {
    const box = $('#outfits', view); if (!box) return;
    if (!reshuffle) S.seen = new Set();
    const ctx = ctxObj();
    const res = recommend(ctx);
    if (!res.outfits.length) { box.innerHTML = `<div style="grid-column:1/-1">${emptyState('info', 'No outfit fits these constraints', esc(res.reason || ''), `<a class="btn" href="#/closet">Check your closet & laundry</a>`)}</div>`; return; }
    box.innerHTML = '';
    let n = 0;
    for (const o of res.outfits) {
      S.seen.add(outfitKey(o.items));
      const row = await recordSuggestion(o, ctx);
      box.appendChild(await outfitCard(o, row, ctx, () => replaceCard, ++n));
    }
    async function replaceCard(cardEl) {
      const r2 = recommend({ ...ctxObj(), count: 1, explore: false });
      if (!r2.outfits.length) { cardEl.remove(); toast('No more distinct outfits for this context.'); return; }
      const o = r2.outfits[0]; S.seen.add(outfitKey(o.items));
      const row = await recordSuggestion(o, ctx);
      cardEl.replaceWith(await outfitCard(o, row, ctxObj(), () => replaceCard, cardEl.dataset.n));
    }
  }
}

function needsBackup() {
  const own = state.garments.filter((g) => !g.demo).length;
  const last = state.settings.lastBackup || 0;
  return own >= 10 && Date.now() - last > 14 * 864e5;
}

function showInstallBanner() {
  let off = false; try { off = localStorage.getItem('installBannerOff') === '1'; } catch { /* ignore */ }
  return env.mobile && !isInstalled() && !off;
}

function applyAsk(q) {
  const { ctx, notes } = parseRequest(q, {});
  Object.assign(S, { tempShift: ctx.tempShift || 0, rainOverride: ctx.rainOverride ?? null, ignoreWeather: !!ctx.ignoreWeather, notes });
  if (ctx.occasion) S.occasion = ctx.occasion;
  if (ctx.date) S.date = ctx.date;
  if (ctx.mustInclude) S.mustInclude = ctx.mustInclude;
  S.seen = new Set();
  return notes.length + (ctx.mustInclude ? 1 : 0);
}

function progressCard(c) {
  const line = (label, n, need) => `<div><div class="row between small"><span>${label}</span><b>${Math.min(n, need)}/${need}</b></div>${bar(n / need)}</div>`;
  return `<div class="card mt progress-meter"><div class="card-h"><h2>${icon('shirt', 18)} Starter set</h2></div>
    ${line('Tops (or dresses)', c.top, MIN_WARDROBE.top)}${line('Bottoms (or dresses)', c.bottom, MIN_WARDROBE.bottom)}${line('Pairs of shoes', c.footwear, MIN_WARDROBE.footwear)}
    <div class="row mt"><a class="btn primary small" href="#/add">${icon('camera', 16)} Add clothes</a><a class="btn small" href="#/settings?demo=1">Load demo wardrobe</a></div></div>`;
}

async function loadWeather(view) {
  const card = $('#wxCard', view);
  const loc = state.settings.location;
  let wx = null, err = null;
  if (loc) { try { wx = await weatherFor(S.date); } catch (e) { err = e; } }
  if (!wx) {
    wx = manualWeather(S.manualTemp, S.manualRain || 0);
    card.innerHTML = `<div class="wx-top">${icon('thermo', 38)}<div><div class="wx-t">${fmtTemp(S.manualTemp)}</div><div class="small muted">${loc ? (err ? 'Offline — manual temperature' : 'No forecast for this date') : 'No location — manual temperature'}</div></div></div>
      <input type="range" min="-15" max="40" value="${S.manualTemp}" id="mt" aria-label="Temperature">
      <div class="row between"><label class="small row"><input type="checkbox" id="mr" ${S.manualRain ? 'checked' : ''}> Rain expected</label>${loc ? '' : `<a class="btn small" href="#/settings">${icon('pin', 14)} Set location</a>`}</div>`;
    $('#mt', card).addEventListener('change', (e) => { S.manualTemp = +e.target.value; render(view, { query: new URLSearchParams() }); });
    $('#mr', card).addEventListener('change', (e) => { S.manualRain = e.target.checked ? 80 : 0; render(view, { query: new URLSearchParams() }); });
    return wx;
  }
  const layer = needsLayer(wx);
  card.innerHTML = `<div class="wx-top">${icon(wxIcon(wx.code), 42)}<div><div class="wx-t">${fmtTemp(wx.feels)}</div><div class="small muted">feels like · ${esc(wx.desc)} · ${esc(loc.name.split(',')[0])}</div></div></div>
    <div class="wx-arc"><span>${fmtTemp(wx.morning)} am</span><div class="track"></div><span>${fmtTemp(wx.evening)} pm</span></div>
    <div class="wx-meta"><span class="pill">${icon('drop', 12)} ${Math.round(wx.rainProb)}% rain</span><span class="pill">${icon('wind', 12)} ${Math.round(wx.wind)} km/h</span>${wx.humidity != null ? `<span class="pill ${wx.humidity >= 75 ? 'warn' : ''}">${icon('drop', 12)} ${Math.round(wx.humidity)}% humid</span>` : ''}${layer.recommended ? `<span class="pill accent">${icon('layers', 12)} bring a layer</span>` : ''}${wx.rainProb >= 50 ? `<span class="pill warn">${icon('umbrella', 12)} umbrella</span>` : ''}</div>`;
  return wx;
}

export async function outfitCard(o, row, ctx, getReplace, n = 1) {
  const el = document.createElement('article'); el.className = 'card look'; el.dataset.n = n;
  watchLook(el, o.items, `Look ${String(n).padStart(2, '0')} · Today`);
  const canvas = await renderOutfit(o.items, { size: 640, mode: state.settings.view });
  canvas.className = 'ocanvas';
  const media = document.createElement('div'); media.className = 'media'; media.appendChild(canvas);
  const wxChip = ctx.weather && !ctx.ignoreWeather ? `<span class="glass">${icon(wxIcon(ctx.weather.code), 14)} ${fmtTemp(ctx.weather.feels)}</span>` : '';
  media.insertAdjacentHTML('beforeend', `<div class="ov"><div class="ring">${ring(o.total, 44, '#b4532a')}<b>${Math.round(o.total * 100)}</b></div><button class="save-btn" data-a="save" aria-label="Save to lookbook" title="Save to lookbook">${icon('heart', 20)}</button></div>
    <div class="ov-b">${wxChip}${o.stretch ? `<span class="minibadge">${icon('sparkles', 12)} Stretch pick</span>` : ''}</div>`);
  el.appendChild(media);
  const W = weights();
  const tags = [HARM[o.harmonyClass] ? `<span class="pill">${HARM[o.harmonyClass]}</span>` : '', `<span class="pill">${OCCASIONS[ctx.occasion]?.label || ''}</span>`, o.parts.flattering >= 0.8 ? `<span class="pill good">${icon('check', 12)} Flatters you</span>` : ''].join('');
  el.insertAdjacentHTML('beforeend', `<div class="ob">
    <div class="lt"><span class="n">Look ${String(n).padStart(2, '0')}</span><span class="tiny faint">${o.items.length} pieces</span></div>
    <div class="why">${esc(o.rationale)}</div>
    ${o.flatterNotes?.length ? `<div class="flatter">${icon('figure', 14)}<span><b>Why it flatters you:</b> ${o.flatterNotes.map(esc).join('; ')}.</span></div>` : ''}
    <div class="tags">${tags}</div>
    <details><summary>Why this score ${icon('chevDown', 14)}</summary><div class="score-k mt">${Object.keys(W).map((k) => `<span>${WEIGHT_LABEL[k]}</span>${bar(o.parts[k])}<span class="tiny faint">${Math.round((o.parts[k] ?? 0) * 100)}</span>`).join('')}</div>
      <p class="tiny faint mt">${o.items.map((g) => esc(garmentName(g))).join(' · ')}</p></details>
    <div class="acts"><button class="btn primary" data-a="wear">${icon('check', 16)} Wear this</button><button class="btn icon" data-a="like" title="More like this" aria-label="Like">${icon('up', 18)}</button><button class="btn icon" data-a="dislike" title="Less like this" aria-label="Dislike">${icon('down', 18)}</button><button class="btn icon" data-a="skip" title="Show another" aria-label="Show another">${icon('refresh', 18)}</button><a class="btn icon" href="#/tryon?items=${o.items.map((g) => g.id).join(',')}" title="Try on with my photo" aria-label="Try on">${icon('figure', 18)}</a><button class="btn icon" data-a="share" title="Share image" aria-label="Share">${icon('share', 18)}</button></div></div>`);
  let savedRow = null;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a;
    haptic(a === 'wear' || a === 'save' ? 14 : 8);
    if (a === 'wear') {
      await logWear(o.items, { ctx, fromOutfit: row, date: ctx.date });
      b.innerHTML = `${icon('check', 16)} Logged`; b.disabled = true;
      toast('Wear logged — laundry, novelty and your profile are updated.');
    } else if (a === 'save') {
      if (savedRow) { await del('outfits', savedRow.id); state.outfits = state.outfits.filter((x) => x.id !== savedRow.id); savedRow = null; b.classList.remove('on'); b.innerHTML = icon('heart', 20); toast('Removed from lookbook'); }
      else { savedRow = await saveManualOutfit(o.items, `${OCCASIONS[ctx.occasion]?.label || 'My'} look`, o.features, ctx); b.classList.add('on'); b.innerHTML = icon('heartFill', 20); toast('Saved to your lookbook'); }
    } else if (a === 'like') { await feedback(row, 'liked', o.items); b.disabled = true; toast('Noted — more like this.'); }
    else if (a === 'dislike') { await feedback(row, 'disliked', o.items); toast('Got it — less like this.'); getReplace()(el); }
    else if (a === 'skip') { await feedback(row, 'dismissed', o.items); getReplace()(el); }
    else if (a === 'share') { const r = await shareOutfit(o.items, { caption: o.rationale, mode: state.settings.view, chip: ctx.weather ? fmtTemp(ctx.weather.feels) : null }); if (r === 'downloaded') toast('Outfit card saved as an image.'); }
  });
  return el;
}

// "What to buy next": the top 3 pieces that would unlock the most outfits (full list on the Shop page)
async function buyTeaser(view) {
  const box = view.querySelector('#buyList'); if (!box || !box.isConnected) return;
  try {
    const [{ bestBuys }, { bestBuyCard }] = await Promise.all([import('../insights.js'), import('./shop.js')]);
    const res = await bestBuys({ limit: 3 });
    if (!box.isConnected) return;
    if (!res.list.length) { box.closest('section')?.remove(); return; }
    box.innerHTML = res.list.map(bestBuyCard).join('');
    hydrateImages(box);
  } catch (e) { console.warn(e); box.closest('section')?.remove(); }
}
