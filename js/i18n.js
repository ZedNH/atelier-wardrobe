// Bangla support: (1) understand Bangla / Banglish requests, (2) translate the interface live.
// The UI is written in English; when Bangla is on, a MutationObserver translates every text node,
// placeholder and label as it appears (exact strings, then patterns, then phrases). Garment names you typed stay as typed.
import { state } from './db.js';

export const LANGS = { en: 'English', bn: 'বাংলা' };
export const lang = () => state.settings?.lang || (/^bn\b/i.test(navigator.language || '') ? 'bn' : 'en');

// ---------------- (1) Bangla / Banglish -> English keywords the engine understands ----------------
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toLatinDigits = (s) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const NORMALIZE = [
  [/\b(kal|kalke|agamikal|agami kal)\b|আগামীকাল|কাল(?:কে)?/i, 'tomorrow'],
  [/\b(aj|aaj|ajke|aajke)\b|আজ(?:কে)?/i, 'today'],
  [/\b(rate|raat|rat e)\b|রাতে|রাত/i, 'evening dinner'],
  [/\bki (porbo|pori|porte|porbe|pore)|কি পর|কী পর|porbo|pori\b|পরব|পরবো|পরতে/i, 'what should I wear'],
  [/অফিস|\boffice\b|\bkaj\b|কাজে/i, 'office work'],
  [/varsity|versity|ভার্সিটি|ক্লাস|\bclass\b|college|কলেজ|school|স্কুল/i, 'casual'],
  [/dawat|daoat|দাওয়াত|nimontron|নিমন্ত্রণ/i, 'dinner'],
  [/party|পার্টি/i, 'party'],
  [/\bdate\b|ডেট/i, 'date'],
  [/thanda|ঠান্ডা|ঠাণ্ডা|\bsheet\b|শীত|kuasha|কুয়াশা/i, 'cold'],
  [/gorom|গরম|\brod\b|রোদ/i, 'hot'],
  [/bhapsa|ভ্যাপসা|ghame|ঘাম|humid/i, 'hot humid'],
  [/brishti|bristi|বৃষ্টি|borsha|বর্ষা|monsoon/i, 'rain'],
  [/kinbo|kinte|kena\b|কিনব|কিনতে|কেনা|কেনাকাটা/i, 'what should I buy'],
  [/\brong\b|রং|রঙ/i, 'which colors suit me'],
  [/shorir|শরীর|গড়ন|body type/i, 'body shape'],
  [/ghurte|ghurbo|ঘুরতে|ভ্রমণ|সফর|tour\b/i, 'pack trip'],
  [/(\d+)\s*(din|দিন)/i, (m) => `${m[1]} days`],
  [/dhobi|dhoa|ধোয়া|ধোবা|kapor dhu/i, 'laundry'],
  [/porini|পরিনি|pora hoyni|পরা হয়নি|pora hoy ni/i, "haven't worn"],
  [/notun kichu|নতুন কিছু|bhinno|ভিন্ন কিছু/i, 'surprise me'],
  [/abohawa|আবহাওয়া/i, 'weather'],
  [/amar style|আমার স্টাইল/i, 'my style'],
  [/jomkalo|jamkalo|জমকালো|shundor kore|সাজ/i, 'dress up'],
  [/aram|আরাম/i, 'comfortable'],
  [/meet(ing)?|মিটিং|interview|ইন্টারভিউ/i, 'meeting'],
  // garments
  [/শাড়ি|শাড়ী|\bshari\b|\bsharee\b/i, 'saree'], [/পাঞ্জাবি|পাঞ্জাবী|\bpanjabi\b/i, 'panjabi'], [/সালোয়ার কামিজ|salwar kamiz|shalwar/i, 'salwar kameez'],
  [/কুর্তি|kurti/i, 'kurti'], [/লুঙ্গি|lungi/i, 'lungi'], [/শেরওয়ানি|sherwani/i, 'sherwani'], [/লেহেঙ্গা|lehenga/i, 'lehenga'], [/ওড়না|orna\b/i, 'dupatta'],
  [/হিজাব/i, 'hijab'], [/জিন্স/i, 'jeans'], [/টি-?শার্ট/i, 't-shirt'], [/শার্ট/i, 'shirt'], [/ব্লেজার/i, 'blazer'], [/জুতা|juta\b/i, 'shoes'], [/স্যান্ডেল/i, 'sandals'],
  [/ফতুয়া/i, 'fotua'], [/পায়জামা/i, 'pajama'], [/চাদর|শাল|chador/i, 'shawl'], [/টুপি/i, 'tupi'], [/জ্যাকেট/i, 'jacket'], [/সোয়েটার/i, 'sweater'], [/প্যান্ট/i, 'trousers'],
  // colors
  [/লাল|\blal\b/i, 'red'], [/সাদা|\bshada\b|\bsada\b/i, 'white'], [/কালো|\bkalo\b/i, 'black'], [/নীল|\bnil\b/i, 'blue'], [/সবুজ|shobuj|sabuj/i, 'green'],
  [/হলুদ রং|holud rong/i, 'yellow'], [/গোলাপি|golapi/i, 'pink'], [/মেরুন/i, 'burgundy'], [/ধূসর|ছাই/i, 'grey'], [/বাদামি|badami/i, 'brown'], [/কমলা|komola/i, 'orange'], [/বেগুনি|beguni/i, 'purple'], [/নেভি/i, 'navy'],
];
export const hasBangla = (s) => /[ঀ-৿]/.test(s || '');
// Returns the original text plus English keywords (so garment names still match).
export function normalizeBangla(text) {
  if (!text) return text;
  const src = toLatinDigits(text);
  const extra = [];
  for (const [re, en] of NORMALIZE) {
    const m = src.match(re); if (!m) continue;
    const w = typeof en === 'function' ? en(m) : en;
    if (!src.toLowerCase().includes(w.toLowerCase()) && !extra.includes(w)) extra.push(w); // idempotent
  }
  return extra.length ? `${src} ${extra.join(' ')}` : src;
}

