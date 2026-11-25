// Hand-drawn line icon set (24px grid, currentColor). Replaces emoji in the interface.
const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  hanger: '<path d="M12 7.5a2 2 0 1 1 2-2c0 1-1 1.5-2 2.2V9"/><path d="M12 9 3 15.2c-.9.6-.5 1.8.6 1.8h16.8c1.1 0 1.5-1.2.6-1.8L12 9Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.3 3-5.3 6-5.3s5.4 2 6 5.3"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.3c2.5 0 4.4 1.7 5 4.4"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  sparkles: '<path d="M10 3.5 11.6 8a2 2 0 0 0 1.3 1.3L17.5 11l-4.6 1.6a2 2 0 0 0-1.3 1.3L10 18.5 8.4 13.9A2 2 0 0 0 7.1 12.6L2.5 11l4.6-1.6A2 2 0 0 0 8.4 8L10 3.5Z"/><path d="M18.5 3v4M16.5 5h4M19 16v3M17.5 17.5h3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  heartFill: '<path fill="currentColor" d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.7 4.3l1.3-1.8M20 20v-4.5h-4.5"/>',
  up: '<path d="M7 10v11M3 21h4V10H3v11ZM7 10l4-7a2.5 2.5 0 0 1 2.6 3.1L13 9h5.6a2 2 0 0 1 2 2.4l-1.4 7.2A3 3 0 0 1 16.3 21H7"/>',
  down: '<path d="M17 14V3M21 3h-4v11h4V3ZM17 14l-4 7a2.5 2.5 0 0 1-2.6-3.1L11 15H5.4a2 2 0 0 1-2-2.4l1.4-7.2A3 3 0 0 1 7.7 3H17"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="13" r="3.6"/>',
  image: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m20.5 16-5-5-9 9"/>',
  pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  laundry: '<rect x="4" y="3" width="16" height="18" rx="2.5"/><circle cx="12" cy="13" r="4.5"/><path d="M8 6.5h.01M11 6.5h3"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  starFill: '<path fill="currentColor" d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8 20 18M8.6 16 20 6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  chevDown: '<path d="m5 9 7 7 7-7"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  umbrella: '<path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9ZM12 12v6.5a2.5 2.5 0 0 1-5 0"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
  drop: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3Z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.4-1.3-1.8-1.3-3 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
  suitcase: '<rect x="3.5" y="7" width="17" height="13" rx="2.5"/><path d="M9 7V4.5h6V7M3.5 12.5h17"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  download: '<path d="M12 3v12M7 10.5 12 15.5l5-5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  upload: '<path d="M12 16V4M7 8.5 12 3.5l5 5"/><path d="M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  wand: '<path d="M4 20 15 9M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3l.01.01"/><path d="m13 7 4 4"/>',
  shirt: '<path d="M8.5 3.5 4 6l-2 4.5 3 1.5 1-1.7V20.5h12V10.3l1 1.7 3-1.5L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0Z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  filter: '<path d="M3 5h18l-7 8.5V20l-4-2v-4.5L3 5Z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  figure: '<circle cx="12" cy="4.5" r="2"/><path d="M8 9.5c0-1 .9-2 2-2h4c1.1 0 2 1 2 2V14h-1.5l-.5 7h-4l-.5-7H8V9.5Z"/>',
  flame: '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.8-3-5.8-3.8-9.5-2 1.2-3 3.4-2.7 5.6C10.6 9.7 9.4 8 9.3 6 7 7.9 5.5 10.8 5.5 14.5A6.5 6.5 0 0 0 12 21Z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5.5h3V7a3 3 0 0 1-3 3M7 5.5H4V7a3 3 0 0 0 3 3"/>',
  leaf: '<path d="M5 19C5 10 10 4.5 20 4c.4 9.6-5 15-13 15H5Z"/><path d="M5 19 13 11"/>',
  bolt: '<path d="M13 2 4.5 13.5H11L10 22l9.5-12H13L13 2Z"/>',
  chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4.5V16H6.5A2.5 2.5 0 0 1 4 13.5v-8Z"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19v-8.5Z"/>',
  cloud: '<path d="M7 18.5h10a4.5 4.5 0 0 0 .6-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 7 18.5Z"/>',
  cloudSun: '<path d="M8.5 5.2V3.5M3.3 7.3l1.2 1.2M2 12.5h1.7M12.7 8.5l1.2-1.2"/><path d="M5.6 11.4a3.5 3.5 0 0 1 6.3-2.6"/><path d="M9 20.5h8.5a3.8 3.8 0 0 0 .5-7.6 5 5 0 0 0-9.6 1.4A3.1 3.1 0 0 0 9 20.5Z"/>',
  rain: '<path d="M7 15h10a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.1 7.6 3.8 3.8 0 0 0 7 15Z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
  snow: '<path d="M7 14h10a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.1 6.6 3.8 3.8 0 0 0 7 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01"/>',
  storm: '<path d="M7 14h10a4.5 4.5 0 0 0 .6-9A6 6 0 0 0 6.1 6.6 3.8 3.8 0 0 0 7 14Z"/><path d="m12.5 14-2.5 4h4l-2.5 4"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14M8 5h8"/>',
  thermo: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z"/><path d="M12 9v7"/>',
  ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6.5 8v3M10 8v4M13.5 8v3M17 8v4"/>',
  dna: '<path d="M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12s10 6 10 6"/><path d="M8.5 7h7M8.5 17h7M10 12h4"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  bag: '<path d="M5 8h14l-1 12.5H6L5 8Z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  plusSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
};

