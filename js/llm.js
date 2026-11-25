// "AI brain" with your own key: Claude, ChatGPT (OpenAI), Gemini, Grok (xAI), Z.ai (GLM), DeepSeek or OpenRouter.
// The stylist sends a compact text list of your clothes (no photos) plus the day's context, and the model picks
// outfits by item id. Keys stay on this device and go only to the provider you chose. In the Android app the
// request goes through the native layer (no browser CORS limits).
import { activeGarments } from './db.js';
import { profile, myRegion } from './profile.js';
import { primaryColor } from './color.js';
import { OCCASIONS } from './enums.js';
import { scoreOutfit, dressCodeOk, outfitKey } from './recommender.js';
import { garmentName } from './util.js';

export const LLM_PROVIDERS = {
  claude: { label: 'Claude (Anthropic)', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Best taste and reasoning. You can switch to claude-sonnet-5-5 or claude-haiku-5-5 for lower cost.' },
  openai: { label: 'ChatGPT (OpenAI)', model: 'gpt-5-mini', keyUrl: 'https://platform.openai.com/api-keys', note: 'Any chat model name from your OpenAI account works.' },
  gemini: { label: 'Gemini (Google)', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/app/apikey', note: 'Google AI Studio has a free tier.' },
  grok: { label: 'Grok (xAI)', model: 'grok-4', keyUrl: 'https://console.x.ai/', note: 'Any Grok model name from your xAI account works.' },
  zai: { label: 'Z.ai (GLM)', model: 'glm-4.6', keyUrl: 'https://z.ai/manage-apikey/apikey-list', note: 'Zhipu GLM models — any GLM model name from your Z.ai account works (e.g. glm-4.6, glm-4.5-air).' },
  deepseek: { label: 'DeepSeek', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys', note: 'Low cost.' },
  openrouter: { label: 'OpenRouter (many models)', model: 'openrouter/auto', keyUrl: 'https://openrouter.ai/keys', note: 'One key for hundreds of models — set any model id, e.g. anthropic/claude-sonnet-5-5.' },
};
const OPENAI_STYLE = { openai: 'https://api.openai.com/v1/chat/completions', grok: 'https://api.x.ai/v1/chat/completions', deepseek: 'https://api.deepseek.com/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions', zai: 'https://api.z.ai/api/paas/v4/chat/completions' };

const KEY = 'ai-brain';
export function brainSettings() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export function saveBrainSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage off */ } }
export const brainOn = () => { const s = brainSettings(); return !!(s.key && s.provider && s.enabled !== false); };

// ---------- transport: native in the Android app, fetch on the web ----------
let seq = 0; const waiting = new Map();
window.__httpDone = (id, status, body) => { const w = waiting.get(id); if (w) { waiting.delete(id); w({ status, body }); } };
async function request(method, url, headers, body, timeoutMs = 90000) {
  const B = window.AndroidBridge;
  if (B?.httpRequest) {
    const id = 'h' + ++seq;
    const p = new Promise((res) => waiting.set(id, res));
    B.httpRequest(id, method, url, JSON.stringify(headers), body == null ? null : JSON.stringify(body));
    const r = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('The AI took too long — try again')), timeoutMs))]);
    if (r.status === 0) throw new Error(r.body || 'Network error');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: () => JSON.parse(r.body || '{}') };
  }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method, headers: method === 'GET' ? headers : { 'Content-Type': 'application/json', ...headers }, body: body == null ? undefined : JSON.stringify(body), signal: ctl.signal });
    return { ok: r.ok, status: r.status, json: () => r.json() };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI took too long — try again' : 'Could not reach the AI provider (offline, or the website blocks this provider — the Android app always works)');
  } finally { clearTimeout(t); }
}
const post = (url, headers, body, ms) => request('POST', url, headers, body, ms);
const errText = async (r) => { try { const j = await r.json(); return j.error?.message || j.message || JSON.stringify(j).slice(0, 200); } catch { return 'HTTP ' + r.status; } };

