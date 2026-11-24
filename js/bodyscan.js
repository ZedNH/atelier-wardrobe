// Free on-device photo analysis with Google MediaPipe (Apache-2.0), loaded from CDN once and then cached:
//  • Body shape: pose landmarks + person segmentation → silhouette widths at shoulders / waist / hips.
//  • Coloring: multiclass selfie segmentation → face-skin and hair pixels, white-balanced, measured in LAB.
// Photos are processed in memory only and never stored or uploaded.
import { rgbToLab, labToHex } from './color.js';
import { clamp, mean } from './util.js';
import { makeCanvas } from './vision.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODELS = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  poseLite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  seg: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};
let lib = null, fileset = null, pose = null, seg = null;
async function base() {
  if (!lib) { lib = await import(`${MP}/vision_bundle.mjs`); fileset = await lib.FilesetResolver.forVisionTasks(`${MP}/wasm`); }
  return lib;
}
// The lite model on CPU is the most reliable across phones and browsers (GPU can stall in background tabs).
export async function loadPose() {
  if (pose) return pose;
  const L = await base();
  pose = await L.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.poseLite, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: true });
  return pose;
}
// run pose detection; if the WASM runtime aborts, rebuild the task once and retry
async function detectPose(canvas) {
  try { return (await loadPose()).detect(canvas); }
  catch {
    try { pose?.close(); } catch { /* already dead */ }
    pose = null;
    return (await loadPose()).detect(canvas);
  }
}
export async function loadSeg() {
  if (seg) return seg;
  const L = await base();
  seg = await L.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODELS.seg, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false });
  return seg;
}

export function fitCanvas(src, max = 960) {
  const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = makeCanvas(Math.round(w * s), Math.round(h * s));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// ---------------- Body shape ----------------
// Thresholds on silhouette width ratios (shoulders/hips, waist/hips), separate per clothing focus because
// frontal shoulder silhouettes are naturally wider on men.
const TH = {
  women: { inv: 1.18, tri: 0.98, round: 0.92, waisted: 0.75 },
  men: { inv: 1.30, tri: 1.06, round: 0.97, waisted: 0.86 },
  all: { inv: 1.24, tri: 1.02, round: 0.94, waisted: 0.80 },
};
export function classifyBody({ S, W, H }, wear = 'all') {
  const t = TH[wear] || TH.all;
  const s = S / H, wh = W / H, ws = W / S;
  if (wh >= t.round && ws >= 0.9) return 'round';
  if (s >= t.inv) return 'inverted';
  if (s <= t.tri) return 'triangle';
  if (wh <= t.waisted) return 'balanced';
  return 'rectangle';
}

// x of a polyline (shoulder→elbow→wrist) at row y, or null when the arm does not cross that row
function armXAt(pts, y) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return null;
}

// Pose landmarks + person mask for a full-body photo (shared by body measurement and try-on)
export async function detectBody(canvas) {
  const r = await detectPose(canvas);
  if (!r.landmarks?.length) return null;
  const mask = r.segmentationMasks?.[0];
  const out = { lm: r.landmarks[0].map((p) => ({ x: p.x, y: p.y, v: p.visibility ?? 1 })), mw: mask?.width, mh: mask?.height, mask: mask ? mask.getAsFloat32Array().slice() : null };
  mask?.close?.();
  return out;
}

