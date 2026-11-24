// Personal style profile: identity & which clothes to focus on, body shape, height, personal color
// season (from questions or a selfie), style vibes, Style DNA, achievements. All local, all free.
import { state, saveSettings } from './db.js';
import { hexToLab, rgbToLab, labToHex, deltaE, primaryColor, chroma } from './color.js';
import { clamp, mean, DAY, garmentName } from './util.js';
import { BOLD_PATTERNS, subtypesOf, MIN_WARDROBE, SUBTYPES, occasionsFor } from './enums.js';
import { prefs, FEATURES } from './learning.js';
import { todayStr, addDays } from './weather.js';

export const profile = () => state.settings.profile || {};
export async function saveProfile(patch) {
  const p = { ...profile(), ...patch, updatedAt: Date.now() };
  if (p.undertone && p.depth) Object.assign(p, seasonFrom(p));
  await saveSettings({ profile: p });
  return p;
}

// ---------- Identity ----------
export const GENDERS = {
  women: { label: 'Woman', icon: 'figure' },
  men: { label: 'Man', icon: 'figure' },
  nonbinary: { label: 'Non-binary', icon: 'figure' },
  none: { label: 'Prefer not to say', icon: 'figure' },
};
export const WEARS = {
  women: { label: 'Womenswear', desc: 'Dresses, skirts, blouses and heels come first' },
  men: { label: 'Menswear', desc: 'Shirts, tailoring and ties come first' },
  all: { label: 'Both / gender-neutral', desc: 'Every category, equally' },
};
export const defaultWear = (gender) => (gender === 'women' ? 'women' : gender === 'men' ? 'men' : 'all');
export const myWear = () => profile().wear || defaultWear(profile().gender);

const WOMEN_CODED = new Set(['blouse', 'skirt', 'casual dress', 'shirt dress', 'maxi dress', 'cocktail dress', 'formal gown', 'heels', 'flats', 'leggings', 'jumpsuit', 'jewelry',
  'kurti', 'salwar', 'palazzo', 'saree', 'salwar kameez', 'anarkali', 'lehenga', 'dupatta', 'hijab']);
const MEN_CODED = new Set(['tie', 'suit jacket', 'oxford shoes', 'derby shoes', 'panjabi', 'fotua', 'pajama', 'lungi', 'dhoti', 'sherwani', 'koti', 'tupi']);
export const codedFor = (subtype) => (WOMEN_CODED.has(subtype) ? 'women' : MEN_CODED.has(subtype) ? 'men' : 'all');
export const suitsWear = (subtype, wear = myWear()) => wear === 'all' || codedFor(subtype) === 'all' || codedFor(subtype) === wear;

// ---------- Region (South Asian clothing & occasions) and modest dressing ----------
export const REGIONS = { global: { label: 'Global', desc: 'Western wardrobe and occasions' }, sa: { label: 'South Asia', desc: 'Adds saree, salwar kameez, panjabi… plus Eid, Boishakh, holud, biye' } };
export function guessRegion() {
  const l = (navigator.language || '').toLowerCase();
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* old browser */ }
  return /^(bn|hi|ur|ne|si|pa|gu|ta|te|ml|mr|as|or)\b/.test(l) || /Dhaka|Kolkata|Calcutta|Karachi|Kathmandu|Colombo|Thimphu/.test(tz) ? 'sa' : 'global';
}
export const myRegion = () => profile().region || guessRegion();
export const myOccasions = () => occasionsFor(myRegion());
export const isModest = () => !!profile().modest;
// Bangladesh's weekend is Friday–Saturday
export const isWeekend = (dow) => (myRegion() === 'sa' && (Intl.DateTimeFormat().resolvedOptions().timeZone || '').includes('Dhaka') ? dow === 5 || dow === 6 : dow === 0 || dow === 6);
export const wearsHijab = () => !!profile().hijab;

// Nothing is hidden — the most relevant types are simply listed first (traditional first in South Asia).
export function subtypeOptions(cat, wear = myWear()) {
  const sa = myRegion() === 'sa';
  const rank = (s) => (suitsWear(s, wear) ? 0 : 10) + (SUBTYPES[s]?.trad ? (sa ? 0 : 1) : (sa ? 1 : 0));
  return subtypesOf(cat).map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
}

