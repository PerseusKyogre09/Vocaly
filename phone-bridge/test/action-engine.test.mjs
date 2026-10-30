import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWebhookUrl, resolveTemplate, redactSecrets, executeWebhook } from '../../src/lib/action-engine.ts';

test('SSRF validator rejects localhost and loopback IPv4', () => {
  assert.equal(validateWebhookUrl('http://localhost:8080/hook').valid, false);
  assert.equal(validateWebhookUrl('http://127.0.0.1:3000/webhook').valid, false);
  assert.equal(validateWebhookUrl('http://127.0.1.1').valid, false);
});

test('SSRF validator rejects private RFC 1918 IPv4 ranges', () => {
  // 10.0.0.0/8
  assert.equal(validateWebhookUrl('http://10.0.0.1/api').valid, false);
  assert.equal(validateWebhookUrl('https://10.254.1.5/webhook').valid, false);

  // 172.16.0.0/12
  assert.equal(validateWebhookUrl('http://172.16.0.1/').valid, false);
  assert.equal(validateWebhookUrl('http://172.31.255.255/').valid, false);

  // 192.168.0.0/16
  assert.equal(validateWebhookUrl('http://192.168.1.1/').valid, false);
});

test('SSRF validator rejects cloud metadata and link-local addresses', () => {
  // AWS / GCP / Azure metadata 169.254.169.254
  assert.equal(validateWebhookUrl('http://169.254.169.254/latest/meta-data/').valid, false);
  assert.equal(validateWebhookUrl('http://metadata.google.internal/computeMetadata/v1/').valid, false);
  assert.equal(validateWebhookUrl('http://service.internal/webhook').valid, false);
  assert.equal(validateWebhookUrl('http://device.local/endpoint').valid, false);
});

test('SSRF validator rejects IPv6 loopback and private subnets', () => {
  assert.equal(validateWebhookUrl('http://[::1]/').valid, false);
  assert.equal(validateWebhookUrl('http://[fe80::1]/').valid, false);
  assert.equal(validateWebhookUrl('http://[fc00::1]/').valid, false);
  assert.equal(validateWebhookUrl('http://[::ffff:127.0.0.1]/').valid, false);
  assert.equal(validateWebhookUrl('http://[::ffff:192.168.1.1]/').valid, false);
});

test('SSRF validator accepts valid public HTTPS endpoints', () => {
  const result = validateWebhookUrl('https://api.example.com/v1/webhook');
  assert.equal(result.valid, true);
  assert.equal(result.url?.hostname, 'api.example.com');

  const httpbin = validateWebhookUrl('https://httpbin.org/post');
  assert.equal(httpbin.valid, true);
});

test('SSRF validator rejects non-HTTP protocols', () => {
  assert.equal(validateWebhookUrl('file:///etc/passwd').valid, false);
  assert.equal(validateWebhookUrl('ftp://example.com/test').valid, false);
  assert.equal(validateWebhookUrl('gopher://example.com/').valid, false);
});

test('safe template resolution replaces variables and avoids arbitrary code execution', () => {
  const variables = {
    customer_name: 'Jane Doe',
    phone: '+1-555-0199',
    appointment_date: '2026-11-05',
    service: 'Dental Cleaning',
    metadata: { source: 'phone' }
  };

  const template = {
    patient: '{{customer_name}}',
    contact: '{{phone}}',
    date: '{{appointment_date}}',
    summary: 'Appointment for {{customer_name}} on {{appointment_date}}',
    meta: '{{metadata}}',
    missing: '{{non_existent}}'
  };

  const resolved = resolveTemplate(template, variables);

  assert.equal(resolved.patient, 'Jane Doe');
  assert.equal(resolved.contact, '+1-555-0199');
  assert.equal(resolved.date, '2026-11-05');
  assert.equal(resolved.summary, 'Appointment for Jane Doe on 2026-11-05');
  assert.deepEqual(resolved.meta, { source: 'phone' });
  assert.equal(resolved.missing, '');

  // Verify arbitrary code string is not evaluated
  const maliciousTemplate = {
    calc: '{{process.exit()}}',
    code: '{{1 + 1}}'
  };
  const malResolved = resolveTemplate(maliciousTemplate, variables);
  assert.equal(malResolved.calc, '');
  assert.equal(malResolved.code, '');
});

test('secret redaction masks API keys, authorization tokens and secrets in payloads/headers', () => {
  const headers = {
    Authorization: 'Bearer sk_live_secret1234567890',
    'x-api-key': 'secret-value-abc',
    'Content-Type': 'application/json'
  };

  const redactedHeaders = redactSecrets(headers);
  assert.equal(redactedHeaders.Authorization, '[REDACTED]');
  assert.equal(redactedHeaders['x-api-key'], '[REDACTED]');
  assert.equal(redactedHeaders['Content-Type'], 'application/json');

  const body = {
    user: 'Alice',
    token: 'my-super-secret-jwt-token',
    nested: {
      password: 'password123',
      note: 'Hello world'
    }
  };

  const redactedBody = redactSecrets(body);
  assert.equal(redactedBody.token, '[REDACTED]');
  assert.equal(redactedBody.nested.password, '[REDACTED]');
  assert.equal(redactedBody.nested.note, 'Hello world');
});

test('webhook executor safely rejects SSRF target before sending network requests', async () => {
  const result = await executeWebhook({
    url: 'http://127.0.0.1:9099/internal',
    method: 'POST',
    body: { test: true }
  });

  assert.equal(result.success, false);
  assert.match(result.error || '', /private or link-local IPv4/);
  assert.equal(result.requestMethod, 'POST');
});
