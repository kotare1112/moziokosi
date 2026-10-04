import { validateFile, validateDuration, mixToMono, formatDuration, downloadName } from './audio-utils.mjs';
const $ = id => document.getElementById(id);
let file = null, worker = null, objectUrl = null, busy = false, job = 0, selection = 0;
const downloads = new Map();
const languages = new Set(['auto','japanese','english','chinese','korean','french','german','spanish']);
function notify(message, error = false) {
  $('notice').hidden = false;
  $('notice').classList.toggle('error', error);
  $('notice').textContent = `${error ? '⚠ ' : '✓ '}${message}`;
  $('notice').setAttribute('role', error ? 'alert' : 'status');
}
function setBusy(value) {
  busy = value;
  $('start').disabled = value || !file;
  $('start').querySelector('span').textContent = value ? '文字起こし中…' : '文字起こしを開始';
  for (const id of ['dropzone','remove-file','language','file-input']) $(id).disabled = value;
  $('cancel').hidden = !value;
  $('processing').hidden = !value;
  $('result-status').textContent = value ? '処理中' : $('transcript').value ? '完了' : '待機中';
  $('result-status').classList.toggle('done', !value && !!$('transcript').value);
}
function count() {
  const text = $('transcript').value;
  $('character-count').textContent = `${Array.from(text).length.toLocaleString('ja-JP')} 文字`;
  $('copy').disabled = !text.trim();
  $('download').disabled = !text.trim();
}
function clearResult() {
  $('transcript').value = '';
  $('transcript').hidden = true;
  $('empty-result').hidden = false;
  $('result-filename').textContent = 'TRANSCRIPT';
  $('result-status').textContent = '待機中';
  $('result-status').classList.remove('done');
  count();
}
function releaseAudio() {
  $('player').pause(); $('player').removeAttribute('src'); $('player').load();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}
