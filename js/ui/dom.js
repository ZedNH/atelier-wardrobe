import { esc } from '../util.js';
import { imageUrl, garmentById } from '../db.js';
import { icon, gicon, hasGicon } from './icons.js';

export { icon };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}

// Open sheets, newest last — the Android back button closes the top one first.
const sheets = [];
export function haptic(ms = 8) { try { if (window.AndroidBridge?.vibrate) window.AndroidBridge.vibrate(ms); else navigator.vibrate?.(ms); } catch { /* unsupported */ } }

export function modal(html, { onMount, wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="grabber" aria-hidden="true"></div><button class="modal-x" aria-label="Close">${icon('x', 16)}</button>${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  const sheet = wrap.querySelector('.modal');
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    const i = sheets.indexOf(close); if (i >= 0) sheets.splice(i, 1);
    document.removeEventListener('keydown', onKey);
    onClose?.();
    wrap.classList.add('closing');
    setTimeout(() => { wrap.remove(); if (!$('.modal-wrap')) document.body.classList.remove('noscroll'); }, 200);
  };
  sheets.push(close);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.modal-x')) close(); });
  // swipe the grabber (or the sheet when scrolled to top) down to dismiss
  let y0 = null, dy = 0;
  const start = (e) => { if (sheet.scrollTop > 0 && !e.target.closest('.grabber')) return; y0 = e.touches[0].clientY; dy = 0; sheet.classList.add('dragging'); };
  const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) { sheet.style.transform = `translateY(${dy}px)`; if (e.cancelable && dy > 8) e.preventDefault(); } };
  const end = () => { if (y0 == null) return; y0 = null; sheet.classList.remove('dragging'); if (dy > 110) { haptic(); close(); } else sheet.style.transform = ''; };
  sheet.addEventListener('touchstart', start, { passive: true });
  sheet.addEventListener('touchmove', move, { passive: false });
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
  onMount?.(sheet, close);
  return close;
}
// Android back button → close the top sheet if any (called by the native app)
// ---------- The look you're looking at → Try-On uses exactly that outfit ----------
export function rememberLook(items, label) {
  try { localStorage.setItem('tryon-look', JSON.stringify({ ids: items.map((g) => g.id), label, at: Date.now() })); } catch { /* storage off */ }
}
export function lastLook() { try { return JSON.parse(localStorage.getItem('tryon-look') || 'null'); } catch { return null; } }
const lookIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting && e.target._look) rememberLook(...e.target._look);
}, { rootMargin: '-45% 0px -45% 0px' }) : null; // the card crossing the middle of the screen
export function watchLook(el, items, label) {
  el._look = [items, label];
  lookIO?.observe(el);
  // any tap on the card (try-on button included) makes it the current look
  el.addEventListener('pointerdown', () => rememberLook(items, label), { passive: true });
}

