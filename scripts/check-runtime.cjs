#!/usr/bin/env node
'use strict';
const path=require('node:path'),P=require('../lib/pipeline.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),m=P.read(path.join(root,'automation/manifest.json')),exp=P.read(path.join(root,'automation/task-export.json')),bs=P.read(path.join(root,'automation/bindings.json'));
if(new Set(m.tasks.map(t=>t.role)).size!==P.W.MODULES.length)throw Error('Seven unique roles required');
for(const t of m.tasks){const p=P.compile(root,t.role,true),e=exp.tasks.find(x=>x.role===t.role),b=bs.bindings.find(x=>x.role===t.role);if(!e||e.prompt!==p||e.rrule!==t.rrule||e.timezone!==t.timezone)throw Error('Export drift '+t.role);if(!b||b.entryPromptSha256!==P.hash(p)||b.rrule!==t.rrule||b.timezone!==t.timezone)throw Error('Binding drift '+t.role);}
console.log('Repository runtime definitions match; live task settings require a separate tool check.');
