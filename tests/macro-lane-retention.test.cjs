'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../lib/live-report.cjs');
const start=Date.parse('2026-10-01T00:00:00Z'),hour=3600000,iso=n=>new Date(n).toISOString();
const copy=x=>JSON.parse(JSON.stringify(x));
function seed(){return {
 runId:'macro-origin',generatedAt:iso(start),dataAsOf:iso(start-hour),
 sources:[{id:'original-source',url:'https://www.bls.gov/news.release/empsit.htm',verifiedAt:iso(start-2*hour)}],
 payload:{
  canonicalFacts:[{id:'payrolls',rawValue:100,asOf:iso(start-hour),verifiedAt:iso(start-2*hour),sourceIds:['original-source']}],
  macroEvents:[{id:'release',eventAt:iso(start-hour),actual:'100',sourceIds:['original-source']}],
  events:[{id:'old-radar',at:iso(start+6*hour),sourceIds:['original-source']}],
  fundingNotes:['No comparable funding window was verified.',{id:'funding',asOf:iso(start-hour),sourceIds:['original-source']}],
  coverage:{status:'partial',note:'Original source-backed coverage.'}
 }
};}
const wrap=(result,at)=>({...result,runId:'macro-'+at,generatedAt:iso(at),sources:result.retainedSources});
const radar=at=>({id:'radar-'+at,at:iso(at+hour),sourceIds:['current-calendar']});

test('fresh radar does not erase empty or absent facts, macro releases, or funding lanes',()=>{
 for(const emptyLanes of [{},{macroFacts:[],macroEvents:[],macroFundingNotes:[]}]){
  const previous=seed(),before=copy(previous),event=radar(start+hour),input={...emptyLanes,events:[event]};
  const result=L.prepareMacro(previous,input,start+hour);
  assert.equal(result.status,'partial');
  assert.equal(result.retention,null,'A mixed refresh must not claim a single retained module snapshot');
  assert.equal(result.dataAsOf,null,'The new wrapper must not invent a common evidence time');
  assert.deepEqual(result.payload.events,[event]);
  for(const key of ['canonicalFacts','macroEvents','fundingNotes']){
   assert.equal(result.payload[key].length,previous.payload[key].length);
   assert.equal(result.payload.laneRetention[key].runId,previous.runId);
   assert.equal(result.payload.laneRetention[key].generatedAt,previous.generatedAt);
  }
  assert.equal(result.payload.canonicalFacts[0].asOf,previous.payload.canonicalFacts[0].asOf);
  assert.equal(result.payload.canonicalFacts[0].verifiedAt,previous.payload.canonicalFacts[0].verifiedAt);
  assert.equal(result.payload.fundingNotes[0],previous.payload.fundingNotes[0]);
  assert.equal(result.payload.fundingNotes[1].retention.runId,previous.runId);
  assert.deepEqual(result.retainedSources,previous.sources);
  assert.deepEqual(previous,before);
  assert.deepEqual(input.events,[event]);
 }
});

test('each nonempty macro input replaces only its own evidence lane',()=>{
 for(const [inputKey,key] of [['macroFacts','canonicalFacts'],['macroEvents','macroEvents'],['macroFundingNotes','fundingNotes']]){
  const previous=seed(),newItems=[{id:'new-'+key,sourceIds:['new-source']}];
  const result=L.prepareMacro(previous,{[inputKey]:newItems},start+hour);
  assert.deepEqual(result.payload[key],newItems);
  assert.equal(result.payload.laneRetention[key],undefined);
  for(const other of ['canonicalFacts','macroEvents','events','fundingNotes'].filter(x=>x!==key)){
   assert.equal(result.payload[other].length,previous.payload[other].length);
   assert.equal(result.payload.laneRetention[other].runId,previous.runId);
  }
 }
});

test('checked-empty radar clears old events without dropping retained facts or funding',()=>{
 const previous=seed(),result=L.prepareMacro(previous,{events:[]},start+hour);
 assert.deepEqual(result.payload.events,[]);
 assert.equal(result.payload.laneRetention.events,undefined);
 assert.equal(result.payload.canonicalFacts[0].id,'payrolls');
 assert.equal(result.payload.fundingNotes.length,2);
 assert.equal(result.payload.macroEvents[0].id,'release');
 assert.equal(result.retention.runId,previous.runId);
 assert.equal(result.dataAsOf,previous.dataAsOf);
});

test('fresh hourly radar cannot renew historical fact or string funding retention',()=>{
 let previous=seed();
 for(let h=1;h<=24;h++){
  const at=start+h*hour,result=L.prepareMacro(previous,{events:[radar(at)]},at);
  assert.equal(result.payload.canonicalFacts[0].retention.runId,'macro-origin');
  assert.equal(result.payload.canonicalFacts[0].retention.generatedAt,iso(start));
  assert.equal(result.payload.canonicalFacts[0].asOf,iso(start-hour));
  assert.equal(result.payload.laneRetention.fundingNotes.generatedAt,iso(start));
  assert.equal(result.payload.fundingNotes[0],seed().payload.fundingNotes[0]);
  assert.equal(result.retainedSources[0].verifiedAt,iso(start-2*hour));
  assert.ok(result.payload.coverage.note.length<300,'Retention explanations must stay bounded');
  previous=wrap(result,at);
 }
 const at=start+25*hour,result=L.prepareMacro(previous,{events:[radar(at)]},at);
 for(const key of ['canonicalFacts','macroEvents','fundingNotes'])assert.deepEqual(result.payload[key],[]);
 assert.deepEqual(result.payload.events,[radar(at)]);
 assert.equal(result.retention,null);
 assert.deepEqual(result.retainedSources,[]);
});