export async function callLLM({ system, user, json = true }, s = brainSettings()) {
  const prov = s.provider || 'claude'; const model = s.model || LLM_PROVIDERS[prov].model; const key = s.key;
  if (!key) throw new Error('Add an API key in Settings → AI stylist brain');
  if (prov === 'claude') {
    const r = await post('https://api.anthropic.com/v1/messages', {
      'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    }, { model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }], fallbacks: 'default' });
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json();
    if (j.stop_reason === 'refusal') throw new Error('The AI declined this request — try rephrasing');
    return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }
  if (prov === 'gemini') {
    const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, {
      systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: json ? { responseMimeType: 'application/json' } : {},
    });
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json();
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }
  const url = OPENAI_STYLE[prov]; if (!url) throw new Error('Unknown provider');
  const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (json && !['openrouter', 'zai'].includes(prov)) body.response_format = { type: 'json_object' };
  const r = await post(url, { Authorization: 'Bearer ' + key, ...(prov === 'openrouter' ? { 'X-Title': 'Atelier wardrobe' } : {}) }, body);
  if (!r.ok) throw new Error(await errText(r));
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

export async function testBrain(s) {
  const t = await callLLM({ system: 'Reply with JSON only.', user: 'Return {"ok": true}.' }, { ...s, enabled: true });
  return /ok/i.test(t);
}

// ---------- the stylist ----------
const line = (g) => `${g.id} | ${garmentName(g)} | ${g.subtype} | ${g.category} | ${primaryColor(g).name} | pattern ${g.pattern || 'solid'} | formality ${g.formality || 3}/5 | warmth ${g.warmth ?? '?'}${g.favorite ? ' | favorite' : ''}`;

export async function aiStylist(question, { weather, date, occasionGuess, history = [] } = {}) {
  const pool = activeGarments().filter((g) => !g.needsReview && (!g.laundry || ['clean', 'worn'].includes(g.laundry.state))).slice(0, 260);
  const byId = new Map(pool.map((g) => [g.id, g]));
  const p = profile();
  const me = [p.gender && `gender: ${p.gender}`, p.wear && `clothing: ${p.wear === 'all' ? 'menswear and womenswear' : p.wear + 'swear'}`, p.bodyShape && `body shape: ${p.bodyShape}`, p.seasonName && `color season: ${p.seasonName}`, p.height && `height: ${p.height} cm`,
    myRegion() === 'sa' && 'lives in South Asia (Bangladesh) — traditional wear is normal for festivals', p.modest && 'prefers modest dressing'].filter(Boolean).join('; ');
  const wx = weather ? `${Math.round(weather.feels)}°C feels-like, ${weather.desc || ''}, ${Math.round(weather.rainProb || 0)}% rain${weather.humidity != null ? `, ${Math.round(weather.humidity)}% humidity` : ''}` : 'unknown';
  const system = `You are an expert personal fashion stylist inside a wardrobe app. You may ONLY use clothes from the user's closet list, referenced by their exact id.
Rules: dress for the occasion like a real stylist — gym/workout = athletic wear only (no jeans, chinos, shirts or leather shoes); work = no shorts, joggers, graphic tees or flip-flops; formal/wedding = no t-shirts, jeans or sneakers.
A complete outfit is: one top + one bottom (or one dress / full traditional outfit) + footwear, plus outerwear when it is cold or rainy, plus 1-2 fitting accessories (watch, belt, sunglasses, bag…) when the closet has them.
Respect the weather, the user's colors and body shape. Never repeat the same outfit twice in one answer.
Answer in the language the user writes in (English, Bangla or Banglish).
Return ONLY JSON: {"reply": "short friendly answer (max 80 words)", "outfits": [{"ids": ["id1","id2",...], "why": "one sentence"}]} — 0 to 3 outfits. Use "outfits": [] for questions that need no outfit.`;
  const user = `Date: ${date}. Weather: ${wx}. Likely occasion: ${OCCASIONS[occasionGuess]?.label || 'not stated'}.
About me: ${me || 'not set'}.
${history.length ? `Earlier in this chat: ${history.slice(-4).join(' / ')}\n` : ''}My closet (id | name | type | category | color | pattern | formality | warmth):
${pool.map(line).join('\n')}

My request: ${question}`;
  const text = await callLLM({ system, user });
  let j;
  try { j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { const m = text.match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : { reply: text, outfits: [] }; }
  const occ = OCCASIONS[occasionGuess] || OCCASIONS.casual;
  const ctx = { occasion: occasionGuess || 'casual', date, weather, ignoreWeather: !weather };
  const seen = new Set(); const outfits = [];
  for (const o of (j.outfits || []).slice(0, 3)) {
    const items = [...new Set(o.ids || o.items || [])].map((id) => byId.get(id)).filter(Boolean).filter((g) => dressCodeOk(g, occ) || !occasionGuess);
    if (items.length < 2) continue;
    const k = outfitKey(items); if (seen.has(k)) continue; seen.add(k);
    outfits.push({ o: { items, ...scoreOutfit(items, ctx), rationale: o.why || '', ai: true }, ctx });
  }
  return { reply: String(j.reply || ''), outfits };
}

// ---------- which models does this key have? ----------
// Known models are shown straight away; with a key, the provider's own model list is fetched so new ones
// (e.g. a newer GLM, GPT or Claude) appear without an app update.
export const KNOWN_MODELS = {
  claude: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-opus-5', 'claude-sonnet-5'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  grok: ['grok-4', 'grok-4-fast', 'grok-3-mini'],
  zai: ['glm-5.3', 'glm-4.6', 'glm-4.5', 'glm-4.5-air', 'glm-4.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: ['openrouter/auto', 'anthropic/claude-sonnet-5-5', 'openai/gpt-5-mini', 'google/gemini-2.5-flash', 'z-ai/glm-4.6'],
};
const MODEL_URL = {
  openai: 'https://api.openai.com/v1/models', grok: 'https://api.x.ai/v1/models', deepseek: 'https://api.deepseek.com/models',
  openrouter: 'https://openrouter.ai/api/v1/models', zai: 'https://api.z.ai/api/paas/v4/models',
};
// keep chat/text models only (no embeddings, audio, image, moderation…)
const CHATTY = (id) => !/embed|whisper|tts|audio|dall-e|image|moderation|realtime|transcribe|search|davinci|babbage|-vision-preview|rerank|computer-use/i.test(id);
export async function listModels(s = brainSettings()) {
  const prov = s.provider || 'claude'; const key = s.key;
  if (!key && prov !== 'openrouter') return { models: KNOWN_MODELS[prov] || [], live: false };
  let ids = [];
  if (prov === 'claude') {
    const r = await request('GET', 'https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, null, 30000);
    if (!r.ok) throw new Error(await errText(r));
    ids = ((await r.json()).data || []).map((m) => m.id);
  } else if (prov === 'gemini') {
    const r = await request('GET', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key }, null, 30000);
    if (!r.ok) throw new Error(await errText(r));
    ids = ((await r.json()).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  } else {
    const r = await request('GET', MODEL_URL[prov], key ? { Authorization: 'Bearer ' + key } : {}, null, 30000);
    if (!r.ok) throw new Error(await errText(r));
    const j = await r.json(); ids = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
  }
  ids = [...new Set(ids.filter(CHATTY))];
  if (!ids.length) return { models: KNOWN_MODELS[prov] || [], live: false };
  return { models: sortModels(ids), live: true };
}
// newest / biggest version first: glm-5.3 before glm-4.6, gpt-5 before gpt-4.1
// version = first small number (glm-5.3 -> 5.3, gpt-4.1 -> 4.1); 4+ digit dates like -2603 are ignored
const verOf = (id) => { const m = id.replace(/^[^/]*\//, '').match(/(?:^|[^\d])(\d{1,2}(?:\.\d{1,2})?)(?!\d)/); return m ? parseFloat(m[1]) : 0; };
export const sortModels = (ids) => ids.slice().sort((a, b) => (b === 'openrouter/auto') - (a === 'openrouter/auto') || (a.split('/')[0] !== b.split('/')[0] && a.includes('/') && b.includes('/') ? a.localeCompare(b) : verOf(b) - verOf(a) || a.length - b.length || a.localeCompare(b)));
// For GLM, auto-pick the newest general model the key can use
export function bestModel(prov, ids) {
  if (prov === 'zai') return ids.filter((x) => /^glm-\d/i.test(x) && !/v$|vision|air|flash|x$/i.test(x)).sort((a, b) => verOf(b) - verOf(a))[0] || ids[0];
  return null;
}
