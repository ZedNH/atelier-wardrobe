import { env, isInstalled, canPrompt, isHosted, promptInstall, loadQR } from '../install.js';
import { modal, toast, icon, $ } from './dom.js';

const appUrl = () => location.origin + location.pathname;
const step = (n, title, body, ic = null) => `<li><b>${ic ? `<span class="kbd">${icon(ic, 16)}</span> ` : ''}${title}</b><span>${body}</span></li>`;

// The main entry point for every "Install" button.
export async function openInstall() {
  if (isInstalled()) return showGuide('installed');
  if (canPrompt()) {
    const r = await promptInstall();
    if (r === 'accepted') { toast('Installed — find Atelier on your home screen'); return; }
    if (r === 'dismissed') return toast('No problem — you can install it any time from Settings');
  }
  showGuide();
}

function guideHtml(mode) {
  if (mode === 'installed') return `<h2>You’re all set</h2><p class="muted">Atelier is installed. Open it from your home screen or app list — it works offline and full-screen like a native app.</p>`;
  if (env.inApp) return `<h2>Open in your browser first</h2><p class="muted">This in-app browser can’t install apps.</p><ol class="steps-list">${step(1, 'Tap the ••• or ⋮ menu', 'Usually top-right of this screen.', 'more')}${step(2, `Choose “Open in ${env.ios ? 'Safari' : 'Chrome'}”`, 'The app opens in your real browser.')}${step(3, 'Tap Install again', 'Then follow the steps shown there.', 'download')}</ol>`;
  if (env.ios) {
    const where = env.iosOtherBrowser ? 'in the address bar (iOS 16.4+), or open this page in Safari' : 'at the bottom of Safari (top-right on iPad)';
    return `<h2>Install on iPhone / iPad</h2><p class="muted">Apple lets you add web apps to your Home Screen in three taps — it then opens full-screen, works offline and has its own icon.</p>
      <ol class="steps-list">${step(1, 'Tap the Share button', `The square with an arrow, ${where}.`, 'share')}${step(2, 'Tap “Add to Home Screen”', 'Scroll down the list if you don’t see it.', 'plusSquare')}${step(3, 'Tap “Add”', 'Atelier appears on your Home Screen — open it from there.', 'check')}</ol>
      <div class="ios-hint">${icon('chevDown', 22)}<span>The Share button is down here</span></div>`;
  }
  if (env.android) {
    const menu = env.samsung ? 'the ≡ menu (bottom-right)' : 'the ⋮ menu (top-right)';
    const item = env.samsung ? '“Add page to” → “Home screen”' : env.firefoxAndroid ? '“Install”' : '“Install app” or “Add to Home screen”';
    return `<h2>Install on Android</h2><p class="muted">${isHosted() ? 'Your browser didn’t offer one-tap install yet (it can take a few seconds after the first visit). Install it from the menu instead:' : 'Installing needs the https version of the app — open your Netlify link on the phone.'}</p>
      <ol class="steps-list">${step(1, `Open ${menu}`, 'In Chrome, Edge, Samsung Internet or Firefox.', 'more')}${step(2, `Tap ${item}`, 'Confirm with “Install”.', 'download')}${step(3, 'Open Atelier from your apps', 'It runs full-screen and offline.', 'check')}</ol>`;
  }
  // desktop
  return `<h2>Install on your phone</h2>
    ${isHosted() ? `<p class="muted">Scan with your phone camera to open Atelier there, then tap <b>Install</b> (Android) or <b>Share → Add to Home Screen</b> (iPhone).</p><div class="qr-wrap"><div id="qr"></div><div class="tiny faint" style="word-break:break-all">${appUrl()}</div></div>`
      : `<p class="muted">Phones can only install apps from an <b>https</b> web address. Publish the app first (free — see README: <i>Put it on your phone</i>), then open that link on your phone and tap Install here.</p>`}
    <p class="small mt"><b>On this computer:</b> ${canPrompt() ? 'use the button below.' : 'click the install icon at the right end of the address bar (Chrome / Edge / Brave), or the ⋮ menu → “Install Atelier”.'}</p>
    ${canPrompt() ? `<button class="btn primary mt" id="deskInstall">${icon('download', 16)} Install on this computer</button>` : ''}`;
}

export function showGuide(mode) {
  modal(`<div class="install-guide">${guideHtml(mode)}</div>`, {
    onMount: async (m, close) => {
      const d = $('#deskInstall', m); if (d) d.onclick = async () => { const r = await promptInstall(); close(); if (r === 'accepted') toast('Installed on this computer'); };
      const box = $('#qr', m);
      if (box) { try { const QR = await loadQR(); new QR(box, { text: appUrl(), width: 200, height: 200, colorDark: '#171412', colorLight: '#ffffff', correctLevel: QR.CorrectLevel.M }); } catch { box.innerHTML = '<p class="small muted">QR code needs internet — type the link below on your phone.</p>'; } }
    },
  });
}

// Card for Settings (and anywhere else)
export function installCard() {
  const installed = isInstalled();
  const plat = env.ios ? 'iPhone & iPad' : env.android ? 'Android' : 'your phone';
  return `<section class="card install-card" id="install">
    <div class="install-hero"><img src="icons/icon-192.png" alt="" width="64" height="64"><div><p class="eyebrow" style="margin:0">Get the app</p><h2 class="display">${installed ? 'Installed on this device' : `Install on ${plat}`}</h2>
      <p class="small muted">Full-screen, works offline, its own home-screen icon. Free — no app store needed.</p></div></div>
    <div class="row mt"><button class="btn primary" id="installBtn">${icon(installed ? 'check' : 'download', 16)} ${installed ? 'Installed' : 'Install on your phone'}</button>
      <span class="pill">${icon('figure', 12)} Android</span><span class="pill">${icon('figure', 12)} iPhone / iPad</span></div></section>`;
}
export function bindInstallCard(root) { const b = root.querySelector('#installBtn'); if (b) b.onclick = () => openInstall(); }
