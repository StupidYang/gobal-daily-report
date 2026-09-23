#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { ensureBranchBuild } = require('../lib/pages-release.cjs');
async function main() {
  const expected = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw Error('Missing repository identity');
  const commit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const checkpointFile = process.env.GDR_PAGES_REQUEST_PROOF || '/tmp/gdr-publication/pages-request.json';
  const base = process.env.GDR_TEST_URL || 'https://stupidyang.github.io/gobal-daily-report/';
  const api = async (method, endpoint) => {
    const res = await fetch('https://api.github.com/repos/' + repository + endpoint, {
      method, signal: AbortSignal.timeout(15000), headers: {
        Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache'
      }
    });
    if (!res.ok) throw Object.assign(Error('Pages request API HTTP ' + res.status + ': ' + (await res.text()).slice(0, 400)), { status: res.status });
    return res.status === 204 ? null : res.json();
  };
  const proof = await ensureBranchBuild({ commit, buildId: expected.buildId, api,
    probe: async () => {
      try {
        const res = await fetch(new URL('data/build.json?identity=' + Date.now(), base),
          { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        return res.ok && (await res.json()).buildId === expected.buildId;
      } catch { return false; }
    },
    checkpoint: value => { fs.mkdirSync(path.dirname(checkpointFile), { recursive: true }); fs.writeFileSync(checkpointFile, JSON.stringify(value, null, 2) + '\n'); },
    readCheckpoint: () => { try { return JSON.parse(fs.readFileSync(checkpointFile, 'utf8')); } catch { return null; } }
  });
  fs.mkdirSync(path.dirname(checkpointFile), { recursive: true });
  fs.writeFileSync(checkpointFile, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof));
}
if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { main };
