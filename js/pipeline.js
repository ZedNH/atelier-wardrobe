// One photo in -> one structured garment record + original + cutout + style vector out.
// Never blocks capture: photos are queued and processed in the background.
import { SUBTYPES } from './enums.js';
import { state, uid, saveGarment, saveImage, get, put } from './db.js';
import { fileToCanvas, qualityCheck, segmentLocal, trimAlpha, colorsFromCanvas, patternHeuristic, canvasToBlob, scaleCanvas } from './vision.js';
import * as ai from './ai.js';
import { deriveWarmth, deriveSeason, sha256 } from './util.js';
import { trackTagCall, tagCapReached } from './actions.js';

const CONF_THRESHOLD = 0.45;
// give the browser a frame to handle taps/scrolls between heavy steps
export const breathe = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 16)));
const listeners = new Set();
export const queue = { items: [], running: false };
export const onQueue = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f(queue));

export function enqueue(files, opts = {}) {
  for (const f of files) queue.items.push({ id: uid(), file: f, name: f.name || 'photo', status: 'queued', opts });
  emit();
  run();
}

async function run() {
  if (queue.running) return;
  queue.running = true;
  while (true) {
    const job = queue.items.find((j) => j.status === 'queued');
    if (!job) break;
    job.status = 'processing'; emit();
    await breathe();
    try {
      const r = await processPhoto(job.file, job.opts);
      job.status = r.duplicate ? 'duplicate' : r.rejected ? 'rejected' : 'done';
      job.garmentId = r.garment?.id; job.message = r.message;
    } catch (e) {
      console.error(e); job.status = 'error'; job.message = String(e?.message || e);
    }
    emit();
    await breathe();
  }
  queue.running = false;
  emit();
  try { (await import('./learning.js')).inferWardrobePrior(state.garments.filter((g) => g.status === 'active' && !g.needsReview)); } catch { /* optional */ }
}

export async function cutout(canvas, mode = state.settings.bgMode) {
  if (mode === 'none') return { canvas, confidence: 1, method: 'none' };
  if ((mode === 'ai' || state.settings.aiBgRemoval) && mode !== 'local') {
    try {
      await ai.loadBg();
      const r = await ai.removeBgAI(canvas);
      if (r.frac > 0.03 && r.frac < 0.97) return { canvas: trimAlpha(r.canvas), confidence: 0.9, method: 'ai' };
    } catch (e) { console.warn('AI background removal unavailable, using local', e); }
  }
  const seg = segmentLocal(canvas);
  if (seg) return { canvas: seg.canvas, confidence: seg.confidence, method: 'local' };
  return { canvas, confidence: 0.2, method: 'none' };
}

