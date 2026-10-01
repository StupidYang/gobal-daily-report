'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {executionExitCode,runCli}=require('../scripts/execution-cli.cjs');
test('terminal editorial failures return failure instead of green workflow success',()=>{
 for(const status of ['failed','handoff-uncertain','deployment-failed'])assert.equal(executionExitCode({status}),1);
});
test('pending revision, completed collection and intentional skips do not become infrastructure errors',()=>{
 for(const status of ['needs-revision','submitted-not-published','ready-for-analysis','skipped-busy','paused','already-collected',undefined])assert.equal(executionExitCode({status}),0);
});
test('CLI awaits the recorded outcome, retains raw errors and reports failure without retry',async()=>{
 const calls=[],logs=[],errors=[];let persisted=false;
 const worker={run:async(...args)=>{calls.push(args);persisted=true;return {status:'failed',error:'未知事实 EQUITY:US:INVENTED'};}};
 const code=await runCli({worker,argv:['submit','run','1'],ref:'fixed-ref',log:x=>logs.push(x),error:x=>errors.push(x)});
 assert.equal(code,1);assert.equal(persisted,true);assert.equal(calls.length,1);assert.deepEqual(calls[0],['submit','run',{revision:1,ref:'fixed-ref'}]);assert.deepEqual(errors,['未知事实 EQUITY:US:INVENTED']);assert.equal(JSON.parse(logs[0]).published,false);
});
test('pinned push router invokes the checked CLI, not the success-only legacy main',()=>{
 const route=fs.readFileSync(path.join(__dirname,'../scripts/route-execution-event.cjs'),'utf8');assert.match(route,/scripts\/execution-cli\.cjs/);assert.doesNotMatch(route,/\['scripts\/execution-worker\.cjs'/);
});
