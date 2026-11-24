import { loadState, state, saveSettings } from './db.js';
import { laundryHousekeeping } from './actions.js';
import { $, $$, toast, haptic } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { todayStr } from './weather.js';
import { profile, initials } from './profile.js';
import { captureInstallEvents, isInstalled } from './install.js';
import { applyLanguage } from './i18n.js';

// capture the one-time install event before anything async runs
captureInstallEvents(() => refreshInstallChip());
// a product screenshot / link shared into the app (Android share sheet sets window.__pendingShare)
window.__receiveShare = () => { if (state.settings.onboarded) location.hash = '#/shop?shared=' + Date.now(); };

const routes = {
  today: () => import('./ui/today.js'),
  closet: () => import('./ui/closet.js'),
  item: () => import('./ui/closet.js'),
  add: () => import('./ui/capture.js'),
  review: () => import('./ui/capture.js'),
  builder: () => import('./ui/builder.js'),
  insights: () => import('./ui/insights.js'),
  plan: () => import('./ui/plan.js'),
  stylist: () => import('./ui/stylist.js'),
  me: () => import('./ui/me.js'),
  tryon: () => import('./ui/tryon.js'),
  shop: () => import('./ui/shop.js'),
  declutter: () => import('./ui/declutter.js'),
  settings: () => import('./ui/settings.js'),
  welcome: () => import('./ui/onboarding.js'),
  profile: () => import('./ui/onboarding.js'),
};
const TAB_OF = { today: 'today', closet: 'closet', item: 'closet', add: 'add', review: 'add', builder: 'today', insights: 'insights', plan: 'plan', stylist: 'stylist', me: 'me', tryon: 'tryon', shop: 'shop', declutter: 'insights', settings: 'settings', profile: 'me', welcome: '' };

const NAV = [
  ['today', 'Today', 'sun'], ['stylist', 'Stylist', 'sparkles'], ['closet', 'Closet', 'hanger'], ['add', 'Add item', 'plus'],
  ['tryon', 'Try-On', 'figure'], ['shop', 'Shop smarter', 'bag'], ['plan', 'Plan', 'calendar'], ['insights', 'Insights', 'chart'], ['me', 'My style', 'user'], ['settings', 'Settings', 'gear'],
];
const TABS = [['today', 'Today', 'sun'], ['closet', 'Closet', 'hanger'], ['add', 'Add', 'plus'], ['stylist', 'Stylist', 'sparkles'], ['tryon', 'Try-On', 'figure']];

document.addEventListener('click', (e) => { if (e.target.closest('.tabs a, .side-nav a')) haptic(6); });

