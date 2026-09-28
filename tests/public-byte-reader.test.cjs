'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { readPublicBytes } = require('./public-byte-reader.cjs');
const url = 'https://example.test/data/reader-projections/2026-09-24-1713.json';
function response(status, text = '{}', headers = {}) { return { status: () => status, headers: () => headers, body: async () => Buffer.from(text), dispose: async () => {} }; }
function harness(values) {
  let now = 0; const calls = [], waits = [], evidence = [];
  return { calls, waits, evidence, options: { clock: () => now, sleep: async ms => { waits.push(ms); now += ms; }, onResult: x => evidence.push(x) },
    request: { get: async (u, opts) => { calls.push({ url: u, options: opts }); const v = values.shift(); if (v instanceof Error) throw v; return v; } } };
}
test('a transient 503 is retried on the exact same public URL and retained in proof', async () => {
  const h = harness([response(503), response(200, '{"original":true}')]);
  const body = await readPublicBytes(h.request, url, h.options);
  assert.equal(body.toString(), '{"original":true}'); assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(x => x.url === url)); assert.deepEqual(h.waits, [300]);
  assert.deepEqual(h.evidence[0].attempts.map(x => x.status), [503, 200]);
});
test('persistent 503 remains a hard failure after three attempts', async () => {
  const h = harness([response(503), response(503), response(503)]);
  await assert.rejects(() => readPublicBytes(h.request, url, h.options), /3 attempt.*HTTP 503/);
  assert.equal(h.calls.length, 3); assert.equal(h.evidence[0].status, 'failed');
});
for (const status of [401, 403, 404, 429]) test('HTTP ' + status + ' is not retried or hidden', async () => {
  const h = harness([response(status)]);
  await assert.rejects(() => readPublicBytes(h.request, url, h.options), new RegExp('HTTP ' + status));
  assert.equal(h.calls.length, 1); assert.equal(h.waits.length, 0);
});
test('a connection reset may recover, an administrator denial must not retry', async () => {
  const h = harness([Error('ECONNRESET'), response(200)]);
  await readPublicBytes(h.request, url, h.options); assert.equal(h.calls.length, 2);
  const denied = harness([Error('net::ERR_BLOCKED_BY_ADMINISTRATOR')]);
  await assert.rejects(() => readPublicBytes(denied.request, url, denied.options), /BLOCKED_BY_ADMINISTRATOR/);
  assert.equal(denied.calls.length, 1);
});
test('HTTP 200 with incorrect bytes still fails the unchanged caller hash assertion', async () => {
  const h = harness([response(200, 'wrong-version')]);
  const bytes = await readPublicBytes(h.request, url, h.options);
  assert.throws(() => assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'a'.repeat(64)), assert.AssertionError);
  assert.equal(h.calls.length, 1);
});
test('Retry-After beyond the remaining fixed deadline fails without another request', async () => {
  const h = harness([response(503, '', { 'retry-after': '30' })]);
  await assert.rejects(() => readPublicBytes(h.request, url, { ...h.options, budgetMs: 1000 }), /HTTP 503/);
  assert.equal(h.calls.length, 1); assert.equal(h.waits.length, 0);
});
test('server Retry-After is honored within the same fixed budget', async () => {
  const h = harness([response(503, '', { 'retry-after': '2' }), response(200)]);
  await readPublicBytes(h.request, url, { ...h.options, budgetMs: 4000 });
  assert.deepEqual(h.waits, [2000]); assert.equal(h.calls[1].options.timeout, 2000);
});
test('unresponsive transports cannot outlive the public read deadline', async () => {
  const started = Date.now();
  await assert.rejects(() => readPublicBytes({ get: () => new Promise(() => {}) }, url, { budgetMs: 25 }), /budget exhausted/);
  assert.ok(Date.now() - started < 800);
});
test('slow response body is also constrained by the same deadline', async () => {
  const started = Date.now();
  await assert.rejects(() => readPublicBytes({ get: async () => ({ status: () => 200, body: () => new Promise(() => {}) }) }, url, { budgetMs: 25 }), /budget exhausted/);
  assert.ok(Date.now() - started < 800);
});
test('unbounded retry settings and unsafe URL protocols are rejected before IO', async () => {
  const h = harness([]);
  await assert.rejects(() => readPublicBytes(h.request, url, { maxAttempts: 99 }), /Invalid/);
  await assert.rejects(() => readPublicBytes(h.request, 'file:///etc/passwd'), /Invalid/);
  assert.equal(h.calls.length, 0);
});
