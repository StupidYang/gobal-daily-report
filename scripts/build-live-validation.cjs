#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs'),Q=require('../assets/content-contract.js'),Control=require('../lib/control.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'));
function build(packetFile,editorialFile,destination){
 const started=Date.now(),packet=P.read(packetFile),editorial=P.read(editorialFile),temp=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-real-validation-'));
 const protectedPaths=['data/latest.json','data/history-index.json','data/publication-status.json'],before=Object.fromEntries(protectedPaths.map(p=>[p,P.hash(fs.readFileSync(path.join(root,p),'utf8'))]));
 try{
  for(const rel of ['assets','config','docs','data/modules','data/runs','data/latest.json','data/history-index.json','history','index.html','.nojekyll','automation/control.json']){const from=path.join(root,rel);if(fs.existsSync(from)){fs.mkdirSync(path.dirname(path.join(temp,rel)),{recursive:true});fs.cpSync(from,path.join(temp,rel),{recursive:true});}}
  P.atomic(path.join(temp,Control.VALIDATION_MARKER),{purpose:'isolated-real-data-validation',allowRealValidation:true});
  const options={executionId:editorial.executionId,generation:1,taskGroup:'global-main',validationOnly:true,now:Date.now()};
  const batch=L.compile(root,packet,editorial,options);B.submitBatch(temp,batch);const receipts=B.promoteBatches(temp,options.now),receipt=receipts.find(x=>x.batchId===batch.batchId);if(receipt?.status!=='published')throw Error('Isolated validation publication failed: '+JSON.stringify(receipts));
  const report=P.read(path.join(temp,'data/latest.json')),quality=Q.quality(report);if(quality.errors.length)throw Error(quality.errors.join('\n'));
  // Only this validated edition is exposed under /validation/. Original histories remain untouched.
  const ownHistory=`history/${report.reportId.slice(0,10)}/${report.reportId.slice(-4)}.json`,history=P.read(path.join(temp,ownHistory));fs.rmSync(path.join(temp,'history'),{recursive:true,force:true});P.atomic(path.join(temp,ownHistory),history);P.atomic(path.join(temp,'data/history-index.json'),{updatedAt:report.updatedAt,reports:[{reportId:report.reportId,label:report.updatedAt,path:ownHistory,schemaVersion:5}]});
  const keep=new Set(receipt.modules.map(x=>`data/runs/${x.role}/${x.runId}.json`));for(const role of P.W.MODULES){const dir=path.join(temp,'data/runs',role);if(fs.existsSync(dir))for(const f of fs.readdirSync(dir))if(!keep.has(`data/runs/${role}/${f}`))fs.rmSync(path.join(dir,f));}
  let html=fs.readFileSync(path.join(temp,'index.html'),'utf8').replace('<html lang="zh-CN"','<html data-mode="validation" lang="zh-CN"');fs.writeFileSync(path.join(temp,'index.html'),html);
  P.atomic(path.join(temp,'data/validation-result.json'),{status:'real-source-validation-passed',reportId:report.reportId,sourcePacketHash:P.hash(packet),collectionStartedAt:packet.capturedAt,collectionCompletedAt:packet.completedAt,collectionDurationMs:packet.durationMs,analysisFinishedAt:editorial.analyzedAt,assemblyStartedAt:new Date(started).toISOString(),assemblyDurationMs:Date.now()-started,sourceCoverage:Q.quoteCoverage(P.read(path.join(temp,'config/watchlist.json')),P.read(path.join(temp,'data/modules/quotes.json')),Date.now()),qualityWarnings:quality.warnings,productionReady:false,note:'真实来源固定验收快照；不是原生定时任务已恢复，也不证明新闻范围完整。'});
  cp.execFileSync(process.execPath,[path.join(root,'scripts/stage-site.cjs'),path.resolve(destination)],{env:{...process.env,GDR_ROOT:temp},stdio:'pipe'});
  fs.copyFileSync(path.join(temp,'data/validation-result.json'),path.join(destination,'data/validation-result.json'));
  for(const rel of protectedPaths)if(P.hash(fs.readFileSync(path.join(root,rel),'utf8'))!==before[rel])throw Error('Production mutated by isolated validation');
  return {reportId:report.reportId,batchId:batch.batchId,modules:receipt.modules.length,quality,assemblyDurationMs:Date.now()-started,productionUnchanged:true};
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
if(require.main===module){try{const [a,b,c]=process.argv.slice(2);if(!a||!b||!c)throw Error('Expected packet.json editorial.json output-site-directory');console.log(JSON.stringify(build(path.resolve(a),path.resolve(b),path.resolve(c)),null,2));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={build};