// ---------- Body shape & height ----------
export const BODY = {
  balanced: { women: 'Hourglass', men: 'Trapezoid', all: 'Balanced', desc: 'Shoulders and hips about equal, defined waist',
    tip: 'Fitted pieces that follow your natural line', tips: ['Wear fitted or regular cuts that follow your shape', 'Belts and wrap shapes mark the waist', 'Avoid head-to-toe oversized volume that hides proportions'] },
  triangle: { women: 'Pear', men: 'Triangle', all: 'Triangle', desc: 'Hips wider than shoulders',
    tip: 'Darker below, interest and structure up top', tips: ['Put color, pattern and detail on top', 'Structured shoulders (blazers, jackets) balance the hips', 'Darker, solid bottoms; straight or A-line shapes'] },
  inverted: { women: 'Inverted triangle', men: 'Inverted triangle', all: 'Inverted triangle', desc: 'Shoulders wider than hips',
    tip: 'Simpler top, more volume and color below', tips: ['Keep tops simple and darker', 'Add volume, color or pattern below: wide trousers, A-line skirts', 'Skip heavy shoulder detail'] },
  round: { women: 'Apple', men: 'Oval', all: 'Round', desc: 'Fuller middle, slimmer legs',
    tip: 'Tonal column and an open layer lengthen the torso', tips: ['One color top-to-bottom creates a long line', 'Open outer layers draw a vertical line', 'Regular or relaxed tops rather than tight ones'] },
  rectangle: { women: 'Rectangle', men: 'Rectangle', all: 'Rectangle', desc: 'Shoulders, waist and hips in one line',
    tip: 'Contrast, layers and belts add shape', tips: ['Layer to build dimension', 'Contrast between top and bottom adds shape', 'A belt or tucked top creates a waist'] },
};
export const bodyLabel = (k, wear = myWear()) => (BODY[k] ? BODY[k][wear] || BODY[k].all : '');
export const HEIGHTS = { petite: { label: 'Petite', desc: 'under 160 cm / 5′3″' }, average: { label: 'Average', desc: '160–180 cm' }, tall: { label: 'Tall', desc: 'over 180 cm / 5′11″' } };

const isStructured = (g) => ['blazer', 'suit jacket', 'leather jacket', 'denim jacket', 'trench coat', 'overcoat'].includes(g?.subtype);
const relaxedFit = (g) => g && (g.fit === 'relaxed' || g.fit === 'oversized');

export function bodyScore(items, p = profile()) {
  if (!p.bodyShape && !p.height) return null;
  const top = items.find((g) => g.category === 'top' || g.category === 'dress');
  const bot = items.find((g) => g.category === 'bottom');
  const dress = items.find((g) => g.category === 'dress');
  const outer = items.find((g) => g.category === 'outerwear');
  const belt = items.some((g) => g.subtype === 'belt');
  const Lt = top ? primaryColor(top).lab[0] : 50, Lb = bot ? primaryColor(bot).lab[0] : Lt;
  const patT = top && BOLD_PATTERNS.has(top.pattern), patB = bot && BOLD_PATTERNS.has(bot.pattern);
  const tonal = Math.abs(Lt - Lb) < 15;
  let s = 0.7; const notes = [];
  const add = (v, note) => { s += v; if (v > 0 && note) notes.push([v, note]); };
  switch (p.bodyShape) {
    case 'triangle':
      if (bot && Lb < Lt - 8) add(0.15, 'darker bottom balances your hips');
      if (patT && !patB) add(0.1, 'pattern up top draws the eye up');
      if (patB) add(-0.15);
      if (isStructured(outer)) add(0.1, 'structured shoulders balance the line');
      if (dress) add(0.05);
      break;
    case 'inverted':
      if (bot && Lt < Lb - 8) add(0.15, 'darker top, lighter bottom balances your shoulders');
      if (patT) add(-0.12);
      if (patB || relaxedFit(bot) || bot?.subtype === 'skirt') add(0.1, 'volume below balances broad shoulders');
      if (outer && ['blazer', 'suit jacket'].includes(outer.subtype)) add(-0.05);
      break;
    case 'round':
      if (top && bot && tonal) add(0.15, 'a tonal column lengthens your line');
      if (outer) add(0.1, 'an open layer draws a long vertical line');
      if (top?.fit === 'slim') add(-0.1);
      if (patT) add(-0.08);
      if (dress) add(0.05);
      break;
    case 'rectangle':
      if (belt) add(0.1, 'the belt defines your waist');
      if (top && bot && Math.abs(Lt - Lb) > 20) add(0.1, 'top/bottom contrast adds shape');
      if (outer) add(0.1, 'layering adds dimension');
      if (patT || patB) add(0.05);
      break;
    case 'balanced':
      if (relaxedFit(top) && relaxedFit(bot)) add(-0.12);
      if (belt || dress || (top && (top.fit === 'slim' || top.fit === 'regular'))) add(0.1, 'fitted pieces follow your natural shape');
      break;
    default:
  }
  if (p.height === 'petite') {
    if (top && bot && tonal) add(0.1, 'one tone head-to-toe adds height');
    if (relaxedFit(top) && relaxedFit(bot)) add(-0.15);
    if (outer && ['overcoat', 'trench coat', 'parka'].includes(outer.subtype)) add(-0.05);
  } else if (p.height === 'tall') {
    if (top && bot && Math.abs(Lt - Lb) > 20) add(0.05, 'contrast breaks up a tall frame nicely');
    if (relaxedFit(top) || relaxedFit(bot)) add(0.04);
  }
  notes.sort((a, b) => b[0] - a[0]);
  return { s: clamp(s, 0, 1), note: notes[0]?.[1] || null };
}

