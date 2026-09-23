'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const Pages = require('../lib/pages-release.cjs'), Outcome = require('../lib/publication-outcome.cjs');
const { verify } = require('../scripts/verify-site-bytes.cjs');
const { buildProof } = require('../scripts/write-deployment-proof.cjs');
const { createPublisher } = require('../scripts/publication-lease.cjs');
const { createWorker } = require('../scripts/execution-worker.cjs');
const E = require('../lib/execution.cjs'), P = require('../lib/pipeline.cjs');
const commit = 'a'.repeat(40), buildId = 'b'.repeat(64);
function pageHarness(overrides = {}) {
  let clock = 0, checkpoint = null, posts = 0;
  const calls = [], runs = overrides.runs || (() => []);
  const opts = { commit, buildId, graceMs: 30, timeoutMs: 100, pollMs: 10,
    now: () => clock, sleep: async ms => { clock += ms; }, probe: overrides.probe || (async () => false),
    checkpoint: x => { checkpoint = x; }, readCheckpoint: () => checkpoint,
    api: async (method, endpoint) => {
      calls.push({ method, endpoint, at: clock });
      if (method === 'POST') { posts++; if (overrides.postError) throw overrides.postError; return { status: 'queued' }; }
      if (endpoint.startsWith('/actions')) return { workflow_runs: await runs(clock) };
      if (endpoint.startsWith('/pages')) return overrides.builds || [];
      if (endpoint.startsWith('/git')) return { object: { sha: overrides.head || commit } };
      throw Error(endpoint);
    } };
  return { opts, calls, posts: () => posts, checkpoint: () => checkpoint };
}
const managed = data => ({ id: 9, path: 'dynamic/pages/pages-build-deployment', head_sha: commit, ...data });
test('Pages: delayed automatic registration never produces a duplicate POST', async () => {
  const h = pageHarness({ runs: n => n < 20 ? [] : [managed({ status: 'in_progress' })], probe: async function () { return h.calls.length > 5; } });
  const r = await Pages.ensureBranchBuild(h.opts); assert.equal(h.posts(), 0); assert.equal(r.status, 'already-public');
});
test('Pages: cancelled duplicate does not hide same-commit successful deployment', async () => {
  const h = pageHarness({ runs: () => [managed({ status: 'completed', conclusion: 'cancelled' }), managed({ id: 8, status: 'completed', conclusion: 'success' })] });
  assert.equal((await Pages.ensureBranchBuild(h.opts)).status, 'existing-success-awaiting-propagation'); assert.equal(h.posts(), 0);
});
test('Pages: native build registry suppresses POST before Actions index catches up', async () => {
  const h = pageHarness({ builds: [{ commit, status: 'built' }] });
  assert.equal((await Pages.ensureBranchBuild(h.opts)).status, 'existing-native-build-awaiting-propagation'); assert.equal(h.posts(), 0);
});
test('Pages: idle bot commit gets exactly one build request after registration grace', async () => {
  const h = pageHarness(); const r = await Pages.ensureBranchBuild(h.opts);
  assert.equal(r.status, 'requested-once'); assert.equal(h.posts(), 1); assert.ok(r.elapsedMs >= 30);
  await Pages.ensureBranchBuild(h.opts); assert.equal(h.posts(), 1, 'A repeated script call must not POST again');
});
for (const status of [400, 409, 422, 500, undefined]) test('Pages: uncertain POST is not repeated: ' + status, async () => {
  const h = pageHarness({ postError: Object.assign(Error('uncertain response'), { status }) });
  const r = await Pages.ensureBranchBuild(h.opts); assert.equal(r.status, 'request-uncertain-verify-public'); assert.equal(r.verificationRequired, true);
  await Pages.ensureBranchBuild(h.opts); assert.equal(h.posts(), 1);
});
for (const status of [401, 403]) test('Pages: permission error remains a real failure: ' + status, async () => {
  const h = pageHarness({ postError: Object.assign(Error('denied'), { status }) });
  await assert.rejects(() => Pages.ensureBranchBuild(h.opts), /denied/); assert.equal(h.posts(), 1);
});
test('Pages: active unrelated commit drains or times out without a competing write', async () => {
  const h = pageHarness({ runs: () => [managed({ head_sha: 'c'.repeat(40), status: 'waiting' })] });
  await assert.rejects(() => Pages.ensureBranchBuild(h.opts), { code: 'PAGES_QUEUE_TIMEOUT' }); assert.equal(h.posts(), 0);
});
test('Pages: failed exact target is surfaced, never automatically replayed', async () => {
  const h = pageHarness({ runs: () => [managed({ status: 'completed', conclusion: 'failure' })] });
  await assert.rejects(() => Pages.ensureBranchBuild(h.opts), { code: 'PAGES_TARGET_FAILED' }); assert.equal(h.posts(), 0);
});
test('Pages: changed main cannot be built under the old version label', async () => {
  const h = pageHarness({ head: 'c'.repeat(40) });
  await assert.rejects(() => Pages.ensureBranchBuild(h.opts), { code: 'PAGES_TARGET_SUPERSEDED' }); assert.equal(h.posts(), 0);
});
const state = { executionId: 'exec', generation: 1, batchId: 'exec', batchHash: 'c'.repeat(64),
  taskGroup: 'global-main', workflowRunId: 101, deadlineAt: '2026-09-23T10:20:00Z' };
