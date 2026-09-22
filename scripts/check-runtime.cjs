#!/usr/bin/env node
'use strict';
const path=require('node:path'),P=require('../lib/pipeline.cjs'),T=require('../lib/task-runtime.cjs'),C=require('../lib/control.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),m=T.validate(root),exp=P.read(path.join(root,'automation/task-export.json')),bs=P.read(path.join(root,'automation/bindings.json')),control=C.readControl(root);
if(exp.tasks.length!==3||bs.bindings.length!==3)throw Error('Runtime must have exactly three bindings');
for(const t of m.tasks){const prompt=T.entry(root,t.id),e=exp.tasks.find(x=>x.id===t.id),b=bs.bindings.find(x=>x.id===t.id);if(!e||e.prompt!==prompt||e.rrule!==t.rrule||e.timezone!==t.timezone)throw Error('Export drift '+t.id);if(!b||b.taskId!==t.taskId||b.entryPromptSha256!==P.hash(prompt)||b.rrule!==t.rrule||b.timezone!==t.timezone)throw Error('Binding drift '+t.id);if(control.productionPaused&&(b.enabled||e.enabled))throw Error('Repository pause and task binding disagree');}
console.log('Repository: 3 external schedules, 7 internal roles, pause and prompt bindings match. Live platform state requires connector verification.');
