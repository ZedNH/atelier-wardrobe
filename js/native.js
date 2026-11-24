// One API for files, sharing, clipboard and links that works in the browser AND inside the Android app (APK),
// where a WebView has no downloads, no Web Share and a restricted clipboard — the native bridge handles those.
const B = () => window.AndroidBridge || null;
export const isApp = () => !!B();

const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });

// Save a file: Downloads (or Pictures for images) in the app, a normal download in the browser.
export async function saveBlob(blob, name) {
  if (isApp()) { B().saveFile(await toBase64(blob), name, blob.type || 'application/octet-stream'); return 'saved'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  return 'downloaded';
}

export function canShareFiles(file) {
  if (isApp()) return true;
  try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { return false; }
}

// Share a file (+ text) to another app — e.g. ChatGPT, WhatsApp, Instagram.
export async function shareFile(file, { text = '', title = '' } = {}) {
  if (isApp()) { B().shareFile(await toBase64(file), file.name, file.type || 'image/jpeg', text || ''); return 'shared'; }
  if (canShareFiles(file)) { try { await navigator.share({ files: [file], text, title }); return 'shared'; } catch { return 'cancelled'; } }
  return saveBlob(file, file.name);
}

// Share several files at once (e.g. your photo + the clothes sheet to ChatGPT) — each arrives as its own image.
export async function shareFiles(files, { text = '', title = '' } = {}) {
  if (isApp() && B().shareFiles) {
    const list = await Promise.all(files.map(async (f) => ({ b64: await toBase64(f), name: f.name, mime: f.type || 'image/jpeg' })));
    B().shareFiles(JSON.stringify(list), text || '');
    return 'shared';
  }
  try { if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, text, title }); return 'shared'; } } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  for (const f of files) await saveBlob(f, f.name);
  return 'downloaded';
}
export const canShareMany = (files) => isApp() || !!(navigator.canShare && (() => { try { return navigator.canShare({ files }); } catch { return false; } })());

export async function copyText(text) {
  if (isApp()) { B().copyText(text); return true; }
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch { return false; }
}

export function openExternal(url) {
  if (isApp()) return B().openUrl(url);
  window.open(url, '_blank', 'noopener');
}
