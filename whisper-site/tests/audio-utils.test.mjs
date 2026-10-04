import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, validateDuration, mixToMono, downloadName, MAX_BYTES, MAX_SECONDS } from '../dist/audio-utils.mjs';
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
