// Inference runs in a dedicated worker; no audio is uploaded.
let transcriber;
let busy = false;
self.onmessage = async ({ data }) => {
  if (busy || data.type !== 'transcribe') return;
  busy = true;
  const { audio, language } = data;
  try {
    if (!(audio instanceof Float32Array) || !audio.length || audio.length > 16000 * 1200) throw new Error('Invalid audio');
    if (!transcriber) {
      self.postMessage({ type: 'loading' });
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
      env.allowLocalModels = false;
      // Single-threaded WASM works without cross-origin isolation.
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
        device: 'wasm', dtype: 'q8',
        progress_callback: (p) => {
          if (p.status === 'progress') self.postMessage({ type: 'download', file: p.file, loaded: p.loaded, total: p.total });
        },
      });
    }
    self.postMessage({ type: 'transcribing' });
    const result = await transcriber(audio, {
      ...(language !== 'auto' ? { language } : {}),
      task: 'transcribe', chunk_length_s: 30, stride_length_s: 5,
      return_timestamps: false,
    });
    self.postMessage({ type: 'complete', text: result.text });
  } catch (error) {
    console.error('[mozi] Whisper worker failed', { name: error?.name, message: error?.message });
    transcriber = undefined;
    self.postMessage({ type: 'error', message: '認識モデルの読み込み、または文字起こしに失敗しました。接続を確認し、短い音声でもう一度お試しください。' });
  } finally { busy = false; }
};
