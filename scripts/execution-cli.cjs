#!/usr/bin/env node
'use strict';
// Persisted editorial rejection is a completed validation, never a publication.
// Infrastructure and unclassified errors must still fail GitHub Actions.
const fs=require('node:fs');
const {createWorker}=require('./execution-worker.cjs');
function executionExitCode(result){
 if(result?.status==='editorial-rejected')return result.reasonCode==='EDITORIAL_VALIDATION_FAILED'&&result.published===false?0:1;
 return ['needs-revision','submitted-not-published','ready-for-analysis','skipped-busy','paused','already-collected'].includes(result?.status)?0:1;
}
const markdownText=value=>String(value??'').replace(/\r?\n/g,' ').replace(/([\\`*_\[\]<>])/g,'\\$1');
function editorialSummary(result){
 const terminal=result.status==='editorial-rejected';
 const lines=['### GDR 稿件校验结果','',terminal?'**稿件最终拒收，本轮未发布。**':'**稿件需修订，本轮未发布。**','',
  '- 状态：'+markdownText(result.status),'- 执行：'+markdownText(result.requestId),'- 原截止时间：'+markdownText(result.deadlineAt),
  '- 校验原因：'+markdownText(result.reasonCode),'- 修订序号：'+markdownText(result.revision),
  terminal?'- 已结束本轮执行；没有创建发布候选。':'- 仅允许原截止时间前的一次 r1 修订；没有创建发布候选。','',
  '#### 拒收原因','',...(result.issues||[]).map(issue=>'- '+markdownText(issue)),''];
 return lines.join('\n')+'\n';
}
async function runCli({worker=createWorker(),argv=process.argv.slice(2),ref=process.env.GDR_HANDOFF_REF,log=console.log,error=console.error,summaryFile=process.env.GITHUB_STEP_SUMMARY}={}){
 try{
  const result=await worker.run(argv[0],argv[1],{revision:Number(argv[2]||0),ref});
  const editorial=['needs-revision','editorial-rejected'].includes(result?.status)&&result.reasonCode==='EDITORIAL_VALIDATION_FAILED'&&result.published===false;
  log(JSON.stringify({status:result?.status||'unclassified-result',requestId:result?.requestId||null,reasonCode:result?.reasonCode||null,revision:result?.revision??null,published:false,...(editorial?{message:result.status==='editorial-rejected'?'稿件最终拒收，本轮未发布':'稿件需修订，本轮未发布',issues:result.issues||[]}:{})}));
  if(editorial&&summaryFile)fs.appendFileSync(summaryFile,editorialSummary(result));
  const code=executionExitCode(result);if(code&&result?.error)error(result.error);return code;
 }catch(e){error(e?.stack||e?.message||String(e));return 1;}
}
if(require.main===module)runCli().then(code=>{process.exitCode=code;}).catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
module.exports={executionExitCode,editorialSummary,runCli};

