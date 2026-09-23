#!/usr/bin/env node
'use strict';
// The workflow owns this local permit. Candidate contents cannot create a public verification proof.
const fs = require('node:fs'), path = require('node:path');
const P = require('../lib/pipeline.cjs'), E = require('../lib/execution.cjs');
const O = require('../lib/publication-outcome.cjs');
function createPublisher(options = {}) {
  const root = path.resolve(options.root || process.env.GDR_ROOT || path.join(__dirname, '..'));
  const runId = options.runId ?? Number(process.env.GITHUB_RUN_ID);
  const store = options.store || new E.GitHubStore();
  const clock = options.clock || Date.now;
  const permitFile = path.join(root, '.runtime/execution-permit.json');
  const proofFile = options.proofFile || process.env.GDR_DEPLOYMENT_PROOF || '/tmp/gdr-publication/deployment-proof.json';
  const jobStatus = options.jobStatus || process.env.GDR_JOB_STATUS || 'unknown';
  const decode = x => x ? JSON.parse(Buffer.from(x.content, 'base64').toString('utf8')) : null;
  const get = (branch, name) => store.request('GET', '/contents/' + name + '?ref=' + branch);
  async function upsert(name, change) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const prior = await get('gdr-runtime', name), next = change(decode(prior));
      if (!next) return;
      try {
        await store.request('PUT', '/contents/' + name, { branch: 'gdr-runtime', message: 'runtime: publication evidence ' + name,
          ...(prior ? { sha: prior.sha } : {}), content: Buffer.from(P.json(next)).toString('base64') });
        return next;
      } catch (error) { if (error.code !== 'CONFLICT' || attempt === 2) throw error; }
    }
  }
  async function recordOutcome(state, receipt, proof) {
    const result = O.classify(state, receipt, { proof, workflowRunId: runId, jobStatus, now: clock() });
    const value = await upsert('runtime/outcomes/' + state.executionId + '.json', old => {
      if (old?.deployed === true && result.deployed !== true && old.deploymentWorkflowRunId !== runId) return null;
      return { ...old, ...result, requestId: state.executionId,
        history: [...(old?.history || []), { status: result.status, at: result.at, workflowRunId: runId }].slice(-16) };
    });
    if (!value) return;
    await upsert('runtime/health.json', old => {
      const health = old || { version: 1, tasks: {} }, previous = health.tasks[state.taskGroup];
      if (previous && previous.requestId !== state.executionId && Date.parse(previous.at) > Date.parse(state.startedAt)) return null;
      health.tasks[state.taskGroup] = { requestId: state.executionId, status: value.status, at: value.at,
        reportId: value.reportId, error: value.error, deadlineAt: value.deadlineAt,
        repositoryPublished: value.repositoryPublished, deployed: value.deployed, deployment: value.deployment };
      health.updatedAt = value.at;
      return health;
    });
    P.atomic(path.join(root, '.runtime/publication-outcome.json'), value);
    return value;
  }
  async function main(command) {
    const control = P.read(path.join(root, 'automation/control.json'));
    if (!control) throw Error('No production control');
    if (command !== 'finish' && (control.executionProtocol !== 'lease-v1' || control.productionPaused)) {
      if (command === 'verify' && P.read(permitFile)) throw Error('Production paused before push; refuse the staged publication');
      fs.rmSync(permitFile, { force: true }); return { status: 'paused-no-claim' };
    }
    let snapshot = await store.read(), state = snapshot.state;
    if (command === 'claim') {
      fs.rmSync(permitFile, { force: true });
      if (!['awaiting-publication', 'publishing'].includes(state.phase)) return { status: 'no-submitted-execution' };
      const batch = P.read(path.join(root, 'data/inbox/batches', state.batchId + '.json'));
      if (!batch) return { status: 'waiting-for-candidate' };
      if (state.phase === 'publishing' && state.workflowRunId !== runId) throw new E.Busy('Another publishing run owns this execution; reconcile its terminal result first');
      if (state.phase !== 'publishing') {
        E.assertOwner(state, batch.execution);
        if (state.batchHash !== P.hash(batch) || state.taskGroup !== batch.taskGroup) throw Error('Candidate hash/owner mismatch');
        snapshot = await E.advance(store, batch.execution, 'publishing', { workflowRunId: runId }); state = snapshot.state;
      }
      const permit = E.permit(state, batch); P.atomic(permitFile, permit); return permit;
    }
    if (command === 'verify') {
      const local = P.read(permitFile); if (!local) return { status: 'no-publication-permit' };
      // Re-read the production switch, not just the checkout captured before the run.
      const liveControl = decode(await get('main', 'automation/control.json'));
      if (liveControl?.productionPaused !== false || liveControl.executionProtocol !== 'lease-v1') throw Error('Production paused before push; refuse the staged publication');
      state = (await store.read()).state;
      const batch = P.read(path.join(root, 'data/inbox/batches', local.batchId + '.json'));
      const valid = E.permit(state, batch);
      if (valid.workflowRunId !== runId || P.hash(valid) !== P.hash(local)) throw Error('Publishing lease changed before commit');
      return { status: 'verified-exact-permit' };
    }
    if (command !== 'finish') throw Error('Expected claim, verify or finish');
    const proof = P.read(proofFile);
    const ownsPublishing = state.phase === 'publishing' && state.workflowRunId === runId;
    // A transient outcome write failure must be retryable after the lease has completed.
    const retriesOwnFinish = ['completed', 'failed'].includes(state.phase) && state.workflowRunId === runId;
    // A later successful code-only deployment may verify an earlier committed report.
    const verifiesExisting = state.phase === 'completed' && proof?.status === 'verified' &&
      proof.workflowRunId === runId && proof.reportId === state.reportId && jobStatus === 'success';
    if (!ownsPublishing && !retriesOwnFinish && !verifiesExisting) return { status: 'no-owned-publication' };
    const receipt = decode(await get('main', 'data/receipts/batches/' + state.batchId + '.json'));
    if (ownsPublishing) {
      const token = { executionId: state.executionId, generation: state.generation };
      if (O.receiptMatches(state, receipt)) await E.advance(store, token, 'completed', { reportId: receipt.reportId, receiptHash: P.hash(receipt) });
      else await E.advance(store, token, 'failed', { reason: 'No exact committed receipt for workflow ' + runId });
    }
    return recordOutcome(state, receipt, proof);
  }
  return { main, recordOutcome };
}
async function main() { const result = await createPublisher().main(process.argv[2]); console.log(JSON.stringify(result || {})); }
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { createPublisher, main };
