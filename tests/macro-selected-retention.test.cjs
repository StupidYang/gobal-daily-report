'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs');
const hour=3600000,start=Date.parse('2026-10-01T00:00:00Z'),iso=n=>new Date(n).toISOString(),copy=x=>JSON.parse(JSON.stringify(x));
function seed(){return {runId:'original',generatedAt:iso(start),dataAsOf:iso(start-hour),sources:[],payload:{canonicalFacts:[{id:'flow',rawValue:42,value:{net:42},asOf:iso(start-2*hour),observationDate:'2026-09-30',verifiedAt:iso(start-hour),sourceIds:[]},{id:'unselected',rawValue:1,sourceIds:[]}],events:[],macroEvents:[],fundingNotes:[]}};}
const wrap=(result,at)=>({...result,runId:'wrapper-'+at,generatedAt:iso(at),sources:result.retainedSources});

test('selected retention mixes exact historical facts with fresh facts without a false common clock',()=>{
 const previous=seed(),input={macroFacts:[{id:'fresh',rawValue:10,sourceIds:['current']}],retainedMacroFactIds:['flow','flow']},before=copy(previous),inputBefore=copy(input);
 const result=L.prepareMacro(previous,input,start+hour);
 assert.deepEqual(result.payload.canonicalFacts.map(f=>f.id),['fresh','flow']);
 assert.deepEqual(result.payload.retainedFactIds,['flow']);assert.equal(result.payload.laneRetention.canonicalFacts,undefined);
 assert.deepEqual(result.payload.canonicalFacts[0],input.macroFacts[0]);
 const {retention,...fact}=result.payload.canonicalFacts[1];assert.deepEqual(fact,previous.payload.canonicalFacts[0]);
 assert.equal(retention.generatedAt,previous.generatedAt);assert.equal(retention.runId,'original');
 assert.equal(result.dataAsOf,null);assert.equal(result.retention,null);assert.equal(result.status,'partial');
 assert.deepEqual(previous,before);assert.deepEqual(input,inputBefore);
});

test('selected fact retention preserves item, lane, then module origin precedence',()=>{
 for(const level of ['item','lane','module']){
  const previous=seed(),anchor={runId:level,generatedAt:iso(start-hour),dataAsOf:iso(start-3*hour)};
  if(level==='item'){previous.payload.canonicalFacts[0].retention=anchor;previous.payload.laneRetention={canonicalFacts:{runId:'ignored',generatedAt:iso(start)}};}
  if(level==='lane')previous.payload.laneRetention={canonicalFacts:anchor};
  if(level==='module')previous.retention=anchor;
  const result=L.prepareMacro(previous,{retainedMacroFactIds:['flow']},start+hour);
  assert.deepEqual(result.payload.canonicalFacts[0].retention,anchor);assert.deepEqual(result.retention,anchor);assert.equal(result.dataAsOf,anchor.dataAsOf);
 }
});

test('unknown, ambiguous, malformed, expired, future, and invalid selections fail closed',()=>{
 assert.throws(()=>L.prepareMacro(seed(),{retainedMacroFactIds:['missing']},start+hour),/unknown/);
 const ambiguous=seed();ambiguous.payload.canonicalFacts.push(copy(ambiguous.payload.canonicalFacts[0]));
 assert.throws(()=>L.prepareMacro(ambiguous,{retainedMacroFactIds:['flow']},start+hour),/ambiguous/);
 for(const selection of [null,'flow',[null],['']])assert.throws(()=>L.prepareMacro(seed(),{retainedMacroFactIds:selection},start+hour),/array/);
 for(const generatedAt of [iso(start-24*hour),iso(start+2*hour),'invalid']){
  const previous=seed();previous.payload.canonicalFacts[0].retention={runId:'bad-origin',generatedAt};
  assert.throws(()=>L.prepareMacro(previous,{retainedMacroFactIds:['flow']},start+hour),/expired or invalid/);
 }
});

