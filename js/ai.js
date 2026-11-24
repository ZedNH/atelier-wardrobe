// Free, on-device fashion AI. All inference runs in a Web Worker (ai-worker.js) so the app never freezes.
// Model: Marqo FashionCLIP (CLIP fine-tuned on fashion product photos) — far better than generic CLIP at
// polo vs shirt, jeans vs cargo, boots vs sneakers. It also learns from YOUR confirmed items (few-shot).
import { SUBTYPES, PATTERNS, FABRICS, FITS } from './enums.js';
import { kvGet, kvSet, state } from './db.js';
import { makeCanvas, onNeutral } from './vision.js';
import { myRegion } from './profile.js';

export const CLIP_MODEL = 'Marqo/marqo-fashionCLIP';
const BG_MODEL = 'briaai/RMBG-1.4';
const LABEL_VERSION = 7; // bump whenever label prompts change (refreshes the cached text embeddings)
export const MODEL_VERSION = `${CLIP_MODEL}@zs${LABEL_VERSION}`;
const EMB_VERSION = CLIP_MODEL; // embeddings are comparable only within one model
export const sameModel = (g) => !!g?.embedding && String(g.modelVersion || '').startsWith(EMB_VERSION);

export const aiStatus = { ready: false, loading: false, error: null, progress: 0, bgReady: false, worker: true };

// ---------------- worker plumbing ----------------
let worker = null, seq = 0; const pending = new Map();
async function getWorker() {
  if (worker) return worker;
  // Blob worker: works on any host and inside the Android app's private origin
  const src = await (await fetch(new URL('./ai-worker.js', import.meta.url))).text();
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  worker = new Worker(url, { type: 'module', name: 'atelier-ai' });
  worker.onmessage = (e) => {
    const { id, ok, result, error, progress, file } = e.data;
    const p = pending.get(id); if (!p) return;
    if (progress != null) { aiStatus.progress = progress; p.onProgress?.(progress, file); return; }
    pending.delete(id); ok ? p.res(result) : p.rej(new Error(error));
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.rej(new Error(e.message || 'AI worker stopped')); pending.clear(); worker = null; aiStatus.ready = false; aiStatus.bgReady = false; };
  return worker;
}
function call(type, args, { onProgress, transfer = [] } = {}) {
  return getWorker().then((w) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej, onProgress }); w.postMessage({ id, type, args }, transfer); }));
}
const pixels = (canvas) => { const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); return { data: d.data.buffer, width: d.width, height: d.height }; };

