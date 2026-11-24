import { CATEGORIES, CATEGORY_LABEL, SUBTYPES, subtypesOf, PATTERNS, FABRICS, FITS, FORMALITY_LABEL, SEASONS, MIN_WARDROBE } from '../enums.js';
import { state, saveGarment, del, uid, saveImage, activeGarments, garmentById } from '../db.js';
import { enqueue, queue, onQueue, defaultSubtype, defaultFabric } from '../pipeline.js';
import { qualityCheck, makeCanvas, canvasToBlob, segmentLocal, scaleCanvas } from '../vision.js';
import { correctAttribute } from '../actions.js';
import { inferWardrobePrior } from '../learning.js';
import { makeColor, primaryColor } from '../color.js';
import { drawGarment } from '../demo.js';
import { esc, garmentName, deriveWarmth, deriveSeason } from '../util.js';
import * as ai from '../ai.js';
import { $, $$, toast, modal, hydrateImages, select, chips, bindChips, swatch, emptyState, bar, icon, pageHead } from './dom.js';
import { subtypeOptions } from '../profile.js';
import { fixCutoutModal } from './closet.js';
import { go } from '../app.js';

let stream = null, qcTimer = null, unsub = null;
let batchCategory = 'auto';

export function unmount() { stopCamera(); unsub?.(); unsub = null; }
function stopCamera() { clearInterval(qcTimer); qcTimer = null; stream?.getTracks().forEach((t) => t.stop()); stream = null; }

