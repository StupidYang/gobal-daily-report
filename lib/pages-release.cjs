'use strict';
// An accepted/ambiguous build POST is never repeated. Read-only verification remains mandatory.
const ACTIVE = new Set(['queued', 'in_progress', 'pending', 'waiting', 'requested']);
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;

function pagesRuns(value) {
  if (!Array.isArray(value?.workflow_runs)) throw Error('Invalid Actions run-list response');
  return value.workflow_runs.filter(r => r.path === 'dynamic/pages/pages-build-deployment');
}

async function ensureBranchBuild(options) {
  const { commit, buildId, api, probe, checkpoint = () => {}, readCheckpoint = () => null,
    now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    graceMs = 45000, timeoutMs = 270000, pollMs = 5000 } = options;
  if (!HEX40.test(commit || '') || !HEX64.test(buildId || '') || typeof api !== 'function' ||
      typeof probe !== 'function' || graceMs < 0 || timeoutMs < graceMs || pollMs <= 0) {
    throw Error('Invalid Pages release identity or bounded timing');
  }
  const started = now();
  const prior = readCheckpoint();
  if (prior?.commit === commit && prior.buildId === buildId && prior.postAttempted) {
    return { ...prior, status: 'previous-request-observed', verificationRequired: true };
  }
  const observations = [];
  const result = (status, extra = {}) => ({ status, commit, buildId,
    elapsedMs: now() - started, postAttempted: false, verificationRequired: true, observations, ...extra });
  while (now() - started <= timeoutMs) {
    if (await probe()) return result('already-public');
    const response = await api('GET', '/actions/runs?event=dynamic&per_page=100');
    const runs = pagesRuns(response);
    const same = runs.filter(r => r.head_sha === commit);
    if (same.some(r => r.status === 'completed' && r.conclusion === 'success')) {
      return result('existing-success-awaiting-propagation');
    }
    const active = runs.filter(r => ACTIVE.has(r.status));
    observations.push({ at: new Date(now()).toISOString(), activeIds: active.map(r => r.id),
      targetIds: same.map(r => r.id) });
    if (active.length || now() - started < graceMs) {
      await sleep(pollMs);
      continue;
    }
    // A failed target build is evidence, not permission to start an unlimited automatic retry loop.
    if (same.some(r => r.status === 'completed' && ['failure', 'timed_out', 'action_required'].includes(r.conclusion))) {
      throw Object.assign(Error('The exact Pages target build failed; inspect its job, do not repeat the build request'),
        { code: 'PAGES_TARGET_FAILED', observations });
    }
    // The native Pages build list can become visible before the Actions index does.
    const builds = await api('GET', '/pages/builds?per_page=20');
    if (!Array.isArray(builds)) throw Error('Invalid native Pages build-list response');
    if (builds.some(b => b.commit === commit && b.status === 'built')) {
      return result('existing-native-build-awaiting-propagation');
    }
    if (builds.some(b => ['building', 'queued'].includes(b.status))) {
      await sleep(pollMs);
      continue;
    }
    const head = await api('GET', '/git/ref/heads/main');
    if (head?.object?.sha !== commit) {
      throw Object.assign(Error('Main changed before Pages build request; refusing to deploy a different revision'),
        { code: 'PAGES_TARGET_SUPERSEDED' });
    }
    // Recheck public propagation immediately before the only possible write.
    if (await probe()) return result('already-public');
    const intent = result('request-intent', { postAttempted: true });
    checkpoint(intent);
    try {
      const response = await api('POST', '/pages/builds');
      const accepted = { ...intent, status: 'requested-once', response };
      checkpoint(accepted);
      return accepted;
    } catch (error) {
      if ([401, 403, 404].includes(error.status)) throw error;
      // A timeout/5xx may hide a successful write; a conflict may hide an auto build.
      // Never POST again. wait-site + byte/browser verification decides final success.
      const uncertain = { ...intent, status: 'request-uncertain-verify-public',
        error: String(error.message), httpStatus: error.status || null };
      checkpoint(uncertain);
      return uncertain;
    }
  }
  throw Object.assign(Error('Pages queue did not drain within its bounded deadline; no duplicate build was requested'),
    { code: 'PAGES_QUEUE_TIMEOUT', observations });
}
module.exports = { ensureBranchBuild, pagesRuns };
