// Care label: photograph the label → OCR reads fibres and instructions → confirm the symbols → saved on the item.
import { saveGarment } from '../db.js';
import { FABRICS } from '../enums.js';
import { fileToCanvas, scaleCanvas } from '../vision.js';
import { readLabel, parseCare, CARE, careSymbol, careLabel } from '../carelabel.js';
import { deriveWarmth, deriveSeason, esc } from '../util.js';
import { $, $$, modal, toast, icon, haptic } from './dom.js';

const FIBRE_NAME = { cotton: 'Cotton', linen: 'Linen', wool: 'Wool', silk: 'Silk', viscose: 'Viscose', polyester: 'Polyester', elastane: 'Elastane', nylon: 'Nylon', acrylic: 'Acrylic', leather: 'Leather' };
export const fibreText = (f) => (f || []).map((x) => (x.pct ? `${x.pct}% ` : '') + (FIBRE_NAME[x.name] || x.name)).join(', ');

// Card on the item page
export function careCardHtml(g) {
  const c = g.care;
  if (!c) return `<div class="card mt care-card" id="careCard"><div class="row between"><b>${icon('laundry', 16)} Care label</b><span class="pill">New</span></div>
    <p class="small muted">Photograph the washing label inside — the fabric and washing rules are filled in for you.</p>
    <button class="btn small primary" id="careScan">${icon('camera', 14)} Scan care label</button></div>`;
  const syms = Object.keys(CARE).filter((k) => c[k]).map((k) => `<div class="care-s" title="${esc(careLabel(k, c[k]))}">${careSymbol(k, c[k], 32)}<span>${esc(careLabel(k, c[k]))}</span></div>`).join('');
  return `<div class="card mt care-card" id="careCard"><div class="row between"><b>${icon('laundry', 16)} Care</b><button class="btn small ghost" id="careScan">${icon('pen', 14)} Edit / rescan</button></div>
    ${c.fibres?.length ? `<p class="small" style="margin:6px 0">${esc(fibreText(c.fibres))}</p>` : ''}
    <div class="care-row">${syms || '<span class="small muted">No symbols saved</span>'}</div>
    ${c.extras?.length ? `<p class="tiny muted mt">${c.extras.map(esc).join(' · ')}</p>` : ''}</div>`;
}

export function bindCareCard(view, g, rerender) {
  const b = $('#careScan', view); if (b) b.onclick = () => careFlow(g, rerender);
}

export function careFlow(g, done) {
  modal(`<h2>Care label</h2><p class="small muted">Take a sharp, close photo of the whole label. It is read on your phone — nothing is uploaded.</p>
    <div id="cStep"><div class="row mt"><button class="btn primary" id="cCam">${icon('camera', 16)} Take photo</button><label class="btn">${icon('image', 16)} Choose photo<input type="file" accept="image/*" hidden id="cFile"></label>${g.care ? `<button class="btn ghost" id="cSkip">Edit without scanning</button>` : ''}</div></div>`, {
    onMount: (m, close) => {
      const step = $('#cStep', m);
      const read = async (canvas) => {
        step.innerHTML = `<img class="care-photo" src="${scaleCanvas(canvas, 700).toDataURL('image/jpeg', 0.8)}" alt=""><div class="row mt"><span class="spinner sm"></span><span class="small" id="cMsg">Reading the label…</span></div><div class="bar mt"><i id="cBar" style="width:5%"></i></div>`;
        try {
          const r = await readLabel(canvas, (s, p) => {
            const msg = $('#cMsg', m), bar = $('#cBar', m); if (!msg) return;
            msg.textContent = /load|download|initializ/i.test(s) ? 'Getting the label reader ready (one-time, ~11 MB)…' : 'Reading the label…';
            bar.style.width = Math.round(10 + p * 90) + '%';
          });
          const parsed = parseCare(r.text);
          confirmStep(step, { ...(g.care || {}), ...strip(parsed), fibres: parsed.fibres.length ? parsed.fibres : g.care?.fibres || [], extras: parsed.extras.length ? parsed.extras : g.care?.extras || [] }, r.text, g, close, done);
        } catch (e) {
          step.innerHTML = `<p class="pill bad" style="white-space:normal">${esc(e.message || String(e))}</p><p class="small muted mt">You can still pick the symbols yourself.</p><button class="btn mt" id="cMan">Pick symbols</button>`;
          $('#cMan', m).onclick = () => confirmStep(step, g.care || { fibres: [] }, '', g, close, done);
        }
      };
      $('#cCam', m).onclick = async () => { const { cameraModal } = await import('./tryon.js'); cameraModal({ facing: 'environment', timer: 0, title: 'Care label', guide: 'label' }, read); };
      $('#cFile', m).onchange = async (e) => { const f = e.target.files[0]; if (f) read(await fileToCanvas(f, 2000)); };
      const sk = $('#cSkip', m); if (sk) sk.onclick = () => confirmStep(step, g.care, '', g, close, done);
    },
  });
}
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v))));

