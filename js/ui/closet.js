import { CATEGORIES, CATEGORY_LABEL, SUBTYPES, subtypesOf, PATTERNS, FABRICS, SEASONS, FITS, FORMALITY_LABEL, OCCASIONS } from '../enums.js';
import { state, garmentById, saveGarment, del, imageBlob, saveImage, activeGarments } from '../db.js';
import { correctAttribute, setLaundry, washAllDirty, wearsOf, costPerWear, outfitsContaining, washLimit } from '../actions.js';
import { lastWornMap } from '../recommender.js';
import { makeColor, NAMED_COLORS, deltaE, primaryColor } from '../color.js';
import { esc, garmentName, fmtMoney, cosine, deriveWarmth, deriveSeason } from '../util.js';
import { todayStr } from '../weather.js';
import { renderOutfit } from '../preview.js';
import { fileToCanvas, canvasToBlob, cropCanvas, scaleCanvas, colorsFromCanvas } from '../vision.js';
import { cutout, retagGarment, saveThumb } from '../pipeline.js';
import * as ai from '../ai.js';
import { $, $$, toast, modal, confirmBox, hydrateImages, swatch, select, chips, seg, bindChips, emptyState, icon, pageHead } from './dom.js';
import { subtypeOptions, colorFit, profile } from '../profile.js';
import { gicon } from './icons.js';
import { careCardHtml, bindCareCard } from './care.js';
import { careHint } from '../carelabel.js';
import { go } from '../app.js';

function colorVerdict(g) {
  const p = profile(); if (!p.season || !['top', 'dress', 'outerwear', 'headwear', 'accessory'].includes(g.category)) return '';
  const f = colorFit(primaryColor(g).hex, p.season);
  const t = { great: ['good', 'check', `A great color for your ${p.seasonName} coloring`], ok: ['warn', 'info', `Workable for ${p.seasonName} — best paired with a palette shade near the face`], avoid: ['bad', 'info', `Not ideal near your face for ${p.seasonName} — wear it below the waist or under a palette layer`] }[f.verdict];
  return `<p class="mt"><span class="pill ${t[0]}">${icon(t[1], 12)} ${esc(t[2])}</span></p>`;
}

const F = { q: '', cat: 'all', sub: 'all', color: 'all', season: 'all', avail: 'active', sort: 'recent', status: 'active' };
const SEL = { on: false, ids: new Set() };
const STATUS_TABS = [['active', 'In closet'], ['sold', 'Sold'], ['donated', 'Donated'], ['lent', 'Lent out'], ['archived', 'Archived']];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const LSTATE = { clean: '', worn: 'worn', dirty: 'dirty', washing: 'washing' };

export function cell(g, extra = '') {
  const ls = g.laundry?.state;
  return `<a class="gcell ${extra} ${g.needsReview ? 'pending' : ''}" href="#/closet/${g.id}" data-id="${g.id}">
    <div class="gimg"><img data-key="${g.id}:thumb" data-fallback="${g.cutout}" alt="${esc(garmentName(g))}"><span class="gtype" title="${esc(g.subtype)}">${gicon(g.subtype, 15)}</span></div>
    ${g.needsReview ? '<span class="lstate check">Check</span>' : ls && LSTATE[ls] ? `<span class="lstate">${LSTATE[ls]}</span>` : ''}${g.favorite ? `<span class="fav">${icon('heartFill', 16)}</span>` : ''}
    <div class="gl">${swatch(primaryColor(g).hex, 10)}<span>${esc(garmentName(g))}</span></div></a>`;
}

const owned = () => state.garments.filter((g) => g.status === 'active'); // includes items still waiting for a check

