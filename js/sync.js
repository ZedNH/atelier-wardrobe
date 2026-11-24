// Backup & sync between phone and PC through Google Drive (or any cloud folder), with no account in the app:
// "Back up" shares one backup file to the Drive app (phone) or downloads it (PC → upload to Drive);
// "Restore / sync" opens a backup from Drive and MERGES it — both devices' clothes, outfits and history are
// kept, and for the same garment the most recently edited version wins.
import { state, getAll, put, putMany, clearAll, loadState, saveSettings } from './db.js';
import { saveBlob, shareFile, isApp } from './native.js';
import { todayStr } from './weather.js';

const blobToDataUrl = (b) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });

export async function buildBackup() {
  // identical pictures (e.g. an illustration used as both cutout and original) are stored once: "@ref:<key>"
  const images = {}; const seen = new Map();
  for (const im of await getAll('images')) {
    if (String(im.key).startsWith('tmp:')) continue;
    const url = await blobToDataUrl(im.blob);
    const sig = url.length + ':' + url.slice(-64);
    const first = seen.get(sig);
    if (first && images[first] === url) images[im.key] = '@ref:' + first; else { images[im.key] = url; seen.set(sig, im.key); }
  }
  const wishlist = (await getAll('kv')).find((k) => k.key === 'wishlist')?.value || [];
  return {
    app: 'smart-wardrobe', version: 3, exportedAt: new Date().toISOString(), device: navigator.userAgent.slice(0, 80),
    settings: state.settings, garments: state.garments.map((g) => ({ ...g, embedding: g.embedding ? Array.from(g.embedding) : null })),
    outfits: state.outfits, wear: state.wear, feedback: state.feedback, corrections: state.corrections, wishlist, images,
  };
}

export const backupName = () => `atelier-backup-${todayStr()}.json`;

// Phone (app or browser): share sheet → choose Google Drive. Computer: download, then upload to drive.google.com.
export async function backupToDrive() {
  const data = await buildBackup();
  const file = new File([JSON.stringify(data)], backupName(), { type: 'application/json' });
  let how;
  if (isApp() || (navigator.canShare && navigator.canShare({ files: [file] }))) how = await shareFile(file, { title: 'Atelier backup', text: 'Atelier wardrobe backup' });
  else how = await saveBlob(file, file.name);
  await saveSettings({ lastBackup: Date.now() });
  return { how, size: file.size, items: data.garments.length };
}

export async function readBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'smart-wardrobe') throw new Error('This is not an Atelier backup file');
  const imgs = data.images || {};
  for (const [k, v] of Object.entries(imgs)) if (typeof v === 'string' && v.startsWith('@ref:')) imgs[k] = imgs[v.slice(5)];
  return data;
}

// Replace everything on this device with the backup
export async function replaceFrom(data) {
  await clearAll();
  for (const k of ['garments', 'outfits', 'wear', 'feedback', 'corrections']) if (data[k]?.length) await putMany(k, data[k]);
  for (const [key, url] of Object.entries(data.images || {})) await put('images', { key, blob: await (await fetch(url)).blob() });
  await put('kv', { key: 'settings', value: data.settings || {} });
  if (data.wishlist) await put('kv', { key: 'wishlist', value: data.wishlist });
  await loadState();
  return { added: data.garments?.length || 0, updated: 0 };
}

// Merge: union of everything; for garments present on both, the newer edit wins (and brings its photos).
export async function mergeFrom(data) {
  const local = new Map(state.garments.map((g) => [g.id, g]));
  const imgKeys = new Set((await getAll('images')).map((i) => i.key));
  let added = 0, updated = 0;
  const putImg = async (key) => { const url = data.images?.[key]; if (url) await put('images', { key, blob: await (await fetch(url)).blob() }); };
  for (const g of data.garments || []) {
    const mine = local.get(g.id);
    if (!mine) { await put('garments', g); await putImg(g.cutout); await putImg(g.original); added++; }
    else if ((g.updatedAt || 0) > (mine.updatedAt || 0)) { await put('garments', g); if (!imgKeys.has(g.cutout) || g.cutoutMethod !== mine.cutoutMethod) { await putImg(g.cutout); await putImg(g.original); } updated++; }
    else { if (!imgKeys.has(g.cutout)) await putImg(g.cutout); }
  }
  for (const k of ['outfits', 'wear', 'feedback', 'corrections']) {
    const have = new Set((state[k] || []).map((x) => x.id));
    const fresh = (data[k] || []).filter((x) => !have.has(x.id));
    if (fresh.length) await putMany(k, fresh);
  }
  for (const key of Object.keys(data.images || {})) if (key.startsWith('me:') || key.startsWith('wish:')) { if (!imgKeys.has(key)) await putImg(key); }
  // settings: keep this device's choices, adopt the profile / events / challenge if this device has none
  const s = { ...state.settings }; const o = data.settings || {};
  if (!s.profile?.gender && o.profile) s.profile = o.profile;
  const ev = new Map([...(o.events || []), ...(s.events || [])].map((e) => [e.id, e])); s.events = [...ev.values()];
  if (!s.challenge && o.challenge) s.challenge = o.challenge;
  if (!s.prefs && o.prefs) s.prefs = o.prefs;
  s.onboarded = true; s.lastSync = Date.now();
  await put('kv', { key: 'settings', value: s });
  if (data.wishlist?.length) {
    const mine = (await getAll('kv')).find((k) => k.key === 'wishlist')?.value || [];
    const keys = new Set(mine.map((w) => w.key));
    await put('kv', { key: 'wishlist', value: [...mine, ...data.wishlist.filter((w) => !keys.has(w.key))].slice(0, 60) });
  }
  await loadState();
  return { added, updated };
}

export const daysSinceBackup = () => (state.settings.lastBackup ? Math.floor((Date.now() - state.settings.lastBackup) / 864e5) : null);