// ---------- Personal color season ----------
export const SKIN_TONES = [
  { depth: 1, hex: '#f6e3d4', label: 'Fair' }, { depth: 1, hex: '#f1d6c0', label: 'Fair' },
  { depth: 2, hex: '#e8c3a4', label: 'Light' }, { depth: 2, hex: '#dfb48e', label: 'Light' },
  { depth: 3, hex: '#c99b74', label: 'Medium' }, { depth: 3, hex: '#b88660', label: 'Medium' },
  { depth: 4, hex: '#9c6a46', label: 'Tan' }, { depth: 4, hex: '#875737', label: 'Tan' },
  { depth: 5, hex: '#64402a', label: 'Deep' }, { depth: 5, hex: '#47291b', label: 'Deep' },
];
export const UNDERTONES = {
  warm: { label: 'Warm', desc: 'Veins look green · gold jewelry glows · tans easily' },
  cool: { label: 'Cool', desc: 'Veins look blue/purple · silver suits you · burns easily' },
  neutral: { label: 'Neutral', desc: 'A mix of both · gold and silver both work' },
  olive: { label: 'Olive', desc: 'Greenish-gold cast · looks grey in cool light' },
};
export const HAIR = { light: { label: 'Blonde / light', d: 1, hex: '#d9b77a' }, red: { label: 'Red / auburn', d: 2.5, hex: '#8f3f22' }, medium: { label: 'Mid brown', d: 3, hex: '#6b4a32' }, dark: { label: 'Dark brown / black', d: 5, hex: '#1e1714' }, grey: { label: 'Grey / white', d: 1.5, hex: '#bdbab4' } };

