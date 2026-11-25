// Style hub: daily mirror check-in + streak + style diary, closet score, budget, challenges,
// inspiration copier, outfit photo booth (story cards), ask-a-friend polls and Wardrobe Wrapped.
import { state, activeGarments, saveImage, imageUrl, imageBlob, garmentById } from '../db.js';
import { todayStr, addDays, weatherFor } from '../weather.js';
import { recommend, scoreOutfit, outfitKey } from '../recommender.js';
import { renderOutfit } from '../preview.js';
import { logWear } from '../actions.js';
import { fileToCanvas, colorsFromCanvas, makeCanvas, scaleCanvas, canvasToBlob } from '../vision.js';
import { primaryColor, deltaE, makeColor } from '../color.js';
import { profile, myRegion, myWear } from '../profile.js';
import { makeVirtual, rankCandidates } from '../insights.js';
import * as ai from '../ai.js';
import { esc, garmentName, fmtMoney, cosine } from '../util.js';
import { shareFiles, saveBlob } from '../native.js';
import { $, $$, toast, modal, icon, pageHead, ring, bar, emptyState, hydrateImages, haptic } from './dom.js';
import { gicon, productArt } from './icons.js';
import { checkins, addCheckin, streakOf, closetScore, budgetReport, saveBudget, challengeState, joinChallenge, wrappedStats } from '../hub.js';

export async function render(view, r) {
  const C = await checkins(); const st = streakOf(C.map((c) => c.date));
  view.innerHTML = `${pageHead('Your style, every day', 'Style hub', 'Daily check-ins, your closet score, budget, challenges and fun ways to share your looks.')}
    <section class="card hub-checkin">
      <div class="hub-streak"><div class="flame ${st.current ? 'on' : ''}">${icon('sparkles', 26)}</div><div><b>${st.current}</b><span>day streak</span></div><div class="tiny muted">Best: ${st.best} · ${C.length} check-ins</div></div>
      <div class="grow"><h2 style="margin:0">${st.doneToday ? 'Checked in today ✓' : 'Daily mirror check-in'}</h2><p class="small muted" style="margin:4px 0 10px">${st.doneToday ? 'Come back tomorrow to keep the streak going.' : 'Snap a mirror photo of today’s outfit — you get a look score and it’s saved in your style diary.'}</p>
        <div class="row"><button class="btn primary" id="ciCam">${icon('camera', 16)} ${st.doneToday ? 'Check in again' : 'Check in now'}</button><label class="btn">${icon('image', 16)} Upload<input type="file" accept="image/*" hidden id="ciUp"></label></div></div>
    </section>
    <div id="ciOut"></div>
    <section class="card mt"><div class="card-h"><h2>${icon('calendar', 18)} Style diary</h2><span class="small muted">${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div><div class="diary" id="diary"></div></section>
    <div class="hub-tools">
      <button data-tool="insp">${icon('wand', 22)}<b>Inspiration copier</b><span>Recreate any look from your closet</span></button>
      <button data-tool="booth">${icon('image', 22)}<b>Photo booth</b><span>Story cards for Instagram & WhatsApp</span></button>
      <button data-tool="poll">${icon('users', 22)}<b>Ask a friend</b><span>“A or B?” poll card</span></button>
      <button data-tool="wrapped">${icon('star', 22)}<b>Wardrobe Wrapped</b><span>Your year in style</span></button>
    </div>
    <section class="card mt" id="score"><div class="row"><span class="spinner sm"></span><span class="small muted">Scoring your closet…</span></div></section>
    <section class="card mt" id="budget"></section>
    <section class="card mt" id="chal"></section>`;
  $('#ciCam', view).onclick = async () => { const { cameraModal } = await import('./tryon.js'); cameraModal({ facing: 'environment', timer: 3, title: 'Mirror check-in', guide: 'body' }, (c) => doCheckin(view, c)); };
  $('#ciUp', view).onchange = async (e) => { const f = e.target.files[0]; if (f) doCheckin(view, await fileToCanvas(f, 1200)); };
  $$('[data-tool]', view).forEach((b) => b.onclick = () => ({ insp: inspiration, booth: () => boothPicker(), poll: askFriend, wrapped })[b.dataset.tool]());
  diary($('#diary', view), C);
  budgetCard($('#budget', view));
  challengesCard($('#chal', view));
  setTimeout(() => scoreCard($('#score', view)), 300);
  if (r?.query?.get('tool')) setTimeout(() => $(`[data-tool="${r.query.get('tool')}"]`, view)?.click(), 200);
}

