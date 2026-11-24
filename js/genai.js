// Optional photoreal try-on with the user's OWN API key (Google Gemini or OpenAI). The key is stored only on
// this device; images go straight from the device to the chosen provider when the user taps Generate.
const LS = 'tryon-api';
export function apiSettings() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } }
export function saveApiSettings(s) { try { localStorage.setItem(LS, JSON.stringify(s)); } catch { /* private mode */ } }
export const PROVIDERS = {
  gemini: { label: 'Google Gemini', model: 'gemini-2.5-flash-image', keyUrl: 'https://aistudio.google.com/apikey', note: 'Image generation may need billing enabled on your Google AI account.' },
  openai: { label: 'OpenAI', model: 'gpt-image-1', keyUrl: 'https://platform.openai.com/api-keys', note: 'Paid per image on your OpenAI account.' },
};

const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

// images: [{ blob, name }] — person photo first, then the clothes sheet. Returns a Blob (the generated image).
export async function generateTryOn({ provider, key, model, prompt, images, signal }) {
  if (!key) throw new Error('Add your API key first');
  if (provider === 'openai') {
    const fd = new FormData();
    fd.append('model', model || PROVIDERS.openai.model);
    fd.append('prompt', prompt);
    fd.append('size', '1024x1536');
    fd.append('quality', 'medium');
    for (const im of images) fd.append('image[]', im.blob, im.name);
    const r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd, signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || `OpenAI error ${r.status}`);
    const data = j.data?.[0]?.b64_json; if (!data) throw new Error('No image returned');
    return await (await fetch('data:image/png;base64,' + data)).blob();
  }
  // Gemini
  const parts = [{ text: prompt }];
  for (const im of images) parts.push({ inline_data: { mime_type: im.blob.type || 'image/jpeg', data: await b64(im.blob) } });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || PROVIDERS.gemini.model)}:generateContent`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }), signal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Gemini error ${r.status}`);
  const out = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
  const d = out?.inlineData || out?.inline_data;
  if (!d) throw new Error(j.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || 'No image returned — try again or check the model name');
  return await (await fetch(`data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`)).blob();
}