test('selected facts expire at their original boundary despite repeated fresh wrappers',()=>{
 let previous=seed();
 for(let h=1;h<=24;h++){
  const result=L.prepareMacro(previous,{macroFacts:[{id:'fresh-'+h}],retainedMacroFactIds:['flow']},start+h*hour);
  assert.equal(result.payload.canonicalFacts[1].retention.generatedAt,iso(start));previous=wrap(result,start+h*hour);
 }
 assert.throws(()=>L.prepareMacro(previous,{macroFacts:[{id:'fresh-25'}],retainedMacroFactIds:['flow']},start+25*hour),/expired/);
 assert.deepEqual(L.prepareMacro(previous,{},start+25*hour).payload.canonicalFacts.map(f=>f.id),['fresh-24']);
});

test('fresh same-ID facts override selected historical values and expired retention',()=>{
 const previous=seed(),fresh={id:'flow',rawValue:99,asOf:iso(start+25*hour),sourceIds:['current']};
 const result=L.prepareMacro(previous,{macroFacts:[fresh],retainedMacroFactIds:['flow']},start+25*hour);
 assert.deepEqual(result.payload.canonicalFacts,[fresh]);assert.deepEqual(result.payload.retainedFactIds,[]);
 assert.deepEqual(result.retainedSources,[]);assert.equal(result.retention,null);
 assert.deepEqual(L.prepareMacro(previous,{retainedMacroFactIds:[]},start+hour).payload.canonicalFacts,[]);
});

test('selected same-URL historical sources stay isolated from fresh receipts through repeated compilation',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-selected-macro-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fixtures=path.join(__dirname,'fixtures/native-handoff'),baseline=P.read(path.join(fixtures,'baseline.json'));
 const packet=P.read(path.join(fixtures,'20260923T145853-global-main.json')).packet,input=copy(P.read(path.join(fixtures,'20260923T145853-global-main-submission.json')).editorial);
 const now=Date.parse(input.analyzedAt)+20000,originalAt=iso(now-hour);
 P.atomic(path.join(root,'config/watchlist.json'),baseline.config);P.atomic(path.join(root,'data/latest.json'),baseline.latest);
 for(const [role,m]of Object.entries(baseline.modules)){P.atomic(path.join(root,'data/modules',role+'.json'),m);P.atomic(path.join(root,P.archivePath(m)),m);}
 const {sourceUrls,...baseFact}=input.macroFacts[0],oldId=L.sourceId(sourceUrls[0]);
 const oldSource={id:oldId,url:sourceUrls[0],name:'Historical observation',retrievedAt:originalAt,sourceHash:P.hash('historical')};
 const oldFact={...baseFact,id:'retained-'+baseFact.id,sourceIds:[oldId],verifiedAt:originalAt,observationDate:originalAt.slice(0,10)};
 let previous={...baseline.modules.macro,runId:'original-macro',generatedAt:originalAt,retention:undefined,sources:[oldSource],payload:{canonicalFacts:[oldFact],macroEvents:[],events:[],fundingNotes:[]}};
 input.retainedMacroFactIds=[oldFact.id];const originalInput=copy(input);let archivedId;
 for(let n=0;n<3;n++){
  P.atomic(path.join(root,'data/modules/macro.json'),previous);
  const batch=L.compile(root,packet,input,{executionId:'selected-'+n,generation:n+1,now:now+n*hour}),macro=batch.modules.find(m=>m.module==='macro'),report=batch.modules.find(m=>m.module==='synthesis').payload.report;
  const retained=macro.payload.canonicalFacts.find(f=>f.id===oldFact.id),id=retained.sourceIds[0];
  assert.match(id,/^macro-retained-/);if(archivedId)assert.equal(id,archivedId);archivedId=id;
  assert.deepEqual(report.sources.find(s=>s.id===id),{...oldSource,id});
  assert.deepEqual(macro.payload.canonicalFacts.find(f=>f.id===baseFact.id).sourceIds,sourceUrls.map(L.sourceId));
  const current=packet.documents.find(d=>d.url===sourceUrls[0]);assert.equal(report.sources.find(s=>s.id===oldId).sourceHash,current.sourceHash);
  for(const key of ['rawValue','asOf','observationDate','verifiedAt'])assert.deepEqual(retained[key],oldFact[key]);
  assert.equal(retained.retention.generatedAt,originalAt);assert.equal(macro.dataAsOf,null);
  assert.equal(report.sources.filter(s=>s.id.startsWith('macro-retained-')).length,1);previous=macro;
 }
 assert.deepEqual(input,originalInput);
});
