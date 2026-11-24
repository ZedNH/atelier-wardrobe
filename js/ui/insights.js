import { OCCASIONS, CATEGORIES, CATEGORY_LABEL, SUBTYPES, subtypesOf, PATTERNS, FABRICS } from '../enums.js';
import { state, activeGarments, garmentById } from '../db.js';
import { gapReport, GAP_OCCASIONS, GAP_BANDS, costPerWearReport, deadStock, paletteMap, capsule, adviseItem, makeVirtual, wardrobeStats } from '../insights.js';
import { profileStatements, setLocked, resetPrefs, prefs } from '../learning.js';
import { recommend, scoreOutfit, outfitKey } from '../recommender.js';
import { weatherFor, todayStr, fmtTemp } from '../weather.js';
import { renderOutfit } from '../preview.js';
import { fileToCanvas, colorsFromCanvas, segmentLocal, scaleCanvas, makeCanvas } from '../vision.js';
import { makeColor, deltaE, primaryColor } from '../color.js';
import * as ai from '../ai.js';
import { esc, garmentName, fmtMoney, cosine } from '../util.js';
import { $, $$, toast, hydrateImages, select, swatch, emptyState, bar, icon, pageHead } from './dom.js';
import { styleDNA, subtypeOptions, profile } from '../profile.js';
import { cell } from './closet.js';

const later = (fn) => new Promise((r) => setTimeout(() => r(fn()), 30));
const li = (g, right = '', sub = '') => `<a class="li" href="#/closet/${g.id}" style="text-decoration:none"><img data-key="${g.cutout}" alt=""><div class="grow"><div>${esc(garmentName(g))}</div>${sub ? `<div class="tiny muted">${sub}</div>` : ''}</div><div class="small">${right}</div></a>`;

