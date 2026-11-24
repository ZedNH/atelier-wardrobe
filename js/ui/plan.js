import { OCCASIONS, CATEGORY_LABEL } from '../enums.js';
import { state, saveSettings, garmentById, kvGet, kvSet } from '../db.js';
import { planWeek, packTrip } from '../plan.js';
import { geocode, todayStr, addDays, fmtTemp } from '../weather.js';
import { parseICS, inferOccasion } from '../context.js';
import { logWear } from '../actions.js';
import { renderOutfit } from '../preview.js';
import { myOccasions, isWeekend } from '../profile.js';
import { esc, garmentName } from '../util.js';
import { $, $$, toast, hydrateImages, select, chips, seg, bindChips, emptyState, icon, pageHead } from './dom.js';
import { wxIcon } from './icons.js';
const wxs = (w) => (w ? `${icon(wxIcon(w.code), 14)} ${fmtTemp(w.feels)}` : '');

const P = { tab: 'week', occ: {}, locked: {}, trip: { nights: 4, cap: 14, mix: { casual: 1, work: 0, business: 0, cocktail: 0, formal: 0, active: 0 }, start: addDays(todayStr(), 7), loc: null } };

export async function render(view, r) {
  const t0 = r?.query?.get('tab'); if (t0 && ['week', 'trip', 'cal'].includes(t0)) P.tab = t0;
  view.innerHTML = `${pageHead('Look ahead', 'Plan', 'A no-repeat week, a minimal packing list, and outfits matched to your calendar.')}${seg('tab', [['week', `${icon('calendar', 16)} Week`], ['trip', `${icon('suitcase', 16)} Trip packing`], ['cal', `${icon('book', 16)} Calendar`]], P.tab)}<div id="pbox" class="mt2"></div>`;
  bindChips(view, 'tab', (t) => { P.tab = t; show(); });
  const show = () => ({ week, trip, cal: calendar })[P.tab]($('#pbox', view));
  show();
}

async function week(box) {
  const start = todayStr();
  const days = [...Array(7)].map((_, i) => addDays(start, i));
  const evOcc = (d) => (state.settings.events || []).find((e) => e.date === d)?.occasion;
  for (const d of days) if (!P.occ[d]) { const wd = new Date(d + 'T12:00:00').getDay(); P.occ[d] = evOcc(d) || (isWeekend(wd) ? 'casual' : 'work'); }
  const saved = await kvGet('weekPlan');
  box.innerHTML = `<div class="card"><p class="small muted">A no-repeat week: tops and bottoms aren’t repeated within ${state.settings.noRepeatDays ?? 5} days, laundry is simulated (items get dirty as you wear them and reset on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][state.settings.laundryDay ?? 0]}, your laundry day), and the forecast is used where available.</p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${days.map((d) => `<label class="f">${new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}${select('o' + d, myOccasions().map(([k, o]) => [k, o.label]), P.occ[d], `data-d="${d}"`)}</label>`).join('')}</div>
    <div class="row mt"><button class="btn primary" id="gen">Plan my week</button>${saved ? '<span class="small muted">Showing your last plan</span>' : ''}</div></div><div id="wk" class="mt"></div>`;
  $$('[data-d]', box).forEach((s) => s.onchange = () => { P.occ[s.dataset.d] = s.value; });
  const draw = async (plan) => {
    const wk = $('#wk', box); wk.innerHTML = '';
    for (const p of plan) {
      const items = p.items.map((x) => (typeof x === 'string' ? garmentById(x) : garmentById(x.id) || x)).filter(Boolean);
      const el = document.createElement('div'); el.className = 'card day';
      const c = items.length ? await renderOutfit(items, { size: 300 }) : document.createElement('div');
      el.appendChild(c);
      el.insertAdjacentHTML('beforeend', `<div><div class="row between"><span><span class="daynum">${new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })}</span> <span class="small muted">${new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></span><span class="pill">${OCCASIONS[p.occasion].label}</span></div>
        <p class="small muted">${p.weather ? `${wxs(p.weather)} · ${icon('drop', 12)} ${Math.round(p.weather.rainProb)}%` : 'no forecast'}</p>
        <p class="small">${items.length ? items.map((g) => esc(garmentName(g))).join(' · ') : esc(p.rationale || 'No outfit possible')}</p>
        <div class="row"><label class="small row"><input type="checkbox" data-lock="${p.date}" ${P.locked[p.date] ? 'checked' : ''}> lock</label>${p.date === todayStr() && items.length ? '<button class="btn small primary" data-wear>Wear today</button>' : ''}</div></div>`);
      const lk = el.querySelector('[data-lock]'); lk.onchange = () => { if (lk.checked) P.locked[p.date] = items.map((g) => g.id); else delete P.locked[p.date]; };
      const w = el.querySelector('[data-wear]'); if (w) w.onclick = async () => { await logWear(items, { ctx: { occasion: p.occasion, date: p.date, weather: p.weather } }); w.disabled = true; w.textContent = 'Logged'; };
      wk.appendChild(el);
    }
  };
  $('#gen', box).onclick = async () => {
    $('#wk', box).innerHTML = '<span class="spinner sm"></span> Planning…';
    const plan = await planWeek({ start, occasions: days.map((d) => P.occ[d]), locked: P.locked });
    await kvSet('weekPlan', plan.map((p) => ({ ...p, items: p.items.map((g) => g.id) })));
    draw(plan);
  };
  if (saved && saved[0]?.date >= addDays(start, -6)) draw(saved.filter((p) => p.date >= start));
}

