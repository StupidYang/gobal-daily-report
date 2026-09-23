'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const css='assets/readable.css',rule='\n/* Dated daily yields must wrap on narrow screens without dropping their date. */\n.wl-table .wl-value{white-space:normal;overflow-wrap:anywhere}\n';
if(!fs.readFileSync(css,'utf8').includes('Dated daily yields must wrap'))fs.appendFileSync(css,rule);
const file='scripts/execution-worker.cjs',s=fs.readFileSync(file,'utf8'),old="P.atomic(path.join(out,'result.json'),{...result,packet:undefined});return result;";
assert.ok(s.includes(old),'Expected reviewed collector export');
fs.writeFileSync(file,s.replace(old,"P.atomic(path.join(out,'result.json'),result);return result;"));
