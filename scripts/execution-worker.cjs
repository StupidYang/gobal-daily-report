#!/usr/bin/env node
'use strict';
// Event-driven collection and bounded editorial repair; never create scheduler tasks.
const fs=require('node:fs'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),E=require('../lib/execution.cjs'),C=require('../lib/live-collector.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs');
const O=require('../lib/publication-outcome.cjs');
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(x);
function createWorker(options={}){
 const root=path.resolve(options.root||process.env.GDR_ROOT||path.join(__dirname,'..'));
 const store=options.store||new E.GitHubStore({repository:process.env.GITHUB_REPOSITORY||'StupidYang/gobal-daily-report'});
 const out=options.out||process.env.GDR_EXECUTION_OUTPUT||'/tmp/gdr-execution';
 const collect=options.collect||C.collect,compile=options.compile||L.compile,prepare=options.prepare||B.prepareBatch,clock=options.clock||Date.now;
 async function file(branch,name,ref=branch){return store.request('GET','/contents/'+name+'?ref='+encodeURIComponent(ref));}
 const decode=x=>x?JSON.parse(Buffer.from(x.content,'base64').toString('utf8')):null;
 async function read(branch,name,ref){return decode(await file(branch,name,ref));}
 async function create(branch,name,value){
  const old=await read(branch,name);if(old){if(P.hash(old)!==P.hash(value))throw Error('Immutable execution file conflict '+name);return;}
  await store.request('PUT','/contents/'+name,{branch,message:'runtime: '+name,content:Buffer.from(P.json(value)).toString('base64')});
 }
 async function health(id,value){
  const name='runtime/health.json';
  for(let attempt=0;attempt<2;attempt++){
   const prior=await file('gdr-runtime',name),h=decode(prior)||{version:1,tasks:{}},snap=await store.read();
   let group=snap.state.executionId===id?snap.state.taskGroup:null;
   if(!group){const req=await read('gdr-runtime','runtime/requests/'+id+'.json');group=req?.taskGroup;}
   if(!['global-main','asia-session','us-session'].includes(group))return;
   h.tasks[group]={requestId:id,status:value.status,at:value.at,deadlineAt:value.deadlineAt||null,error:value.error||null,reportId:value.reportId||null};h.updatedAt=value.at;
   const body={branch:'gdr-runtime',message:'runtime: health '+id,content:Buffer.from(P.json(h)).toString('base64')};if(prior)body.sha=prior.sha;
   try{await store.request('PUT','/contents/'+name,body);return;}catch(e){if(e.code!=='CONFLICT'||attempt)throw e;}
  }
 }
 async function outcome(id,value){
  const name='runtime/outcomes/'+id+'.json';
  for(let attempt=0;attempt<2;attempt++){
   const old=await file('gdr-runtime',name),previous=decode(old),next={...previous,...value,requestId:id,at:new Date(clock()).toISOString()};
   next.history=[...(previous?.history||[]),{status:next.status,at:next.at,revision:next.revision??null}].slice(-16);
   const body={branch:'gdr-runtime',message:'runtime: '+next.status+' '+id,content:Buffer.from(P.json(next)).toString('base64')};if(old)body.sha=old.sha;
   try{await store.request('PUT','/contents/'+name,body);await health(id,next).catch(e=>console.warn('Health projection unavailable: '+e.message));return next;}catch(e){if(e.code!=='CONFLICT'||attempt)throw e;}
  }
 }
 async function requireProduction(){const c=await read('main','automation/control.json');if(!c||c.version!==1||c.productionPaused!==false||c.executionProtocol!=='lease-v1')throw Object.assign(Error('Production remains paused or the execution protocol is not enabled'),{code:'PRODUCTION_PAUSED'});return c;}
 async function releaseFailed(id,reason){
  const snapshot=await store.read(),s=snapshot.state;
  if(s.executionId!==id||!['collecting','analyzing'].includes(s.phase))return;
  await store.cas(snapshot,E.terminate(s,{executionId:id,generation:s.generation},reason,clock()));
 }
 async function reconcile(){
  const snapshot=await store.read(),s=snapshot.state;if(s.phase!=='publishing')return;
  const run=await store.request('GET','/actions/runs/'+s.workflowRunId);if(!run||run.status!=='completed')throw new E.Busy('Previous publishing workflow is not confirmed terminal');
  const receipt=await read('main','data/receipts/batches/'+s.batchId+'.json'),token={executionId:s.executionId,generation:s.generation};
  const matched=O.receiptMatches(s,receipt);
  await store.cas(snapshot,E.transition(s,token,matched?'completed':'failed',matched?{reportId:receipt.reportId,receiptHash:P.hash(receipt),reason:'Exact repository receipt reconciled; public deployment still requires evidence'}:{reason:'Previous publishing workflow ended without an exact successful repository receipt'},clock()));
  await outcome(s.executionId,{...O.classify(s,receipt,{workflowRunId:s.workflowRunId,jobStatus:run.conclusion,now:clock()}),execution:token});
 }
 async function request(id,{ref}={}){
  await requireProduction();
  const previous=await read('gdr-runtime','runtime/results/'+id+'.json');
  if(previous)return {status:'already-collected',requestId:id,deadlineAt:previous.deadlineAt};
  const req=await read('gdr-runtime','runtime/requests/'+id+'.json',ref);
  if(req?.version!==1||req.requestId!==id||!safe(id))throw Error('Invalid request');
  if(!Number.isFinite(Date.parse(req.requestedAt))||Math.abs(clock()-Date.parse(req.requestedAt))>15*60000)throw Error('Request was queued too long or has an invalid timestamp');
  const hosts=new Set([
   'www.federalreserve.gov','www.bls.gov','home.treasury.gov','www.bea.gov','www.sec.gov','www.whitehouse.gov',
   'www.gov.cn','www.pbc.gov.cn','www.stats.gov.cn','www.mof.gov.cn','www.mofcom.gov.cn','www.csrc.gov.cn',
   'www.sse.com.cn','www.szse.cn','www.hkexnews.hk','www.hkex.com.hk','paper.cnstock.com','www.stcn.com','www.nbd.com.cn',
   'www.un.org','unsdg.un.org','www.who.int','www.imf.org','www.worldbank.org','www.iea.org','www.opec.org',
   'www.reuters.com','reuters.com','apnews.com','www.apnews.com','investor.nvidia.com'
  ]);
  const documentKinds=new Set(['news','macro','research','official','general']);
  const docs=req.documents||[];if(!Array.isArray(docs)||docs.length>32||docs.some(d=>{try{const u=new URL(d.url);return !safe(d.id)||u.protocol!=='https:'||!hosts.has(u.hostname)||u.username||u.password||(d.kind!=null&&!documentKinds.has(d.kind));}catch{return true;}}))throw Error('Document request outside the configured public-source scope');
  await reconcile();const acquired=await E.begin(store,req.taskGroup,{now:clock(),executionId:id,budgetMs:20*60000}),token={executionId:id,generation:acquired.state.generation};
  await outcome(id,{status:'collecting',error:null,issues:[],execution:token,deadlineAt:acquired.state.deadlineAt});
  const packet=await collect(P.read(path.join(root,'config/watchlist.json')),{documents:docs,rawDir:path.join(out,'raw'),onProgress:p=>P.atomic(path.join(out,'progress.json'),p),budgetMs:90000,requestMs:8000,concurrency:4});
  await requireProduction();E.assertOwner((await store.read()).state,token,clock());
  const result={version:1,requestId:id,taskGroup:req.taskGroup,execution:token,deadlineAt:acquired.state.deadlineAt,packetHash:P.hash(packet),packet,editorialContract:{version:'editorial-v1',path:'docs/editorial-input.md',frameworkNameField:'framework',documentLimit:32,documentKinds:[...documentKinds],newsFields:['eventId','title','regions','kind','summary','plainImpact','assessment','sourceUrls'],revisionPath:'runtime/submissions/'+id+'--r1.json',maxSubmissions:2},scope:'Evidence only. Read sources and write complete analysis; collection success is not publication.'};
  await create('gdr-runtime','runtime/results/'+id+'.json',result);
  await E.advance(store,token,'analyzing',{sourcePacketPath:'runtime/results/'+id+'.json',sourcePacketHash:P.hash(packet)},clock());
  await outcome(id,{status:'ready-for-analysis',error:null,issues:[],execution:token,deadlineAt:result.deadlineAt,packetHash:result.packetHash,collectionDurationMs:packet.durationMs});
  P.atomic(path.join(out,'result.json'),result);return result;
 }
 async function submit(id,{revision=0,ref}={}){
  if(![0,1].includes(revision))throw Error('Only one immutable editorial revision is allowed');
  await requireProduction();
  const suffix=revision?'--r1':'',submission=await read('gdr-runtime','runtime/submissions/'+id+suffix+'.json',ref),result=await read('gdr-runtime','runtime/results/'+id+'.json');
  if(!submission||!result||submission.execution?.executionId!==id||P.hash(result.packet)!==result.packetHash||submission.editorial?.packetHash!==result.packetHash)throw Error('Submission does not match the immutable source packet');
  const inputHash=P.hash(submission),old=await read('gdr-runtime','runtime/outcomes/'+id+'.json');
  if(old?.submissionHash===inputHash&&old?.revision===revision&&['needs-revision','submitted-not-published','failed'].includes(old.status))return old;
  const current=E.assertOwner((await store.read()).state,submission.execution,clock());
  if(current.phase!=='analyzing'||current.sourcePacketHash!==result.packetHash||result.execution?.generation!==submission.execution.generation)throw Error('Source packet or analysis ownership changed');
  if((current.submissionAttempts||0)!==revision)throw Error('Editorial revisions must follow one rejected initial submission');
  let batch,preflight;
  try{batch=compile(root,result.packet,submission.editorial,{executionId:id,generation:submission.execution.generation,taskGroup:result.taskGroup,now:clock()});preflight=prepare(root,batch,clock());}
  catch(e){
   const snapshot=await store.read();const next=E.rejectEditorial(snapshot.state,submission.execution,e.message,clock());await store.cas(snapshot,next);
   const rejected=await outcome(id,{status:next.phase==='failed'?'failed':'needs-revision',execution:submission.execution,revision,submissionHash:inputHash,error:e.message,issues:e.message.split('\n'),deadlineAt:next.deadlineAt,revisionPath:next.phase==='failed'?null:'runtime/submissions/'+id+'--r1.json',published:false});
   P.atomic(path.join(out,'validation.json'),rejected);return rejected;
  }
  await requireProduction();await E.advance(store,submission.execution,'awaiting-publication',{batchId:id,batchHash:P.hash(batch)},clock());
  await create('main','data/inbox/batches/'+id+'.json',batch);
  // Bot commits do not recursively trigger push workflows. Dispatch exactly once.
  await store.request('POST','/actions/workflows/publish-candidates.yml/dispatches',{ref:'main'});
  const submitted=await outcome(id,{status:'submitted-not-published',error:null,issues:[],execution:submission.execution,revision,submissionHash:inputHash,batchId:id,reportId:preflight.reportId,preparedModules:preflight.receipts.length,packetHash:result.packetHash,published:false});
  P.atomic(path.join(out,'submitted.json'),submitted);return submitted;
 }
 async function run(mode,id,args={}){
  fs.mkdirSync(out,{recursive:true});if(!safe(id))throw Error('Expected a safe execution request ID');
  try{if(mode==='request')return await request(id,args);if(mode==='submit')return await submit(id,args);throw Error('Expected request or submit');}
  catch(e){
   const snapshot=await store.read().catch(()=>null),phase=snapshot?.state.executionId===id?snapshot.state.phase:null;
   if(e.code!=='BUSY')try{await releaseFailed(id,e.message);}catch{}
   const value={status:e.code==='PRODUCTION_PAUSED'?'paused':e.code==='BUSY'?'skipped-busy':['awaiting-publication','publishing'].includes(phase)?'handoff-uncertain':'failed',error:e.message,published:false};
   const status=await outcome(id,value).catch(()=>({...value,requestId:id,at:new Date(clock()).toISOString()}));P.atomic(path.join(out,'failure.json'),status);
   if(['BUSY','PRODUCTION_PAUSED'].includes(e.code))return status;throw e;
  }
 }
 return {run,request,submit,reconcile};
}
if(require.main===module)createWorker().run(process.argv[2],process.argv[3],{revision:Number(process.argv[4]||0),ref:process.env.GDR_HANDOFF_REF}).then(r=>console.log(JSON.stringify({status:r?.status||'collected',published:false}))).catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
module.exports={createWorker};
