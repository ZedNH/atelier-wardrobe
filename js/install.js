// "Install on your phone": one button that does the right thing on every platform.
//  • Android / Chrome / Edge / Samsung Internet / desktop Chromium: the native install prompt (beforeinstallprompt).
//  • iPhone / iPad: Apple does not allow websites to trigger installs, so a step-by-step Add-to-Home-Screen guide.
//  • In-app browsers (Instagram, Facebook…): explain how to open in the real browser first.
//  • Desktop: a QR code to open the app on your phone.
const ua = navigator.userAgent;
export const env = {
  ios: /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /Android/.test(ua),
  inApp: /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok/i.test(ua),
  iosOtherBrowser: /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua),
  samsung: /SamsungBrowser/.test(ua),
  firefoxAndroid: /Android.*Firefox/.test(ua),
};
env.mobile = env.ios || env.android || /Mobi/.test(ua);

export const isInstalled = () => !!window.AndroidBridge || window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || navigator.standalone === true || localStorage.getItem('installed') === '1';
export const canPrompt = () => !!window.__installPrompt;
export const isHosted = () => location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname);

// Must run at startup so the one-time event is never missed.
export function captureInstallEvents(onChange) {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installPrompt = e; onChange?.(); });
  window.addEventListener('appinstalled', () => { window.__installPrompt = null; try { localStorage.setItem('installed', '1'); } catch { /* private mode */ } onChange?.(); });
}

// Returns 'installed' | 'accepted' | 'dismissed' | 'guide'
export async function promptInstall() {
  if (isInstalled()) return 'installed';
  const p = window.__installPrompt;
  if (!p) return 'guide';
  p.prompt();
  const { outcome } = await p.userChoice;
  window.__installPrompt = null;
  if (outcome === 'accepted') { try { localStorage.setItem('installed', '1'); } catch { /* ignore */ } }
  return outcome;
}

let qrLib = null;
export function loadQR() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (qrLib) return qrLib;
  qrLib = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => res(window.QRCode); s.onerror = () => { qrLib = null; rej(new Error('QR library unavailable offline')); };
    document.head.appendChild(s);
  });
  return qrLib;
}
