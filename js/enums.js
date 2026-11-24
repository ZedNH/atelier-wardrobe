// Attribute enums — the single source of truth. Never invent values elsewhere.

export const CATEGORIES = ['top', 'bottom', 'outerwear', 'dress', 'footwear', 'accessory', 'headwear'];

export const CATEGORY_LABEL = {
  top: 'Top', bottom: 'Bottom', outerwear: 'Outerwear', dress: 'Dress',
  footwear: 'Footwear', accessory: 'Accessory', headwear: 'Headwear',
};

// subtype -> { cat, formality prior, warmth base, fit default, wears before wash }
export const SUBTYPES = {
  // tops
  't-shirt':        { cat: 'top', f: 2, w: 1, fit: 'regular', wash: 1 },
  'graphic tee':    { cat: 'top', f: 1, w: 1, fit: 'regular', wash: 1 },
  'tank top':       { cat: 'top', f: 1, w: 1, fit: 'regular', wash: 1 },
  'polo':           { cat: 'top', f: 3, w: 1.5, fit: 'regular', wash: 2 },
  'oxford shirt':   { cat: 'top', f: 3, w: 2, fit: 'regular', wash: 2 },
  'dress shirt':    { cat: 'top', f: 4, w: 2, fit: 'slim', wash: 1 },
  'linen shirt':    { cat: 'top', f: 3, w: 1, fit: 'relaxed', wash: 2 },
  'blouse':         { cat: 'top', f: 3, w: 1.5, fit: 'regular', wash: 2 },
  'henley':         { cat: 'top', f: 2, w: 2, fit: 'regular', wash: 2 },
  'sweater':        { cat: 'top', f: 3, w: 3, fit: 'regular', wash: 4 },
  'turtleneck':     { cat: 'top', f: 3, w: 3, fit: 'slim', wash: 3 },
  'sweatshirt':     { cat: 'top', f: 1, w: 3, fit: 'relaxed', wash: 3 },
  'hoodie':         { cat: 'top', f: 1, w: 3, fit: 'relaxed', wash: 3 },
  'activewear top': { cat: 'top', f: 1, w: 1, fit: 'slim', wash: 1, active: true },
  // bottoms
  'jeans':          { cat: 'bottom', f: 2, w: 2, fit: 'regular', wash: 6 },
  'chinos':         { cat: 'bottom', f: 3, w: 2, fit: 'slim', wash: 4 },
  'dress trousers': { cat: 'bottom', f: 4, w: 2, fit: 'slim', wash: 4 },
  'shorts':         { cat: 'bottom', f: 1, w: 1, fit: 'regular', wash: 2 },
  'skirt':          { cat: 'bottom', f: 3, w: 1, fit: 'regular', wash: 3 },
  'joggers':        { cat: 'bottom', f: 1, w: 2, fit: 'relaxed', wash: 2 },
  'leggings':       { cat: 'bottom', f: 1, w: 2, fit: 'slim', wash: 1, active: true },
  'cargo pants':    { cat: 'bottom', f: 2, w: 2, fit: 'relaxed', wash: 4 },
  // outerwear
  'blazer':         { cat: 'outerwear', f: 4, w: 2, fit: 'slim', wash: 12 },
  'suit jacket':    { cat: 'outerwear', f: 5, w: 2, fit: 'slim', wash: 12 },
  'cardigan':       { cat: 'outerwear', f: 3, w: 2.5, fit: 'regular', wash: 5 },
  'denim jacket':   { cat: 'outerwear', f: 2, w: 2, fit: 'regular', wash: 15 },
  'leather jacket': { cat: 'outerwear', f: 3, w: 3, fit: 'slim', wash: 40 },
  'bomber':         { cat: 'outerwear', f: 2, w: 3, fit: 'regular', wash: 15 },
  'fleece':         { cat: 'outerwear', f: 1, w: 3, fit: 'relaxed', wash: 8 },
  'raincoat':       { cat: 'outerwear', f: 2, w: 1.5, fit: 'regular', wash: 30, rain: true },
  'trench coat':    { cat: 'outerwear', f: 4, w: 3, fit: 'regular', wash: 20, rain: true },
  'overcoat':       { cat: 'outerwear', f: 4, w: 5, fit: 'regular', wash: 25 },
  'parka':          { cat: 'outerwear', f: 2, w: 5, fit: 'relaxed', wash: 25, rain: true },
  'puffer':         { cat: 'outerwear', f: 1, w: 5, fit: 'relaxed', wash: 25 },
  // dresses
  'casual dress':   { cat: 'dress', f: 2, w: 1.5, fit: 'regular', wash: 2 },
  'shirt dress':    { cat: 'dress', f: 3, w: 1.5, fit: 'regular', wash: 2 },
  'maxi dress':     { cat: 'dress', f: 3, w: 1.5, fit: 'relaxed', wash: 2 },
  'cocktail dress': { cat: 'dress', f: 4, w: 1.5, fit: 'slim', wash: 2 },
  'formal gown':    { cat: 'dress', f: 5, w: 2, fit: 'slim', wash: 2 },
  'jumpsuit':       { cat: 'dress', f: 3, w: 2, fit: 'regular', wash: 2 },
  // footwear
  'sneakers':       { cat: 'footwear', f: 2, w: 2, fit: 'regular' },
  'running shoes':  { cat: 'footwear', f: 1, w: 2, fit: 'regular', active: true },
  'canvas shoes':   { cat: 'footwear', f: 2, w: 1, fit: 'regular', noRain: true },
  'loafers':        { cat: 'footwear', f: 4, w: 2, fit: 'regular' },
  'oxford shoes':   { cat: 'footwear', f: 5, w: 2, fit: 'regular' },
  'derby shoes':    { cat: 'footwear', f: 4, w: 2, fit: 'regular' },
  'suede shoes':    { cat: 'footwear', f: 3, w: 2, fit: 'regular', noRain: true },
  'chelsea boots':  { cat: 'footwear', f: 3, w: 3, fit: 'regular' },
  'boots':          { cat: 'footwear', f: 2, w: 4, fit: 'regular' },
  'sandals':        { cat: 'footwear', f: 1, w: 1, fit: 'regular', noRain: true },
  'heels':          { cat: 'footwear', f: 4, w: 1, fit: 'regular' },
  'flats':          { cat: 'footwear', f: 3, w: 1, fit: 'regular' },
  // accessories
  'belt':           { cat: 'accessory', f: 3, w: 0, fit: 'regular' },
  'watch':          { cat: 'accessory', f: 3, w: 0, fit: 'regular' },
  'bag':            { cat: 'accessory', f: 3, w: 0, fit: 'regular' },
  'scarf':          { cat: 'accessory', f: 3, w: 1, fit: 'regular', cold: true },
  'tie':            { cat: 'accessory', f: 5, w: 0, fit: 'regular' },
  'sunglasses':     { cat: 'accessory', f: 2, w: 0, fit: 'regular', sun: true },
  'jewelry':        { cat: 'accessory', f: 3, w: 0, fit: 'regular' },
  // headwear
  'cap':            { cat: 'headwear', f: 1, w: 0.5, fit: 'regular' },
  'beanie':         { cat: 'headwear', f: 1, w: 2, fit: 'regular', cold: true },
  'hat':            { cat: 'headwear', f: 3, w: 0.5, fit: 'regular', sun: true },
  // ---- South Asian wear (trad = traditional; favoured for Eid, weddings, Boishakh…) ----
  'kurti':          { cat: 'top', f: 3, w: 1.5, fit: 'regular', wash: 2, trad: true },
  'kurta':          { cat: 'top', f: 3, w: 1.5, fit: 'regular', wash: 2, trad: true },
  'panjabi':        { cat: 'top', f: 4, w: 1.5, fit: 'regular', wash: 2, trad: true },
  'fotua':          { cat: 'top', f: 2, w: 1, fit: 'relaxed', wash: 2, trad: true },
  'salwar':         { cat: 'bottom', f: 3, w: 1.5, fit: 'relaxed', wash: 3, trad: true },
  'churidar':       { cat: 'bottom', f: 3, w: 1.5, fit: 'slim', wash: 3, trad: true },
  'pajama':         { cat: 'bottom', f: 3, w: 1.5, fit: 'regular', wash: 3, trad: true },
  'palazzo':        { cat: 'bottom', f: 2, w: 1, fit: 'relaxed', wash: 3 },
  'lungi':          { cat: 'bottom', f: 1, w: 1, fit: 'relaxed', wash: 2, trad: true },
  'dhoti':          { cat: 'bottom', f: 3, w: 1, fit: 'relaxed', wash: 2, trad: true },
  'saree':          { cat: 'dress', f: 4, w: 1.5, fit: 'regular', wash: 3, trad: true },
  'salwar kameez':  { cat: 'dress', f: 3, w: 1.5, fit: 'regular', wash: 2, trad: true },
  'anarkali':       { cat: 'dress', f: 4, w: 1.5, fit: 'regular', wash: 3, trad: true },
  'lehenga':        { cat: 'dress', f: 5, w: 2, fit: 'regular', wash: 4, trad: true },
  'sherwani':       { cat: 'outerwear', f: 5, w: 2.5, fit: 'slim', wash: 10, trad: true },
  'koti':           { cat: 'outerwear', f: 4, w: 1.5, fit: 'slim', wash: 10, trad: true },
  'nagra':          { cat: 'footwear', f: 4, w: 1, fit: 'regular', trad: true },
  'kolhapuri':      { cat: 'footwear', f: 3, w: 1, fit: 'regular', noRain: true, trad: true },
  'dupatta':        { cat: 'accessory', f: 3, w: 0.5, fit: 'regular', trad: true },
  'shawl':          { cat: 'accessory', f: 3, w: 2, fit: 'regular', cold: true, trad: true },
  'hijab':          { cat: 'headwear', f: 3, w: 1, fit: 'regular' },
  'tupi':           { cat: 'headwear', f: 3, w: 0, fit: 'regular', trad: true },
};
export const isTrad = (g) => !!SUBTYPES[g?.subtype]?.trad;