// ---------------- check-in ----------------
async function doCheckin(view, canvas) {
  const out = $('#ciOut', view); out.innerHTML = '<div class="card mt"><div class="row"><span class="spinner sm"></span> Reading your outfit…</div></div>';
  const { rateLook } = await import('./tryon.js'); const { fitCanvas } = await import('../bodyscan.js');
  const c = fitCanvas(canvas, 720);
  const thumb = await canvasToBlob(scaleCanvas(canvas, 360), 'image/jpeg', 0.8);
  let res = null;
  try { res = await rateLook(c, out); } catch (e) { out.innerHTML = `<div class="card mt"><p class="pill warn" style="white-space:normal">${esc(e.message || e)}</p><p class="small muted">Your check-in still counts for the streak.</p></div>`; }
  const date = todayStr(); const key = `checkin:${date}`;
  await saveImage(key, thumb); state.imageUrls?.delete?.(key);
  await addCheckin({ date, score: res ? Math.round(res.total * 100) : null, ids: res?.matched?.map((g) => g.id) || [], photo: key, at: Date.now() });
  haptic(14); toast('Checked in — streak saved');
  const C = await checkins(); const st = streakOf(C.map((x) => x.date));
  $('.hub-streak b', view).textContent = st.current; $('.flame', view).classList.add('on');
  diary($('#diary', view), C);
}

function diary(box, C) {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1); const daysIn = new Date(y, m + 1, 0).getDate(); const lead = (first.getDay() + 6) % 7;
  const byDate = new Map(C.map((c) => [c.date, c]));
  const worn = new Set(state.wear.map((w) => w.wornOn));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="dd empty"></div>');
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; const c = byDate.get(ds);
    cells.push(`<button class="dd ${ds === todayStr() ? 'today' : ''} ${c ? 'has' : worn.has(ds) ? 'worn' : ''}" data-d="${ds}">${c ? `<img data-key="${c.photo}" alt="">` : ''}<span>${d}</span>${c?.score ? `<i>${c.score}</i>` : ''}</button>`);
  }
  box.innerHTML = `<div class="dw">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}</div><div class="dg">${cells.join('')}</div><p class="tiny muted mt">Photo = check-in · dot = outfit logged</p>`;
  hydrateImages(box);
  $$('.dd.has', box).forEach((b) => b.onclick = async () => {
    const c = byDate.get(b.dataset.d); const items = (c.ids || []).map(garmentById).filter(Boolean);
    modal(`<h2>${new Date(c.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2><img id="dimg" style="width:100%;border-radius:18px" alt="">${c.score ? `<p class="mt"><b>Look score ${c.score}</b></p>` : ''}${items.length ? `<p class="small muted">${items.map((g) => esc(garmentName(g))).join(' · ')}</p>` : ''}`,
      { onMount: async (mm) => { $('#dimg', mm).src = await imageUrl(c.photo); } });
  });
}

// ---------------- closet score ----------------
async function scoreCard(box) {
  if (!box) return;
  let r; try { r = await closetScore(); } catch (e) { console.warn(e); }
  if (!box.isConnected) return;
  if (!r) { box.innerHTML = `<div class="card-h"><h2>${icon('target', 18)} Closet score</h2></div><p class="small muted">Add a few more clothes to get your score.</p>`; return; }
  box.innerHTML = `<div class="card-h"><h2>${icon('target', 18)} Closet score</h2><span class="pill accent">${esc(r.grade)}</span></div>
    <div class="score-hero"><div class="ring big" style="width:110px;height:110px">${ring(r.score / 100, 104)}<b>${r.score}</b></div>
      <div class="grow"><p class="small" style="margin:0">Your closet makes about <b>${r.outfits.toLocaleString()}</b> everyday outfits.</p>
      <div class="score-k mt">${r.parts.map((p) => `<span>${esc(p.label)}</span>${bar(p.v)}<span class="tiny faint">${Math.round(p.v * p.w)}/${p.w}</span>`).join('')}</div></div></div>
    <ul class="tips mt">${r.weakest.map((p) => `<li>${icon('sparkles', 16)}<span><b>${esc(p.label)}:</b> ${esc(p.tip)}</span></li>`).join('')}
      ${r.buy ? `<li>${icon('bag', 16)}<span>Fastest boost: one <b>${esc(r.buy.v.name)}</b> would add <b>+${r.buy.joins}</b> outfits. <a href="#/shop">See best buys</a></span></li>` : ''}</ul>`;
}

