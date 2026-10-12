'use strict';
// Literal rejected submissions and injected infrastructure faults. No network,
// production tree, scheduler, receipt or source timestamp is changed by these tests.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const E=require('../lib/execution.cjs'),P=require('../lib/pipeline.cjs');
const {EditorialValidationError,isEditorialValidationError}=require('../lib/editorial-errors.cjs');
const {createWorker}=require('../scripts/execution-worker.cjs'),{runCli}=require('../scripts/execution-cli.cjs');
const fixtures=path.join(__dirname,'fixtures/native-handoff'),id='20261012T081339Z-global-main';
const literalResult=P.read(path.join(fixtures,id+'-result.json'));
const initial=P.read(path.join(fixtures,id+'-submission.json')),revision=P.read(path.join(fixtures,id+'--r1.json'));
const now=Date.parse('2026-10-12T08:24:10Z');
const typed=()=>new EditorialValidationError([{path:'editorial.report.assets[0].price',code:'invalid-type',message:'price must be a finite number or null'}]);

function harness(t,options={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-editorial-outcome-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 P.atomic(path.join(root,'config/watchlist.json'),P.read(path.join(fixtures,'baseline.json')).config);
 const token=structuredClone(literalResult.execution),result=structuredClone(literalResult),files=new Map(),calls=[];
 let serial=0,leaseRevision=0,state=E.acquire(E.idle(),result.taskGroup,{now:Date.parse(result.deadlineAt)-20*60000,executionId:id});
 state.generation=token.generation;state=E.transition(state,token,'analyzing',{sourcePacketHash:result.packetHash},Date.parse(result.packet.completedAt)+1);
 const put=(branch,name,value)=>files.set(branch+':'+name,{sha:String(++serial),content:Buffer.from(P.json(value)).toString('base64')});
 const read=(branch,name)=>{const x=files.get(branch+':'+name);return x?JSON.parse(Buffer.from(x.content,'base64')):null;};
 put('main','automation/control.json',{version:1,productionPaused:false,executionProtocol:'lease-v1',qualityPolicy:'content-r3'});
 put('gdr-runtime','runtime/results/'+id+'.json',result);
 put('gdr-runtime','runtime/submissions/'+id+'.json',initial);
 put('gdr-runtime','runtime/submissions/'+id+'--r1.json',revision);
 const store={
  read:async()=>({sha:leaseRevision,state:structuredClone(state)}),
  cas:async(snapshot,next)=>{
   options.beforeCas?.(snapshot,next);assert.equal(snapshot.sha,leaseRevision);calls.push({method:'CAS',phase:next.phase});
   leaseRevision++;state=structuredClone(next);return {sha:leaseRevision,state:structuredClone(state)};
  },
  request:async(method,url,body)=>{
   calls.push({method,url,body});options.beforeRequest?.(method,url,body);
   if(url.startsWith('/actions/'))return {};
   const [name,query]=url.replace('/contents/','').split('?'),branch=body?.branch||new URLSearchParams(query).get('ref'),key=branch+':'+name,old=files.get(key);
   if(method==='GET')return old||null;
   assert.equal(method,'PUT');assert.equal(body.sha,old?.sha);
   files.set(key,{sha:String(++serial),content:body.content});return {content:files.get(key)};
  }
 };
 const out=path.join(root,'out'),worker=createWorker({root,store,out,clock:()=>now,...(options.compile?{compile:options.compile}:{}),...(options.prepare?{prepare:options.prepare}:{} )});
 const logs=[],errors=[],summaryFile=path.join(root,'summary.md');
 const cli=revision=>runCli({worker,argv:['submit',id,String(revision)],log:x=>logs.push(JSON.parse(x)),error:x=>errors.push(String(x)),summaryFile});
 const outcome=()=>read('gdr-runtime','runtime/outcomes/'+id+'.json');
 const writes=()=>calls.filter(c=>c.method!=='GET');
 const assertNoPublication=()=>{
  assert.equal(calls.some(c=>c.method==='POST'||c.body?.branch==='main'),false,'a rejected or failed draft cannot create a candidate or dispatch publication');
  assert.equal(fs.existsSync(path.join(root,'data/latest.json')),false);
 };
 return {root,out,worker,store,cli,read,put,outcome,writes,calls,logs,errors,summaryFile,state:()=>state,assertNoPublication};
}

test('literal generation-57 bad drafts are bounded business rejections, never Actions failures or publication',async t=>{
 const originalHashes=[initial,revision,literalResult].map(P.hash),h=harness(t),deadline=h.state().deadlineAt;
 assert.equal(await h.cli(0),0);
 let result=h.outcome();
 assert.equal(result.status,'needs-revision');assert.equal(result.reasonCode,'EDITORIAL_VALIDATION_FAILED');
 assert.equal(result.published,false);assert.equal(result.terminal,false);assert.equal(result.revisionPath,'runtime/submissions/'+id+'--r1.json');
 assert.ok(result.validationIssues.some(x=>x.path.includes('researchRecords')),'the actual malformed company-research records must be reported before atomic publication');
 assert.ok(result.issues.every(x=>typeof x==='string'));assert.equal(h.state().phase,'analyzing');assert.equal(h.state().submissionAttempts,1);
 assert.equal(h.state().deadlineAt,deadline);assert.equal(result.deadlineAt,deadline);h.assertNoPublication();
 const firstWrites=h.writes().length;
 assert.equal(await h.cli(0),0);assert.equal(h.writes().length,firstWrites,'duplicate initial submission only reads its recorded result');

 assert.equal(await h.cli(1),0);result=h.outcome();
 assert.equal(result.status,'editorial-rejected');assert.equal(result.reasonCode,'EDITORIAL_VALIDATION_FAILED');assert.equal(result.revision,1);
 assert.equal(result.terminal,true);assert.equal(result.revisionPath,null);assert.equal(result.published,false);assert.equal(result.repositoryPublished,false);assert.equal(result.deployed,false);
 assert.equal(h.state().phase,'failed');assert.equal(h.state().submissionAttempts,2);assert.equal(h.state().deadlineAt,deadline);
 assert.equal(h.state().generation,57);assert.equal(h.read('gdr-runtime','runtime/health.json').tasks['global-main'].status,'editorial-rejected');
 assert.deepEqual(P.read(path.join(h.out,'validation.json')),result);assert.equal(fs.existsSync(path.join(h.out,'failure.json')),false);
 const finalWrites=h.writes().length;
 assert.equal(await h.cli(1),0);assert.equal(h.writes().length,finalWrites,'duplicate terminal revision cannot enter the terminal lease again');
 assert.equal(h.state().submissionAttempts,2);assert.deepEqual([initial,revision,literalResult].map(P.hash),originalHashes);
 assert.deepEqual(h.read('gdr-runtime','runtime/submissions/'+id+'.json'),initial);assert.deepEqual(h.read('gdr-runtime','runtime/submissions/'+id+'--r1.json'),revision);
 assert.equal(h.errors.length,0);assert.match(fs.readFileSync(h.summaryFile,'utf8'),/稿件最终拒收，本轮未发布/);
 assert.match(fs.readFileSync(h.summaryFile,'utf8'),/没有创建发布候选/);assert.equal(h.logs.at(-1).published,false);h.assertNoPublication();
 await assert.rejects(()=>h.worker.submit(id,{revision:2}),/Only one immutable editorial revision/);
});

test('an internal TypeError is not consumed as a repairable editorial error',async t=>{
 const error=new TypeError('injected compiler bug'),h=harness(t,{compile:()=>{throw error;}});
 assert.equal(await h.cli(0),1);assert.equal(h.outcome().status,'failed');assert.equal(h.outcome().reasonCode,'UNCLASSIFIED_ERROR');
 assert.equal(h.state().phase,'failed');assert.equal(h.state().submissionAttempts,undefined);assert.match(h.errors[0],/TypeError: injected compiler bug/);
 assert.equal(fs.existsSync(path.join(h.out,'validation.json')),false);assert.equal(P.read(path.join(h.out,'failure.json')).status,'failed');h.assertNoPublication();
});

test('actual filesystem errors during preflight still fail the CLI',async t=>{
 let missing;
 const h=harness(t,{compile:()=>({batchId:id,modules:[]}),prepare:()=>fs.readFileSync(missing,'utf8')});
 missing=path.join(h.root,'missing-input.json');assert.equal(await h.cli(0),1);
 assert.equal(h.outcome().status,'failed');assert.equal(h.outcome().reasonCode,'ENOENT');assert.equal(h.state().submissionAttempts,undefined);
 assert.match(h.errors[0],/ENOENT/);assert.equal(fs.existsSync(path.join(h.out,'validation.json')),false);h.assertNoPublication();
});

test('an untyped error cannot opt into business success by copying the validation code',async t=>{
 const error=Object.assign(Error('not a validator-owned error'),{code:'EDITORIAL_VALIDATION_FAILED',issues:[{path:'fake',code:'invalid',message:'fake'}]});
 assert.equal(isEditorialValidationError(error),false);
 const h=harness(t,{compile:()=>{throw error;}});assert.equal(await h.cli(0),1);assert.equal(h.outcome().status,'failed');
 assert.equal(h.state().submissionAttempts,undefined);h.assertNoPublication();
});

test('CAS failure while recording rejection remains an infrastructure failure',async t=>{
 let rejectNext=true;
 const h=harness(t,{compile:()=>{throw typed();},beforeCas:()=>{if(rejectNext){rejectNext=false;throw new E.Conflict('injected lease conflict');}}});
 assert.equal(await h.cli(0),1);assert.equal(h.outcome().status,'failed');assert.equal(h.outcome().reasonCode,'CONFLICT');
 assert.match(h.errors[0],/injected lease conflict/);assert.equal(h.state().submissionAttempts,undefined);h.assertNoPublication();
});

for(const component of ['outcomes/','health.json'])test(component+' persistence failure cannot turn rejection green',async t=>{
 const h=harness(t,{compile:()=>{throw typed();},beforeRequest:(method,url,body)=>{
  if(method==='PUT'&&url.includes('/runtime/'+component)){
   const value=JSON.parse(Buffer.from(body.content,'base64'));
   if(value.status==='needs-revision'||value.tasks?.['global-main']?.status==='needs-revision')throw Object.assign(Error('injected '+component+' write failure'),{code:'EIO'});
  }
 }});
 assert.equal(await h.cli(0),1);assert.equal(h.outcome().status,'failed');assert.equal(h.outcome().reasonCode,'EIO');
 assert.match(h.errors[0],/write failure/);assert.equal(P.read(path.join(h.out,'failure.json')).status,'failed');h.assertNoPublication();
});

for(const kind of ['paused','skipped-busy'])test(kind+' cannot mask a newly observed outcome persistence failure',async t=>{
 const h=harness(t,{compile:()=>{throw new E.Busy('injected active peer');},beforeRequest:(method,url)=>{
  if(method==='PUT'&&url.includes('/runtime/outcomes/'))throw Object.assign(Error('outcome storage unavailable'),{code:'EIO'});
 }});
 if(kind==='paused')h.put('main','automation/control.json',{version:1,productionPaused:true,executionProtocol:'lease-v1'});
 assert.equal(await h.cli(0),1);
 const failure=P.read(path.join(h.out,'failure.json'));assert.equal(failure.status,'failed');assert.equal(failure.originalStatus,kind);assert.equal(failure.reasonCode,'EIO');
 assert.match(h.errors[0],/outcome storage unavailable/);h.assertNoPublication();
});

test('a paused execution still reports a failed lease cleanup instead of masking its CAS error',async t=>{
 const h=harness(t,{beforeCas:()=>{throw new E.Conflict('lease cleanup rejected');}});
 h.put('main','automation/control.json',{version:1,productionPaused:true,executionProtocol:'lease-v1'});
 assert.equal(await h.cli(0),1);assert.equal(h.outcome().status,'failed');assert.equal(h.outcome().originalStatus,'paused');
 assert.equal(h.outcome().reasonCode,'CONFLICT');assert.match(h.errors[0],/lease cleanup rejected/);h.assertNoPublication();
});

test('invalid generated batch shape remains an infrastructure failure before staging or writes',async t=>{
 // Identity and the seven owned modules come from the compiler, not the author.
 // A compiler that omits modules must not receive a successful editorial outcome.
 const h=harness(t,{compile:()=>({batchVersion:1,batchId:id,taskGroup:'global-main',execution:literalResult.execution,modules:[]})});
 assert.equal(await h.cli(0),1);assert.equal(h.outcome().status,'failed');assert.equal(h.outcome().reasonCode,'UNCLASSIFIED_ERROR');
 assert.equal(h.state().phase,'failed');assert.equal(h.state().submissionAttempts,undefined);
 assert.match(h.errors[0],/Batch must include exactly the task-owned modules/);
 assert.equal(fs.existsSync(path.join(h.out,'validation.json')),false);
 assert.equal(fs.existsSync(path.join(h.root,'data')),false);h.assertNoPublication();
});

test('a blocked summary write is an infrastructure failure rather than a false green receipt',async t=>{
 const h=harness(t,{compile:()=>{throw typed();}});
 const blocked=path.join(h.root,'summary-directory');fs.mkdirSync(blocked);
 const code=await runCli({worker:h.worker,argv:['submit',id,'0'],summaryFile:blocked,log:()=>{},error:x=>h.errors.push(String(x))});
 assert.equal(code,1);assert.equal(h.outcome().status,'needs-revision');assert.match(h.errors[0],/EISDIR/);h.assertNoPublication();
});