export async function measureBody(canvas, wear = 'all') {
  const r = await detectPose(canvas);
  if (!r.landmarks?.length) return { error: 'I could not find a person. Stand in good light with your whole body in the frame.' };
  const lm = r.landmarks[0];
  const mask = r.segmentationMasks?.[0];
  if (!mask) return { error: 'Body outline not available — try another photo.' };
  const mw = mask.width, mh = mask.height; const m = mask.getAsFloat32Array().slice(); mask.close?.();
  const vis = (i) => (lm[i].visibility ?? 1);
  if ([11, 12, 23, 24].some((i) => vis(i) < 0.5)) return { error: 'Shoulders and hips must be clearly visible. Step back so you are in frame from head to knees.' };
  if ([25, 26].every((i) => vis(i) < 0.35)) return { error: 'Step back a little — I need to see you at least down to your knees.' };
  const px = (p) => ({ x: p.x * mw, y: p.y * mh });
  const sL = px(lm[11]), sR = px(lm[12]), hL = px(lm[23]), hR = px(lm[24]);
  const sy = (sL.y + sR.y) / 2, hy = (hL.y + hR.y) / 2, T = hy - sy;
  const cx = (sL.x + sR.x + hL.x + hR.x) / 4;
  const shoulderDist = Math.hypot(sL.x - sR.x, sL.y - sR.y);
  if (T < mh * 0.12) return { error: 'You are too far away — come a bit closer so your body fills more of the frame.' };
  if (shoulderDist / T < 0.45) return { error: 'Please face the camera straight on (you seem turned to the side).' };
  const tilt = Math.abs(sL.y - sR.y) / shoulderDist;
  const arms = [[11, 13, 15], [12, 14, 16]].map((ix) => ix.map((i) => px(lm[i])));
  const armHalf = shoulderDist * 0.09;

  // width of the silhouette run that contains the body centre, trimmed where an arm touches the torso
  const runAt = (yf) => {
    const y = Math.round(yf); if (y < 0 || y >= mh) return null;
    const on = (x) => x >= 0 && x < mw && m[y * mw + x] > 0.5;
    let x0 = Math.round(cx); if (!on(x0)) { let k = 1; while (k < mw * 0.1 && !on(x0 - k) && !on(x0 + k)) k++; x0 = on(x0 - k) ? x0 - k : x0 + k; if (!on(x0)) return null; }
    let l = x0, rr = x0; while (on(l - 1)) l--; while (on(rr + 1)) rr++;
    let trimmed = false;
    for (const a of arms) {
      const ax = armXAt(a, y); if (ax == null) continue;
      if (ax < cx && ax - armHalf > l && ax < rr) { l = Math.max(l, ax + armHalf); trimmed = true; }
      if (ax > cx && ax + armHalf < rr && ax > l) { rr = Math.min(rr, ax - armHalf); trimmed = true; }
    }
    return { y, l, r: rr, w: rr - l, trimmed };
  };
  const band = (a, b, pick) => { let best = null; for (let y = sy + a * T; y <= sy + b * T; y += Math.max(1, T / 60)) { const x = runAt(y); if (x && x.w > 0 && (!best || pick(x.w, best.w))) best = x; } return best; };
  const shoulders = band(-0.02, 0.12, (a, b) => a > b);
  const waist = band(0.45, 0.85, (a, b) => a < b);
  const hips = band(0.95, 1.35, (a, b) => a > b);
  if (!shoulders || !waist || !hips) return { error: 'I could not trace your outline. Use a plain background and stand with arms slightly away from your body.' };
  const S = shoulders.w, W = waist.w, H = hips.w;
  const shape = classifyBody({ S, W, H }, wear);
  const conf = clamp(1 - tilt * 3 - (waist.trimmed ? 0.15 : 0) - (hips.trimmed ? 0.1 : 0), 0.3, 1) * clamp(mean([11, 12, 23, 24].map(vis)), 0.5, 1);
  // overlay for the user to see what was measured
  const ov = makeCanvas(canvas.width, canvas.height); const o = ov.getContext('2d');
  o.drawImage(canvas, 0, 0);
  const tint = makeCanvas(mw, mh); const tc = tint.getContext('2d'); const id = tc.createImageData(mw, mh);
  for (let i = 0; i < m.length; i++) if (m[i] > 0.5) { id.data[i * 4] = 226; id.data[i * 4 + 1] = 138; id.data[i * 4 + 2] = 95; id.data[i * 4 + 3] = 70; }
  tc.putImageData(id, 0, 0); o.drawImage(tint, 0, 0, ov.width, ov.height);
  const k = ov.width / mw;
  const line = (row, label, col) => {
    o.strokeStyle = col; o.lineWidth = Math.max(2, ov.width / 200); o.beginPath(); o.moveTo(row.l * k, row.y * k); o.lineTo(row.r * k, row.y * k); o.stroke();
    for (const x of [row.l, row.r]) { o.beginPath(); o.arc(x * k, row.y * k, o.lineWidth * 2, 0, 7); o.fillStyle = col; o.fill(); }
    const fs = Math.max(12, ov.width / 34); o.font = `700 ${fs}px Manrope, system-ui, sans-serif`;
    const tw = o.measureText(label).width; const bx = Math.min(ov.width - tw - 14, row.r * k + 10), by = row.y * k - fs * 0.75;
    o.fillStyle = 'rgba(255,255,255,.9)'; o.fillRect(bx - 6, by - 2, tw + 12, fs * 1.5); o.fillStyle = '#171412'; o.fillText(label, bx, by + fs * 1.05);
  };
  const pct = (v) => Math.round((v / H) * 100);
  line(shoulders, `Shoulders ${pct(S)}`, '#2f4dba'); line(waist, `Waist ${pct(W)}`, '#b4532a'); line(hips, `Hips 100`, '#2e7d5b');
  return { shape, ratios: { s: +(S / H).toFixed(3), w: +(W / H).toFixed(3), ws: +(W / S).toFixed(3) }, rel: { shoulders: pct(S), waist: pct(W), hips: 100 }, confidence: +conf.toFixed(2), overlay: ov };
}

