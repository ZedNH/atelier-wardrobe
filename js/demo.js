// Demo wardrobe: procedurally drawn garments (womenswear, menswear or mixed) + 100 days of plausible wear history,
// so every feature can be tried before photographing a single item.
import { SUBTYPES } from './enums.js';
import { state, uid, saveGarment, saveImage, putMany, saveSettings } from './db.js';
import { makeColor, hexToRgb, rgbToHex } from './color.js';
import { makeCanvas, canvasToBlob, trimAlpha } from './vision.js';
import { deriveWarmth, deriveSeason, DAY } from './util.js';
import { defaultFabric } from './pipeline.js';
import { generate } from './recommender.js';
import { manualWeather, todayStr, addDays } from './weather.js';
import { washLimit } from './actions.js';
import { myRegion } from './profile.js';

const SHAPES = {
  tee: { w: 400, h: 400, d: 'M35,8 Q50,17 65,8 L88,18 L99,38 L82,45 L78,37 L78,96 L22,96 L22,37 L18,45 L1,38 L12,18 Z' },
  long: { w: 400, h: 420, d: 'M35,7 Q50,16 65,7 L84,13 Q92,19 94,40 L99,88 L86,90 L80,45 L80,96 L20,96 L20,45 L14,90 L1,88 L6,40 Q8,19 16,13 Z' },
  tank: { w: 320, h: 420, d: 'M28,4 L39,4 Q50,24 61,4 L72,4 L73,30 Q80,40 80,50 L80,96 L20,96 L20,50 Q20,40 27,30 Z' },
  pants: { w: 280, h: 480, d: 'M20,2 L80,2 L84,98 L58,98 L50,28 L42,98 L16,98 Z' },
  shorts: { w: 360, h: 300, d: 'M16,5 L84,5 L90,78 L57,82 L50,40 L43,82 L10,78 Z' },
  skirt: { w: 340, h: 380, d: 'M30,4 L70,4 L90,92 Q50,101 10,92 Z' },
  dress: { w: 330, h: 480, d: 'M36,3 Q50,11 64,3 L70,7 L66,30 Q64,38 70,48 L88,97 Q50,102 12,97 L30,48 Q36,38 34,30 L30,7 Z' },
  gown: { w: 330, h: 520, d: 'M38,3 Q50,10 62,3 L66,8 L63,32 Q62,40 66,50 L92,98 Q50,103 8,98 L34,50 Q38,40 37,32 L34,8 Z' },
  jacket: { w: 420, h: 440, d: 'M33,6 L50,30 L67,6 L85,12 Q93,19 95,40 L99,90 L86,92 L81,46 L81,96 L19,96 L19,46 L14,92 L1,90 L5,40 Q7,19 15,12 Z' },
  coat: { w: 400, h: 540, d: 'M34,4 L50,26 L66,4 L84,9 Q92,15 94,34 L98,80 L86,82 L81,40 L83,98 L17,98 L19,40 L14,82 L2,80 L6,34 Q8,15 16,9 Z' },
  sneaker: { w: 420, h: 230, d: 'M4,62 Q4,40 24,38 L44,28 Q56,25 63,38 Q80,44 92,51 Q99,58 97,70 L5,72 Z' },
  boot: { w: 360, h: 330, d: 'M22,4 L52,4 L54,54 Q80,57 93,65 Q99,74 95,84 L19,86 Z' },
  loafer: { w: 420, h: 200, d: 'M5,64 Q7,44 30,42 Q60,36 80,48 Q97,55 95,72 L7,74 Z' },
  heel: { w: 400, h: 260, d: 'M6,40 Q30,30 52,58 Q70,74 92,70 Q99,72 96,80 L66,82 L64,94 L60,94 L60,82 Q36,80 22,66 L6,58 Z' },
  sandal: { w: 420, h: 200, d: 'M5,70 Q6,60 30,60 L90,60 Q97,62 96,72 L6,76 Z M30,60 Q45,30 62,60 Z' },
  bag: { w: 340, h: 320, d: 'M12,34 L88,34 L94,96 L6,96 Z M32,34 Q32,6 50,6 Q68,6 68,34 L62,34 Q62,13 50,13 Q38,13 38,34 Z' },
  cap: { w: 360, h: 220, d: 'M14,70 Q14,14 54,14 Q90,14 90,62 L99,72 Q80,80 60,72 L14,74 Z' },
  beanie: { w: 300, h: 280, d: 'M10,78 Q10,10 50,8 Q90,10 90,78 Z M8,72 L92,72 L92,96 L8,96 Z' },
  belt: { w: 460, h: 140, d: 'M2,38 L98,38 L98,62 L2,62 Z' },
  watch: { w: 200, h: 340, d: 'M36,2 L64,2 L64,30 L36,30 Z M36,70 L64,70 L64,98 L36,98 Z M50,28 A24,24 0 1,1 49.9,28 Z' },
  scarf: { w: 220, h: 480, d: 'M20,2 L80,2 Q86,50 78,98 L18,98 Q12,50 20,2 Z' },
  // South Asian silhouettes
  kurta: { w: 360, h: 560, d: 'M36,4 Q50,12 64,4 L82,9 Q90,14 92,30 L98,60 L86,62 L80,34 L82,97 L18,97 L20,34 L14,62 L2,60 L8,30 Q10,14 18,9 Z' },
  skameez: { w: 360, h: 660, d: 'M36,3 Q50,10 64,3 L82,7 Q90,11 92,24 L98,48 L86,50 L80,27 L82,74 L66,74 L68,99 L55,99 L50,77 L45,99 L32,99 L34,74 L18,74 L20,27 L14,50 L2,48 L8,24 Q10,11 18,7 Z' },
  saree: { w: 340, h: 580, d: 'M38,3 Q50,9 62,3 L66,8 L64,30 Q63,40 68,50 L90,98 Q50,103 10,98 L32,50 Q37,40 36,30 L34,8 Z' },
  vest: { w: 340, h: 420, d: 'M30,4 L50,30 L70,4 L82,8 L82,96 L18,96 L18,8 Z' },
  hijab: { w: 320, h: 360, rule: 'evenodd', d: 'M50,3 Q86,3 89,40 Q92,70 97,97 L3,97 Q8,70 11,40 Q14,3 50,3 Z M50,18 m-17,0 a17,21 0 1,0 34,0 a17,21 0 1,0 -34,0 Z' },
  tupi: { w: 300, h: 170, d: 'M6,96 Q6,8 50,6 Q94,8 94,96 Z' },
  wide: { w: 320, h: 480, d: 'M18,2 L82,2 L96,98 L58,98 L50,30 L42,98 L4,98 Z' },
};

