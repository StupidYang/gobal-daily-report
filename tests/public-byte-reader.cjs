'use strict';
// Read-only transport resilience. Exact content/hash checks remain the caller's responsibility.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const TRANSIENT_NETWORK = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|request.*timed? out|timeout.*exceeded/i;
function retryableNetwork(error) {
  const message = String(error?.message || '');
  if (/BLOCKED_BY_ADMINISTRATOR|access denied|permission|unauthori[sz]ed|forbidden/i.test(message)) return false;
  return error?.name === 'TimeoutError' || TRANSIENT_NETWORK.test(message);
}
async function within(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(Error('Public read budget exhausted'), { code: 'READ_DEADLINE' })), Math.max(1, ms));
    })]);
  } finally { clearTimeout(timer); }
}
async function readPublicBytes(request, url, options = {}) {
  const clock = options.clock || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const budgetMs = options.budgetMs ?? 25000;
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = options.backoff || [300, 1000];
  if (!request || typeof request.get !== 'function' || !Number.isFinite(budgetMs) || budgetMs <= 0 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3 ||
      !Array.isArray(backoff) || backoff.length < maxAttempts - 1 || backoff.some(ms => !Number.isFinite(ms) || ms < 0)) {
    throw Error('Invalid public-read request or retry budget');
  }
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw Error('Invalid public-read URL');
  const started = clock(), deadline = started + budgetMs, attempts = [];
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - clock();
    if (remaining <= 0) break;
    let response, status = null, canRetry = false, retryAfterMs = 0;
    try {
      response = await within(request.get(url, { timeout: remaining, failOnStatusCode: false, maxRetries: 0 }), remaining);
      status = response.status();
      if (status !== 200) {
        canRetry = RETRYABLE_STATUS.has(status);
        const retryAfter = response.headers?.()['retry-after'];
        if (retryAfter) {
          const delay = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - clock();
          if (Number.isFinite(delay)) retryAfterMs = Math.max(0, delay);
        }
        throw Object.assign(Error('Public GET ' + target.pathname + ' HTTP ' + status), { status });
      }
      const body = await within(response.body(), deadline - clock());
      attempts.push({ attempt, status, elapsedMs: clock() - started });
      options.onResult?.({ url, status: 'read', attempts });
      return Buffer.from(body);
    } catch (error) {
      lastError = error;
      if (status === null || status === 200) canRetry = retryableNetwork(error);
      attempts.push({ attempt, status, elapsedMs: clock() - started, error: error.message });
      if (!canRetry || attempt === maxAttempts) break;
    } finally {
      if (typeof response?.dispose === 'function') await response.dispose().catch(() => {});
    }
    const delay = Math.max(backoff[attempt - 1], retryAfterMs);
    if (clock() + delay >= deadline) break;
    await sleep(delay);
  }
  const error = Object.assign(Error('Public GET failed after ' + attempts.length + ' attempt(s): ' + (lastError?.message || 'read budget exhausted')),
    { cause: lastError, attempts, url });
  options.onResult?.({ url, status: 'failed', attempts });
  throw error;
}
module.exports = { readPublicBytes, retryableNetwork };