// ---------- App-styled picker for every <select> (replaces the old Android system list) ----------
// Each option gets an icon (clothing type / category) or the garment's own thumbnail; long lists get a search box.
const FORMALITY_IC = { 1: 'moon', 2: 'sun', 3: 'sparkles', 4: 'bag', 5: 'star' };
function optionIcon(sel, o) {
  const v = o.value;
  if (!v) return `<span class="pk-ic none">${icon('x', 16)}</span>`;
  const g = garmentById(v);
  if (g) return `<span class="pk-ic img"><img data-key="${g.id}:thumb" data-fallback="${g.cutout}" alt=""></span>`;
  if (hasGicon(v)) return `<span class="pk-ic">${gicon(v, 22)}</span>`;
  if (/^#[0-9a-f]{6}$/i.test(v)) return `<span class="pk-ic" style="background:${v}"></span>`;
  if (sel.name === 'formality' && FORMALITY_IC[v]) return `<span class="pk-ic">${icon(FORMALITY_IC[v], 18)}</span>`;
  return '';
}
function labelOf(sel) {
  const l = sel.closest('label');
  if (l) { const t = [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim() || l.querySelector('.slot-l, span')?.textContent?.trim(); if (t) return t; }
  return sel.getAttribute('aria-label') || sel.title || 'Choose';
}
export function openPicker(sel) {
  if (sel.disabled) return;
  const opts = [...sel.options];
  const withIcons = opts.some((o) => optionIcon(sel, o));
  const rows = [];
  let lastGroup = null;
  for (const o of opts) {
    const grp = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
    if (grp !== lastGroup) { lastGroup = grp; if (grp) rows.push(`<div class="pk-group">${esc(grp)}</div>`); }
    if (o.hidden) continue;
    rows.push(`<button type="button" class="pk-row ${o.selected ? 'on' : ''}" data-i="${o.index}" ${o.disabled ? 'disabled' : ''}>${withIcons ? optionIcon(sel, o) || '<span class="pk-ic"></span>' : ''}<span class="pk-t">${esc(o.textContent.trim())}</span><span class="pk-ck">${icon('check', 18)}</span></button>`);
  }
  haptic(6);
  modal(`<div class="pk-head"><div class="pk-top"><h2 class="pk-h">${esc(labelOf(sel))}</h2><button type="button" class="pk-x" aria-label="Close">${icon('x', 16)}</button></div>${opts.length > 12 ? `<div class="pk-search">${icon('search', 16)}<input type="search" placeholder="Search" aria-label="Search"></div>` : ''}</div><div class="pk-list ${withIcons ? '' : 'plain'}">${rows.join('')}</div>`, {
    onMount: (m, close) => {
      m.classList.add('picker-sheet');
      m.querySelector('.pk-x').onclick = close;
      hydrateImages(m);
      const on = m.querySelector('.pk-row.on'); if (on) requestAnimationFrame(() => on.scrollIntoView({ block: 'center' }));
      m.querySelector('.pk-list').addEventListener('click', (e) => {
        const b = e.target.closest('.pk-row'); if (!b) return;
        haptic(8);
        const i = +b.dataset.i;
        if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
        close();
      });
      const q = m.querySelector('.pk-search input');
      if (q) q.addEventListener('input', () => { const s = q.value.trim().toLowerCase(); m.querySelectorAll('.pk-row').forEach((r) => r.classList.toggle('hide', !!s && !r.textContent.toLowerCase().includes(s))); });
    },
  });
}
// Intercept taps on selects: stop the system list, show ours. Keyboard users keep the native control.
const pickable = (t) => t instanceof HTMLSelectElement && !t.multiple && !t.closest('.native-select');
document.addEventListener('pointerdown', (e) => { if (pickable(e.target) && e.pointerType !== 'keyboard') e.preventDefault(); }, true);
document.addEventListener('mousedown', (e) => { if (pickable(e.target)) e.preventDefault(); }, true);
document.addEventListener('click', (e) => { if (pickable(e.target)) { e.preventDefault(); openPicker(e.target); } }, true);

window.__onBack = () => { const c = sheets[sheets.length - 1]; if (c) { c(); return true; } return false; };

export function confirmBox(text, okLabel = 'OK') {
  return new Promise((res) => {
    modal(`<h2>Are you sure?</h2><p class="mb muted">${esc(text)}</p><div class="row end mt2"><button class="btn ghost" data-no>Cancel</button><button class="btn primary" data-yes>${esc(okLabel)}</button></div>`, {
      onClose: () => res(false),
      onMount: (m, close) => {
        m.querySelector('[data-yes]').onclick = () => { close(); res(true); };
        m.querySelector('[data-no]').onclick = () => { close(); res(false); };
      },
    });
  });
}

// Fill <img data-key="..."> from IndexedDB. Grid images load only when scrolled near (IntersectionObserver),
// prefer small thumbnails (data-key="<id>:thumb", data-fallback="<cutout key>") and build missing thumbs in idle time.
async function loadOne(img) {
  const key = img.dataset.key; if (!key) return;
  img.removeAttribute('data-key');
  img.decoding = 'async';
  let url = await imageUrl(key);
  if (!url && img.dataset.fallback) { url = await imageUrl(img.dataset.fallback); if (url && key.endsWith(':thumb')) queueThumb(key, img.dataset.fallback); }
  if (url) img.src = url; else img.classList.add('missing');
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); loadOne(e.target); } }, { rootMargin: '400px 0px' }) : null;
export async function hydrateImages(root = document) {
  const imgs = $$('img[data-key]', root);
  const now = [];
  for (const img of imgs) { if (io && img.closest('.closet-grid, .picker, .dl-grid, .list, .chal-picks')) io.observe(img); else now.push(loadOne(img)); }
  await Promise.all(now);
}
const thumbQ = []; let thumbBusy = false;
function queueThumb(thumbKey, srcKey) {
  if (thumbQ.some((t) => t[0] === thumbKey)) return;
  thumbQ.push([thumbKey, srcKey]);
  if (thumbBusy) return; thumbBusy = true;
  const step = async () => {
    const job = thumbQ.shift(); if (!job) { thumbBusy = false; return; }
    try {
      const [{ imageBlob, saveImage }, { fileToCanvas, scaleCanvas, canvasToBlob }] = await Promise.all([import('../db.js'), import('../vision.js')]);
      const b = await imageBlob(job[1]);
      if (b) { const c = scaleCanvas(await fileToCanvas(b, 640), 320); let t = await canvasToBlob(c, 'image/webp', 0.85); if (!t || t.type !== 'image/webp') t = await canvasToBlob(c, 'image/png'); await saveImage(job[0], t); }
    } catch { /* skip */ }
    (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(step);
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(step);
}

export const swatch = (hex, size = 14) => `<span class="sw" style="background:${esc(hex)};width:${size}px;height:${size}px"></span>`;

export function bar(value, label = '') {
  const v = Math.max(0, Math.min(1, value || 0));
  return `<div class="bar" title="${esc(label)} ${Math.round(v * 100)}%"><i style="width:${(v * 100).toFixed(0)}%"></i></div>`;
}

// Circular score ring (0..1)
export function ring(v, size = 44, color = 'var(--accent)') {
  const r = size / 2 - 3, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, v));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="4"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
}

