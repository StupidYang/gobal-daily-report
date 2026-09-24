'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../lib/live-collector.cjs'),L=require('../lib/live-report.cjs'),N=require('../lib/news-retention.cjs');
const start=Date.parse('2026-09-24T00:00:00Z');
const iso=n=>new Date(n).toISOString();
const source={id:'s',url:'https://www.bls.gov/news.release/example.htm',retrievedAt:iso(start)};
function macroSeed(){return {runId:'origin',generatedAt:iso(start),dataAsOf:iso(start),sources:[source],payload:{canonicalFacts:[{id:'f',rawValue:1,asOf:iso(start),sourceIds:['s']}],macroEvents:[],events:[],fundingNotes:[]}};}
test('repeated hourly packaging cannot renew the 24h macro retention window',()=>{
 let previous=macroSeed();
 for(let hour=1;hour<=24;hour++){
  const result=L.prepareMacro(previous,{},start+hour*3600000);
  assert.ok(result.retention,'Within original retention window');
  previous={...previous,...result,runId:'hour-'+hour,generatedAt:iso(start+hour*3600000),sources:result.retainedSources};
 }
 const expired=L.prepareMacro(previous,{},start+25*3600000);
 assert.equal(expired.retention,null,'Original data must expire even after 24 successful rewrappings');
 assert.equal(expired.payload.canonicalFacts.length,0);
});
test('one retained macro origin and reason stay bounded over hourly refreshes',()=>{
 let previous=macroSeed();
 for(let hour=1;hour<=10;hour++){
  const result=L.prepareMacro(previous,{},start+hour*3600000);
  assert.equal(result.retention.runId,'origin');
  assert.equal(result.retention.generatedAt,iso(start));
  assert.ok(result.payload.coverage.note.length<300);
  previous={...previous,...result,runId:'hour-'+hour,generatedAt:iso(start+hour*3600000),sources:result.retainedSources};
 }
});
test('slow quote lane cannot starve fast document evidence behind it',async()=>{
 const config={required:Array.from({length:8},(_,i)=>({id:'CRYPTO:TEST:'+i,market:'CRYPTO',symbol:'BTC',name:'Test',currency:'USD'})),usPools:{}};
 let active=0,maxActive=0;const starts=[];
 const packet=await C.collect(config,{budgetMs:100,requestMs:70,concurrency:2,documents:[{id:'document',url:'https://example.org/document',title:'Test document'}],fetchImpl:(url,{signal})=>{
  starts.push(url);active++;maxActive=Math.max(active,maxActive);
  if(url.includes('/document')){active--;return Promise.resolve({ok:true,status:200,headers:{get:()=>null},text:async()=>'<p>Evidence</p>'});}
  return new Promise((resolve,reject)=>{const fail=()=>{active--;reject(Error('Injected source timeout'));};if(signal.aborted)fail();else signal.addEventListener('abort',fail,{once:true});});
 }});
 assert.equal(packet.documentsRetrieved,1,'Document must get a turn before all slow quotes drain the budget');
 assert.ok(starts.slice(0,2).some(x=>x.includes('/document')));
 assert.ok(maxActive<=2,'Lane separation must not double global concurrency');
 assert.equal(packet.complete,false);
 assert.equal(packet.errors.filter(x=>x.instrumentId).length,8);
});
test('complete external coverage cannot borrow missing regions from price observations',()=>{
 const sources=[{id:'article',url:'https://www.who.int/news/item/test'},{id:'quote',url:'https://query1.finance.yahoo.com/v8/finance/chart/test'}];
 const news=(id,regions,sourceIds)=>({eventId:id,title:id,summary:'Test fact',plainImpact:'Test impact',assessment:'Test analysis',regions,sourceIds,kind:sourceIds[0]==='quote'?'market':'general',publishedAt:iso(start)});
 const result=N.merge(null,[news('external-us',['US'],['article']),news('cn-price',['CN'],['quote']),news('world-price',['WORLD'],['quote'])],{now:start+1000,sources,coverage:{status:'complete'}});
 assert.equal(result.coverage.claimedComplete,true);
 assert.equal(result.coverage.complete,false,'Only US has external evidence');
});
test('collection plan covers each work item once with no added scheduler or extra workers',()=>{
 const {collectionPlan}=require('../lib/collection-plan.cjs');
 const plan=collectionPlan({required:[{id:'q1'},{id:'q2'}],usPools:{a:['A','B'],b:['B','C']}},[
  {id:'n',kind:'news'},{id:'m',kind:'macro'},{id:'r',kind:'research'}]);
 assert.equal(plan.jobs.length,8);assert.equal(plan.quoteCount,5);
 assert.deepEqual(plan.jobs.slice(0,5).map(j=>j.lane),['required-quotes','news-documents','macro-documents','candidate-quotes','research-documents']);
 assert.deepEqual(plan.jobs.filter(j=>j.kind==='document').map(j=>j.index).sort(),[0,1,2]);
});
test('honestly source-backed general news from all three regions can still satisfy the existing claim check',()=>{
 const sources=[source];
 const items=['CN','US','WORLD'].map(region=>({eventId:region,title:region,summary:'Test',plainImpact:'Test',assessment:'Test',sourceIds:['s'],regions:[region],kind:'general',publishedAt:iso(start)}));
 const result=N.merge(null,items,{now:start+1000,sources,coverage:{status:'complete'}});
 assert.equal(result.coverage.complete,true);
 assert.deepEqual(result.coverage.externalRegionCounts,{CN:1,US:1,WORLD:1});
 assert.equal(result.coverage.externalGeneral,3);
});
test('invalid original macro anchor fails closed instead of resetting to a fresh wrapper',()=>{
 const previous={...macroSeed(),generatedAt:iso(start+3600000),retention:{runId:'old',generatedAt:'not-a-time',reason:'old'}};
 assert.equal(L.prepareMacro(previous,{},start+7200000).retention,null);
});
test('coverage audit uses frozen report inputs and never turns counts into resumption approval',()=>{
 const path=require('node:path'),fs=require('node:fs'),P=require('../lib/pipeline.cjs');
 const root=path.join(__dirname,'..'),file=path.join(root,'data/latest.json'),before=fs.readFileSync(file);
 const audit=require('../scripts/audit-coverage.cjs').audit(root,start);
 assert.equal(audit.reportId,P.read(file).reportId);
 assert.equal(audit.acceptance.productionResumeAuthorized,false);
 assert.deepEqual(audit.frozenInputErrors,[]);
 assert.equal(audit.quotes.required,31);
 assert.deepEqual(fs.readFileSync(file),before);
});
