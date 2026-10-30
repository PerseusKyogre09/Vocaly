import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function waitForBridge(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Phone bridge did not start in time.');
}

test('POST /sessions returns JSON for valid and invalid provisioning requests', async (t) => {
  const port = await unusedPort();
  const secret = 'test-bridge-secret';
  const bridge = spawn(process.execPath, ['src/server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(port), VOXFLOW_APP_URL: 'http://127.0.0.1:1', PHONE_BRIDGE_SECRET: secret },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => bridge.kill());

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForBridge(`${baseUrl}/`);
  const body = {
    callId: 'regression-call',
    agentId: 'regression-agent',
    elevenLabsAgentId: 'regression-eleven',
    elevenLabsApiKey: 'synthetic-key-not-real'
  };

  const valid = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  assert.equal(valid.status, 201);
  assert.equal(valid.headers.get('content-type'), 'application/json');
  assert.deepEqual(await valid.json(), { ok: true });

  const invalid = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.headers.get('content-type'), 'application/json');
  assert.deepEqual(await invalid.json(), { error: 'Unauthorized.' });
});
