// Declutter & resell screen + 30-wears challenge.
import { saveGarment } from '../db.js';
import { declutterPlan, snoozeKeep, challenge, suggestChallenge, startChallenge, stopChallenge, challengeStatus } from '../declutter.js';
import { esc, garmentName, fmtMoney } from '../util.js';
import { $, $$, toast, icon, pageHead, seg, bindChips, hydrateImages, emptyState, bar, ring, haptic } from './dom.js';

const V = { tab: 'sell' };
const TABS = [['sell', 'Sell'], ['donate', 'Donate'], ['try', 'Try again'], ['keep', 'Keep']];

export async function render(view) {
  const plan = declutterPlan();
  const lists = { sell: plan.sell, donate: plan.donate, try: plan.tryAgain, keep: plan.keep };
  view.innerHTML = `${pageHead('Closet health', 'Declutter & <em>resell</em>', 'Every piece is judged from how you actually dress: when you last wore it, what it goes with, duplicates and whether the color suits you.')}
    <div class="stats">
      <div class="stat">${icon('bag', 20)}<b>${fmtMoney(plan.resaleTotal)}</b><span>estimated resale value</span></div>
      <div class="stat">${icon('refresh', 20)}<b>${Math.round(plan.utilization * 100)}%</b><span>of closet worn in 90 days</span></div>
      <div class="stat">${icon('leaf', 20)}<b>${plan.sell.length + plan.donate.length}</b><span>pieces to let go</span></div>
      <div class="stat">${icon('sparkles', 20)}<b>${plan.tryAgain.length}</b><span>forgotten gems</span></div>
    </div>
    <section class="section card" id="chal"></section>
    <section class="section">
      <div class="section-h"><div><p class="eyebrow">Suggestions</p><h2>What to do with each piece</h2></div>${seg('dtab', TABS.map(([k, l]) => [k, `${l} <span class="faint">${lists[k].length}</span>`]), V.tab)}</div>
      <div id="dlist"></div>
    </section>`;
  bindChips(view, 'dtab', (v) => { V.tab = v; drawList(); });
  drawChallenge($('#chal', view), () => render(view));
  drawList();

  function drawList() {
    const box = $('#dlist', view); const rows = lists[V.tab];
    if (!rows.length) { box.innerHTML = emptyState(V.tab === 'keep' ? 'check' : 'leaf', V.tab === 'sell' ? 'Nothing to sell' : V.tab === 'donate' ? 'Nothing to donate' : V.tab === 'try' ? 'No forgotten gems' : 'Nothing here', 'Your closet is working hard — nice.'); return; }
    box.innerHTML = `<div class="dl-grid">${rows.map((r) => row(r)).join('')}</div>`;
    hydrateImages(box);
    $$('[data-act]', box).forEach((b) => b.onclick = async () => {
      const r = rows.find((x) => x.g.id === b.dataset.id); const g = r.g; const a = b.dataset.act; haptic(10);
      if (a === 'sold' || a === 'donated') { g.status = a; g.archivedAt = Date.now(); await saveGarment(g); toast(a === 'sold' ? `Marked sold${r.resale ? ' — about ' + fmtMoney(r.resale) : ''}` : 'Marked donated — thank you'); }
      else if (a === 'keep') { await snoozeKeep(g.id); toast('Kept — I won’t ask again for 90 days'); }
      else if (a === 'style') { location.hash = `#/today?around=${g.id}`; return; }
      render(view);
    });
  }
}

function row(r) {
  const g = r.g;
  const acts = {
    sell: `<button class="btn small primary" data-act="sold" data-id="${g.id}">${icon('bag', 14)} Mark sold</button><button class="btn small" data-act="keep" data-id="${g.id}">Keep</button>`,
    donate: `<button class="btn small primary" data-act="donated" data-id="${g.id}">${icon('heart', 14)} Mark donated</button><button class="btn small" data-act="keep" data-id="${g.id}">Keep</button>`,
    try: `<button class="btn small primary" data-act="style" data-id="${g.id}">${icon('sparkles', 14)} Style it</button><button class="btn small" data-act="keep" data-id="${g.id}">Keep</button>`,
    keep: `<a class="btn small" href="#/closet/${g.id}">Open</a>`,
  }[r.action];
  return `<div class="card dl-item"><a href="#/closet/${g.id}" class="dl-img"><img data-key="${g.cutout}" alt=""></a><div class="dl-body">
    <b>${esc(garmentName(g))}</b>
    <div class="tiny muted">${r.wears} wears · ${r.partners} matching pieces${r.resale && (r.action === 'sell' || r.action === 'donate') ? ` · resale ≈ <b>${fmtMoney(r.resale)}</b>` : ''}</div>
    <p class="small" style="margin:6px 0 10px">${esc(r.reasons.join(' · '))}</p>
    <div class="row">${acts}</div></div></div>`;
}

function drawChallenge(box, rerender) {
  const st = challengeStatus();
  if (!st) {
    const sug = suggestChallenge();
    box.innerHTML = `<div class="card-h"><h2>${icon('trophy', 18)} 30-wears challenge</h2></div>
      <p class="small muted">Promise to wear each of these at least 30 times before buying anything similar — the most sustainable outfit is one you already own. I picked pieces that go with lots of your clothes but are under-worn.</p>
      ${sug.length ? `<div class="chal-picks">${sug.map((g) => `<label class="chal-pick"><input type="checkbox" value="${g.id}" checked><img data-key="${g.cutout}" alt=""><span>${esc(garmentName(g))}</span></label>`).join('')}</div>
      <div class="row mt"><button class="btn primary" id="startC">${icon('flame', 16)} Start challenge</button></div>` : '<p class="small">Add a few more clothes to start a challenge.</p>'}`;
    hydrateImages(box);
    const sb = $('#startC', box); if (sb) sb.onclick = async () => { const ids = $$('input:checked', box).map((i) => i.value); if (!ids.length) return toast('Pick at least one piece'); await startChallenge(ids); toast('Challenge started — good luck!'); rerender(); };
    return;
  }
  box.innerHTML = `<div class="card-h"><h2>${icon('trophy', 18)} 30-wears challenge</h2><button class="btn small ghost" id="stopC">End</button></div>
    <div class="row"><div class="ring" style="width:72px;height:72px">${ring(st.progress, 64)}<b>${Math.round(st.progress * 100)}%</b></div>
      <div class="grow"><b>${st.done} of ${st.items.length} pieces reached 30 wears</b><div class="small muted">Day ${st.days + 1}${st.next ? ` · next up: ${esc(garmentName(st.next.g))} (${st.next.wears}/30)` : ' · all done!'}</div></div>
      ${st.next ? `<a class="btn small primary" href="#/today?around=${st.next.g.id}">${icon('sparkles', 14)} Wear it today</a>` : ''}</div>
    <div class="list mt">${st.items.map((x) => `<div class="li"><img data-key="${x.g.cutout}" alt=""><div class="grow"><div class="row between small"><span>${esc(garmentName(x.g))}</span><b>${Math.min(x.wears, 30)}/30</b></div>${bar(x.wears / 30)}</div></div>`).join('')}</div>`;
  hydrateImages(box);
  $('#stopC', box).onclick = async () => { await stopChallenge(); toast('Challenge ended'); rerender(); };
}
export { challenge };
