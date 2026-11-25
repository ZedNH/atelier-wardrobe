# Smart Wardrobe — free AI stylist (web + installable phone app)

A complete, working build of the *AI-Powered Smart Wardrobe System* plan. It recommends **only clothes you own**,
explains every suggestion, and keeps everything **private on your device**.

**Cost: 0.** No server, no account, no API keys, no subscriptions.
| Need | Free thing used |
|---|---|
| App | Plain HTML/JS Progressive Web App: runs in any modern browser and installs on Android/iPhone like a native app |
| Storage | IndexedDB on your own device |
| AI tagging + style vectors | CLIP running **in the browser** via Transformers.js (≈150 MB one-time download, then offline) |
| AI background removal (optional) | RMBG-1.4 in the browser (≈45 MB, non-commercial license). A built-in cutout works without it |
| Weather | Open-Meteo (free, no key) |
| Hosting (for your phone) | GitHub Pages / Netlify / Cloudflare Pages free tiers |

## Run it on this computer
1. Double-click **`start.bat`**. It opens http://localhost:8765 in your browser. Keep the black window open while you use the app.
   (It needs Python, which is free from python.org. On Mac/Linux run `python3 -m http.server 8765` in this folder.)
2. Create your style profile (name, gender, clothing focus, body shape, colors, style vibes, optional quick-picks quiz), set your city, then choose **Add my clothes** or **Explore with a demo wardrobe** (womenswear, menswear or mixed, matching your profile).
3. Optional: go to **Settings → On-device AI** and switch on AI tagging.

> Opening `index.html` by double-clicking it won't work. Browsers block app modules on `file://`, so use `start.bat`.

## Android app (APK)
A ready-to-install APK is in **`dist\Atelier-1.3.apk`**. It needs Android 7.0 or newer. The whole app is bundled inside, so no website or hosting is needed.
1. Copy the APK to your phone (USB cable, Google Drive, or send it to yourself on WhatsApp or Telegram).
2. Tap it. If Android asks, allow **Install unknown apps** for the app you opened it from (Files, Chrome, Drive…).
3. Tap **Install**, then open **Atelier**. Allow the camera and location when asked.

Inside the app, camera and gallery photos, location weather, Save image (to `Pictures/Atelier`), backups (to `Downloads/Atelier`) and **Share to ChatGPT** all go through native Android.
Rebuild after changes with `python tools\build_apk.py`. It needs Java 17 and the `android-sdk` folder; no Android Studio or Gradle required.
**Keep `android\atelier-release.jks` and `android\keystore.properties` safe.** Updates must be signed with the same key, or Android refuses to install them over the old version.

## Put it on your phone (free, about 5 minutes)
The camera and the "install app" feature need **https**, so put the site on a free static host.
Run **`python tools\build_deploy.py`** to make an upload-ready copy in **`deploy\atelier-site`** (plus `deploy\atelier-site.zip`). It is *flat*, with every file at the top level and no subfolders, because drag-and-drop uploads sometimes skip subfolders.
- **Netlify Drop**: go to https://app.netlify.com/drop and sign in for free. Open `deploy\atelier-site`, press **Ctrl+A**, and drag all the files onto the page. You get an https link; set **Who can see it → Public**. To update later, rebuild, then use **Drop new files** and drag all files again.
- **GitHub Pages**: create a repository, upload these files, then go to Settings → Pages → Deploy from branch (`main`, root).
- **Cloudflare Pages**: choose Upload assets and drop in the folder.

Open the link on your phone. On Android/Chrome tap **Install app**. On iPhone/Safari tap Share → **Add to Home Screen**.
Your data stays on each device. Use **Settings → Export/Import backup** to move it between devices.

## Advanced features (v2)
- **Style profile**: gender identity and a separate clothing focus (womenswear / menswear / both). Nothing is ever hidden; the focus only changes ordering, staple suggestions, the demo wardrobe and the mannequin figure.
- **Personal color season**: 12-season analysis from skin tone, undertone and hair color, or measured from a **selfie on the device** (skin pixels in LAB; the photo is never stored). Every top and layer is checked against your palette.
- **Body-aware styling**: body shape (hourglass/trapezoid, pear/triangle, inverted triangle, apple/oval, rectangle) and height feed a new **"Flatters you"** score in every outfit, with tips.
- **AI Stylist chat**: ask for outfits in plain words, "style my navy blazer", colors, body tips, packing, a week plan, what to buy, what you haven't worn, laundry, value. Follow-ups like "dress it up" refine the last answer.
- **My Style page**: color-season palette, body & fit guide, **Style DNA** radar with your archetype (e.g. "Modern Classic"), wear-log heatmap and streak, 10 achievements, and a **lookbook** of saved looks (the heart on any outfit).
- **Design**: editorial redesign with serif display type, line icons, light/dark/auto theme and five accent colors, desktop sidebar and a floating phone nav.