const receipt = { status: 'published', batchId: 'exec', inputHash: state.batchHash, taskGroup: 'global-main', reportId: '2026-09-23-1800' };
const proof = { status: 'verified', workflowRunId: 101, reportId: receipt.reportId, buildId,
  latestSha256: 'd'.repeat(64), historySha256: 'd'.repeat(64), browserChecksPassed: true, checkedAt: '2026-09-23T10:02:00Z' };
test('Outcome: committed report plus failed browser verification is deployment-failed', () => {
  const r = Outcome.classify(state, receipt, { workflowRunId: 101, jobStatus: 'failure' });
  assert.equal(r.status, 'deployment-failed'); assert.equal(r.repositoryPublished, true); assert.equal(r.deployed, false);
});
test('Outcome: successful workflow alone cannot imply verified deployment', () => {
  assert.equal(Outcome.classify(state, receipt, { workflowRunId: 101, jobStatus: 'success' }).status, 'published-unverified');
});
test('Outcome: matching receipt and complete public evidence means deployed', () => {
  assert.equal(Outcome.classify(state, receipt, { workflowRunId: 101, jobStatus: 'success', proof }).status, 'deployed');
});
for (const bad of [{ workflowRunId: 102 }, { reportId: '2026-09-23-1759' }, { historySha256: 'e'.repeat(64) }, { browserChecksPassed: false }]) test('Outcome: reject unrelated/partial proof ' + Object.keys(bad)[0], () => {
  assert.equal(Outcome.classify(state, receipt, { workflowRunId: 101, jobStatus: 'success', proof: { ...proof, ...bad } }).deployed, false);
});
for (const bad of [{ inputHash: 'e'.repeat(64) }, { taskGroup: 'us-session' }, { batchId: 'different' }, { status: 'rejected' }]) test('Outcome: mismatched receipt never implies repository publication ' + Object.keys(bad)[0], () => {
  assert.equal(Outcome.classify(state, { ...receipt, ...bad }, { workflowRunId: 101, jobStatus: 'success', proof }).status, 'failed');
});
function directory(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdr-incident-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function byteFixture(t) {
  const base = directory(t), root = path.join(base, 'root'), site = path.join(base, 'site');
  const body = '{"version":1,"productionPaused":true}\n';
  const files = { 'data/runtime-control.json': sha(body) }, b = { buildVersion: 1, files, buildId: sha(JSON.stringify(files)), reportId: receipt.reportId };
  for (const dir of [root, site]) { fs.mkdirSync(path.join(dir, 'data'), { recursive: true }); fs.writeFileSync(path.join(dir, 'data/runtime-control.json'), body); P.atomic(path.join(dir, 'data/build.json'), b); }
  return { root, site };
}
test('Branch/staging: identical release bytes pass without rewriting either side', t => {
  const x = byteFixture(t); assert.equal(verify(x.root, x.site).status, 'verified');
});
test('Branch/staging: semantic equality with different JSON formatting is rejected before release', t => {
  const x = byteFixture(t); fs.writeFileSync(path.join(x.root, 'data/runtime-control.json'), '{ "version": 1, "productionPaused": true }\n');
  assert.throws(() => verify(x.root, x.site), /branch: data\/runtime-control.json/);
});
test('Branch/staging: missing branch asset cannot pass by existing in staging only', t => {
  const x = byteFixture(t); fs.rmSync(path.join(x.root, 'data/runtime-control.json')); assert.throws(() => verify(x.root, x.site), /byte mismatch/);
});
function publicFixture() {
  const data = { 'data/latest.json': P.json({ reportId: receipt.reportId }), 'data/runtime-control.json': '{"version":1,"productionPaused":true}\n' };
  data['history/2026-09-23/1800.json'] = data['data/latest.json'];
  const files = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, sha(v)]));
  const expected = { buildId, reportId: receipt.reportId, files };
  data['data/build.json'] = P.json(expected);
  const options = { workflowRunId: 101, browserChecksPassed: true, base: 'https://example.test/',
    fetchImpl: async url => { const text = data[new URL(url).pathname.slice(1)]; return new Response(text, { status: text ? 200 : 404 }); } };
  return { data, expected, options };
}
test('Public proof: exact latest/history/control after browser checks passes', async () => {
  const x = publicFixture(); assert.equal((await buildProof(x.expected, x.options)).status, 'verified');
});
test('Public proof: changing control bytes after deployment cannot pass', async () => {
  const x = publicFixture(); x.data['data/runtime-control.json'] = '{}'; await assert.rejects(() => buildProof(x.expected, x.options), /control bytes/);
});
test('Public proof: old history or missing browser checks remain failures', async () => {
  const x = publicFixture(); x.data['history/2026-09-23/1800.json'] = '{}'; await assert.rejects(() => buildProof(x.expected, x.options), /latest\/history/);
  await assert.rejects(() => buildProof(x.expected, { ...x.options, browserChecksPassed: false }), /browser/);
});
function publisherFixture(t, jobStatus, publicProof) {
  const root = directory(t), now = Date.now(), token = { executionId: 'exec', generation: 1 };
  P.atomic(path.join(root, 'automation/control.json'), { version: 1, productionPaused: false, executionProtocol: 'lease-v1' });
  let state = E.acquire(E.idle(), 'global-main', { now, executionId: 'exec' });
  state = E.transition(state, token, 'analyzing', {}, now + 1);
  state = E.transition(state, token, 'awaiting-publication', { batchId: 'exec', batchHash: receipt.inputHash }, now + 2);
  state = E.transition(state, token, 'publishing', { workflowRunId: 101 }, now + 3);
  const files = new Map(), encode = value => ({ sha: 'test-sha', content: Buffer.from(P.json(value)).toString('base64') });
  files.set('main:data/receipts/batches/exec.json', encode(receipt));
  const store = { read: async () => ({ sha: 'state-sha', state: structuredClone(state) }),
    cas: async (_, next) => { state = next; return { sha: 'next', state }; },
    request: async (method, url, body) => {
      const [name, query] = url.replace('/contents/', '').split('?'), branch = body?.branch || new URLSearchParams(query).get('ref');
      const key = branch + ':' + name;
      if (method === 'GET') return files.get(key) || null;
      const value = { sha: 'new', content: body.content }; files.set(key, value); return { content: value };
    } };
  const proofFile = path.join(root, 'proof.json'); if (publicProof) P.atomic(proofFile, publicProof);
  const publisher = createPublisher({ root, store, runId: 101, proofFile, jobStatus });
  return { publisher, state: () => state, files };
}
test('Publisher finish integration: public failure cannot become a green execution', async t => {
  const x = publisherFixture(t, 'failure'); const r = await x.publisher.main('finish');
  assert.equal(x.state().phase, 'completed', 'Repository transaction is committed'); assert.equal(r.status, 'deployment-failed'); assert.equal(r.deployed, false);
  const h = JSON.parse(Buffer.from(x.files.get('gdr-runtime:runtime/health.json').content, 'base64'));
  assert.equal(h.tasks['global-main'].status, 'deployment-failed');
});
test('Publisher finish integration: exact public proof writes deployed health', async t => {
  const x = publisherFixture(t, 'success', proof); assert.equal((await x.publisher.main('finish')).status, 'deployed');
});
test('Lease: CAS loser is a controlled busy result, not an infrastructure failure', async () => {
  const now = Date.now(), peer = E.acquire(E.idle(), 'asia-session', { now, executionId: 'peer' }); let reads = 0;
  const store = { read: async () => ({ sha: 's', state: ++reads === 1 ? E.idle() : peer }), cas: async () => { throw new E.Conflict(); } };
  await assert.rejects(() => E.begin(store, 'global-main', { now, executionId: 'ours' }), { code: 'BUSY' });
});
test('Paused in-flight event: creates a truthful paused outcome without collecting or dispatching', async t => {
  const root = directory(t), calls = [];
  const store = { read: async () => ({ sha: null, state: E.idle() }), request: async (method, url, body) => {
    calls.push({ method, url });
    if (method === 'GET' && url.includes('automation/control')) return { sha: 'c', content: Buffer.from(P.json({ version: 1, productionPaused: true })).toString('base64') };
    return method === 'GET' ? null : { content: { sha: 'new' } };
  } };
  const worker = createWorker({ root, store, out: path.join(root, 'out'), collect: async () => { throw Error('Must not collect'); } });
  assert.equal((await worker.run('request', 'paused-request')).status, 'paused');
  assert.equal(calls.some(x => x.url.includes('dispatches') || x.url.includes('/leases/')), false);
});
test('UI: repository success and public deployment failure have distinct labels', () => {
  const ui = require('../assets/execution-status.js');
  assert.match(ui.describe({ status: 'deployment-failed' }), /公网.*失败/);
  assert.match(ui.describe({ status: 'published-unverified' }), /尚未验收/);
  assert.match(ui.describe({ status: 'deployed' }), /证据待核/);
  assert.match(ui.describe({ status: 'deployed', deployed: true, deployment: { status: 'verified' } }), /验收已通过/);
});

test('Publisher finish integration: repeated finish repairs outcome persistence without claiming a new lease', async t => {
  const x = publisherFixture(t, 'failure');
  assert.equal((await x.publisher.main('finish')).status, 'deployment-failed');
  x.files.delete('gdr-runtime:runtime/outcomes/exec.json');
  x.files.delete('gdr-runtime:runtime/health.json');
  assert.equal((await x.publisher.main('finish')).status, 'deployment-failed');
  assert.equal(x.state().phase, 'completed');
  assert.ok(x.files.has('gdr-runtime:runtime/outcomes/exec.json'));
});
