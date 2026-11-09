import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, validateDuration, mixToMono, downloadName, resolveModel, MAX_BYTES, MAX_SECONDS } from '../dist/audio-utils.mjs';
test('reject empty, oversized, and unsupported files before decoding', () => {
  assert.ok(validateFile({ name:'empty.wav',size:0 }));
  assert.ok(validateFile({ name:'large.wav',size:MAX_BYTES + 1 }));
  assert.ok(validateFile({ name:'image.png',size:100 }));
  assert.equal(validateFile({ name:'録音.M4A',size:MAX_BYTES }),null);
});
test('reject unsupported durations without rejecting the limit', () => {
  for (const duration of [0,NaN,Infinity,MAX_SECONDS + 0.1]) assert.ok(validateDuration(duration));
  assert.equal(validateDuration(MAX_SECONDS),null);
});
test('mix stereo channels equally, including opposite-phase samples', () => {
  assert.deepEqual([...mixToMono([Float32Array.from([1,0,-1]),Float32Array.from([-1,1,1])])],[0,0.5,0]);
  assert.throws(() => mixToMono([new Float32Array(2),new Float32Array(1)]));
});
test('safe export filenames retain Japanese text', () => {
  assert.equal(downloadName('会議/録音:10.mp3'),'会議_録音_10.txt');
});
test('resolve model id, device, dtype, and English-only variants', () => {
  assert.deepEqual(resolveModel('small','japanese',false),{ id:'onnx-community/whisper-small',revision:'main',device:'wasm',dtype:{ encoder_model:'fp32',decoder_model_merged:'q8' },englishOnly:false });
  assert.deepEqual(resolveModel('base','english',true),{ id:'onnx-community/whisper-base.en',revision:'main',device:'webgpu',dtype:{ encoder_model:'fp32',decoder_model_merged:'q4' },englishOnly:true });
  assert.equal(resolveModel('small','english',false).id,'onnx-community/whisper-small.en');
  assert.deepEqual(resolveModel('turbo','english',true),{ id:'onnx-community/whisper-large-v3-turbo',revision:'main',device:'webgpu',dtype:{ encoder_model:'fp16',decoder_model_merged:'q4' },englishOnly:false });
});
test('turbo needs WebGPU and unknown models are rejected', () => {
  assert.throws(() => resolveModel('turbo','japanese',false),/WebGPU/);
  assert.throws(() => resolveModel('tiny','japanese',true));
  assert.throws(() => resolveModel('__proto__','japanese',true));
});
test('lang model maps languages to dedicated repos with pinned revisions', () => {
  const dtype = { encoder_model:'fp16',decoder_model_merged:'q4' };
  assert.deepEqual(resolveModel('lang','japanese',true),{ id:'onnx-community/kotoba-whisper-v2.2-ONNX',revision:'main',device:'webgpu',dtype,englishOnly:false });
  assert.deepEqual(resolveModel('lang','chinese',true),{ id:'subtitleking/belle-whisper-large-v3-turbo-zh-onnx',revision:'b5233598ee23522e477a67d168ee60e2f3068d38',device:'webgpu',dtype,englishOnly:false });
  assert.deepEqual(resolveModel('lang','korean',true),{ id:'JaeyeongYang/whisper-large-v3-turbo-korean-onnx',revision:'0544cc0ef462c6feaad6131a8dba634a3a6e1a37',device:'webgpu',dtype,englishOnly:false });
  assert.deepEqual(resolveModel('lang','german',true),{ id:'flackzz/whisper-large-v3-turbo-german-ONNX',revision:'33cc57e9f096f55e198a41db98844d1d341a58de',device:'webgpu',dtype,englishOnly:false });
  for (const l of ['english','french','spanish','auto','__proto__','toString']) assert.deepEqual(resolveModel('lang',l,true),{ id:'onnx-community/whisper-large-v3-turbo',revision:'main',device:'webgpu',dtype,englishOnly:false });
  for (const l of ['japanese','english']) assert.throws(() => resolveModel('lang',l,false),/WebGPU/);
});