export async function renderCapture(view) {
  const pool = activeGarments();
  const n = (c) => pool.filter((g) => g.category === c).length;
  view.innerHTML = `
    ${pageHead('Build your closet', 'Add <em>clothes</em>', 'Shoot on any background — no white sheet needed. Photos are processed on this device and never uploaded.')}
    ${!state.settings.aiEnabled ? `<div class="banner" style="display:block"><b>${icon('cpu', 18)} Turn on free on-device AI tagging?</b><p class="small">It fills in type, pattern, fabric and formality automatically (one-time ≈150 MB download, then works offline). Without it, colors are still automatic and you pick the type in one tap.</p><a class="btn small primary" href="#/settings?ai=1">Enable AI tagging</a></div>` : ''}
    <div class="card mt"><b>Starter set</b> <span class="small muted">— the first good suggestion arrives at 5 tops, 3 bottoms and 2 shoes</span>
      <div class="grid mt" style="grid-template-columns:repeat(3,1fr)">${[['top', 'Tops', MIN_WARDROBE.top], ['bottom', 'Bottoms', MIN_WARDROBE.bottom], ['footwear', 'Shoes', MIN_WARDROBE.footwear]].map(([c, l, need]) => `<div><div class="small">${l} ${Math.min(n(c), need)}/${need}</div>${bar(n(c) / need)}</div>`).join('')}</div></div>
    <div class="card mt">
      <div class="row between"><b>These photos are</b>${select('batchCat', [['auto', state.settings.aiEnabled ? 'Auto-detect (AI)' : 'Mixed — I will pick later'], ...CATEGORIES.map((c) => [c, CATEGORY_LABEL[c] + 's'])], batchCategory)}</div>
      <div class="modes mt" data-chips="mode"><button class="mode chip on" data-v="camera">${icon('camera', 22)}<b>Camera</b><span>Live quality checks</span></button><button class="mode chip" data-v="import">${icon('image', 22)}<b>Gallery</b><span>Up to 50 at once</span></button><button class="mode chip" data-v="manual">${icon('pen', 22)}<b>No photo</b><span>Illustrated stand-in</span></button></div>
      <div id="modeBox" class="mt"></div>
    </div>
    <div class="section"><div class="section-h"><div><p class="eyebrow">Background work</p><h2>Processing queue</h2></div><a class="btn small primary hide" id="toReview" href="#/review">Review</a></div><div class="queue" id="queue"></div></div>`;
  view.querySelector('[name=batchCat]').onchange = (e) => { batchCategory = e.target.value; };
  if (state.settings.aiEnabled) ai.isModelCached().then((ok) => {
    if (ok || !view.isConnected) return;
    const b = document.createElement('div'); b.className = 'banner'; b.style.display = 'block';
    b.innerHTML = `<b>${icon('cpu', 18)} New fashion AI available</b><p class="small">Much better at polo vs shirt, jeans vs cargo, boots vs sneakers. One-time ≈145 MB download, runs in the background.</p><button class="btn small primary" id="upAi">Download & upgrade my items</button><div id="upProg" class="mt"></div>`;
    view.querySelector('.ph').after(b);
    $('#upAi', b).onclick = async (e) => {
      e.target.disabled = true; const pr = $('#upProg', b);
      try {
        await ai.loadAI((p) => { pr.innerHTML = `<div class="small">Downloading… ${Math.round(p * 100)}%</div>${bar(p)}`; });
        const { upgradeToCurrentModel } = await import('../pipeline.js');
        const n = await upgradeToCurrentModel((i, t) => { pr.innerHTML = `<div class="small">Re-tagging ${i}/${t} — you can keep using the app</div>${bar(i / t)}`; });
        pr.innerHTML = `<span class="pill good">Done — ${n} item${n === 1 ? '' : 's'} updated</span>`;
      } catch (err) { pr.innerHTML = `<span class="pill bad">${esc(err.message || err)}</span>`; e.target.disabled = false; }
    };
  });
  bindChips(view, 'mode', (m) => showMode(m));
  const drawQueue = () => {
    const box = $('#queue', view); if (!box) return;
    const ics = { queued: icon('refresh', 16), processing: '<span class="spinner sm"></span>', done: icon('check', 16), duplicate: icon('layers', 16), rejected: icon('x', 16), error: icon('info', 16) };
    box.innerHTML = queue.items.length ? queue.items.slice(-30).reverse().map((j) => `<div class="qitem ${j.status === 'done' ? 'ok' : ['rejected', 'error'].includes(j.status) ? 'bad' : ''}"><span>${ics[j.status]}</span><span class="grow">${esc(j.name)}</span><span class="tiny muted">${esc(j.message || j.status)}</span></div>`).join('') : '<p class="small muted">Nothing yet. Shoot, shoot, shoot — tagging catches up in the background.</p>';
    const pending = state.garments.filter((g) => g.needsReview && g.status === 'active').length;
    const tr = $('#toReview', view); if (tr) { tr.classList.toggle('hide', !pending); tr.textContent = `Review ${pending}`; }
  };
  unsub?.(); unsub = onQueue(drawQueue); drawQueue();
  showMode('camera');

  function showMode(m) {
    stopCamera();
    const box = $('#modeBox', view);
    if (m === 'camera') {
      box.innerHTML = `<div class="cam" id="cam"><video playsinline muted autoplay></video><div class="guide"></div><div class="qc" id="qc"></div><button class="shoot" id="shoot" aria-label="Take photo"></button><span class="count" id="shots">0</span></div>
        <p class="small muted mt">Fill the dashed guide with one garment. Live checks warn about blur, light and framing.</p>
        <label class="btn small mt">${icon('camera', 16)} Use the phone camera app instead<input type="file" accept="image/*" capture="environment" hidden id="native"></label>`;
      $('#native', box).onchange = (e) => { enqueue([...e.target.files], opts()); e.target.value = ''; };
      startCamera(box);
    } else if (m === 'import') {
      box.innerHTML = `<label class="dropzone" id="dz"><input type="file" accept="image/*" multiple hidden id="files">${icon('image', 36)}<p><b>Choose photos</b></p><p class="small muted">or drag & drop up to 50 at a time. Duplicates are detected by image hash and cost nothing.</p></label>`;
      const dz = $('#dz', box);
      $('#files', box).onchange = (e) => { enqueue([...e.target.files].slice(0, 50), opts()); e.target.value = ''; toast('Queued — processing in the background'); };
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); enqueue([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')).slice(0, 50), opts()); });
    } else manualForm(box);
  }
  const opts = () => (batchCategory === 'auto' ? {} : { category: batchCategory, subtype: defaultSubtype(batchCategory) });

  async function startCamera(box) {
    const video = $('video', box); const qc = $('#qc', box); let shots = 0;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      video.srcObject = stream;
    } catch (e) {
      $('#cam', box).innerHTML = `<div style="color:#fff;padding:24px;text-align:center">Camera unavailable (${esc(e.name || e.message)}).<br><br>Use “Gallery / files” or your phone camera button below. Camera access needs https or localhost.</div>`;
      return;
    }
    const frame = (max = 1600) => { const w = video.videoWidth, h = video.videoHeight; if (!w) return null; const s = Math.min(1, max / Math.max(w, h)); const c = makeCanvas(w * s, h * s); c.getContext('2d').drawImage(video, 0, 0, c.width, c.height); return c; };
    qcTimer = setInterval(() => {
      const c = frame(320); if (!c) return;
      const q = qualityCheck(c);
      const seg = segmentLocal(c);
      const fill = seg ? seg.frac : 0;
      qc.innerHTML = `<span class="${q.blur >= 40 ? 'ok' : 'no'}">${q.blur >= 40 ? 'sharp' : 'blurry'}</span><span class="${q.lum >= 45 && q.lum <= 235 ? 'ok' : 'no'}">${q.lum < 45 ? 'too dark' : q.lum > 235 ? 'too bright' : 'light ok'}</span><span class="${fill >= 0.15 ? 'ok' : 'no'}">${fill >= 0.15 ? 'framed' : 'move closer'}</span>`;
    }, 700);
    $('#shoot', box).onclick = async () => {
      const c = frame(); if (!c) return;
      $('#cam', box).classList.remove('flash'); void $('#cam', box).offsetWidth; $('#cam', box).classList.add('flash');
      const blob = await canvasToBlob(c, 'image/jpeg', 0.92);
      const file = new File([blob], `shot-${Date.now()}.jpg`, { type: 'image/jpeg' });
      enqueue([file], opts());
      $('#shots', box).textContent = ++shots;
    };
  }
}

