// Inference runs in a dedicated worker; no audio is uploaded.
import { resolveModel, TURBO_NEEDS_WEBGPU } from './audio-utils.mjs';
let transcriber, loadedKey, hasWebGPU;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy || data.type !== 'transcribe') return;
  busy = true;
  const { audio, language, model } = data;
  try {
    if (!(audio instanceof Float32Array) || !audio.length || audio.length > 16000 * 1200) throw new Error('Invalid audio');
    if (!['base', 'small', 'turbo'].includes(model)) throw new Error('Invalid model');
    if (hasWebGPU === undefined) { try { hasWebGPU = !!(await navigator.gpu?.requestAdapter?.()); } catch { hasWebGPU = false; } }
    let spec = resolveModel(model, language, hasWebGPU);
    if (!transcriber || loadedKey !== `${spec.id}|${spec.device}`) {
      await transcriber?.dispose?.();
      transcriber = loadedKey = undefined;
      self.postMessage({ type: 'loading', device: spec.device });
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
      env.allowLocalModels = false;
      // Single-threaded WASM works without cross-origin isolation.
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      const load = ({ id, device, dtype }) => pipeline('automatic-speech-recognition', id, {
        device, dtype,
        progress_callback: (p) => {
          if (p.status === 'progress') self.postMessage({ type: 'download', file: p.file, loaded: p.loaded, total: p.total });
        },
      });
      try { transcriber = await load(spec); }
      catch (error) {
        if (spec.device !== 'webgpu' || model === 'turbo') throw error;
        console.warn('[mozi] WebGPU load failed, falling back to WASM', { name: error?.name });
        hasWebGPU = false;
        spec = resolveModel(model, language, false);
        self.postMessage({ type: 'loading', device: spec.device });
        transcriber = await load(spec);
      }
      loadedKey = `${spec.id}|${spec.device}`;
    }
    self.postMessage({ type: 'transcribing' });
    const result = await transcriber(audio, {
      ...(!spec.englishOnly ? { task: 'transcribe', ...(language !== 'auto' ? { language } : {}) } : {}),
      chunk_length_s: 30, stride_length_s: 5,
      return_timestamps: true,
    });
    self.postMessage({ type: 'complete', text: result.text });
  } catch (error) {
    console.error('[mozi] Whisper worker failed', { name: error?.name, message: error?.message });
    transcriber = loadedKey = undefined;
    self.postMessage({ type: 'error', message: error?.message === TURBO_NEEDS_WEBGPU ? error.message : '認識モデルの読み込み、または文字起こしに失敗しました。接続を確認し、短い音声でもう一度お試しください。' });
  } finally { busy = false; }
};
