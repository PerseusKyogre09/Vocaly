const e164 = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneNumber(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a mobile number in E.164 format, for example +14155550123.');
  const normalized = value.replace(/[()\s-]/g, '');
  if (!e164.test(normalized)) throw new Error('Enter a mobile number in E.164 format, for example +14155550123.');
  return normalized;
}

export function signBridgeToken(payload: Record<string, string>, secret: string, ttlSeconds = 600): string {
  const encoded = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyBridgeToken(token: string | null, secret: string, maxAgeSeconds = 600): Record<string, string | number> {
  const [encoded, supplied] = String(token || '').split('.');
  if (!encoded || !supplied) throw new Error('Invalid bridge token.');
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error('Invalid bridge token signature.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.callId || !payload.agentId || !payload.elevenLabsAgentId || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) || payload.exp > Math.floor(Date.now() / 1000) + maxAgeSeconds) throw new Error('Invalid or expired bridge token.');
  return payload;
}
import { createHmac, timingSafeEqual } from 'node:crypto';
