// Try-On: (1) ChatGPT — your photo + the numbered clothes as two images, with a pro prompt (main path),
// (2) your own Gemini/OpenAI key — generated right here, (3) quick overlay — drag the clothes onto your photo.
// No body-detection model runs here, so nothing can hang.
import { state, activeGarments, garmentById, imageUrl } from '../db.js';
import { CATEGORY_LABEL } from '../enums.js';
import { recommend, scoreOutfit } from '../recommender.js';
import { weatherFor, todayStr } from '../weather.js';
import { logWear } from '../actions.js';
import { makeCanvas, canvasToBlob, fileToCanvas } from '../vision.js';
import { kmeansLab, labToHex, makeColor, pairHarmony, deltaE, primaryColor, rgbToLab } from '../color.js';
import { profile, colorFit, bodyScore, BODY, myOccasions, isWeekend } from '../profile.js';
import { photoCanvas, savePhoto, deletePhoto, buildTryOnPack } from '../tryon.js';
import { fitCanvas, loadSeg } from '../bodyscan.js';
import { apiSettings, saveApiSettings, PROVIDERS, generateTryOn } from '../genai.js';
import { esc, garmentName, mean } from '../util.js';
import { $, $$, toast, modal, icon, pageHead, seg, bindChips, ring, select, emptyState, swatch, haptic, rememberLook, lastLook } from './dom.js';
import { saveBlob, shareFiles, canShareMany, copyText, openExternal, isApp } from '../native.js';

const SLOTS = ['outerwear', 'top', 'dress', 'bottom', 'footwear', 'headwear', 'accessory'];
const T = { tab: 'tryon', picks: null, setting: 'studio', occasion: null };

export async function render(view, r) {
  // Use exactly the look you were viewing (Today, Stylist, Lookbook) — or the one in the link
  const ids = r?.query?.get('items');
  if (ids) { const items = ids.split(',').map(garmentById).filter(Boolean); const l = lastLook(); if (items.length && !(l && l.ids.join() === items.map((g) => g.id).join())) rememberLook(items, 'Selected look'); }
  const l = lastLook();
  if (l && l.at !== T.lookAt) { const items = l.ids.map(garmentById).filter(Boolean); if (items.length) { T.picks = pickFrom(items); T.from = l.label; } T.lookAt = l.at; }
  const t0 = r?.query?.get('tab'); if (t0) T.tab = t0;
  view.innerHTML = `${pageHead('Virtual fitting room', 'Try-On', 'See yourself in any outfit — realistic results with ChatGPT, or with your own AI key.')}
    ${seg('tab', [['tryon', `${icon('sparkles', 16)} Try on`], ['rate', `${icon('target', 16)} Rate my look`]], T.tab)}<div id="tbox" class="mt2"></div>`;
  bindChips(view, 'tab', (v) => { T.tab = v; show(); });
  const show = () => (T.tab === 'rate' ? rateTab : tryTab)($('#tbox', view));
  show();
}

// remember the current outfit (survives the app being closed while you're in ChatGPT)
function keep(label) { T.from = label; rememberLook(pickedItems(), label); T.lookAt = lastLook()?.at; }
function pickFrom(items) { const p = {}; for (const g of items) { if (g.category === 'accessory') (p.accessory ||= []).push(g.id); else p[g.category] = g.id; } return p; }
const pickedItems = () => SLOTS.flatMap((s) => (s === 'accessory' ? (T.picks.accessory || []) : [T.picks[s]])).map(garmentById).filter(Boolean);

async function defaultPicks() {
  let wx = null; try { wx = await weatherFor(todayStr()); } catch { /* offline */ }
  T.occasion = T.occasion || (isWeekend(new Date().getDay()) ? 'casual' : 'work');
  const res = recommend({ occasion: T.occasion, date: todayStr(), weather: wx, count: 1, explore: false });
  return res.outfits[0] ? pickFrom(res.outfits[0].items) : {};
}