export async function render(view) {
  const pool = activeGarments();
  if (pool.length < 4) { view.innerHTML = `${pageHead('Wardrobe intelligence', 'Insights')}${emptyState('chart', 'Not enough data yet', 'Add a few garments (or load the demo wardrobe) and insights appear here.', '<a class="btn primary" href="#/add">Add clothes</a>')}`; return; }
  const st = wardrobeStats();
  const value = pool.reduce((s, g) => s + (g.price || 0), 0);
  const dna = styleDNA(pool);
  view.innerHTML = `
    ${pageHead('Wardrobe intelligence', 'Insights', 'What you own, what you wear, what is missing — and what not to buy.', `<a class="btn small" href="#/me">${icon('dna', 16)} Style DNA: ${esc(dna.archetype)}</a>`)}
    <div class="qa" style="margin-top:0;margin-bottom:16px">
      <a href="#/shop">${icon('bag', 20)}<span>Should I buy?<small>Check before you buy</small></span></a>
      <a href="#/declutter">${icon('leaf', 20)}<span>Declutter<small>Sell, donate, keep</small></span></a>
      <a href="#/me">${icon('dna', 20)}<span>Style DNA<small>${esc(dna.archetype)}</small></span></a>
    </div>
    <div class="stats">
      <div class="stat">${icon('hanger', 20)}<b>${st.total}</b><span>active pieces</span></div>
      <div class="stat">${icon('refresh', 20)}<b>${Math.round(st.rotation * 100)}%</b><span>worn in 30 days</span></div>
      <div class="stat">${icon('layers', 20)}<b>${st.outfitsWorn}</b><span>outfits logged</span></div>
      <div class="stat">${icon('bag', 20)}<b>${fmtMoney(value)}</b><span>wardrobe value</span></div>
    </div>
    <section class="section card" id="gap"><div class="card-h"><h2>${icon('grid', 18)} Gap analysis</h2></div><p class="small muted">Valid outfits for every occasion × weather cell. Empty cells are real gaps.</p><div class="row"><span class="spinner sm"></span> <span class="small muted">Counting combinations…</span></div></section>
    <div class="split even section" style="align-items:start"><section class="card" id="cpw"></section><section class="card" id="dead"></section></div>
    <section class="section card" id="pal"></section>
    <section class="section card" id="cap"><div class="card-h"><h2>${icon('target', 18)} Capsule generator</h2></div><p class="small muted">Pick the fewest items that make the most distinct outfits.</p>
      <div class="row"><label class="f">Items<input type="number" id="capN" min="5" max="40" value="12" style="width:90px"></label><label class="f">Weather<select id="capT"><option value="24">warm</option><option value="15" selected>mild</option><option value="5">cold</option></select></label><button class="btn primary" id="capGo">Generate</button></div><div id="capOut" class="mt"></div></section>
    <section class="section card" id="shop"></section>
    <section class="section card" id="restyle"></section>
    <section class="section card" id="profile"></section>`;

  // gap analysis (heavy -> after first paint)
  later(() => gapReport()).then((g) => {
    const color = (n) => (n === 0 ? 'background:color-mix(in srgb,var(--bad) 22%,transparent);color:var(--bad)' : n <= 2 ? 'background:color-mix(in srgb,var(--warn) 22%,transparent)' : n <= 10 ? 'background:color-mix(in srgb,var(--good) 14%,transparent)' : 'background:color-mix(in srgb,var(--good) 30%,transparent)');
    $('#gap', view).innerHTML = `<div class="card-h"><h2>${icon('grid', 18)} Gap analysis</h2></div><p><b>${esc(g.headline)}</b> ${esc(g.advice)}</p>
      <div class="matrix mt" style="grid-template-columns:110px repeat(${GAP_BANDS.length},minmax(52px,1fr))">
        <div></div>${GAP_BANDS.map((b) => `<div class="mh">${b.label}<br><span class="tiny">${fmtTemp(b.temp)}</span></div>`).join('')}
        ${GAP_OCCASIONS.map((o) => `<div class="mh" style="text-align:left">${OCCASIONS[o].label}</div>${GAP_BANDS.map((b) => `<div class="mc" style="${color(g.matrix[o][b.key])}">${g.matrix[o][b.key] >= 99 ? '99+' : g.matrix[o][b.key]}</div>`).join('')}`).join('')}
      </div>
      ${g.suggestions.length ? `<h3 class="mt2">What to buy next <span class="faint" style="font-weight:500">— only if you want to</span></h3><div class="list">${g.suggestions.map((s) => `<div class="li">${swatch(s.archetype.hex, 26)}<div class="grow"><b>${esc(s.archetype.name)}</b><div class="tiny muted">${s.cells.slice(0, 4).map((c) => `${OCCASIONS[c.occasion].label}/${c.band}: ${c.before}→${c.after}`).join(' · ')}</div></div><span class="pill good">+${s.gained} outfits</span></div>`).join('')}</div>` : ''}`;
  });

  // cost per wear
  const c = costPerWearReport();
  $('#cpw', view).innerHTML = `<div class="card-h"><h2>${icon('bag', 18)} Cost per wear</h2></div>${c.items.length ? `
    <p class="small muted">Price paid ÷ logged wears. ${c.unpriced ? `${c.unpriced} items have no price yet — add one on the item page.` : ''}</p>
    <div><div><h3>Most expensive per wear</h3><div class="list">${c.items.slice(0, 5).map((x) => li(x.g, fmtMoney(x.cpw), `${x.wears} wears · paid ${fmtMoney(x.g.price)}`)).join('')}</div></div>
    <div class="mt2"><h3>Best value</h3><div class="list">${c.items.slice().reverse().slice(0, 5).map((x) => li(x.g, fmtMoney(x.cpw), `${x.wears} wears`)).join('')}</div></div></div>
    <h3 class="mt">By category</h3><table class="t"><tr><th>Category</th><th>Spent</th><th>Wears</th><th>Per wear</th></tr>${c.byCategory.map((r) => `<tr><td>${r.label}</td><td>${fmtMoney(r.spent)}</td><td>${r.wears}</td><td><b>${fmtMoney(r.cpw)}</b></td></tr>`).join('')}</table>` : '<p class="muted small">Add prices to garments to see cost per wear.</p>'}`;

  // dead stock
  let wx = null; try { wx = await weatherFor(todayStr()); } catch { wx = null; }
  const d = deadStock(wx);
  $('#dead', view).innerHTML = `<div class="card-h"><h2>${icon('leaf', 18)} Dead stock</h2></div><p class="small muted">Unworn for 90+ days, grouped by why the engine never picks them.</p>
    ${d.items.length ? Object.entries(d.groups).map(([reason, xs]) => `<h3 class="mt">${esc(reason)} <span class="pill">${xs.length}</span></h3><div class="list">${xs.map((x) => li(x.g, x.neverWorn ? 'never worn' : `${x.idle} days`)).join('')}</div>`).join('') : emptyState('check', 'Nothing idle', 'Every piece has been worn in the last 90 days.')}`;

  // palette
  const p = paletteMap();
  $('#pal', view).innerHTML = `<div class="card-h"><h2>${icon('palette', 18)} Color palette</h2>${profile().seasonName ? `<a class="btn small" href="#/me">Your ${esc(profile().seasonName)} palette</a>` : ''}</div><div class="palette">${p.list.map((c) => `<div title="${esc(c.name)} ${Math.round(c.share * 100)}%" style="flex:${c.share};background:${c.hex}"></div>`).join('')}</div>
    <div class="row mt small">${p.list.slice(0, 10).map((c) => `<span class="pill">${swatch(c.hex, 10)} ${esc(c.name)} ${Math.round(c.share * 100)}%</span>`).join('')}</div>
    <p class="small mt">${Math.round(p.neutralShare * 100)}% neutrals. ${p.missingNeutrals.length ? `Missing staple neutrals: <b>${p.missingNeutrals.join(', ')}</b>.` : 'All staple neutrals covered.'} ${p.neighbours.length ? `Colors that would sit next to your favorites: <b>${p.neighbours.join(', ')}</b>.` : ''}</p>`;

  // capsule
  $('#capGo', view).onclick = async () => {
    const out = $('#capOut', view); out.innerHTML = '<span class="spinner sm"></span> Optimising…';
    const r = await later(() => capsule(+$('#capN', view).value || 12, ['casual', 'smart_casual', 'work'], +$('#capT', view).value));
    out.innerHTML = `<p><b>${r.items.length} items → ${r.outfits} distinct outfits</b> across casual, smart-casual and work.</p><div class="closet-grid">${r.items.map((g) => cell(g)).join('')}</div>`;
    hydrateImages(out);
  };

  shoppingAdvisor($('#shop', view));
  restyle($('#restyle', view), wx);
  styleProfile($('#profile', view));
  hydrateImages(view);
}

