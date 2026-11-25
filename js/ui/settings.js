import { state, saveSettings, clearAll, putMany, getAll, put, loadState, activeGarments } from '../db.js';
import { geocode, browserLocation, todayStr } from '../weather.js';
import { DEFAULT_WEIGHTS, WEIGHT_LABEL } from '../recommender.js';
import { inferWardrobePrior } from '../learning.js';
import { loadDemo, demoItemsFor } from '../demo.js';
import { retagGarment } from '../pipeline.js';
import { myWear, WEARS, REGIONS, myRegion, isModest, wearsHijab, saveProfile } from '../profile.js';
import { LANGS, lang, applyLanguage } from '../i18n.js';
import * as ai from '../ai.js';
import { esc } from '../util.js';
import { $, $$, toast, confirmBox, select, bar, icon, pageHead, switchEl, bindChips } from './dom.js';
import { go, applyAppearance } from '../app.js';
import { installCard, bindInstallCard, openInstall } from './installui.js';
import { backupToDrive, readBackup, mergeFrom, replaceFrom, daysSinceBackup } from '../sync.js';
import { isApp } from '../native.js';
import { modal } from './dom.js';
import { checkForUpdate, currentVersion } from '../updater.js';
import { UPDATE_REPO } from '../config.js';
import { LLM_PROVIDERS, brainSettings, saveBrainSettings, testBrain, listModels, bestModel, KNOWN_MODELS } from '../llm.js';
import { openPicker } from './dom.js';

const ACCENTS = [['terracotta', '#b4532a'], ['sage', '#4f6f52'], ['cobalt', '#2f4dba'], ['rose', '#b5446e'], ['noir', '#171412']];

