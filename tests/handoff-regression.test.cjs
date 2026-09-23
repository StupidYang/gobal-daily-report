'use strict';
const t=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs'),Q=require('../assets/content-contract.js'),N=require('../lib/news-retention.cjs'),E=require('../lib/execution.cjs');
const {createWorker}=require('../scripts/execution-worker.cjs'),router=require('../scripts/route-execution-event.cjs');
const project=path.resolve(__dirname,'..'),fixtures=path.join(__dirname,'fixtures/native-handoff');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-pinned-native-replay-'));
const seed=P.read(path.join(fixtures,'baseline.json'));P.atomic(path.join(root,'config/watchlist.json'),seed.config);P.atomic(path.join(root,'data/latest.json'),seed.latest);P.atomic(path.join(root,'automation/control.json'),{version:1,productionPaused:false,qualityPolicy:'content-r3'});
for(const [role,m]of Object.entries(seed.modules)){P.atomic(path.join(root,'data/modules',role+'.json'),m);P.atomic(path.join(root,P.archivePath(m)),m);}
t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const load=id=>({result:P.read(path.join(fixtures,id+'.json')),submission:P.read(path.join(fixtures,id+'-submission.json'))});
for(const id of ['20260923T145853-global-main','20260923T153900-asia-session'])t('literal failed native handoff compiles without rewriting '+id,()=>{
 const {result,submission}=load(id),before=P.hash(submission),now=Date.parse(submission.editorial.analyzedAt)+20000;
 const batch=L.compile(root,result.packet,submission.editorial,{...submission.execution,taskGroup:result.taskGroup,now});
 const report=batch.modules.find(m=>m.module==='synthesis').payload.report;
 a.deepEqual(Q.quality(report).errors,[]);a.deepEqual(P.validateReport(report),[]);a.equal(P.hash(submission),before);
 a.deepEqual(B.prepareBatch(root,batch,now).receipts.map(x=>x.status),batch.modules.map(()=> 'published'));
 a.equal(report.reportMeta.analysisAsOf,submission.editorial.analyzedAt);
 const quotes=batch.modules.find(m=>m.module==='quotes');a.ok(quotes,'regional task must not discard collected quotes');
 a.equal(report.reportMeta.moduleRefs.quotes.runId,quotes.runId);
 for(const row of result.packet.rows.filter(x=>x.instrumentId.startsWith('INDEX:CN:'))){const actual=quotes.payload.items.find(x=>x.instrumentId===row.instrumentId);a.equal(actual.price,row.price);a.equal(actual.asOf,row.asOf);}
 a.ok(report.newsroom.legacyItems.length>0,'legacy incomplete news must stay explicitly traceable');
 a.ok(report.newsroom.legacyItems.every(x=>x.missingFields.length||x.legacyReason));
 if(result.taskGroup==='global-main')a.equal(report.newsroom.items.length,14);
 else {a.equal(report.newsroom.items.length,0);a.equal(report.newsroom.legacyItems.length,18);a.ok(report.newsroom.legacyItems.every(x=>!x.plainImpact),'no invented impact text');}
});
t('framework name alias is normalized while an absent conclusion is still rejected',()=>{
 const x=load('20260923T145853-global-main'),e=x.submission.editorial;
 a.equal(Q.normalize(e.report).frameworkAnalysis[0].framework,e.report.frameworkAnalysis[0].name);
 delete e.report.frameworkAnalysis[0].conclusion;
 a.throws(()=>L.compile(root,x.result.packet,e,{...x.submission.execution,now:Date.parse(e.analyzedAt)+20000}),/框架缺少名称或结论/);
});
t('malformed NEW news is not silently quarantined or filled',()=>a.throws(()=>N.merge(null,[{id:'n',title:'item',summary:'text',sourceIds:['s']}],{sources:[{id:'s',url:'https://example.com'}]}),/regions, kind, plainImpact, assessment/));
t('a valid same-window item retains its original dates and body',()=>{
 const item={id:'n',title:'news',regions:['US'],kind:'market',summary:'fact',plainImpact:'impact',assessment:'judgment',sourceIds:['s'],publishedAt:'2026-09-23T01:00:00Z'};
 const n=N.merge({runId:'prior',generatedAt:'2026-09-23T02:00:00Z',payload:{newsroom:{items:[item]}}},[],{now:Date.parse('2026-09-23T03:00:00Z'),sources:[{id:'s',url:'https://example.com'}]});
 a.equal(n.items[0].publishedAt,item.publishedAt);a.equal(n.items[0].assessment,item.assessment);a.equal(n.coverage.retained,1);
});
t('revision route preserves execution ID and rejects a second correction',()=>{
 a.deepEqual(router.select([{filename:'runtime/submissions/run--r1.json',status:'added'}]),{file:'runtime/submissions/run--r1.json',mode:'submit',id:'run',revision:1});
 a.throws(()=>router.select([{filename:'runtime/submissions/run--r2.json',status:'added'}]),/Only submission/);
 a.throws(()=>router.select([{filename:'runtime/requests/run--r1.json',status:'added'}]),/Only submission/);
});
t('terminal cleanup after deadline cannot revive publication or abort a newer owner',()=>{
 const s=E.acquire(E.idle(),'global-main',{executionId:'old',now:0,budgetMs:1000}),n=E.terminate(s,s,'timeout',2000);
 a.equal(n.phase,'failed');a.throws(()=>E.assertOwner(n,s,2001),/terminal/);
 const newer=E.acquire(s,'global-main',{executionId:'new',now:2000,budgetMs:1000});a.throws(()=>E.terminate(newer,s,'old cleanup',2001),/obsolete/);
});
function harness(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-handoff-test-')),now=Date.parse('2026-09-23T03:00:00Z'),id='test-run',packet={version:1,rows:[],capturedAt:new Date(now).toISOString(),completedAt:new Date(now).toISOString()},token={executionId:id,generation:1};
 let state=E.acquire(E.idle(),'global-main',{now,executionId:id,budgetMs:120000});state=E.transition(state,token,'analyzing',{sourcePacketHash:P.hash(packet)},now+100);let serial=0;
 const files=new Map(),calls=[];
 function put(branch,name,v){files.set(branch+':'+name,{sha:String(++serial),content:Buffer.from(P.json(v)).toString('base64')});}
 put('main','automation/control.json',{version:1,productionPaused:false,executionProtocol:'lease-v1'});
 put('gdr-runtime','runtime/results/'+id+'.json',{packet,packetHash:P.hash(packet),execution:token,taskGroup:'global-main'});
 const store={read:async()=>({sha:serial,state:structuredClone(state)}),cas:async(s,n)=>{a.equal(s.sha,serial);serial++;state=structuredClone(n);return {sha:serial,state:n};},request:async(method,url,body)=>{
  calls.push({method,url,body});if(url.startsWith('/actions/'))return {};
  const [name,query]=url.replace('/contents/','').split('?'),branch=body?.branch||new URLSearchParams(query).get('ref');const key=branch+':'+name,old=files.get(key);
  if(method==='GET')return old||null;
  if(old&&body.sha!==old.sha)throw new E.Conflict();if(!old&&body.sha)throw new E.Conflict();files.set(key,{sha:String(++serial),content:body.content});return {content:files.get(key)};
 }};
 let bad=true;
 const worker=createWorker({root,store,out:dir,clock:()=>now+1000,compile:()=>{if(bad)throw Error('frameworkAnalysis[0].conclusion missing');return {batchId:id,execution:token,modules:[]};},prepare:()=>({reportId:'2026-09-23-1100',receipts:[]})});
 const submit=(revision=0)=>{put('gdr-runtime','runtime/submissions/'+id+(revision?'--r1':'')+'.json',{execution:token,editorial:{packetHash:P.hash(packet),revision}});};
 return {worker,id,token,calls,submit,state:()=>state,setGood:()=>bad=false,done:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
t('rejected editorial stays bounded, one revision can submit, duplicate delivery cannot redispatch',async()=>{
 const h=harness();try{
  h.submit();const r=await h.worker.run('submit',h.id);a.equal(r.status,'needs-revision');a.equal(h.state().phase,'analyzing');const deadline=h.state().deadlineAt;
  a.equal((await h.worker.run('submit',h.id)).status,'needs-revision');a.equal(h.state().submissionAttempts,1);
  h.setGood();h.submit(1);a.equal((await h.worker.run('submit',h.id,{revision:1})).status,'submitted-not-published');a.equal(h.state().deadlineAt,deadline);
  a.equal((await h.worker.run('submit',h.id,{revision:1})).status,'submitted-not-published');
  a.equal(h.calls.filter(c=>c.method==='POST'&&c.url.includes('dispatches')).length,1);
 }finally{h.done();}
});
t('second invalid submission releases the shared lease instead of leaving analyzing',async()=>{
 const h=harness();try{h.submit();await h.worker.run('submit',h.id);h.submit(1);a.equal((await h.worker.run('submit',h.id,{revision:1})).status,'failed');a.equal(h.state().phase,'failed');a.equal(h.state().submissionAttempts,2);}finally{h.done();}
});
t('execution status never calls an expired analyzing job healthy',()=>{
 const S=require('../assets/execution-status.js');a.match(S.describe({status:'ready-for-analysis',deadlineAt:'2026-09-23T01:00:00Z'},Date.parse('2026-09-23T02:00:00Z')),/超时/);a.match(S.describe({status:'needs-revision'}),/尚未发布/);a.match(S.describe({status:'submitted-not-published'}),/等待发布/);a.match(S.describe({status:'completed'}),/仓库/);
});