export const SEASONS = {
  spring: {
    label: 'Spring', metal: 'Gold', mood: 'Clear, warm and light — like early sunshine.',
    best: ['#f4d06f', '#ff8c69', '#f28c28', '#7bc47f', '#40b5ad', '#ffd1a9', '#c9a15b', '#f5ebdc', '#6ca0dc', '#e4572e', '#8db600', '#2e5e8c'],
    neutrals: ['#f5ebdc', '#c9a15b', '#b7a99a', '#2e5e8c'],
    avoid: ['#111111', '#6e1f2e', '#808285', '#4b2a6a', '#3a3d42', '#f7f7f5'],
  },
  summer: {
    label: 'Summer', metal: 'Silver', mood: 'Soft, cool and gentle — like a misty morning.',
    best: ['#a7c7e7', '#c3b1e1', '#e8a0bf', '#9db4c0', '#6f8faf', '#b0c4b1', '#8e7dbe', '#d8bfd8', '#5d6d7e', '#f0eaf0', '#c08497', '#2c3e66'],
    neutrals: ['#f0eaf0', '#a3a3a3', '#5d6d7e', '#2c3e66'],
    avoid: ['#f28c28', '#111111', '#b88a56', '#f0d23c', '#a64b26'],
  },
  autumn: {
    label: 'Autumn', metal: 'Gold & bronze', mood: 'Rich, warm and earthy — like turning leaves.',
    best: ['#a64b26', '#c99a2e', '#6b6b2e', '#b88a56', '#8b4513', '#e07a2e', '#1f7a7a', '#556b2f', '#d8c3a0', '#efe6d2', '#8b5a2b', '#3b4a3f'],
    neutrals: ['#efe6d2', '#d8c3a0', '#b88a56', '#6b4a32'],
    avoid: ['#ee9cb6', '#9cc3e6', '#c4c6c8', '#d93a7e', '#b8a6dc', '#f7f7f5'],
  },
  winter: {
    label: 'Winter', metal: 'Silver & platinum', mood: 'Crisp, cool and high-contrast — like fresh snow at night.',
    best: ['#111111', '#f7f7f5', '#1f2a44', '#c8302c', '#2f62c9', '#1f7a5c', '#d93a7e', '#6a3d9a', '#3a3d42', '#6e1f2e', '#00a3ad', '#dde7f0'],
    neutrals: ['#111111', '#f7f7f5', '#3a3d42', '#1f2a44'],
    avoid: ['#b88a56', '#c99a2e', '#e07a2e', '#6b6b2e', '#d8c3a0'],
  },
};
const LAB_CACHE = new Map();
const labOf = (hex) => { let v = LAB_CACHE.get(hex); if (!v) { v = hexToLab(hex); LAB_CACHE.set(hex, v); } return v; };

export function seasonFrom(p) {
  const depth = +p.depth || 3; const ut = p.undertone || 'neutral';
  const hd = HAIR[p.hair]?.d ?? 3;
  const contrast = Math.abs(hd - depth); // 0 low … 4 high
  let season;
  if (ut === 'warm') season = depth <= 2 && hd <= 3 ? 'spring' : 'autumn';
  else if (ut === 'cool') season = contrast >= 2.5 || depth >= 4 ? 'winter' : 'summer';
  else if (ut === 'olive') season = contrast >= 3 ? 'winter' : 'autumn';
  else season = contrast >= 3 ? 'winter' : depth <= 2 ? 'summer' : 'autumn';
  let sub;
  if (season === 'spring') sub = depth === 1 ? 'Light' : contrast >= 2.5 ? 'Bright' : 'Warm';
  else if (season === 'summer') sub = depth === 1 && contrast < 1.5 ? 'Light' : ut === 'neutral' || ut === 'olive' ? 'Soft' : 'Cool';
  else if (season === 'autumn') sub = depth >= 4 || hd >= 5 ? 'Deep' : ut === 'neutral' || ut === 'olive' ? 'Soft' : 'Warm';
  else sub = depth >= 4 ? 'Deep' : contrast >= 3.5 ? 'Bright' : 'Cool';
  return { season, seasonName: `${sub} ${SEASONS[season].label}`, contrast: contrast >= 3 ? 'high' : contrast >= 1.5 ? 'medium' : 'low' };
}

const FIT_CACHE = new Map();
export function colorFit(hex, season = profile().season) {
  const S = SEASONS[season]; if (!S) return null;
  const ck = season + hex; const hit = FIT_CACHE.get(ck); if (hit) return hit;
  const r = colorFitRaw(hex, S); FIT_CACHE.set(ck, r); return r;
}
function colorFitRaw(hex, S) {
  const lab = labOf(hex);
  const dBest = Math.min(...S.best.concat(S.neutrals).map((h) => deltaE(lab, labOf(h))));
  const dAvoid = Math.min(...S.avoid.map((h) => deltaE(lab, labOf(h))));
  let s = clamp(1 - (dBest - 6) / 34, 0, 1);
  if (dAvoid < 10) s -= 0.35;
  return { s: clamp(s, 0, 1), dBest, dAvoid, verdict: s >= 0.7 ? 'great' : s >= 0.4 ? 'ok' : 'avoid' };
}

