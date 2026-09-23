#!/usr/bin/env node
'use strict';
// Event-driven request/analysis handoff. No extra schedule and no LLM API billing is introduced.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../lib/pipeline.cjs'),E=require('../lib/execution.cjs'),C=require('../lib/live-collector.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),repo=process.env.GITHUB_REPOSITORY||'StupidYang/gobal-daily-report',store=new E.GitHubStore({repository:repo});
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(x);
const out=process.env.GDR_EXECUTION_OUTPUT||'/tmp/gdr-execution';
async function read(branch,file){const x=await store.request('GET','/contents/'+file+'?ref='+branch);return x?JSON.parse(Buffer.from(x.content,'base64').toString('utf8')):null;}
async function create(branch,file,value){const text=P.json(value),old=await read(branch,file);if(old){if(P.hash(old)!==P.hash(value))throw Error('Immutable execution file conflict '+file);return;}await store.request('PUT','/contents/'+file,{branch,message:'runtime: '+file,content:Buffer.from(text).toString('base64')});}
async function requireProduction(){const c=await read('main','automation/control.json');if(!c||c.version!==1||c.productionPaused!==false||c.executionProtocol!=='lease-v1')throw Error('Production remains paused or the execution protocol is not enabled');return c;}
async function reconcile(){
 const snap=await store.read(),s=snap.state;if(s.phase!=='publishing')return;
 const run=await store.request('GET','/actions/runs/'+s.workflowRunId);if(!run||run.status!=='completed')throw new E.Busy('Previous publishing workflow is not confirmed terminal');
 const receipt=await read('main','data/receipts/batches/'+s.batchId+'.json'),token={executionId:s.executionId,generation:s.generation};
 await store.cas(snap,E.transition(s,token,receipt?.status==='published'?'completed':'failed',receipt?.status==='published'?{reportId:receipt.reportId,receiptHash:P.hash(receipt),reason:'Recovered repository receipt after confirmed terminal workflow; deployment status requires its browser evidence'}:{reason:'Previous publishing workflow terminal without a successful repository receipt'}));
}
async function request(id){
 await requireProduction();const req=await read('gdr-runtime','runtime/requests/'+id+'.json');if(req?.version!==1||req.requestId!==id||!safe(id))throw Error('Invalid request');
 if(!Number.isFinite(Date.parse(req.requestedAt))||Math.abs(Date.now()-Date.parse(req.requestedAt))>15*60000)throw Error('Request was queued too long or has an invalid timestamp');
 const hosts=new Set(['www.federalreserve.gov','www.bls.gov','www.un.org','unsdg.un.org','investor.nvidia.com','paper.cnstock.com','www.nbd.com.cn','www.pbc.gov.cn','www.stats.gov.cn','www.sec.gov']);
 const docs=req.documents||[];if(!Array.isArray(docs)||docs.length>12||docs.some(d=>{try{const u=new URL(d.url);return u.protocol!=='https:'||!hosts.has(u.hostname)||u.username||u.password;}catch{return true;}}))throw Error('Document request outside the configured public-source scope');
 await reconcile();const acquired=await E.begin(store,req.taskGroup,{executionId:id,budgetMs:20*60000}),token={executionId:id,generation:acquired.state.generation};
 try{
  const packet=await C.collect(P.read(path.join(root,'config/watchlist.json')),{documents:docs,rawDir:path.join(out,'raw'),onProgress:p=>P.atomic(path.join(out,'progress.json'),p),budgetMs:90000,requestMs:8000,concurrency:4});
  await requireProduction();E.assertOwner((await store.read()).state,token);
  const result={version:1,requestId:id,taskGroup:req.taskGroup,execution:token,deadlineAt:acquired.state.deadlineAt,packetHash:P.hash(packet),packet,scope:'Collection evidence only; the native task must still write and verify full editorial analysis.'};
  await create('gdr-runtime','runtime/results/'+id+'.json',result);
  await E.advance(store,token,'analyzing',{sourcePacketPath:'runtime/results/'+id+'.json',sourcePacketHash:P.hash(packet)});
  P.atomic(path.join(out,'result.json'),{...result,packet:undefined});
 }catch(error){try{await E.advance(store,token,'failed',{reason:error.message});}catch{}throw error;}
}
async function submit(id){
 await requireProduction();const submission=await read('gdr-runtime','runtime/submissions/'+id+'.json'),result=await read('gdr-runtime','runtime/results/'+id+'.json');
 if(!submission||!result||submission.execution?.executionId!==id||P.hash(result.packet)!==result.packetHash||submission.editorial?.packetHash!==result.packetHash)throw Error('Submission does not match the immutable source packet');
 const current=E.assertOwner((await store.read()).state,submission.execution);if(current.phase!=='analyzing'||current.sourcePacketHash!==result.packetHash||result.execution?.generation!==submission.execution.generation)throw Error('Source packet or analysis ownership changed');
 const batch=L.compile(root,result.packet,submission.editorial,{executionId:id,generation:submission.execution.generation,taskGroup:result.taskGroup});
 const preflight=B.prepareBatch(root,batch,Date.now());
 await requireProduction();await E.advance(store,submission.execution,'awaiting-publication',{batchId:id,batchHash:P.hash(batch)});
 await create('main','data/inbox/batches/'+id+'.json',batch);
 // GITHUB_TOKEN commits do not recursively trigger push workflows. Explicit, single dispatch only.
 await store.request('POST','/actions/workflows/publish-candidates.yml/dispatches',{ref:'main'});
 const submitted={status:'submitted-not-published',batchId:id,reportId:preflight.reportId,preparedModules:preflight.receipts.length,packetHash:result.packetHash,at:new Date().toISOString()};
 await create('gdr-runtime','runtime/outcomes/'+id+'.json',submitted);P.atomic(path.join(out,'submitted.json'),submitted);
}
async function main(){fs.mkdirSync(out,{recursive:true});const mode=process.argv[2],id=process.argv[3];if(!safe(id))throw Error('Expected a safe execution request ID');if(mode==='request')await request(id);else if(mode==='submit')await submit(id);else throw Error('Expected request or submit');}
if(require.main===module)main().catch(async e=>{const result={status:e.code==='BUSY'?'skipped-busy':'failed',requestId:process.argv[3],error:e.message,at:new Date().toISOString()};P.atomic(path.join(out,'failure.json'),result);if(safe(process.argv[3]))try{await create('gdr-runtime','runtime/outcomes/'+process.argv[3]+'.json',result);}catch{}console.error(e.message);process.exitCode=e.code==='BUSY'?0:1;});
module.exports={request,submit,reconcile};
