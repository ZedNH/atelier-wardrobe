// Onboarding + profile editing: identity, clothing focus, body, coloring (optional selfie), vibes, quiz, location.
import { state, saveSettings } from '../db.js';
import { geocode, browserLocation } from '../weather.js';
import { QUIZ, applyQuiz, prefs } from '../learning.js';
import { profile, saveProfile, GENDERS, WEARS, defaultWear, myWear, BODY, bodyLabel, HEIGHTS, SKIN_TONES, UNDERTONES, HAIR, SEASONS, seasonFrom, analyzeSelfie, VIBES, applyVibes } from '../profile.js';
import { drawGarment, demoItemsFor } from '../demo.js';
import { makeCanvas } from '../vision.js';
import { esc } from '../util.js';
import { $, $$, toast, modal, select, icon, bindChips, switchEl } from './dom.js';
import { REGIONS, guessRegion } from '../profile.js';
import { LANGS, lang, applyLanguage } from '../i18n.js';
import { go, refreshAvatar } from '../app.js';
import { runDemo } from './settings.js';

const STEPS = ['about', 'focus', 'body', 'color', 'vibes', 'quiz', 'location', 'start'];
const EDIT_STEPS = ['about', 'focus', 'body', 'color', 'vibes'];
let D = {}; // draft profile

export async function renderWelcome(view) {
  D = { ...profile() };
  view.innerHTML = `<div class="ob-wrap"><div class="welcome-hero">
      <div class="collage" id="collage"></div>
      <p class="eyebrow mt2">Your private AI stylist</p>
      <h1>Dress <em>beautifully</em> from the clothes you already own.</h1>
      <p>Photograph your wardrobe once. Every morning get complete outfits that suit the weather, your day, your body and your colors — each with the reason why.</p>
      <button class="btn primary" id="start" style="min-height:52px;padding:0 30px;font-size:1rem">Create my style profile ${icon('chev', 18)}</button>
      <p class="tiny faint mt">About 2 minutes · free · no account · nothing leaves this device</p>
      <div class="feat-row">
        ${feat('sparkles', 'AI stylist chat', 'Ask anything about what to wear')}
        ${feat('palette', 'Personal colors', 'Your season palette, even from a selfie')}
        ${feat('figure', 'Body-aware', 'Cuts and proportions that flatter you')}
        ${feat('cpu', 'On-device AI', 'Auto-tags photos, works offline')}
      </div></div></div>`;
  drawCollage($('#collage', view));
  $('#start', view).onclick = () => step(view, 0, STEPS);
}
const feat = (ic, t, s) => `<div class="feat">${icon(ic, 22)}<b>${t}</b><span>${s}</span></div>`;

// Three tilted garment cards, positioned in % of a fixed-ratio box so they never leave the screen.
function drawCollage(box) {
  const picks = [['blazer', '#1f2a44', 4, 14, -8], ['dress', '#b4532a', 33, 0, 3], ['sneakers', '#f7f7f5', 62, 18, 9]];
  const sub = { dress: 'casual dress' };
  picks.forEach(([s, hex, x, y, rot], i) => {
    const c = makeCanvas(300, 300); const ctx = c.getContext('2d');
    ctx.fillStyle = '#f3ede5'; ctx.fillRect(0, 0, 300, 300);
    const g = drawGarment({ subtype: sub[s] || s, hex });
    const k = Math.min(210 / g.width, 210 / g.height);
    ctx.shadowColor = 'rgba(60,40,20,.25)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    ctx.drawImage(g, 150 - g.width * k / 2, 150 - g.height * k / 2, g.width * k, g.height * k);
    c.style.cssText = `left:${x}%;top:${y}%;--r:${rot}deg;animation-delay:${0.08 + i * 0.09}s`;
    box.appendChild(c);
  });
}

export async function renderProfileEdit(view, r) {
  D = { ...profile() };
  const s = r?.query?.get('step');
  step(view, Math.max(0, EDIT_STEPS.indexOf(s)), EDIT_STEPS, true);
}