// Add a garment without a photo — an illustrated stand-in is drawn in its color.
function manualForm(box) {
  box.innerHTML = `<form class="form" id="mf">
    <label class="f">Category${select('category', CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]), 'top')}</label>
    <label class="f">Type<select name="subtype">${subtypeOptions('top').map((s) => `<option>${s}</option>`).join('')}</select></label>
    <label class="f">Color<input type="color" name="color" value="#1f2a44"></label>
    <label class="f">Pattern${select('pattern', PATTERNS, 'solid')}</label>
    <label class="f">Name<input name="name" placeholder="e.g. navy chinos"></label>
    <label class="f">Price<input name="price" type="number" min="0" step="0.01"></label>
    <div style="grid-column:1/-1"><button class="btn primary">Add to wardrobe</button></div></form>`;
  const f = $('#mf', box);
  f.category.onchange = () => { f.subtype.innerHTML = subtypeOptions(f.category.value).map((s) => `<option>${s}</option>`).join(''); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const sub = f.subtype.value, meta = SUBTYPES[sub], fabric = defaultFabric(sub), warmth = deriveWarmth(sub, fabric, meta.cat);
    const id = uid();
    const c = drawGarment({ subtype: sub, hex: f.color.value, pattern: f.pattern.value });
    const blob = await canvasToBlob(c, 'image/png');
    await saveImage(`${id}:cutout`, blob); await saveImage(`${id}:original`, blob);
    await saveGarment({ id, name: f.name.value.trim(), category: meta.cat, subtype: sub, colors: [makeColor(f.color.value)], pattern: f.pattern.value, fabric, formality: meta.f, fit: meta.fit, warmth, season: deriveSeason(warmth, fabric, meta.cat), brand: '', price: f.price.value ? +f.price.value : null, status: 'active', needsReview: false, imageHash: 'manual:' + id, original: `${id}:original`, cutout: `${id}:cutout`, cutoutMethod: 'illustration', modelVersion: 'manual', confidence: {}, lowConfidence: [], attrSource: { category: 'user', subtype: 'user' }, createdAt: Date.now(), laundry: { state: 'clean', wearsSinceWash: 0 } });
    toast('Added'); f.name.value = ''; f.price.value = '';
  };
}

