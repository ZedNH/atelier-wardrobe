// "Should I buy this?" — share a product screenshot from Daraz, Instagram, Facebook Marketplace or any shop
// (Android share sheet / installed web app share target / upload / paste) and get a verdict against YOUR closet.
import { state, activeGarments, saveImage, saveGarment, uid, kvGet, kvSet } from '../db.js';
import { CATEGORIES, CATEGORY_LABEL, SUBTYPES, PATTERNS } from '../enums.js';
import { adviseItem, makeVirtual, bestBuys, rankCandidates } from '../insights.js';
import { gicon } from './icons.js';
import { recommend } from '../recommender.js';
import { weatherFor, todayStr } from '../weather.js';
import { renderOutfit } from '../preview.js';
import { fileToCanvas, cropCanvas, scaleCanvas, segmentLocal, colorsFromCanvas, canvasToBlob, makeCanvas } from '../vision.js';
import { makeColor } from '../color.js';
import { profile, subtypeOptions, colorFit, myWear, myOccasions } from '../profile.js';
import { wearsOf } from '../actions.js';
import * as ai from '../ai.js';
import { esc, garmentName, fmtMoney, deriveWarmth, deriveSeason, DAY } from '../util.js';
import { defaultFabric } from '../pipeline.js';
import { $, $$, toast, icon, pageHead, select, swatch, emptyState, hydrateImages, ring } from './dom.js';
import { cell } from './closet.js';
import { go } from '../app.js';

const SH = { canvas: null, link: '', result: null };

// Called by the Android app or the web share target with an incoming image / link.
export async function takeShared() {
  let blob = null, text = '';
  const p = window.__pendingShare; window.__pendingShare = null;
  if (p?.img) blob = await (await fetch(p.img)).blob();
  if (p?.text) text = p.text;
  if (!blob && 'caches' in window) {
    try {
      const c = await caches.open('share-inbox');
      const r = await c.match('shared-image'); if (r) { blob = await r.blob(); await c.delete('shared-image'); }
      const t = await c.match('shared-text'); if (t) { text = await t.text(); await c.delete('shared-text'); }
    } catch { /* no inbox */ }
  }
  return { blob, text };
}

export async function render(view, r) {
  view.innerHTML = `${pageHead('Shop smarter', 'Should I <em>buy</em> this?', 'Share a product screenshot from Daraz, Instagram or any shop — or upload / paste one. I check it against your closet, your colors and your body shape before you spend.')}
    <div class="shop-cols">
      <section class="card" id="inbox">
        <div id="pick">
          <label class="dropzone" id="dz"><input type="file" accept="image/*" multiple hidden id="file">${icon('image', 34)}<p><b>Choose product screenshots</b></p><p class="small muted">Pick one to check it — or several to see <b>which one to buy</b> · paste (Ctrl+V) · or share to Atelier from any shopping app</p></label>
          <div class="tips mt small"><div class="row">${icon('info', 14)}<span>Tip: in Daraz or Instagram tap <b>Share → Atelier</b> (Android app), or take a screenshot and share it here.</span></div></div>
        </div>
        <div id="cropBox" class="hide"></div>
      </section>
      <div id="result"></div>
      <section class="card" id="bestBuys"></section>
      <section id="side">${await wishlistHtml()}</section>
    </div>`;
  const load = async (blob) => { SH.canvas = await fileToCanvas(blob, 1400); showCrop(view); };
  const loadMany = (files) => { files = files.filter((x) => x.type.startsWith('image/')); if (files.length > 1) compareMany(view, files.slice(0, 8)); else if (files[0]) load(files[0]); };
  $('#file', view).onchange = (e) => loadMany([...e.target.files]);
  const dz = $('#dz', view);
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); loadMany([...e.dataTransfer.files]); });
  renderBestBuys(view);
  const onPaste = (e) => { const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/')); if (it) load(it.getAsFile()); };
  document.addEventListener('paste', onPaste); unmountFns.push(() => document.removeEventListener('paste', onPaste));
  bindWishlist(view);
  if (r?.query?.get('shared')) { const s = await takeShared(); SH.link = s.text || ''; if (s.blob) load(s.blob); else if (s.text) toast('Got the link — now add a screenshot of the product'); }
}
const unmountFns = [];
export function unmount() { while (unmountFns.length) unmountFns.pop()(); }

