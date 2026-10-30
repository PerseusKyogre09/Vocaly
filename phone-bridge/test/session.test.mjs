import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/session.mjs';

test('only the matching agent can consume a user credential session', () => {
  const store = createSessionStore(1000);
  store.put({ callId: 'call-a', agentId: 'agent-a', elevenLabsAgentId: 'eleven-a', elevenLabsApiKey: 'key-a' });
  assert.equal(store.take('call-a', 'agent-b', 'eleven-a'), null);
  assert.equal(store.take('call-a', 'agent-a', 'eleven-a').elevenLabsApiKey, 'key-a');
  assert.equal(store.take('call-a', 'agent-a', 'eleven-a'), null);
});

test('expires an unconsumed session without retaining its credential', async () => {
  let expired;
  const store = createSessionStore(10, (session) => { expired = session; });
  store.put({ callId: 'call-timeout', agentId: 'agent-a', elevenLabsAgentId: 'eleven-a', elevenLabsApiKey: 'key-a' });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(store.take('call-timeout', 'agent-a', 'eleven-a'), null);
  assert.equal(expired.elevenLabsApiKey, 'key-a');
});
