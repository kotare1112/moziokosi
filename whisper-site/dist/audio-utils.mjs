export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_SECONDS = 20 * 60;
export function validateFile(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) return '空のファイルは選択できません。音声が入ったファイルを選んでください。';
  if (file.size > MAX_BYTES) return 'ファイルが50 MBを超えています。音声を分割するか、圧縮してからお試しください。';
  if (!/\.(mp3|wav|m4a|aac|ogg|oga|flac|webm|mp4|mpeg|mpga|opus)$/i.test(file.name)) return '対応する音声ファイル（MP3・WAV・M4Aなど）を選んでください。';
  return null;
}
export function validateDuration(duration) {
  return !Number.isFinite(duration) || duration <= 0 ? '音声の長さを読み取れませんでした。別のファイルをお試しください。' : duration > MAX_SECONDS ? '音声は20分以内にしてください。長い録音は分割してお試しください。' : null;
}
export function mixToMono(channels) {
  if (!channels.length || channels.some(c => c.length !== channels[0].length)) throw new Error('Invalid audio channels');
  const mono = new Float32Array(channels[0].length);
  for (const channel of channels) for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length;
  return mono;
}
export function formatDuration(seconds) {
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
export function downloadName(filename) {
  return filename.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150) + '.txt';
}
const MODELS = { base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small', turbo: 'onnx-community/whisper-large-v3-turbo' };
const LANG_MODELS = {
  japanese: { id: 'onnx-community/kotoba-whisper-v2.2-ONNX', revision: 'main' },
  chinese: { id: 'subtitleking/belle-whisper-large-v3-turbo-zh-onnx', revision: 'b5233598ee23522e477a67d168ee60e2f3068d38' },
  korean: { id: 'JaeyeongYang/whisper-large-v3-turbo-korean-onnx', revision: '0544cc0ef462c6feaad6131a8dba634a3a6e1a37' },
  german: { id: 'flackzz/whisper-large-v3-turbo-german-ONNX', revision: '33cc57e9f096f55e198a41db98844d1d341a58de' },
};
export const NEEDS_WEBGPU = 'このモデルはWebGPU対応ブラウザー（最新のChrome/Edge）が必要です。高精度モデルを選んでください。';
export function resolveModel(model, language, hasWebGPU) {
  if (model === 'lang') {
    if (!hasWebGPU) throw new Error(NEEDS_WEBGPU);
    const { id, revision } = Object.hasOwn(LANG_MODELS, language) ? LANG_MODELS[language] : { id: MODELS.turbo, revision: 'main' };
    return { id, revision, device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' }, englishOnly: false };
  }
  if (!Object.hasOwn(MODELS, model)) throw new Error('Unknown model');
  if (model === 'turbo' && !hasWebGPU) throw new Error(NEEDS_WEBGPU);
  const englishOnly = language === 'english' && model !== 'turbo';
  const decoder_model_merged = hasWebGPU ? 'q4' : 'q8';
  return { id: MODELS[model] + (englishOnly ? '.en' : ''), revision: 'main', device: hasWebGPU ? 'webgpu' : 'wasm', dtype: { encoder_model: hasWebGPU && model === 'turbo' ? 'fp16' : 'fp32', decoder_model_merged }, englishOnly };
}