const FACE_W = { top: 1, dress: 1, outerwear: 0.9, headwear: 0.5 };
export function colorScore(items, p = profile()) {
  if (!p.season) return null;
  const face = items.filter((g) => FACE_W[g.category] || g.subtype === 'scarf');
  if (!face.length) return null;
  let tot = 0, wsum = 0, best = null, bv = -1;
  for (const g of face) {
    const w = FACE_W[g.category] || 0.6; const f = colorFit(primaryColor(g).hex, p.season);
    tot += w * f.s; wsum += w;
    if (f.s > bv) { bv = f.s; best = g; }
  }
  return { s: tot / wsum, best, bestScore: bv };
}

// Combined "flatters you" component; neutral 0.75 when no profile is set (so it never reorders).
export function flatterScore(items, p = profile()) {
  const c = colorScore(items, p), b = bodyScore(items, p);
  if (!c && !b) return { s: 0.75, note: null, notes: [] };
  const s = c && b ? 0.55 * c.s + 0.45 * b.s : (c || b).s;
  const colorNote = c && c.bestScore >= 0.75 ? `the ${garmentName(c.best)} sits in your ${p.seasonName} palette` : null;
  const notes = [colorNote, b?.note].filter(Boolean);
  const note = colorNote && (!b || !b.note || c.s >= b.s) ? colorNote : b?.note || null;
  return { s, note, notes };
}

// Selfie → skin depth + undertone (YCrCb skin mask on the central face region, median in LAB).
export function analyzeSelfie(canvas) {
  const W = canvas.width, H = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const labs = [];
  for (let y = Math.floor(H * 0.22); y < H * 0.72; y += 2) for (let x = Math.floor(W * 0.28); x < W * 0.72; x += 2) {
    const nx = (x / W - 0.5) / 0.22, ny = (y / H - 0.47) / 0.25; if (nx * nx + ny * ny > 1) continue;
    const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const Y = 0.299 * r + 0.587 * g + 0.114 * b, Cr = (r - Y) * 0.713 + 128, Cb = (b - Y) * 0.564 + 128;
    if (Cr < 133 || Cr > 175 || Cb < 75 || Cb > 128 || Y < 35 || Y > 245) continue;
    labs.push(rgbToLab([r, g, b]));
  }
  if (labs.length < 80) return null;
  labs.sort((a, b) => a[0] - b[0]);
  const mid = labs.slice(Math.floor(labs.length * 0.3), Math.ceil(labs.length * 0.7));
  const lab = [mean(mid.map((v) => v[0])), mean(mid.map((v) => v[1])), mean(mid.map((v) => v[2]))];
  const L = lab[0];
  const depth = L > 84 ? 1 : L > 72 ? 2 : L > 56 ? 3 : L > 38 ? 4 : 5;
  const hue = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  const undertone = lab[1] < 9 && lab[2] > 16 ? 'olive' : hue > 60 ? 'warm' : hue < 47 ? 'cool' : 'neutral';
  return { lab, hex: labToHex(lab), depth, undertone, hue: Math.round(hue), samples: labs.length, confidence: clamp(labs.length / 1500, 0.3, 1) };
}