// drag a box around the product (screenshots include prices, buttons and text)
function showCrop(view) {
  const box = $('#cropBox', view); $('#pick', view).classList.add('hide'); box.classList.remove('hide');
  const url = SH.canvas.toDataURL('image/jpeg', 0.9);
  box.innerHTML = `<p class="small muted">Drag a box around just the product, then analyze.</p>
    <div class="row center"><div class="crop-area" id="ca"><img src="${url}" alt="" draggable="false"><div class="crop-rect" id="cr" style="left:8%;top:12%;width:84%;height:70%"></div></div></div>
    <div class="row mt"><button class="btn primary" id="go">${icon('sparkles', 16)} Analyze</button><button class="btn" id="whole">Use whole image</button><button class="btn ghost" id="again">Choose another</button></div>`;
  const area = $('#ca', box), rect = $('#cr', box); let start = null;
  const pos = (e) => { const b = area.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height].map((v) => Math.max(0, Math.min(1, v))); };
  area.addEventListener('pointerdown', (e) => { start = pos(e); area.setPointerCapture(e.pointerId); });
  area.addEventListener('pointermove', (e) => { if (!start) return; const p = pos(e); Object.assign(rect.style, { left: Math.min(start[0], p[0]) * 100 + '%', top: Math.min(start[1], p[1]) * 100 + '%', width: Math.abs(p[0] - start[0]) * 100 + '%', height: Math.abs(p[1] - start[1]) * 100 + '%' }); });
  area.addEventListener('pointerup', () => { start = null; });
  const crop = (whole) => {
    if (whole) return SH.canvas;
    const fr = (k) => parseFloat(rect.style[k]) / 100; const c = SH.canvas;
    const r = { x: Math.round(fr('left') * c.width), y: Math.round(fr('top') * c.height), w: Math.round(fr('width') * c.width), h: Math.round(fr('height') * c.height) };
    return r.w < 30 || r.h < 30 ? c : cropCanvas(c, r);
  };
  $('#go', box).onclick = () => analyze(view, crop(false));
  $('#whole', box).onclick = () => analyze(view, crop(true));
  $('#again', box).onclick = () => { box.classList.add('hide'); $('#pick', view).classList.remove('hide'); $('#result', view).innerHTML = ''; };
}

// photo -> cutout + guessed type + main colour (on-device)
async function readProduct(canvas) {
  const c = scaleCanvas(canvas, 900);
  const seg = segmentLocal(c); const cut = seg && seg.frac > 0.08 && seg.frac < 0.95 ? seg.canvas : c;
  const col = colorsFromCanvas(cut)[0];
  let guess = { category: 'top', subtype: subtypeOptions('top')[0], pattern: 'solid' }, emb = null;
  if (state.settings.aiEnabled) {
    try { await ai.loadAI(); emb = await ai.embedPhoto(c, cut); const a = ai.classify(emb, { colorName: col?.name }); guess = { category: a.category, subtype: a.subtype, pattern: a.pattern }; } catch { /* manual */ }
  }
  return { ...guess, hex: col?.hex || '#808080', emb, cut, canvas };
}

async function analyze(view, canvas) {
  const out = $('#result', view);
  out.innerHTML = '<div class="card"><div class="row"><span class="spinner sm"></span> Reading the product…</div></div>';
  const g = await readProduct(canvas);
  SH.cut = g.cut;
  editor(view, { ...g, price: '' });
}