export const subtypesOf = (cat) => Object.keys(SUBTYPES).filter((s) => SUBTYPES[s].cat === cat);

export const PATTERNS = ['solid', 'stripe', 'check', 'floral', 'graphic', 'textured'];
export const BOLD_PATTERNS = new Set(['stripe', 'check', 'floral', 'graphic']);

export const FABRICS = ['cotton', 'linen', 'wool', 'denim', 'synthetic', 'leather', 'knit', 'silk', 'suede', 'canvas'];
export const FABRIC_WARMTH = { cotton: 0, linen: -1, wool: 1, denim: 0, synthetic: 0, leather: 0.5, knit: 0.75, silk: -0.5, suede: 0.25, canvas: 0 };

export const SEASONS = ['summer', 'winter', 'transitional', 'all-season'];
export const FITS = ['slim', 'regular', 'relaxed', 'oversized'];

export const FORMALITY_LABEL = { 1: 'Loungewear', 2: 'Casual', 3: 'Smart casual', 4: 'Business', 5: 'Formal / black tie' };

export const STATUSES = ['active', 'archived', 'donated', 'lent', 'sold'];
export const LAUNDRY_STATES = ['clean', 'worn', 'dirty', 'washing'];

export const SLOTS = ['outerwear', 'top', 'bottom', 'dress', 'footwear', 'accessory', 'headwear'];