// ---------- Style vibes & Style DNA ----------
export const VIBES = {
  minimal: { label: 'Minimal', desc: 'Clean lines, neutrals, nothing extra', c: ['#efe6d2', '#808285', '#111111'], f: { neutralShare: 0.6, patterns: -0.6, tonal: 0.4, chroma: -0.4 } },
  classic: { label: 'Classic', desc: 'Timeless staples: oxford, chinos, trench', c: ['#f7f7f5', '#1f2a44', '#b88a56'], f: { formalityDelta: 0.3, contrast: 0.3, patterns: -0.2 } },
  polished: { label: 'Polished', desc: 'Sharp tailoring and business-ready', c: ['#3a3d42', '#f7f7f5', '#1f2a44'], f: { formalityDelta: 0.6, relaxed: -0.4, layered: 0.3 } },
  street: { label: 'Streetwear', desc: 'Oversized, graphic, sneaker-first', c: ['#c4c6c8', '#111111', '#c8302c'], f: { relaxed: 0.7, formalityDelta: -0.4, layered: 0.3 } },
  sporty: { label: 'Sporty', desc: 'Athleisure and easy movement', c: ['#2f62c9', '#f7f7f5', '#111111'], f: { relaxed: 0.4, formalityDelta: -0.6 } },
  boho: { label: 'Boho & romantic', desc: 'Florals, flow, soft texture', c: ['#ee9cb6', '#efe6d2', '#c99a2e'], f: { patterns: 0.6, chroma: 0.4, relaxed: 0.3 } },
  edgy: { label: 'Edgy', desc: 'Black, leather, boots, contrast', c: ['#111111', '#3a3d42', '#6e1f2e'], f: { contrast: 0.6, neutralShare: 0.3, chroma: -0.2 } },
  bold: { label: 'Bold color', desc: 'Statement hues and clashing on purpose', c: ['#d93a7e', '#f0d23c', '#2f62c9'], f: { chroma: 0.7, patterns: 0.4, tonal: -0.4, contrast: 0.3 } },
};
export const DNA_AXES = ['minimal', 'classic', 'polished', 'street', 'sporty', 'boho', 'edgy', 'bold'];

export async function applyVibes(list) {
  const p = prefs();
  const base = p.quizPrior || { ...p.prior };
  if (!p.quizPrior) p.quizPrior = { ...p.prior };
  for (const k of FEATURES) {
    let v = base[k];
    for (const vb of list) v += (VIBES[vb]?.f[k] || 0) * 0.5;
    p.prior[k] = clamp(v, -2.5, 2.5);
    if (p.n === 0) p.w[k] = p.prior[k];
  }
  await saveSettings({ prefs: p });
}