function shell(view, i, list, edit, title, sub, body, { nextLabel = 'Continue', canNext = true, skip = false } = {}) {
  view.innerHTML = `<div class="ob-wrap">
    <div class="ob-top"><button class="btn small icon ghost" id="obBack" aria-label="Back">${icon('back', 18)}</button><div class="ob-prog"><i style="width:${((i + 1) / list.length) * 100}%"></i></div><span class="ob-step">${i + 1}/${list.length}</span></div>
    <div class="ob-q"><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</div>
    <div class="ob-foot">${skip ? '<button class="btn ghost" id="obSkip">Skip</button>' : '<span></span>'}<button class="btn primary" id="obNext" ${canNext ? '' : 'disabled'}>${nextLabel} ${icon('chev', 16)}</button></div></div>`;
  $('#obBack', view).onclick = () => (i === 0 ? (edit ? go('#/me') : renderWelcome(view)) : step(view, i - 1, list, edit));
  const sk = $('#obSkip', view); if (sk) sk.onclick = () => next(view, i, list, edit, true);
  $('#obNext', view).onclick = () => next(view, i, list, edit);
}
const enableNext = (view, on) => { const b = $('#obNext', view); if (b) b.disabled = !on; };

async function next(view, i, list, edit, skipped = false) {
  const k = list[i];
  if (k === 'vibes' && !skipped) await applyVibes(D.vibes || []);
  if (['about', 'focus', 'body', 'color', 'vibes'].includes(k)) { await saveProfile(D); refreshAvatar(); }
  if (i + 1 < list.length) return step(view, i + 1, list, edit);
  if (edit) { toast('Style profile saved'); go('#/me'); }
}

function step(view, i, list, edit = false) {
  window.scrollTo(0, 0);
  const k = list[i];
  ({ about, focus, body, color, vibes, quiz, location, start })[k](view, i, list, edit);
}