function confirmStep(step, care, text, g, close, done) {
  care = { ...care };
  const found = Object.keys(CARE).filter((k) => care[k]).length;
  step.innerHTML = `${text ? `<p class="small"><span class="pill ${found ? 'good' : 'warn'}">${found ? `Found ${found} care rule${found > 1 ? 's' : ''}${care.fibres?.length ? ' and the fabric' : ''}` : care.fibres?.length ? 'Found the fabric — tap the symbols on your label' : 'Couldn’t read much — tap the symbols on your label'}</span></p>` : ''}
    <label class="f mt">Fabric (from the label)<input id="cFib" value="${esc(fibreText(care.fibres))}" placeholder="e.g. 95% Cotton, 5% Elastane"></label>
    ${Object.entries(CARE).map(([k, grp]) => `<div class="care-grp"><span class="tiny muted">${grp.label}</span><div class="care-opts" data-g="${k}">${grp.opts.map(([v, l]) => `<button type="button" class="care-opt ${care[k] === v ? 'on' : ''}" data-v="${v}" title="${esc(l)}">${careSymbol(k, v, 30)}<span>${esc(l)}</span></button>`).join('')}</div></div>`).join('')}
    ${care.extras?.length ? `<p class="tiny muted">${care.extras.map(esc).join(' · ')}</p>` : ''}
    ${text ? `<details class="mt"><summary class="tiny muted">Text read from the label</summary><pre class="tiny care-text">${esc(text.trim() || '(nothing)')}</pre></details>` : ''}
    <div class="row end mt2"><button class="btn primary" id="cSave">${icon('check', 16)} Save care</button></div>`;
  $$('.care-opts', step).forEach((row) => row.addEventListener('click', (e) => {
    const b = e.target.closest('.care-opt'); if (!b) return; haptic(6);
    const k = row.dataset.g; const on = b.classList.contains('on');
    $$('.care-opt', row).forEach((x) => x.classList.remove('on'));
    if (on) delete care[k]; else { b.classList.add('on'); care[k] = b.dataset.v; }
  }));
  $('#cSave', step).onclick = async () => {
    care.fibres = parseFibreInput($('#cFib', step).value);
    const main = care.fibres[0]?.name;
    const fab = { cotton: 'cotton', linen: 'linen', wool: 'wool', silk: 'silk', leather: 'leather' }[main] || (main ? 'synthetic' : null);
    g.care = { ...care, scannedAt: Date.now() };
    if (fab && FABRICS.includes(fab) && g.attrSource?.fabric !== 'user' && !(g.fabric === 'denim' && main === 'cotton') && !(g.fabric === 'knit')) {
      g.fabric = fab; g.attrSource = { ...(g.attrSource || {}), fabric: 'label' };
      if (g.attrSource.warmth !== 'user') g.warmth = deriveWarmth(g.subtype, g.fabric, g.category);
      if (g.attrSource.season !== 'user') g.season = deriveSeason(g.warmth, g.fabric, g.category);
      g.lowConfidence = (g.lowConfidence || []).filter((x) => x !== 'fabric');
    }
    await saveGarment(g); close(); toast('Care saved' + (fab ? ` — fabric set to ${g.fabric}` : '')); done?.();
  };
}

function parseFibreInput(s) {
  const p = parseCare(s);
  if (p.fibres.length) return p.fibres;
  return s.trim() ? [{ name: s.trim().toLowerCase(), pct: null }] : [];
}