const SUB_DNA = {
  'oxford shirt': { classic: 1, polished: 0.5 }, 'dress shirt': { polished: 1 }, 'blazer': { polished: 1, classic: 0.6 }, 'suit jacket': { polished: 1.2 },
  'dress trousers': { polished: 1 }, 'chinos': { classic: 0.8 }, 'loafers': { classic: 0.8, polished: 0.4 }, 'oxford shoes': { polished: 1 }, 'derby shoes': { polished: 0.8 },
  'trench coat': { classic: 1 }, 'overcoat': { classic: 0.8, polished: 0.4 }, 'cardigan': { classic: 0.6 }, 'polo': { classic: 0.6, sporty: 0.3 }, 'tie': { polished: 1 },
  'hoodie': { street: 1 }, 'graphic tee': { street: 1, bold: 0.3 }, 'sweatshirt': { street: 0.8 }, 'cargo pants': { street: 1 }, 'joggers': { street: 0.5, sporty: 0.5 },
  'sneakers': { street: 0.6 }, 'bomber': { street: 1 }, 'denim jacket': { street: 0.6, classic: 0.2 }, 'cap': { street: 0.8, sporty: 0.3 }, 'puffer': { street: 0.6 },
  'activewear top': { sporty: 1.2 }, 'running shoes': { sporty: 1.2 }, 'leggings': { sporty: 1 }, 'fleece': { sporty: 0.6 }, 'shorts': { sporty: 0.4 },
  'maxi dress': { boho: 1 }, 'linen shirt': { boho: 0.6 }, 'sandals': { boho: 0.6 }, 'casual dress': { boho: 0.5 }, 'blouse': { boho: 0.5, classic: 0.3 }, 'skirt': { boho: 0.3, classic: 0.3 },
  'leather jacket': { edgy: 1.2 }, 'chelsea boots': { edgy: 0.8, classic: 0.3 }, 'boots': { edgy: 0.6 }, 'turtleneck': { minimal: 0.5, edgy: 0.3 },
  'saree': { classic: 0.7, polished: 0.5 }, 'lehenga': { polished: 1, bold: 0.4 }, 'anarkali': { boho: 0.6, polished: 0.4 }, 'salwar kameez': { classic: 0.6, boho: 0.3 },
  'kurti': { boho: 0.5, classic: 0.3 }, 'panjabi': { classic: 0.8 }, 'sherwani': { polished: 1.2 }, 'koti': { polished: 0.6, classic: 0.4 }, 'fotua': { boho: 0.4, street: 0.2 },
  'lungi': { boho: 0.3 }, 'nagra': { classic: 0.4, boho: 0.3 }, 'kolhapuri': { boho: 0.6 }, 'dupatta': { boho: 0.3 },
  't-shirt': { minimal: 0.5 }, 'heels': { polished: 0.6 }, 'cocktail dress': { polished: 0.6 }, 'formal gown': { polished: 0.6 }, 'jumpsuit': { minimal: 0.4, polished: 0.3 },
};
export function styleDNA(pool, wear = state.wear) {
  const v = Object.fromEntries(DNA_AXES.map((k) => [k, 0]));
  const since = addDays(todayStr(), -90);
  const recent = {}; for (const w of wear) if (w.wornOn >= since) recent[w.garmentId] = (recent[w.garmentId] || 0) + 1;
  for (const g of pool) {
    const wt = 1 + Math.min(10, recent[g.id] || 0) * 0.35;
    const c = primaryColor(g); const add = (k, x) => { v[k] += x * wt; };
    for (const [k, x] of Object.entries(SUB_DNA[g.subtype] || {})) add(k, x);
    if (c.neutral && g.pattern === 'solid') add('minimal', 0.6);
    if (['black', 'charcoal'].includes(c.name)) add('edgy', 0.35);
    if (['navy', 'white', 'camel', 'cream', 'beige'].includes(c.name)) add('classic', 0.25);
    if (chroma(c.lab) > 42 && !c.neutral) add('bold', 0.9);
    if (BOLD_PATTERNS.has(g.pattern)) add('bold', 0.35);
    if (g.pattern === 'floral') add('boho', 1);
    if (g.pattern === 'stripe') add('classic', 0.35);
    if (g.fit === 'oversized') add('street', 0.6);
    if (g.fabric === 'leather' && g.category !== 'footwear') add('edgy', 0.5);
    if (g.fabric === 'linen' || g.fabric === 'suede') add('boho', 0.3);
  }
  const vibes = profile().vibes || [];
  for (const k of vibes) if (k in v) v[k] += pool.length * 0.06;
  const max = Math.max(...Object.values(v), 1e-6);
  const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x / max]));
  const top = DNA_AXES.slice().sort((a, b) => out[b] - out[a]);
  return { axes: out, top, archetype: archetypeName(top[0], top[1]) };
}
const ARCH = {
  'classic+minimal': 'Modern Classic', 'minimal+polished': 'Quiet Luxury', 'classic+polished': 'Timeless Tailored', 'sporty+street': 'Athleisure',
  'edgy+street': 'Urban Edge', 'bold+boho': 'Free Spirit', 'edgy+minimal': 'Monochrome Edge', 'bold+street': 'Hype Street', 'boho+classic': 'Soft Romantic',
  'classic+street': 'Smart Street', 'edgy+polished': 'Sharp Noir', 'bold+classic': 'Colorful Classic', 'minimal+street': 'Clean Street', 'boho+minimal': 'Natural Minimal',
  'classic+sporty': 'Preppy Active', 'bold+polished': 'Power Dresser', 'classic+edgy': 'Rock Classic', 'minimal+sporty': 'Sleek Athletic',
};
function archetypeName(a, b) { const k = [a, b].sort().join('+'); return ARCH[k] || `${VIBES[a].label} × ${VIBES[b].label}`; }

