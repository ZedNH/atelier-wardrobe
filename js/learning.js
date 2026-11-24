// The stylist learning loop: item affinity + an interpretable logistic preference vector,
// shrunk toward a prior (population + style quiz + wardrobe-inferred). Attribute corrections
// are a separate stream (perception), never mixed into taste.
import { state, saveSettings } from './db.js';
import { sigmoid, clamp } from './util.js';

export const FEATURES = ['contrast', 'chroma', 'neutralShare', 'patterns', 'formalityDelta', 'warmthOver', 'layered', 'relaxed', 'tonal'];

export const FEATURE_TEXT = {
  contrast: ['You like high-contrast pairings', 'You prefer low-contrast, tonal pairings'],
  chroma: ['You enjoy colorful outfits', 'You keep colors muted'],
  neutralShare: ['You build around neutrals', 'You like neutrals less than most'],
  patterns: ['You like wearing patterns', 'You avoid patterns'],
  formalityDelta: ['You dress up a notch above the occasion', 'You dress down a notch below the occasion'],
  warmthOver: ['You run cold — warmer outfits win', 'You run warm — lighter outfits win'],
  layered: ['You love layering', 'You prefer skipping the extra layer'],
  relaxed: ['You prefer relaxed / oversized fits', 'You prefer fitted silhouettes'],
  tonal: ['You like monochrome & analogous colors', 'You like contrasting hues'],
};

const FEATURE_AXIS = { contrast: 'contrast', chroma: 'color intensity', neutralShare: 'neutrals', patterns: 'patterns', formalityDelta: 'dressing up or down', warmthOver: 'running warm or cold', layered: 'layering', relaxed: 'fit', tonal: 'tonal vs contrasting hues' };
const POPULATION_PRIOR = { contrast: 0.2, chroma: -0.1, neutralShare: 0.2, patterns: -0.1, formalityDelta: 0, warmthOver: 0, layered: 0, relaxed: 0, tonal: 0 };
const SHRINK_K = 20; // empirical-Bayes style shrinkage strength

export function prefs() {
  if (!state.settings.prefs) {
    state.settings.prefs = { w: { ...POPULATION_PRIOR }, prior: { ...POPULATION_PRIOR }, b: 0, n: 0, locked: {}, affinity: {}, version: 1 };
  }
  return state.settings.prefs;
}

function effectiveWeights() {
  const p = prefs();
  const lam = p.n / (p.n + SHRINK_K);
  const w = {};
  for (const k of FEATURES) w[k] = p.locked[k] ? 0 : lam * p.w[k] + (1 - lam) * p.prior[k];
  return w;
}

export function affinityOf(gid) {
  const a = prefs().affinity[gid];
  if (!a) return 0.5;
  return (a.a + 1) / (a.s + 2);
}

// Preference component in (0,1). 0.5 means "no opinion".
export function prefScore(features, items) {
  const w = effectiveWeights();
  let z = 0;
  for (const k of FEATURES) z += (w[k] || 0) * (features[k] || 0);
  const aff = items.length ? items.reduce((s, g) => s + affinityOf(g.id), 0) / items.length : 0.5;
  z += 2.0 * (aff - 0.5);
  return sigmoid(z * 1.5);
}

const STRENGTH = { worn: 3, manual: 2.5, liked: 2, disliked: 2, accepted: 1, dismissed: 1 };
const LABEL = { worn: 1, manual: 1, liked: 1, disliked: 0, accepted: 1, dismissed: 0 };

export function learn(event, features, items) {
  if (!features || !(event in STRENGTH)) return;
  const p = prefs();
  const w = p.w; const lr = 0.08 * STRENGTH[event]; const y = LABEL[event];
  let z = 0; for (const k of FEATURES) z += w[k] * (features[k] || 0);
  const g = y - sigmoid(z);
  for (const k of FEATURES) {
    if (p.locked[k]) continue;
    w[k] = clamp(w[k] + lr * (g * (features[k] || 0) - 0.02 * (w[k] - p.prior[k])), -3, 3);
  }
  p.n += 1;
  // item affinity with decay so changing taste is tracked
  for (const it of items || []) {
    const a = p.affinity[it.id] || (p.affinity[it.id] = { s: 0, a: 0 });
    if (event === 'worn' || event === 'accepted' || event === 'liked' || event === 'manual') { a.a = a.a * 0.97 + (event === 'worn' ? 1.5 : 1); a.s = a.s * 0.97 + 1; }
    else if (event === 'dismissed' || event === 'disliked') { a.s = a.s * 0.97 + 1; a.a *= 0.97; }
  }
  saveSettings({ prefs: p });
}

export function noteShown(items) {
  const p = prefs();
  for (const it of items) { const a = p.affinity[it.id] || (p.affinity[it.id] = { s: 0, a: 0 }); a.s = a.s * 0.99 + 0.25; }
}