async function tryTab(box) {
  if (!T.picks) T.picks = await defaultPicks();
  const photo = await photoCanvas(1200);
  const api = apiSettings();
  const items = pickedItems();
  box.innerHTML = `<div class="split" style="align-items:start">
    <section>
      <div class="card"><div class="card-h"><h2>${icon('user', 18)} 1 · Your photo</h2>${photo ? `<button class="btn small ghost danger" id="delp">${icon('trash', 14)} Delete</button>` : ''}</div>
        ${photo ? `<div class="me-photo"><img id="mePh" alt="Your photo"></div><div class="row mt"><button class="btn small" id="cam">${icon('camera', 14)} Retake</button><label class="btn small">${icon('image', 14)} Replace<input type="file" accept="image/*" hidden id="up"></label></div>`
          : `<p class="small muted">A full-body photo, standing, facing the camera. It stays on this device and is only shared when you tap Share.</p><div class="row"><button class="btn primary" id="cam">${icon('camera', 16)} Take photo (5 s timer)</button><label class="btn">${icon('image', 16)} Upload<input type="file" accept="image/*" hidden id="up"></label></div>`}</div>
      <div class="card"><div class="card-h"><h2>${icon('hanger', 18)} 2 · The outfit</h2><button class="btn small ghost" id="suggest">${icon('sparkles', 14)} Suggest</button></div>
        ${T.from ? `<p class="tiny muted" style="margin:-6px 0 10px">${icon('check', 12)} From: <b>${esc(T.from)}</b> — change any piece below</p>` : ''}
        <div class="slot-list">${SLOTS.filter((s) => s !== 'accessory').map((s) => slotRow(s)).join('')}</div>
        <div class="tryon-strip">${items.map((g) => `<img data-k="${g.cutout}" alt="${esc(garmentName(g))}" title="${esc(garmentName(g))}">`).join('')}</div></div>
    </section>
    <section>
      <div class="card hero-cta"><div class="card-h"><h2>${icon('sparkles', 18)} 3 · Generate with ChatGPT</h2><span class="pill accent">Best results</span></div>
        <p class="small muted">Sends <b>two images</b> — ${photo ? 'your photo' : '<span class="warn-t">your photo (add it above)</span>'} and the numbered clothes — plus a professional prompt. ChatGPT then creates a realistic photo of you wearing them.</p>
        <div class="form"><label class="f">Scene${select('setting', [['studio', 'Studio'], ['street', 'City street'], ['office', 'Office'], ['evening', 'Evening out']], T.setting)}</label><label class="f">Occasion${select('occ', myOccasions().map(([k, o]) => [k, o.label]), T.occasion || 'casual')}</label></div>
        <button class="btn primary block mt" id="gpt" ${items.length ? '' : 'disabled'}>${icon('share', 16)} ${isApp() || /Android|iPhone|iPad/.test(navigator.userAgent) ? 'Share to ChatGPT' : 'Prepare for ChatGPT'}</button>
        <p class="tiny faint mt">Your photo goes to OpenAI only when you send it in ChatGPT.</p></div>
      <div class="card"><div class="card-h"><h2>${icon('wand', 18)} Generate here with your own AI key</h2><span class="pill">${api.key ? esc(PROVIDERS[api.provider || 'gemini'].label) : 'Optional'}</span></div>
        <p class="small muted">Use a Google Gemini or OpenAI API key to create the try-on image inside the app. The key is stored only on this device.</p>
        <div class="row"><button class="btn small" id="apiSet">${icon('gear', 14)} ${api.key ? 'Change key' : 'Add API key'}</button><button class="btn small accent" id="apiGo" ${api.key && items.length ? '' : 'disabled'}>${icon('sparkles', 14)} Generate</button></div><div id="apiOut" class="mt"></div></div>
      <details class="card"><summary>${icon('layers', 16)} Quick overlay preview (no AI)</summary><p class="small muted mt">Place your clothes on your photo yourself — drag to move, pinch or use the buttons to resize. Good for a rough idea; use ChatGPT for a realistic image.</p><div id="ovBox"></div></details>
    </section></div>`;
  const reload = () => tryTab(box);
  if (photo) { const pi = $('#mePh', box); pi.src = photo.toDataURL('image/jpeg', 0.85); }
  $$('[data-k]', box).forEach(async (im) => { im.src = await imageUrl(im.dataset.k) || ''; });
  const setPhoto = async (c) => { await savePhoto(fitCanvas(c, 1400)); toast('Photo saved on this device'); reload(); };
  $('#up', box).onchange = async (e) => { const f = e.target.files[0]; if (f) setPhoto(await fileToCanvas(f, 1600)); };
  $('#cam', box).onclick = () => cameraModal({ facing: 'environment', timer: 5, title: 'Full-body photo', guide: 'body' }, setPhoto);
  const dp = $('#delp', box); if (dp) dp.onclick = async () => { await deletePhoto(); toast('Photo deleted'); reload(); };
  $$('[data-slot]', box).forEach((s) => s.onchange = () => { const v = s.value; if (v) T.picks[s.dataset.slot] = v; else delete T.picks[s.dataset.slot]; if (s.dataset.slot === 'dress' && v) { delete T.picks.top; delete T.picks.bottom; } if ((s.dataset.slot === 'top' || s.dataset.slot === 'bottom') && v) delete T.picks.dress; keep('Your choice'); reload(); });
  $('#suggest', box).onclick = async () => { T.picks = await defaultPicks(); keep('Suggested'); reload(); };
  box.querySelector('[name=setting]').onchange = (e) => { T.setting = e.target.value; };
  box.querySelector('[name=occ]').onchange = (e) => { T.occasion = e.target.value; };
  $('#gpt', box).onclick = (e) => chatgptFlow(e.currentTarget, photo);
  $('#apiSet', box).onclick = () => apiModal(reload);
  $('#apiGo', box).onclick = (e) => apiGenerate(e.currentTarget, photo, $('#apiOut', box));
  $('details', box).addEventListener('toggle', (e) => { if (e.target.open && !$('#ovStage', box)) overlayEditor($('#ovBox', box), photo, items); });
}