export async function renderSettings(view, r) {
  if (r?.query?.get('quiz')) { const { quiz } = await import('./onboarding.js'); return quiz(view, 0, null, true, () => go('#/me')); }
  const s = state.settings;
  const W = { ...DEFAULT_WEIGHTS, ...(s.weights || {}) };
  const demoN = state.garments.filter((g) => g.demo).length;
  const ap = s.appearance || {};
  let currency = 'USD'; try { currency = localStorage.getItem('currency') || 'USD'; } catch { /* private mode */ }
  const head = (ic, t, sub = '') => `<div class="card-h"><h2>${icon(ic, 18)} ${t}</h2>${sub}</div>`;
  view.innerHTML = `
    ${pageHead('Preferences', 'Settings', 'Everything here stays on this device.')}
    ${installCard()}
    <div class="grid g2 mt">
    <section class="card">${head('user', 'Style profile')}
      <div class="set-group">
        <div class="set-row"><div class="lbl"><b>Profile, body & colors</b><span>Gender, clothing focus (${esc(WEARS[myWear()].label)}), body shape, color season, vibes</span></div><a class="btn small" href="#/profile">Edit</a></div>
        <div class="set-row"><div class="lbl"><b>Quick picks quiz</b><span>10 taps to retune your taste</span></div><a class="btn small" href="#/settings?quiz=1">Retake</a></div>
        <div class="set-row"><div class="lbl"><b>Language</b><span>ভাষা · the stylist understands Bangla & Banglish too</span></div><div class="seg" data-chips="lang">${Object.entries(LANGS).map(([v, l]) => `<button class="chip ${lang() === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="set-row"><div class="lbl"><b>Region</b><span>South Asia adds saree, panjabi, salwar kameez… and Eid, Boishakh, holud, biye</span></div><div class="seg" data-chips="region">${Object.entries(REGIONS).map(([v, r]) => `<button class="chip ${myRegion() === v ? 'on' : ''}" data-v="${v}">${r.label}</button>`).join('')}</div></div>
        <div class="set-row"><div class="lbl"><b>Modest dressing</b><span>No shorts or tank tops in suggestions</span></div>${switchEl('modest', isModest())}</div>
        <div class="set-row"><div class="lbl"><b>I wear a hijab</b><span>Every outfit includes one of your hijabs, color-matched</span></div>${switchEl('hijab', wearsHijab())}</div>
      </div></section>

    <section class="card">${head('palette', 'Appearance')}
      <div class="set-group">
        <div class="set-row"><div class="lbl"><b>Theme</b><span>Follows your device unless set</span></div><div class="seg" data-chips="theme">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button class="chip ${(ap.theme || 'auto') === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
        <div class="set-row"><div class="lbl"><b>Accent color</b><span>Used for highlights and charts</span></div><div class="accents">${ACCENTS.map(([k, h]) => `<button data-acc="${k}" class="${(ap.accent || 'terracotta') === k ? 'on' : ''}" style="background:${h}" aria-label="${k}" title="${k}"></button>`).join('')}</div></div>
        <div class="set-row"><div class="lbl"><b>Outfit preview</b><span>Flat-lay or mannequin figure</span></div><div class="seg" data-chips="pview">${[['flatlay', 'Flat-lay'], ['mannequin', 'Mannequin']].map(([v, l]) => `<button class="chip ${(s.view || 'flatlay') === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
      </div></section>

    <section class="card" id="loc">${head('pin', 'Location & units')}
      <p class="small muted">${s.location ? `Current: <b>${esc(s.location.name)}</b>` : 'No location — weather-aware suggestions are off until you set one.'}</p>
      <div class="search">${icon('search', 18)}<input id="city" placeholder="Search a city"><button class="btn small" id="citygo">Search</button></div>
      <div id="cityres" class="row mt"></div>
      <div class="row mt"><button class="btn small" id="geo">${icon('pin', 16)} Use my location</button></div>
      <div class="form mt"><label class="f">Temperature${select('units', [['C', '°C'], ['F', '°F']], s.units)}</label><label class="f">Currency${select('currency', ['USD', 'EUR', 'GBP', 'INR', 'BDT', 'JPY', 'CAD', 'AUD', 'PKR', 'AED', 'SGD'], currency)}</label></div>
      <p class="tiny faint mt">Weather from Open-Meteo — free, no key. Only coordinates are sent.</p></section>

    <section class="card" id="ai">${head('cpu', 'On-device AI')}
      <p class="small muted">Free <b>fashion-trained AI</b> (Marqo FashionCLIP) running in the background on this device — the app stays responsive while it works. One-time ≈145 MB download, then offline. It also learns from every item you confirm or correct. Photos never leave this device.</p>
      <div class="set-group">
        <div class="set-row"><div class="lbl"><b>AI tagging</b><span>Type, pattern, fabric, formality, style vector, “not a garment” filter</span></div>${switchEl('aiOn', s.aiEnabled)}</div>
        <div class="set-row"><div class="lbl"><b>AI background removal</b><span>RMBG-1.4, ≈45 MB, non-commercial license</span></div>${switchEl('bgOn', s.aiBgRemoval)}</div>
      </div>
      <div id="aiProg" class="mt"></div>
      <div class="row mt"><button class="btn small" id="retagAll" ${s.aiEnabled ? '' : 'disabled'}>${icon('wand', 16)} Re-tag with fashion AI</button><span class="tiny faint">Today: ${s.tagStats?.day === todayStr() ? s.tagStats.count : 0} / ${s.dailyTagCap}</span></div></section>

    <section class="card">${head('target', 'Recommendation engine')}
      <p class="small muted">Scoring weights — tune them to taste.</p>
      <div class="grid" style="gap:8px">${Object.keys(DEFAULT_WEIGHTS).map((k) => `<label class="wrow"><span class="small">${WEIGHT_LABEL[k]}</span><input type="range" min="0" max="50" value="${Math.round(W[k] * 100)}" data-w="${k}"><span class="small" style="text-align:right" id="wv-${k}">${Math.round(W[k] * 100)}</span></label>`).join('')}</div>
      <div class="row mt"><button class="btn small" id="wreset">Reset weights</button></div>
      <div class="form mt">
        <label class="f">Stretch pick (1 in 3)${select('explore', [['1', 'On'], ['0', 'Off']], s.explore !== false ? '1' : '0')}</label>
        <label class="f">No-repeat days<input type="number" min="0" max="21" name="noRepeatDays" value="${s.noRepeatDays}"></label>
        <label class="f">Laundry day${select('laundryDay', [[-1, 'None'], [0, 'Sunday'], [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday']], s.laundryDay)}</label>
        <label class="f">Daily AI tag cap<input type="number" min="10" max="2000" name="dailyTagCap" value="${s.dailyTagCap}"></label>
      </div></section>

    <section class="card">${head('sun', 'Morning brief')}
      <div class="set-group"><div class="set-row"><div class="lbl"><b>Notify me</b><span>While the app is open or installed</span></div>${switchEl('bn', s.briefNotify)}</div>
      <div class="set-row"><div class="lbl"><b>Time</b></div><input type="time" id="bt" value="${esc(s.briefTime)}"></div></div></section>



    <section class="card" id="brain">${head('sparkles', 'AI stylist brain', `<span class="pill ${brainSettings().key ? 'good' : ''}">${brainSettings().key ? 'On' : 'Optional'}</span>`)}
      <p class="small muted" style="margin-top:0">Connect your own AI — Claude, ChatGPT, Gemini, Grok, Z.ai (GLM), DeepSeek or OpenRouter — and the Stylist chat asks it to pick outfits from your closet. Only a text list of your clothes is sent (no photos). Your key stays on this device; the provider bills your account.</p>
      <div class="form">
        <label class="f">Provider${select('bprov', Object.entries(LLM_PROVIDERS).map(([k, v]) => [k, v.label]), brainSettings().provider || 'claude')}</label>
        <div class="f">Model<div class="model-row"><input id="bmodel" aria-label="Model" autocomplete="off" value="${esc(brainSettings().model || LLM_PROVIDERS[brainSettings().provider || 'claude'].model)}"><button type="button" class="btn small" id="bpick">${icon('chevDown', 14)} Models</button></div><span class="tiny muted" id="bmstat">Tap Models to see what your key can use — or type any model name.</span></div>
        <label class="f" style="grid-column:1/-1">API key<input id="bkey" type="password" autocomplete="off" placeholder="Paste your API key" value="${esc(brainSettings().key || '')}"></label>
      </div>
      <p class="tiny muted mt" id="bnote">${esc(LLM_PROVIDERS[brainSettings().provider || 'claude'].note)} <a href="${LLM_PROVIDERS[brainSettings().provider || 'claude'].keyUrl}" target="_blank" rel="noopener">Get a key</a></p>
      <div class="row mt"><button class="btn small primary" id="bsave">${icon('check', 14)} Save</button><button class="btn small" id="btest">${icon('sparkles', 14)} Test</button>${brainSettings().key ? `<button class="btn small ghost danger" id="bdel">Remove key</button>` : ''}</div></section>

    <section class="card">${head('refresh', 'App updates')}
      <div class="set-group">
        <div class="set-row"><div class="lbl"><b>Version ${esc(currentVersion())}</b><span>${!UPDATE_REPO ? (isApp() ? 'To update, install the newer APK over this one — your wardrobe stays.' : 'The website always loads the newest version.') : isApp() ? 'New versions download from GitHub and install in one tap — your wardrobe stays.' : 'The website always loads the newest version.'}</span></div>${UPDATE_REPO ? `<button class="btn small" id="updCheck">${icon('refresh', 14)} Check now</button>` : ''}</div>
      </div></section>

    <section class="card">${head('lock', 'Privacy')}
      <ul class="tips">
        <li>${icon('check', 16)}<span>Photos, wardrobe, wear log and style profile are stored only on this device. No account, no server.</span></li>
        <li>${icon('check', 16)}<span>AI models download once from Hugging Face; inference runs locally. Selfie analysis never stores the photo.</span></li>
        <li>${icon('check', 16)}<span>“Delete all my data” removes everything, instantly.</span></li></ul></section>
    <section class="card" id="data" style="grid-column:1/-1">${head('refresh', 'Sync & backup')}
      <p class="small muted">Keep your phone and PC in sync through your own Google Drive — free, no account in this app. ${daysSinceBackup() == null ? '<b>No backup yet.</b>' : `Last backup: <b>${daysSinceBackup() === 0 ? 'today' : daysSinceBackup() + ' days ago'}</b>.`}</p>
      <ol class="steps-list small" style="margin-top:6px">
        <li><b>Back up to Google Drive</b><span>${isApp() || /Android|iPhone|iPad/.test(navigator.userAgent) ? 'Opens the share sheet — choose Drive.' : 'Downloads one file — drag it into drive.google.com.'}</span></li>
        <li><b>On the other device: Restore or sync</b><span>Pick that file from Drive. <i>Merge</i> keeps both devices’ clothes and history; the newest edit wins.</span></li></ol>
      <div class="row mt"><button class="btn small primary" id="exp">${icon('upload', 16)} Back up to Google Drive</button><label class="btn small">${icon('download', 16)} Restore or sync from a backup<input type="file" accept="application/json,.json" hidden id="imp"></label></div>
      <div class="row mt"><button class="btn small" id="demo">${icon('sparkles', 16)} ${demoN ? 'Reload' : 'Load'} demo wardrobe (${demoItemsFor(myWear()).length} items)</button>${demoN ? `<button class="btn small" id="undemo">Remove demo items (${demoN})</button>` : ''}</div>
      <div id="demoProg" class="mt"></div>
      <div class="row mt"><button class="btn small danger" id="wipe">${icon('trash', 16)} Delete all my data</button></div></section>
    </div>
    <p class="tiny faint mt2" style="text-align:center">Atelier · free & open · runs in any modern browser</p>`;

  // AI brain
  const bp = view.querySelector('[name=bprov]');
  bp.onchange = () => { const P = LLM_PROVIDERS[bp.value]; $('#bmodel', view).value = P.model; $('#bnote', view).innerHTML = `${esc(P.note)} <a href="${P.keyUrl}" target="_blank" rel="noopener">Get a key</a>`; };
  const bget = () => ({ provider: bp.value, model: $('#bmodel', view).value.trim() || LLM_PROVIDERS[bp.value].model, key: $('#bkey', view).value.trim(), enabled: true });
  $('#bsave', view).onclick = () => { saveBrainSettings(bget()); toast(bget().key ? 'AI stylist on — ask the Stylist anything' : 'Saved'); renderSettings(view, r); };
  // model list: the provider's own list when a key is entered (new models appear automatically), else known models
  let modelCache = { prov: null, key: null, list: null, live: false };
  const loadModels = async (quiet = false) => {
    const s = bget(); const st = $('#bmstat', view);
    if (modelCache.list && modelCache.prov === s.provider && modelCache.key === s.key) return modelCache;
    st.innerHTML = '<span class="spinner sm"></span> Looking up models…';
    try { const r = await listModels(s); modelCache = { prov: s.provider, key: s.key, list: r.models, live: r.live }; st.textContent = r.live ? `${r.models.length} models available${s.key ? ' on your key' : ''}` : 'Common models — add your key to see the full list'; }
    catch (err) { modelCache = { prov: s.provider, key: s.key, list: KNOWN_MODELS[s.provider] || [], live: false }; st.textContent = quiet ? 'Could not load the model list — showing common models' : 'Could not load your model list (' + (err.message || err) + ') — showing common models'; }
    // GLM: switch to the newest model the key has, unless you picked one yourself
    const m = $('#bmodel', view); const auto = bestModel(s.provider, modelCache.list);
    if (auto && modelCache.live && (m.value === LLM_PROVIDERS[s.provider].model || !modelCache.list.includes(m.value)) && m.value !== auto) { m.value = auto; toast(`Using ${auto} — the newest model on your key`); }
    return modelCache;
  };
  $('#bpick', view).onclick = async () => {
    const { list } = await loadModels();
    const cur = $('#bmodel', view).value.trim();
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Model');
    const opts = [...new Set([cur, ...list].filter(Boolean))];
    sel.innerHTML = opts.map((x) => `<option value="${esc(x)}" ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('') + '<option value="__custom">Type another model name…</option>';
    sel.onchange = () => { if (sel.value === '__custom') { const i = $('#bmodel', view); i.select(); i.focus(); } else $('#bmodel', view).value = sel.value; };
    sel.style.display = 'none'; view.appendChild(sel); openPicker(sel); setTimeout(() => sel.remove(), 60000);
  };
  bp.addEventListener('change', () => { modelCache = { prov: null }; $('#bmstat', view).textContent = 'Tap Models to see what your key can use — or type any model name.'; });
  $('#bkey', view).addEventListener('change', () => { if ($('#bkey', view).value.trim()) { modelCache = { prov: null }; loadModels(true); } });
  $('#btest', view).onclick = async (e) => {
    const b = e.currentTarget; const s = bget(); if (!s.key) return toast('Paste your API key first');
    b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Testing…';
    try { await loadModels(true); s.model = $('#bmodel', view).value.trim() || s.model; await testBrain(s); saveBrainSettings(s); toast('Connected — the Stylist now uses ' + LLM_PROVIDERS[s.provider].label, 4000); } catch (err) { toast('Not working: ' + (err.message || err), 6000); }
    b.disabled = false; b.innerHTML = `${icon('sparkles', 14)} Test`;
  };
  const bd = $('#bdel', view); if (bd) bd.onclick = () => { saveBrainSettings({}); toast('Key removed'); renderSettings(view, r); };
  const uc = $('#updCheck', view); if (uc) uc.onclick = async (e) => { const b = e.currentTarget; b.disabled = true; await checkForUpdate({ manual: true }); b.disabled = false; };
  // language, region, modesty
  bindChips(view, 'lang', async (v) => { await saveSettings({ lang: v }); applyLanguage(); toast(v === 'bn' ? 'বাংলা চালু হয়েছে' : 'English on'); if (v === 'en') location.reload(); });
  bindChips(view, 'region', async (v) => { await saveProfile({ region: v }); toast(v === 'sa' ? 'South Asian clothing & occasions on' : 'Global occasions'); });
  $('#modest', view).onchange = async (e) => { await saveProfile({ modest: e.target.checked }); toast(e.target.checked ? 'Modest dressing on' : 'Modest dressing off'); };
  $('#hijab', view).onchange = async (e) => { await saveProfile({ hijab: e.target.checked }); toast(e.target.checked ? 'Hijab added to every outfit (add your hijabs in Closet)' : 'Hijab preference off'); };

  // appearance
  const setAp =async (patch) => { const a = { ...(state.settings.appearance || {}), ...patch }; await saveSettings({ appearance: a }); applyAppearance(a); };
  view.querySelector('[data-chips=theme]').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; $$('[data-chips=theme] .chip', view).forEach((c) => c.classList.toggle('on', c === b)); setAp({ theme: b.dataset.v }); };
  view.querySelector('[data-chips=pview]').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; $$('[data-chips=pview] .chip', view).forEach((c) => c.classList.toggle('on', c === b)); saveSettings({ view: b.dataset.v }); };
  $$('[data-acc]', view).forEach((b) => b.onclick = () => { $$('[data-acc]', view).forEach((x) => x.classList.toggle('on', x === b)); setAp({ accent: b.dataset.acc }); });

  // location
  const showRes = (list) => {
    const box = $('#cityres', view);
    box.innerHTML = list.length ? list.map((x, i) => `<button class="chip" data-i="${i}">${icon('pin', 14)} ${esc(x.name)}</button>`).join('') : '<span class="small muted">No match</span>';
    $$('[data-i]', box).forEach((b) => b.onclick = async () => { await saveSettings({ location: list[+b.dataset.i] }); toast('Location saved'); renderSettings(view, r); });
  };
  $('#citygo', view).onclick = async () => { try { showRes(await geocode($('#city', view).value)); } catch { toast('City search needs an internet connection'); } };
  $('#city', view).onkeydown = (e) => { if (e.key === 'Enter') $('#citygo', view).click(); };
  $('#geo', view).onclick = async () => { try { const l = await browserLocation(); await saveSettings({ location: l }); toast('Location saved'); renderSettings(view, r); } catch (e) { toast('Could not get location: ' + (e.message || 'denied')); } };
  view.querySelector('[name=units]').onchange = (e) => saveSettings({ units: e.target.value });
  view.querySelector('[name=currency]').onchange = (e) => { try { localStorage.setItem('currency', e.target.value); } catch { /* ignore */ } toast('Currency saved'); };

  // AI
  const prog = $('#aiProg', view);
  const showProg = (p, file) => { prog.innerHTML = `<div class="small">Downloading model… ${Math.round(p * 100)}% <span class="tiny faint">${esc(file || '')}</span></div>${bar(p)}`; };
  $('#aiOn', view).onchange = async (e) => {
    if (!e.target.checked) { await saveSettings({ aiEnabled: false }); prog.innerHTML = ''; return; }
    e.target.disabled = true; showProg(0);
    try {
      await ai.loadAI(showProg);
      await saveSettings({ aiEnabled: true });
      prog.innerHTML = '<span class="pill good">AI ready — cached for offline use</span>';
      $('#retagAll', view).disabled = false;
    } catch (err) {
      e.target.checked = false;
      prog.innerHTML = `<span class="pill bad">Could not load AI: ${esc(err.message || err)}</span><p class="tiny muted">Needs internet the first time and a recent Chrome, Edge, Firefox or Safari.</p>`;
    }
    e.target.disabled = false;
  };
  if (s.aiEnabled && ai.aiStatus.ready) prog.innerHTML = '<span class="pill good">AI ready</span>';
  $('#bgOn', view).onchange = async (e) => {
    if (!e.target.checked) return saveSettings({ aiBgRemoval: false });
    e.target.disabled = true; showProg(0);
    try { await ai.loadBg(showProg); await saveSettings({ aiBgRemoval: true }); prog.innerHTML = '<span class="pill good">AI background removal ready</span>'; }
    catch (err) { e.target.checked = false; prog.innerHTML = `<span class="pill bad">Could not load background model: ${esc(err.message || err)}</span>`; }
    e.target.disabled = false;
  };
  $('#retagAll', view).onclick = async (e) => {
    // items never tagged, tagged by the old general model, or still waiting for review (your own corrections are kept)
    const list = state.garments.filter((g) => !g.demo && g.status !== 'donated' && (!ai.sameModel(g) || g.needsReview));
    if (!list.length) return toast('Nothing to tag — demo items are illustrations');
    e.target.disabled = true;
    let i = 0;
    for (const g of list) { e.target.textContent = `Tagging ${++i}/${list.length}…`; try { await retagGarment(g); } catch (err) { console.warn(err); } }
    e.target.textContent = 'Done'; toast(`Tagged ${list.length} items (your corrections were kept)`);
  };

  // weights
  $$('[data-w]', view).forEach((inp) => inp.oninput = async () => {
    const w = { ...DEFAULT_WEIGHTS, ...(state.settings.weights || {}) }; w[inp.dataset.w] = +inp.value / 100;
    $('#wv-' + inp.dataset.w, view).textContent = inp.value; await saveSettings({ weights: w });
  });
  $('#wreset', view).onclick = async () => { await saveSettings({ weights: null }); renderSettings(view, r); };
  view.querySelector('[name=explore]').onchange = (e) => saveSettings({ explore: e.target.value === '1' });
  for (const k of ['noRepeatDays', 'laundryDay', 'dailyTagCap']) view.querySelector(`[name=${k}]`).onchange = (e) => saveSettings({ [k]: +e.target.value });
  $('#bt', view).onchange = (e) => saveSettings({ briefTime: e.target.value });
  $('#bn', view).onchange = async (e) => {
    if (e.target.checked && 'Notification' in window) { const p = await Notification.requestPermission(); if (p !== 'granted') { e.target.checked = false; return toast('Notifications were blocked'); } }
    await saveSettings({ briefNotify: e.target.checked }); toast(e.target.checked ? 'Morning brief on' : 'Morning brief off');
  };

  // data
  $('#exp', view).onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Preparing…';
    try { const r = await backupToDrive(); toast(`Backup ready — ${r.items} pieces, ${(r.size / 1048576).toFixed(1)} MB${r.how === 'downloaded' ? '. Now upload it to drive.google.com' : ''}`, 5000); }
    catch (err) { toast('Backup failed: ' + (err.message || err)); }
    renderSettings(view, r);
  };
  $('#imp', view).onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let data; try { data = await readBackup(f); } catch (err) { return toast(err.message || 'Could not read that file'); }
    modal(`<h2>Restore or sync</h2><p class="small muted">Backup from ${esc(new Date(data.exportedAt).toLocaleString())} · ${data.garments?.length || 0} pieces · ${data.wear?.length || 0} wear logs.</p>
      <div class="opts mt"><button class="opt tall" data-mode="merge"><span class="oic">${icon('layers', 20)}</span><div><b>Merge (recommended)</b><span>Keep everything on this device and add what’s new; the newest edit of each piece wins.</span></div></button>
      <button class="opt tall" data-mode="replace"><span class="oic">${icon('refresh', 20)}</span><div><b>Replace everything</b><span>This device becomes an exact copy of the backup.</span></div></button></div><div id="impProg" class="mt"></div>`, {
      onMount: (m, close) => $$('[data-mode]', m).forEach((b) => b.onclick = async () => {
        $('#impProg', m).innerHTML = '<span class="spinner sm"></span> Syncing…';
        try { const res = b.dataset.mode === 'merge' ? await mergeFrom(data) : await replaceFrom(data); applyAppearance(); close(); toast(b.dataset.mode === 'merge' ? `Synced — ${res.added} new, ${res.updated} updated` : 'Backup restored'); go('#/today'); }
        catch (err) { $('#impProg', m).innerHTML = `<span class="pill bad">${esc(err.message || err)}</span>`; }
      }),
    });
  };
  $('#demo', view).onclick = () => runDemo(view, () => go('#/today'));
  const ud = $('#undemo', view); if (ud) ud.onclick = async () => { await removeDemo(); toast('Demo items removed'); renderSettings(view, r); };
  $('#wipe', view).onclick = async () => { if (await confirmBox('Delete every garment, photo, outfit, wear log, profile and setting on this device? This cannot be undone.', 'Delete everything')) { await clearAll(); await loadState(); applyAppearance({}); toast('All data deleted'); go('#/welcome'); } };
  bindInstallCard(view);
  if (r?.query?.get('install')) { $('#install', view).scrollIntoView(); openInstall(); }
  if (r?.query?.get('demo') || r?.query?.get('backup')) $('#data', view).scrollIntoView({ behavior: 'smooth' });
  if (r?.query?.get('ai')) $('#ai', view).scrollIntoView();
}

export async function runDemo(view, after) {
  const box = $('#demoProg', view);
  if (state.garments.some((g) => g.demo)) { if (!(await confirmBox('Reload the demo wardrobe? Existing demo items will be replaced (your own items stay).', 'Reload'))) return; await removeDemo(); }
  const msg = (p) => `<div class="small">Drawing garments and simulating 100 days of wear… ${Math.round(p * 100)}%</div>${bar(p)}`;
  box.innerHTML = msg(0);
  await loadDemo((p) => { box.innerHTML = msg(p); }, myWear());
  await inferWardrobePrior(activeGarments());
  await saveSettings({ onboarded: true });
  toast('Demo wardrobe loaded'); after?.();
}

export async function removeDemo() {
  const { del } = await import('../db.js');
  const ids = new Set(state.garments.filter((g) => g.demo).map((g) => g.id));
  for (const id of ids) { await del('garments', id); await del('images', id + ':cutout'); await del('images', id + ':original'); }
  for (const w of state.wear.filter((w) => ids.has(w.garmentId))) await del('wear', w.id);
  for (const o of state.outfits.filter((o) => o.items.every((i) => ids.has(i.garmentId)))) await del('outfits', o.id);
  await loadState();
}

async function blobToDataUrl(b) { return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
export async function exportBackup() {
  toast('Preparing backup…');
  const images = {};
  for (const im of await getAll('images')) images[im.key] = await blobToDataUrl(im.blob);
  const data = { app: 'smart-wardrobe', version: 2, exportedAt: new Date().toISOString(), settings: state.settings, garments: state.garments.map((g) => ({ ...g, embedding: g.embedding ? Array.from(g.embedding) : null })), outfits: state.outfits, wear: state.wear, feedback: state.feedback, corrections: state.corrections, images };
  const { saveBlob } = await import('../native.js');
  const r = await saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `wardrobe-backup-${new Date().toISOString().slice(0, 10)}.json`);
  if (r === 'saved') toast('Backup saved to Downloads');
}
async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'smart-wardrobe') throw new Error('Not a Smart Wardrobe backup');
  await clearAll();
  for (const k of ['garments', 'outfits', 'wear', 'feedback', 'corrections']) if (data[k]?.length) await putMany(k, data[k]);
  for (const [key, url] of Object.entries(data.images || {})) await put('images', { key, blob: await (await fetch(url)).blob() });
  await put('kv', { key: 'settings', value: data.settings || {} });
  await loadState();
  applyAppearance();
}
