#!/usr/bin/env node
'use strict';
// Read-only evidence inventory. This does not fetch, publish, schedule or approve a release.
const fs=require('node:fs'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),Q=require('../assets/content-contract.js'),N=require('../lib/news-retention.cjs');
function audit(root,now=Date.now()) {
 const report=P.read(path.join(root,'data/latest.json'));
 const config=P.read(path.join(root,'config/watchlist.json'));
 if(!report||!config)throw Error('Report and watchlist are required');
 const modules={},errors=[];
 for(const role of P.W.MODULES.filter(role=>role!=='synthesis')) {
  const ref=report.reportMeta?.moduleRefs?.[role];
  if(!ref||!new RegExp('^data/runs/'+role+'/[A-Za-z0-9_-]+\\.json$').test(ref.path||'')){
   errors.push('Missing or invalid frozen ref: '+role);continue;
  }
  const m=P.read(path.join(root,ref.path));
  if(!m||m.runId!==ref.runId||m.module!==role){errors.push('Frozen identity mismatch: '+role);continue;}
  modules[role]=m;
 }
 const sources=new Map((report.sources||[]).map(s=>[s.id,s]));
 const items=report.newsroom?.items||[];
 const regionCounts={CN:0,US:0,WORLD:0};
 const external=items.filter(item=>N.evidenceClass(item,sources)==='external');
 external.forEach(item=>{for(const region of new Set(item.regions||[]))if(region in regionCounts)regionCounts[region]++;});
 const equities=role=>{
  const groups=modules[role]?.payload?.groups||[];
  const ranks=groups.map(group=>P.W.rankGroup(group,config));
  return {groups:groups.length,sampleRows:groups.reduce((n,g)=>n+(g.rows||[]).length,0),
   eligible: ranks.reduce((n,r)=>n+r.eligible,0),scorable:ranks.reduce((n,r)=>n+r.scorable,0),
   nonemptyHotGroups:ranks.filter(r=>r.hot.length).length,nonemptyWeakGroups:ranks.filter(r=>r.weak.length).length,
   note:'Input eligibility only; not proof of verified full-sector coverage.'};
 };
 const macro=modules.macro?.payload||{},research=modules.research?.payload||{};
 return {auditVersion:1,checkedAt:new Date(now).toISOString(),reportId:report.reportId,
  reportGeneratedAt:report.reportMeta?.generatedAt||null,reportHash:P.hash(report),frozenInputErrors:errors,
  codeContentContract:Q.quality(report),quotes:Q.quoteCoverage(config,modules.quotes,now),
  news:{activeItems:items.length,externalSourceBacked:external.length,
   marketDataOnly:items.filter(item=>N.evidenceClass(item,sources)==='market-data').length,
   externalRegionCounts:regionCounts,externalGeneral:external.filter(item=>item.kind==='general').length,
   note:'Source classification is not independent verification of facts, article reading or reasoning.'},
  asia:equities('asia-equities'),us:equities('us-equities'),
  macro:{facts:(macro.canonicalFacts||[]).length,events:(macro.macroEvents||[]).length,fundingNotes:(macro.fundingNotes||[]).length},
  research:{records:(research.records||[]).length,coveredCompanies:new Set((research.records||[]).map(r=>r.instrumentId)).size,
   checks:(research.checks||[]).length,pending:(research.pendingQueue||[]).length},
  acceptance:{semanticSourceReview:'not-established-by-this-audit',nativeContinuity:'not-established-by-this-audit',productionResumeAuthorized:false}};
}
if(require.main===module){try{console.log(P.json(audit(path.resolve(process.argv[2]||path.join(__dirname,'..')))).trimEnd());}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={audit};