// ---------- Streaks, heatmap, achievements ----------
export function wearDays(wear = state.wear) { return new Set(wear.map((w) => w.wornOn)); }
export function streak(wear = state.wear) {
  const days = wearDays(wear); let d = todayStr(); let n = 0;
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
export function heatmap(weeks = 18, wear = state.wear) {
  const outfits = {}; for (const w of wear) { (outfits[w.wornOn] ||= new Set()).add(w.outfitId); }
  const end = todayStr(); const startDow = new Date(end + 'T12:00:00').getDay();
  const start = addDays(end, -(weeks * 7 - 1) - (6 - startDow));
  const cells = [];
  for (let i = 0; i < weeks * 7 + (6 - startDow) + 1 && cells.length < weeks * 7 + 7; i++) {
    const d = addDays(start, i); if (d > end) break;
    cells.push({ d, n: outfits[d]?.size || 0 });
  }
  return { cells, start };
}

export function achievements(pool, wear = state.wear, outfits = state.outfits) {
  const cnt = (c) => pool.filter((g) => g.category === c).length;
  const tops = cnt('top') + cnt('dress'), bots = cnt('bottom') + cnt('dress'), shoes = cnt('footwear');
  const starterP = (Math.min(tops, MIN_WARDROBE.top) + Math.min(bots, MIN_WARDROBE.bottom) + Math.min(shoes, MIN_WARDROBE.footwear)) / 10;
  const since30 = addDays(todayStr(), -30);
  const worn30 = new Set(wear.filter((w) => w.wornOn >= since30).map((w) => w.garmentId));
  const rot = pool.length ? pool.filter((g) => worn30.has(g.id)).length / pool.length : 0;
  const perItem = {}; for (const w of wear) perItem[w.garmentId] = (perItem[w.garmentId] || 0) + 1;
  const maxWears = Math.max(0, ...Object.values(perItem));
  const colors30 = new Set(wear.filter((w) => w.wornOn >= since30).map((w) => state.garments.find((g) => g.id === w.garmentId)).filter(Boolean).map((g) => primaryColor(g).name));
  const newest = Math.max(0, ...pool.filter((g) => !g.demo).map((g) => g.createdAt || 0));
  const noBuyDays = newest ? Math.floor((Date.now() - newest) / DAY) : 0;
  const byId = new Map(outfits.map((o) => [o.id, o]));
  const stretchWorn = outfits.filter((o) => o.source === 'worn' && o.basedOn && byId.get(o.basedOn)?.stretch).length;
  const lookbook = outfits.filter((o) => o.source === 'manual' || o.lookbook).length;
  const p = profile();
  const profileP = ['gender', 'bodyShape', 'season', 'vibes'].filter((k) => (Array.isArray(p[k]) ? p[k].length : p[k])).length / 4;
  const st = streak(wear);
  const A = [
    { key: 'profile', icon: 'user', title: 'Know thyself', desc: 'Complete your style profile', p: profileP, val: `${Math.round(profileP * 4)}/4` },
    { key: 'starter', icon: 'shirt', title: 'Starter set', desc: '5 tops, 3 bottoms, 2 pairs of shoes', p: starterP, val: `${Math.round(starterP * 10)}/10` },
    { key: 'streak', icon: 'flame', title: 'On a roll', desc: 'Log outfits 7 days in a row', p: Math.min(1, st / 7), val: `${st} day${st === 1 ? '' : 's'}` },
    { key: 'rotation', icon: 'refresh', title: 'Rotation pro', desc: 'Wear 60% of your closet in 30 days', p: Math.min(1, rot / 0.6), val: `${Math.round(rot * 100)}%` },
    { key: 'explorer', icon: 'sparkles', title: 'Explorer', desc: 'Wear 5 stretch picks', p: Math.min(1, stretchWorn / 5), val: `${stretchWorn}/5` },
    { key: 'colors', icon: 'palette', title: 'Color play', desc: 'Wear 8 different colors this month', p: Math.min(1, colors30.size / 8), val: `${colors30.size}/8` },
    { key: 'loyal', icon: 'heart', title: 'True love', desc: 'Wear one piece 30 times', p: Math.min(1, maxWears / 30), val: `${maxWears}/30` },
    { key: 'curator', icon: 'book', title: 'Curator', desc: 'Save 10 looks to your lookbook', p: Math.min(1, lookbook / 10), val: `${lookbook}/10` },
    { key: 'mindful', icon: 'leaf', title: 'Mindful closet', desc: '30 days without adding new clothes', p: newest ? Math.min(1, noBuyDays / 30) : 0, val: newest ? `${noBuyDays} days` : 'add your own items' },
    { key: 'closet', icon: 'hanger', title: 'Full closet', desc: 'Catalog 30 items', p: Math.min(1, pool.length / 30), val: `${pool.length}/30` },
  ];
  for (const a of A) a.done = a.p >= 1;
  return A.sort((a, b) => (b.done - a.done) || b.p - a.p);
}

export function initials(name) {
  const n = (name || '').trim(); if (!n) return '';
  return n.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}