// Several screenshots at once -> ranked by how many new outfits each would unlock with your clothes
async function compareMany(view, files) {
  const out = $('#result', view);
  out.innerHTML = `<div class="card"><div class="row"><span class="spinner sm"></span> <span id="cmpMsg">Reading ${files.length} products…</span></div></div>`;
  const items = [];
  for (const [i, f] of files.entries()) {
    const m = $('#cmpMsg', out); if (m) m.textContent = `Reading product ${i + 1} of ${files.length}…`;
    const canvas = await fileToCanvas(f, 1400);
    items.push(await readProduct(canvas));
    await new Promise((r) => setTimeout(r, 0));
  }
  const m = $('#cmpMsg', out); if (m) m.textContent = 'Counting the outfits each one unlocks…';
  const ranked = (await rankCandidates(items.map((g) => makeVirtual({ subtype: g.subtype, hex: g.hex, pattern: g.pattern })))).map((r, i) => ({ ...r, g: items[i] }));
  ranked.sort((a, b) => (a.dupe - b.dupe) || (b.joins - a.joins));
  const p = profile();
  const top = ranked[0];
  out.innerHTML = `<div class="card"><div class="card-h"><h2>${icon('target', 18)} Which one should you buy?</h2><span class="small muted">${ranked.length} compared</span></div>
    <p class="small muted" style="margin-top:0">${top && top.joins > 0 && !top.dupe ? `<b>Best pick:</b> the ${esc(colorWord(top.g.hex))} ${esc(top.g.subtype)} — it unlocks <b>${top.joins}</b> new outfits with what you already own.` : 'None of these adds much to your closet — have a look at the suggestions below instead.'} Wrong type? Tap <b>Check</b> to fix it.</p>
    <div class="cmp-list">${ranked.map((r, i) => {
      const fit = p.season && ['top', 'dress', 'outerwear'].includes(r.v.category) ? colorFit(r.g.hex, p.season) : null;
      return `<div class="cmp ${i === 0 && r.joins > 0 && !r.dupe ? 'best' : ''}"><div class="cmp-img"><img src="${r.g.cut.toDataURL('image/png')}" alt=""></div>
        <div class="grow"><div class="row" style="gap:6px">${gicon(r.g.subtype, 16)}<b>${esc(cap(r.g.subtype))}</b>${i === 0 && r.joins > 0 && !r.dupe ? '<span class="pill good">Best pick</span>' : ''}</div>
        <div class="tiny muted">${r.dupe ? 'You already own one like this' : r.joins ? `Unlocks <b>+${r.joins}</b> new outfits` : 'Hardly goes with anything you own'}${fit ? ` · color ${fit.verdict === 'great' ? 'great for you' : fit.verdict === 'ok' ? 'okay for you' : 'not your best'}` : ''}</div>
        <div class="bar mt"><i style="width:${Math.round(100 * r.joins / Math.max(1, ...ranked.map((x) => x.joins)))}%"></i></div></div>
        <button class="btn small" data-cmp="${i}">Check</button></div>`;
    }).join('')}</div></div>`;
  $$('[data-cmp]', out).forEach((b) => b.onclick = () => { const g = ranked[+b.dataset.cmp].g; SH.canvas = g.canvas; SH.cut = g.cut; editor(view, { ...g, price: '' }); $('#result', view).scrollIntoView({ behavior: 'smooth' }); });
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const colorWord = (hex) => (makeColor(hex)?.name || 'this').toLowerCase();

export const bestBuyCard = (r, i) => `<div class="bb" data-cat="${r.cat}">
      <div class="bb-ico" style="--fill:${r.v.colors[0].hex}">${gicon(r.v.subtype, 40)}${i === 0 ? '<span class="bb-top">Top pick</span>' : ''}</div>
      <b class="bb-name">${esc(cap(r.v.name))}</b>
      <span class="bb-n">+${r.joins} <small>outfits</small></span>
      ${r.fit ? `<span class="tiny ${r.fit.verdict === 'great' ? 'good-t' : r.fit.verdict === 'avoid' ? 'bad-t' : 'muted'}">${r.fit.verdict === 'great' ? 'Great color for you' : r.fit.verdict === 'ok' ? 'Okay color for you' : 'Not your best color'}</span>` : ''}
      ${r.preview.length ? `<div class="bb-with"><span class="tiny muted">Wear with</span>${r.preview.map((g) => `<img data-key="${g.id}:thumb" data-fallback="${g.cutout}" alt="${esc(garmentName(g))}" title="${esc(garmentName(g))}">`).join('')}</div>` : ''}
    </div>`;

// "Best buys for your closet": which type + colour would unlock the most outfits with what you own
async function renderBestBuys(view) {
  const box = $('#bestBuys', view); if (!box) return;
  const owned = activeGarments().length;
  const head = `<div class="card-h"><h2>${icon('sparkles', 18)} Best buys for your closet</h2><span class="small muted">What to buy next to make the most new outfits</span></div>`;
  if (owned < 3) { box.innerHTML = head + '<p class="small muted">Add a few of your clothes first — then I can tell you which shirt, trousers or shoes would unlock the most outfits.</p>'; return; }
  box.innerHTML = head + '<div class="row"><span class="spinner sm"></span> <span class="small muted" id="bbMsg">Trying different pieces against your closet…</span></div>';
  await new Promise((r) => setTimeout(r, 200));
  let res;
  try { res = await bestBuys({ limit: 12, onProgress: (f) => { const m = $('#bbMsg', box); if (m) m.textContent = `Trying different pieces against your closet… ${Math.round(f * 100)}%`; } }); } catch (e) { console.warn(e); box.innerHTML = head + '<p class="small muted">Could not work this out right now.</p>'; return; }
  if (!box.isConnected) return;
  if (!res.list.length) { box.innerHTML = head + '<p class="small muted">Your closet is very well covered — no single piece would add many outfits.</p>'; return; }
  const CAT = { all: 'All', top: 'Tops', bottom: 'Bottoms', footwear: 'Shoes', dress: 'Dresses', outerwear: 'Layers' };
  const cats = ['all', ...Object.keys(CAT).filter((k) => k !== 'all' && res.list.some((r) => r.cat === k))];
  const card = bestBuyCard;
  box.innerHTML = head + `<p class="small muted" style="margin-top:0">You have about <b>${res.base}</b> everyday outfits now. Each idea below is one new piece and how many <b>extra</b> outfits it would create with clothes you already own.</p>
    <div class="chips" id="bbChips">${cats.map((c, i) => `<button class="chip ${i ? '' : 'on'}" data-bbc="${c}">${CAT[c]}</button>`).join('')}</div>
    <div class="bb-grid mt">${res.list.map(card).join('')}</div>
    <p class="tiny muted mt">Found one you like in a shop? Screenshot it and add it above — I'll check the real item.</p>`;
  hydrateImages(box);
  $$('[data-bbc]', box).forEach((b) => b.onclick = () => {
    $$('[data-bbc]', box).forEach((x) => x.classList.toggle('on', x === b));
    $$('.bb', box).forEach((el) => el.classList.toggle('hide', b.dataset.bbc !== 'all' && el.dataset.cat !== b.dataset.bbc));
  });
}

function editor(view, g) {
  const out = $('#result', view);
  const cur = localCurrency();
  out.innerHTML = `<div class="card"><div class="card-h"><h2>${icon('pen', 18)} Check the details</h2><span class="small muted">${state.settings.aiEnabled ? 'Pre-filled by on-device AI' : 'Turn on AI in Settings to pre-fill the type'}</span></div>
    <div class="split" style="align-items:start"><div class="detail-img" style="aspect-ratio:1" id="thumb"></div>
    <form class="form" id="sf">
      <label class="f">Category<select name="category">${CATEGORIES.map((x) => `<option value="${x}" ${x === g.category ? 'selected' : ''}>${CATEGORY_LABEL[x]}</option>`).join('')}</select></label>
      <label class="f">Type<select name="subtype">${subtypeOptions(g.category).map((s) => `<option ${s === g.subtype ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="f">Main color<input type="color" name="color" value="${g.hex}"></label>
      <label class="f">Pattern${select('pattern', PATTERNS, g.pattern)}</label>
      <label class="f">Price (${cur})<input name="price" type="number" min="0" step="1" placeholder="e.g. 1850" value="${g.price}"></label>
      <div style="grid-column:1/-1"><button class="btn primary">${icon('target', 16)} Should I buy it?</button></div></form></div></div><div id="verdict" class="mt"></div>`;
  const th = $('#thumb', out); const im = document.createElement('img'); im.src = SH.cut.toDataURL('image/png'); im.alt = ''; th.appendChild(im);
  const f = $('#sf', out);
  f.category.onchange = () => { f.subtype.innerHTML = subtypeOptions(f.category.value).map((s) => `<option>${s}</option>`).join(''); };
  f.onsubmit = (e) => { e.preventDefault(); verdict(view, { subtype: f.subtype.value, hex: f.color.value, pattern: f.pattern.value, price: f.price.value ? +f.price.value : null, emb: g.emb }); };
}

const localCurrency = () => { try { return localStorage.getItem('currency') || 'USD'; } catch { return 'USD'; } };

async function verdict(view, spec) {
  const box = $('#verdict', view);
  box.innerHTML = '<div class="row"><span class="spinner sm"></span> Counting the outfits it would make…</div>';
  await new Promise((r) => setTimeout(r, 30));
  const v = makeVirtual({ subtype: spec.subtype, hex: spec.hex, pattern: spec.pattern });
  v.cutout = 'tmp:shop'; v.name = `new ${spec.subtype}`;
  await saveImage('tmp:shop', await canvasToBlob(SH.cut, 'image/png'));
  state.imageUrls.delete('tmp:shop');
  const r = adviseItem(v, spec.emb);
  // projected cost per wear: how often you actually wear this category
  const pool = activeGarments();
  const same = pool.filter((g) => g.category === v.category);
  const perMonth = same.length ? same.reduce((s, g) => s + wearsOf(g.id).length / Math.max(1, (Date.now() - (g.createdAt || Date.now())) / (30 * DAY)), 0) / same.length : 1;
  const yearWears = Math.max(3, Math.round(perMonth * 12));
  const cpw = spec.price ? spec.price / yearWears : null;
  // best outfits it would create
  let wx = null; try { wx = await weatherFor(todayStr()); } catch { /* offline */ }
  const occ = (myOccasions().find(([k]) => k === 'casual') || ['casual'])[0];
  const best = recommend({ occasion: v.formality >= 4 ? 'smart_casual' : occ, date: todayStr(), weather: wx, ignoreWeather: !wx, pool: [...pool, v], mustInclude: [v.id], count: 3, explore: false });
  const p = profile();
  const tone = r.verdict.tone === 'good' ? 'good' : r.verdict.tone === 'ok' ? 'warn' : 'bad';
  const big = r.verdict.tone === 'good' ? 'Buy it' : r.verdict.tone === 'ok' ? 'Maybe' : 'Skip it';
  box.innerHTML = `<div class="card"><div class="row"><div class="ring" style="width:72px;height:72px">${ring(r.verdict.tone === 'good' ? 0.9 : r.verdict.tone === 'ok' ? 0.6 : 0.25, 64)}<b style="font-size:1rem">${big.split(' ')[0]}</b></div>
      <div class="grow"><p class="eyebrow" style="margin:0">Verdict</p><h2 class="display" style="font-size:2rem;font-weight:400;margin:0">${big}</h2><p class="small" style="margin:0"><span class="pill ${tone}">${esc(r.verdict.text)}</span></p></div></div>
    <div class="stats mt">
      <div class="stat">${icon('layers', 18)}<b>+${r.gained}</b><span>new outfits it unlocks</span></div>
      <div class="stat">${icon('grid', 18)}<b>${r.cells.filter((c) => c.before <= 1).length}</b><span>gaps it fills</span></div>
      <div class="stat">${icon('hanger', 18)}<b>${r.dupes.length}</b><span>similar you own</span></div>
      ${cpw != null ? `<div class="stat">${icon('bag', 18)}<b>${fmtMoney(cpw)}</b><span>per wear, year one (~${yearWears} wears)</span></div>` : ''}
    </div>
    <ul class="tips mt">
      ${r.colorNote ? `<li>${icon('palette', 16)}<span>${esc(r.colorNote)}</span></li>` : p.season ? '' : `<li>${icon('palette', 16)}<span><a href="#/profile?step=color">Set your colors</a> to get a color verdict.</span></li>`}
      ${bodyTip(v, p)}
      ${r.dupes.length ? `<li>${icon('info', 16)}<span>You already own ${r.dupes.length === 1 ? `the ${esc(garmentName(r.dupes[0]))}` : r.dupes.length + ' similar pieces'} — think twice.</span></li>` : ''}
      ${SH.link ? `<li>${icon('share', 16)}<span class="tiny" style="word-break:break-all">${esc(SH.link)}</span></li>` : ''}
    </ul>
    ${r.dupes.length ? `<div class="closet-grid mt">${r.dupes.slice(0, 4).map((g) => cell(g)).join('')}</div>` : ''}
    ${best.outfits.length ? `<h3 class="mt2">Outfits it would make with your clothes</h3><div class="looks" id="bestLooks"></div>` : ''}
    <div class="row mt2"><button class="btn primary" id="bought">${icon('check', 16)} I bought it — add to closet</button><button class="btn" id="wish">${icon('heart', 16)} Save to wishlist</button></div></div>`;
  hydrateImages(box);
  const bl = $('#bestLooks', box);
  if (bl) for (const o of best.outfits) {
    const el = document.createElement('div'); el.className = 'card look';
    const cv = await renderOutfit(o.items, { size: 420 }); cv.className = 'ocanvas'; el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div class="ob"><b>${Math.round(o.total * 100)}/100</b><span class="small muted">${esc(o.items.map(garmentName).join(' · '))}</span></div>`);
    bl.appendChild(el);
  }
  $('#bought', box).onclick = async () => {
    const id = uid(); const meta = SUBTYPES[spec.subtype]; const fabric = defaultFabric(spec.subtype); const warmth = deriveWarmth(spec.subtype, fabric, meta.cat);
    const blob = await canvasToBlob(SH.cut, 'image/png');
    await saveImage(`${id}:cutout`, blob); await saveImage(`${id}:original`, await canvasToBlob(SH.canvas, 'image/jpeg', 0.9));
    await saveGarment({ id, name: '', category: meta.cat, subtype: spec.subtype, colors: colorsFromCanvas(SH.cut), pattern: spec.pattern, fabric, formality: meta.f, fit: meta.fit, warmth, season: deriveSeason(warmth, fabric, meta.cat), brand: '', price: spec.price, purchasedAt: todayStr(), status: 'active', needsReview: true, imageHash: 'shop:' + id, original: `${id}:original`, cutout: `${id}:cutout`, cutoutMethod: 'shop', modelVersion: 'shop', confidence: {}, lowConfidence: ['fabric', 'fit'], attrSource: {}, createdAt: Date.now(), laundry: { state: 'clean', wearsSinceWash: 0 } });
    toast('Added — give it a quick check'); go('#/review');
  };
  $('#wish', box).onclick = async () => {
    const list = (await kvGet('wishlist')) || [];
    const key = 'wish:' + uid();
    await saveImage(key, await canvasToBlob(SH.cut, 'image/png'));
    list.unshift({ key, subtype: spec.subtype, hex: spec.hex, pattern: spec.pattern, price: spec.price, gained: r.gained, verdict: big, link: SH.link || '', at: Date.now() });
    await kvSet('wishlist', list.slice(0, 40));
    toast('Saved to your wishlist'); $('#side', view).innerHTML = await wishlistHtml(); bindWishlist(view); hydrateImages($('#side', view));
  };
}