const SHAPE_OF = {
  't-shirt': 'tee', 'graphic tee': 'tee', 'polo': 'tee', 'tank top': 'tank', 'activewear top': 'tee',
  'oxford shirt': 'long', 'dress shirt': 'long', 'linen shirt': 'long', 'blouse': 'long', 'henley': 'long', 'sweater': 'long', 'turtleneck': 'long', 'sweatshirt': 'long', 'hoodie': 'long',
  'jeans': 'pants', 'chinos': 'pants', 'dress trousers': 'pants', 'joggers': 'pants', 'leggings': 'pants', 'cargo pants': 'pants', 'shorts': 'shorts', 'skirt': 'skirt',
  'casual dress': 'dress', 'shirt dress': 'dress', 'maxi dress': 'gown', 'cocktail dress': 'dress', 'formal gown': 'gown', 'jumpsuit': 'dress',
  'blazer': 'jacket', 'suit jacket': 'jacket', 'cardigan': 'jacket', 'denim jacket': 'jacket', 'leather jacket': 'jacket', 'bomber': 'jacket', 'fleece': 'jacket', 'raincoat': 'coat', 'trench coat': 'coat', 'overcoat': 'coat', 'parka': 'coat', 'puffer': 'jacket',
  'sneakers': 'sneaker', 'running shoes': 'sneaker', 'canvas shoes': 'sneaker', 'loafers': 'loafer', 'oxford shoes': 'loafer', 'derby shoes': 'loafer', 'suede shoes': 'loafer', 'flats': 'loafer',
  'chelsea boots': 'boot', 'boots': 'boot', 'sandals': 'sandal', 'heels': 'heel',
  'bag': 'bag', 'belt': 'belt', 'watch': 'watch', 'scarf': 'scarf', 'tie': 'scarf', 'jewelry': 'watch', 'sunglasses': 'belt',
  'cap': 'cap', 'beanie': 'beanie', 'hat': 'cap',
  'kurti': 'kurta', 'kurta': 'kurta', 'panjabi': 'kurta', 'fotua': 'tee', 'salwar': 'wide', 'churidar': 'pants', 'pajama': 'pants', 'palazzo': 'wide', 'lungi': 'skirt', 'dhoti': 'wide',
  'saree': 'saree', 'salwar kameez': 'skameez', 'anarkali': 'gown', 'lehenga': 'gown', 'sherwani': 'coat', 'koti': 'vest', 'nagra': 'loafer', 'kolhapuri': 'sandal',
  'dupatta': 'scarf', 'shawl': 'scarf', 'hijab': 'hijab', 'tupi': 'tupi',
};