function buildNav() {
  $('#sideNav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-tab="${k}" class="${k === 'add' ? 'nav-add' : ''}">${icon(i, 20)}<span>${l}</span></a>`).join('');
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<a href="#/${k}" data-tab="${k}" class="${k === 'add' ? 'tab-add' : ''}" aria-label="${l}"><span class="ti">${icon(i, k === 'add' ? 24 : 22)}</span><b>${l}</b></a>`).join('');
  refreshInstallChip();
  $('#privacyChip').innerHTML = `${icon('lock', 16)}<div><b>Private by design</b><span>Everything stays on this device</span></div>`;
}
export function refreshInstallChip() {
  const el = $('#installChip'); if (!el) return;
  el.hidden = isInstalled();
  el.innerHTML = `<button class="btn small block" id="sideInstall">${icon('phone', 16)} Install app</button>`;
  $('#sideInstall').onclick = async () => (await import('./ui/installui.js')).openInstall();
  const tb = $('#topInstall'); if (tb) { tb.hidden = isInstalled(); tb.innerHTML = icon('phone', 18); tb.onclick = async () => (await import('./ui/installui.js')).openInstall(); }
}
export function refreshAvatar() {
  const p = profile(); const el = $('#avatarBtn'); if (!el) return;
  const ini = initials(p.name);
  el.innerHTML = ini ? `<span>${ini}</span>` : icon('user', 18);
}

// Appearance: theme (auto/light/dark) + accent, mirrored to localStorage for flash-free first paint.
export function applyAppearance(a = state.settings.appearance || {}) {
  const r = document.documentElement;
  if (a.theme && a.theme !== 'auto') r.dataset.theme = a.theme; else delete r.dataset.theme;
  if (a.accent && a.accent !== 'terracotta') r.dataset.accent = a.accent; else delete r.dataset.accent;
  try { localStorage.setItem('appearance', JSON.stringify(a)); } catch { /* private mode */ }
  syncSystemBars();
}

// Android app: paint the status / navigation bars with the current theme background
export function syncSystemBars() {
  if (!window.AndroidBridge?.setSystemBars) return;
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f1eb';
    const m = bg.match(/^#?([0-9a-f]{6})$/i); if (!m) return;
    const n = parseInt(m[1], 16); const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    try { window.AndroidBridge.setSystemBars('#' + m[1], lum > 140); } catch { /* older app build */ }
  });
}
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => syncSystemBars());

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  let name = parts[0] || 'today';
  if (name === 'closet' && parts[1]) name = 'item';
  return { name, param: parts[1], query: new URLSearchParams(qs || '') };
}

let current = null, first = true, routeSeq = 0;
async function route() {
  const r = parseHash();
  if (!state.settings.onboarded && !['welcome', 'settings', 'profile'].includes(r.name)) { location.replace('#/welcome'); return; }
  const seq = ++routeSeq;
  const loader = routes[r.name] || routes.today;
  $$('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === TAB_OF[r.name]));
  const view = $('#view');
  try {
    // quick fade-out of the old page while the next module loads, then a soft rise-in
    const fade = first ? null : (view.classList.add('leave'), new Promise((res) => setTimeout(res, 110)));
    const mod = await loader();
    await fade;
    if (seq !== routeSeq) return; // a newer navigation started
    current?.unmount?.();
    document.body.dataset.route = r.name;
    view.innerHTML = '';
    if (!r.query.get('keep')) window.scrollTo({ top: 0, behavior: 'instant' });
    view.classList.remove('leave', 'enter'); void view.offsetWidth; view.classList.add('enter');
    current = mod; first = false;
    const fn = { item: 'renderItem', review: 'renderReview', welcome: 'renderWelcome', profile: 'renderProfileEdit', add: 'renderCapture', closet: 'renderCloset', settings: 'renderSettings' }[r.name] || 'render';
    await (mod[fn] || mod.render)(view, r);
    refreshAvatar();
    view.focus({ preventScroll: true });
  } catch (e) {
    view.classList.remove('leave');
    console.error(e);
    view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${String(e?.message || e)}</p><a class="btn" href="#/today">Back to Today</a></div>`;
  }
}

export const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function netState() { const n = $('#netState'); n.hidden = navigator.onLine; }

// Morning brief: a notification at the user's chosen time while the app is open/installed.
function scheduleBrief() {
  const t = state.settings.briefTime; if (!t || !state.settings.briefNotify) return;
  const [h, m] = t.split(':').map(Number);
  const now = new Date(); const at = new Date(); at.setHours(h, m, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  setTimeout(async () => {
    if (Notification?.permission === 'granted' && state.settings.lastBrief !== todayStr()) {
      const reg = await navigator.serviceWorker?.getRegistration();
      const body = 'Your outfits for today are ready — tap to see them with the weather reason.';
      if (reg) reg.showNotification('Good morning', { body, icon: 'icons/icon-192.png', tag: 'brief' }); else new Notification('Good morning', { body });
      await saveSettings({ lastBrief: todayStr() });
    }
    scheduleBrief();
  }, Math.min(at - now, 2 ** 31 - 1));
}

async function init() {
  buildNav();
  await loadState();
  applyAppearance();
  applyLanguage();
  refreshAvatar();
  await laundryHousekeeping();
  window.addEventListener('hashchange', route);
  window.addEventListener('online', netState); window.addEventListener('offline', netState); netState();
  // the Android app ships its files inside the APK, so it needs no offline service worker
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.AndroidBridge) navigator.serviceWorker.register('sw.js').catch(() => {});
  setTimeout(() => import('./updater.js').then((u) => { u.watchWebUpdates(); u.checkForUpdate(); }).catch(() => {}), 8000);
  if (location.protocol === 'file:') toast('Tip: run start.bat (or any local web server) — browsers block some features on file://', 6000);
  scheduleBrief();
  if (window.__pendingShare && state.settings.onboarded) location.replace('#/shop?shared=1');
  route();
  // quietly move old items to the fashion AI once its model is already on the device (no surprise downloads)
  if (state.settings.aiEnabled) setTimeout(async () => { try { const ai = await import('./ai.js'); if (await ai.isModelCached()) (await import('./pipeline.js')).upgradeToCurrentModel(); } catch { /* optional */ } }, 6000);
}
init();
