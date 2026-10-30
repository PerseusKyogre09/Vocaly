import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken } from '../src/token.mjs';
import { createHmac } from 'node:crypto';

test('verifies signed bridge tokens and rejects tampering', () => {
  const payload = { callId: 'c', agentId: 'a', elevenLabsAgentId: 'e', exp: Math.floor(Date.now() / 1000) + 60 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encoded}.${createHmac('sha256', 'secret').update(encoded).digest('base64url')}`;
  assert.deepEqual(verifyToken(token, 'secret'), payload);
  assert.throws(() => verifyToken(`${token}x`, 'secret'));
});

test('rejects expired bridge tokens', () => {
  const encoded = Buffer.from(JSON.stringify({ callId: 'c', agentId: 'a', elevenLabsAgentId: 'e', exp: 1 })).toString('base64url');
  const token = `${encoded}.${createHmac('sha256', 'secret').update(encoded).digest('base64url')}`;
  assert.throws(() => verifyToken(token, 'secret'));
});
