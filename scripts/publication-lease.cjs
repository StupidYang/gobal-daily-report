#!/usr/bin/env node
'use strict';
// The workflow owns this local permit. Candidate contents cannot create or alter it.
const fs=require('node:fs'),path=require('node:path'),P=require('../lib/pipeline.cjs'),E=require('../lib/execution.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),command=process.argv[2];
const run=Number(process.env.GITHUB_RUN_ID),store=new E.GitHubStore(),permitFile=path.join(root,'.runtime/execution-permit.json');
async function committedReceipt(state){
 const x=await store.request('GET','/contents/data/receipts/batches/'+state.batchId+'.json?ref=main');return x?JSON.parse(Buffer.from(x.content,'base64').toString('utf8')):null;
}
async function main(){
 const control=P.read(path.join(root,'automation/control.json'));if(!control)throw Error('No production control');
 if(command!=='finish'&&(control.executionProtocol!=='lease-v1'||control.productionPaused)){if(command==='verify'&&P.read(permitFile))throw Error('Production paused before push; refuse the staged publication');fs.rmSync(permitFile,{force:true});console.log('No production execution to claim');return;}
 let snapshot=await store.read(),state=snapshot.state;
 if(command==='claim'){
  fs.rmSync(permitFile,{force:true});
  if(!['awaiting-publication','publishing'].includes(state.phase)){console.log('No submitted execution');return;}
  const file=path.join(root,'data/inbox/batches',state.batchId+'.json'),batch=P.read(file);if(!batch){console.log('Waiting for immutable candidate commit');return;}
  if(state.phase==='publishing'&&state.workflowRunId!==run)throw new E.Busy('Another publishing run owns this execution; reconcile its terminal result first');
  if(state.phase!=='publishing'){
   E.assertOwner(state,batch.execution);if(state.batchHash!==P.hash(batch)||state.taskGroup!==batch.taskGroup)throw Error('Candidate hash/owner mismatch');
   snapshot=await E.advance(store,batch.execution,'publishing',{workflowRunId:run});state=snapshot.state;
  }
  const permit=E.permit(state,batch);P.atomic(permitFile,permit);console.log(JSON.stringify(permit));
 }else if(command==='verify'){
  const local=P.read(permitFile);if(!local)return;state=(await store.read()).state;
  const batch=P.read(path.join(root,'data/inbox/batches',local.batchId+'.json'));const valid=E.permit(state,batch);if(valid.workflowRunId!==run||P.hash(valid)!==P.hash(local))throw Error('Publishing lease changed before commit');console.log('Exact execution permit revalidated before push');
 }else if(command==='finish'){
  if(state.phase!=='publishing'||state.workflowRunId!==run)return;
  const receipt=await committedReceipt(state),token={executionId:state.executionId,generation:state.generation};
  if(receipt?.status==='published')await E.advance(store,token,'completed',{reportId:receipt.reportId,receiptHash:P.hash(receipt)});
  else await E.advance(store,token,'failed',{reason:'Publishing run ended without a committed successful receipt; see workflow '+run});
 }else throw Error('Expected claim, verify or finish');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