async function selectFile(candidate) {
  if (busy || !candidate) return;
  const validation = validateFile(candidate);
  if (validation) return notify(validation, true);
  const current = ++selection;
  releaseAudio(); clearResult();
  file = candidate;
  objectUrl = URL.createObjectURL(candidate);
  $('player').src = objectUrl;
  $('file-name').textContent = candidate.name;
  $('file-meta').textContent = `${(candidate.size / 1024 / 1024).toFixed(1)} MB`;
  $('dropzone').hidden = true; $('file-card').hidden = false;
  $('notice').hidden = true; $('start').disabled = false;
  $('player').onloadedmetadata = () => {
    if (selection !== current) return;
    const duration = $('player').duration;
    if (Number.isFinite(duration)) {
      $('file-meta').textContent += ` · ${formatDuration(duration)}`;
      const error = validateDuration(duration);
      if (error) { $('start').disabled = true; notify(error, true); }
    }
  };
}
$('dropzone').onclick = () => $('file-input').click();
$('file-input').onchange = event => { selectFile(event.target.files[0]); event.target.value = ''; };
for (const event of ['dragenter','dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); if (!busy) $('dropzone').classList.add('dragover'); });
for (const event of ['dragleave','drop']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('dragover'); });
$('dropzone').addEventListener('drop', e => {
  if (e.dataTransfer.files.length > 1) return notify('一度に選べる音声は1ファイルです。', true);
  selectFile(e.dataTransfer.files[0]);
});
$('remove-file').onclick = () => {
  if (busy) return;
  ++selection; file = null; releaseAudio(); clearResult();
  $('file-card').hidden = true; $('dropzone').hidden = false; $('start').disabled = true;
  $('notice').hidden = true; $('dropzone').focus();
};
async function decodeAudio(selectedFile) {
  if (!window.AudioContext || !window.OfflineAudioContext) throw new Error('このブラウザーでは音声の読み込みに対応していません。最新版のChromeまたはEdgeでお試しください。');
  const context = new AudioContext();
  try {
    let decoded;
    try { decoded = await context.decodeAudioData(await selectedFile.arrayBuffer()); }
    catch { throw new Error('音声を読み込めませんでした。ファイルが壊れていないか確認し、MP3またはWAV形式でもう一度お試しください。'); }
    const durationError = validateDuration(decoded.duration);
    if (durationError) throw new Error(durationError);
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    mono.copyToChannel(mixToMono(Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i))), 0);
    const source = offline.createBufferSource(); source.buffer = mono; source.connect(offline.destination); source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally { await context.close(); }
}
async function startTranscription() {
  if (busy || !file || $('start').disabled) throw new Error('音声ファイルを選択してから開始してください。');
  const selectedFile = file, currentJob = ++job;
  $('notice').hidden = true; downloads.clear();
  setBusy(true); $('progress').removeAttribute('value');
  $('process-label').textContent = '音声を読み込んでいます…';
  $('process-detail').textContent = '音声を端末内で処理する準備をしています。';
  try {
    const audio = await decodeAudio(selectedFile);
    if (currentJob !== job) return { status: 'cancelled' };
    $('player').pause();
    if (!worker) worker = new Worker('./whisper-worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (currentJob !== job) return;
      if (data.type === 'loading') {
        $('process-label').textContent = '認識モデルを準備しています…';
        $('process-detail').textContent = '初回のダウンロードには数分かかる場合があります。モデルはブラウザーにキャッシュされます。';
      } else if (data.type === 'download') {
        downloads.set(data.file, { loaded: data.loaded || 0, total: data.total || 0 });
        const values = [...downloads.values()];
        const loaded = values.reduce((n, p) => n + p.loaded, 0);
        const total = values.reduce((n, p) => n + p.total, 0);
        // New model files may appear; this tracks bytes, not overall inference progress.
        $('process-detail').textContent = `モデルをダウンロード中 · ${(loaded / 1024 / 1024).toFixed(1)} MB${total ? ' / ' + (total / 1024 / 1024).toFixed(1) + ' MB（取得中のファイル）' : ''}`;
      } else if (data.type === 'transcribing') {
        $('process-label').textContent = '音声を文字にしています…';
        $('process-detail').textContent = '処理時間は音声の長さと端末の性能によって変わります。このページを開いたままお待ちください。';
      } else if (data.type === 'complete') {
        $('transcript').value = typeof data.text === 'string' ? data.text.trim() : '';
        $('transcript').hidden = false; $('empty-result').hidden = true;
        $('result-filename').textContent = selectedFile.name;
        count(); setBusy(false);
        notify($('transcript').value ? '文字起こしが完了しました。結果を編集・コピー・保存できます。' : '音声から言葉を認識できませんでした。話し声のある、より明瞭な録音でお試しください。', !$('transcript').value);
      } else if (data.type === 'error') { worker.terminate(); worker = null; setBusy(false); notify(data.message, true); }
    };
    worker.onerror = (event) => {
      if (currentJob !== job) return;
      console.error('[mozi] Worker unavailable', { message: event.message });
      worker?.terminate(); worker = null; setBusy(false);
      notify('文字起こしを開始できませんでした。接続とブラウザーの設定を確認し、最新版のChromeまたはEdgeでお試しください。', true);
    };
    worker.postMessage({ type: 'transcribe', audio, language: $('language').value }, [audio.buffer]);
    return { status: 'started' };
  } catch (error) {
    if (currentJob !== job) return { status: 'cancelled' };
    console.error('[mozi] Audio preparation failed', { name: error.name, message: error.message });
    setBusy(false); notify(error.message || '処理を開始できませんでした。もう一度お試しください。', true);
    return { status: 'error' };
  }
}
$('start').onclick = () => startTranscription().catch(error => notify(error.message, true));
$('cancel').onclick = () => { ++job; worker?.terminate(); worker = null; setBusy(false); notify('文字起こしをキャンセルしました。'); };
$('transcript').oninput = count;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('transcript').value); notify('文字起こし結果をコピーしました。'); }
  catch { $('transcript').focus(); $('transcript').select(); notify('自動コピーを利用できません。選択した文章を Ctrl+C（Macは⌘C）でコピーしてください。', true); }
};
$('download').onclick = () => {
  try {
    const url = URL.createObjectURL(new Blob(['\ufeff' + $('transcript').value], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = downloadName(file?.name || 'transcript.wav');
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('テキストファイルの保存を開始しました。');
  } catch (error) { console.error('[mozi] Export failed', { name: error.name }); notify('保存を開始できませんでした。コピー機能をお試しください。', true); }
};
window.addEventListener('beforeunload', e => { if (busy || $('transcript').value) { e.preventDefault(); e.returnValue = ''; } });
// Optional WebMCP shares the visible UI state. File access stays with the user.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tool = { name: 'read_transcription', description: 'Read the current editable transcription and processing state.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: input => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected empty object');
    return { status: busy ? 'processing' : $('transcript').value ? 'complete' : 'waiting', text: $('transcript').value };
  } };
  try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(error => console.warn('[mozi] WebMCP registration failed', { name: error.name })); }
  catch (error) { console.warn('[mozi] WebMCP unavailable', { name: error.name }); }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