function shoppingAdvisor(box) {
  box.innerHTML = `<div class="card-h"><h2>${icon('bag', 18)} Shopping advisor</h2></div><p class="small muted">Thinking of buying something? See how many new outfits it unlocks and whether it duplicates what you own.</p>
    <form class="form" id="sf">
      <label class="f">Category${select('category', CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]), 'top')}</label>
      <label class="f">Type<select name="subtype">${subtypeOptions('top').map((s) => `<option>${s}</option>`).join('')}</select></label>
      <label class="f">Color<input type="color" name="color" value="#3a3d42"></label>
      <label class="f">Pattern${select('pattern', PATTERNS, 'solid')}</label>
      <label class="f">Or a photo<input type="file" name="photo" accept="image/*"></label>
      <div style="grid-column:1/-1"><button class="btn primary">Should I buy it?</button></div></form><div id="sres" class="mt"></div>`;
  const f = $('#sf', box);
  f.category.onchange = () => { f.subtype.innerHTML = subtypeOptions(f.category.value).map((s) => `<option>${s}</option>`).join(''); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const res = $('#sres', box); res.innerHTML = '<span class="spinner sm"></span> Checking…';
    let hex = f.color.value, subtype = f.subtype.value, pattern = f.pattern.value, emb = null;
    const file = f.photo.files[0];
    if (file) {
      const cv = await fileToCanvas(file, 800); const seg = segmentLocal(cv); const cut = seg ? seg.canvas : cv;
      hex = colorsFromCanvas(cut)[0].hex;
      if (state.settings.aiEnabled) { try { await ai.loadAI(); emb = await ai.embedImage(cut); const a = ai.classify(emb); subtype = a.subtype; pattern = a.pattern; } catch { /* keep form values */ } }
    }
    const v = makeVirtual({ subtype, hex, pattern });
    const r = await later(() => adviseItem(v, emb));
    res.innerHTML = `<div class="card flat"><p><span class="pill ${r.verdict.tone === 'good' ? 'good' : r.verdict.tone === 'ok' ? 'warn' : 'bad'}">${r.verdict.tone === 'good' ? 'Buy' : r.verdict.tone === 'ok' ? 'Maybe' : 'Skip'}</span> <b>${esc(r.verdict.text)}</b></p>
      <p class="small">${swatch(hex)} ${esc(v.colors[0].name)} ${esc(subtype)} · ${esc(pattern)}</p>
      ${r.colorNote ? `<p class="small">${icon('palette', 14)} ${esc(r.colorNote)}</p>` : ''}
      ${r.cells.length ? `<p class="tiny muted">New outfits in: ${r.cells.slice(0, 8).map((c) => `${OCCASIONS[c.occasion].label} (${c.band}) +${c.after - c.before}`).join(', ')}</p>` : ''}
      ${r.dupes.length ? `<div class="closet-grid mt">${r.dupes.map((g) => cell(g)).join('')}</div>` : ''}</div>`;
    hydrateImages(res);
  };
}

