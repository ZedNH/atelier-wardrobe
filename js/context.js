// Context automation: calendar (.ics) parsing, dress-code inference, and free-text requests -> context object.
import { DRESS_CODES, OCCASIONS } from './enums.js';
import { state } from './db.js';
import { todayStr, addDays } from './weather.js';
import { garmentName } from './util.js';
import { myRegion } from './profile.js';
import { normalizeBangla } from './i18n.js';

const RULES = [
  [/black tie|white tie|gala|wedding|opera|ball\b|award/i, 'formal', 'formal event'],
  [/cocktail|reception|launch party|engagement/i, 'cocktail', 'evening reception'],
  [/client|board|interview|investor|pitch|presentation|court|conference|keynote|review with/i, 'business', 'client-facing / high stakes'],
  [/gym|workout|run\b|running|yoga|pilates|crossfit|training|tennis|football|hike|swim|cycling/i, 'active', 'activity'],
  [/dinner|date\b|restaurant|theatre|theater|concert/i, 'date', 'evening out'],
  [/party|birthday|drinks|bar\b|pub/i, 'smart_casual', 'social'],
  [/meeting|standup|stand-up|sync|1:1|one-on-one|office|workshop|team|work/i, 'work', 'workday'],
  [/brunch|coffee|lunch|errand|groceries|park|picnic|movie|shopping|weekend|beach/i, 'casual', 'casual plans'],
  [/home|lounge|wfh|netflix|rest/i, 'lounge', 'at home'],
];

// South Asian occasions (checked first when the profile region is South Asia; English, Banglish and Bangla)
const SA_RULES = [
  [/\beid\b|ঈদ|eid ul|chand raat/i, 'eid', 'Eid'],
  [/boishakh|baishakh|bôishakh|pohela|noboborsho|বৈশাখ|নববর্ষ/i, 'boishakh', 'Pohela Boishakh'],
  [/holud|haldi|mehndi|mehendi|হলুদ|মেহেদি/i, 'holud', 'holud / mehndi'],
  [/biye|bie\b|wedding|walima|bou ?bhat|reception|akdh|বিয়ে|বৌভাত|ওয়ালিমা/i, 'biye', 'wedding'],
  [/puja|pujo|durga|diwali|kali puja|পূজা|পুজো/i, 'puja', 'puja'],
  [/jumm?a|friday prayer|namaz|mosque|জুমা|নামাজ/i, 'jummah', 'Jummah'],
];

export function inferOccasion(title = '', attendees = 0) {
  if (myRegion() === 'sa') for (const [re, occ, why] of SA_RULES) if (re.test(title)) return { occasion: occ, why };
  for (const [code, occ] of Object.entries(DRESS_CODES)) if (new RegExp(`\\b${code}\\b`, 'i').test(title)) return { occasion: occ, why: `"${code}" dress code` };
  for (const [re, occ, why] of RULES) if (re.test(title)) {
    if (occ === 'work' && attendees >= 8) return { occasion: 'business', why: 'large meeting' };
    return { occasion: occ, why };
  }
  return { occasion: 'casual', why: 'no dress-code hints' };
}

function unfold(text) { return text.replace(/\r?\n[ \t]/g, ''); }
function parseDate(v) {
  // 20261124T090000Z | 20261124T090000 | 20261124
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { date: `${y}-${mo}-${d}`, allDay: true, time: null };
  const dt = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))) : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  return { date: todayStr(dt), allDay: false, time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` };
}

export function parseICS(text) {
  const out = [];
  const blocks = unfold(text).split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const body = b.split('END:VEVENT')[0];
    const get = (k) => { const m = body.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, 'm')); return m ? m[1].trim() : ''; };
    const start = parseDate(get('DTSTART'));
    if (!start) continue;
    const title = get('SUMMARY').replace(/\\,/g, ',').replace(/\\n/g, ' ');
    const attendees = (body.match(/^ATTENDEE/gm) || []).length;
    const inf = inferOccasion(title + ' ' + get('DESCRIPTION').slice(0, 200), attendees);
    out.push({ id: (get('UID') || title + start.date + start.time).slice(0, 80), title, date: start.date, time: start.time, allDay: start.allDay, attendees, occasion: inf.occasion, why: inf.why, location: get('LOCATION') });
  }
  return out;
}

export function eventsOn(date) {
  return (state.settings.events || []).filter((e) => e.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Free-text request -> structured context object (deterministic parser, works offline, free).
export function parseRequest(text, base = {}) {
  text = normalizeBangla(text);
  const t = text.toLowerCase();
  const ctx = { ...base }; const notes = [];
  const inf = inferOccasion(t);
  if (inf.why !== 'no dress-code hints') { ctx.occasion = inf.occasion; notes.push(`${OCCASIONS[inf.occasion].label} (${inf.why})`); }
  if (/tomorrow/.test(t)) { ctx.date = addDays(todayStr(), 1); notes.push('tomorrow'); }
  const wd = DAYS.findIndex((d) => t.includes(d));
  if (wd >= 0) { const now = new Date(); const diff = (wd - now.getDay() + 7) % 7 || 7; ctx.date = addDays(todayStr(), diff); notes.push(DAYS[wd]); }
  if (/cold|chilly|freez|snow|winter|windy|air.?con|ac\b/.test(t)) { ctx.tempShift = -7; notes.push('colder than forecast'); }
  if (/hot|warm|beach|summer|heat|humid/.test(t)) { ctx.tempShift = 6; notes.push('warmer than forecast'); }
  if (/rain|wet|storm/.test(t)) { ctx.rainOverride = 85; notes.push('rain-proof'); }
  if (/indoor|inside|office all day/.test(t)) { ctx.ignoreWeather = true; notes.push('indoors'); }
  if (/dress up|fancy|sharp|impress/.test(t)) { ctx.occasion = ctx.occasion && OCCASIONS[ctx.occasion].f >= 4 ? ctx.occasion : 'business'; notes.push('dressed up'); }
  if (/comfy|comfortable|relaxed|lazy/.test(t) && !ctx.occasion) { ctx.occasion = 'casual'; notes.push('comfortable'); }
  // "around my navy blazer" / "with the white sneakers"
  const m = t.match(/(?:around|with|wear|wearing|using)\s+(?:my|the|a)?\s*([a-z\- ]{3,40})/);
  if (m) {
    const GENERIC = ['and', 'for', 'then', 'that', 'something', 'what', 'should', 'wear', 'tomorrow', 'today', 'tonight', 'office', 'work', 'dinner', 'evening', 'party', 'date', 'cold', 'hot', 'humid', 'rain', 'casual', 'comfortable', 'dress', 'up', 'outfit', 'look'];
    const words = m[1].split(/\s+/).filter((w) => w.length > 2 && !GENERIC.includes(w));
    let best = null, bs = 0;
    for (const g of state.garments.filter((x) => x.status === 'active')) {
      const name = (garmentName(g) + ' ' + g.subtype + ' ' + (g.colors?.map((c) => c.name).join(' ') || '')).toLowerCase();
      const s = words.filter((w) => name.includes(w)).length;
      if (s > bs) { bs = s; best = g; }
    }
    if (best && bs >= 1) ctx.mustInclude = [best.id];
  }
  return { ctx, notes };
}
