// Visual outfit previews: flat-lay composite (MVP) and 2D mannequin layering (v1), client-side canvas.
import { imageUrl } from './db.js';
import { makeCanvas, canvasToBlob } from './vision.js';
import { primaryColor } from './color.js';
import { myWear } from './profile.js';
import { saveBlob, shareFile, canShareFiles } from './native.js';

const imgCache = new Map();
function loadImg(url) {
  if (!url) return Promise.resolve(null);
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  imgCache.set(url, p); return p;
}

// [cx, cy, boxW, boxH] in unit square
function flatlayLayout(items) {
  const has = (c) => items.some((g) => g.category === c);
  const L = {};
  if (has('dress')) {
    if (has('outerwear')) { L.outerwear = [0.27, 0.36, 0.42, 0.56]; L.dress = [0.58, 0.47, 0.4, 0.78]; }
    else L.dress = [0.42, 0.47, 0.46, 0.82];
  } else if (has('outerwear')) {
    L.outerwear = [0.27, 0.3, 0.44, 0.5]; L.top = [0.6, 0.27, 0.4, 0.4]; L.bottom = [0.46, 0.71, 0.34, 0.5];
  } else { L.top = [0.42, 0.28, 0.5, 0.42]; L.bottom = [0.42, 0.71, 0.38, 0.5]; }
  L.footwear = [0.79, 0.86, 0.28, 0.2];
  L.headwear = [0.12, 0.66, 0.18, 0.14];
  L.accessory = [[0.87, 0.36, 0.18, 0.17], [0.87, 0.57, 0.18, 0.17], [0.13, 0.86, 0.16, 0.16]];
  return L;
}
function mannequinLayout(items) {
  const has = (c) => items.some((g) => g.category === c);
  const L = { headwear: [0.5, 0.07, 0.2, 0.12] };
  if (has('dress')) L.dress = [0.5, 0.48, 0.46, 0.64];
  else { L.top = [0.5, 0.33, 0.46, 0.34]; L.bottom = [0.5, 0.66, 0.32, 0.44]; }
  L.outerwear = [0.5, 0.36, 0.6, 0.44];
  L.footwear = [0.5, 0.92, 0.26, 0.12];
  L.accessory = [[0.86, 0.3, 0.16, 0.16], [0.86, 0.52, 0.16, 0.16], [0.14, 0.4, 0.16, 0.16]];
  return L;
}
// z-order for mannequin: top tucks behind the bottom, outerwear over both
const Z = { headwear: 6, top: 1, dress: 1, bottom: 2, footwear: 3, outerwear: 4, accessory: 5 };