// Inspiration-image restyle: closest achievable outfit from YOUR wardrobe.
function restyle(box, wx) {
  box.innerHTML = `<div class="card-h"><h2>${icon('wand', 18)} Restyle from inspiration</h2></div><p class="small muted">Upload a photo of an outfit you like. ${state.settings.aiEnabled ? 'The on-device AI compares its style vector with your clothes' : 'Colors are matched region by region (enable AI in Settings for style matching too)'} and builds the closest outfit you can actually wear.</p>
    <label class="btn primary">${icon('image', 16)} Choose inspiration photo<input type="file" accept="image/*" hidden id="insp"></label><div id="rout" class="mt"></div>`;
  $('#insp', box).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const out = $('#rout', box); out.innerHTML = '<span class="spinner sm"></span> Reading the look…';
    const cv = await fileToCanvas(file, 800);
    const W = cv.width, H = cv.height;
    const region = (y0, y1) => { const c = makeCanvas(W * 0.8, H * (y1 - y0)); c.getContext('2d').drawImage(cv, W * 0.1, H * y0, W * 0.8, H * (y1 - y0), 0, 0, c.width, c.height); return c; };
    const upper = region(0.12, 0.5), lower = region(0.5, 0.88);
    const colU = colorsFromCanvas(upper)[0], colL = colorsFromCanvas(lower)[0];
    let embAll = null, embU = null, embL = null;
    if (state.settings.aiEnabled) { try { await ai.loadAI(); embAll = await ai.embedImage(cv); embU = await ai.embedImage(upper); embL = await ai.embedImage(lower); } catch { /* color only */ } }
    const pool = activeGarments();
    const scoreItem = (g, col, emb) => {
      const cs = Math.max(0, 1 - deltaE(primaryColor(g).lab, col.lab) / 45);
      const es = emb && g.embedding ? (cosine(emb, g.embedding) - 0.15) * 2.2 : 0;
      return emb && g.embedding ? 0.4 * cs + 0.6 * es : cs;
    };
    const best = (cats, col, emb) => pool.filter((g) => cats.includes(g.category)).map((g) => ({ g, s: scoreItem(g, col, emb) })).sort((a, b) => b.s - a.s);
    const tops = best(['top', 'outerwear', 'dress'], colU, embU || embAll).slice(0, 4);
    const bots = best(['bottom'], colL, embL || embAll).slice(0, 4);
    const shoes = best(['footwear'], colL, embAll).slice(0, 3);
    const ctx = { occasion: 'smart_casual', date: todayStr(), weather: wx, ignoreWeather: true };
    let bestO = null;
    for (const t of tops) for (const b of (t.g.category === 'dress' ? [{ g: null, s: t.s }] : bots)) for (const s of shoes.length ? shoes : [{ g: null, s: 0 }]) {
      const items = [t.g, b.g, s.g].filter(Boolean);
      if (t.g.category === 'outerwear') { const inner = best(['top'], colU, embU).find((x) => x.g); if (inner) items.splice(1, 0, inner.g); }
      const sim = (t.s + b.s + s.s * 0.5) / 2.5; const sc = scoreOutfit(items, ctx).total;
      const v = 0.65 * sim + 0.35 * sc;
      if (!bestO || v > bestO.v) bestO = { items, v, sim };
    }
    if (!bestO) { out.innerHTML = '<p class="muted">Not enough tops/bottoms/shoes to rebuild this look.</p>'; return; }
    const canvas = await renderOutfit(bestO.items, { size: 520 });
    const url = URL.createObjectURL(file);
    out.innerHTML = `<div class="grid g2"><div><p class="small muted">Inspiration</p><img src="${url}" style="width:100%;border-radius:12px" alt=""></div><div id="rc"><p class="small muted">Closest from your wardrobe · ${Math.round(bestO.sim * 100)}% match</p></div></div>
      <p class="small mt">Matched ${swatch(colU.hex)} ${esc(colU.name)} up top and ${swatch(colL.hex)} ${esc(colL.name)} below${embAll ? ', plus overall style similarity' : ''}.</p>`;
    canvas.style.width = '100%'; canvas.style.borderRadius = '12px';
    $('#rc', out).appendChild(canvas);
  };
}

