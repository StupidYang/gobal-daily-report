#!/usr/bin/env node
'use strict';
// Preserve the worker's persisted outcome; expose terminal failure to GitHub Actions.
const {createWorker}=require('./execution-worker.cjs');
function executionExitCode(result){return ['failed','expired','handoff-uncertain','deployment-failed'].includes(result?.status)?1:0;}
async function runCli({worker=createWorker(),argv=process.argv.slice(2),ref=process.env.GDR_HANDOFF_REF,log=console.log,error=console.error}={}){
 const result=await worker.run(argv[0],argv[1],{revision:Number(argv[2]||0),ref});
 log(JSON.stringify({status:result?.status||'collected',published:false}));
 const code=executionExitCode(result);if(code&&result?.error)error(result.error);return code;
}
if(require.main===module)runCli().then(code=>{process.exitCode=code;}).catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
module.exports={executionExitCode,runCli};