// ---------------- budget ----------------
async function budgetCard(box) {
  const r = await budgetReport(); const max = Math.max(1, ...r.months.map((m) => m.spent), r.monthly || 0);
  box.innerHTML = `<div class="card-h"><h2>${icon('bag', 18)} Clothing budget</h2>${r.noBuyDays != null ? `<span class="pill">${r.noBuyDays} days since last buy</span>` : ''}</div>
    ${r.monthly ? `<div class="budget-top"><div><b>${fmtMoney(r.spent)}</b><span class="small muted"> of ${fmtMoney(r.monthly)} this month</span></div><span class="pill ${r.left < 0 ? 'bad' : r.left < r.monthly * 0.2 ? 'warn' : 'good'}">${r.left < 0 ? `${fmtMoney(-r.left)} over` : `${fmtMoney(r.left)} left`}</span></div>${bar(Math.min(1, r.spent / r.monthly))}` : '<p class="small muted" style="margin-top:0">Set a monthly budget — I count what you add with a price and warn you in Shop before an impulse buy.</p>'}
    <div class="months">${r.months.map((m) => `<div><i style="height:${Math.round((m.spent / max) * 100)}%" class="${r.monthly && m.spent > r.monthly ? 'over' : ''}"></i><span>${esc(m.label)}</span></div>`).join('')}</div>
    ${r.month.length ? `<div class="list mt">${r.month.slice(0, 6).map((x) => `<a class="li" href="#/closet/${x.g.id}"><img data-key="${x.g.id}:thumb" data-fallback="${x.g.cutout}" alt=""><div class="grow"><b>${esc(garmentName(x.g))}</b><div class="tiny muted">${esc(x.date)}</div></div><b>${fmtMoney(x.price)}</b></a>`).join('')}</div>` : ''}
    <div class="row mt"><label class="f" style="flex:1;min-width:140px">Monthly budget<input type="number" min="0" step="1" id="bm" value="${r.monthly || ''}" placeholder="e.g. 5000"></label><button class="btn small primary" id="bsave">Save</button></div>
    <p class="tiny muted">Tip: add the price and purchase date on each item so it counts. Items bought in Shop are counted automatically.</p>`;
  hydrateImages(box);
  $('#bsave', box).onclick = async () => { await saveBudget({ monthly: +$('#bm', box).value || 0 }); toast('Budget saved'); budgetCard(box); };
}

// ---------------- challenges ----------------
async function challengesCard(box) {
  const rows = await challengeState();
  const won = rows.filter((r) => r.badge);
  box.innerHTML = `<div class="card-h"><h2>${icon('star', 18)} Style challenges</h2><span class="small muted">${won.length} badge${won.length === 1 ? '' : 's'}</span></div>
    ${won.length ? `<div class="badges">${won.map((r) => `<span class="badge-chip">${icon('star', 14)} ${esc(r.c.badge)}</span>`).join('')}</div>` : ''}
    <div class="chal-list">${rows.map((r) => `<div class="chal ${r.done ? 'done' : ''}"><div class="grow"><b>${esc(r.c.title)}</b><p class="tiny muted" style="margin:2px 0 6px">${esc(r.c.desc)}</p>
      ${r.joined ? `${bar(r.n / r.c.goal)}<span class="tiny ${r.done ? 'good-t' : r.failed ? 'bad-t' : 'muted'}">${r.done ? 'Completed! Badge earned' : r.failed ? `Time’s up — ${r.n}/${r.c.goal}` : `${r.n}/${r.c.goal} · ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left`}</span>` : ''}</div>
      <button class="btn small ${r.joined ? 'ghost' : 'primary'}" data-ch="${r.c.id}" data-on="${r.joined && !r.failed && !r.done ? '0' : '1'}">${r.joined && !r.failed && !r.done ? 'Leave' : r.done || r.failed ? 'Again' : 'Start'}</button></div>`).join('')}</div>
    <p class="tiny muted mt">Progress updates from the outfits you log (Wear this) and your mirror check-ins.</p>`;
  for (const r of rows) if (r.justWon) toast(`Badge earned: ${r.c.badge}!`, 4000);
  $$('[data-ch]', box).forEach((b) => b.onclick = async () => { await joinChallenge(b.dataset.ch, b.dataset.on === '1'); haptic(10); challengesCard(box); });
}

// ---------------- story-card drawing helpers ----------------
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = () => getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
function storyCanvas(w = 1080, h = 1920) { const c = makeCanvas(w, h); return [c, c.getContext('2d')]; }
function bgGrad(x, w, h, a, b) { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, w, h); }
function wrapText(x, text, cx, y, maxW, lh, align = 'center') {
  x.textAlign = align; const words = String(text).split(' '); let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, cx, y); y += lh; line = w; } else line = t; }
  if (line) { x.fillText(line, cx, y); y += lh; } return y;
}
function roundRect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
async function blobImg(blob) { return blob ? await createImageBitmap(blob) : null; }
async function shareCanvas(c, name, text) {
  const blob = await canvasToBlob(c, 'image/jpeg', 0.92); const file = new File([blob], name, { type: 'image/jpeg' });
  const r = await shareFiles([file], { text, title: 'Atelier' }); if (r === 'downloaded') toast('Saved as an image');
}
function showCanvasModal(title, c, { name, text, extra = '' } = {}) {
  modal(`<h2>${esc(title)}</h2><div class="story-prev" id="sp"></div>${extra}<div class="row mt"><button class="btn primary" id="sShare">${icon('share', 16)} Share</button><button class="btn" id="sSave">${icon('download', 16)} Save</button></div>`, {
    onMount: (m) => {
      c.style.cssText = 'width:100%;border-radius:18px;display:block'; $('#sp', m).appendChild(c);
      $('#sShare', m).onclick = () => shareCanvas(c, name, text);
      $('#sSave', m).onclick = async () => saveBlob(await canvasToBlob(c, 'image/jpeg', 0.92), name);
    },
  });
}