const shade = (hex, f) => { const [r, g, b] = hexToRgb(hex); return rgbToHex(f > 0 ? [r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f] : [r * (1 + f), g * (1 + f), b * (1 + f)]); };

export function drawGarment(spec) {
  const sh = SHAPES[SHAPE_OF[spec.subtype] || 'tee'];
  const c = makeCanvas(sh.w, sh.h); const ctx = c.getContext('2d');
  const sx = sh.w / 100, sy = sh.h / 100;
  ctx.save(); ctx.scale(sx, sy);
  const path = new Path2D(sh.d);
  const rule = sh.rule || 'nonzero';
  ctx.fillStyle = spec.hex; ctx.fill(path, rule);
  ctx.save(); ctx.clip(path, rule);
  const accent = spec.accent || (spec.pattern === 'stripe' ? '#f7f7f5' : shade(spec.hex, 0.35));
  ctx.lineWidth = 0;
  if (spec.pattern === 'stripe') { ctx.fillStyle = accent; for (let y = 0; y < 100; y += 8) ctx.fillRect(0, y, 100, 3.5); }
  if (spec.pattern === 'check') {
    ctx.globalAlpha = 0.45; ctx.fillStyle = accent; for (let x = 0; x < 100; x += 12) ctx.fillRect(x, 0, 4, 100);
    for (let y = 0; y < 100; y += 12) ctx.fillRect(0, y, 100, 4); ctx.globalAlpha = 1;
    ctx.strokeStyle = shade(spec.hex, -0.5); ctx.lineWidth = 0.6; for (let x = 6; x < 100; x += 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 100); ctx.stroke(); }
  }
  if (spec.pattern === 'floral') {
    for (let i = 0; i < 46; i++) {
      const x = (i * 37) % 100, y = (i * 53) % 100;
      ctx.fillStyle = i % 2 ? accent : (spec.accent2 || '#f7f7f5');
      for (let p = 0; p < 5; p++) { ctx.beginPath(); ctx.arc(x + Math.cos(p * 1.256) * 2.2, y + Math.sin(p * 1.256) * 2.2, 1.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#f0d23c'; ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill();
    }
  }
  if (spec.pattern === 'graphic') {
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(50, 45, 14, 0, 7); ctx.fill();
    ctx.fillStyle = spec.hex; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('â˜…', 50, 49);
  }
  if (spec.pattern === 'textured') {
    ctx.strokeStyle = shade(spec.hex, -0.18); ctx.lineWidth = 0.7;
    for (let x = 0; x < 100; x += 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 100); ctx.stroke(); }
  }
  // details
  ctx.strokeStyle = shade(spec.hex, -0.35); ctx.lineWidth = 0.9; ctx.fillStyle = shade(spec.hex, -0.15);
  const s = spec.subtype; const shp = SHAPE_OF[s];
  if (['oxford shirt', 'dress shirt', 'linen shirt', 'polo', 'blouse'].includes(s)) {
    ctx.beginPath(); ctx.moveTo(50, 16); ctx.lineTo(50, s === 'polo' ? 34 : 96); ctx.stroke();
    ctx.fillStyle = shade(spec.hex, 0.25); ctx.beginPath(); ctx.moveTo(36, 7); ctx.lineTo(50, 18); ctx.lineTo(42, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 7); ctx.lineTo(50, 18); ctx.lineTo(58, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(spec.hex, -0.3); for (let y = 26; y < (s === 'polo' ? 34 : 92); y += 12) { ctx.beginPath(); ctx.arc(50, y, 0.9, 0, 7); ctx.fill(); }
  }
  if (s === 'hoodie') { ctx.beginPath(); ctx.ellipse(50, 12, 16, 9, 0, 0, 7); ctx.stroke(); ctx.strokeRect(34, 64, 32, 16); }
  if (s === 'turtleneck') { ctx.fillStyle = shade(spec.hex, -0.1); ctx.fillRect(38, 2, 24, 10); ctx.strokeRect(38, 2, 24, 10); }
  if (['sweater', 'turtleneck', 'sweatshirt', 'hoodie', 'cardigan'].includes(s)) { ctx.fillStyle = shade(spec.hex, -0.12); ctx.fillRect(20, 90, 60, 6); ctx.fillRect(0, 84, 15, 6); ctx.fillRect(85, 84, 15, 6); }
  if (shp === 'pants') { ctx.beginPath(); ctx.moveTo(50, 2); ctx.lineTo(50, 28); ctx.stroke(); ctx.fillStyle = shade(spec.hex, -0.15); ctx.fillRect(20, 2, 60, 5); if (s === 'cargo pants') { ctx.strokeRect(20, 45, 12, 14); ctx.strokeRect(68, 45, 12, 14); } }
  if (s === 'jeans') { ctx.strokeStyle = '#c99a2e'; ctx.setLineDash([1.2, 1]); ctx.beginPath(); ctx.moveTo(22, 12); ctx.quadraticCurveTo(32, 18, 40, 10); ctx.moveTo(78, 12); ctx.quadraticCurveTo(68, 18, 60, 10); ctx.stroke(); ctx.setLineDash([]); }
  if (shp === 'jacket' || shp === 'coat') {
    ctx.beginPath(); ctx.moveTo(50, shp === 'coat' ? 26 : 30); ctx.lineTo(50, 98); ctx.stroke();
    ctx.fillStyle = shade(spec.hex, -0.12);
    ctx.beginPath(); ctx.moveTo(34, 6); ctx.lineTo(50, 30); ctx.lineTo(40, 44); ctx.lineTo(30, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(66, 6); ctx.lineTo(50, 30); ctx.lineTo(60, 44); ctx.lineTo(70, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (s === 'puffer') { for (let y = 20; y < 96; y += 11) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(100, y); ctx.stroke(); } }
    if (s === 'denim jacket') { ctx.strokeRect(25, 30, 14, 10); ctx.strokeRect(61, 30, 14, 10); }
    ctx.fillStyle = shade(spec.hex, -0.4); for (let y = 52; y < 90; y += 14) { ctx.beginPath(); ctx.arc(54, y, 1.2, 0, 7); ctx.fill(); }
  }
  if (shp === 'sneaker' || shp === 'loafer' || shp === 'boot') {
    ctx.fillStyle = spec.sole || (shp === 'sneaker' ? '#f4f4f2' : '#2a2018');
    ctx.fillRect(0, shp === 'boot' ? 80 : shp === 'loafer' ? 68 : 64, 100, 10);
    if (shp === 'sneaker') { ctx.strokeStyle = shade(spec.hex, -0.4); for (let x = 40; x < 60; x += 5) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 6, 44); ctx.stroke(); } }
    if (s === 'chelsea boots') { ctx.fillStyle = '#3a3d42'; ctx.fillRect(40, 20, 8, 30); }
  }
  if (s === 'belt') { ctx.fillStyle = '#c8c8c8'; ctx.fillRect(80, 32, 12, 36); ctx.fillStyle = spec.hex; ctx.fillRect(83, 38, 6, 24); }
  if (s === 'watch') { ctx.fillStyle = '#f7f7f5'; ctx.beginPath(); ctx.arc(50, 50, 17, 0, 7); ctx.fill(); ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(50, 50); ctx.lineTo(50, 39); ctx.moveTo(50, 50); ctx.lineTo(58, 53); ctx.stroke(); }
  if (s === 'cap') { ctx.fillStyle = shade(spec.hex, -0.2); ctx.beginPath(); ctx.arc(52, 15, 2.5, 0, 7); ctx.fill(); }
  // South Asian details: border (paar), pallu drape, neck placket, embroidery
  const border = spec.border || '#c99a2e';
  if (s === 'saree') {
    ctx.fillStyle = border; ctx.fillRect(0, 92, 100, 6);
    ctx.save(); ctx.translate(36, 6); ctx.rotate(0.62); ctx.fillStyle = shade(spec.hex, -0.12); ctx.fillRect(-4, 0, 13, 80); ctx.fillStyle = border; ctx.fillRect(7, 0, 3, 80); ctx.restore();
  }
  if (['kurti', 'kurta', 'panjabi', 'salwar kameez', 'anarkali'].includes(s)) {
    ctx.strokeStyle = shade(spec.hex, -0.35); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(50, 9); ctx.lineTo(50, 28); ctx.stroke();
    ctx.fillStyle = spec.border || shade(spec.hex, -0.3); for (let y = 12; y < 28; y += 5) { ctx.beginPath(); ctx.arc(50, y, 0.9, 0, 7); ctx.fill(); }
    if (spec.border) { ctx.fillStyle = spec.border; ctx.fillRect(0, s === 'salwar kameez' ? 71 : 93, 100, 2.5); ctx.fillRect(0, 56, 14, 2); ctx.fillRect(86, 56, 14, 2); }
  }
  if (s === 'lehenga' || s === 'sherwani') { ctx.fillStyle = border; for (let i = 0; i < 40; i++) { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc((i * 29) % 100, 40 + ((i * 47) % 60), 0.9, 0, 7); ctx.fill(); } ctx.globalAlpha = 1; ctx.fillRect(0, 93, 100, 5); }
  if (s === 'dupatta') { ctx.fillStyle = border; ctx.fillRect(0, 0, 100, 3); ctx.fillRect(0, 95, 100, 3); }
  if (s === 'koti') { ctx.fillStyle = shade(spec.hex, -0.4); for (let y = 40; y < 92; y += 12) { ctx.beginPath(); ctx.arc(52, y, 1.1, 0, 7); ctx.fill(); } }
  if (s === 'nagra') { ctx.fillStyle = border; for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(30 + i * 4, 52 + (i % 2) * 3, 1.2, 0, 7); ctx.fill(); } }
  // soft shading
  const gr = ctx.createLinearGradient(0, 0, 100, 100);
  gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 100, 100);
  ctx.restore();
  ctx.strokeStyle = shade(spec.hex, -0.45); ctx.lineWidth = 0.8; ctx.stroke(path);
  ctx.restore();
  return trimAlpha(c, 0.03);
}

