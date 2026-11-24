// Try-On: (1) instant on-device preview — garment cutouts placed on your own full-body photo using pose landmarks;
// (2) a professional prompt + reference sheet for photoreal generation in ChatGPT (or any image model).
import { imageUrl, saveImage, imageBlob, del, state } from './db.js';
import { makeCanvas, canvasToBlob, fileToCanvas } from './vision.js';
import { primaryColor } from './color.js';
import { SUBTYPES, OCCASIONS, CATEGORY_LABEL } from './enums.js';
import { profile, bodyLabel, myWear } from './profile.js';
import { garmentName } from './util.js';
import { detectBody } from './bodyscan.js';
import { copyText } from './native.js';

export const PHOTO_KEY = 'me:fullbody';
export async function savePhoto(canvas) { await saveImage(PHOTO_KEY, await canvasToBlob(canvas, 'image/jpeg', 0.9)); }
export async function photoCanvas(max = 1100) { const b = await imageBlob(PHOTO_KEY); return b ? fileToCanvas(b, max) : null; }
export async function deletePhoto() { await del('images', PHOTO_KEY); state.imageUrls.delete(PHOTO_KEY); }

const imgCache = new Map();
async function img(key) {
  if (imgCache.has(key)) return imgCache.get(key);
  const url = await imageUrl(key);
  const p = url ? new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }) : Promise.resolve(null);
  imgCache.set(key, p); return p;
}

const LONG_BOTTOMS = new Set(['jeans', 'chinos', 'dress trousers', 'joggers', 'leggings', 'cargo pants']);
const LONG_COATS = new Set(['overcoat', 'trench coat', 'parka', 'raincoat']);
const ORDER = { bottom: 1, footwear: 2, dress: 3, top: 4, accessory: 6, outerwear: 5, headwear: 7 };

// draw an image centred on (cx, top) with given width/height, rotated by angle around its top-centre
function place(ctx, im, cx, top, w, h, angle = 0, flip = false) {
  ctx.save(); ctx.translate(cx, top); ctx.rotate(angle); if (flip) ctx.scale(-1, 1);
  ctx.shadowColor = 'rgba(30,20,10,.28)'; ctx.shadowBlur = w * 0.04; ctx.shadowOffsetY = w * 0.015;
  ctx.drawImage(im, -w / 2, 0, w, h); ctx.restore();
}

export async function composeTryOn(photo, body, items, { studio = true } = {}) {
  const W = photo.width, H = photo.height; const c = makeCanvas(W, H); const ctx = c.getContext('2d');
  const P = (i) => ({ x: body.lm[i].x * W, y: body.lm[i].y * H, v: body.lm[i].v });
  if (studio && body.mask) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f4efe8'); g.addColorStop(1, '#e3d9cc'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const pc = makeCanvas(W, H); const px = pc.getContext('2d'); px.drawImage(photo, 0, 0);
    const mc = makeCanvas(body.mw, body.mh); const mx = mc.getContext('2d'); const id = mx.createImageData(body.mw, body.mh);
    for (let i = 0; i < body.mask.length; i++) { id.data[i * 4 + 3] = Math.max(0, Math.min(255, (body.mask[i] - 0.3) * 640)); }
    mx.putImageData(id, 0, 0);
    px.globalCompositeOperation = 'destination-in'; px.drawImage(mc, 0, 0, W, H);
    const sh = ctx.createRadialGradient(W / 2, H * 0.97, 0, W / 2, H * 0.97, W * 0.35); sh.addColorStop(0, 'rgba(60,40,20,.22)'); sh.addColorStop(1, 'rgba(60,40,20,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, H * 0.85, W, H * 0.15);
    ctx.drawImage(pc, 0, 0);
  } else ctx.drawImage(photo, 0, 0);

  const sL = P(11), sR = P(12), hL = P(23), hR = P(24), kL = P(25), kR = P(26), aL = P(27), aR = P(28);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const S = mid(sL, sR), Hp = mid(hL, hR);
  const sw = Math.hypot(sL.x - sR.x, sL.y - sR.y), hw = Math.hypot(hL.x - hR.x, hL.y - hR.y);
  const T = Math.hypot(Hp.x - S.x, Hp.y - S.y);
  const ang = Math.atan2(Hp.x - S.x, Hp.y - S.y) * -1;
  const ankleY = Math.max(aL.y, aR.y), kneeY = (kL.y + kR.y) / 2;
  const legLen = (aL.v > 0.3 || aR.v > 0.3) ? ankleY - Hp.y : (kneeY - Hp.y) * 2.05;

  const sorted = [...items].sort((a, b) => (ORDER[a.category] || 9) - (ORDER[b.category] || 9));
  let accI = 0;
  for (const g of sorted) {
    const im = await img(g.cutout); if (!im) continue;
    const ar = im.height / im.width;
    if (g.category === 'bottom') {
      const w = Math.max(hw * 2.25, sw * 0.95), top = Hp.y - T * 0.14;
      const h = LONG_BOTTOMS.has(g.subtype) ? legLen + T * 0.2 : w * ar;
      place(ctx, im, Hp.x, top, w, h, ang * 0.5);
    } else if (g.category === 'dress') {
      const w = sw * 1.45, top = S.y - T * 0.08; place(ctx, im, S.x, top, w, Math.max(w * ar, T * 1.3), ang);
    } else if (g.category === 'top') {
      const w = sw * 1.75, top = S.y - T * 0.14; place(ctx, im, S.x, top, w, Math.min(w * ar, T * 1.4), ang);
    } else if (g.category === 'outerwear') {
      const w = sw * 1.9, top = S.y - T * 0.16; const h = LONG_COATS.has(g.subtype) ? Math.max(w * ar, T * 1.9) : Math.min(w * ar, T * 1.45);
      place(ctx, im, S.x, top, w, h, ang);
    } else if (g.category === 'footwear') {
      const fw = Math.max(legLen * 0.32, hw * 1.0);
      for (const [a, flip] of [[aL, false], [aR, true]]) if (a.v > 0.2) place(ctx, im, a.x + (flip ? -1 : 1) * fw * 0.12, a.y - fw * ar * 0.45, fw, fw * ar, 0, flip);
    } else if (g.category === 'headwear') {
      const eL = P(7), eR = P(8), nose = P(0); const ew = Math.max(Math.hypot(eL.x - eR.x, eL.y - eR.y), sw * 0.35);
      const w = ew * 1.55; place(ctx, im, nose.x, nose.y - ew * 1.25, w, w * ar);
    } else if (g.category === 'accessory') {
      if (['bag', 'watch', 'jewelry'].includes(g.subtype)) { const wr = P(accI++ % 2 ? 15 : 16); const w = g.subtype === 'bag' ? T * 0.55 : T * 0.14; place(ctx, im, wr.x, wr.y - w * ar * 0.25, w, w * ar); }
      else if (g.subtype === 'scarf') { const w = sw * 0.5; place(ctx, im, S.x, S.y - T * 0.12, w, Math.min(w * ar, T * 0.9), ang); }
      else if (g.subtype === 'belt') { const w = hw * 2.3; place(ctx, im, Hp.x, Hp.y - T * 0.16, w, w * ar, ang * 0.5); }
    }
  }
  return c;
}