// ---------------- photo booth ----------------
async function lookChoices() {
  let wx = null; try { wx = await weatherFor(todayStr()); } catch { /* offline */ }
  const res = recommend({ occasion: new Date().getDay() % 6 === 0 ? 'casual' : 'work', date: todayStr(), weather: wx, count: 3, explore: false });
  const saved = state.outfits.filter((o) => o.source === 'manual').slice(-6).reverse().map((o) => ({ items: o.items.map((i) => garmentById(i.garmentId)).filter(Boolean), name: o.name }));
  const { lastLook } = await import('./dom.js'); const l = lastLook();
  const cur = l ? [{ items: l.ids.map(garmentById).filter(Boolean), name: l.label }] : [];
  return [...cur, ...res.outfits.map((o, i) => ({ items: o.items, name: `Today’s look ${i + 1}` })), ...saved].filter((x) => x.items.length >= 2);
}
async function boothPicker() {
  const looks = await lookChoices();
  if (!looks.length) return toast('Add more clothes first — the booth needs a look');
  pickLook('Which look?', looks, (l) => photoBooth(l.items, { caption: l.name }));
}
function pickLook(title, looks, cb, multi = 1) {
  const chosen = [];
  modal(`<h2>${esc(title)}</h2><p class="small muted">${multi > 1 ? `Pick ${multi} looks.` : 'Tap a look.'}</p><div class="pick-looks" id="pl"></div>${multi > 1 ? `<button class="btn primary block mt" id="plGo" disabled>Continue</button>` : ''}`, {
    onMount: async (m, close) => {
      const box = $('#pl', m);
      for (const [i, l] of looks.slice(0, 9).entries()) {
        const b = document.createElement('button'); b.className = 'pick-look'; b.innerHTML = `<span class="tiny">${esc(l.name || 'Look')}</span>`;
        const cv = await renderOutfit(l.items, { size: 260 }); b.prepend(cv);
        b.onclick = () => {
          if (multi === 1) { close(); cb(l); return; }
          const k = chosen.indexOf(l); if (k >= 0) { chosen.splice(k, 1); b.classList.remove('on'); } else if (chosen.length < multi) { chosen.push(l); b.classList.add('on'); }
          $('#plGo', m).disabled = chosen.length !== multi;
        };
        box.appendChild(b);
      }
      const go = $('#plGo', m); if (go) go.onclick = () => { close(); cb(...chosen); };
    },
  });
}
export async function photoBooth(items, { caption = '' } = {}) {
  const T = { style: 'editorial', photo: null, caption: caption || 'Today’s look' };
  const C = await checkins(); const last = C.filter((c) => c.date === todayStr()).pop();
  if (last) T.photo = await blobImg(await imageBlob(last.photo));
  const draw = async () => {
    const [c, x] = storyCanvas(); const W = 1080, H = 1920;
    const cols = items.filter((g) => !['accessory', 'headwear'].includes(g.category)).map((g) => primaryColor(g).hex);
    const outfit = await renderOutfit(items, { size: 900 });
    if (T.style === 'editorial') {
      bgGrad(x, W, H, '#f4efe6', '#e6ddd0');
      x.fillStyle = '#1b1714'; x.font = `italic 120px ${SERIF}`; x.textAlign = 'left'; x.fillText('OOTD', 80, 210);
      x.font = `500 38px ${SANS()}`; x.fillStyle = '#6b6158'; x.fillText(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase(), 84, 270);
      if (T.photo) { const ph = T.photo; const pw = 430, phh = Math.min(760, pw * ph.height / ph.width); x.save(); roundRect(x, 590, 330, pw, phh, 36); x.clip(); x.drawImage(ph, 590, 330, pw, phh); x.restore(); x.drawImage(outfit, 20, 330, 600, 600); }
      else x.drawImage(outfit, 90, 330, 900, 900);
      let y = T.photo ? 1130 : 1290;
      x.fillStyle = '#1b1714'; x.font = `56px ${SERIF}`; y = wrapText(x, T.caption, W / 2, y, 900, 66);
      x.font = `34px ${SANS()}`; x.fillStyle = '#4a423b';
      for (const g of items.slice(0, 6)) { y += 8; x.fillStyle = primaryColor(g).hex; x.beginPath(); x.arc(150, y - 12, 14, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.15)'; x.stroke(); x.fillStyle = '#4a423b'; x.textAlign = 'left'; x.fillText(garmentName(g), 185, y); y += 46; }
    } else if (T.style === 'polaroid') {
      bgGrad(x, W, H, cols[0] || '#333', cols[1] || '#111'); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, W, H);
      x.save(); x.translate(W / 2, 860); x.rotate(-0.04); x.fillStyle = '#fbfaf7'; x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 50; x.fillRect(-430, -560, 860, 1080); x.shadowBlur = 0;
      if (T.photo) { const ph = T.photo; const s = Math.max(780 / ph.width, 800 / ph.height); x.save(); x.beginPath(); x.rect(-390, -520, 780, 800); x.clip(); x.drawImage(ph, -ph.width * s / 2, -520 + (800 - ph.height * s) / 2, ph.width * s, ph.height * s); x.restore(); }
      else x.drawImage(outfit, -390, -520, 780, 780);
      x.fillStyle = '#2b2622'; x.font = `italic 60px ${SERIF}`; x.textAlign = 'center'; x.fillText(T.caption.slice(0, 26), 0, 420); x.restore();
      if (T.photo) x.drawImage(outfit, W - 420, H - 520, 360, 360);
      x.fillStyle = '#fff'; x.font = `600 40px ${SANS()}`; x.textAlign = 'center'; x.fillText(new Date().toLocaleDateString(), W / 2, H - 110);
    } else {
      x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
      x.drawImage(outfit, 90, 300, 900, 900);
      x.fillStyle = '#fff'; x.font = `700 92px ${SANS()}`; x.textAlign = 'left'; x.fillText(T.caption.slice(0, 18), 90, 210);
      cols.forEach((h, i) => { x.fillStyle = h; roundRect(x, 90 + i * 190, 1290, 170, 170, 30); x.fill(); x.fillStyle = '#ddd'; x.font = `26px ${SANS()}`; x.fillText(makeColor(h).name, 90 + i * 190, 1500); });
      x.fillStyle = '#aaa'; x.font = `34px ${SANS()}`; let y = 1600; for (const g of items.slice(0, 5)) { x.fillText('— ' + garmentName(g), 90, y); y += 48; }
    }
    x.fillStyle = T.style === 'editorial' ? '#9a8f84' : 'rgba(255,255,255,.7)'; x.font = `600 26px ${SANS()}`; x.textAlign = 'center'; x.fillText('styled with Atelier', W / 2, H - 50);
    return c;
  };
  modal(`<h2>Photo booth</h2><div class="seg" data-chips="bst">${[['editorial', 'Editorial'], ['polaroid', 'Polaroid'], ['minimal', 'Bold']].map(([k, l]) => `<button class="chip ${k === T.style ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="row mt"><input id="bcap" value="${esc(T.caption)}" maxlength="40" style="flex:1"><label class="btn small">${icon('user', 14)} My photo<input type="file" accept="image/*" hidden id="bph"></label></div>
    <div class="story-prev mt" id="sp"></div>
    <div class="row mt"><button class="btn primary" id="sShare">${icon('share', 16)} Share story</button><button class="btn" id="sSave">${icon('download', 16)} Save</button></div>`, {
    wide: true,
    onMount: async (m) => {
      let cur = null; const sp = $('#sp', m);
      const redraw = async () => { sp.innerHTML = '<div class="skeleton" style="aspect-ratio:9/16"></div>'; cur = await draw(); cur.style.cssText = 'width:100%;border-radius:18px;display:block'; sp.innerHTML = ''; sp.appendChild(cur); };
      m.querySelector('[data-chips=bst]').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; $$('[data-chips=bst] .chip', m).forEach((x) => x.classList.toggle('on', x === b)); T.style = b.dataset.v; redraw(); };
      let tt; $('#bcap', m).oninput = (e) => { T.caption = e.target.value || ' '; clearTimeout(tt); tt = setTimeout(redraw, 400); };
      $('#bph', m).onchange = async (e) => { const f = e.target.files[0]; if (f) { T.photo = await createImageBitmap(await fileToCanvas(f, 1200)); redraw(); } };
      $('#sShare', m).onclick = () => cur && shareCanvas(cur, 'atelier-ootd.jpg', T.caption);
      $('#sSave', m).onclick = async () => cur && saveBlob(await canvasToBlob(cur, 'image/jpeg', 0.92), 'atelier-ootd.jpg');
      redraw();
    },
  });
}

// ---------------- ask a friend ----------------
async function askFriend() {
  const looks = await lookChoices();
  if (looks.length < 2) return toast('Need at least two looks — save a few to your lookbook or add clothes');
  pickLook('Ask a friend: pick two looks', looks, async (a, b) => {
    const [c, x] = storyCanvas(1080, 1350); const W = 1080, H = 1350;
    bgGrad(x, W, H, '#f6f1ea', '#e9e0d4');
    x.fillStyle = '#1b1714'; x.font = `italic 86px ${SERIF}`; x.textAlign = 'center'; x.fillText('A or B?', W / 2, 140);
    x.font = `36px ${SANS()}`; x.fillStyle = '#6b6158'; x.fillText('Help me pick today’s outfit', W / 2, 200);
    for (const [i, l] of [a, b].entries()) {
      const X = 50 + i * 500; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.12)'; x.shadowBlur = 30; roundRect(x, X, 260, 480, 900, 40); x.fill(); x.shadowBlur = 0;
      const o = await renderOutfit(l.items, { size: 460 }); x.drawImage(o, X + 10, 300, 460, 460);
      x.fillStyle = '#b4532a'; x.beginPath(); x.arc(X + 240, 840, 56, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = `700 64px ${SANS()}`; x.fillText(i ? 'B' : 'A', X + 240, 862);
      x.fillStyle = '#4a423b'; x.font = `28px ${SANS()}`; let y = 950; for (const g of l.items.filter((g2) => !['accessory', 'headwear'].includes(g2.category)).slice(0, 4)) { x.fillText(garmentName(g).slice(0, 28), X + 240, y); y += 40; }
    }
    x.fillStyle = '#9a8f84'; x.font = `600 26px ${SANS()}`; x.fillText('Reply A or B · styled with Atelier', W / 2, H - 40);
    showCanvasModal('Ask a friend', c, { name: 'atelier-a-or-b.jpg', text: 'Which should I wear — A or B? Reply with A or B 🙂',
      extra: `<p class="small muted mt">Share it on WhatsApp or Messenger. When your friends answer, tap the winner to wear it:</p><div class="row"><button class="btn small" id="winA">A won — wear it</button><button class="btn small" id="winB">B won — wear it</button></div>` });
    setTimeout(() => {
      const wear = async (l) => { await logWear(l.items, { ctx: { occasion: 'casual', date: todayStr() }, date: todayStr(), source: 'friend-pick' }); toast('Logged — enjoy the winning look!'); };
      $('#winA') && ($('#winA').onclick = () => wear(a)); $('#winB') && ($('#winB').onclick = () => wear(b));
    }, 100);
  }, 2);
}

// ---------------- inspiration copier ----------------
function inspiration() {
  modal(`<h2>Inspiration copier</h2><p class="small muted">Pick a photo of a look you love — a celebrity, Pinterest or a friend. I rebuild it from your own closet and tell you the one piece that’s missing.</p>
    <div class="row"><label class="btn primary">${icon('image', 16)} Choose photo<input type="file" accept="image/*" hidden id="ip"></label></div><div id="io" class="mt"></div>`, {
    wide: true,
    onMount: (m) => { $('#ip', m).onchange = async (e) => { const f = e.target.files[0]; if (f) copyLook(await fileToCanvas(f, 900), $('#io', m)); }; },
  });
}
async function copyLook(cv, out) {
  out.innerHTML = '<div class="row"><span class="spinner sm"></span> Reading the look…</div>';
  const W = cv.width, H = cv.height;
  const region = (y0, y1) => { const c = makeCanvas(W * 0.7, H * (y1 - y0)); c.getContext('2d').drawImage(cv, W * 0.15, H * y0, W * 0.7, H * (y1 - y0), 0, 0, c.width, c.height); return c; };
  const parts = { top: region(0.15, 0.5), bottom: region(0.5, 0.85), footwear: region(0.86, 1) };
  const col = Object.fromEntries(Object.entries(parts).map(([k, c]) => [k, colorsFromCanvas(c)[0]]));
  const emb = {}; const guess = {};
  if (state.settings.aiEnabled) {
    try { await ai.loadAI(); for (const [k, c] of Object.entries(parts)) { emb[k] = await ai.embedImage(c); const a = ai.classify(emb[k], { colorName: col[k]?.name }); if (a.category === k || (k === 'top' && ['dress', 'outerwear'].includes(a.category))) guess[k] = a.subtype; } } catch { /* colors only */ }
  }
  const pool = activeGarments();
  const sc = (g, k) => { const c = col[k]; const cs = c ? Math.max(0, 1 - deltaE(primaryColor(g).lab, c.lab) / 40) : 0.5; const es = emb[k] && g.embedding ? Math.max(0, (cosine(emb[k], g.embedding) - 0.15) * 2.2) : null; const ts = guess[k] && g.subtype === guess[k] ? 0.25 : 0; return (es == null ? cs : 0.45 * cs + 0.55 * es) + ts; };
  const best = (cats, k) => pool.filter((g) => cats.includes(g.category)).map((g) => ({ g, s: sc(g, k) })).sort((a, b) => b.s - a.s)[0];
  const picks = { top: best(['top', 'dress', 'outerwear'], 'top'), bottom: best(['bottom'], 'bottom'), footwear: best(['footwear'], 'footwear') };
  if (picks.top?.g.category === 'dress') delete picks.bottom;
  const items = Object.values(picks).filter(Boolean).map((x) => x.g);
  if (items.length < 2) { out.innerHTML = '<p class="muted">Not enough clothes to rebuild this look yet.</p>'; return; }
  const match = Math.round(100 * Object.values(picks).filter(Boolean).reduce((s, x) => s + Math.min(1, x.s), 0) / Object.values(picks).filter(Boolean).length);
  // the weakest match = the piece to buy
  const weak = Object.entries(picks).filter(([, x]) => x).sort((a, b) => a[1].s - b[1].s)[0];
  let missing = null;
  if (weak && weak[1].s < 0.62 && col[weak[0]]) {
    const st = guess[weak[0]] || ({ top: 't-shirt', bottom: 'chinos', footwear: 'sneakers' })[weak[0]];
    try { const v = makeVirtual({ subtype: st, hex: col[weak[0]].hex, name: `${col[weak[0]].name} ${st}` }); const [rk] = await rankCandidates([v]); missing = { v, joins: rk.joins }; } catch { /* optional */ }
  }
  const o = await renderOutfit(items, { size: 520 });
  const src = cv.toDataURL('image/jpeg', 0.85);
  const q = missing ? `${missing.v.name} ${myWear() === 'women' ? 'women' : myWear() === 'men' ? 'men' : ''}`.trim() : '';
  const shop = missing ? (myRegion() === 'sa' ? `https://www.daraz.com.bd/catalog/?q=${encodeURIComponent(q)}` : `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`) : '';
  out.innerHTML = `<div class="copy-grid"><div><p class="tiny muted">Inspiration</p><img src="${src}" alt=""></div><div id="cr"><p class="tiny muted">From your closet · <b>${match}% match</b></p></div></div>
    <p class="small mt">${items.map((g) => esc(garmentName(g))).join(' · ')}</p>
    ${missing ? `<div class="miss mt">${productArt(missing.v.subtype, missing.v.colors[0].hex, 64)}<div class="grow"><b>Missing piece: ${esc(missing.v.name)}</b><div class="tiny muted">Buying it gets you closer to this look${missing.joins ? ` and unlocks +${missing.joins} outfits` : ''}.</div></div><a class="btn small" href="${shop}" target="_blank" rel="noopener">${icon('search', 14)} Find it</a></div>` : '<p class="small good-t">You can wear this look with what you already own!</p>'}
    <div class="row mt"><button class="btn primary" id="cw">${icon('check', 16)} Wear this</button><button class="btn" id="cb">${icon('image', 16)} Story card</button></div>`;
  o.style.cssText = 'width:100%;border-radius:14px'; $('#cr', out).appendChild(o);
  $('#cw', out).onclick = async () => { await logWear(items, { ctx: { occasion: 'casual', date: todayStr() }, date: todayStr(), source: 'inspiration' }); toast('Logged'); };
  $('#cb', out).onclick = () => photoBooth(items, { caption: 'Inspired look' });
}

