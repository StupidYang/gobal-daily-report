'use strict';
const fs = require('node:fs');
const path = require('node:path');
const P = require('./pipeline.cjs');
const MARKER = '.gdr-fixture-root.json';
function isFixtureRoot(root) {
  const marker = P.read(path.join(root, MARKER));
  return marker?.purpose === 'isolated-synthetic-fixtures' && marker?.allowSynthetic === true;
}
function readControl(root) {
  const file = path.join(root, 'automation/control.json');
  if (!fs.existsSync(file)) return { productionPaused: false, mode: 'legacy' };
  const value = P.read(file);
  if (value?.version !== 1 || typeof value.productionPaused !== 'boolean') {
    throw Error('Invalid production control: refuse to publish until reviewed');
  }
  return value;
}
function checkMode(root, candidate) {
  const isTest = candidate?.dataMode === 'synthetic' || candidate?.execution?.mode === 'fixture' || candidate?.payload?.report?.reportMeta?.dataMode === 'synthetic';
  if (isTest && !isFixtureRoot(root)) return ['Synthetic data may only be published inside an explicitly isolated fixture root'];
  if (isFixtureRoot(root) && (!isTest || candidate.dataMode !== 'synthetic')) return ['Fixture roots accept only explicitly labelled synthetic candidates'];
  return [];
}
module.exports = { MARKER, isFixtureRoot, readControl, checkMode };