export async function bodyOf(photo) {
  const b = await detectBody(photo);
  if (!b) return { error: 'I could not find a person in your photo. Use a full-body photo, standing, facing the camera.' };
  const v = (i) => b.lm[i].v;
  if ([11, 12, 23, 24].some((i) => v(i) < 0.5)) return { error: 'Your shoulders and hips need to be clearly visible — use a full-body, front-facing photo.' };
  return b;
}

// ---------------- Prompt + reference sheet for ChatGPT ----------------
const SLOT_ORDER = ['outerwear', 'top', 'dress', 'bottom', 'footwear', 'headwear', 'accessory'];
export function describeItem(g) {
  const c = (g.colors || [])[0]; const c2 = (g.colors || [])[1];
  const pat = g.pattern && g.pattern !== 'solid' ? `${g.pattern} pattern${c2 ? ` with ${c2.name}` : ''}` : 'solid';
  return `${garmentName(g)} — ${c?.name || ''} ${g.subtype}, ${pat}, ${g.fabric || 'fabric as shown'}, ${g.fit || 'regular'} fit`.replace(/\s+/g, ' ');
}
export function tryOnPrompt(items, { occasion = null, setting = 'studio', withPhoto = true } = {}) {
  const p = profile();
  const list = SLOT_ORDER.flatMap((s) => items.filter((g) => g.category === s));
  const lines = list.map((g, i) => `${i + 1}. ${CATEGORY_LABEL[g.category]}: ${describeItem(g)}`);
  const layering = [];
  const top = list.find((g) => g.category === 'top'), outer = list.find((g) => g.category === 'outerwear'), bot = list.find((g) => g.category === 'bottom');
  if (outer && (top || list.find((g) => g.category === 'dress'))) layering.push(`the ${outer.subtype} is worn open over the ${top ? top.subtype : 'dress'}`);
  if (top && bot && ['oxford shirt', 'dress shirt', 'blouse', 'polo', 'turtleneck'].includes(top.subtype) && ['dress trousers', 'chinos', 'skirt'].includes(bot.subtype)) layering.push(`the ${top.subtype} is neatly tucked in`);
  const scene = { studio: 'a clean, softly lit seamless studio backdrop in warm off-white', street: 'a calm city street in soft overcast daylight, shallow depth of field', office: 'a bright modern office lobby with natural window light', evening: 'an elegant restaurant entrance at dusk with warm ambient light' }[setting] || setting;
  const who = withPhoto
    ? `IMAGE 1 is a photo of me: use this exact person as the model. Preserve their face, identity, skin tone, hairstyle, height and body shape${p.bodyShape ? ` (${bodyLabel(p.bodyShape, myWear()).toLowerCase()})` : ''} exactly — do not slim, reshape, beautify or change age.`
    : `Model: a person${p.gender && p.gender !== 'none' && p.gender !== 'nonbinary' ? ` (${p.gender === 'women' ? 'woman' : 'man'})` : ''}${p.bodyShape ? ` with a ${bodyLabel(p.bodyShape, myWear()).toLowerCase()} body shape` : ''}${p.height ? `, ${p.height} height` : ''}${p.skinHex ? `, skin tone close to ${p.skinHex}` : ''}.`;
  return [
    'Create one photorealistic, full-body fashion photo for a virtual try-on.',
    who,
    `${withPhoto ? 'IMAGE 2 shows the clothes, numbered. ' : 'The attached image shows the clothes, numbered. '}Dress the person in EXACTLY these garments — match each one's color, pattern, fabric texture, length and fit precisely; do not add, swap or redesign any item:`,
    ...lines,
    layering.length ? `Styling: ${layering.join('; ')}.` : '',
    occasion ? `Occasion: ${OCCASIONS[occasion]?.label || occasion} — styling should feel appropriate for it.` : '',
    `Pose: natural relaxed standing pose, facing the camera, full body visible head to toe including shoes. Realistic fabric drape, folds and shadows consistent with the light.`,
    `Setting: ${scene}. Camera: 50mm lens at chest height, 4:5 portrait framing, sharp focus, true-to-life color, editorial fashion-catalog quality.`,
    'No text, logos, watermarks, extra accessories, extra people or distorted hands. Output a single image.',
  ].filter(Boolean).join('\n');
}

