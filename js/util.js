import { SUBTYPES } from './enums.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
export const variance = (a) => { const m = mean(a); return mean(a.map((v) => (v - m) ** 2)); };
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const DAY = 86400e3;

export function garmentName(g) {
  if (!g) return '';
  if (g.name) return g.name;
  const c = g.colors?.[0]?.name || '';
  return `${c} ${g.subtype || g.category}`.trim();
}

export const slotOf = (g) => g.category; // categories map 1:1 onto outfit slots

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function deriveWarmth(subtype, fabric, category) {
  const base = SUBTYPES[subtype]?.w ?? ({ top: 2, bottom: 2, outerwear: 3, dress: 1.5, footwear: 2, accessory: 0, headwear: 1 }[category] ?? 2);
  if (category === 'accessory') return subtype === 'scarf' ? (fabric === 'wool' || fabric === 'knit' ? 2 : 1) : 0;
  const fw = { cotton: 0, linen: -1, wool: 1, denim: 0, synthetic: 0, leather: 0.5, knit: 0.75, silk: -0.5, suede: 0.25, canvas: 0 }[fabric] ?? 0;
  return clamp(Math.round(base + fw), category === 'headwear' ? 0 : 1, 5);
}

export function deriveSeason(warmth, fabric, category) {
  if (category === 'accessory' || category === 'headwear') return warmth >= 2 ? 'winter' : 'all-season';
  if (fabric === 'linen' || warmth <= 1) return 'summer';
  if (warmth >= 4) return 'winter';
  if (warmth === 3) return 'transitional';
  return 'all-season';
}

export function fmtMoney(v) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: (localStorageGet('currency') || 'USD'), maximumFractionDigits: v < 10 ? 2 : 0 }).format(v);
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }

export async function sha256(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
}
