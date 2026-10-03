'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs');
const hour=3600000,start=Date.parse('2026-10-03T12:00:00Z'),iso=n=>new Date(start+n*hour).toISOString(),copy=x=>JSON.parse(JSON.stringify(x));
const source=(n=0)=>({id:'src-document',url:'https://example.org/filing',name:'Filing receipt '+n,sourceHash:P.hash('receipt-'+n),retrievedAt:iso(n),checkedAt:iso(n)});
const record=(o={})=>({instrumentId:'EQUITY:US:TEST',eventKey:'earnings-v1',eventType:'earnings',period:'2026Q3',documentId:'filing-v1',documentUrl:source().url,sourceHash:source().sourceHash,analyzedAt:iso(0),analysis:{conclusion:'Original conclusion',evidence:{sourceIds:[source().id]}},sourceIds:[source().id],...o});
const check=(n=0,o={})=>({instrumentId:'EQUITY:US:TEST',eventKey:'earnings-v1',checkedAt:iso(n),status:'checked',sourceIds:[source().id],details:{sourceIds:[source().id]},...o});
const moduleOf=(n=0,records=[],checks=[],sources=[source(n)])=>({moduleVersion:1,module:'research',runId:'research-'+n,generatedAt:iso(n),dataAsOf:iso(n),status:'ok',sources,payload:{records,checks}});
const receipt=(m,id)=>m.sources.find(s=>s.id===id);

test('repeated hourly same-URL refreshes preserve original cached research and check receipts',()=>{
 const original=moduleOf(0,[record()],[check()], [source(),{id:'unused',url:'https://example.org/unused'}]),before=copy(original);let previous=original,retainedId;
 for(let n=1;n<=4;n++){
  const incoming=moduleOf(n,[record({analyzedAt:iso(n),analysis:{conclusion:'Must not replace cached analysis'}})]),inputBefore=copy(incoming),priorBefore=copy(previous),merged=P.mergeResearch(previous,incoming),old=merged.payload.records[0];
  assert.match(old.sourceIds[0],/^research-retained-/);if(retainedId)assert.equal(old.sourceIds[0],retainedId);retainedId=old.sourceIds[0];
  assert.deepEqual(receipt(merged,retainedId),{...source(),id:retainedId});assert.deepEqual(receipt(merged,source().id),source(n));
  assert.equal(old.analyzedAt,iso(0));assert.equal(old.sourceHash,source().sourceHash);assert.equal(old.analysis.conclusion,'Original conclusion');assert.deepEqual(old.analysis.evidence.sourceIds,[retainedId]);
  assert.equal(merged.payload.checks[0].checkedAt,iso(0));assert.deepEqual(merged.payload.checks[0].sourceIds,[retainedId]);assert.deepEqual(merged.payload.checks[0].details.sourceIds,[retainedId]);
  assert.deepEqual(merged.payload.cacheAudit.added,[]);assert.deepEqual(merged.payload.cacheAudit.reused,['EQUITY:US:TEST|earnings-v1']);assert.equal(merged.sources.length,2);
  assert.deepEqual(P.W.validate(merged,'research',start+5*hour),[]);assert.deepEqual(previous,priorBefore);assert.deepEqual(incoming,inputBefore);previous=merged;
 }
 assert.deepEqual(original,before);
});

test('new records and checks keep current receipts while cloned old items keep their originals',()=>{
 const previous=moduleOf(0,[record()],[check()]),fresh=record({eventKey:'earnings-v2',documentId:'filing-v2',sourceHash:source(1).sourceHash,analyzedAt:iso(1)}),incoming=moduleOf(1,[fresh],[check(1)]),before=[copy(previous),copy(incoming)];
 const merged=P.mergeResearch(previous,incoming),old=merged.payload.records[0],current=merged.payload.records[1];
 assert.notEqual(old.sourceIds[0],source().id);assert.deepEqual(current,fresh);assert.deepEqual(current.sourceIds,[source().id]);assert.deepEqual(receipt(merged,current.sourceIds[0]),source(1));
 assert.deepEqual(merged.payload.checks[1],incoming.payload.checks[0]);assert.deepEqual(receipt(merged,merged.payload.checks[0].sourceIds[0]),{...source(),id:old.sourceIds[0]});
 assert.notStrictEqual(old,previous.payload.records[0]);assert.notStrictEqual(old.analysis,previous.payload.records[0].analysis);assert.notStrictEqual(merged.payload.checks[0],previous.payload.checks[0]);
 assert.deepEqual([previous,incoming],before);
});

test('a changed receipt timestamp alone must not refresh old cached evidence',()=>{
 const previous=moduleOf(0,[record()]),fresh={...source(),retrievedAt:iso(1)},incoming=moduleOf(1,[],[],[fresh]),merged=P.mergeResearch(previous,incoming);
 assert.notEqual(merged.payload.records[0].sourceIds[0],fresh.id);assert.equal(receipt(merged,merged.payload.records[0].sourceIds[0]).retrievedAt,iso(0));assert.deepEqual(receipt(merged,fresh.id),fresh);
});

test('unchanged receipts do not need aliases and unreferenced historical receipts are discarded',()=>{
 const previous=moduleOf(0,[record()],[],[source(),{id:'unused',url:'https://example.org/unused'}]),incoming=moduleOf(1,[],[],[copy(source())]),merged=P.mergeResearch(previous,incoming);
 assert.deepEqual(merged.sources,[source()]);assert.deepEqual(merged.payload.records,[record()]);
});

test('check deduplication and the 500-check cap do not retain dropped source receipts',()=>{
 const previous=moduleOf(0,[],[check()]),incoming=moduleOf(1,[],[check(0,{details:{sourceIds:[source().id],note:'current winner'}})]),merged=P.mergeResearch(previous,incoming);
 assert.deepEqual(merged.payload.checks,incoming.payload.checks);assert.deepEqual(merged.sources,[source(1)]);
 const checks=Array.from({length:501},(_,i)=>check(1,{eventKey:'check-'+i})),capped=P.mergeResearch(previous,moduleOf(1,[],checks));
 assert.equal(capped.payload.checks.length,500);assert.deepEqual(capped.sources,[source(1)]);assert.equal(capped.payload.cacheAudit.checksRetained,0);
});

test('same-event fingerprints and URL conflicts still fail closed without mutating inputs',()=>{
 const previous=moduleOf(0,[record()]),before=copy(previous);
 assert.throws(()=>P.mergeResearch(previous,moduleOf(1,[record({sourceHash:source(1).sourceHash})])),/eventKey/);
 assert.throws(()=>P.mergeResearch(previous,moduleOf(1,[],[],[{...source(1),url:'https://example.org/changed'}])),/不同URL/);
 assert.throws(()=>P.mergeResearch({...previous,sources:[]},moduleOf(1)),/历史研究来源元数据缺失/);
 assert.deepEqual(previous,before);
});

test('research ingestion retries remain idempotent after a source receipt is retained',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-research-provenance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 P.ingest(root,moduleOf(0,[record()],[check()]),start+2*hour);const incoming=moduleOf(1,[record()],[check(1)]);
 assert.equal(P.ingest(root,incoming,start+2*hour).status,'published-module');const file=path.join(root,'data/modules/research.json'),before=fs.readFileSync(file,'utf8');
 assert.equal(P.ingest(root,incoming,start+2*hour).status,'idempotent');assert.equal(fs.readFileSync(file,'utf8'),before);
 const merged=P.read(file);assert.equal(merged.payload.records[0].analyzedAt,iso(0));assert.equal(receipt(merged,merged.payload.records[0].sourceIds[0]).retrievedAt,iso(0));
});
