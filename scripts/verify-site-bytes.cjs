#!/usr/bin/env node
'use strict';
// Branch Pages serves checkout bytes. Validate them BEFORE committing any release.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function safeFile(root, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.startsWith('/') || relative.split('/').some(x => !x || x === '.' || x === '..')) throw Error('Unsafe manifest file path');
  let current = root;
  for (const part of relative.split('/')) { current = path.join(current, part); if (fs.lstatSync(current).isSymbolicLink()) throw Error('Symlink in served release'); }
  return current;
}
function verify(root, site) {
  const expected = JSON.parse(fs.readFileSync(path.join(site, 'data/build.json'), 'utf8'));
  if (expected.buildVersion !== 1 || !expected.files || !/^[a-f0-9]{64}$/.test(expected.buildId || '')) throw Error('Invalid build identity');
  if (hash(Buffer.from(JSON.stringify(expected.files))) !== expected.buildId) throw Error('Manifest buildId does not match its file hashes');
  const mismatch = [];
  for (const [relative, digest] of Object.entries(expected.files)) {
    for (const [label, base] of [['staged', site], ['branch', root]]) {
      try { if (hash(fs.readFileSync(safeFile(base, relative))) !== digest) mismatch.push(label + ': ' + relative); }
      catch (error) { mismatch.push(label + ': ' + relative + ' (' + error.message + ')'); }
    }
  }
  if (hash(fs.readFileSync(path.join(root, 'data/build.json'))) !== hash(fs.readFileSync(path.join(site, 'data/build.json')))) mismatch.push('branch: data/build.json');
  if (mismatch.length) throw Error('Branch/staging byte mismatch before release:\n' + mismatch.join('\n'));
  return { status: 'verified', reportId: expected.reportId, buildId: expected.buildId, files: Object.keys(expected.files).length };
}
if (require.main === module) {
  try { console.log(JSON.stringify(verify(path.resolve(process.env.GDR_ROOT || path.join(__dirname, '..')), path.resolve(process.argv[2] || '/tmp/gdr-site')))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verify };
