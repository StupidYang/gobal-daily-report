#!/usr/bin/env node
'use strict';
// Replay unedited failed native submissions against a fixed historical dependency snapshot.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs'),Q=require('../assets/content-contract.js'),Control=require('../lib/control.cjs');
const project=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(project,'.runtime/handoff-proof')),seed=P.read(path.join(project,'tests/fixtures/native-handoff/baseline.json'));
fs.mkdirSync(out,{recursive:true});const results=[];
for(const [short,id]of [['global','20260923T145853-global-main'],['asia','20260923T153900-asia-session']]){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-exact-handoff-'));
 try{
  for(const rel of ['assets','docs','config','index.html','.nojekyll'])fs.cpSync(path.join(project,rel),path.join(tmp,rel),{recursive:true});
  P.atomic(path.join(tmp,'config/watchlist.json'),seed.config);P.atomic(path.join(tmp,'data/latest.json'),seed.latest);
  P.atomic(path.join(tmp,'automation/control.json'),{version:1,productionPaused:true,qualityPolicy:'content-r3',executionProtocol:'lease-v1'});
  P.atomic(path.join(tmp,Control.VALIDATION_MARKER),{purpose:'isolated-real-data-validation',allowRealValidation:true});
  for(const [role,m]of Object.entries(seed.modules)){P.atomic(path.join(tmp,'data/modules',role+'.json'),m);P.atomic(path.join(tmp,P.archivePath(m)),m);}
  const f=path.join(project,'tests/fixtures/native-handoff'),input=P.read(path.join(f,id+'.json')),submission=P.read(path.join(f,id+'-submission.json')),now=Date.parse(submission.editorial.analyzedAt)+20000;
  const before=P.hash(submission),batch=L.compile(tmp,input.packet,submission.editorial,{...submission.execution,taskGroup:input.taskGroup,validationOnly:true,now});
  B.submitBatch(tmp,batch);const receipts=B.promoteBatches(tmp,now),receipt=receipts.find(x=>x.batchId===id);if(receipt?.status!=='published')throw Error(JSON.stringify(receipts));
  const report=P.read(path.join(tmp,'data/latest.json')),quality=Q.quality(report);if(quality.errors.length||P.hash(submission)!==before)throw Error('Replay failed or original editorial mutated');
  fs.writeFileSync(path.join(tmp,'index.html'),fs.readFileSync(path.join(tmp,'index.html'),'utf8').replace('<html lang="zh-CN"','<html data-mode="validation" lang="zh-CN"'));
  cp.execFileSync(process.execPath,[path.join(project,'scripts/build-reader-projections.cjs')],{env:{...process.env,GDR_ROOT:tmp}});
  cp.execFileSync(process.execPath,[path.join(project,'scripts/stage-site.cjs'),path.join(out,'site-'+short)],{env:{...process.env,GDR_ROOT:tmp}});
  P.atomic(path.join(out,short+'-report.json'),report);
  results.push({executionId:id,taskGroup:input.taskGroup,originalSubmissionHash:before,sourcePacketHash:input.packetHash,analysisAsOf:report.reportMeta.analysisAsOf,reportId:report.reportId,modules:receipt.modules.length,quality,legacyNews:report.newsroom.legacyItems.length,activeNews:report.newsroom.items.length,scope:'isolated original-failure replay, not a new live-source collection or production release'});
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
P.atomic(path.join(out,'replay.json'),{status:'passed',cases:results});console.log(JSON.stringify(results.map(x=>({executionId:x.executionId,status:'passed',modules:x.modules})),null,2));