function slotRow(s) {
  const list = activeGarments().filter((g) => g.category === s);
  if (!list.length) return '';
  const cur = T.picks[s] || '';
  return `<label class="slot-row"><span class="slot-l">${CATEGORY_LABEL[s]}</span><select data-slot="${s}"><option value="">— none —</option>${list.map((g) => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${esc(garmentName(g))}</option>`).join('')}</select></label>`;
}

// ---------------- ChatGPT ----------------
async function chatgptFlow(btn, photo) {
  const items = pickedItems(); if (!items.length) return toast('Pick at least one garment');
  haptic(10);
  btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '<span class="spinner sm"></span> Preparing images…';
  try {
    const pack = await buildTryOnPack(items, photo, { occasion: T.occasion, setting: T.setting });
    btn.innerHTML = old; btn.disabled = false;
    if (canShareMany(pack.files)) {
      const r = await shareFiles(pack.files, { text: pack.prompt, title: 'Virtual try-on' });
      toast(r === 'shared' ? 'Choose ChatGPT — the prompt is also copied, paste it if it doesn’t appear' : 'Share cancelled', 5000);
      return;
    }
    desktopModal(pack, photo);
  } catch (e) { btn.innerHTML = old; btn.disabled = false; toast('Could not prepare: ' + (e.message || e)); }
}

function desktopModal(pack, photo) {
  modal(`<h2>Generate with ChatGPT</h2><p class="small muted">The prompt is copied. Three quick steps:</p>
    <ol class="steps-list">
      <li><b>Save the ${pack.files.length === 2 ? 'two images' : 'image'}</b><span>${photo ? '1-me.jpg (your photo) and 2-clothes.jpg (numbered clothes).' : 'clothes.jpg — add your photo in Try-On for a personal render.'}</span><div class="row mt"><button class="btn primary" id="dl">${icon('download', 16)} Save images</button></div></li>
      <li><b>Open ChatGPT and attach them</b><span>Drag both files into the chat, then paste the prompt (Ctrl+V).</span><div class="row mt"><button class="btn accent" id="open">${icon('sparkles', 16)} Open ChatGPT</button><button class="btn small" id="cp">${icon('pen', 14)} Copy prompt again</button></div></li>
      <li><b>Send</b><span>Ask for tweaks afterwards, e.g. “make it an evening scene”.</span></li></ol>
    <details class="mt"><summary class="small">See the prompt</summary><textarea readonly style="width:100%;min-height:200px;margin-top:8px;font-size:.82rem">${esc(pack.prompt)}</textarea></details>`, {
    wide: true,
    onMount: (m) => {
      $('#dl', m).onclick = async () => { for (const f of pack.files) await saveBlob(f, f.name); toast('Saved'); };
      $('#open', m).onclick = () => openExternal('https://chatgpt.com/');
      $('#cp', m).onclick = async () => toast((await copyText(pack.prompt)) ? 'Prompt copied' : 'Copy it from the box below');
    },
  });
}

// ---------------- own API key ----------------
function apiModal(done) {
  const s = apiSettings(); const prov = s.provider || 'gemini';
  modal(`<h2>Your AI key</h2><p class="small muted">Generate try-on images inside the app with your own account. Stored only on this device; sent only to the provider you choose.</p>
    <div class="seg" data-chips="prov">${Object.entries(PROVIDERS).map(([k, p]) => `<button class="chip ${k === prov ? 'on' : ''}" data-v="${k}">${p.label}</button>`).join('')}</div>
    <div class="form mt"><label class="f" style="grid-column:1/-1">API key<input id="k" type="password" autocomplete="off" value="${esc(s.key || '')}" placeholder="Paste your key"></label>
    <label class="f" style="grid-column:1/-1">Model<input id="mdl" value="${esc(s.model || PROVIDERS[prov].model)}"></label></div>
    <p class="tiny muted mt" id="pnote">${esc(PROVIDERS[prov].note)} <a href="${PROVIDERS[prov].keyUrl}" target="_blank" rel="noopener">Get a key</a></p>
    <div class="row end mt2">${s.key ? '<button class="btn ghost danger" id="rm">Remove key</button>' : ''}<button class="btn primary" id="sv">Save</button></div>`, {
    onMount: (m, close) => {
      let p = prov;
      bindChips(m, 'prov', (v) => { p = v; $('#mdl', m).value = PROVIDERS[v].model; $('#pnote', m).innerHTML = `${esc(PROVIDERS[v].note)} <a href="${PROVIDERS[v].keyUrl}" target="_blank" rel="noopener">Get a key</a>`; });
      $('#sv', m).onclick = () => { saveApiSettings({ provider: p, key: $('#k', m).value.trim(), model: $('#mdl', m).value.trim() }); close(); toast('Saved on this device'); done(); };
      const rm = $('#rm', m); if (rm) rm.onclick = () => { saveApiSettings({}); close(); toast('Key removed'); done(); };
    },
  });
}

async function apiGenerate(btn, photo, out) {
  const items = pickedItems(); if (!items.length) return;
  if (!photo) return toast('Add your photo first');
  const s = apiSettings();
  btn.disabled = true; out.innerHTML = '<div class="row"><span class="spinner sm"></span> <span class="small">Generating with ' + esc(PROVIDERS[s.provider || 'gemini'].label) + ' — usually 10–40 s. You can keep using the app.</span></div>';
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 120000);
  try {
    const pack = await buildTryOnPack(items, photo, { occasion: T.occasion, setting: T.setting });
    const blob = await generateTryOn({ provider: s.provider || 'gemini', key: s.key, model: s.model, prompt: pack.prompt, images: pack.files.map((f) => ({ blob: f, name: f.name })), signal: ctl.signal });
    const url = URL.createObjectURL(blob);
    out.innerHTML = `<img src="${url}" alt="Try-on result" style="width:100%;border-radius:18px"><div class="row mt"><button class="btn small primary" id="sv">${icon('download', 14)} Save</button><button class="btn small" id="sh">${icon('share', 14)} Share</button></div>`;
    $('#sv', out).onclick = () => saveBlob(blob, 'atelier-try-on.png');
    $('#sh', out).onclick = () => shareFiles([new File([blob], 'atelier-try-on.png', { type: blob.type || 'image/png' })], { title: 'My try-on' });
  } catch (e) {
    out.innerHTML = `<p class="pill bad" style="white-space:normal">${esc(e.name === 'AbortError' ? 'Timed out — try again' : e.message || String(e))}</p>`;
  } finally { clearTimeout(timer); btn.disabled = false; }
}

// ---------------- quick overlay (manual, no AI) ----------------
const START = { headwear: [50, 7, 18], outerwear: [50, 36, 54], top: [50, 33, 46], dress: [50, 47, 46], bottom: [50, 66, 34], footwear: [50, 93, 24], accessory: [78, 52, 16] };
async function overlayEditor(box, photo, items) {
  if (!photo) { box.innerHTML = '<p class="small muted mt">Add your photo first (step 1).</p>'; return; }
  if (!items.length) { box.innerHTML = '<p class="small muted mt">Pick an outfit first (step 2).</p>'; return; }
  const ar = photo.height / photo.width;
  box.innerHTML = `<div class="ov-stage" id="ovStage" style="aspect-ratio:${photo.width}/${photo.height}"><img class="ov-bg" alt="" src="${photo.toDataURL('image/jpeg', 0.85)}"></div>
    <div class="row mt"><button class="btn small" data-z="-">${icon('chevDown', 14)} Smaller</button><button class="btn small" data-z="+">${icon('plus', 14)} Bigger</button><button class="btn small" id="ovSave">${icon('download', 14)} Save image</button></div>`;
  const stage = $('#ovStage', box);
  const order = ['footwear', 'bottom', 'dress', 'top', 'outerwear', 'accessory', 'headwear'];
  const layers = [];
  let ai = 0;
  for (const g of [...items].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))) {
    const url = await imageUrl(g.cutout); if (!url) continue;
    const [x, y, w] = START[g.category] || [50, 50, 30];
    const L = { g, x: g.category === 'accessory' ? x - (ai++ % 2) * 56 : x, y, w, el: document.createElement('img') };
    L.el.src = url; L.el.className = 'ov-layer'; L.el.alt = garmentName(g); L.el.draggable = false;
    stage.appendChild(L.el); layers.push(L);
  }
  let sel = layers[layers.length - 1];
  const place = (L) => { L.el.style.left = L.x + '%'; L.el.style.top = L.y + '%'; L.el.style.width = L.w + '%'; L.el.classList.toggle('sel', L === sel); };
  layers.forEach(place);
  const pts = new Map(); let start = null;
  for (const L of layers) {
    L.el.addEventListener('pointerdown', (e) => { e.preventDefault(); sel = L; layers.forEach(place); L.el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); start = { x: L.x, y: L.y, w: L.w, p: [...pts.values()].map((v) => [...v]) }; });
    L.el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]); const b = stage.getBoundingClientRect(); const now = [...pts.values()];
      if (now.length === 1 && start.p.length === 1) { L.x = start.x + ((now[0][0] - start.p[0][0]) / b.width) * 100; L.y = start.y + ((now[0][1] - start.p[0][1]) / b.height) * 100; }
      else if (now.length >= 2 && start.p.length >= 2) { const d0 = Math.hypot(start.p[0][0] - start.p[1][0], start.p[0][1] - start.p[1][1]); const d1 = Math.hypot(now[0][0] - now[1][0], now[0][1] - now[1][1]); L.w = Math.max(6, Math.min(120, start.w * (d1 / (d0 || 1)))); }
      place(L);
    });
    const end = (e) => { pts.delete(e.pointerId); start = pts.size ? { x: L.x, y: L.y, w: L.w, p: [...pts.values()].map((v) => [...v]) } : null; };
    L.el.addEventListener('pointerup', end); L.el.addEventListener('pointercancel', end);
  }
  $$('[data-z]', box).forEach((b) => b.onclick = () => { if (!sel) return; sel.w = Math.max(6, Math.min(120, sel.w * (b.dataset.z === '+' ? 1.1 : 0.9))); place(sel); });
  $('#ovSave', box).onclick = async () => {
    const W = photo.width, H = photo.height; const c = makeCanvas(W, H); const ctx = c.getContext('2d'); ctx.drawImage(photo, 0, 0);
    for (const L of layers) { const im = L.el; const w = (L.w / 100) * W, h = w * (im.naturalHeight / im.naturalWidth); ctx.drawImage(im, (L.x / 100) * W - w / 2, (L.y / 100) * H - h / 2, w, h); }
    await saveBlob(await canvasToBlob(c, 'image/jpeg', 0.9), 'atelier-overlay.jpg'); toast('Saved');
  };
  void ar;
}

// ---------------- camera with self-timer ----------------
export function cameraModal({ facing = 'user', timer = 0, title = 'Photo', guide = 'face' }, onShot) {
  let stream = null;
  modal(`<h2>${esc(title)}</h2><div class="row center"><div class="selfie ${guide === 'body' ? 'body' : ''}" id="sbox"><video playsinline muted autoplay></video><div class="${guide === 'body' ? 'bodyguide' : guide === 'face' ? 'oval' : 'labelguide'}"></div><div class="countdown" id="cd"></div></div></div>
    <div class="row center mt"><button class="btn small" id="flip">${icon('refresh', 14)} Flip camera</button><button class="btn primary" id="snap">${icon('camera', 16)} ${timer ? `Capture in ${timer}s` : 'Capture'}</button></div>`, {
    onClose: () => stream?.getTracks().forEach((t) => t.stop()),
    onMount: async (m, close) => {
      const stop = () => stream?.getTracks().forEach((t) => t.stop());
      const video = $('video', m);
      const start = async () => { stop(); try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false }); video.srcObject = stream; } catch { $('#sbox', m).innerHTML = '<div style="color:#fff;padding:30px;text-align:center;font-size:.85rem">Camera unavailable — close this and upload a photo instead.</div>'; $('#snap', m).disabled = true; } };
      await start();
      $('#flip', m).onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
      $('#snap', m).onclick = async () => {
        $('#snap', m).disabled = true;
        for (let s = timer; s > 0; s--) { $('#cd', m).textContent = s; await new Promise((r) => setTimeout(r, 1000)); }
        $('#cd', m).textContent = '';
        const w = video.videoWidth, h = video.videoHeight; if (!w) return;
        const c = makeCanvas(w, h); const ctx = c.getContext('2d');
        if (facing === 'user') { ctx.translate(w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0, w, h); stop(); close(); onShot(c);
      };
    },
  });
}

// ---------------- Rate my look (segmentation only — no pose model) ----------------
function rateTab(box) {
  box.innerHTML = `<div class="card"><div class="card-h"><h2>${icon('target', 18)} Rate my look</h2></div>
    <p class="small muted">Take a mirror photo of what you’re wearing. I read the colors of your top and bottom, check them against your ${profile().seasonName ? esc(profile().seasonName) + ' palette' : 'colors'} and body shape, find the matching pieces in your closet, and suggest improvements.</p>
    <div class="row"><button class="btn primary" id="cam">${icon('camera', 16)} Take mirror photo</button><label class="btn">${icon('image', 16)} Upload<input type="file" accept="image/*" hidden id="up"></label></div></div>
    <div id="rout" class="mt"></div>`;
  const run = async (c) => {
    const out = $('#rout', box); out.innerHTML = '<div class="card"><div class="row"><span class="spinner sm"></span> Reading your outfit…</div></div>';
    try { await rateLook(fitCanvas(c, 720), out); } catch (e) { out.innerHTML = `<div class="card"><p class="pill bad" style="white-space:normal">${esc(e.message || e)}</p></div>`; }
  };
  $('#up', box).onchange = async (e) => { const f = e.target.files[0]; if (f) run(await fileToCanvas(f, 1200)); };
  $('#cam', box).onclick = () => cameraModal({ facing: 'environment', timer: 3, title: 'Mirror photo', guide: 'body' }, run);
}

export async function rateLook(canvas, out) {
  const S = await loadSeg();
  const res = S.segment(canvas); const cm = res.categoryMask; const w = cm.width, h = cm.height; const cat = cm.getAsUint8Array().slice(); res.close?.();
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  const kx = canvas.width / w, ky = canvas.height / h;
  let minY = h, maxY = 0; for (let i = 0; i < cat.length; i++) if (cat[i] === 4) { const y = Math.floor(i / w); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxY - minY < h * 0.1) throw new Error('I could not see clothing clearly. Stand back so your outfit fills most of the photo.');
  const split = minY + (maxY - minY) * 0.45;
  const up = [], lo = [];
  for (let y = minY; y <= maxY; y += 2) for (let x = 0; x < w; x += 2) {
    if (cat[y * w + x] !== 4) continue;
    const i = (Math.min(canvas.height - 1, Math.round(y * ky)) * canvas.width + Math.min(canvas.width - 1, Math.round(x * kx))) * 4;
    (y < split ? up : lo).push(rgbToLab([d[i], d[i + 1], d[i + 2]]));
  }
  const dom = (pts) => { if (pts.length < 60) return null; const cs = kmeansLab(pts, 3); const counts = cs.map(() => 0); for (const p of pts) { let bi = 0, bd = Infinity; cs.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }); counts[bi]++; } return makeColor(labToHex(cs[counts.indexOf(Math.max(...counts))])); };
  const cu = dom(up), cl = dom(lo);
  if (!cu) throw new Error('I could not read the top half of your outfit.');
  const pool = activeGarments();
  const near = (cats, col) => (col ? pool.filter((g) => cats.includes(g.category)).map((g) => ({ g, d: deltaE(primaryColor(g).lab, col.lab) })).sort((a, b) => a.d - b.d)[0] : null);
  const mt = near(['top', 'outerwear', 'dress'], cu), mb = cl ? near(['bottom'], cl) : null;
  const matched = [mt && mt.d < 16 ? mt.g : null, mb && mb.d < 16 && mt?.g.category !== 'dress' ? mb.g : null].filter(Boolean);
  const p = profile();
  const harm = cl ? pairHarmony(cu, cl) : { s: 0.85, cls: 'single' };
  const fit = p.season ? colorFit(cu.hex, p.season) : null;
  const virtual = [{ category: 'top', colors: [cu], pattern: 'solid', fit: mt?.g.fit || 'regular' }, ...(cl ? [{ category: 'bottom', colors: [cl], pattern: 'solid', fit: mb?.g.fit || 'regular' }] : [])];
  const bs = bodyScore(matched.length === 2 ? matched : virtual, p);
  const parts = [['Color harmony', harm.s], ...(fit ? [[`Your ${p.seasonName} palette`, fit.s]] : []), ...(bs ? [['Body balance', bs.s]] : [])];
  const total = mean(parts.map((x) => x[1]));
  const tips = [];
  if (fit && fit.verdict !== 'great') { const alt = pool.filter((g) => ['top', 'outerwear'].includes(g.category) && colorFit(primaryColor(g).hex, p.season).verdict === 'great').slice(0, 2); tips.push(`The top color (${cu.name}) is not your strongest near the face${alt.length ? ` — try your ${alt.map((g) => esc(garmentName(g))).join(' or ')}` : ' — add a scarf or layer in a palette shade'}.`); }
  if (harm.s < 0.6 && cl) tips.push(`${cu.name} with ${cl.name} is a tricky pair — anchor it with a neutral layer or shoes.`);
  if (bs && bs.s < 0.7 && p.bodyShape) tips.push(BODY[p.bodyShape].tip + '.');
  if (bs?.note) tips.push(`Nice: ${bs.note}.`);
  if (fit?.verdict === 'great') tips.push(`The ${cu.name} top lights up your ${p.seasonName} coloring.`);
  if (!tips.length) tips.push('Balanced, harmonious outfit — no changes needed.');
  out.innerHTML = `<div class="card"><div class="split even" style="align-items:center"><div id="rimg"></div><div>
    <div class="row"><div class="ring" style="width:72px;height:72px">${ring(total, 64)}<b style="font-size:1.3rem">${Math.round(total * 100)}</b></div><div><p class="eyebrow" style="margin:0">Look score</p><h2 class="display" style="font-size:1.9rem;font-weight:400;margin:0">${total >= 0.8 ? 'Looking great' : total >= 0.65 ? 'Good, with tweaks' : 'Let’s improve this'}</h2></div></div>
    <p class="small mt">${swatch(cu.hex, 16)} Top: <b>${esc(cu.name)}</b>${cl ? ` · ${swatch(cl.hex, 16)} Bottom: <b>${esc(cl.name)}</b>` : ''}</p>
    <div class="score-k mt">${parts.map(([l, v]) => `<span>${esc(l)}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><span class="tiny faint">${Math.round(v * 100)}</span>`).join('')}</div>
    <ul class="tips mt">${tips.map((t) => `<li>${icon('sparkles', 16)}<span>${t}</span></li>`).join('')}</ul>
    ${matched.length ? `<p class="small mt">Looks like your <b>${matched.map((g) => esc(garmentName(g))).join('</b> + <b>')}</b>.</p><div class="row"><button class="btn primary" id="logit">${icon('check', 16)} Log this outfit</button></div>` : '<p class="tiny faint mt">No close match in your closet — add these pieces to track them.</p>'}
  </div></div></div>`;
  canvas.style.cssText = 'width:100%;border-radius:18px'; $('#rimg', out).appendChild(canvas);
  const lg = $('#logit', out); if (lg) lg.onclick = async () => { const sc = scoreOutfit(matched, { occasion: 'casual', date: todayStr() }); await logWear(matched, { ctx: { occasion: 'casual', date: todayStr() }, features: sc.features, source: 'manual' }); lg.disabled = true; lg.textContent = 'Logged'; toast('Logged — thanks!'); };
  return { total, matched, top: cu, bottom: cl };
}
