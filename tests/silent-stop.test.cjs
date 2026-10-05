'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const P=require('../lib/pipeline.cjs'),E=require('../lib/execution.cjs');
const {createPublisher}=require('../scripts/publication-lease.cjs');
const {createWorker}=require('../scripts/execution-worker.cjs');
const UI=require('../assets/execution-status.js');
const start=Date.parse('2026-09-25T03:00:00+08:00'),now=Date.parse('2026-09-28T19:00:00+08:00');
const control={version:1,productionPaused:false,executionProtocol:'lease-v1',supervisedAcceptance:{enabledTaskGroups:['global-main'],pausedTaskGroups:['asia-session','us-session']}};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-stop-regression-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 P.atomic(path.join(root,'automation/control.json'),control);
 const token={executionId:'original-exec',generation:1};let state=E.acquire(E.idle(),'global-main',{executionId:token.executionId,now:start});
 state=E.transition(state,token,'analyzing',{},start+1);
 state=E.transition(state,token,'awaiting-publication',{batchId:token.executionId,batchHash:'a'.repeat(64)},start+2);
 state=E.transition(state,token,'publishing',{workflowRunId:100},start+3);
 const receipt={status:'published',batchId:token.executionId,taskGroup:'global-main',inputHash:state.batchHash,reportId:'2026-09-25-0313'};
 state=E.transition(state,token,'completed',{reportId:receipt.reportId,receiptHash:P.hash(receipt)},start+16*60000);
 const oldHealth={version:1,tasks:{'global-main':{requestId:token.executionId,status:'deployed',at:state.finishedAt,reportId:receipt.reportId,deployed:true,deployment:{status:'verified',workflowRunId:100}}},updatedAt:state.finishedAt};
 const oldOutcome={...oldHealth.tasks['global-main'],history:[{status:'deployed',at:state.finishedAt}]};
 const files=new Map(),calls=[];let serial=0;
 const put=(branch,name,value)=>files.set(branch+':'+name,{sha:String(++serial),content:Buffer.from(P.json(value)).toString('base64')});
 put('main','automation/control.json',control);put('main','data/receipts/batches/'+token.executionId+'.json',receipt);
 put('gdr-runtime','runtime/health.json',oldHealth);put('gdr-runtime','runtime/outcomes/'+token.executionId+'.json',oldOutcome);
 const store={read:async()=>({sha:'lease',state:structuredClone(state)}),cas:async(_,s)=>{calls.push({method:'CAS'});state=structuredClone(s);return {sha:'lease',state};},request:async(method,url,body)=>{
  calls.push({method,url});const [name,query]=url.replace('/contents/','').split('?');const branch=body?.branch||new URLSearchParams(query).get('ref'),key=branch+':'+name,old=files.get(key);
  if(method==='GET')return old||null;
  if(method!=='PUT')throw Error('Unexpected non-contents write '+url);
  if(old&&body.sha!==old.sha)throw new E.Conflict();
  const value={sha:String(++serial),content:body.content};files.set(key,value);return {content:value};
 }};
 const publicProof={status:'verified',workflowRunId:200,reportId:receipt.reportId,buildId:'b'.repeat(64),latestSha256:'c'.repeat(64),historySha256:'c'.repeat(64),browserChecksPassed:true,checkedAt:new Date(now).toISOString()};
 const proofFile=path.join(root,'proof.json');P.atomic(proofFile,publicProof);
 const read=(branch,name)=>JSON.parse(Buffer.from(files.get(branch+':'+name).content,'base64'));
 return {root,store,files,calls,put,read,token,state:()=>state,oldHealth,oldOutcome,publicProof,proofFile,receipt};
}
test('code-only revalidation never rewrites old execution health or outcomes',async t=>{
 const f=fixture(t),p=createPublisher({root:f.root,store:f.store,runId:200,proofFile:f.proofFile,jobStatus:'success',clock:()=>now});
 const result=await p.main('finish');
 assert.deepEqual(f.read('gdr-runtime','runtime/health.json'),f.oldHealth,'a deploy is not a new task run');
 assert.deepEqual(f.read('gdr-runtime','runtime/outcomes/'+f.token.executionId+'.json'),f.oldOutcome);
 assert.equal(f.state().workflowRunId,100);assert.equal(f.calls.some(c=>c.method==='CAS'),false);
 assert.equal(result.status,'deployment-revalidated');assert.equal(result.newExecution,false);
 assert.equal(f.read('gdr-runtime','runtime/deployment-verifications/200.json').reportId,f.receipt.reportId);
});
test('same revalidation is idempotent and never creates a freshness heartbeat',async t=>{
 const f=fixture(t),opts={root:f.root,store:f.store,runId:200,proofFile:f.proofFile,jobStatus:'success'};
 await createPublisher({...opts,clock:()=>now}).main('finish');const before=f.calls.filter(c=>c.method==='PUT').length;
 await createPublisher({...opts,clock:()=>now+60000}).main('finish');assert.equal(f.calls.filter(c=>c.method==='PUT').length,before);
 assert.deepEqual(f.read('gdr-runtime','runtime/health.json'),f.oldHealth);
});
test('revalidation rejects incomplete browser proof instead of recording a green receipt',async t=>{
 const f=fixture(t);P.atomic(f.proofFile,{...f.publicProof,browserChecksPassed:false});
 await assert.rejects(()=>createPublisher({root:f.root,store:f.store,runId:200,proofFile:f.proofFile,jobStatus:'success',clock:()=>now}).main('finish'),/complete public verification/);
 assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);
});
test('paused regional group is rejected before lease acquisition or network collection',async t=>{
 const f=fixture(t),id='blocked-regional';f.put('gdr-runtime','runtime/requests/'+id+'.json',{version:1,requestId:id,taskGroup:'asia-session',requestedAt:new Date(now).toISOString(),documents:[]});
 let collected=false;const w=createWorker({root:f.root,store:f.store,out:path.join(f.root,'out'),clock:()=>now,collect:async()=>{collected=true;throw Error('Must not reach collection');}});
 const r=await w.run('request',id);assert.equal(r.status,'paused');assert.equal(collected,false);assert.equal(f.calls.some(c=>c.method==='CAS'),false);
});
test('new global runtime is not made fresh by an unrelated regional health update',()=>{
 const h={version:1,tasks:{'global-main':{at:new Date(start).toISOString()},'us-session':{at:new Date(now).toISOString()}},updatedAt:new Date(now).toISOString()};
 const x=UI.freshnessStatus({reportMeta:{generatedAt:new Date(now-10*60000).toISOString()}},h,control,now);
 assert.equal(x?.stale,true);assert.match(x.text,/全球任务/);
});
test('historical deployment and newer disabled scheduler inspection both remain visible',()=>{
 const c={...control,schedulerObservation:{version:1,recordedAt:new Date(now-60000).toISOString(),tasks:[{id:'global-main',enabled:false,updatedAt:new Date(start).toISOString()}]}};
 const x={status:'deployed',at:new Date(start).toISOString(),deployed:true,deployment:{status:'verified'}};
 const text=UI.taskText('global-main',x,c,now);assert.match(text,/公网版本与正文验收已通过/);assert.match(text,/排查时为停用/);
 assert.match(UI.taskText('global-main',x,c,now+3*3600000),/当前.*未核验/);
});
test('new execution evidence does not imply that native scheduling was enabled',()=>{
 const c={...control,schedulerObservation:{version:1,recordedAt:new Date(now-60000).toISOString(),tasks:[{id:'global-main',enabled:false}]}};
 const x={status:'ready-for-analysis',at:new Date(now).toISOString(),executionStartedAt:new Date(now).toISOString(),deadlineAt:new Date(now+120000).toISOString()};
 assert.match(UI.taskStatus('global-main',x,c,now),/分析/);
 const s=UI.taskText('global-main',x,c,now);assert.match(s,/分析/);assert.match(s,/排查时为停用/);
});