export function icon(name, size = 20, cls = '') {
  const body = P[name] || P.info;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// ---------------- Clothing icons (same 24px line style) ----------------
const G = {
  tee: '<path d="M8 3.5 4 5.5 2.5 9.5l3 1.3L7 9v11.5h10V9l1.5 1.8 3-1.3L20 5.5l-4-2c-.6 1.4-2.1 2.3-4 2.3S8.6 4.9 8 3.5Z"/>',
  polo: '<path d="M8 3.5 4 5.5 2.5 9.5l3 1.3L7 9v11.5h10V9l1.5 1.8 3-1.3L20 5.5l-4-2"/><path d="M8 3.5 9.5 6 12 4.5 14.5 6 16 3.5M12 4.5v5.5M11.4 7.5h1.2"/>',
  shirt: '<path d="M8.5 3.5 4.5 5.5 3 19h2.6L7 10v10.5h10V10l1.4 9H21L19.5 5.5l-4-2"/><path d="M8.5 3.5 12 7l3.5-3.5M12 7v13.5M10.2 3.5h3.6"/><path d="M11.99 10h.02M11.99 13h.02M11.99 16h.02" stroke-width="2.2"/>',
  blouse: '<path d="M8.5 3.5 4.5 5.5 3 15h2.6L7 10v10.5h10V10l1.4 5H21L19.5 5.5l-4-2c-.7 1.6-2 2.5-3.5 2.5s-2.8-.9-3.5-2.5Z"/><path d="M7 13.5c1.6.8 3.3 1.2 5 1.2s3.4-.4 5-1.2"/>',
  tank: '<path d="M8.5 3v3.5c0 1.5-1.5 2.5-1.5 4.5v9.5h10V11c0-2-1.5-3-1.5-4.5V3"/><path d="M8.5 6.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8"/>',
  sweater: '<path d="M8.5 3.5 4.5 5.5 3 18h2.8L7 10v10.5h10V10l1.2 8H21L19.5 5.5l-4-2c-.7 1.3-2 2-3.5 2s-2.8-.7-3.5-2Z"/><path d="M7 18.5h10M3.1 16.5h2.8M18.1 16.5h2.8"/>',
  hoodie: '<path d="M8.5 4.5 4.5 6.5 3 18h2.8L7 10.5v10h10v-10l1.2 7.5H21L19.5 6.5l-4-2"/><path d="M8.5 4.5C8.5 2.8 10 2 12 2s3.5.8 3.5 2.5c0 1.6-1.6 3-3.5 3s-3.5-1.4-3.5-3ZM9 15h6v3H9zM11 7.5v2.5M13 7.5v2.5"/>',
  tunic: '<path d="M8.5 2.5 4.5 4.5 3 14h2.6L7 8.5v13h10v-13l1.4 5.5H21L19.5 4.5l-4-2c-.7 1.4-2 2.2-3.5 2.2s-2.8-.8-3.5-2.2Z"/><path d="M12 4.7V10M7 18.5h10"/>',
  jeans: '<path d="M6.5 2.5h11l1 19h-4.5L12 9l-2 12.5H5.5l1-19Z"/><path d="M6.5 5h11M9.5 5c0 1.6-.9 2.6-2.6 2.8M14.5 5c0 1.6.9 2.6 2.6 2.8M12 5v4"/>',
  trousers: '<path d="M6.5 2.5h11l1 19h-4.5L12 8l-2 13.5H5.5l1-19Z"/><path d="M6.5 5h11M12 5v3M8.2 8.5l-.8 12M15.8 8.5l.8 12"/>',
  joggers: '<path d="M7 2.5h10l1.2 17.5h-4.5L12 9l-1.7 11H5.8L7 2.5Z"/><path d="M7 5h10M5.8 18h4.5M13.7 18h4.5M11 5v2.2M13 5v2.2"/>',
  cargo: '<path d="M6.5 2.5h11l1 19h-4.5L12 8l-2 13.5H5.5l1-19Z"/><path d="M6.5 5h11M5.8 11h3.4v4.5H5.8zM14.8 11h3.4v4.5h-3.4zM5.8 12.5h3.4M14.8 12.5h3.4"/>',
  shorts: '<path d="M5.5 4h13l1.5 10.5h-6L12 9l-2 5.5H4L5.5 4Z"/><path d="M5.5 6.5h13"/>',
  skirt: '<path d="M8 3.5h8l3.5 17h-15L8 3.5Z"/><path d="M7.6 6h8.8M10 6l-1.2 14.5M14 6l1.2 14.5"/>',
  lungi: '<path d="M7.5 3.5h9l2 17h-13l2-17Z"/><path d="M7.2 6h9.6M6.3 11.5h11.4M5.8 16.5h12.4M10 3.5l-1 17M14 3.5l1 17"/>',
  dress: '<path d="M9 2.5v3L7 9l-3.5 12h17L17 9l-2-3.5v-3"/><path d="M9 5.5c.9.9 1.8 1.3 3 1.3s2.1-.4 3-1.3M7 9h10"/>',
  gown: '<path d="M9.5 2.5V6L8 10 3.5 21.5h17L16 10l-1.5-4V2.5"/><path d="M9.5 6c.8.6 1.6.9 2.5.9s1.7-.3 2.5-.9M8 10h8"/>',
  saree: '<path d="M9.5 2.5V6L8 10 3.5 21.5h17L16 10l-1.5-4V2.5"/><path d="M9.7 3.5 17.4 13M4.4 19.3h15.2"/>',
  blazer: '<path d="M8 3 3.5 5 2.5 20h3V9.5l1.5 1V21h10V10.5l1.5-1V20h3L20.5 5 16 3l-4 7-4-7Z"/><path d="M8 3l1.5 6.5M16 3l-1.5 6.5M12 10v11M9 15h2"/>',
  coat: '<path d="M8 2.5 3.5 4.5 2.5 19h3V9l1.5 1v12h10V10l1.5-1v10h3L20.5 4.5 16 2.5l-4 6-4-6Z"/><path d="M12 8.5v13.5M7 14h10M10 10.5h.01M10 17.5h.01" stroke-width="1.9"/>',
  jacket: '<path d="M8 3.5 3.5 5.5 2.5 18h3V9l1.5 1v10.5h10V10l1.5-1v9h3L20.5 5.5 16 3.5c-.6 1.5-2.2 2.4-4 2.4s-3.4-.9-4-2.4Z"/><path d="M12 5.9v14.6M7 19h10M8.5 12.5h2M13.5 12.5h2"/>',
  vest: '<path d="M8.5 3 12 9l3.5-6 3 1.5V21h-13V4.5l3-1.5Z"/><path d="M12 9v12M13.5 12h.01M13.5 15.5h.01" stroke-width="1.9"/>',
  sneaker: '<path d="M2.5 17.5V13c0-1 .6-1.6 1.6-1.6h1.5l3-3.4h2.6l1.3 2.2 5 1.6c1.8.6 3.3 1.6 4 3.4v2.3H2.5Z"/><path d="M2.5 15.5h19M9 9.6l1.4 1.4M10.7 8.9l1.3 1.3"/>',
  boot: '<path d="M6.5 2.5h6v9.6l5.4 2c1.8.6 3.1 1.9 3.1 3.6v1.8H6.5v-17Z"/><path d="M6.5 16.5h14.4M12.5 5.5h-6M12.5 8.5h-6"/>',
  heel: '<path d="M3 10.5c3-1 5 .5 6.5 3 1.3 2 3.5 3 6 3h4c.9 0 1.5.6 1.5 1.5V19h-7.5c-2 0-3.2-1-4.2-2.2L9 20.5H7.6l.4-5.4L3 13v-2.5Z"/>',
  sandal: '<path d="M3 18h18M3.5 18c0-1.5 1-2.5 2.5-2.5h12c1.6 0 2.5 1 2.5 2.5M8 15.5l2-4.5h4l2 4.5M10 11l2 2.2 2-2.2"/>',
  loafer: '<path d="M2.5 16.5c0-2.5 1.5-4 4-4h3c2.5 0 4 .4 6.5 1.5l3.5 1.4c1 .4 2 1.4 2 2.6v.5H2.5v-2Z"/><path d="M7.5 12.8c1.5 1.2 4.5 1.2 6.3-.2M2.5 18.5h19"/>',
  bag: '<path d="M5 8h14l-1 12.5H6L5 8Z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  belt: '<path d="M2.5 10h19v4h-19zM14 9v6h4V9h-4M16 12h3"/>',
  watch: '<path d="M9 2.5h6l.5 4.5M9 2.5 8.5 7M9 21.5h6l.5-4.5M9 21.5 8.5 17"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5V12l1.5 1"/>',
  scarf: '<path d="M7 3h10v6l-3 2v10.5h-4V11L7 9V3Z"/><path d="M10 17.5h4M10 19.5h4M7 6h10"/>',
  tie: '<path d="M10 2.5h4l-1 3 2.5 11L12 21l-3.5-4.5L11 5.5l-1-3Z"/>',
  shades: '<path d="M2.5 11h19"/><path d="M3 11h7.5l-.6 3.6a2.5 2.5 0 0 1-2.5 2H6a2.5 2.5 0 0 1-2.5-2.1L3 11ZM13.5 11H21l-.5 3.5a2.5 2.5 0 0 1-2.5 2.1h-1.4a2.5 2.5 0 0 1-2.5-2L13.5 11Z" fill="currentColor" fill-opacity=".35"/>',
  glasses: '<circle cx="6" cy="13" r="3.5"/><circle cx="18" cy="13" r="3.5"/><path d="M9.5 13h5M2.5 12 4 8M21.5 12 20 8"/>',
  jewelry: '<circle cx="12" cy="15" r="6"/><path d="M9.5 6 12 9.5 14.5 6 13 3.5h-2L9.5 6Z"/>',
  cap: '<path d="M3.5 15.5c0-5 3.6-9 8.5-9s7.5 3.5 7.5 7.5v1.5H3.5Z"/><path d="M19.5 15.5h2.5c0 1.2-1 2-2.5 2H6M12 6.5v1.5"/>',
  beanie: '<path d="M5 15.5V13a7 7 0 0 1 14 0v2.5"/><path d="M4 15.5h16v4H4zM12 3.5V6M8 15.5v4M12 15.5v4M16 15.5v4"/>',
  hat: '<path d="M2.5 17c2 1.5 6 2.2 9.5 2.2s7.5-.7 9.5-2.2M6.5 16.5c0-6 2.5-10 5.5-10s5.5 4 5.5 10M6.8 13.5h10.4"/>',
  hijab: '<path d="M12 2.5c4.5 0 7.5 3.5 7.5 8.5 0 4 1 7.5 2 10.5h-19c1-3 2-6.5 2-10.5 0-5 3-8.5 7.5-8.5Z"/><path d="M12 6.5c-2.3 0-3.8 1.9-3.8 4.5s1.5 4.8 3.8 4.8 3.8-2.2 3.8-4.8-1.5-4.5-3.8-4.5Z"/>',
  tupi: '<path d="M4 16.5c0-5 3.6-8.5 8-8.5s8 3.5 8 8.5H4Z"/><path d="M4 16.5h16M8 10.5l1 6M16 10.5l-1 6M12 8v8.5"/>',
  hanger: '<path d="M12 7.5a2 2 0 1 1 2-2c0 1-1 1.5-2 2.2V9"/><path d="M12 9 3 15.2c-.9.6-.5 1.8.6 1.8h16.8c1.1 0 1.5-1.2.6-1.8L12 9Z"/>',
};
const SUB_ICON = {
  'sports bra': 'tank', 'crop top': 'tank', 'camisole': 'tank', 'tunic': 'tunic', 'track pants': 'joggers', 'sports shorts': 'shorts', 'flip-flops': 'sandal', 'slides': 'sandal', 'wedges': 'heel', 'mules': 'loafer', 'eyeglasses': 'glasses', 'smartwatch': 'watch', 'backpack': 'bag', 'clutch': 'bag', 'wallet': 'bag', 'necklace': 'jewelry', 'earrings': 'jewelry', 'bracelet': 'jewelry', 'ring': 'jewelry', 'cufflinks': 'jewelry', 'pocket square': 'tie', 'bucket hat': 'hat', 'headband': 'beanie',
  't-shirt': 'tee', 'graphic tee': 'tee', 'fotua': 'tee', 'tank top': 'tank', 'activewear top': 'tank', 'polo': 'polo',
  'oxford shirt': 'shirt', 'dress shirt': 'shirt', 'linen shirt': 'shirt', 'blouse': 'blouse', 'henley': 'sweater', 'sweater': 'sweater', 'turtleneck': 'sweater', 'sweatshirt': 'sweater', 'hoodie': 'hoodie',
  'kurti': 'tunic', 'kurta': 'tunic', 'panjabi': 'tunic', 'salwar kameez': 'tunic',
  'jeans': 'jeans', 'chinos': 'trousers', 'dress trousers': 'trousers', 'leggings': 'trousers', 'salwar': 'trousers', 'churidar': 'trousers', 'pajama': 'trousers', 'palazzo': 'trousers', 'dhoti': 'trousers',
  'joggers': 'joggers', 'cargo pants': 'cargo', 'shorts': 'shorts', 'skirt': 'skirt', 'lungi': 'lungi',
  'casual dress': 'dress', 'shirt dress': 'dress', 'cocktail dress': 'dress', 'jumpsuit': 'dress', 'maxi dress': 'gown', 'formal gown': 'gown', 'anarkali': 'gown', 'lehenga': 'gown', 'saree': 'saree',
  'blazer': 'blazer', 'suit jacket': 'blazer', 'overcoat': 'coat', 'trench coat': 'coat', 'raincoat': 'coat', 'parka': 'coat', 'sherwani': 'coat', 'koti': 'vest',
  'cardigan': 'jacket', 'denim jacket': 'jacket', 'leather jacket': 'jacket', 'bomber': 'jacket', 'fleece': 'jacket', 'puffer': 'jacket',
  'sneakers': 'sneaker', 'running shoes': 'sneaker', 'canvas shoes': 'sneaker', 'boots': 'boot', 'chelsea boots': 'boot', 'heels': 'heel', 'sandals': 'sandal', 'kolhapuri': 'sandal',
  'loafers': 'loafer', 'oxford shoes': 'loafer', 'derby shoes': 'loafer', 'suede shoes': 'loafer', 'flats': 'loafer', 'nagra': 'loafer',
  'bag': 'bag', 'belt': 'belt', 'watch': 'watch', 'scarf': 'scarf', 'dupatta': 'scarf', 'shawl': 'scarf', 'tie': 'tie', 'sunglasses': 'shades', 'jewelry': 'jewelry',
  'cap': 'cap', 'beanie': 'beanie', 'hat': 'hat', 'hijab': 'hijab', 'tupi': 'tupi',
};
const CAT_ICON = { all: 'hanger', top: 'tee', bottom: 'trousers', outerwear: 'jacket', dress: 'dress', footwear: 'sneaker', accessory: 'bag', headwear: 'cap' };
// Product-style illustration of a clothing type in a real colour (used for shopping ideas)
let artN = 0;
const mix = (hex, k) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
export function productArt(key, hex, size = 96) {
  const body = G[SUB_ICON[key] || CAT_ICON[key] || key] || G.hanger; const id = 'pa' + ++artN;
  const n = parseInt(hex.slice(1), 16); const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  const line = lum > 200 ? '#9a958c' : lum < 50 ? mix(hex, 0.35) : mix(hex, -0.45);
  return `<svg class="pa" width="${size}" height="${size}" viewBox="-1 -1 26 26" aria-hidden="true"><defs><linearGradient id="${id}g" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="${mix(hex, 0.28)}"/><stop offset=".55" stop-color="${hex}"/><stop offset="1" stop-color="${mix(hex, -0.3)}"/></linearGradient><filter id="${id}s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy=".9" stdDeviation=".7" flood-color="#000" flood-opacity=".28"/></filter></defs><g fill="url(#${id}g)" stroke="${line}" stroke-width=".6" stroke-linejoin="round" stroke-linecap="round" filter="url(#${id}s)">${body}</g></svg>`;
}
export const hasGicon = (k) => !!(SUB_ICON[k] || CAT_ICON[k] || G[k]);
// icon for a clothing type or category
export function gicon(key, size = 20, cls = '') {
  const body = G[SUB_ICON[key] || CAT_ICON[key] || key] || G.hanger;
  return `<svg class="ic gi ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// WMO weather code -> icon name
export function wxIcon(code) {
  if (code == null) return 'thermo';
  if (code === 0) return 'sun';
  if (code <= 2) return 'cloudSun';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloud';
}
