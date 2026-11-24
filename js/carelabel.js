// Care label reader: free on-device OCR (Tesseract.js) reads the label text — fibres, temperature and
// instructions — and turns it into care settings. The pictograms themselves are confirmed with one tap each.
import { scaleCanvas, makeCanvas } from './vision.js';

const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let workerP = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load the label reader (offline?)'));
    document.head.appendChild(s);
  });
}

export async function getOCR(onProgress) {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(TESS);
      return window.Tesseract.createWorker('eng', 1, {
        logger: (m) => { if (m.status && typeof m.progress === 'number') onProgress?.(m.status, m.progress); },
      });
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

// grey, contrast-stretched, upscaled copy: labels are small, shiny and often curved
function prep(src) {
  const s = scaleCanvas(src, 1600);
  const c = makeCanvas(s.width, s.height); const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(s, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height); const p = d.data;
  let lo = 255, hi = 0; const g = new Uint8ClampedArray(p.length / 4);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; g[j] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 255 / Math.max(30, hi - lo);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = (g[j] - lo) * k; p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(d, 0, 0);
  return c;
}

export async function readLabel(canvas, onProgress) {
  const w = await getOCR(onProgress);
  const { data } = await w.recognize(prep(canvas));
  return { text: data.text || '', confidence: (data.confidence || 0) / 100 };
}

// ---------------- text → care ----------------
const FIBRES = [
  ['cotton', /cotton|algod[oó]n|coton|baumwolle|cotone/], ['linen', /linen|lino|lin\b|leinen/], ['wool', /wool|lana|laine|wolle|merino|cashmere|cachemire/],
  ['silk', /silk|seda|soie|seide/], ['viscose', /viscose|rayon|viscosa|modal|lyocell|tencel|bamboo/], ['polyester', /polyester|poli[eé]ster/],
  ['elastane', /elastane|spandex|lycra|elastan/], ['nylon', /nylon|polyamide|poliamida/], ['acrylic', /acrylic|acr[ií]lico/], ['leather', /leather|cuero|cuir|leder/],
];
// app fabric for the main fibre
const FIBRE_TO_FABRIC = { cotton: 'cotton', linen: 'linen', wool: 'wool', silk: 'silk', viscose: 'synthetic', polyester: 'synthetic', elastane: 'synthetic', nylon: 'synthetic', acrylic: 'synthetic', leather: 'leather' };

export function parseCare(raw) {
  const t = ' ' + raw.toLowerCase().replace(/[|]/g, 'l').replace(/\s+/g, ' ') + ' ';
  const care = { fibres: [] };
  // "95% cotton 5% elastane" and "cotton 95%"
  for (const [name, rx] of FIBRES) {
    const a = t.match(new RegExp('(\\d{1,3})\\s*%\\s*(?:\\w+\\s)?(?:' + rx.source + ')'));
    const b = t.match(new RegExp('(?:' + rx.source + ')\\s*[:\\-]?\\s*(\\d{1,3})\\s*%'));
    const pct = +(a?.[1] || b?.[1] || 0);
    if (pct > 0 && pct <= 100) care.fibres.push({ name, pct });
    else if (rx.test(t)) care.fibres.push({ name, pct: null });
  }
  care.fibres.sort((x, y) => (y.pct || 0) - (x.pct || 0));
  const main = care.fibres[0];
  if (main) care.fabric = FIBRE_TO_FABRIC[main.name];
  if (/denim/.test(t)) care.fabric = 'denim';

  const temp = t.match(/(\d{2})\s*[°º*o]?\s*c\b/); const tC = temp ? +temp[1] : null;
  if (/do not wash|don'?t wash|no lavar|ne pas laver|nicht waschen/.test(t)) care.wash = 'none';
  else if (/hand ?wash|lavar a mano|lavage [àa] la main|handw[äa]sche/.test(t)) care.wash = 'hand';
  else if (tC && [30, 40, 60, 95].includes(tC)) care.wash = tC >= 60 ? 'machine60' : tC >= 40 ? 'machine40' : 'machine30';
  else if (/cold|cool|30/.test(t) && /wash/.test(t)) care.wash = 'machine30';
  else if (/machine ?wash|warm wash/.test(t)) care.wash = /warm/.test(t) ? 'machine40' : 'machine30';

  if (/do not bleach|don'?t bleach|no bleach|no usar lej[ií]a|non-chlorine bleach only/.test(t)) care.bleach = /non-chlorine/.test(t) ? 'nonChlorine' : 'no';
  else if (/bleach/.test(t)) care.bleach = 'any';

  if (/do not tumble|don'?t tumble|no secadora|no tumble/.test(t)) care.dry = /flat/.test(t) ? 'flat' : 'line';
  else if (/dry flat|lay flat/.test(t)) care.dry = 'flat';
  else if (/line dry|hang (to )?dry|drip dry/.test(t)) care.dry = 'line';
  else if (/tumble dry (low|cool|gentle)/.test(t)) care.dry = 'tumbleLow';
  else if (/tumble dry/.test(t)) care.dry = 'tumble';

  if (/do not iron|don'?t iron|no planchar/.test(t)) care.iron = 'no';
  else if (/iron (on )?(low|cool)|cool iron|low heat iron|warm iron/.test(t)) care.iron = /warm/.test(t) ? 'med' : 'low';
  else if (/iron (on )?(medium|med)|moderate iron/.test(t)) care.iron = 'med';
  else if (/hot iron|iron (on )?high/.test(t)) care.iron = 'high';

  if (/dry clean only|professional(ly)? dry clean/.test(t)) { care.dryClean = 'only'; care.wash = care.wash || 'none'; }
  else if (/do not dry clean|don'?t dry clean/.test(t)) care.dryClean = 'no';
  else if (/dry clean/.test(t)) care.dryClean = 'ok';

  const extras = [];
  if (/inside out/.test(t)) extras.push('Wash inside out');
  if (/(similar|like) colou?rs?/.test(t)) extras.push('Wash with similar colors');
  if (/separately/.test(t)) extras.push('Wash separately');
  if (/do not wring/.test(t)) extras.push('Do not wring');
  if (/reshape/.test(t)) extras.push('Reshape while damp');
  care.extras = extras;
  return care;
}

// ---------------- the five care symbol groups ----------------
export const CARE = {
  wash: { label: 'Wash', opts: [['machine30', 'Machine 30°'], ['machine40', 'Machine 40°'], ['machine60', 'Machine 60°'], ['hand', 'Hand wash'], ['none', 'Do not wash']] },
  bleach: { label: 'Bleach', opts: [['any', 'Any bleach'], ['nonChlorine', 'Non-chlorine only'], ['no', 'No bleach']] },
  dry: { label: 'Dry', opts: [['tumble', 'Tumble dry'], ['tumbleLow', 'Tumble, low heat'], ['line', 'Hang to dry'], ['flat', 'Dry flat'], ['noTumble', 'No tumble dryer']] },
  iron: { label: 'Iron', opts: [['low', 'Iron cool'], ['med', 'Iron warm'], ['high', 'Iron hot'], ['no', 'Do not iron']] },
  dryClean: { label: 'Dry clean', opts: [['ok', 'Dry clean OK'], ['only', 'Dry clean only'], ['no', 'Do not dry clean']] },
};

const dots = (n, y = 15) => Array.from({ length: n }, (_, i) => `<circle cx="${12 + (i - (n - 1) / 2) * 3.2}" cy="${y}" r=".9" fill="currentColor"/>`).join('');
const X = '<path d="M4 4 20 20M20 4 4 20"/>';
const TUB = '<path d="M3 8.5 5 19h14l2-10.5"/><path d="M3 8.5c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/>';
const SQ = '<rect x="4" y="4" width="16" height="16" rx="1.5"/>';
const IRON = '<path d="M3 18h17.5l-1.6-6.6A3 3 0 0 0 16 9H8.5"/><path d="M7.5 9V6.5h6"/>';
export function careSymbol(group, v, size = 34) {
  let b = '';
  if (group === 'wash') {
    b = TUB;
    if (v === 'hand') b += '<path d="M10 16.5v-3.2c0-.6.9-.6.9 0V15m0-2.2v-.8c0-.6.9-.6.9 0v2.8m0-2.3c0-.6.9-.6.9 0v2.4m0-1.6c0-.6.9-.6.9 0v1.9c0 1.6-1 2.6-2.4 2.6-1 0-1.6-.5-2.2-1.4l-.9-1.5c-.3-.5.4-.9.8-.5l.6.6"/>';
    else if (v === 'none') b += X;
    else b += `<text x="12" y="17.2" text-anchor="middle" font-size="6.4" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${v.replace('machine', '')}</text>`;
  } else if (group === 'bleach') {
    b = '<path d="M12 4 21 19.5H3Z"/>' + (v === 'nonChlorine' ? '<path d="M10.5 9.5 7 17.5M14 9.5l-3.5 8"/>' : v === 'no' ? X : '');
  } else if (group === 'dry') {
    b = SQ + ({ tumble: '<circle cx="12" cy="12" r="5.5"/>', tumbleLow: '<circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>', line: '<path d="M4 9c4-3.5 12-3.5 16 0"/>', flat: '<path d="M7.5 12h9"/>', noTumble: '<circle cx="12" cy="12" r="5.5"/>' + X }[v] || '');
  } else if (group === 'iron') {
    b = IRON + ({ low: dots(1), med: dots(2), high: dots(3), no: X }[v] || '');
  } else if (group === 'dryClean') {
    b = '<circle cx="12" cy="12" r="8"/>' + (v === 'no' ? X : `<text x="12" y="15.5" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">P</text>`) + (v === 'only' ? '<path d="M6 21h12"/>' : '');
  }
  return `<svg class="ic care-sym" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
}
export const careLabel = (group, v) => CARE[group]?.opts.find(([k]) => k === v)?.[1] || '';

// short laundry hint used by the laundry list: "Hand wash · hang dry"
export function careHint(care) {
  if (!care) return '';
  if (care.dryClean === 'only') return 'Dry clean only';
  const bits = [];
  if (care.wash) bits.push(careLabel('wash', care.wash));
  if (care.dry && care.dry !== 'tumble') bits.push(careLabel('dry', care.dry).toLowerCase());
  if (care.bleach === 'no') bits.push('no bleach');
  return bits.join(' · ');
}
