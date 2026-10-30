import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyToken(token, secret) {
  const [encoded, supplied] = String(token || '').split('.');
  if (!encoded || !supplied) throw new Error('Invalid bridge token.');
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new Error('Invalid bridge token signature.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.callId || !payload.agentId || !payload.elevenLabsAgentId || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Invalid or expired bridge token.');
  return payload;
}
