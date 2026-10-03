'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs');
const hour=3600000,iso=n=>new Date(n).toISOString(),copy=x=>JSON.parse(JSON.stringify(x));
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-macro-provenance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fixtures=path.join(__dirname,'fixtures/native-handoff'),seed=P.read(path.join(fixtures,'baseline.json'));
 const packet=P.read(path.join(fixtures,'20260923T145853-global-main.json')).packet,editorial=P.read(path.join(fixtures,'20260923T145853-global-main-submission.json')).editorial;
 const now=Date.parse(editorial.analyzedAt)+20000,originalAt=iso(now-hour);
 P.atomic(path.join(root,'config/watchlist.json'),seed.config);P.atomic(path.join(root,'data/latest.json'),seed.latest);
 for(const [role,m]of Object.entries(seed.modules)){P.atomic(path.join(root,'data/modules',role+'.json'),m);P.atomic(path.join(root,P.archivePath(m)),m);}
 const oldSources=packet.documents.map(d=>({id:L.sourceId(d.url),url:d.url,name:d.title,retrievedAt:originalAt,sourceHash:P.hash('historical-'+d.sourceHash),evidenceKind:d.kind||'general'}));
 oldSources.push({id:'unused-old-source',url:'https://www.bls.gov/unused-old-document',sourceHash:P.hash('unused'),retrievedAt:originalAt});
 const historical=items=>items.map(({sourceUrls,...item})=>({...copy(item),sourceIds:sourceUrls.map(L.sourceId)}));
 const previous={...seed.modules.macro,runId:'original-macro',generatedAt:originalAt,sources:oldSources,payload:{canonicalFacts:historical(editorial.macroFacts),macroEvents:historical(editorial.macroEvents),events:historical(editorial.events),fundingNotes:['Legacy funding gap without a citation.',{id:'funding-observation',sourceIds:[oldSources[0].id],details:{sourceIds:[oldSources[2].id]}}]}};
 P.atomic(path.join(root,'data/modules/macro.json'),previous);
 return {root,packet,editorial,previous,now};
}
function run(x,editorial,n=0){
 const batch=L.compile(x.root,x.packet,editorial,{executionId:'macro-provenance-'+n,generation:n+1,now:x.now+n*hour});
 return {macro:batch.modules.find(m=>m.module==='macro'),report:batch.modules.find(m=>m.module==='synthesis').payload.report};
}
function assertCurrentSources(x,report){
 for(const doc of x.packet.documents){const s=report.sources.find(s=>s.id===L.sourceId(doc.url));assert.equal(s.sourceHash,doc.sourceHash);assert.equal(s.retrievedAt,doc.retrievedAt);}
 assert.equal(report.sources.some(s=>s.id==='unused-old-source'),false,'The unrelated previous catalog must not be imported');
}
test('repeated mixed refresh preserves old source hashes without overwriting current same-URL receipts',t=>{
 const x=setup(t),input=copy(x.editorial),before=P.hash(input),packetBefore=P.hash(x.packet),oldBefore=P.hash(x.previous);
 input.macroFacts=[];input.macroFundingNotes=[];
 const preparedBefore=P.hash(input),original=x.previous.sources.find(s=>s.id===L.sourceId(x.editorial.macroFacts[0].sourceUrls[0]));
 let retainedId,retainedCount;
 for(let n=0;n<3;n++){
  const {macro,report}=run(x,input,n),fact=macro.payload.canonicalFacts[0],id=fact.sourceIds[0],source=report.sources.find(s=>s.id===id);
  assert.match(id,/^macro-retained-/);if(retainedId)assert.equal(id,retainedId);retainedId=id;
  assert.deepEqual(source,{...original,id});assertCurrentSources(x,report);
  assert.deepEqual(macro.payload.events[0].sourceIds,x.editorial.events[0].sourceUrls.map(L.sourceId));
  assert.deepEqual(macro.payload.macroEvents[0].sourceIds,x.editorial.macroEvents[0].sourceUrls.map(L.sourceId));
  assert.equal(macro.payload.fundingNotes[0],x.previous.payload.fundingNotes[0]);
  assert.match(macro.payload.fundingNotes[1].details.sourceIds[0],/^macro-retained-/);
  assert.equal(fact.asOf,x.previous.payload.canonicalFacts[0].asOf);assert.equal(fact.retention.generatedAt,x.previous.generatedAt);
  const archived=report.sources.filter(s=>s.id.startsWith('macro-retained-')).length;
  if(retainedCount!==undefined)assert.equal(archived,retainedCount,'Repeated retention must not grow archived-source aliases');retainedCount=archived;
  P.atomic(path.join(x.root,'data/modules/macro.json'),macro);
 }
 assert.equal(P.hash(input),preparedBefore);assert.equal(P.hash(x.packet),packetBefore);assert.equal(P.hash(x.previous),oldBefore);assert.notEqual(preparedBefore,before);
});

test('fresh editorial facts keep current IDs while retained releases from the same URL are namespaced',t=>{
 const x=setup(t),input=copy(x.editorial),url=input.macroFacts[0].sourceUrls[0],oldId=L.sourceId(url);
 x.previous.payload.macroEvents=[{id:'old-release',title:'Historical macro release',sourceIds:[oldId]}];
 P.atomic(path.join(x.root,'data/modules/macro.json'),x.previous);input.macroEvents=[];
 const before=P.hash(input),{macro,report}=run(x,input),retained=macro.payload.macroEvents[0];
 assert.deepEqual(macro.payload.canonicalFacts[0].sourceIds,[oldId]);assert.notEqual(retained.sourceIds[0],oldId);
 assert.equal(report.sources.find(s=>s.id===retained.sourceIds[0]).sourceHash,x.previous.sources.find(s=>s.id===oldId).sourceHash);
 assertCurrentSources(x,report);assert.equal(P.hash(input),before);
});

test('retained string-only funding notes do not pull in any previous source catalog',t=>{
 const x=setup(t),input=copy(x.editorial);x.previous.payload.fundingNotes=['No verified funding evidence.'];
 P.atomic(path.join(x.root,'data/modules/macro.json'),x.previous);
 const {macro,report}=run(x,input);assert.deepEqual(macro.payload.fundingNotes,x.previous.payload.fundingNotes);
 assert.equal(report.sources.some(s=>s.id.startsWith('macro-retained-')),false);assertCurrentSources(x,report);
});
