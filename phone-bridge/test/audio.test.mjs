import test from 'node:test';
import assert from 'node:assert/strict';
import { resamplePcm16 } from '../src/audio.mjs';

test('resamples PCM16 while preserving mono samples', () => {
  const input = Buffer.alloc(4);
  input.writeInt16LE(0, 0);
  input.writeInt16LE(1000, 2);
  const output = resamplePcm16(input, 8000, 16000);
  assert.equal(output.length, 8);
  assert.equal(output.readInt16LE(0), 0);
  assert.ok(output.readInt16LE(2) > 0);
});