const D = (subtype, hex, name, extra = {}) => ({ subtype, hex, name, ...extra });
export const DEMO_ITEMS = [
  D('oxford shirt', '#f7f7f5', 'white oxford', { price: 45, fit: 'regular' }),
  D('oxford shirt', '#9cc3e6', 'light blue oxford', { price: 45 }),
  D('polo', '#1f2a44', 'navy polo', { price: 35 }),
  D('t-shirt', '#f7f7f5', 'white tee', { price: 15 }),
  D('t-shirt', '#111111', 'black tee', { price: 15 }),
  D('t-shirt', '#808285', 'grey tee', { price: 15, fit: 'oversized' }),
  D('t-shirt', '#1f2a44', 'breton stripe tee', { pattern: 'stripe', accent: '#f7f7f5', price: 30 }),
  D('graphic tee', '#c8302c', 'red graphic tee', { pattern: 'graphic', accent: '#f7f7f5', price: 20 }),
  D('sweater', '#3a3d42', 'charcoal merino sweater', { fabric: 'wool', price: 70 }),
  D('sweater', '#efe6d2', 'cream cable knit', { pattern: 'textured', fabric: 'knit', price: 80, fit: 'relaxed' }),
  D('henley', '#6b6b2e', 'olive henley', { price: 30, s: 'm' }),
  D('turtleneck', '#6e1f2e', 'burgundy turtleneck', { fabric: 'knit', price: 55 }),
  D('hoodie', '#c4c6c8', 'grey hoodie', { price: 40, fit: 'oversized' }),
  D('blouse', '#ee9cb6', 'blush silk blouse', { fabric: 'silk', price: 60, s: 'w' }),
  D('oxford shirt', '#6e1f2e', 'burgundy check shirt', { pattern: 'check', accent: '#1f2a44', price: 40 }),
  D('linen shirt', '#efe6d2', 'cream linen shirt', { fabric: 'linen', price: 50 }),
  D('blouse', '#1f7a7a', 'teal floral blouse', { pattern: 'floral', accent: '#ee9cb6', price: 55, neverWear: true, s: 'w' }),
  D('activewear top', '#111111', 'black training top', { price: 25 }),
  D('jeans', '#2c3e5c', 'dark indigo jeans', { price: 80, fit: 'slim' }),
  D('jeans', '#7f9bbd', 'light wash jeans', { price: 60, fit: 'relaxed' }),
  D('chinos', '#d8c3a0', 'beige chinos', { price: 50 }),
  D('chinos', '#1f2a44', 'navy chinos', { price: 50, s: 'm' }),
  D('dress trousers', '#3a3d42', 'charcoal trousers', { fabric: 'wool', price: 90 }),
  D('joggers', '#111111', 'black joggers', { price: 35 }),
  D('shorts', '#a89a6c', 'khaki shorts', { price: 30 }),
  D('skirt', '#111111', 'black midi skirt', { price: 45, s: 'w' }),
  D('cargo pants', '#6b6b2e', 'olive cargos', { price: 55, fit: 'relaxed' }),
  D('blazer', '#1f2a44', 'navy blazer', { fabric: 'wool', price: 160 }),
  D('denim jacket', '#4a6585', 'denim jacket', { fabric: 'denim', price: 70 }),
  D('overcoat', '#b88a56', 'camel overcoat', { fabric: 'wool', price: 220 }),
  D('leather jacket', '#111111', 'black leather jacket', { fabric: 'leather', price: 250 }),
  D('raincoat', '#6b6b2e', 'olive rain jacket', { price: 90 }),
  D('puffer', '#111111', 'black puffer', { price: 140 }),
  D('cardigan', '#808285', 'grey cardigan', { fabric: 'knit', price: 60 }),
  D('suit jacket', '#3a3d42', 'charcoal suit jacket', { fabric: 'wool', price: 240, neverWear: true, s: 'm' }),
  D('cocktail dress', '#111111', 'little black dress', { fabric: 'silk', price: 120, s: 'w' }),
  D('casual dress', '#f0d23c', 'yellow floral sundress', { pattern: 'floral', accent: '#f7f7f5', accent2: '#3a8a3e', fabric: 'cotton', price: 65, s: 'w' }),
  D('formal gown', '#6e1f2e', 'burgundy gown', { fabric: 'silk', price: 300, neverWear: true, s: 'w' }),
  D('sneakers', '#f7f7f5', 'white sneakers', { fabric: 'leather', price: 90, sole: '#e8e8e8' }),
  D('chelsea boots', '#111111', 'black chelsea boots', { fabric: 'leather', price: 150 }),
  D('loafers', '#6b4a32', 'brown loafers', { fabric: 'leather', price: 120 }),
  D('oxford shoes', '#111111', 'black oxfords', { fabric: 'leather', price: 160, s: 'm' }),
  D('running shoes', '#2f62c9', 'blue running shoes', { price: 110, sole: '#f4f4f2' }),
  D('sandals', '#6b4a32', 'tan sandals', { fabric: 'leather', price: 40 }),
  D('suede shoes', '#b88a56', 'tan suede derbies', { fabric: 'suede', price: 110, s: 'm' }),
  D('belt', '#6b4a32', 'brown leather belt', { fabric: 'leather', price: 35 }),
  D('watch', '#c4c6c8', 'silver watch', { price: 150 }),
  D('bag', '#111111', 'black tote', { fabric: 'leather', price: 95, s: 'w' }),
  D('scarf', '#808285', 'grey wool scarf', { fabric: 'wool', price: 30 }),
  D('beanie', '#1f2a44', 'navy beanie', { fabric: 'knit', price: 20 }),
  D('cap', '#111111', 'black cap', { price: 20 }),
  // South Asia (r: 'sa') — shown when the profile region is South Asia
  D('saree', '#c8302c', 'red & white Boishakh saree', { border: '#f7f7f5', fabric: 'cotton', price: 3500, s: 'w', r: 'sa' }),
  D('saree', '#1f2a44', 'navy jamdani saree', { border: '#c99a2e', fabric: 'cotton', price: 6500, s: 'w', r: 'sa' }),
  D('saree', '#6e1f2e', 'maroon katan silk saree', { border: '#c99a2e', fabric: 'silk', price: 12000, s: 'w', r: 'sa' }),
  D('salwar kameez', '#f0d23c', 'yellow holud salwar kameez', { border: '#3a8a3e', price: 2800, s: 'w', r: 'sa' }),
  D('salwar kameez', '#a8dcc0', 'mint Eid salwar kameez', { border: '#f7f7f5', price: 3200, s: 'w', r: 'sa' }),
  D('kurti', '#6e1f2e', 'maroon block-print kurti', { pattern: 'floral', accent: '#efe6d2', price: 1200, s: 'w', r: 'sa' }),
  D('kurti', '#f7f7f5', 'white cotton kurti', { border: '#2f62c9', price: 950, s: 'w', r: 'sa' }),
  D('churidar', '#f7f7f5', 'white churidar', { price: 600, r: 'sa' }),
  D('palazzo', '#d8c3a0', 'beige palazzo', { price: 800, s: 'w', r: 'sa' }),
  D('dupatta', '#f7f7f5', 'white chiffon orna', { border: '#c99a2e', price: 500, s: 'w', r: 'sa' }),
  D('dupatta', '#c8302c', 'red orna', { border: '#c99a2e', price: 550, s: 'w', r: 'sa' }),
  D('lehenga', '#6e1f2e', 'maroon wedding lehenga', { border: '#c99a2e', fabric: 'silk', price: 25000, neverWear: true, s: 'w', r: 'sa' }),
  D('hijab', '#d8c3a0', 'beige hijab', { price: 400, s: 'w', r: 'sa' }),
  D('hijab', '#111111', 'black hijab', { price: 400, s: 'w', r: 'sa' }),
  D('panjabi', '#f7f7f5', 'white cotton panjabi', { border: '#c4c6c8', price: 1800, s: 'm', r: 'sa' }),
  D('panjabi', '#1f2a44', 'navy Eid panjabi', { border: '#c99a2e', price: 2600, s: 'm', r: 'sa' }),
  D('panjabi', '#6e1f2e', 'maroon silk panjabi', { border: '#c99a2e', fabric: 'silk', price: 3500, s: 'm', r: 'sa' }),
  D('panjabi', '#f0d23c', 'yellow holud panjabi', { price: 1500, s: 'm', r: 'sa' }),
  D('pajama', '#f7f7f5', 'white pajama', { price: 500, s: 'm', r: 'sa' }),
  D('sherwani', '#efe6d2', 'ivory wedding sherwani', { border: '#c99a2e', fabric: 'silk', price: 18000, neverWear: true, s: 'm', r: 'sa' }),
  D('koti', '#111111', 'black koti', { price: 1600, s: 'm', r: 'sa' }),
  D('lungi', '#3a8a3e', 'green check lungi', { pattern: 'check', accent: '#1f2a44', price: 450, s: 'm', r: 'sa' }),
  D('fotua', '#4a6585', 'indigo fotua', { price: 700, s: 'm', r: 'sa' }),
  D('tupi', '#f7f7f5', 'white tupi', { price: 150, s: 'm', r: 'sa' }),
  D('nagra', '#c99a2e', 'golden nagra', { border: '#6e1f2e', fabric: 'leather', price: 1400, r: 'sa' }),
  D('kolhapuri', '#b88a56', 'tan kolhapuri', { fabric: 'leather', price: 900, r: 'sa' }),
  D('shawl', '#808285', 'grey wool shawl', { fabric: 'wool', price: 1500, r: 'sa' }),
  // womenswear extras
  D('blouse', '#efe6d2', 'ivory satin blouse', { fabric: 'silk', price: 55, s: 'w' }),
  D('skirt', '#b88a56', 'camel pleated skirt', { fabric: 'wool', price: 60, s: 'w' }),
  D('skirt', '#4a6585', 'denim midi skirt', { fabric: 'denim', price: 45, s: 'w' }),
  D('shirt dress', '#1f2a44', 'navy shirt dress', { price: 75, s: 'w' }),
  D('leggings', '#111111', 'black leggings', { price: 30, s: 'w' }),
  D('trench coat', '#d8c3a0', 'beige trench coat', { fabric: 'cotton', price: 160, s: 'w' }),
  D('cardigan', '#ee9cb6', 'pink knit cardigan', { fabric: 'knit', price: 55, s: 'w' }),
  D('heels', '#111111', 'black heels', { fabric: 'leather', price: 110, s: 'w' }),
  D('flats', '#d8c3a0', 'nude ballet flats', { fabric: 'leather', price: 70, s: 'w' }),
  D('jewelry', '#c99a2e', 'gold hoops', { price: 40, s: 'w' }),
  // menswear extras
  D('dress shirt', '#f7f7f5', 'white dress shirt', { price: 55, s: 'm' }),
  D('dress shirt', '#9cc3e6', 'sky blue dress shirt', { price: 55, s: 'm' }),
  D('dress trousers', '#808285', 'grey wool trousers', { fabric: 'wool', price: 85, s: 'm' }),
  D('bomber', '#1f2a44', 'navy bomber', { price: 90, s: 'm' }),
  D('tie', '#1f2a44', 'navy silk tie', { fabric: 'silk', price: 35, s: 'm' }),
  D('derby shoes', '#111111', 'black derby shoes', { fabric: 'leather', price: 140, s: 'm' }),
  D('sweatshirt', '#1f2a44', 'navy sweatshirt', { price: 45, s: 'm' }),
];

