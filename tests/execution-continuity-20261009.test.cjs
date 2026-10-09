'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const E=require('../lib/execution.cjs'),P=require('../lib/pipeline.cjs'),H=require('../lib/analysis-handoff.cjs'),S=require('../assets/execution-status.js'),{createWorker}=require('../scripts/execution-worker.cjs');
const start=Date.parse('2026-10-08T17:04:21.777Z'),late=Date.parse('2026-10-08T17:58:30Z');
function lease(){let s=E.acquire(E.idle(),'global-main',{now:start,executionId:'20261008T170407Z-global-main'});s.generation=39;return E.transition(s,s,'analyzing',{sourcePacketHash:'a'.repeat(64)},start+10000);}
test('historical 01:58 case permits the second business attempt but never the expired token',()=>{
 const old=lease(),before=JSON.stringify(old),d=E.admission(old,'global-main',{now:late});
 assert.equal(d.reasonCode,'RETRY_AVAILABLE');assert.equal(d.attempts,1);
 const next=E.acquire(old,'global-main',{now:late,executionId:'second'});assert.equal(next.generation,40);assert.equal(JSON.stringify(old),before);
 assert.throws(()=>E.assertOwner(old,old,late),/deadline/);assert.throws(()=>E.assertOwner(next,old,late),/obsolete/);
 const failed=E.terminate(next,next,'business timeout',late+1);
 assert.equal(E.admission(failed,'global-main',{now:late+2}).reasonCode,'ATTEMPTS_EXHAUSTED');
 assert.throws(()=>E.acquire(failed,'global-main',{now:late+2,executionId:'third'}),e=>e.reasonCode==='ATTEMPTS_EXHAUSTED');
});
test('admission distinguishes publishing, live owner and successful hour without relaxing any gate',()=>{
 const s=lease();assert.equal(E.admission(s,'global-main',{now:start+10001}).reasonCode,'BUSY_ACTIVE');
 assert.equal(E.admission({...s,phase:'publishing'},'global-main',{now:late}).reasonCode,'BUSY_PUBLISHING');
 const c={...s,phase:'completed',recentSlots:s.recentSlots.map(x=>({...x,status:'completed'}))};
 assert.equal(E.admission(c,'global-main',{now:late}).reasonCode,'SLOT_COMPLETED');
 assert.equal(E.admission(c,'global-main',{now:Date.parse('2026-10-08T18:05:00Z')}).reasonCode,'NEW_SLOT');
 assert.throws(()=>E.admission(c,'global-main',{now:NaN}),/Invalid/);
});
test('hour boundary is never rounded into the future; the 05-minute schedule leaves the old slot',()=>{
 const s=lease(),c={...s,phase:'completed',recentSlots:s.recentSlots.map(x=>({...x,status:'completed'}))};
 assert.equal(E.admission(c,'global-main',{now:Date.parse('2026-10-08T17:59:51Z')}).reasonCode,'SLOT_COMPLETED');
 assert.equal(E.admission(c,'global-main',{now:Date.parse('2026-10-08T18:05:00Z')}).reasonCode,'NEW_SLOT');
 const manifest=require('../automation/manifest.json');assert.equal(manifest.tasks.find(x=>x.id==='global-main').rrule,'FREQ=HOURLY;BYMINUTE=5;BYSECOND=0');
 assert.equal(manifest.tasks.length,3);
});
function harness(t,initial=lease()){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-expiry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let state=structuredClone(initial),rev=0,seq=0,now=late;const files=new Map(),writes=[];
 const put=(branch,name,value)=>files.set(branch+':'+name,{sha:String(++seq),content:Buffer.from(P.json(value)).toString('base64')});
 const read=(branch,name)=>{const v=files.get(branch+':'+name);return v?JSON.parse(Buffer.from(v.content,'base64')):null;};
 const store={read:async()=>({sha:rev,state:structuredClone(state)}),cas:async(s,n)=>{if(s.sha!==rev)throw new E.Conflict();rev++;state=structuredClone(n);writes.push({lease:state.executionId});return {sha:rev,state:n};},request:async(method,url,body)=>{
  const [name,q]=url.replace('/contents/','').split('?'),branch=body?.branch||new URLSearchParams(q).get('ref');const key=branch+':'+name,old=files.get(key);
  if(method==='GET')return old||null;
  if(url.startsWith('/actions/')){writes.push({method,url});return {};}
  if(old&&old.sha!==body.sha)throw new E.Conflict();files.set(key,{sha:String(++seq),content:body.content});writes.push({key});return {content:files.get(key)};
 }};
 const packet={version:1,capturedAt:new Date(late).toISOString(),completedAt:new Date(late).toISOString(),rows:[],documents:[],requests:[],errors:[],durationMs:1};
 put('main','automation/control.json',{version:1,productionPaused:false,executionProtocol:'lease-v1'});
 const worker=createWorker({root:path.join(__dirname,'..'),out:dir,store,clock:()=>now,collect:async()=>packet,compile:(_r,_p,e,o)=>({batchId:o.executionId,execution:o,modules:[]}),prepare:()=>({reportId:'2026-10-09-0158',receipts:[]})});
 return {worker,store,put,read,writes,state:()=>state,setState:n=>{state=n;rev++;},setNow:n=>now=n,packet};
}
test('next request closes an expired analysis with observation-based reason and preserves original deadline',async t=>{
 const h=harness(t),s=h.state();h.put('gdr-runtime','runtime/outcomes/'+s.executionId+'.json',{status:'ready-for-analysis',packetHash:s.sourcePacketHash,history:[]});
 const out=await h.worker.expirePrevious();assert.equal(out.status,'expired');assert.equal(out.reasonCode,'ANALYSIS_SUBMISSION_NOT_OBSERVED');
 assert.equal(out.deadlineAt,s.deadlineAt);assert.equal(out.expiredAt,s.deadlineAt);assert.equal(out.detectedAt,new Date(late).toISOString());assert.equal(out.packetHash,s.sourcePacketHash);
 assert.equal(h.state().phase,'failed');assert.equal(h.state().recentSlots[0].status,'failed');
 assert.equal(h.read('gdr-runtime','runtime/health.json').attempts[0].reasonCode,out.reasonCode);
 assert.equal(await h.worker.expirePrevious(),null);
});
test('an observed submission is not reported missing or rewritten during timeout closure',async t=>{
 const h=harness(t),id=h.state().executionId,submission={execution:{executionId:id,generation:39},editorial:{text:'original'}};
 h.put('gdr-runtime','runtime/submissions/'+id+'.json',submission);
 const out=await h.worker.expirePrevious();assert.equal(out.reasonCode,'SUBMISSION_PROCESSING_NOT_CONFIRMED');assert.equal(out.submissionObserved,true);
 assert.deepEqual(h.read('gdr-runtime','runtime/submissions/'+id+'.json'),submission);
});
test('active, publishing, awaiting-publication and terminal leases are not touched by expiry cleanup',async t=>{
 for(const phase of ['publishing','awaiting-publication','completed','failed']){
  const h=harness(t,{...lease(),phase});assert.equal(await h.worker.expirePrevious(),null);assert.equal(h.writes.length,0);
 }
 const h=harness(t);h.setNow(start+10001);assert.equal(await h.worker.expirePrevious(),null);assert.equal(h.writes.length,0);
});
test('cleanup CAS loser cannot terminate the new owner or claim the old outcome was changed',async t=>{
 const h=harness(t),cas=h.store.cas;h.store.cas=async(s,n)=>{h.setState(E.acquire(h.state(),'global-main',{now:late,executionId:'peer'}));return cas(s,n);};
 await assert.rejects(()=>h.worker.expirePrevious(),e=>e.code==='CONFLICT');assert.equal(h.state().executionId,'peer');assert.equal(h.state().phase,'collecting');
 assert.equal(h.read('gdr-runtime','runtime/outcomes/20261008T170407Z-global-main.json'),null);
});
test('published evidence prevents speculative timeout closure',async t=>{
 const h=harness(t),id=h.state().executionId;h.put('gdr-runtime','runtime/outcomes/'+id+'.json',{repositoryPublished:true});
 await assert.rejects(()=>h.worker.expirePrevious(),e=>e.reasonCode==='HANDOFF_RECONCILIATION_REQUIRED');assert.equal(h.state().phase,'analyzing');
});
test('compact handoff preserves exact observations, zero values, evidence hashes and input bytes',()=>{
 const packet={rows:[{instrumentId:'BTC',price:123.4,changePct:0,asOf:'2026-10-08T17:58:00Z',currency:'USD',sourceUrl:'https://example.org/quote',sourceHash:'b'.repeat(64)}],documents:[{id:'news',url:'https://example.org/news',contentRetrieved:true,body:'must not serialize original body',sourceHash:'c'.repeat(64)}],errors:[{error:'HTTP 404'}]};
 const result={requestId:'case',taskGroup:'global-main',execution:{executionId:'case',generation:1},packetHash:E.digest(packet),packet,deadlineAt:'2026-10-08T18:18:00Z'},before=JSON.stringify(result),h=H.handoff(result,late);
 assert.equal(h.packetHash,result.packetHash);assert.deepEqual(h.observations,packet.rows);assert.equal(h.documents[0].body,undefined);assert.equal(h.nextAction,'READ_EVIDENCE_AND_SUBMIT');assert.equal(h.submissionPath,'runtime/submissions/case.json');assert.equal(JSON.stringify(result),before);
 assert.throws(()=>H.handoff({...result,packetHash:'wrong'},late),/Invalid/);
});
test('worker completes new-request handoff and accepts its bound submission without new tasks or clock renewal',async t=>{
 const h=harness(t),id='controlled-second';h.put('gdr-runtime','runtime/requests/'+id+'.json',{version:1,requestId:id,taskGroup:'global-main',requestedAt:new Date(late).toISOString(),documents:[]});
 const result=await h.worker.request(id);const handoff=h.read('gdr-runtime',result.handoffPath);assert.equal(handoff.packetHash,result.packetHash);assert.equal(h.state().generation,40);assert.equal(h.state().phase,'analyzing');
 h.put('gdr-runtime',handoff.submissionPath,{execution:result.execution,editorial:{packetHash:result.packetHash,analyzedAt:new Date(late).toISOString()}});
 const out=await h.worker.submit(id);assert.equal(out.status,'submitted-not-published');assert.equal(h.state().deadlineAt,result.deadlineAt);
 assert.equal(h.writes.filter(x=>x.method==='POST').length,1);assert.equal(h.read('gdr-runtime','runtime/health.json').attempts.length,2);
});
test('expired status is visible and cannot become a green CLI result',()=>{
 assert.match(S.describe({status:'expired'}),/过期/);assert.equal(require('../scripts/execution-cli.cjs').executionExitCode({status:'expired'}),1);
 assert.equal(S.describe({status:'skipped-busy',reasonCode:'SLOT_COMPLETED'}),'该小时已完成，重复请求已跳过');
});
