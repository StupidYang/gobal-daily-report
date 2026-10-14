'use strict';
const crypto = require('node:crypto');
const TRANSIENT = new Set([500, 502, 503, 504]);
const NETWORK = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const blobSha = content => {
  const bytes = Buffer.from(content, 'base64');
  return crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
};
async function bounded(promise, ms, abort) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolve, reject) => {
      timer = setTimeout(() => { abort(); reject(Object.assign(Error('GitHub request timed out'), {name: 'TimeoutError'})); }, ms);
    })]);
  } finally { clearTimeout(timer); }
}
function safeText(value, token) {
  let text = String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ');
  if (token) text = text.split(token).join('[redacted]');
  return text.slice(0, 2000);
}
function details(error) {
  const out = {};
  for (const key of ['name', 'message', 'code', 'status', 'method', 'endpoint', 'branch', 'requestId', 'attempts', 'retryAfterMs']) {
    if (error?.[key] != null) out[key] = error[key];
  }
  if (error?.reconciliationError) out.reconciliationError = error.reconciliationError;
  return out;
}
// Only safe reads and reconciled Contents PUTs can be retried. Dispatch is never replayed.
function createTransport({repository, token, fetchImpl = globalThis.fetch, sleepImpl = sleep,
  clock = Date.now, random = Math.random, onEvent = e => console.log(JSON.stringify(e)),
  conflictClass = Error, requestTimeoutMs = 12000, operationBudgetMs = 30000,
  mutationSpacingMs = 1000, maxAttempts = 3, maxRetriesTotal = 6} = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || typeof fetchImpl !== 'function') throw Error('Invalid GitHub transport');
  for (const x of [requestTimeoutMs, operationBudgetMs, maxAttempts]) if (!Number.isFinite(x) || x <= 0) throw Error('Invalid transport bounds');
  if (!Number.isInteger(maxAttempts) || maxAttempts > 3 || !Number.isInteger(maxRetriesTotal) || maxRetriesTotal < 0 || maxRetriesTotal > 6 || !Number.isFinite(mutationSpacingMs) || mutationSpacingMs < 0) throw Error('Invalid transport retry bounds');
  let remainingRetries = maxRetriesTotal, lastMutation = -Infinity, writeTail = Promise.resolve(), denied = null;
  const emit = event => { try { onEvent({githubTransport: event}); } catch {} };
  const isNetwork = e => ['TimeoutError', 'AbortError'].includes(e?.name) || NETWORK.has(e?.code) || NETWORK.has(e?.cause?.code) || e?.name === 'TypeError' && /fetch failed|terminated|network/i.test(e.message || '');
  function fault(method, endpoint, body, status, message, headers) {
    const lease = method === 'PUT' && /^\/contents\/runtime\/leases\/[^/?]+\.json$/.test(endpoint);
    const limited = status === 429 || status === 403 && (headers?.get?.('x-ratelimit-remaining') === '0' || /(?:secondary |api )?rate limit/i.test(String(message)));
    const code = limited ? 'GITHUB_RATE_LIMITED' : status === 409 ? 'CONFLICT' : status === 422 ? 'GITHUB_VALIDATION' : status === 401 || status === 403 ? 'GITHUB_ACCESS_DENIED' : status === 429 ? 'GITHUB_RATE_LIMITED' : status ? 'GITHUB_HTTP_' + status : 'GITHUB_NETWORK';
    const prefix = status === 409 && lease ? 'Lease compare-and-swap conflict' : 'GitHub request failed';
    const clean = safeText(message, token), error = status === 409 && lease ? new conflictClass(prefix) : new Error(prefix);
    error.name = status === 409 && lease ? 'Conflict' : 'GitHubRequestError';
    Object.assign(error, {code, status: status || null, method, endpoint, branch: body?.branch || null,
      requestId: headers?.get?.('x-github-request-id') || null, transient: TRANSIENT.has(status) || !status});
    error.message = `${prefix}: ${method} ${endpoint}${body?.branch ? ' [branch=' + body.branch + ']' : ''} ${status ? 'HTTP ' + status : 'network error'}${clean ? ': ' + clean : ''}`;
    const after = headers?.get?.('retry-after');
    if (after != null) {
      const seconds = Number(after), delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - clock();
      if (Number.isFinite(delay)) error.retryAfterMs = Math.max(0, delay);
    }
    return error;
  }
  async function once(method, endpoint, body, deadline) {
    if (denied) throw denied;
    if (!token) throw Error('Execution store needs an authorized GitHub token');
    const mutation = method !== 'GET';
    if (mutation) {
      const wait = Math.max(0, lastMutation + mutationSpacingMs - clock());
      if (clock() + wait >= deadline) throw Object.assign(Error('GitHub operation budget exhausted before write'), {code: 'GITHUB_BUDGET_EXHAUSTED'});
      if (wait) await sleepImpl(wait);
      lastMutation = clock();
    }
    const left = deadline - clock();
    if (left <= 0) throw Object.assign(Error('GitHub operation budget exhausted'), {code: 'GITHUB_BUDGET_EXHAUSTED'});
    const controller = new AbortController(), requestDeadline = Math.min(deadline, clock() + requestTimeoutMs);
    const limited = promise => bounded(promise, Math.max(1, Math.floor(requestDeadline - clock())), () => controller.abort());
    let response;
    try {
      response = await limited(fetchImpl('https://api.github.com/repos/' + repository + endpoint, {
        method, signal: controller.signal,
        headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'Cache-Control': 'no-cache'},
        body: body == null ? undefined : JSON.stringify(body)
      }));
    } catch (cause) {
      if (!isNetwork(cause)) throw cause;
      throw fault(method, endpoint, body, null, cause.message);
    }
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) {
      let message = '';
      try { message = await limited(response.text()); } catch { message = 'Response body unavailable'; }
      const error = fault(method, endpoint, body, response.status, message, response.headers);
      // A real access denial or rate limit stops this store for the rest of this process.
      if ([401, 403, 429].includes(response.status)) denied = error;
      throw error;
    }
    if (response.status === 204) return null;
    try { return await limited(response.json()); }
    catch (cause) {
      if (!isNetwork(cause) && cause?.name !== 'SyntaxError') throw cause;
      const error = fault(method, endpoint, body, response.status, 'Successful response could not be decoded', response.headers);
      error.code = 'GITHUB_RESPONSE_UNCERTAIN'; error.transient = true;
      throw error;
    }
  }
  async function backoff(error, attempt, deadline) {
    if (!remainingRetries || attempt >= maxAttempts) return false;
    const delay = Math.max(error.retryAfterMs || 0, 1000 * 2 ** (attempt - 1) + Math.floor(random() * 250));
    if (clock() + delay >= deadline) return false;
    remainingRetries--;
    emit({event: 'retry', ...details(error), attempt, delayMs: delay, remainingRetries});
    await sleepImpl(delay);
    return true;
  }
  async function read(endpoint, deadline) {
    for (let attempt = 1; ; attempt++) {
      try { return await once('GET', endpoint, null, deadline); }
      catch (error) {
        error.attempts = attempt;
        if (!error.transient || !await backoff(error, attempt, deadline)) throw error;
      }
    }
  }
  function reconcilable(method, endpoint, body) {
    return method === 'PUT' && typeof body?.content === 'string' &&
      ((body.branch === 'gdr-runtime' && /^\/contents\/runtime\/(results|handoffs|outcomes|leases)\/[A-Za-z0-9_-]+\.json$/.test(endpoint)) ||
       (body.branch === 'gdr-runtime' && endpoint === '/contents/runtime/health.json') ||
       (body.branch === 'main' && /^\/contents\/data\/inbox\/batches\/[A-Za-z0-9_-]+\.json$/.test(endpoint)));
  }
  async function write(method, endpoint, body, deadline) {
    for (let attempt = 1; ; attempt++) {
      try { return await once(method, endpoint, body, deadline); }
      catch (error) {
        error.attempts = attempt;
        if (!reconcilable(method, endpoint, body) || (!error.transient && ![409, 422].includes(error.status))) throw error;
        // A validation rejection may be an already-created file, but is never blindly retried.
        let actual;
        try { actual = await read(endpoint + '?ref=' + encodeURIComponent(body.branch), deadline); }
        catch (readError) { error.reconciliationError = details(readError); throw error; }
        if (actual?.sha === blobSha(body.content)) {
          emit({event: 'write-verified', ...details(error), sha: actual.sha});
          return {content: actual, commit: null, reconciled: true};
        }
        if (error.status === 422) throw error;
        const unchanged = body.sha ? actual?.sha === body.sha : actual === null;
        // Never update the expected SHA or overwrite a competing owner/content.
        if (!unchanged || !await backoff(error, attempt, deadline)) throw error;
      }
    }
  }
  function request(method, endpoint, body) {
    if (!['GET', 'PUT', 'POST', 'PATCH', 'DELETE'].includes(method) || typeof endpoint !== 'string' || !/^\/(?!\/)/.test(endpoint) || endpoint.includes('#')) return Promise.reject(Error('Invalid GitHub request'));
    // Snapshot caller input: every replay has exactly the same branch, path, content and SHA.
    const payload = body == null ? null : JSON.parse(JSON.stringify(body));
    const run = () => method === 'GET' ? read(endpoint, clock() + operationBudgetMs) : write(method, endpoint, payload, clock() + operationBudgetMs);
    if (method === 'GET') return run();
    const pending = writeTail.then(run); writeTail = pending.catch(() => {}); return pending;
  }
  return {request};
}
module.exports = {createTransport, details, blobSha};
