#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),P=require('../lib/pipeline.cjs');
function promote(root,now=Date.now()){
 const queue=[];for(const role of P.W.MODULES){const dir=path.join(root,'data/inbox',role);if(!fs.existsSync(dir))continue;
  for(const f of fs.readdirSync(dir)){if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}\.json$/.test(f))continue;
   const p=path.join(dir,f);if(fs.lstatSync(p).isSymbolicLink())continue;
   queue.push({role,file:p,runId:f.slice(0,-5)});
  }
 }
 // Producers first; synthesis second. No assumption that future candidates already exist.
 queue.sort((a,b)=>(a.role==='synthesis')-(b.role==='synthesis')||a.runId.localeCompare(b.runId));
 const result=[];
 for(const item of queue){const receiptPath=path.join(root,'data/receipts',item.role,item.runId+'.json'),previous=P.read(receiptPath);
  let content,inputHash;try{content=fs.readFileSync(item.file,'utf8');inputHash=P.hash(content);}catch(e){continue;}
  if(previous?.inputHash===inputHash)continue;
  const receipt={role:item.role,runId:item.runId,inputHash,processedAt:new Date(now).toISOString(),status:'rejected',errors:[]};
  try{
   if(previous)throw Error('不可覆盖已有候选ID；修订请使用新runId');
   if(Buffer.byteLength(content)>4*1024*1024)throw Error('候选超过4MB预算');
   const candidate=JSON.parse(content);
   if(candidate.module!==item.role||candidate.runId!==item.runId)throw Error('候选路径与模块身份不一致');
   const errors=P.W.validate(candidate,item.role,now);
   if(item.role==='synthesis')errors.push(...P.validateReport(candidate.payload?.report));
   if(errors.length)throw Error([...new Set(errors)].join('\n'));
   // Check report history collision BEFORE mutating synthesis pointer.
   if(item.role==='synthesis'){
    const report=candidate.payload.report,old=P.read(path.join(root,'data/latest.json'));
    if(old&&P.W.time(old.updatedAt)>P.W.time(report.updatedAt))throw Error('旧综合报告不能回退首页');
    const date=report.reportId.slice(0,10),hhmm=report.reportId.slice(-4),hist=P.read(path.join(root,`history/${date}/${hhmm}.json`));
    if(hist&&P.hash(hist)!==P.hash(report))throw Error('同报告时点已存在不同历史');
    // Report may only refer to real immutable runs already on disk.
    for(const [role,ref]of Object.entries(report.reportMeta?.moduleRefs||{})){
     if(!P.W.MODULES.includes(role)||role==='synthesis'||!ref||!new RegExp('^data/runs/'+role+'/[A-Za-z0-9_-]+\\.json$').test(ref.path||''))throw Error('非法冻结模块引用 '+role);
     const module=P.read(path.join(root,ref.path));if(!module||module.runId!==ref.runId||module.module!==role||P.W.time(module.generatedAt)>P.W.time(report.updatedAt))throw Error('冻结模块不存在或位于未来 '+role);
     if(P.W.validate(module,role,now).length)throw Error('冻结模块未通过校验 '+role);
    }
   }
   receipt.module=P.ingest(root,candidate,now);
   if(item.role==='synthesis')receipt.report=P.publishReport(root,candidate.payload.report);
   receipt.status=receipt.module.status==='archived-older'?'archived-older':'published';
  }catch(e){receipt.errors=[e.message];}
  // Failed submissions never overwrite a previously accepted receipt.
  if(!previous)P.atomic(receiptPath,receipt);
  result.push(receipt);
 }
 const status={checkedAt:new Date(now).toISOString(),latestReportId:P.read(path.join(root,'data/latest.json'))?.reportId||null,modules:{}};
 for(const role of P.W.MODULES){const m=P.read(path.join(root,'data/modules',role+'.json')),dir=path.join(root,'data/receipts',role);let last=null;
  if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){const x=P.read(path.join(dir,f));if(!last||Date.parse(x.processedAt)>Date.parse(last.processedAt))last=x;}
  status.modules[role]={runId:m?.runId||null,generatedAt:m?.generatedAt||null,dataAsOf:m?.dataAsOf||null,status:m?.status||'missing',lastAttempt:last};
 }
 P.atomic(path.join(root,'data/publication-status.json'),status);
 return result;
}
if(require.main===module){try{console.log(JSON.stringify(promote(path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={promote};