// Subtle dress-form behind mannequin previews, proportioned for the chosen wardrobe focus.
const FORM = { women: [0.125, 0.082, 0.132], men: [0.158, 0.112, 0.118], all: [0.142, 0.096, 0.126] };
function drawForm(ctx, S, wear) {
  const [sh, wa, hi] = FORM[wear] || FORM.all; const X = (v) => (0.5 + v) * S, Y = (v) => v * S;
  ctx.save(); ctx.fillStyle = 'rgba(70,52,36,0.075)';
  ctx.beginPath(); ctx.ellipse(X(0), Y(0.072), S * 0.04, S * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(X(-0.017), Y(0.115), S * 0.034, S * 0.05);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0.158));
    ctx.lineTo(X(side * sh * 0.8), Y(0.158));
    ctx.quadraticCurveTo(X(side * sh), Y(0.162), X(side * sh), Y(0.205));
    ctx.lineTo(X(side * (sh + 0.03)), Y(0.47)); ctx.lineTo(X(side * (sh + 0.005)), Y(0.475)); ctx.lineTo(X(side * (sh - 0.012)), Y(0.25));
    ctx.quadraticCurveTo(X(side * (wa + 0.01)), Y(0.3), X(side * wa), Y(0.36));
    ctx.quadraticCurveTo(X(side * hi), Y(0.43), X(side * hi), Y(0.5));
    ctx.lineTo(X(side * 0.078), Y(0.9)); ctx.lineTo(X(side * 0.036), Y(0.9)); ctx.lineTo(X(side * 0.012), Y(0.55)); ctx.lineTo(X(0), Y(0.55));
    ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(X(0), Y(0.965), 0, X(0), Y(0.965), S * 0.2);
  g.addColorStop(0, 'rgba(60,40,20,0.16)'); g.addColorStop(1, 'rgba(60,40,20,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X(0), Y(0.965), S * 0.2, S * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export async function renderOutfit(items, { size = 600, mode = 'flatlay', caption = null, chip = null, title = null, wear = null } = {}) {
  wear = wear || myWear();
  const S = size; const H = caption ? Math.round(S * 1.16) : S;
  const c = makeCanvas(S, H); const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, S * 0.4, H);
  grad.addColorStop(0, '#f7f3ee'); grad.addColorStop(1, '#ece5db');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, S, H);
  const vg = ctx.createRadialGradient(S / 2, S * 0.45, S * 0.1, S / 2, S * 0.5, S * 0.75);
  vg.addColorStop(0, 'rgba(255,255,255,0.55)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, S, S);
  if (mode === 'mannequin') drawForm(ctx, S, wear);
  const L = mode === 'mannequin' ? mannequinLayout(items) : flatlayLayout(items);
  const sorted = [...items].sort((a, b) => (mode === 'mannequin' ? (Z[a.category] || 0) - (Z[b.category] || 0) : 0));
  let accI = 0;
  for (const g of sorted) {
    let box = L[g.category];
    if (g.category === 'accessory') { box = L.accessory[accI++ % 3]; }
    if (!box) continue;
    const [cx, cy, bw, bh] = box;
    const img = await loadImg(await imageUrl(g.cutout));
    const BW = bw * S, BH = bh * S;
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,0.22)'; ctx.shadowBlur = S * 0.025; ctx.shadowOffsetY = S * 0.012;
    if (img) {
      const s = Math.min(BW / img.width, BH / img.height);
      const w = img.width * s, h = img.height * s;
      ctx.drawImage(img, cx * S - w / 2, cy * S - h / 2, w, h);
    } else {
      ctx.fillStyle = primaryColor(g).hex; const w = BW * 0.8, h = BH * 0.8;
      roundRect(ctx, cx * S - w / 2, cy * S - h / 2, w, h, S * 0.03); ctx.fill();
    }
    ctx.restore();
  }
  if (chip) {
    ctx.font = `600 ${Math.round(S * 0.032)}px system-ui, sans-serif`;
    const tw = ctx.measureText(chip).width; const ph = S * 0.055;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; roundRect(ctx, S * 0.03, S * 0.03, tw + S * 0.05, ph, ph / 2); ctx.fill();
    ctx.fillStyle = '#3b3229'; ctx.textBaseline = 'middle'; ctx.fillText(chip, S * 0.055, S * 0.03 + ph / 2);
  }
  if (caption) {
    ctx.fillStyle = '#fffdfa'; ctx.fillRect(0, S, S, H - S);
    ctx.fillStyle = '#171412'; ctx.textBaseline = 'top';
    if (title) { ctx.font = `400 ${Math.round(S * 0.045)}px "Instrument Serif", Georgia, serif`; ctx.fillText(title, S * 0.05, S * 1.0); }
    ctx.font = `${Math.round(S * 0.026)}px Manrope, system-ui, sans-serif`; ctx.fillStyle = '#5a5148';
    wrapText(ctx, caption, S * 0.05, S * (title ? 1.055 : 1.02), S * 0.9, S * 0.035, 3);
  }
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lh); line = w; n++; if (n >= maxLines - 1) { const rest = words.slice(words.indexOf(w)).join(' '); let r = rest; while (ctx.measureText(r + '…').width > maxW && r.length) r = r.slice(0, -1); ctx.fillText(r === rest ? r : r + '…', x, y + n * lh); return; } }
    else line = t;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}

export async function shareOutfit(items, { caption, chip, title, mode, wear } = {}) {
  const c = await renderOutfit(items, { size: 1080, mode, caption, chip, title: title || 'Today’s outfit', wear });
  const blob = await canvasToBlob(c, 'image/png');
  const file = new File([blob], 'outfit.png', { type: 'image/png' });
  if (canShareFiles(file)) { const r = await shareFile(file, { title: 'My outfit', text: caption || '' }); if (r === 'shared') return 'shared'; }
  await saveBlob(blob, 'outfit.png');
  return 'downloaded';
}