function styleProfile(box) {
  const st = profileStatements(); const p = prefs();
  box.innerHTML = `<div class="card-h"><h2>${icon('dna', 18)} What I’ve learned about your taste</h2></div><p class="small muted">Learned from ${p.n} signals (wears, likes, skips, saved outfits), starting from your quiz and your closet. Switch off anything that isn’t you.</p>
    <div>${st.map((s) => `<div class="profile-row"><span>${esc(s.text)}</span>${bar(Math.min(1, s.strength / 1.5))}<label class="small row"><input type="checkbox" data-k="${s.key}" ${s.locked ? '' : 'checked'}> on</label></div>`).join('')}</div>
    <div class="row mt"><button class="btn small" id="exp">${icon('download', 14)} Export profile</button><a class="btn small" href="#/settings?quiz=1">Retake style quiz</a><button class="btn small danger" id="rst">Reset learning</button></div>`;
  $$('[data-k]', box).forEach((c) => c.onchange = async () => { await setLocked(c.dataset.k, !c.checked); toast(c.checked ? 'Back on' : 'Switched off'); });
  $('#exp', box).onclick = async () => { const { saveBlob } = await import('../native.js'); const r = await saveBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile: profileStatements(), raw: prefs() }, null, 2)], { type: 'application/json' }), 'style-profile.json'); if (r === 'saved') toast('Saved to Downloads'); };
  $('#rst', box).onclick = async () => { await resetPrefs(); toast('Learning reset'); styleProfile(box); };
}