async function trip(box) {
  const t = P.trip;
  box.innerHTML = `<div class="card"><p class="small muted">Finds the smallest set of your clothes that covers every day and occasion, using the destination’s forecast (up to 16 days ahead) and a carry-on item cap.</p>
    <form class="form" id="tf">
      <label class="f" style="grid-column:span 2">Destination<div class="row nowrap"><input name="dest" placeholder="City" value="${esc(t.loc?.name || '')}" class="grow"><button type="button" class="btn small" id="find">Find</button></div></label>
      <label class="f">Start date<input type="date" name="start" value="${t.start}"></label>
      <label class="f">Nights<input type="number" name="nights" min="0" max="21" value="${t.nights}"></label>
      <label class="f">Item cap<input type="number" name="cap" min="3" max="60" value="${t.cap}"></label>
    </form>
    <p class="small mt"><b>Outfits needed per day</b></p>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${Object.keys(t.mix).map((k) => `<label class="f">${OCCASIONS[k].label}<input type="number" min="0" max="3" value="${t.mix[k]}" data-mix="${k}"></label>`).join('')}</div>
    <div id="geo" class="small mt"></div>
    <div class="row mt"><button class="btn primary" id="pack">Pack for me</button></div></div><div id="tout" class="mt"></div>`;
  const f = $('#tf', box);
  $('#find', box).onclick = async () => {
    const g = $('#geo', box); g.textContent = 'Searching…';
    try {
      const r = await geocode(f.dest.value);
      g.innerHTML = r.length ? r.map((x, i) => `<button class="chip" data-i="${i}">${esc(x.name)}</button>`).join(' ') : 'No match';
      $$('[data-i]', g).forEach((b) => b.onclick = () => { t.loc = r[+b.dataset.i]; f.dest.value = t.loc.name; g.innerHTML = `${icon('pin', 14)} ${esc(t.loc.name)}`; });
    } catch { g.textContent = 'Search needs an internet connection.'; }
  };
  $('#pack', box).onclick = async () => {
    t.start = f.start.value || t.start; t.nights = +f.nights.value; t.cap = +f.cap.value;
    $$('[data-mix]', box).forEach((i) => { t.mix[i.dataset.mix] = +i.value || 0; });
    if (!Object.values(t.mix).some((v) => v > 0)) return toast('Add at least one outfit per day');
    const out = $('#tout', box); out.innerHTML = '<span class="spinner sm"></span> Solving…';
    await new Promise((r) => setTimeout(r, 30));
    const r = await packTrip({ loc: t.loc, start: t.start, nights: t.nights, occasionMix: t.mix, cap: t.cap });
    const byCat = {}; for (const g of r.packed) (byCat[g.category] ||= []).push(g);
    const checks = (await kvGet('packChecks')) || {};
    out.innerHTML = `<div class="card"><h2>Packing list · ${r.packed.length} items</h2>
      <p class="small">${r.covered}/${r.total} outfits covered${r.overCap ? ` <span class="pill warn">over your cap of ${t.cap} — not possible with fewer</span>` : ` <span class="pill good">within cap</span>`}${r.forecast ? ' · forecast used' : t.loc ? ' · dates beyond the 16-day forecast, weather ignored' : ' · no destination, weather ignored'}</p>
      <div class="checklist">${Object.entries(byCat).map(([c, gs]) => `<p class="small muted mt"><b>${CATEGORY_LABEL[c]}</b></p>${gs.map((g) => `<label><input type="checkbox" data-c="${g.id}" ${checks[g.id] ? 'checked' : ''}><img data-key="${g.cutout}" style="width:36px;height:36px;object-fit:contain" alt="">${esc(garmentName(g))}</label>`).join('')}`).join('')}</div></div>
      <div class="card"><h2>The outfit plan it guarantees</h2><div id="tplan"></div></div>`;
    hydrateImages(out);
    $$('[data-c]', out).forEach((cb) => cb.onchange = async () => { checks[cb.dataset.c] = cb.checked; await kvSet('packChecks', checks); });
    const tp = $('#tplan', out);
    for (const p of r.plan) {
      const el = document.createElement('div'); el.className = 'day mt';
      el.appendChild(p.items.length ? await renderOutfit(p.items, { size: 260 }) : document.createElement('div'));
      el.insertAdjacentHTML('beforeend', `<div><b>${new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b> · ${OCCASIONS[p.occasion].label}<p class="small muted">${wxs(p.weather)}</p><p class="small">${p.items.map((g) => esc(garmentName(g))).join(' · ') || 'Not coverable'}</p></div>`);
      tp.appendChild(el);
    }
  };
}

