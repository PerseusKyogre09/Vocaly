import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmSampleRate, toElevenLabsAudio, toExotelMedia } from '../src/protocol.mjs';

test('translates Exotel media into ElevenLabs user_audio_chunk format', () => {
  const source = Buffer.from([0, 0, 232, 3]).toString('base64');
  const translated = toElevenLabsAudio(source, 8000, 16000);
  assert.ok(Buffer.from(translated, 'base64').length >= 4);
});

test('translates ElevenLabs audio into Exotel media format', () => {
  const source = Buffer.from([0, 0, 232, 3]).toString('base64');
  const translated = toExotelMedia(source, 'stream-1', 16000, 8000);
  assert.equal(translated.event, 'media');
  assert.equal(translated.stream_sid, 'stream-1');
  assert.ok(Buffer.from(translated.media.payload, 'base64').length > 0);
});

test('negotiates only explicitly supported ElevenLabs PCM16 formats', () => {
  assert.equal(pcmSampleRate('pcm_16000'), 16000);
  assert.equal(pcmSampleRate('pcm_8000'), 8000);
  assert.equal(pcmSampleRate('pcm_24000'), 24000);
  assert.equal(pcmSampleRate('ulaw_8000'), null);
  assert.equal(pcmSampleRate(undefined), null);
});

test('rejects malformed and odd-length audio instead of forwarding silence', () => {
  assert.throws(() => toElevenLabsAudio('not base64!', 8000, 16000), /base64/);
  assert.throws(() => toElevenLabsAudio(Buffer.from([1]).toString('base64'), 8000, 16000), /PCM16/);
  assert.equal(toElevenLabsAudio('', 8000, 16000), '');
  assert.equal(toExotelMedia('', 'stream-1', 16000, 8000), null);
});

test('keeps PCM byte order and sample values when rates already match', () => {
  const bytes = Buffer.from([0x34, 0x12, 0x78, 0x56]);
  const payload = bytes.toString('base64');
  assert.deepEqual(Buffer.from(toElevenLabsAudio(payload, 16000, 16000), 'base64'), bytes);
  assert.deepEqual(Buffer.from(toExotelMedia(payload, 's', 16000, 16000).media.payload, 'base64'), bytes);
});