// ---------------- (2) interface translation ----------------
const BN = {
  // navigation
  'Today': 'আজ', 'Stylist': 'স্টাইলিস্ট', 'Closet': 'আলমারি', 'Add item': 'পোশাক যোগ', 'Add': 'যোগ', 'Try-On': 'ট্রাই-অন', 'Plan': 'পরিকল্পনা', 'Insights': 'বিশ্লেষণ',
  'My style': 'আমার স্টাইল', 'Settings': 'সেটিংস', 'Install app': 'অ্যাপ ইনস্টল', 'Private by design': 'সম্পূর্ণ প্রাইভেট', 'Everything stays on this device': 'সবকিছু এই ডিভাইসেই থাকে',
  'Offline': 'অফলাইন', 'smart wardrobe': 'স্মার্ট আলমারি',
  // greetings & today
  'Good morning': 'শুভ সকাল', 'Good afternoon': 'শুভ অপরাহ্ন', 'Good evening': 'শুভ সন্ধ্যা', 'Good night': 'শুভ রাত্রি',
  'Curated for you': 'আপনার জন্য বাছাই', 'Today’s looks': 'আজকের লুক', 'Reshuffle': 'আবার সাজাও', 'Flat-lay': 'ফ্ল্যাট-লে', 'Mannequin': 'ম্যানিকিন', 'Style me': 'সাজিয়ে দাও',
  'Tomorrow': 'আগামীকাল', 'Wear this': 'এটা পরব', 'Logged': 'লগ হয়েছে', 'Why this score': 'এই স্কোর কেন', 'Stretch pick': 'নতুন ধাঁচ', 'Flatters you': 'আপনাকে মানায়',
  'Why it flatters you:': 'কেন আপনাকে মানায়:', 'Ask stylist': 'স্টাইলিস্টকে জিজ্ঞাসা', 'Chat about any outfit': 'যেকোনো পোশাক নিয়ে চ্যাট', 'Build a look': 'লুক বানান', 'Mix it yourself': 'নিজে মিলিয়ে নিন',
  'Plan week': 'সপ্তাহের পরিকল্পনা', 'No repeats': 'একই পোশাক বারবার নয়', 'Pack a trip': 'ভ্রমণের ব্যাগ', 'Fewest items': 'সবচেয়ে কম পোশাকে', 'See it on you': 'নিজের গায়ে দেখুন',
  'Rate my look': 'আমার লুক রেট করো', 'Mirror photo': 'আয়নার ছবি', 'Gaps & value': 'ঘাটতি ও মূল্য', 'Lookbook': 'লুকবুক', 'Saved looks': 'সেভ করা লুক', 'Laundry': 'লন্ড্রি', 'All clean': 'সব পরিষ্কার',
  'Declutter': 'আলমারি গোছান', 'Sell, donate, keep': 'বিক্রি, দান, রাখা', 'Should I buy?': 'কিনব কি?', 'Check before you buy': 'কেনার আগে যাচাই',
  'feels like': 'অনুভূত', 'bring a layer': 'একটা লেয়ার নিন', 'umbrella': 'ছাতা নিন', 'Review': 'রিভিউ', 'Install': 'ইনস্টল', 'Start': 'শুরু করুন', 'Log outfit': 'পোশাক লগ করুন',
  'Starter set': 'শুরুর সেট', 'Add clothes': 'পোশাক যোগ করুন', 'Load demo wardrobe': 'ডেমো আলমারি লোড করুন', 'Try the demo wardrobe': 'ডেমো আলমারি দেখুন',
  'Tops (or dresses)': 'টপস (বা ড্রেস)', 'Bottoms (or dresses)': 'বটমস (বা ড্রেস)', 'Pairs of shoes': 'জুতা জোড়া', 'Rain expected': 'বৃষ্টি হতে পারে', 'Set location': 'লোকেশন দিন',
  'No outfit fits these constraints': 'এই শর্তে কোনো পোশাক মেলে না', 'Check your closet & laundry': 'আলমারি ও লন্ড্রি দেখুন', 'Add a few more clothes': 'আরও কিছু পোশাক যোগ করুন', 'Clear': 'মুছুন',
  // occasions
  'Lounge': 'ঘরোয়া', 'Gym / active': 'জিম / খেলাধুলা', 'Casual': 'ক্যাজুয়াল', 'Smart casual': 'স্মার্ট ক্যাজুয়াল', 'Work': 'অফিস', 'Business': 'বিজনেস', 'Date / dinner': 'ডেট / ডিনার',
  'Cocktail party': 'ককটেল পার্টি', 'Formal / black tie': 'ফরমাল', 'Eid': 'ঈদ', 'Pohela Boishakh': 'পহেলা বৈশাখ', 'Gaye holud': 'গায়ে হলুদ', 'Wedding (biye)': 'বিয়ে', 'Puja': 'পূজা', 'Jummah': 'জুমা',
  // categories
  'All': 'সব', 'Top': 'টপ', 'Bottom': 'বটম', 'Outerwear': 'বাইরের পোশাক', 'Dress': 'ড্রেস / পুরো পোশাক', 'Footwear': 'জুতা', 'Accessory': 'অ্যাক্সেসরি', 'Headwear': 'মাথার পোশাক',
  'Tops': 'টপস', 'Bottoms': 'বটমস', 'Shoes': 'জুতা', 'Dresss': 'পুরো পোশাক',
  // closet / item
  'Your wardrobe': 'আপনার আলমারি', 'Any color': 'যেকোনো রং', 'Any season': 'যেকোনো ঋতু', 'Active': 'সক্রিয়', 'Clean only': 'শুধু পরিষ্কার', 'In laundry': 'লন্ড্রিতে',
  'Archived / donated / lent': 'আর্কাইভ / দান / ধার', 'Needs review': 'যাচাই বাকি', 'Everything': 'সবকিছু', 'Newest': 'নতুন আগে', 'Most worn': 'বেশি পরা', 'Least worn': 'কম পরা', 'Cost per wear': 'প্রতি পরায় খরচ', 'Color': 'রং',
  'Show original': 'আসল ছবি', 'Show cutout': 'কাটআউট', 'Fix cutout': 'কাটআউট ঠিক করুন', 'Re-tag': 'আবার ট্যাগ', 'Style this piece': 'এটা দিয়ে সাজাও', 'Open in builder': 'বিল্ডারে খুলুন', 'Favorite': 'প্রিয়',
  'Name': 'নাম', 'Category': 'ধরন', 'Type': 'টাইপ', 'Pattern': 'প্যাটার্ন', 'Fabric': 'কাপড়', 'Formality': 'ফরমালিটি', 'Fit': 'ফিট', 'Warmth (1–5)': 'উষ্ণতা (১–৫)', 'Season': 'ঋতু', 'Main color': 'প্রধান রং',
  'Second color': 'দ্বিতীয় রং', 'Brand': 'ব্র্যান্ড', 'Price paid': 'কেনা দাম', 'Purchased': 'কেনার তারিখ', 'Notes': 'নোট', 'Status': 'অবস্থা', 'Clean': 'পরিষ্কার', 'Worn': 'পরা হয়েছে', 'Dirty': 'ময়লা', 'Washing': 'ধোয়া হচ্ছে',
  'Lent out': 'ধার দেওয়া', 'Archived': 'আর্কাইভ', 'Donated': 'দান করা', 'Sold': 'বিক্রি হয়েছে', 'Never suggest this item': 'এটা কখনো সাজেস্ট করবে না', 'Outfits with this': 'এটা দিয়ে পোশাক', 'Similar items': 'একই রকম পোশাক',
  'Wear history': 'পরার ইতিহাস', 'Not worn yet.': 'এখনো পরা হয়নি।', 'Danger zone': 'সতর্কতা', 'Delete permanently': 'চিরতরে মুছুন', 'wears': 'বার পরা', 'cost / wear': 'খরচ / পরা', 'since worn': 'শেষ পরা', 'never': 'কখনো না',
  'Put everything in the wash': 'সব ধুতে দিন', 'Everything is clean': 'সব পরিষ্কার',
  // add
  'Build your closet': 'আলমারি সাজান', 'Camera': 'ক্যামেরা', 'Gallery': 'গ্যালারি', 'No photo': 'ছবি ছাড়া', 'Live quality checks': 'লাইভ মান যাচাই', 'Up to 50 at once': 'একসাথে ৫০টি পর্যন্ত',
  'Illustrated stand-in': 'আঁকা ছবি দিয়ে', 'These photos are': 'এই ছবিগুলো', 'Background work': 'পটভূমির কাজ', 'Processing queue': 'প্রসেসিং সারি', 'Add to wardrobe': 'আলমারিতে যোগ করুন',
  'Choose photos': 'ছবি বাছুন', 'Looks right': 'ঠিক আছে', 'Cutout': 'কাটআউট', 'Later': 'পরে', 'Quick check': 'দ্রুত যাচাই', 'All caught up': 'সব যাচাই শেষ',
  // stylist
  'Your stylist': 'আপনার স্টাইলিস্ট', 'On-device · private': 'ডিভাইসে · প্রাইভেট', 'New chat': 'নতুন চ্যাট', 'Wear': 'পরব', 'stretch': 'নতুন ধাঁচ',
  'What should I wear today?': 'আজ কী পরব?', 'Style my navy blazer': 'আমার নেভি ব্লেজার দিয়ে সাজাও', 'Dinner date tonight, it’s cold': 'আজ রাতে ডিনার, ঠান্ডা পড়েছে', 'Which colors suit me?': 'কোন রং আমাকে মানায়?',
  'Pack for 4 days': '৪ দিনের জন্য ব্যাগ গোছাও', 'What should I buy next?': 'এরপর কী কিনব?', 'What haven’t I worn lately?': 'কোনগুলো অনেকদিন পরিনি?', 'Surprise me': 'নতুন কিছু দেখাও',
  'Make it more casual': 'আরও ক্যাজুয়াল করো', 'Dress it up': 'আরও জমকালো করো', 'Show me another way': 'অন্যভাবে দেখাও', 'Eid outfit for tomorrow': 'কালকের ঈদের পোশাক', 'What to wear to a biye?': 'বিয়েতে কী পরব?',
  // try-on
  'Virtual fitting room': 'ভার্চুয়াল ট্রায়াল রুম', 'Try on': 'ট্রাই অন', 'Outfit': 'পোশাক', 'Suggest': 'সাজেস্ট', 'Photoreal try-on': 'বাস্তবসম্মত ট্রাই-অন', 'Generate with ChatGPT': 'ChatGPT দিয়ে তৈরি করুন',
  'Copy prompt only': 'শুধু প্রম্পট কপি', 'Scene': 'দৃশ্য', 'Occasion': 'উপলক্ষ', 'Your photo': 'আপনার ছবি', 'Studio background': 'স্টুডিও ব্যাকগ্রাউন্ড', 'Measure my body shape': 'শরীরের গড়ন মাপুন',
  'Replace photo': 'ছবি বদলান', 'Delete photo': 'ছবি মুছুন', 'Quick preview': 'দ্রুত প্রিভিউ', 'Add your full-body photo': 'আপনার পুরো শরীরের ছবি দিন', 'Take photo (5 s timer)': 'ছবি তুলুন (৫ সেকেন্ড টাইমার)',
  'Upload': 'আপলোড', 'Take mirror photo': 'আয়নার ছবি তুলুন', 'Share to ChatGPT': 'ChatGPT-তে শেয়ার', 'Download image': 'ছবি ডাউনলোড', 'Open ChatGPT': 'ChatGPT খুলুন', 'Copy prompt again': 'আবার প্রম্পট কপি',
  'See the prompt': 'প্রম্পট দেখুন', 'Log this outfit': 'এই পোশাক লগ করুন', 'Look score': 'লুক স্কোর', 'Looking great': 'দারুণ লাগছে', 'Good, with tweaks': 'ভালো, একটু বদলালে আরও ভালো', 'Let’s improve this': 'চলুন আরও ভালো করি',
  'Studio': 'স্টুডিও', 'City street': 'শহরের রাস্তা', 'Office': 'অফিস', 'Evening out': 'সন্ধ্যার আয়োজন', 'Flip camera': 'ক্যামেরা ঘোরান', 'Capture': 'ছবি তুলুন',
  // plan & insights
  'Look ahead': 'সামনের দিন', 'Week': 'সপ্তাহ', 'Trip packing': 'ভ্রমণের ব্যাগ', 'Calendar': 'ক্যালেন্ডার', 'Plan my week': 'আমার সপ্তাহ সাজাও', 'Pack for me': 'আমার ব্যাগ গোছাও', 'Wear today': 'আজ পরব',
  'Destination': 'গন্তব্য', 'Find': 'খুঁজুন', 'Start date': 'শুরুর তারিখ', 'Nights': 'রাত', 'Item cap': 'সর্বোচ্চ পোশাক', 'Upcoming': 'আসন্ন', 'Clear events': 'ইভেন্ট মুছুন', 'Import .ics': '.ics ইমপোর্ট',
  'Wardrobe intelligence': 'আলমারির বিশ্লেষণ', 'active pieces': 'সক্রিয় পোশাক', 'worn in 30 days': '৩০ দিনে পরা', 'outfits logged': 'লগ করা পোশাক', 'wardrobe value': 'আলমারির মূল্য',
  'Gap analysis': 'ঘাটতি বিশ্লেষণ', 'Dead stock': 'অব্যবহৃত পোশাক', 'Color palette': 'রঙের প্যালেট', 'Capsule generator': 'ক্যাপসুল আলমারি', 'Shopping advisor': 'কেনাকাটার পরামর্শ', 'Restyle from inspiration': 'ছবি দেখে সাজাও',
  'Generate': 'তৈরি করুন', 'Should I buy it?': 'এটা কিনব কি?', 'Most expensive per wear': 'প্রতি পরায় সবচেয়ে দামি', 'Best value': 'সবচেয়ে সাশ্রয়ী', 'By category': 'ধরন অনুযায়ী',
  'Buy': 'কিনুন', 'Maybe': 'হয়তো', 'Skip': 'বাদ দিন', 'Hot': 'গরম', 'Warm': 'উষ্ণ', 'Mild': 'মৃদু', 'Cold': 'ঠান্ডা', 'Freezing': 'হিমশীতল',
  // me
  'Edit profile': 'প্রোফাইল সম্পাদনা', 'Retune taste': 'রুচি আবার ঠিক করুন', 'Color season': 'রঙের সিজন', 'Your best shades': 'আপনার সেরা রং', 'Keep away from your face': 'মুখের কাছে এড়িয়ে চলুন',
  'Body & fit': 'শরীর ও ফিট', 'Style DNA': 'স্টাইল ডিএনএ', 'Wear log': 'পরার লগ', 'Achievements': 'অর্জন', 'outfits worn': 'পরা পোশাক', 'pieces': 'পোশাক', 'achievements': 'অর্জন', 'Edit': 'সম্পাদনা',
  'Measure from a photo': 'ছবি থেকে মাপুন', 'Your lookbook is empty': 'লুকবুক খালি', 'See today’s looks': 'আজকের লুক দেখুন',
  // settings
  'Preferences': 'পছন্দসমূহ', 'Style profile': 'স্টাইল প্রোফাইল', 'Appearance': 'চেহারা', 'Theme': 'থিম', 'Auto': 'অটো', 'Light': 'লাইট', 'Dark': 'ডার্ক', 'Accent color': 'প্রধান রং',
  'Outfit preview': 'পোশাক প্রিভিউ', 'Location & units': 'লোকেশন ও একক', 'Use my location': 'আমার লোকেশন', 'Search': 'খুঁজুন', 'Temperature': 'তাপমাত্রা', 'Currency': 'মুদ্রা',
  'On-device AI': 'ডিভাইসে এআই', 'AI tagging': 'এআই ট্যাগিং', 'AI background removal': 'এআই ব্যাকগ্রাউন্ড রিমুভ', 'Tag existing items': 'আগের পোশাক ট্যাগ করুন', 'Recommendation engine': 'সাজেশন ইঞ্জিন',
  'Reset weights': 'রিসেট', 'Morning brief': 'সকালের বার্তা', 'Notify me': 'নোটিফিকেশন দিন', 'Time': 'সময়', 'Your data': 'আপনার তথ্য', 'Export backup': 'ব্যাকআপ নিন', 'Import backup': 'ব্যাকআপ ফেরত আনুন',
  'Delete all my data': 'আমার সব তথ্য মুছুন', 'Privacy': 'গোপনীয়তা', 'Language': 'ভাষা', 'Region': 'অঞ্চল', 'Get the app': 'অ্যাপ নিন', 'Install on your phone': 'ফোনে ইনস্টল করুন', 'Installed': 'ইনস্টল করা আছে',
  'Installed on this device': 'এই ডিভাইসে ইনস্টল করা আছে', 'Retake': 'আবার দিন', 'Quick picks quiz': 'দ্রুত পছন্দ কুইজ', 'Profile, body & colors': 'প্রোফাইল, শরীর ও রং',
  'Sync & backup': 'সিঙ্ক ও ব্যাকআপ', 'Back up to Google Drive': 'Google Drive-এ ব্যাকআপ', 'Restore or sync from a backup': 'ব্যাকআপ থেকে ফেরত / সিঙ্ক', 'Merge (recommended)': 'একত্র করুন (সুপারিশকৃত)', 'Replace everything': 'সব বদলে দিন',
  'Modest dressing': 'শালীন পোশাক', 'I wear a hijab': 'আমি হিজাব পরি', 'South Asia': 'দক্ষিণ এশিয়া', 'Global': 'গ্লোবাল',
  // onboarding
  'Your private AI stylist': 'আপনার প্রাইভেট এআই স্টাইলিস্ট', 'Create my style profile': 'আমার স্টাইল প্রোফাইল তৈরি করুন', 'AI stylist chat': 'এআই স্টাইলিস্ট চ্যাট', 'Ask anything about what to wear': 'কী পরবেন, যেকোনো প্রশ্ন করুন',
  'Personal colors': 'নিজস্ব রং', 'Your season palette, even from a selfie': 'সেলফি থেকেও আপনার রঙের প্যালেট', 'Body-aware': 'শরীর বুঝে', 'Cuts and proportions that flatter you': 'যে কাট আপনাকে মানায়',
  'Auto-tags photos, works offline': 'ছবি অটো ট্যাগ, অফলাইনেও চলে', 'Continue': 'চালিয়ে যান', 'How do you identify?': 'আপনার লিঙ্গ পরিচয়?', 'Woman': 'নারী', 'Man': 'পুরুষ', 'Non-binary': 'নন-বাইনারি',
  'Prefer not to say': 'বলতে চাই না', 'Womenswear': 'মেয়েদের পোশাক', 'Menswear': 'ছেলেদের পোশাক', 'Both / gender-neutral': 'উভয় / জেন্ডার-নিউট্রাল', 'Height': 'উচ্চতা', 'Petite': 'খাটো', 'Average': 'মাঝারি', 'Tall': 'লম্বা',
  'Skin tone': 'গায়ের রং', 'Natural hair color': 'চুলের স্বাভাবিক রং', 'Analyze a selfie': 'সেলফি বিশ্লেষণ', 'Your color season': 'আপনার রঙের সিজন', 'Use this result': 'এই ফলাফল নিন', 'Upload photo': 'ছবি আপলোড',
  'Skip quick picks': 'কুইজ বাদ দিন', 'Add my own clothes': 'নিজের পোশাক যোগ করব', 'Explore with a demo wardrobe': 'ডেমো আলমারি দিয়ে দেখুন', 'Where do you dress?': 'আপনি কোন অঞ্চলের পোশাক পরেন?',
  'Shop smarter': 'বুঝে কিনুন', 'Closet health': 'আলমারির স্বাস্থ্য', 'estimated resale value': 'আনুমানিক বিক্রয়মূল্য', 'of closet worn in 90 days': '৯০ দিনে পরা পোশাক',
  'pieces to let go': 'বিদায় দেওয়ার পোশাক', 'forgotten gems': 'ভুলে যাওয়া পোশাক', 'Try again': 'আবার পরে দেখুন', 'What to do with each piece': 'কোন পোশাক নিয়ে কী করবেন', 'Suggestions': 'পরামর্শ',
  'Wishlist': 'উইশলিস্ট', 'Check the details': 'বিস্তারিত যাচাই', 'I bought it — add to closet': 'কিনেছি — আলমারিতে যোগ করুন', 'Save to wishlist': 'উইশলিস্টে রাখুন', 'new outfits': 'নতুন পোশাক-সমন্বয়', 'outfits it works in': 'যত লুকে মানাবে',
  'gaps it fills': 'ঘাটতি পূরণ', 'similar you own': 'একই রকম আছে', 'Analyze': 'বিশ্লেষণ করুন', 'Use whole image': 'পুরো ছবি ব্যবহার', 'Choose another': 'অন্যটি বাছুন', 'Choose a product screenshot': 'পণ্যের স্ক্রিনশট বাছুন',
  'Buy it': 'কিনুন', 'Skip it': 'কিনবেন না', 'End': 'শেষ', 'Wear it today': 'আজ এটা পরুন', 'Restore or sync': 'ফেরত / সিঙ্ক', 'Outfits it would make with your clothes': 'আপনার পোশাকের সাথে যে লুক হবে',
  'Should I buy?': 'কিনব কি?', 'Should I buy it?': 'এটা কিনব কি?', 'Mark sold': 'বিক্রি হয়েছে', 'Mark donated': 'দান হয়েছে', 'Open': 'খুলুন', 'Nothing to sell': 'বিক্রির কিছু নেই', 'Nothing to donate': 'দানের কিছু নেই',
  // shop / declutter / misc
  'Check before you buy (screenshot)': 'কেনার আগে যাচাই (স্ক্রিনশট)', 'Verdict': 'রায়', 'Price': 'দাম', 'Keep': 'রাখুন', 'Sell': 'বিক্রি করুন', 'Donate': 'দান করুন', 'Mark sold': 'বিক্রি হয়েছে',
  'Mark donated': 'দান হয়েছে', '30-wears challenge': '৩০ বার পরার চ্যালেঞ্জ', 'Start challenge': 'চ্যালেঞ্জ শুরু', 'Style it': 'এটা দিয়ে সাজাও', 'Cancel': 'বাতিল', 'Delete': 'মুছুন', 'Save': 'সেভ',
  'Are you sure?': 'আপনি কি নিশ্চিত?', 'Back to Today': 'আজকের পাতায় ফিরুন', 'Something went wrong': 'কিছু একটা ভুল হয়েছে', 'Close': 'বন্ধ', 'Done': 'শেষ', 'Saved': 'সেভ হয়েছে',
  'Something went wrong — try again': 'কিছু ভুল হয়েছে — আবার চেষ্টা করুন', 'Ask about any outfit, piece, color or trip…': 'যেকোনো পোশাক, রং বা ভ্রমণ নিয়ে জিজ্ঞাসা করুন…',
  'Best buys for your closet': 'আপনার আলমারির জন্য সেরা কেনাকাটা', 'What to buy next to make the most new outfits': 'কী কিনলে সবচেয়ে বেশি নতুন লুক হবে', 'Top pick': 'সেরা পছন্দ', 'Best pick': 'সেরা পছন্দ',
  'Wear with': 'সাথে পরুন', 'Great color for you': 'আপনার জন্য দারুণ রং', 'Okay color for you': 'চলনসই রং', 'Not your best color': 'আপনার সেরা রং নয়', 'Which one should you buy?': 'কোনটা কিনবেন?',
  'Re-check against my closet now': 'এখনকার আলমারির সাথে আবার মিলিয়ে দেখুন', 'Choose product screenshots': 'পণ্যের স্ক্রিনশট বাছুন', 'All types': 'সব ধরন', 'Care label': 'কেয়ার লেবেল', 'Care': 'যত্ন', 'Scan care label': 'কেয়ার লেবেল স্ক্যান করুন', 'Save care': 'সেভ করুন', 'Take photo': 'ছবি তুলুন', 'Choose photo': 'ছবি বাছুন', 'Edit / rescan': 'বদলান / আবার স্ক্যান', 'Fabric (from the label)': 'কাপড় (লেবেল থেকে)', 'App updates': 'অ্যাপ আপডেট', 'Check now': 'এখন দেখুন', 'Update': 'আপডেট', 'Reload': 'রিলোড',
  'Take a sharp, close photo of the whole label. It is read on your phone — nothing is uploaded.': 'পুরো লেবেলের কাছ থেকে পরিষ্কার ছবি তুলুন। ফোনেই পড়া হয় — কিছুই আপলোড হয় না।',
  'Photograph the washing label inside — the fabric and washing rules are filled in for you.': 'ভেতরের ধোয়ার লেবেলের ছবি তুলুন — কাপড় আর ধোয়ার নিয়ম নিজে থেকেই বসে যাবে।','What to buy next': 'এরপর কী কিনবেন', 'What to buy': 'কী কিনবেন', 'See all': 'সব দেখুন', 'Check something you want to buy': 'যা কিনতে চান তা যাচাই করুন', 'See all best buys': 'সব সেরা কেনাকাটা দেখুন','Dresses': 'ড্রেস', 'Layers': 'লেয়ার',
  'Describe your day — “dinner, then somewhere cold”': 'আপনার দিনটা লিখুন — “রাতে দাওয়াত, ঠান্ডা পড়বে”', 'Search a city': 'শহর খুঁজুন', 'Your first name': 'আপনার নাম',
};
const RX = [
  [/^Look (\d+)$/, 'লুক $1'], [/^\+(\d+) outfits$/, '+$1টি লুক'], [/^Unlocks \+(\d+) new outfits$/, '+$1টি নতুন লুক হবে'], [/^(\d+) pieces$/, '$1টি পোশাক'], [/^(\d+) items?$/i, '$1টি আইটেম'], [/^(\d+)-day streak$/, '$1 দিনের ধারাবাহিকতা'],
  [/^(\d+) in the basket$/, 'ঝুড়িতে $1টি'], [/^(\d+) unlocked$/, '$1টি অর্জিত'], [/^(\d+) left$/, 'বাকি $1টি'], [/^Review (\d+)$/, '$1টি রিভিউ'], [/^Laundry \((\d+)\)$/, 'লন্ড্রি ($1)'],
  [/^(.+) pieces · (.+) in value$/, '$1টি পোশাক · মূল্য $2'], [/^(\d+) of (\d+) tops & layers flatter you$/, '$2টির মধ্যে $1টি টপ/লেয়ার আপনাকে মানায়'],
  [/^Three looks from your own closet, chosen for (.+?)(?:, your (.+) colors)? and today’s weather\.$/, (m, occ, season) => `আপনার আলমারি থেকে তিনটি লুক — ${BN[occ.replace(/^./, (c) => c.toUpperCase())] || occ}${season ? `, আপনার ${season} রং` : ''} ও আজকের আবহাওয়া অনুযায়ী।`],
  [/^feels like · (.+) · (.+)$/, (m, d, c) => `অনুভূত · ${WX[d] || d} · ${c}`], [/^(.+°[CF]) am$/, '$1 সকালে'], [/^(.+°[CF]) pm$/, '$1 রাতে'],
  [/^(\d+)% rain$/, 'বৃষ্টি $1%'], [/^(\d+)% humid$/, 'আর্দ্রতা $1%'], [/^(\d+) wears · (\d+) matching pieces/, '$1 বার পরা · $2টি মানানসই পোশাক'],
  [/^Day (\d+)/, 'দিন $1'], [/^(\d+) of (\d+) pieces reached 30 wears$/, '$2টির মধ্যে $1টি ৩০ বার পরা হয়েছে'],
];
const WX = { 'Clear': 'পরিষ্কার আকাশ', 'Mostly clear': 'প্রায় পরিষ্কার', 'Partly cloudy': 'আংশিক মেঘলা', 'Overcast': 'মেঘলা', 'Fog': 'কুয়াশা', 'Drizzle': 'গুঁড়ি গুঁড়ি বৃষ্টি', 'Light rain': 'হালকা বৃষ্টি', 'Rain': 'বৃষ্টি', 'Heavy rain': 'ভারী বৃষ্টি', 'Showers': 'ঝরো বৃষ্টি', 'Violent showers': 'প্রবল বৃষ্টি', 'Thunderstorm': 'বজ্রঝড়', 'Light snow': 'হালকা তুষার', 'Snow': 'তুষার', 'Heavy snow': 'ভারী তুষার', 'Manual': 'নিজে দেওয়া' };
Object.assign(BN, {
  'Install Atelier on your phone': 'Atelier ফোনে ইনস্টল করুন', '— full-screen, offline, one tap from your home screen.': '— পুরো স্ক্রিনে, অফলাইনে, হোম স্ক্রিন থেকে এক ট্যাপে।',
  'What did you wear today?': 'আজ কী পরেছিলেন?', 'Logging it is the strongest learning signal.': 'লগ করলে অ্যাপ আপনার রুচি সবচেয়ে ভালো শেখে।',
  'Complete your style profile': 'স্টাইল প্রোফাইল সম্পূর্ণ করুন', '— gender, body shape and colors make every look more flattering.': '— লিঙ্গ, শরীরের গড়ন ও রং দিলে প্রতিটি লুক আরও মানানসই হয়।',
  'Back up your wardrobe': 'আলমারির ব্যাকআপ নিন', 'Back up': 'ব্যাকআপ', 'new item waiting for a quick check': 'নতুন পোশাক যাচাইয়ের অপেক্ষায়', 'new items waiting for a quick check': 'নতুন পোশাক যাচাইয়ের অপেক্ষায়',
  'Three looks from your own closet': 'আপনার আলমারি থেকে তিনটি লুক', 'pieces': 'পোশাক', 'Why this score': 'স্কোর কেন এমন',
});
const PHRASES = [
  ['easy neutral palette', 'সহজ নিউট্রাল রং'], ['neutral-anchored palette', 'নিউট্রাল-ভিত্তিক রং'], ['tonal, monochrome look', 'এক রঙের টোনাল লুক'], ['analogous colors that sit together', 'কাছাকাছি রং যা মিলে যায়'],
  ['complementary colors', 'বিপরীত রঙের সুন্দর মিল'], ['formality matches the occasion', 'অনুষ্ঠানের সাথে মানানসই'], ['warmth matches the forecast', 'আবহাওয়ার সাথে মানানসই উষ্ণতা'],
  ['matches your style profile', 'আপনার স্টাইলের সাথে মেলে'], ['balanced silhouette', 'ভারসাম্যপূর্ণ গড়ন'], ['one statement pattern', 'একটি নজরকাড়া প্যাটার্ন'], ['clean solids', 'সাধারণ এক রং'],
  ['a festive traditional look for Eid', 'ঈদের উৎসবমুখর ঐতিহ্যবাহী লুক'], ['classic red-and-white for Pohela Boishakh', 'পহেলা বৈশাখের লাল-সাদা'], ['yellow and marigold tones for the holud', 'গায়ে হলুদের হলুদ-কমলা রং'],
  ['rich wedding colors', 'বিয়ের জমকালো রং'], ['red, white and gold for puja', 'পূজার লাল, সাদা ও সোনালি'], ['clean, modest whites for Jummah', 'জুমার জন্য পরিচ্ছন্ন সাদা'], ['traditional look for', 'ঐতিহ্যবাহী লুক:'],
  ['breathable fabrics for', 'আরামদায়ক কাপড়, আর্দ্রতা'], ['% humidity', '%'], ['darker bottom balances your hips', 'গাঢ় নিচের অংশ গড়নে ভারসাম্য আনে'], ['sits in your', 'আপনার'], ['palette', 'প্যালেটে মানায়'],
  [' under the ', ' — উপরে '], [' with the ', ' আর '], ['you haven’t worn the', 'অনেকদিন পরা হয়নি:'], ["you haven't worn the", 'অনেকদিন পরা হয়নি:'], [' days', ' দিন'],
  [', work,', ', অফিস,'], [', casual,', ', ক্যাজুয়াল,'], ['date / dinner', 'ডেট / ডিনার'], ['smart casual', 'স্মার্ট ক্যাজুয়াল'],
  ['% rain', '% বৃষ্টি'], ['Here’s how I’d wear your', 'আপনার এটা এভাবে পরতে পারেন:'],
  ['Something a little different — a stretch pick from pieces you rarely combine', 'একটু ভিন্ন কিছু — যে পোশাকগুলো সাধারণত একসাথে পরেন না'],
  ['These have been waiting the longest:', 'এগুলো সবচেয়ে বেশিদিন পরা হয়নি:'], ['never worn', 'কখনো পরা হয়নি'], ['Low score — other pieces keep winning', 'অন্য পোশাক বেশি মানানসই হচ্ছে'],
  ['You’re a', 'আপনি'], ['Your best shades:', 'আপনার সেরা রং:'], ['Keep these away from your face:', 'এগুলো মুখের কাছে এড়িয়ে চলুন:'],
];

