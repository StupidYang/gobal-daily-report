#!/usr/bin/env node
'use strict';
const path=require('node:path'),fs=require('node:fs'),P=require('../lib/pipeline.cjs'),Pub=require('../lib/publication.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),id=process.argv[2],fixture=process.argv.includes('--fixture');
if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id||''))throw Error('Explicit batch ID required');
const receipt=P.read(path.join(root,'data/receipts/batches',id+'.json')),errors=[];
if(receipt?.status!=='published')errors.push('No published atomic batch receipt');
let report;
for(const entry of receipt?.modules||[]){const m=P.read(path.join(root,'data/runs',entry.role,entry.runId+'.json'));
 if(!m||P.hash(m)!==entry.sha256){errors.push('Immutable hash mismatch '+entry.role);continue;}
 if(m.execution?.batchId!==id||m.execution?.role!==entry.role)errors.push('Batch identity mismatch '+entry.role);
 if(fixture?(m.dataMode!=='synthetic'||m.execution?.mode!=='fixture'):(m.dataMode==='synthetic'||m.execution?.mode!=='scheduled-batch'))errors.push('Dataset/execution mode mismatch '+entry.role);
 errors.push(...P.W.validate(m,entry.role));
 if(entry.role==='synthesis')report=m.payload?.report;
}
if(!report)errors.push('No complete synthesis in batch');
else {errors.push(...P.validateReport(report),...Pub.references(root,report,Date.now(),true));
 const hp=`history/${report.reportId.slice(0,10)}/${report.reportId.slice(-4)}.json`,h=P.read(path.join(root,hp));if(P.hash(h)!==P.hash(report))errors.push('History differs');
 const latest=P.read(path.join(root,'data/latest.json'));if(latest?.reportId===report.reportId&&!fs.readFileSync(path.join(root,'data/latest.json')).equals(fs.readFileSync(path.join(root,hp))))errors.push('Latest bytes differ');
 const idx=P.read(path.join(root,'data/history-index.json'));if(!idx?.reports?.some(x=>x.reportId===report.reportId&&x.path===hp))errors.push('History index missing report');
 for(const entry of receipt.modules.filter(x=>x.role!=='synthesis'))if(report.reportMeta.moduleRefs[entry.role]?.runId!==entry.runId)errors.push('Own producer not frozen '+entry.role);
 if(fixture&&!P.read(path.join(root,'synthetic-manifest.json'))&&!P.read(path.join(root,'.gdr-fixture-root.json')))errors.push('No fixture environment marker');
}
console.log(JSON.stringify({batchId:id,dataMode:fixture?'synthetic':'production',status:errors.length?'failed':'pipeline-passed',reportId:report?.reportId,modules:receipt?.modules?.length||0,productionReady:false,scope:'Integrity of committed outputs only. This does not verify external source truth or successful future schedules.',errors},null,2));if(errors.length)process.exitCode=1;