// ---------- steps ----------
function about(view, i, list, edit) {
  D.region = D.region || guessRegion();
  shell(view, i, list, edit, 'First, a little <em>about you</em>', 'This tailors the clothes I suggest, the demo wardrobe and your mannequin preview. You can change it any time.', `
    <div class="row mb"><span class="small muted">Language / ভাষা</span><div class="seg" data-chips="lang">${Object.entries(LANGS).map(([v, l]) => `<button class="chip ${lang() === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
    <label class="f" style="max-width:360px">What should I call you? (optional)<input id="nm" value="${esc(D.name || '')}" placeholder="Your first name" autocomplete="given-name"></label>
    <p class="eyebrow mt2">How do you identify?</p>
    <div class="opts">${Object.entries(GENDERS).map(([v, g]) => `<button class="opt ${D.gender === v ? 'on' : ''}" data-g="${v}"><span class="oic">${icon(v === 'none' ? 'lock' : 'user', 20)}</span><div><b>${g.label}</b></div></button>`).join('')}</div>
    <p class="eyebrow mt2">Where do you dress?</p>
    <div class="opts">${Object.entries(REGIONS).map(([v, r]) => `<button class="opt tall ${D.region === v ? 'on' : ''}" data-rg="${v}"><span class="oic">${icon(v === 'sa' ? 'sparkles' : 'pin', 20)}</span><div><b>${r.label}</b><span>${r.desc}</span></div></button>`).join('')}</div>`, { canNext: !!D.gender });
  bindChips(view, 'lang', async (v) => { await saveSettings({ lang: v }); applyLanguage(); if (v === 'en') location.reload(); });
  $$('[data-rg]', view).forEach((b) => b.onclick = () => { D.region = b.dataset.rg; $$('[data-rg]', view).forEach((x) => x.classList.toggle('on', x === b)); });
  $('#nm', view).oninput = (e) => { D.name = e.target.value.trim(); };
  $$('[data-g]', view).forEach((b) => b.onclick = () => {
    D.gender = b.dataset.g; if (!D.wearSetByUser) D.wear = defaultWear(D.gender);
    $$('[data-g]', view).forEach((x) => x.classList.toggle('on', x === b)); enableNext(view, true);
  });
}

function focus(view, i, list, edit) {
  const cur = D.wear || defaultWear(D.gender);
  shell(view, i, list, edit, 'Which clothes should I <em>focus</em> on?', 'Nothing is ever hidden — this only decides what comes first in lists, which staples I suggest buying and which demo wardrobe you get.', `
    <div class="opts">${Object.entries(WEARS).map(([v, w]) => `<button class="opt tall ${cur === v ? 'on' : ''}" data-w="${v}"><span class="oic">${icon(v === 'women' ? 'bag' : v === 'men' ? 'shirt' : 'hanger', 20)}</span><div><b>${w.label}</b><span>${w.desc}</span></div></button>`).join('')}</div>
    <div class="card flat mt2"><div class="set-group">
      <div class="set-row"><div class="lbl"><b>Modest dressing</b><span>No shorts or tank tops in suggestions</span></div>${switchEl('modestSw', !!D.modest)}</div>
      <div class="set-row"><div class="lbl"><b>I wear a hijab</b><span>Every outfit includes a color-matched hijab</span></div>${switchEl('hijabSw', !!D.hijab)}</div></div></div>`);
  D.wear = cur;
  $('#modestSw', view).onchange = (e) => { D.modest = e.target.checked; };
  $('#hijabSw', view).onchange = (e) => { D.hijab = e.target.checked; if (e.target.checked) { D.modest = true; $('#modestSw', view).checked = true; } };
  $$('[data-w]', view).forEach((b) => b.onclick = () => { D.wear = b.dataset.w; D.wearSetByUser = true; $$('[data-w]', view).forEach((x) => x.classList.toggle('on', x === b)); });
}

const FIG = { balanced: [15, 9, 15], triangle: [11, 9.5, 17], inverted: [18, 11, 11.5], round: [14, 16, 14], rectangle: [13, 12.5, 13] };
const MEN_FIG = { balanced: [17, 12, 13] };
export function figSVG(shape, wear = 'all') {
  const [sh, wa, hi] = (wear === 'men' && MEN_FIG[shape]) || FIG[shape] || FIG.rectangle;
  const L = (v) => (30 - v).toFixed(1), R = (v) => (30 + v).toFixed(1);
  const d = `M30,18 L${L(sh * 0.8)},19.5 Q${L(sh)},20.5 ${L(sh)},25 L${L(wa)},45 Q${L(hi + 0.5)},52 ${L(hi)},58 L${L(6.5)},95 L${L(2)},95 L30,63 L${R(2)},95 L${R(6.5)},95 L${R(hi)},58 Q${R(hi + 0.5)},52 ${R(wa)},45 L${R(sh)},25 Q${R(sh)},20.5 ${R(sh * 0.8)},19.5 Z`;
  return `<svg viewBox="0 0 60 100" aria-hidden="true"><circle cx="30" cy="10" r="6" fill="currentColor" opacity=".85"/><rect x="28" y="15" width="4" height="4" fill="currentColor" opacity=".85"/><path d="${d}" fill="currentColor" opacity=".85"/></svg>`;
}

function body(view, i, list, edit) {
  const wear = D.wear || 'all';
  shell(view, i, list, edit, 'What’s your <em>body shape</em>?', 'Let the AI measure it from a full-body photo, or pick the closest silhouette. I use it to favor proportions that flatter you.', `
    <div class="row mb"><button class="btn accent" id="bscan">${icon('ruler', 18)} Measure from a photo</button><label class="btn">${icon('image', 18)} Upload photo<input type="file" accept="image/*" hidden id="bfile"></label><span class="small muted">Stand straight, arms slightly out, whole body in frame. Processed on this device.</span></div>
    <div id="bres"></div>
    <div class="figs">${Object.keys(BODY).map((k) => `<button class="opt ${D.bodyShape === k ? 'on' : ''}" data-b="${k}">${figSVG(k, wear)}<div><b>${bodyLabel(k, wear)}</b><span>${BODY[k].desc}</span></div></button>`).join('')}</div>
    <p class="eyebrow mt2">Height</p>
    <div class="opts">${Object.entries(HEIGHTS).map(([v, h]) => `<button class="opt ${D.height === v ? 'on' : ''}" data-h="${v}"><span class="oic">${icon('ruler', 20)}</span><div><b>${h.label}</b><span>${h.desc}</span></div></button>`).join('')}</div>`, { skip: true });
  $$('[data-b]', view).forEach((b) => b.onclick = () => { D.bodyShape = b.dataset.b; $$('[data-b]', view).forEach((x) => x.classList.toggle('on', x === b)); });
  $$('[data-h]', view).forEach((b) => b.onclick = () => { D.height = b.dataset.h; $$('[data-h]', view).forEach((x) => x.classList.toggle('on', x === b)); });
  const run = async (src) => {
    const out = $('#bres', view);
    out.innerHTML = '<div class="card flat mb"><div class="row"><span class="spinner sm"></span> Loading the body model (first time ≈ 10 s) and measuring…</div></div>';
    try {
      const { measureBody, fitCanvas } = await import('../bodyscan.js');
      const c = fitCanvas(src, 1100);
      const r = await measureBody(c, wear);
      if (r.error) { out.innerHTML = `<div class="card flat mb"><p class="pill warn" style="white-space:normal">${esc(r.error)}</p></div>`; return; }
      D.bodyShape = r.shape; D.bodyMeasured = { ...r.ratios, confidence: r.confidence, at: Date.now() };
      $$('[data-b]', view).forEach((x) => x.classList.toggle('on', x.dataset.b === r.shape));
      out.innerHTML = `<div class="card flat mb"><div class="bodyfig" style="grid-template-columns:150px 1fr"><div id="bov"></div><div><p class="eyebrow">Measured from your photo</p><h2 class="display" style="font-size:2rem;font-weight:400;margin:0">${esc(bodyLabel(r.shape, wear))}</h2>
        <p class="small muted">Shoulders ${r.rel.shoulders} · Waist ${r.rel.waist} · Hips 100 · confidence ${Math.round(r.confidence * 100)}%</p><p class="tiny faint">Selected below — tap another shape if it looks wrong. Your photo is also saved on this device for Try-On.</p></div></div></div>`;
      r.overlay.style.cssText = 'width:100%;border-radius:14px'; $('#bov', out).appendChild(r.overlay);
      const { savePhoto } = await import('../tryon.js'); await savePhoto(c);
    } catch (e) { out.innerHTML = `<div class="card flat mb"><p class="pill bad" style="white-space:normal">Could not load the body model (${esc(e.message || e)}). It needs internet the first time — or pick a shape below.</p></div>`; }
  };
  $('#bfile', view).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const { fileToCanvas } = await import('../vision.js'); run(await fileToCanvas(f, 1400)); };
  $('#bscan', view).onclick = async () => { const { cameraModal } = await import('./tryon.js'); cameraModal({ facing: 'environment', timer: 5, title: 'Full-body photo', guide: 'body' }, run); };
}

function color(view, i, list, edit) {
  shell(view, i, list, edit, 'Let’s find your <em>colors</em>', 'Your skin, undertone and hair decide which shades light up your face. Answer below — or let the camera measure your skin tone.', `
    <div class="row mb"><button class="btn accent" id="selfie">${icon('camera', 18)} Analyze a selfie</button><span class="small muted">Measured on this device. The photo is never saved.</span></div>
    <p class="eyebrow mt2">Skin tone</p>
    <div class="tones">${SKIN_TONES.map((t, k) => `<button class="tone ${D.toneIdx === k ? 'on' : ''}" data-t="${k}" style="background:${t.hex}" title="${t.label}" aria-label="${t.label}"></button>`).join('')}</div>
    <p class="eyebrow mt2">Undertone <span class="faint" style="text-transform:none;letter-spacing:0">— look at the veins on your wrist in daylight</span></p>
    <div class="opts">${Object.entries(UNDERTONES).map(([v, u]) => `<button class="opt tall ${D.undertone === v ? 'on' : ''}" data-u="${v}"><div><b>${u.label}</b><span>${u.desc}</span></div></button>`).join('')}</div>
    <p class="eyebrow mt2">Natural hair color</p>
    <div class="opts">${Object.entries(HAIR).map(([v, h]) => `<button class="opt ${D.hair === v ? 'on' : ''}" data-hr="${v}"><span class="oic" style="background:${h.hex}"></span><div><b>${h.label}</b></div></button>`).join('')}</div>
    <div id="seasonOut" class="mt2"></div>`, { skip: true });
  const showSeason = () => {
    const box = $('#seasonOut', view);
    if (!(D.undertone && D.depth)) { box.innerHTML = ''; return; }
    const s = seasonFrom(D); const S = SEASONS[s.season];
    box.innerHTML = `<div class="card"><p class="eyebrow">Your color season</p><h2 class="display" style="font-size:2rem;font-weight:400">${s.seasonName}</h2><p class="small muted">${S.mood} Best metal: ${S.metal}.</p><div class="season-strip mt">${S.best.map((h) => `<div style="background:${h}"></div>`).join('')}</div></div>`;
  };
  $$('[data-t]', view).forEach((b) => b.onclick = () => { D.toneIdx = +b.dataset.t; D.depth = SKIN_TONES[D.toneIdx].depth; D.skinHex = SKIN_TONES[D.toneIdx].hex; $$('[data-t]', view).forEach((x) => x.classList.toggle('on', x === b)); showSeason(); });
  $$('[data-u]', view).forEach((b) => b.onclick = () => { D.undertone = b.dataset.u; $$('[data-u]', view).forEach((x) => x.classList.toggle('on', x === b)); showSeason(); });
  $$('[data-hr]', view).forEach((b) => b.onclick = () => { D.hair = b.dataset.hr; $$('[data-hr]', view).forEach((x) => x.classList.toggle('on', x === b)); showSeason(); });
  $('#selfie', view).onclick = () => selfieModal((res) => {
    D.depth = res.depth; D.undertone = res.undertone; D.skinHex = res.hex; D.selfie = true; if (res.hair) D.hair = res.hair;
    D.toneIdx = SKIN_TONES.reduce((bi, t, k) => (t.depth === res.depth && bi < 0 ? k : bi), -1);
    color(view, i, list, edit); showSeasonLater();
  });
  const showSeasonLater = () => setTimeout(() => $('#seasonOut', view) && showSeason(), 0);
  showSeason();
}

function selfieModal(onResult) {
  let stream = null;
  modal(`<h2>Selfie color analysis</h2><p class="small muted">Face a window in natural daylight, no filter or heavy makeup. Fit your face in the oval.</p>
    <div class="row center"><div class="selfie" id="sbox"><video playsinline muted autoplay></video><div class="oval"></div></div></div>
    <div class="row center mt"><button class="btn primary" id="snap">${icon('camera', 18)} Capture</button><label class="btn">${icon('image', 18)} Upload photo<input type="file" accept="image/*" hidden id="sfile"></label></div>
    <div id="sres" class="mt"></div>`, {
    onClose: () => stream?.getTracks().forEach((t) => t.stop()),
    onMount: async (m, close) => {
      const video = $('video', m);
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false }); video.srcObject = stream; }
      catch { $('#sbox', m).innerHTML = '<div style="color:#fff;padding:30px;text-align:center;font-size:.85rem">Camera unavailable — upload a photo instead.</div>'; $('#snap', m).disabled = true; }
      const analyze = async (cv) => {
        const out = $('#sres', m);
        out.innerHTML = '<div class="row"><span class="spinner sm"></span> <span class="small">Finding your face and hair (AI, first time ≈ 6 s)…</span></div>';
        let res = null;
        try { const { analyzeColoring } = await import('../bodyscan.js'); const r = await analyzeColoring(cv); if (!r.error) res = r; else out.innerHTML = `<p class="pill warn" style="white-space:normal">${r.error}</p>`; } catch { /* offline: fall back to the built-in estimate */ }
        if (!res) { res = analyzeSelfie(cv); if (res) res.method = 'basic'; }
        if (!res) { out.innerHTML = '<p class="pill warn" style="white-space:normal">I could not find enough skin in the frame — move closer, face the light, or pick your tone manually.</p>'; return; }
        const s = seasonFrom({ ...D, ...res, hair: res.hair || D.hair }); const S = SEASONS[s.season];
        out.innerHTML = `<div class="card flat"><div class="row"><span class="sw" style="background:${res.hex};width:44px;height:44px"></span>${res.hairHex ? `<span class="sw" style="background:${res.hairHex};width:44px;height:44px" title="hair"></span>` : ''}<div class="grow"><b>${SKIN_TONES.find((t) => t.depth === res.depth).label} skin · ${UNDERTONES[res.undertone].label} undertone${res.hair ? ` · ${HAIR[res.hair].label.toLowerCase()} hair` : ''}</b><div class="tiny muted">${res.method === 'ai' ? 'AI face & hair segmentation, white-balanced' : 'basic skin detection'} · ${res.samples} skin pixels · confidence ${Math.round(res.confidence * 100)}%</div></div></div>
          <p class="small mt">Likely season: <b>${s.seasonName}</b>${D.hair ? '' : ' (add your hair color for a sharper match)'}</p><div class="pal-inline">${S.best.slice(0, 10).map((h) => `<span style="background:${h}"></span>`).join('')}</div>
          <div class="row end mt"><button class="btn primary" id="use">Use this result</button></div></div>`;
        $('#use', m).onclick = () => { close(); onResult(res); };
      };
      $('#snap', m).onclick = () => {
        const w = video.videoWidth, h = video.videoHeight; if (!w) return;
        const s = Math.min(1, 640 / Math.max(w, h)); const c = makeCanvas(w * s, h * s);
        const ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, c.width, c.height);
        analyze(c);
      };
      $('#sfile', m).onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const img = await createImageBitmap(f); const s = Math.min(1, 640 / Math.max(img.width, img.height));
        const c = makeCanvas(img.width * s, img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        analyze(c);
      };
    },
  });
}

function vibes(view, i, list, edit) {
  D.vibes = D.vibes || [];
  shell(view, i, list, edit, 'Pick your <em>style vibes</em>', 'Choose up to three. They set your starting taste — after that I learn from what you actually wear, like and skip.', `
    <div class="vibes">${Object.entries(VIBES).map(([k, v]) => `<button class="opt vibe ${D.vibes.includes(k) ? 'on' : ''}" data-v="${k}"><div class="vs">${v.c.map((c) => `<div style="background:${c}"></div>`).join('')}</div><div class="vt"><b>${v.label}</b><span>${v.desc}</span></div></button>`).join('')}</div>`, { skip: true });
  $$('[data-v]', view).forEach((b) => b.onclick = () => {
    const k = b.dataset.v;
    if (D.vibes.includes(k)) D.vibes = D.vibes.filter((x) => x !== k);
    else { if (D.vibes.length >= 3) return toast('Up to three — unpick one first'); D.vibes = [...D.vibes, k]; }
    b.classList.toggle('on', D.vibes.includes(k));
  });
}

export function quiz(view, i, list, edit, done) {
  const answers = []; let q = 0;
  const draw = () => {
    const Q = QUIZ[q];
    view.innerHTML = `<div class="ob-wrap">
      <div class="ob-top"><button class="btn small icon ghost" id="obBack" aria-label="Back">${icon('back', 18)}</button><div class="ob-prog"><i style="width:${list ? ((i + (q / QUIZ.length)) / list.length) * 100 : (q / QUIZ.length) * 100}%"></i></div><span class="ob-step">${q + 1}/${QUIZ.length}</span></div>
      <div class="ob-q"><p class="eyebrow">Fine-tune · quick picks</p><h1>Which would you <em>rather wear?</em></h1><p class="sub">Go with your gut. Ten quick taps sharpen your style profile.</p>
      <div class="quiz">${['a', 'b'].map((k) => `<button class="qopt" data-k="${k}"><div class="qs">${Q[k].c.map((c) => `<div style="background:${c}"></div>`).join('')}</div>${esc(Q[k].t)}</button>`).join('')}</div></div>
      <div class="ob-foot"><button class="btn ghost" id="qskip">Skip quick picks</button><span></span></div></div>`;
    $('#obBack', view).onclick = () => (q === 0 ? (list ? step(view, i - 1, list, edit) : done?.()) : (q--, draw()));
    $$('.qopt', view).forEach((b) => b.onclick = async () => {
      answers[q] = b.dataset.k; q++;
      if (q < QUIZ.length) return draw();
      await applyQuiz(answers); prefs().quizPrior = null; await applyVibes(profile().vibes || []);
      toast('Style profile tuned');
      if (list) step(view, i + 1, list, edit); else done?.();
    });
    $('#qskip', view).onclick = () => (list ? step(view, i + 1, list, edit) : done?.());
  };
  draw();
}

function location(view, i, list, edit) {
  shell(view, i, list, edit, 'Where are you <em>based</em>?', 'For live weather: temperature, rain and the morning-to-evening drop that decides whether you need a layer. Only coordinates are sent to the free Open-Meteo service.', `
    <div class="card"><div class="row"><button class="btn primary" id="geo">${icon('pin', 18)} Use my location</button><span class="muted small">or</span></div>
    <div class="search mt">${icon('search', 18)}<input id="city" placeholder="Search a city"><button class="btn small" id="cs">Search</button></div><div id="cr" class="row mt"></div>
    <div class="row mt"><label class="f">Temperature units${select('units', [['C', '°C'], ['F', '°F']], state.settings.units)}</label></div>
    ${state.settings.location ? `<p class="small mt">${icon('check', 16)} Current: <b>${esc(state.settings.location.name)}</b></p>` : ''}</div>`, { skip: true });
  view.querySelector('[name=units]').onchange = (e) => saveSettings({ units: e.target.value });
  $('#geo', view).onclick = async () => { try { await saveSettings({ location: await browserLocation() }); toast('Location saved'); step(view, i + 1, list, edit); } catch { toast('Location denied — search a city instead'); } };
  const search = async () => {
    try {
      const res = await geocode($('#city', view).value);
      $('#cr', view).innerHTML = res.map((x, k) => `<button class="chip" data-i="${k}">${icon('pin', 14)} ${esc(x.name)}</button>`).join('') || '<span class="small muted">No match</span>';
      $$('[data-i]', view).forEach((b) => b.onclick = async () => { await saveSettings({ location: res[+b.dataset.i] }); toast('Location saved'); step(view, i + 1, list, edit); });
    } catch { toast('Search needs internet'); }
  };
  $('#cs', view).onclick = search; $('#city', view).onkeydown = (e) => { if (e.key === 'Enter') search(); };
}

function start(view, i, list) {
  const wear = myWear(); const n = demoItemsFor(wear).length; const nm = profile().name;
  view.innerHTML = `<div class="ob-wrap">
    <div class="ob-top"><button class="btn small icon ghost" id="obBack" aria-label="Back">${icon('back', 18)}</button><div class="ob-prog"><i style="width:100%"></i></div><span class="ob-step">${i + 1}/${list.length}</span></div>
    <div class="ob-q"><h1>${nm ? `You’re all set, <em>${esc(nm)}</em>.` : 'You’re <em>all set</em>.'}</h1><p class="sub">Now fill your closet. The first good suggestion arrives at <b>5 tops, 3 bottoms and 2 pairs of shoes</b>.</p>
    <div class="grid g2"><button class="opt tall" id="mine"><span class="oic">${icon('camera', 22)}</span><div><b>Add my own clothes</b><span>Camera or gallery, batch mode, AI tags them for you</span></div></button>
    <button class="opt tall" id="demo"><span class="oic">${icon('sparkles', 22)}</span><div><b>Explore with a demo wardrobe</b><span>${n} ${WEARS[wear].label.toLowerCase()} pieces + 100 days of history — remove it any time</span></div></button></div>
    <div id="demoProg" class="mt"></div></div></div>`;
  $('#obBack', view).onclick = () => step(view, i - 1, list);
  $('#mine', view).onclick = async () => { await saveSettings({ onboarded: true }); go('#/add'); };
  $('#demo', view).onclick = () => runDemo(view, () => go('#/today'));
}
