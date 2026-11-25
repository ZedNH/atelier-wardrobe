import { state, del } from '../db.js';
import { answer, refine, STARTERS as BASE_STARTERS, STARTERS_SA } from '../stylist.js';
import { myRegion } from '../profile.js';
import { outfitKey } from '../recommender.js';
import { recordSuggestion, logWear, saveManualOutfit } from '../actions.js';
import { renderOutfit } from '../preview.js';
import { OCCASIONS } from '../enums.js';
import { profile } from '../profile.js';
import { esc } from '../util.js';
import { $, $$, toast, icon, watchLook } from './dom.js';
import { brainOn, brainSettings, aiStylist, LLM_PROVIDERS } from '../llm.js';
import { parseRequest } from '../context.js';
import { weatherFor, todayStr } from '../weather.js';
import { isWeekend } from '../profile.js';
import { normalizeBangla } from '../i18n.js';

// conversation survives navigation within the session
const C = { msgs: [], lastAsk: null, seen: new Set() };
const starters = () => (myRegion() === 'sa' ? [...STARTERS_SA, ...BASE_STARTERS] : BASE_STARTERS);

export async function render(view) {
  const p = profile();
  view.innerHTML = `<div class="chat">
    <div class="chat-head"><div class="chat-av">${icon('sparkles', 24)}</div><div><p class="eyebrow" style="margin:0">On-device · private</p><h1>Your <em>stylist</em></h1></div>
      <button class="btn small ghost" id="clr" style="margin-left:auto">${icon('refresh', 14)} New chat</button></div>
    <div class="msgs" id="msgs"></div>
    <div class="composer"><div class="chips" id="sugg"></div>
      <form id="cf"><input name="q" placeholder="Ask about any outfit, piece, color or trip…" autocomplete="off" aria-label="Message"><button class="btn primary" aria-label="Send">${icon('send', 18)}</button></form></div></div>`;
  const box = $('#msgs', view);
  if (!C.msgs.length) C.msgs.push({ who: 'bot', html: `<p>Hi${p.name ? ' ' + esc(p.name) : ''} — I’m your personal stylist. I only suggest clothes you own, and I always tell you why. What are we dressing for?</p>`, chips: starters() });
  for (const m of C.msgs) await paint(box, m);
  setChips(view, C.msgs[C.msgs.length - 1].chips || starters());
  scrollEnd();
  $('#cf', view).onsubmit = (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (!q) return; e.target.q.value = ''; send(view, q); };
  $('#clr', view).onclick = () => { C.msgs = []; C.lastAsk = null; C.seen = new Set(); render(view); };
  $('#sugg', view).onclick = (e) => { const b = e.target.closest('.chip'); if (b) send(view, b.dataset.q); };
}

function setChips(view, list) {
  $('#sugg', view).innerHTML = (list || []).map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
}
const scrollEnd = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

async function send(view, q) {
  const box = $('#msgs', view);
  const me = { who: 'me', html: `<p>${esc(q)}</p>` }; C.msgs.push(me); await paint(box, me);
  const typing = document.createElement('div'); typing.className = 'msg bot'; typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; box.appendChild(typing); scrollEnd();
  const ref = refine(q, C.lastAsk);
  const ask = ref || q;
  let res;
  const simple = /^(hi|hello|hey|help|what can you do)|weather|laundry|what should i buy|haven.t i worn|cost per wear/i.test(q);
  if (brainOn() && !simple) {
    try { res = await askBrain(ask); } catch (e) { console.warn(e); toast('AI stylist: ' + (e.message || e) + ' — using the built-in stylist', 5000); }
  }
  if (!res) { try { res = await answer(ask, { exclude: C.seen }); } catch (e) { console.error(e); res = { html: `<p>Sorry — something went wrong (${esc(e.message || e)}).</p>` }; } }
  await new Promise((r) => setTimeout(r, 350));
  typing.remove();
  if (res.outfits?.length) { C.lastAsk = ask; for (const { o } of res.outfits) C.seen.add(outfitKey(o.items)); }
  const m = { who: 'bot', ...res }; C.msgs.push(m);
  await paint(box, m);
  setChips(view, res.chips || starters().slice(0, 6));
  scrollEnd();
}

async function paint(box, m) {
  const el = document.createElement('div'); el.className = `msg ${m.who}`; el.innerHTML = m.html;
  box.appendChild(el);
  if (!m.outfits?.length) return;
  const cards = document.createElement('div'); cards.className = 'cards'; el.appendChild(cards);
  for (const { o, ctx } of m.outfits) {
    if (!o._row) o._row = await recordSuggestion(o, ctx);
    const c = document.createElement('div'); c.className = 'mini-look'; watchLook(c, o.items, 'Stylist look');
    const cv = await renderOutfit(o.items, { size: 360, mode: state.settings.view }); c.appendChild(cv);
    c.insertAdjacentHTML('beforeend', `<div class="mb2"><div class="row between"><b style="color:var(--ink)">${Math.round(o.total * 100)}<span class="faint">/100</span></b>${o.stretch ? `<span class="pill accent">${icon('sparkles', 12)} stretch</span>` : `<span class="pill">${esc(OCCASIONS[ctx.occasion]?.label || '')}</span>`}</div><span>${esc(o.rationale)}</span>
      <div class="row nowrap"><button class="btn small primary" data-a="wear">${icon('check', 14)} Wear</button><a class="btn small icon" href="#/tryon?items=${o.items.map((g) => g.id).join(',')}" aria-label="Try on">${icon('figure', 16)}</a><button class="btn small icon" data-a="save" aria-label="Save to lookbook">${icon(o._saved ? 'heartFill' : 'heart', 16)}</button></div></div>`);
    c.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'wear') { await logWear(o.items, { ctx, fromOutfit: o._row, date: ctx.date }); b.disabled = true; b.textContent = 'Logged'; toast('Wear logged'); }
      else if (o._saved) { await del('outfits', o._saved.id); state.outfits = state.outfits.filter((x) => x.id !== o._saved.id); o._saved = null; b.innerHTML = icon('heart', 16); toast('Removed from lookbook'); }
      else { o._saved = await saveManualOutfit(o.items, 'Stylist pick', o.features, ctx); b.innerHTML = icon('heartFill', 16); toast('Saved to your lookbook'); }
    });
    cards.appendChild(c);
  }
}

// Ask the user's own AI provider (Claude, ChatGPT, Gemini, Grok…) to pick outfits from the closet
async function askBrain(q) {
  const { ctx: pc } = parseRequest(normalizeBangla(q), {});
  const date = pc.date || todayStr();
  let weather = null; try { weather = await weatherFor(date); } catch { /* offline */ }
  const occasion = pc.occasion || (isWeekend(new Date(date + 'T12:00:00').getDay()) ? 'casual' : 'work');
  const history = C.msgs.filter((m) => m.who === 'me').map((m) => m.html.replace(/<[^>]+>/g, ''));
  const r = await aiStylist(q, { weather, date, occasionGuess: occasion, history });
  const s = brainSettings();
  return { html: `<p>${esc(r.reply)}</p><p class="tiny faint">${icon('sparkles', 12)} ${esc(LLM_PROVIDERS[s.provider]?.label || 'AI')}</p>`, outfits: r.outfits, chips: ['Another option', 'Make it more formal', 'Add accessories'] };
}