export function select(name, options, value, attrs = '') {
  return `<select name="${esc(name)}" ${attrs}>${options.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('')}</select>`;
}

export function chips(name, options, value, cls = '') {
  return `<div class="chips ${cls}" data-chips="${esc(name)}" role="tablist">${options.map(([v, l]) => `<button type="button" class="chip ${v === value ? 'on' : ''}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
}
// segmented control variant
export const seg = (name, options, value) => `<div class="seg" data-chips="${esc(name)}" role="tablist">${options.map(([v, l]) => `<button type="button" class="chip ${v === value ? 'on' : ''}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
export function bindChips(root, name, onChange) {
  const box = root.querySelector(`[data-chips="${name}"]`); if (!box) return;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    onChange(b.dataset.v);
  });
}

export const switchEl = (id, on, attrs = '') => `<label class="switch"><input type="checkbox" id="${esc(id)}" ${on ? 'checked' : ''} ${attrs}><i></i></label>`;

export function emptyState(ic, title, text, action = '') {
  return `<div class="empty"><div class="empty-ic">${icon(ic, 28)}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
}

export function pageHead(eyebrow, title, sub = '', actions = '') {
  return `<header class="ph"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${actions ? `<div class="ph-act">${actions}</div>` : ''}</header>`;
}

// ---------- Photos: paste anywhere a photo is asked for ----------
// Every image picker gets a "Paste" button, and Ctrl+V / long-press-paste drops the copied image into the
// picker that is on screen (the open sheet first). In the Android app the copied image is read natively.
async function clipboardImageFile() {
  try {
    const d = window.AndroidBridge?.clipboardImage?.();
    if (d) { const b = await (await fetch(d)).blob(); return new File([b], 'pasted.jpg', { type: b.type || 'image/jpeg' }); }
  } catch { /* old app */ }
  if (navigator.clipboard?.read) {
    try {
      for (const it of await navigator.clipboard.read()) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) { const b = await it.getType(type); return new File([b], 'pasted.' + type.split('/')[1], { type }); }
      }
    } catch { /* permission denied */ }
  }
  return null;
}
function feed(input, files) {
  const dt = new DataTransfer(); for (const f of files) dt.items.add(f);
  input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
}
function activeImageInput() {
  const scope = [...document.querySelectorAll('.modal-wrap')].pop() || document.getElementById('view');
  return [...(scope?.querySelectorAll('input[type=file]') || [])].find((i) => /image/.test(i.accept || '') && !i.disabled) || null;
}
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.items || [])].filter((x) => x.type.startsWith('image/')).map((x) => x.getAsFile()).filter(Boolean);
  if (!files.length) return;
  const input = activeImageInput(); if (!input) return;
  e.preventDefault(); feed(input, input.multiple ? files : files.slice(0, 1)); toast('Pasted image');
});
function addPasteButtons(root = document) {
  for (const input of root.querySelectorAll('input[type=file]:not([data-paste])')) {
    if (!/image/.test(input.accept || '') || input.closest('.no-paste')) continue;
    input.dataset.paste = '1';
    const host = input.closest('label') || input;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small paste-btn';
    b.innerHTML = `${icon('copy', 14)} Paste`; b.title = 'Paste a copied image';
    b.onclick = async () => { const f = await clipboardImageFile(); if (f) { feed(input, [f]); toast('Pasted image'); } else toast('Copy an image first (long-press a photo → Copy), then tap Paste', 4500); };
    host.insertAdjacentElement('afterend', b);
  }
}
let pasteT = 0;
new MutationObserver(() => { clearTimeout(pasteT); pasteT = setTimeout(() => addPasteButtons(document), 60); }).observe(document.documentElement, { childList: true, subtree: true });