// ---------- Review queue: confirm with one tap, correct with two ----------
export async function renderReview(view) {
  const list = state.garments.filter((g) => g.needsReview && g.status === 'active').sort((a, b) => a.createdAt - b.createdAt);
  if (!list.length) {
    view.innerHTML = emptyState('check', 'All caught up', 'Every garment has been checked.', '<div class="row center"><a class="btn primary" href="#/today">See today’s outfits</a><a class="btn" href="#/add">Add more</a></div>');
    inferWardrobePrior(activeGarments());
    return;
  }
  const g = list[0];
  const low = new Set(g.lowConfidence || []);
  const L = (k) => (low.has(k) ? 'lowc' : '');
  view.innerHTML = `
    ${pageHead('Quick check', 'Review', `<b>${list.length}</b> item${list.length === 1 ? '' : 's'} left — one tap to confirm, two to correct.`, `<button class="btn small" id="all">${icon('check', 16)} Confirm all ${list.length}</button>`)}
    <div class="stack"><div class="card rcard" id="rc">
      <div class="rimg"><img data-key="${g.cutout}" alt=""><img class="orig" data-key="${g.original}" alt="original"></div>
      ${g.quality && !g.quality.ok ? `<p class="small"><span class="pill warn">Photo: ${esc(g.quality.issues.join(', '))}</span></p>` : ''}
      <div class="row small mb">${(g.colors || []).map((c) => `${swatch(c.hex)} ${esc(c.name)}`).join(' · ')}</div>
      <form class="form" id="rf">
        <label class="f">Category${select('category', CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]), g.category, `class="${L('category')}"`)}</label>
        <label class="f">Type${select('subtype', subtypeOptions(g.category), g.subtype, `class="${L('subtype')}"`)}</label>
        <label class="f">Pattern${select('pattern', PATTERNS, g.pattern, `class="${L('pattern')}"`)}</label>
        <label class="f">Fabric${select('fabric', FABRICS, g.fabric, `class="${L('fabric')}"`)}</label>
        <label class="f">Formality${select('formality', [1, 2, 3, 4, 5].map((v) => [v, `${v} · ${FORMALITY_LABEL[v]}`]), g.formality, `class="${L('formality')}"`)}</label>
        <label class="f">Fit${select('fit', FITS, g.fit, `class="${L('fit')}"`)}</label>
        <label class="f">Name<input name="name" value="${esc(g.name)}" placeholder="${esc(garmentName({ ...g, name: '' }))}"></label>
        <label class="f">Price<input name="price" type="number" min="0" step="0.01" value="${g.price ?? ''}"></label>
      </form>
      ${low.size ? `<p class="tiny muted mt">Orange fields had low confidence${g.modelVersion === 'manual' ? ' (AI tagging is off)' : ''}.</p>` : ''}
      <div class="row mt"><button class="btn primary grow" id="ok">${icon('check', 16)} Looks right</button><button class="btn" id="fix">${icon('scissors', 16)} Cutout</button><button class="btn" id="later">Later</button><button class="btn icon danger" id="discard" aria-label="Discard">${icon('trash', 16)}</button></div>
    </div><p class="swipe-hint">Swipe right to confirm · left for later</p></div>`;
  hydrateImages(view);
  const form = $('#rf', view);
  form.addEventListener('change', async (e) => {
    const k = e.target.name; let v = e.target.value;
    if (k === 'category') { await correctAttribute(g, 'category', v); await correctAttribute(g, 'subtype', defaultSubtype(v)); g.fabric = defaultFabric(g.subtype); }
    else { if (k === 'formality') v = +v; if (k === 'price') v = v === '' ? null : +v; await correctAttribute(g, k, v); }
    if (k === 'subtype') { if (g.attrSource.fabric !== 'user') g.fabric = defaultFabric(v); if (g.attrSource.formality !== 'user') g.formality = SUBTYPES[v]?.f ?? g.formality; if (g.attrSource.fit !== 'user') g.fit = SUBTYPES[v]?.fit ?? g.fit; }
    g.warmth = deriveWarmth(g.subtype, g.fabric, g.category); g.season = deriveSeason(g.warmth, g.fabric, g.category);
    await saveGarment(g);
    if (k === 'category' || k === 'subtype') renderReview(view); else e.target.classList.remove('lowc');
  });
  const confirm = async () => { g.needsReview = false; g.lowConfidence = []; await saveGarment(g); renderReview(view); };
  const later = async () => { g.createdAt = Date.now(); await saveGarment(g); renderReview(view); };
  $('#ok', view).onclick = confirm;
  $('#later', view).onclick = later;
  $('#fix', view).onclick = () => fixCutoutModal(g, () => renderReview(view));
  $('#discard', view).onclick = async () => { await del('garments', g.id); await del('images', g.cutout); await del('images', g.original); state.garments = state.garments.filter((x) => x.id !== g.id); toast('Discarded'); renderReview(view); };
  $('#all', view).onclick = async () => { for (const x of list) { x.needsReview = false; x.lowConfidence = []; await saveGarment(x); } toast(`Confirmed ${list.length} items`); renderReview(view); };
  // swipe gestures
  const card = $('#rc', view); let sx = null, dx = 0;
  card.addEventListener('pointerdown', (e) => { if (e.target.closest('select,input,button')) return; sx = e.clientX; dx = 0; });
  card.addEventListener('pointermove', (e) => { if (sx == null) return; dx = e.clientX - sx; card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`; });
  const end = () => { if (sx == null) return; sx = null; if (dx > 110) { card.style.transform = 'translateX(120%)'; setTimeout(confirm, 180); } else if (dx < -110) { card.style.transform = 'translateX(-120%)'; setTimeout(later, 180); } else card.style.transform = ''; };
  card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
}