## v1.7: smarter styling, swipe navigation, AI providers
- **Dress codes**: every occasion has real rules. Gym = athletic wear only (no jeans or shirts). Work = no shorts, joggers or graphic tees. Formal/wedding = no t-shirts, jeans or sneakers. Looks are finished with fitting accessories (watch, belt, sunglasses, bag, tie and pocket square with tailoring). Each look also has an **+ Accessories** button.
- **New Today page**: compact weather header; sticky day and occasion bar (the occasion you pick stays when you switch to Tomorrow); swipeable look carousel; shortcut grid.
- **Swipe between tabs** (Today ↔ Closet ↔ Stylist ↔ Try-On) with slide animations and a sliding dock indicator.
- **All outfits** page: every distinct combination for an occasion, best first.
- **Closet**: tabs for In closet / Sold / Donated / Lent / Archived with Restore; Select mode to sell, donate, archive or delete many pieces; a remove menu on each item.
- **Photos**: a Paste button next to every photo picker (the Android app reads the copied image natively), Ctrl+V anywhere, and a camera button on Shop.
- **More types**: sunglasses (own icon), eyeglasses, smartwatch, backpack, clutch, wallet, necklace, earrings, bracelet, ring, cufflinks, pocket square, track pants, sports shorts, sports bra, crop top, camisole, tunic, flip-flops, slides, wedges, mules, bucket hat, headband.
- **AI stylist brain (your own key)**: Claude, ChatGPT, Gemini, Grok, DeepSeek or OpenRouter (Settings → AI stylist brain). The Stylist chat sends a text list of your clothes (no photos) and gets outfits back by item.
- **Buying ideas**: colored product illustrations, “+N outfits”, “pairs with N tops · N shoes”, and a **Find it online** search (Daraz in South Asia, Google Shopping elsewhere).
- Profile has a Settings button; Backup moved to the bottom of Settings.

## v1.3: speed, fashion AI, clean cut-outs, best buys
- **No more freezing**: every AI model runs in a background worker, and long jobs (review queue, re-tagging, gap analysis) pause between items so taps and scrolling stay smooth. Closet grids load small thumbnails only when they scroll into view.
- **Fashion-tuned AI**: Marqo FashionCLIP (a one-time ~145 MB download, then offline) replaces the general CLIP model. Each photo is read twice (the original and the cut-out) and the results are averaged. On about 150 real shop photos it gets the exact type right about **71%** of the time, up from about 60%. Polos, kurtas, sarees, sunglasses and cargo pants are strong; track pants vs. trousers and some shoes are weaker. **It learns from your corrections**: every item you confirm teaches it your own clothes.
- **Clean cut-outs**: a new matting step removes the white halo and specks around clothes shot on light backgrounds, while keeping white details inside the garment (zips, collars).
- **Try-On, reworked**: *Share to ChatGPT* now sends **both** your photo and the clothes sheet, with the prompt copied. You can also *Generate here with your own key* (Gemini or OpenAI; the key stays on your device), or use the quick drag-and-pinch overlay preview.
- **Closet organization**: garment icons for each category and type, a type filter row (Polo, Jeans, Saree…), and items waiting for a check stay visible with a "Check" badge instead of disappearing.
- **Best buys for your closet** (Shop page): tests about 170 type + color ideas against everything you own and lists the pieces that would unlock the most **new outfits**, e.g. "Grey chinos +303 outfits". Each one shows whether the color suits you and what to wear it with. You can filter by tops, bottoms, shoes and dresses.
- **Which one should I buy?** Pick several product screenshots at once and they are ranked by how many new outfits each unlocks, with a *Best pick*. The wishlist is ranked the same way and can be re-checked against your current closet.

## v4: Bangla, South Asian wear, smart shopping, declutter, sync
- **Bangla (বাংলা) interface**: Settings → Language. The stylist and the Ask box understand Bangla and Banglish ("kal biye te ki porbo?").
- **South Asian wardrobe**: saree, salwar kameez, kurti, panjabi, sherwani, lehenga, anarkali, churidar, pajama, lungi, fotua, koti, dupatta/orna, hijab, tupi, nagra, kolhapuri, shawl.
- **South Asian occasions**: Eid, Pohela Boishakh, Gaye holud, Biye, Puja, Jummah. Each has a festive color palette and favors traditional pieces. A pairing rule stops combinations like saree + loafers + belt.
- **Climate rules**: humidity is read from the forecast, and sticky heat favors breathable cotton and linen. Monsoon days favor sandals. Bangladesh's Friday–Saturday weekend is used.
- **Modest dressing and hijab**: optional. No shorts or tank tops, and a color-matched hijab is added to every look.
- **Should I buy this?** Share a product screenshot from Daraz or Instagram to Atelier (Android app, or the installed web app), or upload or paste one. You get a verdict compared with the pieces you own, the outfits it makes, duplicates, your color fit, body-shape advice, cost per wear, and a wishlist.
- **Declutter & resell**: Sell / Donate / Try again / Keep for every piece, each with a reason and an estimated resale value. Includes a 30-wears challenge.
- **Sync & backup via Google Drive**: one-tap backup to Drive, and restore with *Merge* (both devices combined; the newest edit wins) or *Replace*.

