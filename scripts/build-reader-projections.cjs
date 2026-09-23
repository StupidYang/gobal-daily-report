#!/usr/bin/env node
'use strict';
/* Deterministic read projections; immutable reports/runs are never modified. */
const fs=require('node:fs'),path=require('node:path'),P=require('../lib/pipeline.cjs'),Ret=require('../lib/retention.cjs'),Q=require('../assets/content-contract.js');
function build(root){
 const config=P.read(path.join(root,'config/watchlist.json')),index=P.read(path.join(root,'data/history-index.json'),{reports:[]});
 const latest=P.read(path.join(root,'data/latest.json')),latestCut=P.W.time(latest.reportMeta?.generatedAt||latest.updatedAt);
 const history=index.reports.filter(x=>/^history\/\d{4}-\d{2}-\d{2}\/\d{4}\.json$/.test(x.path)).map(x=>({path:x.path,report:P.read(path.join(root,x.path))})).filter(x=>x.report).sort((a,b)=>P.W.time(a.report.updatedAt)-P.W.time(b.report.updatedAt));
 const modules={};for(const role of ['quotes','asia-equities','us-equities']){
  const dir=path.join(root,'data/runs',role);modules[role]=!fs.existsSync(dir)?[]:fs.readdirSync(dir).filter(f=>/^[\w-]+\.json$/.test(f)).map(f=>P.read(path.join(dir,f))).filter(m=>m&&m.dataMode!=='synthetic'&&m.execution?.mode!=='fixture'&&P.W.time(m.generatedAt)<=latestCut&&!P.W.validate(m,role,latestCut).length).sort((a,b)=>P.W.time(a.generatedAt)-P.W.time(b.generatedAt)||a.runId.localeCompare(b.runId));
 }
 const evidence=[];fs.rmSync(path.join(root,'data/reader-projections/undefined.json'),{force:true});
 for(const {report:r}of history){
  if(r.reportMeta?.dataMode==='synthetic'||!/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(r.reportId||''))continue;const cut=P.W.time(r.reportMeta?.generatedAt||r.updatedAt);if(cut===null)continue;
  const view={version:1,reportId:r.reportId,reportHash:P.hash(r),cutoff:r.reportMeta?.generatedAt||r.updatedAt,modules:{},warnings:[],quality:Q.quality(r),policy:'read-projection-v1',note:'历史留存记录的展示恢复，不是新采集；报告及不可变run没有被重写。'};
  for(const role of Object.keys(modules)){
   const ref=r.reportMeta?.moduleRefs?.[role];if(!ref||!new RegExp('^data/runs/'+role+'/[\\w-]+\\.json$').test(ref.path||''))continue;
   const raw=P.read(path.join(root,ref.path));if(!raw||raw.runId!==ref.runId||P.W.time(raw.generatedAt)>cut||P.W.validate(raw,role,cut).length)continue;
   let effective=null;
   for(const older of modules[role].filter(m=>P.W.time(m.generatedAt)<P.W.time(raw.generatedAt))){try{effective=Ret.merge(effective,older);}catch(e){view.warnings.push(role+': '+e.message);}}
   try{effective=Ret.merge(effective,raw);}catch(e){view.warnings.push(role+': '+e.message);effective=raw;}
   const errors=P.W.validate(effective,role,cut);if(errors.length){view.warnings.push(...errors);continue;}
   effective.projectionOf={runId:raw.runId,path:ref.path,rawHash:P.hash(raw),notNewCollection:true};view.modules[role]=effective;
  }
  view.quoteCoverage=Q.quoteCoverage(config,view.modules.quotes,cut);
  if(view.quality.errors.length){const prior=history.filter(x=>P.W.time(x.report.updatedAt)<P.W.time(r.updatedAt)).reverse().find(x=>new Set((x.report.deepDive||[]).map(Q.marketOf).filter(Boolean)).size===6);if(prior){const o=prior.report;view.archivedReport={reportId:o.reportId,updatedAt:o.updatedAt,deepDive:o.deepDive,sources:o.sources,canonicalFacts:o.canonicalFacts,note:'未经本轮重新核验的历史分析；不算本轮资产详报通过。'};}}
  P.atomic(path.join(root,'data/reader-projections',r.reportId+'.json'),view);
  evidence.push({reportId:r.reportId,coverage:view.quoteCoverage,errors:view.quality.errors,archivedReportId:view.archivedReport?.reportId||null,warnings:view.warnings});
 }
 return {policy:'content-r3',latestReportId:latest.reportId,reports:evidence};
}
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'))),null,2));
module.exports={build};
