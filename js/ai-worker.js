// AI worker: runs every model off the main thread so the interface never freezes.
// Loaded as a Blob module worker (works on the website and inside the Android app), so only absolute URLs here.
const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';
let T = null;
const M = {};

async function lib() {
  if (!T) {
    T = await import(TF_URL);
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = true;
    // single-threaded WASM inside the worker: predictable memory on phones, still off the UI thread
    try { T.env.backends.onnx.wasm.numThreads = 1; } catch { /* older build */ }
  }
  return T;
}
const norm = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / n; return o; };
function progress(id) {
  const files = {};
  return (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files[p.file] = [p.loaded, p.total];
    let L = 0, S = 0; for (const [l, t] of Object.values(files)) { L += l; S += t; }
    self.postMessage({ id, progress: S ? L / S : 0, file: p.file });
  };
}
const rgb = (t, { data, width, height }) => new t.RawImage(new Uint8ClampedArray(data), width, height, 4).rgb();

const handlers = {
  async load({ model }, id) {
    const t = await lib();
    if (M.model !== model) {
      M.processor = await t.AutoProcessor.from_pretrained(model);
      M.vision = await t.CLIPVisionModelWithProjection.from_pretrained(model, { dtype: 'q8', device: 'wasm', progress_callback: progress(id) });
      M.model = model; M.text = null; M.tokenizer = null;
    }
    return true;
  },
  async loadText({ model }, id) {
    const t = await lib();
    if (!M.text || M.textModel !== model) {
      M.tokenizer = await t.AutoTokenizer.from_pretrained(model);
      M.text = await t.CLIPTextModelWithProjection.from_pretrained(model, { dtype: 'q8', device: 'wasm', progress_callback: progress(id) });
      M.textModel = model;
    }
    return true;
  },
  async embedImage(img) {
    const t = await lib();
    const inputs = await M.processor(rgb(t, img));
    const { image_embeds } = await M.vision(inputs);
    return norm(image_embeds.data);
  },
  async embedTexts({ texts }) {
    const out = [];
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16);
      // FashionCLIP's text model is exported with a fixed sequence length of 77
      const inputs = M.tokenizer(batch, { padding: 'max_length', max_length: 77, truncation: true });
      const { text_embeds } = await M.text(inputs);
      const d = text_embeds.dims[1];
      for (let j = 0; j < batch.length; j++) out.push(Array.from(norm(text_embeds.data.slice(j * d, (j + 1) * d))));
    }
    return out;
  },
  async loadBg({ model }, id) {
    const t = await lib();
    if (!M.bg) {
      M.bg = await t.AutoModel.from_pretrained(model, { config: { model_type: 'custom' }, dtype: 'q8', device: 'wasm', progress_callback: progress(id) });
      M.bgProc = await t.AutoProcessor.from_pretrained(model, {
        config: { do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5], feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2, rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 } },
      });
    }
    return true;
  },
  // returns an alpha mask (Uint8Array, width*height) for the given image
  async removeBg(img) {
    const t = await lib();
    const { pixel_values } = await M.bgProc(rgb(t, img));
    const { output } = await M.bg({ input: pixel_values });
    const mask = await t.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(img.width, img.height);
    return new Uint8Array(mask.data);
  },
};

self.onmessage = async (e) => {
  const { id, type, args } = e.data;
  try {
    const result = await handlers[type](args || {}, id);
    self.postMessage({ id, ok: true, result }, result && result.buffer instanceof ArrayBuffer ? [result.buffer] : []);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