## v3: photo AI and try-on
- **Body shape from a photo**: MediaPipe Pose (free, on-device) traces your silhouette and measures shoulders, waist and hips, then shows the measured lines on your photo.
- **Sharper color analysis**: MediaPipe multiclass segmentation finds your face skin and hair. It applies a white-balance correction and measures in LAB. Hair color is detected automatically.
- **Try-On Studio**: your full-body photo wearing any outfit (instant, on-device, with a studio-background cut-out).
- **Generate with ChatGPT**: builds a reference sheet (your photo + numbered garments) and a professional prompt, copies it, then shares to the ChatGPT app or opens chatgpt.com for a photoreal render.
- **Rate my look**: a mirror selfie is scored for color harmony, palette fit and body balance, with tips. It also finds the matching pieces in your closet so you can log the outfit.
- Every look card now says **why it flatters you**.

## What's in it (mapped to the plan)
- **Capture**: live camera with a guide overlay and live blur, light and framing checks, batch shooting, gallery bulk import (up to 50 photos), and a background queue that never blocks shooting. Image-hash de-duplication means re-uploads cost nothing.
- **Vision pipeline**: quality gate, segmentation (built-in LAB flood fill, or AI), trim, **k-means in LAB** color extraction with named buckets, zero-shot attributes limited to fixed enums with a confidence per attribute, a "not a garment" filter, warmth and season derived deterministically, a stored CLIP style vector, and a low-confidence "confirm these" queue.
- **Review queue**: swipeable cards. One tap confirms, two taps correct, and manual crop is always available.
- **Recommender**: hard filters (availability and laundry, temperature, rain, formality window, exclusions), then anchor-first candidate generation, then a weighted score (harmony 25 / formality 20 / weather 15 / pattern 10 / silhouette 10 / novelty 10 / preference 10, adjustable in Settings), then diversification (MMR) with one exploration "stretch" pick. Each pick comes with a template rationale built from real numbers.
- **Context**: live weather including the morning-to-evening drop, occasion presets and dress-code library, `.ics` calendar import with dress-code inference, and free-text requests ("dinner that goes somewhere cold after").
- **Previews**: client-side flat-lay compositing and a 2D mannequin view. Outfits can be shared or downloaded as an image card.
- **Learning**: wear log (strongest signal), manual outfits, likes and dislikes, accepted vs. dismissed, item affinity with decay, and a logistic preference vector shrunk toward a quiz + wardrobe + population prior. The style profile is visible, can be switched off, and can be exported. Attribute corrections are kept in a separate stream.
- **Laundry**: clean → worn → dirty → washing → clean, with wears-before-wash per fabric, laundry-day auto reset, and stale-state demotion.
- **Insights**: gap analysis (occasion × weather matrix plus "one X would create N outfits"), cost-per-wear, dead stock grouped by reason, color palette map, capsule generator, shopping advisor (new outfits unlocked plus duplicate check), and inspiration-photo restyle.
- **Plan**: no-repeat week planner with laundry simulation, and a trip packing solver (minimum item set, forecast-aware, carry-on cap, checklist).
- **Privacy**: no hard-delete by default (archive, donate, lend). Permanent delete and "delete all data" are available. Nothing is uploaded.

## Honest limits
- The AI is FashionCLIP (zero-shot plus learning from your confirmed items), not a large vision-language model. The exact type is right about 7 times in 10 on shop photos, and category more often. Fabric and fit are often guesses, so they are flagged for a quick check.
- The first AI download (~145 MB) needs internet and takes a few minutes on mobile data. Tagging takes about 1 second per photo on a laptop and longer on older phones.
- Morning-brief notifications fire only while the app is open or installed. There is no push server, to keep it free.
- Built-in generative try-on is not free on-device. Photoreal try-on goes through ChatGPT (share), or through your own Gemini or OpenAI key, which the provider may bill.
- "Outfits unlocked" counts outfits the app's style rules accept for casual, smart-casual and work days (plus Eid in South Asia mode), so it is a fair comparison between items, not a promise that you will wear every one.
- Photo analysis depends on lighting and clothing: use daylight for selfies, and fitted clothes with arms slightly out for body photos. You can always override the result.
- The on-device try-on is a quick 2D preview (garment cut-outs placed on your photo), not a photoreal render. For realism use "Generate with ChatGPT". That step sends your photo to OpenAI, and only when you attach it yourself.
- The photo AI models (~15 MB) download from Google's CDN the first time they are used.
- The stylist chat is rule-based (no cloud AI model), so it understands common phrasings rather than any free-form sentence.