// ---------------- Coloring (skin + hair) ----------------
export function hairFromLab([L, a, b]) {
  const C = Math.hypot(a, b);
  if (L > 55 && C < 10) return 'grey';
  if (L < 27) return 'dark';
  if (a > 13 && a > b * 0.7) return 'red';
  if (L > 50 && b > 16) return 'light';
  if (L < 38) return 'dark';
  return 'medium';
}

export async function analyzeColoring(canvas) {
  const S = await loadSeg();
  const res = S.segment(canvas);
  const cm = res.categoryMask; const w = cm.width, h = cm.height; const cat = cm.getAsUint8Array().slice(); res.close?.();
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  const kx = canvas.width / w, ky = canvas.height / h;
  // gray-world white balance at half strength, to cancel warm/cool lamp casts
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  const gray = (R + G + B) / (3 * n);
  const gain = [R, G, B].map((v) => clamp(1 + 0.5 * (gray / (v / n) - 1), 0.82, 1.22));
  const face = [], hair = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const c = cat[y * w + x]; if (c !== 3 && c !== 1) continue;
    const i = (Math.min(canvas.height - 1, Math.round(y * ky)) * canvas.width + Math.min(canvas.width - 1, Math.round(x * kx))) * 4;
    const lab = rgbToLab([clamp(d[i] * gain[0], 0, 255), clamp(d[i + 1] * gain[1], 0, 255), clamp(d[i + 2] * gain[2], 0, 255)]);
    (c === 3 ? face : hair).push(lab);
  }
  if (face.length < 150) return { error: 'I could not see enough of your face. Face the camera in daylight, close enough that your face fills the oval.' };
  const mid = (arr, lo = 0.3, hi = 0.7) => { const s = arr.slice().sort((p, q) => p[0] - q[0]); const m2 = s.slice(Math.floor(s.length * lo), Math.ceil(s.length * hi)); return [0, 1, 2].map((k) => mean(m2.map((v) => v[k]))); };
  const lab = mid(face, 0.35, 0.8); // skip shadowed side and specular highlights
  const L = lab[0];
  const depth = L > 84 ? 1 : L > 72 ? 2 : L > 56 ? 3 : L > 38 ? 4 : 5;
  const hue = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  const undertone = lab[1] < 9 && lab[2] > 16 ? 'olive' : hue > 60 ? 'warm' : hue < 47 ? 'cool' : 'neutral';
  let hairKey = null, hairHex = null;
  if (hair.length > 120) { const hl = mid(hair, 0.2, 0.8); hairKey = hairFromLab(hl); hairHex = labToHex(hl); }
  const lit = clamp((L - 25) / 30, 0.4, 1);
  return { lab, hex: labToHex(lab), depth, undertone, hue: Math.round(hue), hair: hairKey, hairHex, samples: face.length, confidence: +clamp((face.length / 2500) * lit, 0.35, 1).toFixed(2), method: 'ai', wbGain: gain.map((g) => +g.toFixed(2)) };
}
