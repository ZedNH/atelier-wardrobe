// Local-first storage: IndexedDB on the user's own device. Nothing is uploaded anywhere.
const DB_NAME = 'smart-wardrobe';
const DB_VERSION = 1;
const STORES = ['garments', 'images', 'outfits', 'wear', 'feedback', 'corrections', 'kv', 'cache'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'images' || s === 'kv' || s === 'cache' ? 'key' : 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getAll(store) { const db = await open(); return wrap(db.transaction(store).objectStore(store).getAll()); }
export async function get(store, key) { const db = await open(); return wrap(db.transaction(store).objectStore(store).get(key)); }
export async function put(store, val) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val); return new Promise((r, j) => { tx.oncomplete = () => r(val); tx.onerror = () => j(tx.error); }); }
export async function putMany(store, vals) { const db = await open(); const tx = db.transaction(store, 'readwrite'); const os = tx.objectStore(store); vals.forEach((v) => os.put(v)); return new Promise((r, j) => { tx.oncomplete = () => r(); tx.onerror = () => j(tx.error); }); }
export async function del(store, key) { const db = await open(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); return new Promise((r) => { tx.oncomplete = () => r(); }); }
export async function clearAll() { const db = await open(); const tx = db.transaction(STORES, 'readwrite'); STORES.forEach((s) => tx.objectStore(s).clear()); return new Promise((r) => { tx.oncomplete = () => r(); }); }

export async function kvGet(key, dflt = null) { const r = await get('kv', key); return r ? r.value : dflt; }
export async function kvSet(key, value) { return put('kv', { key, value }); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- In-memory state mirrors the DB so the engine runs instantly and offline ----
export const state = {
  garments: [], outfits: [], wear: [], feedback: [], corrections: [],
  settings: {}, imageUrls: new Map(),
};

export const DEFAULT_SETTINGS = {
  units: 'C', location: null, onboarded: false, quizDone: false,
  aiEnabled: false, aiBgRemoval: false, bgMode: 'auto',
  briefTime: '07:00', noRepeatDays: 5, laundryDay: 0,
  weights: null, prefs: null, events: [], dailyTagCap: 300,
  explore: true, view: 'flatlay',
};

export async function loadState() {
  const [g, o, w, f, c] = await Promise.all(['garments', 'outfits', 'wear', 'feedback', 'corrections'].map(getAll));
  state.garments = g; state.outfits = o; state.wear = w; state.feedback = f; state.corrections = c;
  state.settings = Object.assign({}, DEFAULT_SETTINGS, await kvGet('settings', {}));
  return state;
}
export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await kvSet('settings', state.settings);
}

export async function saveGarment(g) {
  g.updatedAt = Date.now();
  const i = state.garments.findIndex((x) => x.id === g.id);
  if (i >= 0) state.garments[i] = g; else state.garments.push(g);
  await put('garments', g);
  return g;
}
export async function saveOutfit(o) {
  const i = state.outfits.findIndex((x) => x.id === o.id);
  if (i >= 0) state.outfits[i] = o; else state.outfits.push(o);
  await put('outfits', o); return o;
}
export async function addWear(w) { state.wear.push(w); await put('wear', w); return w; }
export async function addFeedback(f) { state.feedback.push(f); await put('feedback', f); return f; }
export async function addCorrection(c) { state.corrections.push(c); await put('corrections', c); return c; }

export async function saveImage(key, blob) {
  await put('images', { key, blob });
  const old = state.imageUrls.get(key); if (old) URL.revokeObjectURL(old);
  state.imageUrls.delete(key);
}
export async function imageUrl(key) {
  if (!key) return null;
  if (state.imageUrls.has(key)) return state.imageUrls.get(key);
  const r = await get('images', key);
  if (!r) return null;
  const url = URL.createObjectURL(r.blob);
  state.imageUrls.set(key, url);
  return url;
}
export async function imageBlob(key) { const r = await get('images', key); return r ? r.blob : null; }

export const activeGarments = () => state.garments.filter((g) => g.status === 'active' && !g.needsReview);
export const garmentById = (id) => state.garments.find((g) => g.id === id);
