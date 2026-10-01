'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs'),Q=require('../assets/content-contract.js');
const {buildQuoteFacts,referencedFactIds}=require('../lib/report-quote-facts.cjs');
const caseData=require('./fixtures/native-handoff/equity-reference-20260930.json');
const now=Date.parse('2026-09-29T16:14:00Z');
function modules(){return {quotes:{payload:{items:[]}},'us-equities':{module:'us-equities',runId:'incident-us',generatedAt:new Date(now).toISOString(),sources:caseData.sources,payload:{groups:[{market:'US',currency:'USD',rows:structuredClone(caseData.rows)}]}}};}
function roots(ids=caseData.rows.map(q=>q.instrumentId)){return [{deepDive:[{evidenceFactIds:ids}]}];}
function compileCase(t,group='global-main'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-quote-reference-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(__dirname,'fixtures/native-handoff'),seed=P.read(path.join(dir,'baseline.json'));
 P.atomic(path.join(root,'config/watchlist.json'),seed.config);P.atomic(path.join(root,'data/latest.json'),seed.latest);
 P.atomic(path.join(root,'automation/control.json'),{version:1,productionPaused:false,qualityPolicy:'content-r3'});
 for(const [role,m]of Object.entries(seed.modules)){P.atomic(path.join(root,'data/modules',role+'.json'),m);P.atomic(path.join(root,P.archivePath(m)),m);}
 const stem=group==='global-main'?'20260923T145853-global-main':'20260923T153900-asia-session';
 const result=P.read(path.join(dir,stem+'.json')),submission=P.read(path.join(dir,stem+'-submission.json'));

 // Real captured 9/30 quotes + an existing validated editorial harness, not a re-issued report.
 result.packet.rows.push(...caseData.rows.map(({sourceIds,...q})=>q));result.packet.requests.push(...caseData.requests);
 submission.editorial.analyzedAt=new Date(now-1000).toISOString();submission.editorial.packetHash=P.hash(result.packet);
 submission.editorial.report.deepDive[0].evidenceFactIds=caseData.rows.map(q=>q.instrumentId);
 const options={executionId:'isolated-equity-reference',generation:19,taskGroup:group,now};
 return {root,packet:result.packet,editorial:submission.editorial,options};
}
test('all five real failed-execution quotes resolve without changing the input or source times',()=>{
 const m=modules(),before=JSON.stringify(m),facts=buildQuoteFacts(m,roots(),now);
 assert.equal(facts.length,5);assert.equal(JSON.stringify(m),before);
 for(const q of caseData.rows){const f=facts.find(x=>x.id===q.instrumentId);assert.equal(f.rawValue,q.price);assert.equal(f.asOf,q.asOf);assert.deepEqual(f.sourceIds,q.sourceIds);assert.equal(f.observationRef.runId,'incident-us');}
});
test('only cited candidate quotes are added; the required quote catalog is not widened',()=>{
 const m=modules();m.quotes.payload.items=[{instrumentId:'CRYPTO:BTC:USD',name:'BTC',price:null,status:'missing',currency:'USD',sourceIds:[]}];
 const facts=buildQuoteFacts(m,roots(['EQUITY:US:ORCL']),now);assert.deepEqual(facts.map(f=>f.id),['CRYPTO:BTC:USD','EQUITY:US:ORCL']);assert.equal(facts[0].rawValue,null);
});
test('citation discovery includes nested factId, factIds and evidenceFactIds but never prose',()=>{
 assert.deepEqual([...referencedFactIds({a:{factId:'A'},b:[{factIds:['B'],evidenceFactIds:['C']}],summary:'EQUITY:US:INVENTED'})],['A','B','C']);
});
test('unknown, missing and uncited stock prices are not manufactured',()=>{
 assert.throws(()=>buildQuoteFacts(modules(),roots(['EQUITY:US:INVENTED']),now),/unavailable/);
 assert.deepEqual(buildQuoteFacts(modules(),[{summary:'EQUITY:US:ORCL'}],now),[]);
});
test('unavailable numeric data, thresholds, incorrect currency and missing evidence remain errors',()=>{
 for(const change of [{price:null},{price:'1'},{price:NaN},{price:0},{displayValue:'约100'},{currency:'CNY'},{sourceIds:[]},{sourceIds:['absent']},{status:'error'},{changePct:'5'}]){
  const m=modules();Object.assign(m['us-equities'].payload.groups[0].rows[0],change);assert.throws(()=>buildQuoteFacts(m,roots([caseData.rows[0].instrumentId]),now),/Invalid referenced quote/);
 }
});
test('future module, future quote, ambiguous asOf and wrong market cannot enter report evidence',()=>{
 const m=modules();m['us-equities'].generatedAt=new Date(now+1).toISOString();assert.throws(()=>buildQuoteFacts(m,roots(),now),/future/);
 for(const change of [{asOf:new Date(now+1).toISOString()},{asOf:'2026-09-29'},{instrumentId:'EQUITY:CN:AAPL'}]){
  const n=modules();Object.assign(n['us-equities'].payload.groups[0].rows[0],change);assert.throws(()=>buildQuoteFacts(n,roots([n['us-equities'].payload.groups[0].rows[0].instrumentId]),now),/future|market/);
 }
});
test('same-identity same-time duplicates deduplicate; conflicting prices fail closed',()=>{
 const m=modules(),g=m['us-equities'].payload.groups[0];m['us-equities'].payload.groups.push(structuredClone(g));assert.equal(buildQuoteFacts(m,roots(),now).length,5);
 m['us-equities'].payload.groups[1].rows[0].price+=1;assert.throws(()=>buildQuoteFacts(m,roots(),now),/conflicting/);
});
test('newer bound sample wins; retained samples preserve original provenance',()=>{
 const m=modules(),g=m['us-equities'].payload.groups[0],old=structuredClone(g);old.retention={runId:'original',reason:'recorded prior sample'};
 old.rows=old.rows.map(q=>({...q,asOf:'2026-09-28T16:05:00Z',price:q.price-1}));m['us-equities'].payload.retainedGroups=[old];
 assert.equal(buildQuoteFacts(m,roots(),now)[0].asOf,g.rows[0].asOf);
 m['us-equities'].payload.groups=[];const f=buildQuoteFacts(m,roots(),now)[0];assert.equal(f.dataStatus,'previous');assert.equal(f.retention.runId,'original');assert.equal(f.asOf,old.rows[0].asOf);
});
test('global compile and atomic batch preparation accept the five captured stock references',t=>{
 const x=compileCase(t),before=P.hash(x.editorial),packetHash=P.hash(x.packet),batch=L.compile(x.root,x.packet,x.editorial,x.options),report=batch.modules.find(m=>m.module==='synthesis').payload.report;
 assert.deepEqual(P.validateReport(report),[]);assert.deepEqual(Q.quality(report).errors,[]);
 assert.equal(report.canonicalFacts.filter(f=>f.id.startsWith('EQUITY:')).length,5);
 assert.equal(batch.modules.find(m=>m.module==='quotes').payload.items.length,31);
 assert.ok(B.prepareBatch(x.root,batch,now).receipts.every(r=>r.status==='published'));
 assert.equal(P.hash(x.editorial),before);assert.equal(P.hash(x.packet),packetHash);
 for(const q of caseData.rows){const f=report.canonicalFacts.find(f=>f.id===q.instrumentId);assert.equal(f.asOf,q.asOf);assert.equal(f.rawValue,q.price);}
});
test('US regional compilation binds cited stocks to its own new module, not an old pointer',t=>{
 const x=compileCase(t,'us-session'),batch=L.compile(x.root,x.packet,x.editorial,x.options),report=batch.modules.find(m=>m.module==='synthesis').payload.report;
 const f=report.canonicalFacts.find(f=>f.id==='EQUITY:US:ORCL');assert.equal(f.observationRef.runId,report.reportMeta.moduleRefs['us-equities'].runId);assert.ok(B.prepareBatch(x.root,batch,now).receipts.every(r=>r.status==='published'));
});
test('compiler still rejects a genuinely unknown reference rather than dropping the citation',t=>{
 const x=compileCase(t);x.editorial.report.deepDive[0].evidenceFactIds.push('EQUITY:US:INVENTED');assert.throws(()=>L.compile(x.root,x.packet,x.editorial,x.options),/unavailable/);
});
test('compiler does not use an unbound raw packet row to satisfy a regional reference',t=>{
 const x=compileCase(t,'asia-session');assert.throws(()=>L.compile(x.root,x.packet,x.editorial,x.options),/unavailable/);
});