export async function processPhoto(file, opts = {}) {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const dup = state.garments.find((g) => g.imageHash === hash && g.status !== 'archived');
  if (dup && !opts.force) return { duplicate: true, garment: dup, message: 'Already in your wardrobe' };

  const src = await fileToCanvas(file, 1280);
  const quality = qualityCheck(src);
  await breathe();
  const cached = await get('cache', 'tag:' + hash); // hash cache: re-uploads cost nothing

  const cut = cached?.cutoutMethod === 'none' ? { canvas: src, confidence: 1, method: 'none' } : await cutout(scaleCanvas(src, 1024), opts.bgMode);
  const cutCanvas = scaleCanvas(cut.canvas, 800);
  const colors = colorsFromCanvas(cutCanvas);
  await breathe();

  let attrs = cached?.attrs || null, embedding = cached?.embedding || null, modelVersion = cached?.modelVersion || 'manual';
  if (!attrs && state.settings.aiEnabled && !tagCapReached()) {
    try {
      await ai.loadAI();
      embedding = await ai.embedPhoto(scaleCanvas(src, 800), cutCanvas);
      attrs = ai.classify(embedding, { colorName: colors[0]?.name });
      modelVersion = ai.MODEL_VERSION;
      await trackTagCall();
      // never throw a photo away: doubtful ones are kept and flagged for a quick check
      if (attrs.garmentProb < 0.35) quality.issues = [...(quality.issues || []), 'may not be clothing'];
      await put('cache', { key: 'tag:' + hash, attrs, embedding, modelVersion, at: Date.now() });
    } catch (e) { console.warn('AI tagging failed, falling back to manual', e); attrs = null; }
  }
  const ph = patternHeuristic(cutCanvas);
  if (attrs) attrs = blendAttrs(attrs, ph, opts);
  const category = attrs?.category || opts.category || 'top';
  const subtype = attrs?.subtype || opts.subtype || defaultSubtype(category);
  const fabric = attrs?.fabric || defaultFabric(subtype);
  const warmth = deriveWarmth(subtype, fabric, category);
  const conf = attrs?.confidence || { category: 0, subtype: 0, pattern: ph.conf, fabric: 0.2, formality: 0.3, fit: 0.2 };
  const low = Object.entries(conf).filter(([, v]) => v < CONF_THRESHOLD).map(([k]) => k);

  const id = uid();
  const g = {
    id, name: '', category, subtype,
    colors, pattern: attrs?.pattern || ph.pattern, fabric,
    formality: attrs?.formality || SUBTYPES[subtype]?.f || 3,
    fit: attrs?.fit || SUBTYPES[subtype]?.fit || 'regular',
    warmth, season: deriveSeason(warmth, fabric, category),
    brand: '', price: null, purchasedAt: null, notes: '',
    status: 'active', favorite: false, neverSuggest: false,
    imageHash: hash, original: `${id}:original`, cutout: `${id}:cutout`, cutoutMethod: cut.method,
    embedding: embedding || null, modelVersion, confidence: { ...conf, segmentation: cut.confidence },
    lowConfidence: low, quality, attrSource: {},
    needsReview: true, createdAt: Date.now(),
    laundry: { state: 'clean', wearsSinceWash: 0, lastWashedAt: null },
  };
  await saveImage(g.original, await canvasToBlob(scaleCanvas(src, 1280), 'image/jpeg', 0.85));
  await saveImage(g.cutout, await canvasToBlob(cutCanvas, cut.method === 'none' ? 'image/jpeg' : 'image/png', 0.9));
  await saveThumb(g.id, cutCanvas);
  await saveGarment(g);
  return { garment: g, message: quality.issues?.includes('may not be clothing') ? 'Added — please check it is clothing' : low.length ? `Check: ${low.join(', ')}` : 'Tagged' };
}

export async function retagGarment(g, canvasOverride = null) {
  // Re-run perception for a garment (after a crop or model download).
  const { imageBlob } = await import('./db.js');
  const blob = await imageBlob(g.cutout);
  const c = canvasOverride || (await fileToCanvas(blob, 800));
  g.colors = colorsFromCanvas(c);
  if (state.settings.aiEnabled) {
    await ai.loadAI();
    const ob = g.original && g.original !== g.cutout ? await imageBlob(g.original) : null;
    g.embedding = await ai.embedPhoto(ob ? await fileToCanvas(ob, 800) : null, c);
    const a = blendAttrs(ai.classify(g.embedding, { colorName: g.colors?.[0]?.name, exclude: g.id }), patternHeuristic(c));
    const src = g.attrSource || {};
    for (const k of ['category', 'subtype', 'pattern', 'fabric', 'formality', 'fit']) if (src[k] !== 'user') g[k] = a[k];
    g.confidence = { ...a.confidence, segmentation: g.confidence?.segmentation ?? 0.5 };
    g.lowConfidence = Object.entries(a.confidence).filter(([, v]) => v < CONF_THRESHOLD).map(([k]) => k);
    g.modelVersion = ai.MODEL_VERSION;
    if (src.warmth !== 'user') g.warmth = deriveWarmth(g.subtype, g.fabric, g.category);
    if (src.season !== 'user') g.season = deriveSeason(g.warmth, g.fabric, g.category);
  }
  await saveGarment(g);
  return g;
}

