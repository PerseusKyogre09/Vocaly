import { resamplePcm16 } from './audio.mjs';

export function toElevenLabsAudio(payload, sourceRate, targetRate) {
  const pcm = decodePcm(payload);
  if (!pcm.length) return '';
  return resamplePcm16(pcm, sourceRate, targetRate).toString('base64');
}

export function toExotelMedia(audioBase64, streamSid, sourceRate, targetRate) {
  const pcm = decodePcm(audioBase64);
  if (!pcm.length) return null;
  const payload = resamplePcm16(pcm, sourceRate, targetRate).toString('base64');
  return { event: 'media', stream_sid: streamSid, media: { payload } };
}

export function pcmSampleRate(format) {
  const match = /^pcm_(8000|16000|24000)$/.exec(format || '');
  return match ? Number(match[1]) : null;
}

function decodePcm(value) {
  if (value === '') return Buffer.alloc(0);
  if (typeof value !== 'string' || !value || value.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('Audio payload is not valid base64 PCM.');
  }
  const pcm = Buffer.from(value, 'base64');
  if (pcm.length % 2 !== 0) throw new Error('Audio payload must contain complete PCM16 samples.');
  return pcm;
}
