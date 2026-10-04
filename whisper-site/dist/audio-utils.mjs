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