test('lane clocks remain independent when later facts outlive the older funding snapshot',()=>{
 const factAt=start+10*hour,newFact={id:'new-fact',asOf:iso(factAt),sourceIds:['new-source']};
 let previous=wrap(L.prepareMacro(seed(),{macroFacts:[newFact],events:[]},factAt),factAt);
 const first=L.prepareMacro(previous,{},start+11*hour);
 assert.equal(first.payload.canonicalFacts[0].retention.generatedAt,iso(factAt));
 assert.equal(first.payload.laneRetention.fundingNotes.generatedAt,iso(start));
 previous=wrap(first,start+11*hour);
 const later=L.prepareMacro(previous,{},start+25*hour);
 assert.equal(later.payload.canonicalFacts[0].id,'new-fact');
 assert.equal(later.payload.canonicalFacts[0].asOf,iso(factAt));
 assert.deepEqual(later.payload.fundingNotes,[]);
 assert.deepEqual(later.payload.macroEvents,[]);
 assert.equal(L.prepareMacro(wrap(later,start+25*hour),{},start+35*hour).payload.canonicalFacts.length,0);
});

test('retained item clocks override recent wrappers and invalid anchors fail closed',()=>{
 for(const anchor of [iso(start-24*hour),'invalid',null]){
  const previous=seed();
  previous.payload.canonicalFacts[0].retention={runId:'older-origin',generatedAt:anchor,dataAsOf:null};
  const result=L.prepareMacro(previous,{events:[radar(start+hour)]},start+hour);
  assert.deepEqual(result.payload.canonicalFacts,[]);
  assert.equal(result.payload.fundingNotes.length,2,'Other valid lanes must survive independently');
 }
 const previous=seed();
 previous.payload.laneRetention={fundingNotes:{runId:'invalid-origin',generatedAt:'invalid'}};
 assert.deepEqual(L.prepareMacro(previous,{},start+hour).payload.fundingNotes,[]);
});

test('mixed-age facts expire item by item without losing the newer fact or its timestamp',()=>{
 const previous=seed(),olderAt=start-23*hour;
 previous.payload.canonicalFacts.unshift({id:'older-fact',asOf:iso(olderAt-hour),sourceIds:['original-source'],retention:{runId:'older-origin',generatedAt:iso(olderAt),dataAsOf:iso(olderAt-hour)}});
 const first=L.prepareMacro(previous,{},start+hour);
 assert.equal(first.payload.canonicalFacts.length,2,'The inclusive 24-hour boundary is still retained');
 assert.equal(first.retention,null,'Different origins must not be represented as one module snapshot');
 const later=L.prepareMacro(wrap(first,start+hour),{events:[radar(start+2*hour)]},start+2*hour);
 assert.deepEqual(later.payload.canonicalFacts.map(x=>x.id),['payrolls']);
 assert.equal(later.payload.canonicalFacts[0].asOf,iso(start-hour));
 assert.equal(later.payload.canonicalFacts[0].retention.generatedAt,iso(start));
});

test('fresh radar cannot rescue expired, future, or invalid module retention anchors',()=>{
 for(const anchor of [iso(start-24*hour),iso(start+2*hour),'invalid']){
  const previous=seed();
  previous.retention={runId:'historical-origin',generatedAt:anchor,dataAsOf:iso(start-hour)};
  const event=radar(start+hour),result=L.prepareMacro(previous,{events:[event]},start+hour);
  for(const key of ['canonicalFacts','macroEvents','fundingNotes'])assert.deepEqual(result.payload[key],[]);
  assert.deepEqual(result.payload.events,[event]);
  assert.deepEqual(result.retainedSources,[]);
  assert.equal(result.retention,null);
 }
});

test('missing radar input never retains passed events or evidence outside its original 24h window',()=>{
 const previous=seed();
 const result=L.prepareMacro(previous,{macroFundingNotes:['Fresh funding gap.']},start+7*hour);
 assert.deepEqual(result.payload.events,[],'A known event time already passed');
 previous.payload.events=[{id:'unknown-time',at:null,sourceIds:['original-source']}];
 let retained=wrap(L.prepareMacro(previous,{macroFacts:[{id:'fresh-fact'}]},start+hour),start+hour);
 retained=wrap(L.prepareMacro(retained,{macroFacts:[{id:'later-fact'}]},start+23*hour),start+23*hour);
 const expired=L.prepareMacro(retained,{macroFacts:[{id:'latest-fact'}]},start+25*hour);
 assert.deepEqual(expired.payload.events,[]);
});

test('all-new and missing-prior inputs do not acquire retained provenance or mutate inputs',()=>{
 const input={macroFacts:[{id:'fact'}],macroEvents:[{id:'macro'}],events:[radar(start+hour)],macroFundingNotes:['New funding note.'],macroCoverage:{status:'partial',note:'New evidence.'}},before=copy(input);
 for(const previous of [null,seed()]){
  const result=L.prepareMacro(previous,input,start+hour);
  assert.equal(result.retention,null);
  assert.equal(result.dataAsOf,null);
  assert.deepEqual(result.retainedSources,[]);
  assert.deepEqual(result.payload.canonicalFacts,input.macroFacts);
  assert.deepEqual(result.payload.fundingNotes,input.macroFundingNotes);
 }
 assert.deepEqual(input,before);
});