export const demoItemsFor = (wear, region = myRegion()) => DEMO_ITEMS.filter((it) => (!it.s || wear === 'all' || (wear === 'women' ? it.s === 'w' : it.s === 'm')) && (!it.r || it.r === region));

export async function loadDemo(onProgress, wearSet = 'all') {
  const created = Date.now() - 140 * DAY;
  const gs = [];
  const ITEMS = demoItemsFor(wearSet);
  const sa = myRegion() === 'sa';
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i]; const meta = SUBTYPES[it.subtype];
    const c = drawGarment(it);
    const id = uid() + i;
    const fabric = it.fabric || defaultFabric(it.subtype);
    const warmth = deriveWarmth(it.subtype, fabric, meta.cat);
    const colors = [makeColor(it.hex, it.pattern && it.pattern !== 'solid' && it.pattern !== 'textured' ? 0.7 : 1)];
    if (it.accent && it.pattern !== 'solid' && it.pattern !== 'textured') colors.push(makeColor(it.accent, 0.3));
    const g = {
      id, name: it.name, category: meta.cat, subtype: it.subtype, colors, pattern: it.pattern || 'solid', fabric,
      formality: meta.f, fit: it.fit || meta.fit, warmth, season: deriveSeason(warmth, fabric, meta.cat),
      brand: '', price: sa && !it.r ? Math.round((it.price * 110) / 50) * 50 : it.price, purchasedAt: null, notes: '', status: 'active', favorite: false, neverSuggest: false,
      imageHash: 'demo:' + i, original: `${id}:original`, cutout: `${id}:cutout`, cutoutMethod: 'demo', embedding: null,
      modelVersion: 'demo', confidence: {}, lowConfidence: [], attrSource: {}, needsReview: false, demo: true,
      createdAt: created + i * 60e3, laundry: { state: 'clean', wearsSinceWash: 0, lastWashedAt: null }, _neverWear: !!it.neverWear,
    };
    const blob = await canvasToBlob(c, 'image/png');
    await saveImage(g.cutout, blob);
    await saveImage(g.original, blob);
    gs.push(g);
    onProgress?.((i + 1) / ITEMS.length * 0.7);
  }
  for (const g of gs) { const n = g._neverWear; delete g._neverWear; g.neverWearDemo = n; await saveGarment(g); }
  // simulated wear history over the last 100 days
  const pool = gs.filter((g) => !g.neverWearDemo);
  const wear = [], outfits = [];
  const today = todayStr();
  for (let d = 100; d >= 1; d--) {
    if (Math.random() < 0.3) continue;
    const date = addDays(today, -d);
    const dow = new Date(date + 'T12:00:00').getDay();
    const weekend = sa ? dow === 5 || dow === 6 : dow === 0 || dow === 6;
    const roll = Math.random();
    const occasion = sa && roll < 0.06 ? ['holud', 'biye', 'eid'][Math.floor(Math.random() * 3)] : sa && dow === 5 && roll < 0.35 ? 'jummah'
      : weekend ? (roll < 0.15 ? 'active' : 'casual') : (roll < 0.25 ? 'business' : 'work');
    const temp = sa ? 20 + 13 * Math.random() : 6 + 16 * Math.random();
    const weather = { ...manualWeather(temp), humidity: sa ? 60 + 30 * Math.random() : 55 };
    const { cands } = generate({ occasion, date, weather, pool, laundry: () => 'clean', wear, explore: false }, { maxBases: 60 });
    // people repeat favourites: bias towards a few top picks, ignore some of the wardrobe
    const pick = cands[Math.floor(Math.pow(Math.random(), 2.2) * Math.min(cands.length, 25))];
    if (!pick) continue;
    const oid = uid();
    outfits.push({ id: oid, source: 'worn', items: pick.items.map((g) => ({ garmentId: g.id, slot: g.category })), context: { occasion, date }, score: pick.total, parts: pick.parts, features: pick.features, createdAt: Date.now() - d * DAY, wornOn: date });
    for (const g of pick.items) wear.push({ id: uid(), outfitId: oid, garmentId: g.id, wornOn: date, rating: null, createdAt: Date.now() - d * DAY });
    onProgress?.(0.7 + (100 - d) / 100 * 0.3);
  }
  state.wear.push(...wear); state.outfits.push(...outfits);
  await putMany('wear', wear); await putMany('outfits', outfits);
  // a few items currently in the laundry basket
  const recent = [...new Set(wear.filter((w) => w.wornOn >= addDays(today, -4)).map((w) => w.garmentId))];
  for (const id of recent) {
    const g = gs.find((x) => x.id === id);
    if (!g || washLimit(g) === Infinity) continue;
    g.laundry.wearsSinceWash = Math.min(washLimit(g), 1 + Math.floor(Math.random() * 2));
    g.laundry.state = g.laundry.wearsSinceWash >= washLimit(g) ? 'dirty' : 'worn';
    if (g.laundry.state === 'dirty') g.laundry.dirtySince = Date.now() - DAY;
    await saveGarment(g);
  }
  if (sa) { try { if (!localStorage.getItem('currency')) localStorage.setItem('currency', 'BDT'); } catch { /* private mode */ } }
  await saveSettings({ demoLoaded: true });
  return gs.length;
}