// Combine CLIP with cheap pixel evidence and per-subtype priors; never trust a weak guess.
function blendAttrs(a, ph, opts = {}) {
  a = { ...a, confidence: { ...a.confidence } };
  if (opts.category && opts.category !== a.category) { // user said what this batch is
    a.category = opts.category; a.subtype = opts.subtype || defaultSubtype(opts.category); a.confidence.category = 1; a.confidence.subtype = 0.3;
  }
  if (ph.pattern === 'solid' && ph.conf >= 0.6 && a.pattern !== 'solid' && a.pattern !== 'textured' && a.confidence.pattern < 0.75) { a.pattern = 'solid'; a.confidence.pattern = 0.6; }
  if (a.confidence.fabric < 0.35) { a.fabric = defaultFabric(a.subtype); }
  const meta = SUBTYPES[a.subtype];
  if (meta && a.confidence.fit < 0.45) a.fit = meta.fit;
  return a;
}

export const defaultSubtype = (cat) => ({ top: 't-shirt', bottom: 'jeans', outerwear: 'denim jacket', dress: 'casual dress', footwear: 'sneakers', accessory: 'belt', headwear: 'cap' }[cat] || 't-shirt');
export function defaultFabric(sub) {
  if (['jeans', 'denim jacket'].includes(sub)) return 'denim';
  if (['sweater', 'cardigan', 'turtleneck', 'beanie'].includes(sub)) return 'knit';
  if (['leather jacket', 'loafers', 'oxford shoes', 'derby shoes', 'chelsea boots', 'boots', 'belt', 'heels'].includes(sub)) return 'leather';
  if (['overcoat', 'blazer', 'suit jacket', 'dress trousers', 'scarf'].includes(sub)) return 'wool';
  if (['puffer', 'parka', 'raincoat', 'fleece', 'activewear top', 'leggings', 'running shoes', 'sneakers', 'bag', 'watch', 'sunglasses', 'jewelry'].includes(sub)) return 'synthetic';
  if (['linen shirt'].includes(sub)) return 'linen';
  if (['lehenga', 'sherwani', 'anarkali'].includes(sub)) return 'silk';
  if (['nagra', 'kolhapuri'].includes(sub)) return 'leather';
  if (['shawl'].includes(sub)) return 'wool';
  if (['hijab', 'dupatta'].includes(sub)) return 'synthetic';
  if (['canvas shoes'].includes(sub)) return 'canvas';
  if (['suede shoes'].includes(sub)) return 'suede';
  return 'cotton';
}

// Small thumbnail for fast grids (the full cutout is only loaded on the item page)
export async function saveThumb(id, canvas) {
  const c = scaleCanvas(canvas, 320);
  let blob = await canvasToBlob(c, 'image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(c, 'image/png');
  await saveImage(`${id}:thumb`, blob);
}

// After switching to the fashion model: re-embed old items and re-tag unconfirmed ones, gently in the background.
let upgrading = false;
export async function upgradeToCurrentModel(onProgress) {
  if (upgrading || !state.settings.aiEnabled) return 0;
  const todo = state.garments.filter((g) => !g.demo && g.status !== 'donated' && (g.needsReview ? g.modelVersion !== ai.MODEL_VERSION : g.embedding && !ai.sameModel(g)));
  if (!todo.length) return 0;
  upgrading = true;
  try {
    await ai.loadAI();
    const { imageBlob } = await import('./db.js');
    let i = 0;
    for (const g of todo) {
      const blob = await imageBlob(g.cutout); if (!blob) continue;
      const c = await fileToCanvas(blob, 800);
      if (g.needsReview) await retagGarment(g, c);
      else { const ob = g.original ? await imageBlob(g.original) : null; g.embedding = await ai.embedPhoto(ob ? await fileToCanvas(ob, 800) : null, c); g.modelVersion = ai.MODEL_VERSION; await saveGarment(g); }
      onProgress?.(++i, todo.length);
      await breathe();
    }
    return todo.length;
  } finally { upgrading = false; }
}
