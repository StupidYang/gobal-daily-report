'use strict';
// Real GitHub CAS, isolated from the production lease and every production pointer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),E=require('../lib/execution.cjs');
const run=Number(process.env.GITHUB_RUN_ID),out=process.env.GDR_LEASE_PROOF||'/tmp/gdr-real-lease-proof.json';
(async()=>{
 if(!Number.isInteger(run)||run<=0)throw Error('A real workflow run ID is required');
 const store=new E.GitHubStore({file:'runtime/leases/validation-'+run+'.json'}),started=Date.now();
 let seed=await store.read();if(seed.sha)throw Error('Validation identity already exists; use a new workflow run');
 seed=await store.cas(seed,E.idle());const left=await store.read(),right=await store.read();assert.equal(left.sha,right.sha);
 const proposals=[E.acquire(left.state,'global-main',{executionId:'validation-'+run+'-left'}),E.acquire(right.state,'asia-session',{executionId:'validation-'+run+'-right'})];
 const contenders=await Promise.allSettled([store.cas(left,proposals[0]),store.cas(right,proposals[1])]);
 assert.equal(contenders.filter(x=>x.status==='fulfilled').length,1,'Exactly one actual CAS writer must win');
 const rejected=contenders.find(x=>x.status==='rejected');assert.equal(rejected.reason.code,'CONFLICT');
 const actual=await store.read(),winner=actual.state;for(const group of ['global-main','asia-session','us-session'])assert.throws(()=>E.acquire(winner,group),{code:'BUSY'});
 const stale=proposals.find(x=>x.executionId!==winner.executionId);assert.throws(()=>E.assertOwner(winner,stale),/obsolete/);
 const ended=await E.advance(store,winner,'failed',{reason:'Isolated CAS acceptance completed; no production collection or publication was attempted'});
 const proof={status:'passed',workflowRunId:run,leaseFile:store.file,scope:'Two genuine concurrent GitHub Contents API updates using the same old blob SHA; separate validation lease only.',startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),durationMs:Date.now()-started,winner:winner.executionId,generation:winner.generation,sharedOldSha:left.sha,acceptedWrites:1,rejectedConflicts:1,allThreeGroupsBlocked:true,loserFenced:true,terminalPhase:ended.state.phase,productionLeaseUntouched:true};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(proof,null,2)+'\n');console.log(proof);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
