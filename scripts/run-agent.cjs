#!/usr/bin/env node
'use strict';
console.error('Single-role scheduled runner retired. Use the three task contracts and submit a complete atomic-batch-v2 JSON with: node scripts/gdr.cjs submit-batch FILE. No AI adapter or network call was started.');
process.exitCode=1;
