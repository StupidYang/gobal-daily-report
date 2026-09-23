#!/usr/bin/env node
'use strict';
// Run only after every mandatory public byte/content/browser step succeeded.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function buildProof(expected, { base, workflowRunId, browserChecksPassed, fetchImpl = fetch, now = Date.now } = {}) {
  if (!Number.isInteger(workflowRunId) || workflowRunId <= 0 || browserChecksPassed !== true) throw Error('Missing workflow or browser verification');
  if (!/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(expected.reportId || '')) throw Error('Invalid expected report');
  async function bytes(relative) {
    const url = new URL(relative, base); url.searchParams.set('proof', String(now()));
    const res = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw Error('Public proof HTTP ' + res.status + ': ' + relative);
    return Buffer.from(await res.arrayBuffer());
  }
  const build = JSON.parse((await bytes('data/build.json')).toString());
  if (build.buildId !== expected.buildId || build.reportId !== expected.reportId) throw Error('Public build/report identity mismatch');
  const latest = await bytes('data/latest.json'), latestSha256 = hash(latest);
  if (latestSha256 !== expected.files['data/latest.json']) throw Error('Public latest bytes differ');
  const report = JSON.parse(latest.toString());
  if (report.reportId !== expected.reportId) throw Error('Public latest report identity differs');
  const historyPath = 'history/' + report.reportId.slice(0, 10) + '/' + report.reportId.slice(-4) + '.json';
  const historySha256 = hash(await bytes(historyPath));
  if (historySha256 !== latestSha256) throw Error('Public latest/history differ');
  const controlSha256 = hash(await bytes('data/runtime-control.json'));
  if (controlSha256 !== expected.files['data/runtime-control.json']) throw Error('Public control bytes differ');
  return { status: 'verified', workflowRunId, buildId: expected.buildId, reportId: expected.reportId,
    latestSha256, historySha256, controlSha256, checkedAt: new Date(now()).toISOString(), browserChecksPassed: true };
}
async function main() {
  const expected = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const proof = await buildProof(expected, { base: process.env.GDR_TEST_URL || 'https://stupidyang.github.io/gobal-daily-report/',
    workflowRunId: Number(process.env.GITHUB_RUN_ID), browserChecksPassed: process.env.GDR_BROWSER_CHECKS_PASSED === 'true' });
  const dest = process.argv[3] || '/tmp/gdr-publication/deployment-proof.json';
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { buildProof };