export function profileStatements() {
  const w = effectiveWeights(); const p = prefs();
  return FEATURES.map((k) => ({ key: k, value: w[k], raw: p.w[k], locked: !!p.locked[k], text: Math.abs(w[k]) < 0.08 ? `No clear preference yet: ${FEATURE_AXIS[k]}` : FEATURE_TEXT[k][w[k] >= 0 ? 0 : 1], strength: Math.abs(w[k]) }))
    .sort((a, b) => b.strength - a.strength);
}

export async function setLocked(key, locked) { const p = prefs(); p.locked[key] = locked; await saveSettings({ prefs: p }); }
export async function resetPrefs() { state.settings.prefs = null; prefs(); await saveSettings({ prefs: state.settings.prefs }); }

// Style quiz: each answer nudges the prior along the style axes.
export const QUIZ = [
  { a: { t: 'Crisp white shirt + navy trousers', c: ['#f7f7f5', '#1f2a44'], f: { contrast: 1, neutralShare: 1 } }, b: { t: 'Rust overshirt + olive cargo', c: ['#a64b26', '#6b6b2e'], f: { chroma: 1, tonal: 0.5 } } },
  { a: { t: 'All-black minimal look', c: ['#111111', '#3a3d42'], f: { tonal: 1, contrast: -0.6 } }, b: { t: 'Cobalt knit + cream chinos', c: ['#2f62c9', '#efe6d2'], f: { chroma: 1, contrast: 0.5 } } },
  { a: { t: 'Striped breton + jeans', c: ['#1f2a44', '#4a6585'], f: { patterns: 1 } }, b: { t: 'Solid grey tee + jeans', c: ['#808285', '#4a6585'], f: { patterns: -1, neutralShare: 0.5 } } },
  { a: { t: 'Oversized hoodie + slim joggers', c: ['#c4c6c8', '#3a3d42'], f: { relaxed: 1 } }, b: { t: 'Fitted polo + tailored chinos', c: ['#1f7a7a', '#d8c3a0'], f: { relaxed: -1, formalityDelta: 0.4 } } },
  { a: { t: 'Blazer over a tee', c: ['#1f2a44', '#f7f7f5'], f: { formalityDelta: 0.8, layered: 1 } }, b: { t: 'Just the tee', c: ['#f7f7f5', '#4a6585'], f: { formalityDelta: -0.6, layered: -1 } } },
  { a: { t: 'Floral summer dress', c: ['#ee9cb6', '#f0d23c'], f: { patterns: 1, chroma: 1 } }, b: { t: 'Plain linen dress', c: ['#efe6d2', '#d8c3a0'], f: { patterns: -1, neutralShare: 1 } } },
  { a: { t: 'Camel coat + grey knit', c: ['#b88a56', '#808285'], f: { neutralShare: 1, layered: 1 } }, b: { t: 'Red puffer + black jeans', c: ['#c8302c', '#111111'], f: { chroma: 1, contrast: 1 } } },
  { a: { t: 'Tonal beige-on-cream', c: ['#d8c3a0', '#efe6d2'], f: { tonal: 1, contrast: -1 } }, b: { t: 'Black tee + white jeans', c: ['#111111', '#f7f7f5'], f: { contrast: 1 } } },
  { a: { t: 'Chunky cardigan layers', c: ['#a89a6c', '#efe6d2'], f: { layered: 1, warmthOver: 0.6, relaxed: 0.5 } }, b: { t: 'Light single layer', c: ['#9cc3e6', '#f7f7f5'], f: { layered: -1, warmthOver: -0.6 } } },
  { a: { t: 'Plaid check shirt', c: ['#6e1f2e', '#1f2a44'], f: { patterns: 1, chroma: 0.4 } }, b: { t: 'Plain oxford shirt', c: ['#9cc3e6', '#d8c3a0'], f: { patterns: -1, formalityDelta: 0.3 } } },
];

export async function applyQuiz(answers) {
  const p = prefs();
  const prior = { ...POPULATION_PRIOR };
  answers.forEach((choice, i) => {
    const q = QUIZ[i]; if (!q || !choice) return;
    const pick = q[choice], other = q[choice === 'a' ? 'b' : 'a'];
    for (const k of FEATURES) prior[k] += 0.3 * ((pick.f[k] || 0) - (other.f[k] || 0) * 0.5);
  });
  for (const k of FEATURES) { prior[k] = clamp(prior[k], -2, 2); p.prior[k] = prior[k]; if (p.n === 0) p.w[k] = prior[k]; }
  await saveSettings({ prefs: p, quizDone: true });
}

// The closet itself is a statement of taste.
export async function inferWardrobePrior(garments) {
  if (garments.length < 8) return;
  const p = prefs();
  const neutral = garments.filter((g) => g.colors?.[0]?.neutral).length / garments.length;
  const patterned = garments.filter((g) => ['stripe', 'check', 'floral', 'graphic'].includes(g.pattern)).length / garments.length;
  if (!p.wardrobeInferred) {
    p.prior.neutralShare += (neutral - 0.5) * 0.8;
    p.prior.chroma -= (neutral - 0.5) * 0.6;
    p.prior.patterns += (patterned - 0.2) * 1.2;
    p.wardrobeInferred = true;
    await saveSettings({ prefs: p });
  }
}