export async function renderCloset(view) {
  const colorsPresent = [...new Set(state.garments.flatMap((g) => (g.colors || []).slice(0, 1).map((c) => c.name)))];
  const laundryN = state.garments.filter((g) => ['dirty', 'washing', 'worn'].includes(g.laundry?.state) && g.status === 'active').length;
  const pending = state.garments.filter((g) => g.needsReview && g.status === 'active').length;
  const act = owned();
  const value = act.reduce((s, g) => s + (g.price || 0), 0);
  view.innerHTML = `
    ${pageHead('Your wardrobe', 'Closet', `${act.length} pieces${value ? ` · ${fmtMoney(value)} in value` : ''}`, `${pending ? `<a class="btn small" href="#/review">${icon('search', 16)} Review (${pending})</a>` : ''}
      <a class="btn small" href="#/shop">${icon('bag', 16)} What to buy</a><button class="btn small" id="laundryBtn">${icon('laundry', 16)} Laundry${laundryN ? ` (${laundryN})` : ''}</button><a class="btn small primary" href="#/add">${icon('plus', 16)} Add</a>`)}
    ${pending ? `<a class="banner" href="#/review" style="margin:0 0 14px"><span class="row nowrap">${icon('info', 18)}<span><b>${pending} item${pending > 1 ? 's' : ''}</b> marked “Check” ${pending > 1 ? 'are' : 'is'} in your closet but not used in outfits until confirmed.</span></span><span class="btn small primary">Review</span></a>` : ''}
    <div class="chips status-tabs" data-chips="status">${STATUS_TABS.filter(([k]) => k === 'active' || state.garments.some((g) => g.status === k)).map(([k, l]) => `<button type="button" class="chip ${F.status === k ? 'on' : ''}" data-v="${k}">${l} <span class="n">${state.garments.filter((g) => g.status === k).length}</span></button>`).join('')}</div>
    <div class="filters">
      <div class="search">${icon('search', 18)}<input id="q" placeholder="${state.settings.aiEnabled ? 'Search, e.g. “red striped shirt” (AI)' : 'Search by name, color, type…'}" value="${esc(F.q)}"></div>
      <div class="chips cat-chips" data-chips="cat">${[['all', 'All', act.length], ...CATEGORIES.map((c) => [c, CATEGORY_LABEL[c], act.filter((g) => g.category === c).length])].filter(([c, , n]) => c === 'all' || n).map(([c, l, n]) => `<button type="button" class="chip ${F.cat === c ? 'on' : ''}" data-v="${c}">${gicon(c, 16)} ${l} <span class="faint">${n}</span></button>`).join('')}</div>
      <div class="chips sub-chips" id="subChips"></div>
      <div class="row">
        ${select('color', [['all', 'Any color'], ...colorsPresent.map((c) => [c, c])], F.color)}
        ${select('season', [['all', 'Any season'], ...SEASONS.map((s) => [s, s])], F.season)}
        ${select('avail', [['active', 'All in closet'], ['clean', 'Clean only'], ['laundry', 'In laundry'], ['review', 'Needs review']], F.avail === 'archived' || F.avail === 'all' ? 'active' : F.avail)}
        ${select('sort', [['recent', 'Newest'], ['most', 'Most worn'], ['least', 'Least worn'], ['cpw', 'Cost per wear'], ['color', 'Color']], F.sort)}
      </div>
    </div>
    <div class="row between"><p class="count-line" id="count"></p><button class="btn small ghost" id="selBtn">${icon('check', 14)} Select</button></div>
    <div class="closet-grid" id="grid"></div>
    <div class="sel-bar hide" id="selBar"><b id="selN">0 selected</b><div class="row nowrap" id="selActs"></div></div>`;
  const draw = async () => {
    let list = state.garments.slice();
    const lw = lastWornMap();
    list = list.filter((g) => (g.status || 'active') === F.status);
    if (F.status === 'active') {
      if (F.avail === 'clean') list = list.filter((g) => !g.needsReview && (!g.laundry || ['clean', 'worn'].includes(g.laundry.state)));
      if (F.avail === 'laundry') list = list.filter((g) => ['dirty', 'washing', 'worn'].includes(g.laundry?.state));
      if (F.avail === 'review') list = list.filter((g) => g.needsReview);
    }
    if (F.cat !== 'all') list = list.filter((g) => g.category === F.cat);
    // second row: the actual types present (Polo, T-shirt, Jeans, Cargo…) with icons and counts
    const types = {}; for (const g of list) types[g.subtype] = (types[g.subtype] || 0) + 1;
    if (F.sub !== 'all' && !types[F.sub]) F.sub = 'all';
    const subBox = $('#subChips', view);
    const tlist = Object.entries(types).sort((a, b) => b[1] - a[1]);
    subBox.innerHTML = tlist.length > 1 ? [`<button type="button" class="chip ${F.sub === 'all' ? 'on' : ''}" data-sub="all">All types</button>`, ...tlist.map(([s, n]) => `<button type="button" class="chip ${F.sub === s ? 'on' : ''}" data-sub="${esc(s)}">${gicon(s, 16)} ${esc(cap(s))} <span class="faint">${n}</span></button>`)].join('') : '';
    $$('[data-sub]', subBox).forEach((b) => b.onclick = () => { F.sub = b.dataset.sub; draw(); });
    if (F.sub !== 'all') list = list.filter((g) => g.subtype === F.sub);
    if (F.color !== 'all') list = list.filter((g) => g.colors?.[0]?.name === F.color);
    if (F.season !== 'all') list = list.filter((g) => g.season === F.season || g.season === 'all-season');
    let ranked = null;
    if (F.q) {
      const words = F.q.toLowerCase().split(/\s+/);
      const txt = (g) => `${garmentName(g)} ${g.subtype} ${g.category} ${(g.colors || []).map((c) => c.name).join(' ')} ${g.pattern} ${g.fabric} ${g.brand} ${g.notes}`.toLowerCase();
      const kw = list.filter((g) => words.every((w) => txt(g).includes(w)));
      if (kw.length || !state.settings.aiEnabled || !ai.aiStatus.ready) list = kw;
      else { try { ranked = await ai.semanticSearch(F.q, list); list = ranked.slice(0, 24).map((x) => x.g); } catch { list = kw; } }
    }
    const wc = (g) => wearsOf(g.id).length;
    if (!ranked) {
      if (F.sort === 'recent') list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (F.sort === 'most') list.sort((a, b) => wc(b) - wc(a));
      if (F.sort === 'least') list.sort((a, b) => wc(a) - wc(b) || (lw.get(a.id) || '').localeCompare(lw.get(b.id) || ''));
      if (F.sort === 'cpw') list.sort((a, b) => (costPerWear(b) ?? -1) - (costPerWear(a) ?? -1));
      if (F.sort === 'color') list.sort((a, b) => primaryColor(a).lab[0] - primaryColor(b).lab[0]);
    }
    $('#count', view).textContent = `${list.length} item${list.length === 1 ? '' : 's'}${ranked ? ' · ranked by AI similarity' : ''}`;
    $('#grid', view).innerHTML = list.length ? list.map((g) => F.status === 'active' ? cell(g, SEL.ids.has(g.id) ? 'sel' : '') : `<div class="gwrap">${cell(g, 'dim ' + (SEL.ids.has(g.id) ? 'sel' : ''))}<button class="btn small block restore" data-restore="${g.id}">${icon('refresh', 14)} Restore to closet</button></div>`).join('') : '';
    $$('[data-restore]', view).forEach((b) => b.onclick = async (e) => { e.preventDefault(); const g = garmentById(b.dataset.restore); g.status = 'active'; g.archivedAt = null; await saveGarment(g); toast(`${garmentName(g)} is back in your closet`); renderCloset(view); });
    if (!list.length) $('#grid', view).innerHTML = `<div style="grid-column:1/-1">${emptyState('hanger', state.garments.length ? 'Nothing matches' : 'Your closet is empty', state.garments.length ? 'Try clearing a filter.' : 'Photograph a garment, import from your gallery, or load the demo wardrobe.', state.garments.length ? '' : '<div class="row center"><a class="btn primary" href="#/add">Add clothes</a><a class="btn" href="#/settings?demo=1">Load demo</a></div>')}</div>`;
    hydrateImages(view);
  };
  let t; $('#q', view).addEventListener('input', (e) => { F.q = e.target.value.trim(); clearTimeout(t); t = setTimeout(draw, 300); });
  bindChips(view, 'cat', (v) => { F.cat = v; F.sub = 'all'; draw(); });
  bindChips(view, 'status', (v) => { F.status = v; F.sub = 'all'; SEL.ids.clear(); draw(); syncSel(); });
  // select mode: tap pieces, then sell / donate / archive / restore / delete them together
  const syncSel = () => {
    $('#selBtn', view).innerHTML = SEL.on ? 'Done' : `${icon('check', 14)} Select`;
    view.classList.toggle('selecting', SEL.on);
    const bar = $('#selBar', view); bar.classList.toggle('hide', !SEL.on);
    $('#selN', view).textContent = `${SEL.ids.size} selected`;
    const acts = F.status === 'active' ? [['sold', 'Sold', 'bag'], ['donated', 'Donate', 'leaf'], ['archived', 'Archive', 'book']] : [['active', 'Restore', 'refresh']];
    $('#selActs', view).innerHTML = acts.map(([k, l, ic]) => `<button class="btn small" data-bulk="${k}" ${SEL.ids.size ? '' : 'disabled'}>${icon(ic, 14)} ${l}</button>`).join('') + `<button class="btn small danger" data-bulk="delete" ${SEL.ids.size ? '' : 'disabled'}>${icon('trash', 14)} Delete</button>`;
    $$('[data-bulk]', view).forEach((b) => b.onclick = () => bulk(b.dataset.bulk));
  };
  const bulk = async (k) => {
    const items = [...SEL.ids].map(garmentById).filter(Boolean); if (!items.length) return;
    if (k === 'delete') {
      if (!(await confirmBox(`Permanently delete ${items.length} item${items.length > 1 ? 's' : ''} and their photos from this device? This cannot be undone. “Archive” keeps your history instead.`, 'Delete'))) return;
      for (const g of items) await removeGarment(g);
      toast(`Deleted ${items.length}`);
    } else {
      for (const g of items) { g.status = k; g.archivedAt = k === 'active' ? null : Date.now(); await saveGarment(g); }
      toast(k === 'active' ? `Restored ${items.length}` : `Moved ${items.length} to ${STATUS_TABS.find(([s]) => s === k)[1]}`);
    }
    SEL.ids.clear(); SEL.on = false; renderCloset(view);
  };
  $('#selBtn', view).onclick = () => { SEL.on = !SEL.on; SEL.ids.clear(); draw(); syncSel(); };
  $('#grid', view).addEventListener('click', (e) => {
    if (!SEL.on) return;
    const c = e.target.closest('.gcell'); if (!c) return;
    e.preventDefault(); const id = c.dataset.id;
    if (SEL.ids.has(id)) SEL.ids.delete(id); else SEL.ids.add(id);
    c.classList.toggle('sel', SEL.ids.has(id)); syncSel();
  });
  syncSel();
  for (const k of ['color', 'season', 'avail', 'sort']) view.querySelector(`[name=${k}]`).addEventListener('change', (e) => { F[k] = e.target.value; draw(); });
  $('#laundryBtn', view).onclick = () => laundryModal(() => renderCloset(view));
  if (F.q && state.settings.aiEnabled && !ai.aiStatus.ready) ai.loadAI().catch(() => {});
  draw();
}