// The clothes sheet: numbered garments on a clean background (your photo is shared as its own image).
export async function referenceSheet(items, photo = null) {
  const list = SLOT_ORDER.flatMap((s) => items.filter((g) => g.category === s));
  const Wd = 1600, Ht = 1100; const c = makeCanvas(Wd, Ht); const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f2ec'; ctx.fillRect(0, 0, Wd, Ht);
  let x0 = 40;
  if (photo) {
    const ph = Ht - 80, pw = Math.min(620, ph * (photo.width / photo.height));
    ctx.drawImage(photo, 40, 40, pw, ph); x0 = 40 + pw + 40;
    ctx.fillStyle = 'rgba(23,20,18,.75)'; ctx.fillRect(40, 40, 160, 44); ctx.fillStyle = '#fff'; ctx.font = '700 22px Manrope, system-ui'; ctx.fillText('ME', 60, 70);
  }
  const cols = list.length > 4 ? 3 : 2, rows = Math.ceil(list.length / cols);
  const cw = (Wd - x0 - 40) / cols, ch = (Ht - 80) / Math.max(rows, 1);
  for (let i = 0; i < list.length; i++) {
    const g = list[i]; const cx = x0 + (i % cols) * cw, cy = 40 + Math.floor(i / cols) * ch;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cx + 8, cy + 8, cw - 16, ch - 16);
    const im = await img(g.cutout);
    if (im) { const s = Math.min((cw - 60) / im.width, (ch - 110) / im.height); ctx.drawImage(im, cx + cw / 2 - (im.width * s) / 2, cy + 24, im.width * s, im.height * s); }
    else { ctx.fillStyle = primaryColor(g).hex; ctx.fillRect(cx + 40, cy + 40, cw - 80, ch - 140); }
    ctx.fillStyle = '#171412'; ctx.beginPath(); ctx.arc(cx + 34, cy + 34, 18, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 20px Manrope, system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), cx + 34, cy + 41); ctx.textAlign = 'left';
    ctx.fillStyle = '#171412'; ctx.font = '700 20px Manrope, system-ui';
    const label = garmentName(g); ctx.fillText(label.length > 30 ? label.slice(0, 29) + '…' : label, cx + 22, cy + ch - 34);
  }
  return c;
}

export const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// Everything ChatGPT (or an API) needs: IMAGE 1 = your photo, IMAGE 2 = the numbered clothes, plus the prompt.
export async function buildTryOnPack(items, photo, opts) {
  const prompt = tryOnPrompt(items, { ...opts, withPhoto: !!photo });
  const sheet = await referenceSheet(items, null);
  const sheetBlob = await canvasToBlob(sheet, 'image/jpeg', 0.9);
  const files = [];
  let photoBlob = null;
  if (photo) { photoBlob = await canvasToBlob(photo, 'image/jpeg', 0.9); files.push(new File([photoBlob], '1-me.jpg', { type: 'image/jpeg' })); }
  files.push(new File([sheetBlob], photo ? '2-clothes.jpg' : 'clothes.jpg', { type: 'image/jpeg' }));
  await copyText(prompt);
  return { prompt, files, sheetBlob, photoBlob };
}
export { SUBTYPES };