// ---------------- label prompts (ensembles) ----------------
const SUBTYPE_PROMPT = {
  't-shirt': 'a plain crew-neck t-shirt without a collar', 'graphic tee': 'a t-shirt with a large graphic print or logo', 'tank top': 'a sleeveless tank top',
  'polo': 'a polo shirt with a soft collar and a short button or zip placket', 'oxford shirt': 'a long-sleeved button-down oxford shirt', 'dress shirt': 'a formal long-sleeved dress shirt with cuffs',
  'linen shirt': 'a loose long-sleeved linen button-up shirt', 'blouse': "a women's blouse", 'henley': 'a long-sleeved henley top with a short button placket and no collar',
  'sweater': 'a knitted pullover sweater', 'turtleneck': 'a turtleneck sweater', 'sweatshirt': 'a crew-neck sweatshirt', 'hoodie': 'a hoodie with a hood',
  'jeans': 'a pair of blue denim jeans with five pockets and rivets', 'chinos': 'a pair of smooth cotton chino trousers', 'dress trousers': 'a pair of tailored formal trousers with a crease',
  'shorts': 'a pair of shorts', 'skirt': 'a skirt', 'joggers': 'a pair of track pants, joggers or sweatpants with an elastic waist', 'leggings': 'a pair of tight leggings',
  'cargo pants': 'a pair of cargo pants with big flap pockets on the side of the thighs',
  'blazer': 'a tailored blazer jacket', 'suit jacket': 'a formal suit jacket', 'cardigan': 'a button-front knitted cardigan', 'denim jacket': 'a denim jean jacket',
  'leather jacket': 'a leather biker jacket', 'bomber': 'a bomber jacket with ribbed cuffs', 'fleece': 'a fleece jacket', 'raincoat': 'a waterproof rain jacket',
  'trench coat': 'a long belted trench coat', 'overcoat': 'a long wool overcoat', 'parka': 'a hooded parka', 'puffer': 'a quilted puffer jacket',
  'casual dress': 'a casual day dress', 'shirt dress': 'a shirt dress with buttons', 'maxi dress': 'a long maxi dress', 'cocktail dress': 'a short cocktail dress', 'formal gown': 'a long formal evening gown', 'jumpsuit': 'a jumpsuit',
  'sneakers': 'a pair of casual sneakers', 'running shoes': 'a pair of running shoes', 'canvas shoes': 'a pair of canvas shoes', 'loafers': 'a pair of slip-on loafers',
  'oxford shoes': 'a pair of lace-up oxford dress shoes', 'derby shoes': 'a pair of derby shoes', 'suede shoes': 'a pair of suede shoes', 'chelsea boots': 'a pair of chelsea boots with elastic side panels',
  'boots': 'a pair of ankle boots or lace-up boots that cover the ankle', 'sandals': 'a pair of sandals', 'heels': 'a pair of high heels', 'flats': 'a pair of ballet flats',
  'belt': 'a leather belt', 'watch': 'a wrist watch', 'bag': 'a handbag', 'scarf': 'a scarf', 'tie': 'a necktie', 'sunglasses': 'a pair of sunglasses', 'jewelry': 'a piece of jewelry',
  'cap': 'a baseball cap', 'beanie': 'a knitted beanie hat', 'hat': 'a brimmed hat',
  'kurti': "a women's kurti tunic top", 'kurta': 'a long kurta tunic shirt', 'panjabi': "a men's panjabi, a long South Asian kurta shirt", 'fotua': 'a short fotua tunic shirt',
  'salwar': 'a pair of loose salwar trousers', 'churidar': 'a pair of tight churidar trousers', 'pajama': 'a pair of white South Asian pajama trousers', 'palazzo': 'a pair of wide palazzo pants',
  'lungi': 'a checked lungi sarong', 'dhoti': 'a white dhoti', 'saree': 'a saree, a long draped South Asian sari', 'salwar kameez': 'a salwar kameez outfit',
  'anarkali': 'a flared anarkali dress', 'lehenga': 'a bridal lehenga skirt outfit', 'sherwani': 'an embroidered sherwani coat', 'koti': 'a sleeveless koti waistcoat',
  'nagra': 'a pair of embroidered nagra khussa shoes', 'kolhapuri': 'a pair of kolhapuri leather sandals', 'dupatta': 'a dupatta, a long light scarf', 'shawl': 'a woven shawl',
  'hijab': 'a hijab headscarf', 'tupi': 'a round prayer cap',
};
const PATTERN_PROMPT = { solid: 'a plain solid color garment', stripe: 'a striped garment', check: 'a plaid checkered garment', floral: 'a floral print garment', graphic: 'a garment with a graphic print or logo', textured: 'a textured ribbed knit garment' };
const FABRIC_PROMPT = { cotton: 'cotton fabric', linen: 'wrinkled linen fabric', wool: 'wool fabric', denim: 'denim fabric', synthetic: 'shiny synthetic nylon fabric', leather: 'leather', knit: 'chunky knitted yarn', silk: 'silk satin fabric', suede: 'suede', canvas: 'canvas fabric' };
const FORMALITY_PROMPT = ['loungewear', 'casual clothing', 'smart casual clothing', 'business attire', 'formal black tie attire'];
const FIT_PROMPT = { slim: 'a slim fit garment', regular: 'a regular fit garment', relaxed: 'a loose relaxed fit garment', oversized: 'an oversized baggy garment' };
const GARMENT_PROMPT = ['a photo of a piece of clothing', 'a photo of a pair of shoes', 'a photo of a bag or fashion accessory', 'a photo of a hat'];
const NOT_GARMENT_PROMPT = ['a selfie of a face', 'a photo of a landscape', 'a photo of food', 'a screenshot of text', 'a photo of a room interior', 'a photo of a pet', 'a photo of a car'];
const TEMPLATES = [(d) => `a photo of ${d}`, (d) => `a product photo of ${d} on a white background`, (d) => `${d}, fashion e-commerce photo`];

function labelSets() {
  const subtypes = Object.keys(SUBTYPES);
  const ens = (descs) => descs.map((d) => TEMPLATES.map((t) => t(d)));
  return {
    subtype: { keys: subtypes, texts: ens(subtypes.map((s) => SUBTYPE_PROMPT[s] || 'a ' + s)) },
    pattern: { keys: PATTERNS, texts: ens(PATTERNS.map((p) => PATTERN_PROMPT[p])) },
    fabric: { keys: FABRICS, texts: FABRICS.map((f) => [`a close-up photo of clothing made of ${FABRIC_PROMPT[f]}`]) },
    formality: { keys: [1, 2, 3, 4, 5], texts: FORMALITY_PROMPT.map((f) => [`a photo of ${f}`]) },
    fit: { keys: FITS, texts: FITS.map((f) => [`a photo of ${FIT_PROMPT[f]}`]) },
    garment: { keys: [...GARMENT_PROMPT.map(() => 1), ...NOT_GARMENT_PROMPT.map(() => 0)], texts: [...GARMENT_PROMPT, ...NOT_GARMENT_PROMPT].map((t) => [t]) },
  };
}
const normA = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); };

