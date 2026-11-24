// Free weather via Open-Meteo (no API key, no account). Cached locally per hour.
import { kvGet, kvSet, state } from './db.js';

const WMO = {
  0: ['Clear', '☀️'], 1: ['Mostly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Fog', '🌫️'], 51: ['Drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Drizzle', '🌦️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'], 61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'], 71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'], 80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'], 86: ['Snow showers', '❄️'], 95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Thunderstorm', '⛈️'],
};
export const wmo = (code) => WMO[code] || ['—', '🌡️'];

export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=en&format=json`);
  if (!r.ok) throw new Error('Geocoding failed');
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

export function browserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ name: 'My location', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }),
      (e) => reject(e), { timeout: 10000, maximumAge: 3600e3 });
  });
}

export async function getForecast(loc, force = false) {
  if (!loc) return null;
  const key = `wx2:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  const cached = await kvGet(key);
  if (!force && cached && Date.now() - cached.at < 3600e3) return cached.data;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,weather_code,wind_speed_10m_max,uv_index_max` +
      `&timezone=auto&forecast_days=16`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather http ' + r.status);
    const data = await r.json();
    await kvSet(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    if (cached) return cached.data; // offline: use last known forecast
    throw e;
  }
}

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

// Summarize one day: decides whether a layer is needed by the morning/evening spread.
export function dayWeather(fc, dateStr) {
  if (!fc || !fc.daily) return null;
  const di = fc.daily.time.indexOf(dateStr);
  if (di < 0) return null;
  const hours = fc.hourly.time.map((t, i) => [t, i]).filter(([t]) => t.startsWith(dateStr));
  const at = (h) => { const e = hours.find(([t]) => t.endsWith(`T${String(h).padStart(2, '0')}:00`)); return e ? e[1] : null; };
  const pick = (arr, h) => { const i = at(h); return i == null ? null : arr[i]; };
  const dayIdx = hours.filter(([t]) => { const h = +t.slice(11, 13); return h >= 8 && h <= 20; }).map(([, i]) => i);
  const feels = avg(dayIdx.map((i) => fc.hourly.apparent_temperature[i]).filter((v) => v != null));
  const code = fc.daily.weather_code[di];
  const [desc, icon] = wmo(code);
  return {
    date: dateStr,
    tMin: fc.daily.temperature_2m_min[di], tMax: fc.daily.temperature_2m_max[di],
    feels: feels ?? (fc.daily.temperature_2m_max[di] + fc.daily.temperature_2m_min[di]) / 2,
    morning: pick(fc.hourly.temperature_2m, 8) ?? fc.daily.temperature_2m_min[di],
    evening: pick(fc.hourly.temperature_2m, 20) ?? fc.daily.temperature_2m_min[di],
    rainProb: fc.daily.precipitation_probability_max[di] ?? 0,
    wind: fc.daily.wind_speed_10m_max[di] ?? 0,
    uv: fc.daily.uv_index_max?.[di] ?? 0,
    humidity: fc.hourly.relative_humidity_2m ? avg(dayIdx.map((i) => fc.hourly.relative_humidity_2m[i]).filter((v) => v != null)) : null,
    code, desc, icon, source: 'live',
  };
}

export function manualWeather(temp, rainProb = 0, spread = 6) {
  return { date: todayStr(), tMin: temp - spread / 2, tMax: temp + spread / 2, feels: temp, morning: temp - spread / 3, evening: temp - spread / 2, rainProb, wind: 10, uv: 3, code: rainProb > 50 ? 63 : 2, desc: rainProb > 50 ? 'Rain' : 'Manual', icon: rainProb > 50 ? '🌧️' : '🌡️', source: 'manual' };
}

export const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return todayStr(d); };

export function fmtTemp(c) {
  if (c == null || isNaN(c)) return '—';
  return state.settings.units === 'F' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
}

export async function weatherFor(dateStr) {
  const loc = state.settings.location;
  if (!loc) return null;
  const fc = await getForecast(loc);
  return dayWeather(fc, dateStr);
}
