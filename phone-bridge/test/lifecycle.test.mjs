import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../src/lifecycle.mjs';

test('terminal lifecycle transitions are idempotent', () => {
  const lifecycle = createLifecycle();
  assert.equal(lifecycle.transition('completed'), true);
  assert.equal(lifecycle.transition('failed'), false);
  assert.equal(lifecycle.status, 'completed');
  assert.equal(lifecycle.isTerminal(), true);
});

test('call can distinguish phone answer from agent connection', () => {
  const lifecycle = createLifecycle();
  assert.equal(lifecycle.transition('in-progress'), true);
  assert.equal(lifecycle.transition('agent-connecting'), true);
  assert.equal(lifecycle.transition('connected'), true);
  assert.equal(lifecycle.status, 'connected');
});