function trMain(s) {
  const raw = s.trim(); if (!raw) return null;
  const m = raw.match(/^(.*?)([,.:!]?)$/);
  if (BN[raw]) return s.replace(raw, BN[raw]);
  if (m && m[2] && BN[m[1]]) return s.replace(raw, BN[m[1]] + m[2]);
  for (const [re, rep] of RX) if (re.test(raw)) return s.replace(raw, raw.replace(re, rep)); // rep may be a string or a function
  if (raw.length < 12 || !/[a-z]/i.test(raw)) return null;
  let out = raw, hit = false;
  for (const [en, bn] of PHRASES) if (out.includes(en)) { out = out.split(en).join(bn); hit = true; }
  return hit ? s.replace(raw, out) : null;
}
const ATTRS = ['placeholder', 'title', 'aria-label'];
const SKIP = 'script,style,textarea,.no-tr,code,pre';
function translateTree(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) { const t = trMain(n.nodeValue); if (t != null && t !== n.nodeValue) n.nodeValue = t; }
  const els = root.querySelectorAll ? root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')) : [];
  for (const el of els) for (const a of ATTRS) { const v = el.getAttribute(a); if (!v) continue; const t = trMain(v); if (t != null && t !== v) el.setAttribute(a, t); }
}

let observer = null;
export function applyLanguage() {
  const bn = lang() === 'bn';
  document.documentElement.lang = bn ? 'bn' : 'en';
  observer?.disconnect(); observer = null;
  if (!bn) return;
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { const t = trMain(m.target.nodeValue); if (t != null && t !== m.target.nodeValue) m.target.nodeValue = t; }
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); const t = v && trMain(v); if (t != null && t !== v) m.target.setAttribute(m.attributeName, t); }
      else for (const n of m.addedNodes) { if (n.nodeType === 3) { const t = trMain(n.nodeValue); if (t != null && t !== n.nodeValue) n.nodeValue = t; } else if (n.nodeType === 1) translateTree(n); }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
export const tr = (s) => (lang() === 'bn' ? (trMain(s) ?? s) : s);

// Dates in Bangla when the interface is Bangla
const origDate = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (loc, opts) { return origDate.call(this, loc ?? (document.documentElement.lang === 'bn' ? 'bn-BD' : undefined), opts); };
