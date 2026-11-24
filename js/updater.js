// Auto-update.
// Android app: checks the latest GitHub Release; if it is newer, one tap downloads the APK and opens Android's
// installer (same signing key, so your data stays). Website: always loads the newest files; when a new version
// arrives while the page is open, a "Reload" bar appears.
import { APP_VERSION, UPDATE_REPO } from './config.js';
import { toast, icon } from './ui/dom.js';
import { esc } from './util.js';

const isApp = () => !!window.AndroidBridge;
export const currentVersion = () => { try { return (isApp() && window.AndroidBridge.version?.()) || APP_VERSION; } catch { return APP_VERSION; } };
const parts = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
export function isNewer(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* off */ } } };

export async function latestRelease() {
  if (!UPDATE_REPO) throw new Error('Updates are not set up in this build');
  const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'No release published yet' : 'GitHub said ' + r.status);
  const j = await r.json();
  const apk = (j.assets || []).find((a) => /\.apk$/i.test(a.name));
  return { version: String(j.tag_name || '').replace(/^v/i, ''), notes: j.body || '', apk: apk?.browser_download_url, apkName: apk?.name, size: apk?.size, page: j.html_url };
}

// manual = from Settings (always checks and reports); otherwise at most every 6 hours, silently
export async function checkForUpdate({ manual = false } = {}) {
  if (!UPDATE_REPO) { if (manual) toast('Updates are not set up in this build'); return null; }
  if (!manual && Date.now() - +(ls.get('upd-last') || 0) < 6 * 3600e3) return null;
  ls.set('upd-last', String(Date.now()));
  try {
    const rel = await latestRelease();
    const cur = currentVersion();
    if (!isNewer(rel.version, cur)) { if (manual) toast(`You have the latest version (${cur})`); return null; }
    if (!manual && ls.get('upd-skip') === rel.version) return rel;
    if (isApp()) { if (rel.apk) showUpdateBar(rel); }
    else showBar(`Atelier ${esc(rel.version)} is out. This website updates by itself — reload to get it.`, 'Reload', () => location.reload());
    return rel;
  } catch (e) { if (manual) toast('Could not check: ' + (e.message || e)); return null; }
}

let bar = null;
function showBar(html, label, onGo, onClose) {
  bar?.remove();
  bar = document.createElement('div'); bar.className = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `${icon('refresh', 20)}<div class="grow">${html}</div><button class="btn small primary" id="updGo">${label}</button><button class="btn small icon ghost" id="updX" aria-label="Later" style="color:inherit">${icon('x', 14)}</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#updGo').onclick = onGo;
  bar.querySelector('#updX').onclick = () => { onClose?.(); bar.remove(); bar = null; };
  return bar;
}

function showUpdateBar(rel) {
  const note = rel.notes.split('\n').map((s) => s.replace(/^[#*\-\s]+/, '').trim()).find(Boolean) || '';
  const mb = rel.size ? ` · ${(rel.size / 1048576).toFixed(1)} MB` : '';
  showBar(`<b>Update ready: Atelier ${esc(rel.version)}</b>${mb}${note ? `<br><span class="small" style="opacity:.8">${esc(note)}</span>` : ''}`, 'Update', () => startUpdate(rel), () => ls.set('upd-skip', rel.version));
}

function startUpdate(rel) {
  const B = window.AndroidBridge;
  if (B.canInstall && !B.canInstall()) {
    toast('Allow “Install unknown apps” for Atelier, then come back — the update continues by itself.', 7000);
    B.openInstallSettings();
    const resume = () => { if (document.visibilityState === 'visible' && B.canInstall()) { document.removeEventListener('visibilitychange', resume); startUpdate(rel); } };
    document.addEventListener('visibilitychange', resume);
    return;
  }
  const go = bar?.querySelector('#updGo'); if (go) { go.disabled = true; go.innerHTML = '<span class="spinner sm"></span> 0%'; }
  window.__updateStatus = (st, v) => {
    const g = bar?.querySelector('#updGo');
    if (st === 'progress' && g) g.innerHTML = `<span class="spinner sm"></span> ${v >= 0 ? v + '%' : ''}`;
    else if (st === 'install') { if (g) { g.disabled = false; g.textContent = 'Install'; g.onclick = () => startUpdate(rel); } toast('Tap Install / Update on the next screen — your wardrobe stays.', 6000); }
    else if (st === 'error') { if (g) { g.disabled = false; g.textContent = 'Retry'; } toast('Update failed: ' + v, 6000); }
  };
  B.downloadUpdate(rel.apk, rel.apkName || `Atelier-${rel.version}.apk`);
}

// Website: pick up new versions in the background
export function watchWebUpdates() {
  if (isApp() || !('serviceWorker' in navigator)) return;
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had) showBar('A new version of Atelier was installed.', 'Reload', () => location.reload());
    had = true;
  });
  navigator.serviceWorker.getRegistration().then((reg) => { if (reg) setInterval(() => reg.update().catch(() => {}), 3 * 3600e3); });
}