function calendar(box) {
  const evs = (state.settings.events || []).filter((e) => e.date >= todayStr()).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  box.innerHTML = `<div class="card"><p class="small muted">Import your calendar as an <b>.ics</b> file (Google Calendar: Settings → Import & export → Export; Outlook/Apple: export or “Save as”). Titles are read on this device to infer dress codes — “Client review” → Business, “Gym” → Active. Nothing is uploaded.</p>
    <div class="row"><label class="btn primary">${icon('upload', 16)} Import .ics<input type="file" accept=".ics,text/calendar" hidden id="ics"></label>
    <form id="addEv" class="row"><input name="t" placeholder="Add event, e.g. Client pitch"><input name="d" type="date" value="${todayStr()}"><button class="btn">Add</button></form></div></div>
    <div class="card"><h2>Upcoming</h2>${evs.length ? `<div class="list">${evs.slice(0, 60).map((e) => `<div class="li"><div class="grow"><b>${esc(e.title)}</b><div class="tiny muted">${esc(e.date)} ${esc(e.time || '')} · ${esc(e.why || '')}</div></div>${select('ev', myOccasions().map(([k, o]) => [k, o.label]), e.occasion, `data-ev="${esc(e.id)}"`)}</div>`).join('')}</div>
      <div class="row mt"><button class="btn small danger" id="clearEv">Clear events</button></div>` : '<p class="muted small">No upcoming events. Today and Plan will use them automatically once imported.</p>'}</div>`;
  $('#ics', box).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const list = parseICS(await f.text()).filter((x) => x.date >= addDays(todayStr(), -1) && x.date <= addDays(todayStr(), 90));
    const byId = new Map((state.settings.events || []).map((x) => [x.id, x]));
    for (const x of list) byId.set(x.id, x);
    await saveSettings({ events: [...byId.values()] });
    toast(`Imported ${list.length} upcoming events`); calendar(box);
  };
  $('#addEv', box).onsubmit = async (e) => {
    e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return;
    const inf = inferOccasion(t);
    await saveSettings({ events: [...(state.settings.events || []), { id: 'm' + Date.now(), title: t, date: e.target.d.value, time: null, occasion: inf.occasion, why: inf.why }] });
    calendar(box);
  };
  $$('[data-ev]', box).forEach((s) => s.onchange = async () => { const ev = state.settings.events.find((x) => x.id === s.dataset.ev); ev.occasion = s.value; ev.why = 'set by you'; await saveSettings({ events: state.settings.events }); toast('Updated'); });
  const ce = $('#clearEv', box); if (ce) ce.onclick = async () => { await saveSettings({ events: [] }); calendar(box); };
}