export function laundryModal(onDone) {
  const list = state.garments.filter((g) => g.status === 'active' && ['dirty', 'washing', 'worn'].includes(g.laundry?.state));
  modal(`<h2>Laundry</h2><p class="small muted">Items move clean → worn → dirty → washing → clean. Each fabric tolerates a different number of wears before washing. Washing auto-finishes after 36 h${state.settings.laundryDay >= 0 ? ', and dirty items reset on your laundry day' : ''}.</p>
    ${list.length ? `<div class="list">${list.map((g) => `<div class="li"><img data-key="${g.cutout}" alt=""><div class="grow"><b>${esc(garmentName(g))}</b><div class="tiny muted">${g.laundry.state} · ${g.laundry.wearsSinceWash}/${washLimit(g) === Infinity ? '∞' : washLimit(g)} wears${g.care ? ' · <b>' + esc(careHint(g.care)) + '</b>' : ''}</div></div>
      <select data-l="${g.id}">${['clean', 'worn', 'dirty', 'washing'].map((s) => `<option ${s === g.laundry.state ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('')}</div>
      <div class="row end mt"><button class="btn" id="washAll">${icon('laundry', 16)} Put everything in the wash</button><button class="btn primary" id="allClean">${icon('check', 16)} All clean</button></div>` : emptyState('check', 'Everything is clean', 'Nothing is waiting in the basket.')}`, {
    onMount: (m, close) => {
      hydrateImages(m);
      $$('[data-l]', m).forEach((s) => s.onchange = async () => { await setLaundry(garmentById(s.dataset.l), s.value); toast('Laundry updated'); });
      const w = $('#washAll', m); if (w) w.onclick = async () => { await washAllDirty(); close(); onDone?.(); toast('In the wash — they will be back in 36 h.'); };
      const a = $('#allClean', m); if (a) a.onclick = async () => { for (const g of list) await setLaundry(g, 'clean'); close(); onDone?.(); toast('All clean.'); };
    },
  });
}

export async function renderItem(view, r) {
  const g = garmentById(r.param);
  if (!g) { view.innerHTML = emptyState('search', 'Item not found', '', '<a class="btn" href="#/closet">Back to closet</a>'); return; }
  const wears = wearsOf(g.id).sort((a, b) => b.wornOn.localeCompare(a.wornOn));
  const cpw = costPerWear(g);
  const low = new Set(g.lowConfidence || []);
  const L = (k) => (low.has(k) && g.attrSource?.[k] !== 'user' ? 'lowc' : '');
  const outfits = outfitsContaining(g.id).slice(-8).reverse();
  const similar = similarItems(g).slice(0, 6);
  view.innerHTML = `
    <a href="#/closet" class="back">${icon('back', 16)} Closet</a>
    <div class="detail">
      <div>
        <div class="detail-img"><img id="mainImg" data-key="${g.cutout}" alt=""></div>
        <div class="row mt"><button class="btn small" id="toggleImg">${icon('eye', 16)} <span>Show original</span></button><button class="btn small" id="fixCut">${icon('scissors', 16)} Fix cutout</button>${state.settings.aiEnabled ? `<button class="btn small" id="retag">${icon('cpu', 16)} Re-tag</button>` : ''}</div>
        ${colorVerdict(g)}
        <div class="mt"><div class="stats">
          <div class="stat"><b>${wears.length}</b><span class="small muted">wears</span></div>
          <div class="stat"><b>${cpw != null ? fmtMoney(cpw) : '—'}</b><span class="small muted">cost / wear</span></div>
          <div class="stat"><b>${wears[0] ? Math.round((new Date(todayStr()) - new Date(wears[0].wornOn)) / 864e5) + 'd' : 'never'}</b><span class="small muted">since worn</span></div></div></div>
        <div class="row mt">
          <a class="btn primary" href="#/today?around=${g.id}">${icon('sparkles', 16)} Style this piece</a>
          <a class="btn" href="#/builder?with=${g.id}">${icon('layers', 16)} Open in builder</a></div>
      </div>
      <div>
        <p class="eyebrow">${esc(CATEGORY_LABEL[g.category])} · ${esc(g.subtype)}</p>
        <div class="row between"><h1 id="title">${esc(garmentName(g))}</h1><div class="row nowrap"><button class="btn small icon" id="rmMenu" aria-label="Remove or sell" title="Sold, donate, archive or delete">${icon('trash', 16)}</button><button class="btn small" id="fav">${g.favorite ? icon('heartFill', 16) + ' Favorite' : icon('heart', 16) + ' Favorite'}</button></div></div>
        ${low.size && Object.keys(g.attrSource || {}).length < low.size ? '<p class="small"><span class="pill warn">Highlighted fields had low AI confidence — please check them</span></p>' : ''}
        <form class="form card" id="attrs">
          <label class="f">Name<input name="name" value="${esc(g.name)}" placeholder="${esc(garmentName({ ...g, name: '' }))}"></label>
          <label class="f">Category${select('category', CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]), g.category, `class="${L('category')}"`)}</label>
          <label class="f">Type${select('subtype', subtypeOptions(g.category), g.subtype, `class="${L('subtype')}"`)}</label>
          <label class="f">Pattern${select('pattern', PATTERNS, g.pattern, `class="${L('pattern')}"`)}</label>
          <label class="f">Fabric${select('fabric', FABRICS, g.fabric, `class="${L('fabric')}"`)}</label>
          <label class="f">Formality${select('formality', [1, 2, 3, 4, 5].map((v) => [v, `${v} · ${FORMALITY_LABEL[v]}`]), g.formality, `class="${L('formality')}"`)}</label>
          <label class="f">Fit${select('fit', FITS, g.fit, `class="${L('fit')}"`)}</label>
          <label class="f">Warmth (1–5)${select('warmth', [0, 1, 2, 3, 4, 5], g.warmth)}</label>
          <label class="f">Season${select('season', SEASONS, g.season)}</label>
          <label class="f">Main color<input type="color" name="color0" value="${primaryColor(g).hex}"></label>
          <label class="f">Second color<input type="color" name="color1" value="${g.colors?.[1]?.hex || primaryColor(g).hex}"></label>
          <label class="f">Brand<input name="brand" value="${esc(g.brand || '')}"></label>
          <label class="f">Price paid<input name="price" type="number" min="0" step="0.01" value="${g.price ?? ''}"></label>
          <label class="f">Purchased<input name="purchasedAt" type="date" value="${esc(g.purchasedAt || '')}"></label>
          <label class="f" style="grid-column:1/-1">Notes<input name="notes" value="${esc(g.notes || '')}"></label>
        </form>
        <p class="tiny muted">Colors: ${(g.colors || []).map((c) => `${swatch(c.hex, 12)} ${esc(c.name)} ${Math.round((c.share || 1) * 100)}%`).join(' · ')} · tagged by ${esc(g.modelVersion || 'you')}</p>
        <div class="card mt"><div class="row between"><b>Laundry</b><span class="small muted">${g.laundry?.wearsSinceWash || 0}/${washLimit(g) === Infinity ? '∞' : washLimit(g)} wears before wash</span></div>
          <div class="mt">${seg('laundry', [['clean', 'Clean'], ['worn', 'Worn'], ['dirty', 'Dirty'], ['washing', 'Washing']], g.laundry?.state || 'clean')}</div></div>
        ${careCardHtml(g)}
        <div class="card mt"><b>Status</b><div class="row mt">
          ${chips('status', [['active', 'Active'], ['lent', 'Lent out'], ['archived', 'Archived'], ['donated', 'Donated'], ['sold', 'Sold']], g.status)}</div>
          <label class="row small mt"><input type="checkbox" id="never" ${g.neverSuggest ? 'checked' : ''}> Never suggest this item</label></div>
        ${outfits.length ? `<div class="section"><h3>Outfits with this</h3><div class="mini-outfits" id="minis"></div></div>` : ''}
        ${similar.length ? `<div class="section"><h3>Similar items ${g.embedding ? '<span class="pill">AI</span>' : ''}</h3><div class="closet-grid">${similar.map((s) => cell(s.g)).join('')}</div></div>` : ''}
        <div class="section"><h3>Wear history</h3>${wears.length ? `<p class="small">${wears.slice(0, 30).map((w) => esc(w.wornOn)).join(' · ')}</p>` : '<p class="small muted">Not worn yet.</p>'}</div>
        <details class="section"><summary class="small muted">Danger zone</summary><p class="small muted mt">Archiving keeps wear history and analytics intact (recommended). Permanent deletion removes the photos and record from this device.</p><button class="btn small danger" id="delete">Delete permanently</button></details>
      </div>
    </div>`;
  hydrateImages(view);
  bindCareCard(view, g, () => renderItem(view, r));
  let showingOrig = false;
  $('#toggleImg', view).onclick = async () => {
    showingOrig = !showingOrig; const { imageUrl } = await import('../db.js');
    $('#mainImg', view).src = await imageUrl(showingOrig ? g.original : g.cutout);
    $('#toggleImg span', view).textContent = showingOrig ? 'Show cutout' : 'Show original';
  };
  $('#fav', view).onclick = async () => { g.favorite = !g.favorite; await saveGarment(g); $('#fav', view).innerHTML = (g.favorite ? icon('heartFill', 16) : icon('heart', 16)) + ' Favorite'; };
  $('#never', view).onchange = async (e) => { g.neverSuggest = e.target.checked; await saveGarment(g); toast(g.neverSuggest ? 'Will never be suggested' : 'Back in rotation'); };
  bindChips(view, 'laundry', async (v) => { await setLaundry(g, v); toast('Laundry: ' + v); });
  bindChips(view, 'status', async (v) => { g.status = v; g.archivedAt = v === 'active' ? null : Date.now(); await saveGarment(g); toast(v === 'active' ? 'Back in your active wardrobe' : `Marked ${v} — history kept`); });
  $('#attrs', view).addEventListener('change', async (e) => {
    const el = e.target; const k = el.name; let v = el.value;
    if (k === 'category') {
      await correctAttribute(g, 'category', v);
      await correctAttribute(g, 'subtype', subtypeOptions(v)[0]);
      return renderItem(view, r);
    }
    if (['formality', 'warmth'].includes(k)) v = +v;
    if (k === 'price') v = v === '' ? null : +v;
    if (k === 'color0' || k === 'color1') {
      const cols = [...(g.colors || [])];
      cols[k === 'color0' ? 0 : 1] = makeColor(v, k === 'color0' ? (cols[0]?.share || 0.8) : (cols[1]?.share || 0.2));
      await correctAttribute(g, 'colors', cols.filter(Boolean));
    } else await correctAttribute(g, k, v);
    if (['subtype', 'fabric'].includes(k)) {
      if (g.attrSource.warmth !== 'user') g.warmth = deriveWarmth(g.subtype, g.fabric, g.category);
      if (g.attrSource.season !== 'user') g.season = deriveSeason(g.warmth, g.fabric, g.category);
      await saveGarment(g);
      view.querySelector('[name=warmth]').value = g.warmth; view.querySelector('[name=season]').value = g.season;
    }
    el.classList.remove('lowc');
    $('#title', view).textContent = garmentName(g);
    toast('Saved');
  });
  $('#fixCut', view).onclick = () => fixCutoutModal(g, () => renderItem(view, r));
  const rt = $('#retag', view); if (rt) rt.onclick = async () => { rt.disabled = true; rt.innerHTML = '<span class="spinner sm"></span> Tagging…'; try { await retagGarment(g); toast('Re-tagged (your own corrections were kept)'); } catch (e) { toast('AI tagging failed: ' + e.message); } renderItem(view, r); };
  const delNow = async () => {
    if (!(await confirmBox(`Permanently delete “${garmentName(g)}” and its photos from this device? This cannot be undone. Archiving is the safer option.`, 'Delete'))) return;
    await removeGarment(g); toast('Deleted'); go('#/closet');
  };
  $('#delete', view).onclick = delNow;
  $('#rmMenu', view).onclick = () => modal(`<h2>Remove from closet</h2><p class="small muted">Sold, donated, lent and archived pieces keep their history and can be restored any time from the Closet tabs.</p>
    <div class="rm-list">${[['sold', 'Mark as sold', 'bag'], ['donated', 'Donated', 'leaf'], ['lent', 'Lent to someone', 'user'], ['archived', 'Archive (keep, hide from outfits)', 'book']].map(([k, l, ic]) => `<button class="pk-row" data-st="${k}"><span class="pk-ic">${icon(ic, 18)}</span><span class="pk-t">${l}</span></button>`).join('')}
    <button class="pk-row danger-row" data-st="delete"><span class="pk-ic">${icon('trash', 18)}</span><span class="pk-t">Delete permanently</span></button></div>`, {
    onMount: (m, close) => $$('[data-st]', m).forEach((b) => b.onclick = async () => {
      close(); const k = b.dataset.st;
      if (k === 'delete') return delNow();
      g.status = k; g.archivedAt = Date.now(); await saveGarment(g);
      toast(`Moved to ${STATUS_TABS.find(([s]) => s === k)[1]} — restore it any time from the Closet`); go('#/closet');
    }),
  });
  const minis = $('#minis', view);
  if (minis) for (const o of outfits) {
    const items = o.items.map((i) => garmentById(i.garmentId)).filter(Boolean);
    const c = await renderOutfit(items, { size: 240 }); c.title = o.wornOn || o.name || ''; minis.appendChild(c);
  }
}

export function similarItems(g) {
  const pool = activeGarments().filter((x) => x.id !== g.id);
  if (g.embedding) return pool.filter((x) => x.embedding).map((x) => ({ g: x, s: cosine(g.embedding, x.embedding) })).filter((x) => x.s > 0.75).sort((a, b) => b.s - a.s);
  return pool.filter((x) => x.category === g.category).map((x) => ({ g: x, s: (x.subtype === g.subtype ? 0.5 : 0) + Math.max(0, 0.5 - deltaE(primaryColor(x).lab, primaryColor(g).lab) / 60) })).filter((x) => x.s > 0.45).sort((a, b) => b.s - a.s);
}

// Manual crop fallback + re-run segmentation (local or AI) + keep original.
export async function fixCutoutModal(g, onDone) {
  const blob = await imageBlob(g.original);
  if (!blob) { toast('Original photo not found'); return; }
  const src = await fileToCanvas(blob, 1280);
  const url = URL.createObjectURL(blob);
  modal(`<h2>Fix cutout</h2><p class="small muted">Drag a box around the garment, then pick how to cut it out.</p>
    <div class="crop-area" id="ca"><img src="${url}" alt="" draggable="false"><div class="crop-rect" id="cr" style="left:5%;top:5%;width:90%;height:90%"></div></div>
    <div class="row mt"><button class="btn primary" data-m="local">${icon('scissors', 16)} Auto cutout</button>${state.settings.aiBgRemoval ? `<button class="btn" data-m="ai">${icon('cpu', 16)} AI cutout</button>` : ''}<button class="btn" data-m="none">Keep photo (cropped)</button></div>
    <p class="tiny muted mt">Tip: auto cutout works best on a plain background. If it fails, “Keep photo” always works.</p>`, {
    wide: true,
    onMount: (m, close) => {
      const area = $('#ca', m), rect = $('#cr', m); let start = null;
      const pos = (e) => { const b = area.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height].map((v) => Math.max(0, Math.min(1, v))); };
      area.addEventListener('pointerdown', (e) => { start = pos(e); area.setPointerCapture(e.pointerId); });
      area.addEventListener('pointermove', (e) => {
        if (!start) return; const p = pos(e);
        const x = Math.min(start[0], p[0]), y = Math.min(start[1], p[1]), w = Math.abs(p[0] - start[0]), h = Math.abs(p[1] - start[1]);
        Object.assign(rect.style, { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%' });
      });
      area.addEventListener('pointerup', () => { start = null; });
      $$('[data-m]', m).forEach((b) => b.onclick = async () => {
        b.innerHTML = '<span class="spinner sm"></span>';
        const fr = (k) => parseFloat(rect.style[k]) / 100;
        let rr = { x: Math.round(fr('left') * src.width), y: Math.round(fr('top') * src.height), w: Math.round(fr('width') * src.width), h: Math.round(fr('height') * src.height) };
        if (rr.w < 20 || rr.h < 20) rr = { x: 0, y: 0, w: src.width, h: src.height };
        const crop = cropCanvas(src, rr);
        const res = await cutout(scaleCanvas(crop, 1024), b.dataset.m);
        const c = scaleCanvas(res.canvas, 800);
        await saveImage(g.cutout, await canvasToBlob(c, res.method === 'none' ? 'image/jpeg' : 'image/png'));
        await saveThumb(g.id, c);
        g.cutoutMethod = res.method; g.colors = g.attrSource?.colors === 'user' ? g.colors : colorsFromCanvas(c);
        g.confidence = { ...(g.confidence || {}), segmentation: res.confidence };
        await saveGarment(g);
        URL.revokeObjectURL(url); close(); toast(res.method === 'none' && b.dataset.m !== 'none' ? 'Could not separate the background — kept the cropped photo' : 'Cutout updated'); onDone?.();
      });
    },
  });
}

// Permanently remove a garment and all its pictures
export async function removeGarment(g) {
  await del('garments', g.id);
  for (const k of [g.cutout, g.original, `${g.id}:thumb`]) if (k) await del('images', k);
  state.garments = state.garments.filter((x) => x.id !== g.id);
}