// Occasions / dress-code library: formality window + rules
export const OCCASIONS = {
  lounge:        { label: 'Lounge',          icon: '🛋️', f: 1, min: 1, max: 2 },
  active:        { label: 'Gym / active',    icon: '🏃', f: 1, min: 1, max: 2, active: true },
  casual:        { label: 'Casual',          icon: '☕', f: 2, min: 1, max: 3 },
  smart_casual:  { label: 'Smart casual',    icon: '🧥', f: 3, min: 2, max: 4 },
  work:          { label: 'Work',            icon: '💼', f: 3, min: 2, max: 4 },
  business:      { label: 'Business',        icon: '📊', f: 4, min: 3, max: 5 },
  date:          { label: 'Date / dinner',   icon: '🍷', f: 3, min: 3, max: 4 },
  cocktail:      { label: 'Cocktail party',  icon: '🥂', f: 4, min: 3, max: 5 },
  formal:        { label: 'Formal / black tie', icon: '🎩', f: 5, min: 4, max: 5 },
  // South Asian occasions (shown when the profile region is South Asia). colors = festive palette.
  eid:           { label: 'Eid', f: 4, min: 3, max: 5, trad: 1, region: 'sa', colors: ['#f7f7f5', '#efe6d2', '#9cc3e6', '#a8dcc0', '#ee9cb6', '#c99a2e'], note: 'a festive traditional look for Eid' },
  boishakh:      { label: 'Pohela Boishakh', f: 3, min: 2, max: 4, trad: 1, region: 'sa', colors: ['#c8302c', '#f7f7f5', '#efe6d2'], note: 'classic red-and-white for Pohela Boishakh' },
  holud:         { label: 'Gaye holud', f: 4, min: 3, max: 5, trad: 1, region: 'sa', colors: ['#f0d23c', '#e07a2e', '#c99a2e', '#3a8a3e'], note: 'yellow and marigold tones for the holud' },
  biye:          { label: 'Wedding (biye)', f: 5, min: 4, max: 5, trad: 1, region: 'sa', colors: ['#6e1f2e', '#c8302c', '#c99a2e', '#1f2a44', '#1f7a5c'], note: 'rich wedding colors' },
  puja:          { label: 'Puja', f: 4, min: 3, max: 5, trad: 1, region: 'sa', colors: ['#c8302c', '#f7f7f5', '#c99a2e', '#e07a2e'], note: 'red, white and gold for puja' },
  jummah:        { label: 'Jummah', f: 3, min: 2, max: 4, trad: 1, region: 'sa', modest: 1, colors: ['#f7f7f5', '#efe6d2', '#c4c6c8', '#9cc3e6'], note: 'clean, modest whites for Jummah' },
};
export const occasionsFor = (region) => Object.entries(OCCASIONS).filter(([, o]) => !o.region || o.region === region);

// Stated dress codes -> occasion keys
export const DRESS_CODES = {
  'black tie': 'formal', 'white tie': 'formal', 'formal': 'formal', 'cocktail': 'cocktail',
  'business formal': 'business', 'business': 'business', 'business casual': 'work',
  'smart casual': 'smart_casual', 'casual': 'casual', 'athleisure': 'active', 'sport': 'active',
};

export const MIN_WARDROBE = { top: 5, bottom: 3, footwear: 2 };
