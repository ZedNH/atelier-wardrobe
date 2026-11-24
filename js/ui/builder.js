import { OCCASIONS, CATEGORY_LABEL } from '../enums.js';
import { state, activeGarments, garmentById } from '../db.js';
import { scoreOutfit, compatHint, rationale, needsLayer, WEIGHT_LABEL, weights } from '../recommender.js';
import { saveManualOutfit, logWear } from '../actions.js';
import { renderOutfit } from '../preview.js';
import { weatherFor, todayStr, fmtTemp } from '../weather.js';
import { myOccasions } from '../profile.js';
import { esc, garmentName } from '../util.js';
import { $, $$, toast, modal, hydrateImages, chips, bindChips, bar, icon, pageHead, ring } from './dom.js';
import { wxIcon } from './icons.js';

const SLOT_ORDER = ['outerwear', 'top', 'bottom', 'dress', 'footwear', 'accessory', 'headwear'];
const B = { picks: {}, occasion: 'casual' };

export async function render(view, r) {
  const withId = r.query.get('with');
  if (withId) { const g = garmentById(withId); if (g) { B.picks[g.category] = g.id; if (g.category === 'dress') { delete B.picks.top; delete B.picks.bottom; } } }
  let wx = null; try { wx = await weatherFor(todayStr()); } catch { wx = null; }
  const logMode = r.query.get('log') === '1';
  const dot = (c) => `<span class="hint-dot" style="background:${c}"></span>`;
  view.innerHTML = `
    <a href="#/today" class="back">${icon('back', 16)} Today</a>
    ${pageHead(logMode ? 'Wear log' : 'Studio', logMode ? 'Log what you <em>wore</em>' : 'Outfit <em>builder</em>', `Build slot by slot. Live compatibility: ${dot('#2e7d5b')} great · ${dot('#b7791f')} ok · ${dot('#b4433b')} clashes. Manual outfits teach me your taste fastest.`)}
    <div class="card">${chips('occ', myOccasions().map(([k, o]) => [k, o.label]), B.occasion)}
      <p class="small muted mt">${wx ? `${icon(wxIcon(wx.code), 14)} ${fmtTemp(wx.feels)} today — weather rules apply` : 'No weather — set a location in Settings for weather-aware hints'}</p></div>
    <div class="split mt">
      <div><div class="slots" id="slots"></div></div>
      <div class="card look" id="prev"></div>
    </div>
    <div class="row mt"><button class="btn primary" id="wear">${icon('check', 16)} I’m wearing this today</button>${logMode ? '' : `<button class="btn" id="save">${icon('heart', 16)} Save to lookbook</button>`}<button class="btn ghost" id="clear">Clear</button></div>
    <div class="section"><div class="section-h"><div><p class="eyebrow">Lookbook</p><h2>Saved looks</h2></div></div><div class="looks" id="saved"></div></div>`;
  bindChips(view, 'occ', (v) => { B.occasion = v; draw(); });
  const ctx = () => ({ occasion: B.occasion, date: todayStr(), weather: wx });
  const picked = () => SLOT_ORDER.map((s) => garmentById(B.picks[s])).filter(Boolean);

  async function draw() {
    const items = picked();
    const hasDress = !!B.picks.dress;
    const slots = SLOT_ORDER.filter((s) => !(hasDress && (s === 'top' || s === 'bottom')) && !(!hasDress && (B.picks.top || B.picks.bottom) && s === 'dress'));
    $('#slots', view).innerHTML = slots.map((s) => {
      const g = garmentById(B.picks[s]);
      return `<div class="slot ${g ? 'filled' : ''}" data-slot="${s}">${g ? `<img data-key="${g.cutout}" alt=""><span>${esc(garmentName(g))}</span><button class="btn small ghost" data-rm="${s}">remove</button>` : `${icon('plus', 26)}<span>${CATEGORY_LABEL[s]}</span><span class="tiny muted">${['top', 'bottom', 'footwear'].includes(s) || (s === 'dress') ? '' : 'optional'}</span>`}</div>`;
    }).join('');
    hydrateImages(view);
    $$('[data-slot]', view).forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-rm]')) { delete B.picks[e.target.closest('[data-rm]').dataset.rm]; draw(); return; }
      pick(el.dataset.slot);
    }));
    const prev = $('#prev', view);
    if (!items.length) { prev.innerHTML = '<div class="ob"><p class="muted">Pick a few pieces to see the preview, score and rationale.</p></div>'; return; }
    const c = ctx(); const sc = scoreOutfit(items, c);
    const canvas = await renderOutfit(items, { size: 600, mode: state.settings.view });
    canvas.className = 'ocanvas';
    prev.innerHTML = '<div class="media"></div>'; prev.firstChild.appendChild(canvas);
    prev.firstChild.insertAdjacentHTML('beforeend', `<div class="ov"><div class="ring">${ring(sc.total, 44, '#b4532a')}<b>${Math.round(sc.total * 100)}</b></div></div>`);
    const W = weights();
    const complete = (B.picks.dress || (B.picks.top && B.picks.bottom)) && B.picks.footwear;
    prev.insertAdjacentHTML('beforeend', `<div class="ob"><div class="row between"><span class="n display" style="font-size:1.5rem">Your look</span>${complete ? '<span class="pill good">complete</span>' : '<span class="pill warn">needs top + bottom (or dress) + shoes</span>'}</div>
      ${complete ? `<div class="why">${esc(rationale({ ...sc, items }, c, needsLayer(wx)))}</div>` : ''}
      <div class="score-k">${Object.keys(W).map((k) => `<span>${WEIGHT_LABEL[k]}</span>${bar(sc.parts[k])}<span class="tiny muted">${Math.round(sc.parts[k] * 100)}</span>`).join('')}</div></div>`);
  }

  function pick(slot) {
    const items = picked().filter((g) => g.category !== slot);
    const list = activeGarments().filter((g) => g.category === slot).map((g) => ({ g, h: compatHint(g, items, ctx()) })).sort((a, b) => b.h.q - a.h.q);
    modal(`<h2>${CATEGORY_LABEL[slot]}</h2>${list.length ? `<div class="picker">${list.map(({ g, h }) => {
      const col = h.q >= 0.72 ? '#2e7d5b' : h.q >= 0.6 ? '#b7791f' : '#b4433b';
      const off = g.laundry?.state === 'dirty' || g.laundry?.state === 'washing';
      return `<div class="gcell ${off ? 'dim' : ''}" data-pick="${g.id}"><div class="gimg"><img data-key="${g.cutout}" alt=""></div><div class="gl"><span class="hint-dot" style="background:${col}"></span><span>${esc(garmentName(g))}</span></div>${!h.fOk ? '<span class="lstate">formality</span>' : !h.wOk ? '<span class="lstate">weather</span>' : off ? '<span class="lstate">laundry</span>' : ''}</div>`;
    }).join('')}</div>` : '<p class="muted">You have no active items in this category.</p>'}`, {
      wide: true,
      onMount: (m, close) => {
        hydrateImages(m);
        $$('[data-pick]', m).forEach((el) => el.onclick = () => {
          B.picks[slot] = el.dataset.pick;
          if (slot === 'dress') { delete B.picks.top; delete B.picks.bottom; }
          if (slot === 'top' || slot === 'bottom') delete B.picks.dress;
          close(); draw();
        });
      },
    });
  }

  async function drawSaved() {
    const box = $('#saved', view); if (!box) return;
    const saved = state.outfits.filter((o) => o.source === 'manual').slice(-12).reverse();
    if (!saved.length) { box.innerHTML = '<p class="small muted">No saved looks yet — tap the heart on any suggestion, or save one here.</p>'; return; }
    box.innerHTML = '';
    for (const o of saved) {
      const items = o.items.map((i) => garmentById(i.garmentId)).filter(Boolean);
      if (!items.length) continue;
      const el = document.createElement('div'); el.className = 'card look';
      const c = await renderOutfit(items, { size: 400 }); c.className = 'ocanvas'; el.appendChild(c);
      el.insertAdjacentHTML('beforeend', `<div class="ob"><b>${esc(o.name || 'My look')}</b><div class="acts"><button class="btn small" data-load>${icon('pen', 14)} Edit</button><button class="btn small primary" data-wear>Wear today</button></div></div>`);
      el.querySelector('[data-load]').onclick = () => { B.picks = {}; for (const g of items) B.picks[g.category] = g.id; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      el.querySelector('[data-wear]').onclick = async (e) => { await logWear(items, { ctx: ctx(), features: o.features, source: 'manual' }); e.target.disabled = true; e.target.textContent = 'Logged'; toast('Wear logged'); };
      box.appendChild(el);
    }
  }

  $('#clear', view).onclick = () => { B.picks = {}; draw(); };
  $('#wear', view).onclick = async () => {
    const items = picked(); if (!items.length) return toast('Pick some items first');
    const sc = scoreOutfit(items, ctx());
    await logWear(items, { ctx: ctx(), features: sc.features, source: 'manual' });
    toast('Wear logged — thanks! That is the strongest learning signal.');
  };
  const sv = $('#save', view);
  if (sv) sv.onclick = () => {
    const items = picked(); if (items.length < 2) return toast('Pick at least two items');
    modal(`<h2>Save outfit</h2><form id="nf"><input name="n" placeholder="Name, e.g. Friday client lunch" style="width:100%"><div class="row end mt"><button class="btn primary">Save</button></div></form>`, {
      onMount: (m, close) => { $('#nf', m).onsubmit = async (e) => { e.preventDefault(); const sc = scoreOutfit(items, ctx()); await saveManualOutfit(items, e.target.n.value.trim(), sc.features, ctx()); close(); toast('Saved'); drawSaved(); }; },
    });
  };
  draw(); drawSaved();
}