function bodyTip(v, p) {
  if (!p.bodyShape) return '';
  const bold = ['stripe', 'check', 'floral', 'graphic'].includes(v.pattern);
  const tips = {
    triangle: v.category === 'bottom' && bold ? 'Bold patterns below widen the hips for a pear shape — a solid, darker bottom works better.' : v.category === 'top' && bold ? 'Pattern on top balances a pear shape nicely.' : '',
    inverted: v.category === 'top' && bold ? 'Bold patterns on top broaden the shoulders — keep tops simpler for your shape.' : v.category === 'bottom' && (bold || v.fit === 'relaxed') ? 'Volume and pattern below balance broad shoulders — good choice.' : '',
    round: v.fit === 'slim' && v.category === 'top' ? 'Clingy tops draw attention to the middle — choose a regular or relaxed fit.' : '',
    rectangle: v.category === 'outerwear' ? 'Layers add shape to a rectangle frame — good choice.' : '',
    balanced: v.fit === 'oversized' ? 'Oversized cuts hide your natural waist — consider a fitted version.' : '',
  }[p.bodyShape];
  return tips ? `<li>${icon('figure', 16)}<span>${esc(tips)}</span></li>` : '';
}

// Wishlist, ranked: the piece that unlocks the most new outfits comes first and is marked "Best pick"
async function wishlistHtml() {
  const list = (await kvGet('wishlist')) || [];
  const order = list.map((w, i) => ({ w, i })).sort((a, b) => (b.w.gained || 0) - (a.w.gained || 0));
  const best = order.length > 1 && order[0].w.gained > 0 ? order[0].i : -1;
  return `<div class="card"><div class="card-h"><h2>${icon('heart', 18)} Wishlist</h2><span class="small muted">${list.length}</span></div>
    ${list.length > 1 ? `<p class="small muted" style="margin-top:0">Which should you buy? Sorted by how many new outfits each one unlocks.</p>` : ''}
    ${list.length ? `<div class="list">${order.map(({ w, i }) => `<div class="li"><img data-key="${w.key}" alt=""><div class="grow"><div class="row" style="gap:6px"><b>${esc(cap(w.subtype))}</b>${i === best ? '<span class="pill good">Best pick</span>' : ''}</div><div class="tiny muted">+${w.gained} new outfits · ${esc(w.verdict)}${w.price ? ' · ' + fmtMoney(w.price) + (w.gained ? ` · ${fmtMoney(w.price / w.gained)} per outfit` : '') : ''}</div></div>${w.link ? `<a class="btn small icon" href="${esc(w.link)}" target="_blank" rel="noopener" aria-label="Open link">${icon('share', 14)}</a>` : ''}<button class="btn small icon ghost" data-wrm="${i}" aria-label="Remove">${icon('x', 14)}</button></div>`).join('')}</div>
      ${list.length > 1 ? `<button class="btn small mt" id="wRe">${icon('refresh', 14)} Re-check against my closet now</button>` : ''}`
      : '<p class="small muted">Items you’re thinking about appear here, ranked by how many new outfits each one unlocks — so you know which one to buy.</p>'}</div>`;
}
function bindWishlist(view) {
  const side = $('#side', view);
  hydrateImages(side);
  const redraw = async () => { side.innerHTML = await wishlistHtml(); bindWishlist(view); };
  $$('[data-wrm]', view).forEach((b) => b.onclick = async () => { const list = (await kvGet('wishlist')) || []; list.splice(+b.dataset.wrm, 1); await kvSet('wishlist', list); redraw(); });
  const re = $('#wRe', side);
  if (re) re.onclick = async () => {
    re.disabled = true; re.innerHTML = '<span class="spinner sm"></span> Counting…';
    const list = (await kvGet('wishlist')) || [];
    const ranked = await rankCandidates(list.map((w) => makeVirtual({ subtype: w.subtype, hex: w.hex, pattern: w.pattern })));
    ranked.forEach((r, i) => { list[i].gained = r.joins; if (r.dupe) list[i].verdict = 'You now own a similar one'; });
    await kvSet('wishlist', list); redraw(); toast('Wishlist re-ranked');
  };
}
