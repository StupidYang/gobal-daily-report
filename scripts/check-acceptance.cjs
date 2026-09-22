#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),P=require('../lib/pipeline.cjs'),Pub=require('../lib/publication.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'));
const batch=process.argv[2];if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(batch||''))throw Error('Explicit safe batch ID required');
const result={batchId:batch,checkedAt:new Date().toISOString(),status:'incomplete',scope:'Native one-off same-role executions; not proof of every future scheduled run or source accuracy.',roles:{},errors:[]};
const array=x=>Array.isArray(x)?x:[];
for(const role of P.W.MODULES){
 const dir=path.join(root,'data/receipts',role);const entries=fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>x.endsWith('.json')).map(f=>P.read(path.join(dir,f))).filter(r=>r?.execution?.batchId===batch&&r.execution.role===role&&r.execution.mode==='native-task-replay'):[];
 const accepted=entries.filter(r=>r.status==='published').sort((a,b)=>Date.parse(b.processedAt)-Date.parse(a.processedAt)||b.runId.localeCompare(a.runId));
 if(!accepted.length){result.roles[role]={status:'not-published',attempts:entries.map(x=>({runId:x.runId,status:x.status,errors:x.errors}))};result.errors.push(role+': no published native replay receipt');continue;}
 const receipt=accepted[0],expected=`data/runs/${role}/${receipt.runId}.json`,m=P.read(path.join(root,expected));
 if(receipt.module?.path!==expected||!m||m.runId!==receipt.runId||m.module!==role){result.errors.push(role+': immutable run identity mismatch');continue;}
 const err=P.W.validate(m,role);if(err.length)result.errors.push(role+': '+err.join('; '));
 if(m.execution?.batchId!==batch||m.execution?.mode!=='native-task-replay')result.errors.push(role+': run does not carry native replay batch identity');
 if(P.hash(m)!==receipt.module.sha256)result.errors.push(role+': immutable module hash differs from receipt');
 const payload=m.payload||{},coverage={};
 if(role==='quotes'){coverage.required=array(P.read(path.join(root,'config/watchlist.json'))?.required).length;coverage.items=array(payload.items).length;coverage.numeric=array(payload.items).filter(x=>P.W.finite(x.price)).length;coverage.missing=array(payload.items).filter(x=>!P.W.finite(x.price)).map(x=>x.instrumentId);}
 if(role.endsWith('equities')){coverage.groups=array(payload.groups).length;coverage.rows=array(payload.groups).reduce((s,g)=>s+array(g.rows).length,0);coverage.sourceCoverage=payload.coverage||null;}
 if(role==='news'){coverage.events=array(payload.newsroom?.items).length;coverage.regions={};for(const n of array(payload.newsroom?.items))for(const region of new Set(array(n.regions)))coverage.regions[region]=(coverage.regions[region]||0)+1;}
 if(role==='research'){coverage.records=array(payload.records).length;coverage.checks=array(payload.checks).length;coverage.pending=array(payload.pendingQueue).length;}
 if(role==='macro'){coverage.facts=array(payload.canonicalFacts).length;coverage.events=array(payload.events).length;}
 result.roles[role]={runId:m.runId,generatedAt:m.generatedAt,dataAsOf:m.dataAsOf,moduleStatus:m.status,receiptStatus:receipt.status,receiptPath:`data/receipts/${role}/${m.runId}.json`,runPath:expected,sha256:P.hash(m),coverage};
 if(role==='synthesis'){
  const r=payload.report;result.reportId=r?.reportId;
  result.errors.push(...P.validateReport(r),...Pub.references(root,r,Date.now()));
  for(const producer of P.W.MODULES.filter(x=>x!=='synthesis')){const ref=r?.reportMeta?.moduleRefs?.[producer],input=ref?.path?P.read(path.join(root,ref.path)):null;if(!input||input.execution?.batchId!==batch||input.execution?.mode!=='native-task-replay')result.errors.push('synthesis did not freeze this batch input: '+producer);}
  const hp=`history/${r?.reportId?.slice(0,10)}/${r?.reportId?.slice(-4)}.json`,hist=P.read(path.join(root,hp));
  if(P.hash(hist)!==P.hash(r))result.errors.push('Report differs from its immutable history');
  const latest=P.read(path.join(root,'data/latest.json'));result.latestReportId=latest?.reportId;
  if(latest?.reportId===r?.reportId&&!fs.readFileSync(path.join(root,'data/latest.json')).equals(fs.readFileSync(path.join(root,hp))))result.errors.push('latest and history bytes differ');
 }
}
if(!result.errors.length)result.status='pipeline-passed';
result.dataComplete=Object.values(result.roles).every(x=>x.moduleStatus==='ok'||x.moduleStatus==='no-change');
console.log(JSON.stringify(result,null,2));if(result.errors.length)process.exitCode=1;