// ---------------- Wardrobe Wrapped ----------------
async function wrapped() {
  const S = await wrappedStats();
  if (S.wears < 3) return toast('Log a few outfits first (Wear this) — Wrapped is built from what you wear.', 4500);
  const W = 1080, H = 1920; const ink = '#fff';
  const slides = [];
  const head = (x, t, sub) => { x.fillStyle = ink; x.textAlign = 'center'; x.font = `600 40px ${SANS()}`; x.globalAlpha = 0.8; x.fillText(sub.toUpperCase(), W / 2, 260); x.globalAlpha = 1; x.font = `italic 96px ${SERIF}`; return wrapText(x, t, W / 2, 400, 900, 110); };
  const big = (x, n, y, label) => { x.fillStyle = ink; x.textAlign = 'center'; x.font = `700 260px ${SANS()}`; x.fillText(String(n), W / 2, y); x.font = `48px ${SANS()}`; x.globalAlpha = 0.85; x.fillText(label, W / 2, y + 90); x.globalAlpha = 1; };
  const add = (bg, fn) => slides.push(async () => { const [c, x] = storyCanvas(W, H); bgGrad(x, W, H, bg[0], bg[1]); await fn(x); x.fillStyle = 'rgba(255,255,255,.7)'; x.font = `600 28px ${SANS()}`; x.textAlign = 'center'; x.fillText(`Atelier Wrapped ${S.allTime ? '' : S.year}`, W / 2, H - 60); return c; });
  const yr = S.allTime ? 'so far' : S.year;
  add(['#b4532a', '#5c2410'], (x) => { head(x, `${S.name ? S.name + '’s' : 'Your'} year in style`, `Wardrobe Wrapped ${yr}`); big(x, S.days, 1100, 'days you logged an outfit'); });
  add(['#1f2a44', '#0b1020'], (x) => { head(x, 'You never ran out of ideas', 'Outfits'); big(x, S.outfits, 1050, 'different outfits worn'); x.font = `44px ${SANS()}`; x.fillText(`${S.wears} pieces worn in total · ${S.pieces} in your closet`, W / 2, 1300); });
  if (S.top[0]) add(['#3a3d42', '#121316'], async (x) => {
    head(x, 'Your ride-or-die piece', 'Most worn');
    const b = await imageBlob(`${S.top[0].g.id}:thumb`) || await imageBlob(S.top[0].g.cutout); const im = await blobImg(b);
    if (im) { const s = Math.min(640 / im.width, 640 / im.height); x.fillStyle = '#f3efe8'; roundRect(x, 200, 560, 680, 680, 60); x.fill(); x.drawImage(im, W / 2 - im.width * s / 2, 900 - im.height * s / 2, im.width * s, im.height * s); }
    x.fillStyle = ink; x.font = `600 58px ${SANS()}`; x.textAlign = 'center'; x.fillText(garmentName(S.top[0].g), W / 2, 1380); x.font = `44px ${SANS()}`; x.fillText(`worn ${S.top[0].n} times`, W / 2, 1450);
    S.top.slice(1).forEach((t, i) => { x.globalAlpha = 0.8; x.font = `36px ${SANS()}`; x.fillText(`#${i + 2}  ${garmentName(t.g)} · ${t.n}×`, W / 2, 1560 + i * 56); x.globalAlpha = 1; });
  });
  if (S.colorTop[0]) add([S.colorTop[0].hex, '#111'], (x) => {
    head(x, `Your color of the year: ${S.colorTop[0].name}`, 'Colors');
    S.colorTop.forEach((c, i) => { const r = i ? 110 : 230; const cx = i ? 190 + (i - 1) * 233 : W / 2, cy = i ? 1320 : 900; x.fillStyle = c.hex; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 6; x.stroke(); if (i) { x.fillStyle = ink; x.font = `30px ${SANS()}`; x.textAlign = 'center'; x.fillText(c.name, cx, cy + 160); } });
  });
  if (S.value) add(['#4f6f52', '#1c2b1d'], (x) => { head(x, 'Best value in your closet', 'Cost per wear'); x.font = `600 64px ${SANS()}`; x.fillStyle = ink; x.textAlign = 'center'; x.fillText(garmentName(S.value.g), W / 2, 900); big(x, fmtMoney(S.value.cpw), 1250, 'per wear — money well spent'); });
  if (S.dna?.archetype) add(['#6e1f2e', '#250a10'], (x) => { head(x, 'Your style personality', 'Style DNA'); x.font = `italic 120px ${SERIF}`; x.fillStyle = ink; wrapText(x, S.dna.archetype, W / 2, 1000, 900, 140); });
  add(['#b5446e', '#3d1225'], (x) => { head(x, 'Showing up for yourself', 'Check-ins'); big(x, S.bestStreak, 1050, 'day best mirror streak'); x.font = `44px ${SANS()}`; x.fillText(`${S.checkins} mirror check-ins · ${S.bought} new piece${S.bought === 1 ? '' : 's'} bought`, W / 2, 1300); });
  if (S.forgotten) add(['#2f4dba', '#101a40'], (x) => { head(x, 'Give this one a chance', 'Forgotten gem'); x.font = `600 64px ${SANS()}`; x.fillStyle = ink; x.textAlign = 'center'; wrapText(x, garmentName(S.forgotten), W / 2, 950, 880, 76); x.font = `44px ${SANS()}`; x.fillText('Not worn in 4 months — style it this week?', W / 2, 1200); });
  add(['#171412', '#3b2f27'], (x) => { head(x, 'Here’s to an even better-dressed year', 'That’s a wrap'); x.font = `48px ${SANS()}`; x.fillStyle = ink; x.textAlign = 'center'; x.fillText('Share your Wrapped ✨', W / 2, 1150); });

  let i = 0; let canv = [];
  modal(`<div class="wrap-story"><div class="wrap-bars">${slides.map(() => '<i><b></b></i>').join('')}</div><div class="wrap-stage" id="ws"></div><button class="wrap-nav l" aria-label="Previous"></button><button class="wrap-nav r" aria-label="Next"></button></div>
    <div class="row mt"><button class="btn primary" id="wShare">${icon('share', 16)} Share this card</button><button class="btn" id="wSave">${icon('download', 16)} Save</button></div>`, {
    wide: true,
    onMount: async (m, close) => {
      m.classList.add('wrap-modal');
      const stage = $('#ws', m); const bars = $$('.wrap-bars b', m);
      let timer = null;
      const show = async (k) => {
        i = Math.max(0, Math.min(slides.length - 1, k));
        if (!canv[i]) canv[i] = await slides[i]();
        stage.innerHTML = ''; canv[i].className = 'wrap-c'; stage.appendChild(canv[i]);
        bars.forEach((b, j) => { b.style.transition = 'none'; b.style.width = j < i ? '100%' : '0%'; });
        requestAnimationFrame(() => { const b = bars[i]; b.style.transition = 'width 5s linear'; b.style.width = '100%'; });
        clearTimeout(timer); timer = setTimeout(() => { if (i < slides.length - 1 && m.isConnected) show(i + 1); }, 5000);
      };
      $('.wrap-nav.l', m).onclick = () => show(i - 1); $('.wrap-nav.r', m).onclick = () => show(i + 1);
      $('#wShare', m).onclick = () => shareCanvas(canv[i], `atelier-wrapped-${i + 1}.jpg`, 'My Wardrobe Wrapped ✨');
      $('#wSave', m).onclick = async () => saveBlob(await canvasToBlob(canv[i], 'image/jpeg', 0.92), `atelier-wrapped-${i + 1}.jpg`);
      show(0);
    },
  });
}
export { wrapped, askFriend, inspiration };
