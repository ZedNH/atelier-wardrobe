// All outfits: every good combination your closet can make for an occasion, best first.
// Built in the background and drawn lazily (only the tiles you scroll to are rendered).
import { OCCASIONS } from '../enums.js';
import { state } from '../db.js';
import { generate, outfitKey, rationale, accessorize } from '../recommender.js';
import { weatherFor, todayStr, fmtTemp } from '../weather.js';
import { renderOutfit } from '../preview.js';
import { logWear, saveManualOutfit } from '../actions.js';
import { myOccasions } from '../profile.js';
import { esc, garmentName } from '../util.js';
import { primaryColor } from '../color.js';
import { $, $$, toast, modal, icon, pageHead, chips, bindChips, emptyState, switchEl, rememberLook } from './dom.js';

const O = { occasion: null, weather: true, shown: 0, list: [] };
const PAGE = 24;

export async function render(view) {
  O.occasion = O.occasion || (new Date().getDay() % 6 === 0 ? 'casual' : 'work');
  view.innerHTML = `${pageHead('Every combination', 'All outfits', 'Every outfit your closet can make for the occasion, best first. Tap one to wear, save or try it on.')}
    ${chips('occ', myOccasions().map(([k, o]) => [k, o.label]), O.occasion)}
    <div class="row between mt"><p class="count-line" id="ocount">Finding combinations…</p><label class="row small nowrap">${switchEl('owx', O.weather)} Today’s weather</label></div>
    <div class="outfit-grid" id="ogrid"></div><div id="omore" class="center mt"></div>`;
  bindChips(view, 'occ', (v) => { O.occasion = v; build(view); });
  $('#owx', view).onchange = (e) => { O.weather = e.target.checked; build(view); };
  build(view);
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); drawTile(e.target); } }, { rootMargin: '300px 0px' }) : null;

async function build(view) {
  const grid = $('#ogrid', view); grid.innerHTML = '<div class="skeleton" style="height:200px;grid-column:1/-1"></div>';
  await new Promise((r) => setTimeout(r, 30));
  let wx = null; if (O.weather) { try { wx = await weatherFor(todayStr()); } catch { /* offline */ } }
  const ctx = { occasion: O.occasion, date: todayStr(), weather: wx, ignoreWeather: !wx, explore: false };
  const { cands, eligible: el, layer } = generate(ctx, { maxBases: 900 });
  const seen = new Set(); const list = [];
  // one tile per *look*: identical-looking pieces (same type + colour) don't make a new outfit
  const looksKey = (items) => items.filter((g) => !['accessory', 'headwear'].includes(g.category)).map((g) => g.subtype + ':' + primaryColor(g).name).sort().join('|');
  for (const c of cands) { const k = looksKey(c.items); if (seen.has(k) || c.total < 0.55) continue; seen.add(k); list.push(c); }
  const accPool = [...(el.slots.accessory || []), ...(el.slots.headwear || [])];
  O.list = list.map((c) => ({ ...c, items: [...c.items, ...accessorize(c.items, el.occ, wx, accPool, { max: 2 })], ctx, layer }));
  O.shown = 0;
  $('#ocount', view).textContent = O.list.length ? `${O.list.length} outfit${O.list.length === 1 ? '' : 's'} for ${OCCASIONS[O.occasion].label.toLowerCase()}${wx ? ` at ${fmtTemp(wx.feels)}` : ''}` : '';
  grid.innerHTML = O.list.length ? '' : `<div style="grid-column:1/-1">${emptyState('info', 'No outfits for this occasion', 'Your closet has nothing that fits this dress code yet — try another occasion or add a few pieces.', '<a class="btn" href="#/shop">See what to buy</a>')}</div>`;
  more(view);
}

function more(view) {
  const grid = $('#ogrid', view); const next = O.list.slice(O.shown, O.shown + PAGE);
  for (const [i, o] of next.entries()) {
    const n = O.shown + i;
    const el = document.createElement('button'); el.className = 'otile'; el.dataset.n = n;
    el.innerHTML = `<div class="otile-img"></div><div class="otile-b"><b>${Math.round(o.total * 100)}</b><span>${o.items.filter((g) => !['accessory', 'headwear'].includes(g.category)).map((g) => esc(g.subtype)).join(' · ')}</span></div>`;
    el.onclick = () => openOutfit(o, n);
    grid.appendChild(el);
    if (io) io.observe(el); else drawTile(el);
  }
  O.shown += next.length;
  const m = $('#omore', view);
  m.innerHTML = O.shown < O.list.length ? `<button class="btn" id="omoreBtn">Show more (${O.list.length - O.shown} left)</button>` : '';
  const b = $('#omoreBtn', view); if (b) b.onclick = () => more(view);
}

async function drawTile(el) {
  const o = O.list[+el.dataset.n]; if (!o) return;
  const c = await renderOutfit(o.items, { size: 320, mode: state.settings.view }); c.className = 'ocanvas';
  el.querySelector('.otile-img').appendChild(c);
}

async function openOutfit(o, n) {
  rememberLook(o.items, `Outfit ${n + 1} · All outfits`);
  modal(`<h2>Outfit ${n + 1}</h2><div class="otile-big" id="obig"></div>
    <p class="small muted">${esc(rationale(o, o.ctx, o.layer))}</p>
    <p class="tiny faint">${o.items.map((g) => esc(garmentName(g))).join(' · ')}</p>
    <div class="row mt"><button class="btn primary" id="owear">${icon('check', 16)} Wear this</button><button class="btn" id="osave">${icon('heart', 16)} Save</button><a class="btn" href="#/tryon?items=${o.items.map((g) => g.id).join(',')}">${icon('figure', 16)} Try on</a></div>`, {
    onMount: async (m, close) => {
      const c = await renderOutfit(o.items, { size: 640, mode: state.settings.view }); c.className = 'ocanvas'; $('#obig', m).appendChild(c);
      $('#owear', m).onclick = async () => { await logWear(o.items, { ctx: o.ctx, date: todayStr() }); toast('Wear logged'); close(); };
      $('#osave', m).onclick = async () => { await saveManualOutfit(o.items, `${OCCASIONS[O.occasion]?.label || 'My'} look`, o.features, o.ctx); toast('Saved to your lookbook'); close(); };
      $$('a', m).forEach((a) => a.addEventListener('click', () => close()));
    },
  });
}