let labelEmb = null, loading = null;
export function loadAI(onProgress) {
  if (aiStatus.ready) return Promise.resolve();
  if (loading) return loading;
  aiStatus.loading = true; aiStatus.error = null;
  loading = (async () => {
    await call('load', { model: CLIP_MODEL }, { onProgress });
    const key = `labels:${MODEL_VERSION}`;
    labelEmb = await kvGet(key);
    if (!labelEmb) {
      await call('loadText', { model: CLIP_MODEL }, { onProgress });
      const sets = labelSets(); labelEmb = {};
      for (const [name, s] of Object.entries(sets)) {
        const flat = s.texts.flat();
        const embs = await call('embedTexts', { texts: flat });
        let k = 0; const per = s.texts.map((group) => { const vs = group.map(() => embs[k++]); return normA(vs[0].map((_, i) => vs.reduce((a, v) => a + v[i], 0) / vs.length)); });
        labelEmb[name] = { keys: s.keys, emb: per };
      }
      await kvSet(key, labelEmb);
    }
    aiStatus.ready = true; aiStatus.loading = false;
  })().catch((e) => { aiStatus.loading = false; aiStatus.error = String(e?.message || e); loading = null; throw e; });
  return loading;
}

export async function embedImage(canvas) {
  if (!aiStatus.ready) throw new Error('AI not loaded');
  const px = pixels(onNeutral(canvas, 224));
  return Array.from(await call('embedImage', px, { transfer: [px.data] }));
}
// Original photo + cutout, averaged: the cutout removes clutter, the original keeps parts a cutout may clip
// (measured on real product photos: 60% from the cutout alone → 71% combined).
export async function embedPhoto(original, cut) {
  if (!original || original === cut) return embedImage(cut || original);
  const [a, b] = [await embedImage(original), await embedImage(cut)];
  const v = a.map((x, i) => x + b[i]); const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
export async function embedTexts(texts, onProgress) {
  await call('loadText', { model: CLIP_MODEL }, { onProgress });
  return call('embedTexts', { texts });
}

function softmaxScores(emb, set, temp = 100) {
  const logits = set.emb.map((e) => { let d = 0; for (let i = 0; i < e.length; i++) d += e[i] * emb[i]; return d * temp; });
  const m = Math.max(...logits); const ex = logits.map((l) => Math.exp(l - m)); const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

// Few-shot memory: your confirmed / corrected items vote for their type (same model embeddings only).
function knnVotes(emb, exclude) {
  const ex = state.garments.filter((g) => g.id !== exclude && !g.needsReview && sameModel(g) && g.status !== 'donated');
  if (ex.length < 3) return null;
  const sims = ex.map((g) => { let d = 0; for (let i = 0; i < emb.length; i++) d += emb[i] * g.embedding[i]; return [g, d]; }).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const top = sims[0][1];
  if (top < 0.82) return null; // nothing similar enough in your closet
  const votes = {}; let tot = 0;
  for (const [g, s] of sims) { if (s < top - 0.08) continue; const w = Math.exp((s - top) * 40) * (g.attrSource?.subtype === 'user' ? 1.5 : 1); votes[g.subtype] = (votes[g.subtype] || 0) + w; tot += w; }
  for (const k in votes) votes[k] /= tot;
  return { votes, strength: Math.min(0.65, (top - 0.82) * 4 + 0.25) };
}

// Zero-shot attributes constrained to the enums, with a confidence per attribute.
// hints: { colorName } — e.g. denim-colored bottoms lean to jeans; exclude: own id when re-tagging.
export function classify(emb, hints = {}) {
  const E = labelEmb;
  let sub = softmaxScores(emb, E.subtype);
  // region prior: traditional South Asian types are rarer outside South Asia (e.g. joggers vs churidar)
  if ((hints.region || myRegion()) === 'global') sub = sub.map((p, i) => (SUBTYPES[E.subtype.keys[i]].trad ? p * 0.35 : p));
  if (['denim', 'navy', 'blue', 'light blue'].includes(hints.colorName)) sub = sub.map((p, i) => (E.subtype.keys[i] === 'jeans' ? p * 1.8 : E.subtype.keys[i] === 'cargo pants' || E.subtype.keys[i] === 'joggers' ? p * 0.7 : p));
  const knn = knnVotes(emb, hints.exclude);
  if (knn) sub = sub.map((p, i) => (1 - knn.strength) * p + knn.strength * (knn.votes[E.subtype.keys[i]] || 0));
  const st = sub.reduce((a, b) => a + b, 0); sub = sub.map((p) => p / st);
  const catProb = {};
  E.subtype.keys.forEach((k, i) => { const c = SUBTYPES[k].cat; catProb[c] = (catProb[c] || 0) + sub[i]; });
  const category = Object.entries(catProb).sort((a, b) => b[1] - a[1])[0][0];
  let best = -1, bi = 0, within = 0;
  E.subtype.keys.forEach((k, i) => { if (SUBTYPES[k].cat === category) { within += sub[i]; if (sub[i] > best) { best = sub[i]; bi = i; } } });
  const subtype = E.subtype.keys[bi];
  const pick = (name, allowed) => {
    const p = softmaxScores(emb, E[name]);
    let tot = 0, bk = null, bp = -1;
    E[name].keys.forEach((k, i) => { if (allowed && !allowed.includes(k)) return; tot += p[i]; if (p[i] > bp) { bp = p[i]; bk = k; } });
    return { value: bk, conf: tot ? bp / tot : 0, dist: p };
  };
  const pattern = pick('pattern');
  let fabricAllowed = null;
  if (category === 'footwear') fabricAllowed = ['leather', 'suede', 'canvas', 'synthetic'];
  else if (['jeans', 'denim jacket'].includes(subtype)) fabricAllowed = ['denim'];
  else if (subtype === 'leather jacket') fabricAllowed = ['leather'];
  else if (['sweater', 'cardigan', 'turtleneck', 'beanie'].includes(subtype)) fabricAllowed = ['knit', 'wool', 'cotton', 'synthetic'];
  else if (['puffer', 'parka', 'raincoat', 'activewear top', 'leggings', 'running shoes', 'joggers'].includes(subtype)) fabricAllowed = ['synthetic', 'cotton'];
  else fabricAllowed = {
    top: ['cotton', 'linen', 'wool', 'synthetic', 'knit', 'silk', 'denim'], bottom: ['cotton', 'linen', 'wool', 'denim', 'synthetic', 'leather'],
    dress: ['cotton', 'linen', 'synthetic', 'silk', 'knit', 'denim'], outerwear: ['wool', 'cotton', 'denim', 'leather', 'synthetic', 'knit', 'suede'],
    accessory: ['leather', 'synthetic', 'wool', 'cotton', 'silk'], headwear: ['cotton', 'wool', 'knit', 'synthetic'],
  }[category] || null;
  const fabric = pick('fabric', fabricAllowed);
  const formP = softmaxScores(emb, E.formality);
  const formExp = formP.reduce((s, p, i) => s + p * (i + 1), 0);
  const prior = SUBTYPES[subtype]?.f ?? 3;
  const formality = Math.max(1, Math.min(5, Math.round(0.6 * prior + 0.4 * formExp)));
  const fit = pick('fit');
  const gp = softmaxScores(emb, E.garment);
  const garmentProb = gp.reduce((s, p, i) => s + (E.garment.keys[i] ? p : 0), 0);
  return {
    category, subtype, pattern: pattern.value, fabric: fabric.value, formality, fit: fit.value, garmentProb, learned: !!knn,
    confidence: {
      category: catProb[category], subtype: within ? best / within : 0, pattern: pattern.conf,
      fabric: Math.min(0.5, fabric.conf), // cotton vs linen is invisible at phone resolution
      formality: 0.55 + 0.4 * Math.max(...formP), fit: Math.min(0.5, fit.conf),
    },
  };
}

// ---- Optional AI background removal (RMBG-1.4, ~45 MB, non-commercial license) — also in the worker ----
export async function loadBg(onProgress) {
  if (aiStatus.bgReady) return;
  await call('loadBg', { model: BG_MODEL }, { onProgress });
  aiStatus.bgReady = true;
}
export async function removeBgAI(canvas) {
  const px = pixels(canvas);
  const mask = await call('removeBg', px, { transfer: [px.data] });
  const { matteFromAlpha } = await import('./vision.js');
  return matteFromAlpha(canvas, mask);
}

export async function semanticSearch(query, garments) {
  await loadAI();
  const [q] = await embedTexts([`a photo of ${query}`]);
  return garments.filter(sameModel).map((g) => {
    let d = 0; for (let i = 0; i < q.length; i++) d += q[i] * g.embedding[i];
    return { g, s: d };
  }).sort((a, b) => b.s - a.s);
}

export async function isModelCached() {
  try { const c = await caches.open('transformers-cache'); const keys = await c.keys(); return keys.some((k) => k.url.includes('marqo-fashionCLIP') && k.url.includes('vision_model')); }
  catch { return false; }
}
export { makeCanvas };
