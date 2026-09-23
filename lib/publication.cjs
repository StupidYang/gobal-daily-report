'use strict';
// Validate and simulate the full write set before changing live pointers.
const fs=require('node:fs'),path=require('node:path'),P=require('./pipeline.cjs');
const W=P.W,MAX_BYTES=4*1024*1024,Control=require('./control.cjs');
const utc8=t=>new Date(t+8*3600000).toISOString().replace('Z','+08:00');
function references(root,report,now,requireAll=false){
 const errors=[],refs=report?.reportMeta?.moduleRefs;
 const producers=W.MODULES.filter(role=>role!=='synthesis');
 if(requireAll&&(!refs||typeof refs!=='object'||Array.isArray(refs)||producers.some(role=>!refs[role])||Object.keys(refs).length!==producers.length))errors.push('综合报告必须冻结六个生产模块，不能只提交空引用或部分模块');
 const cutoff=W.time(report?.reportMeta?.generatedAt)??((W.time(report?.updatedAt)??0)+59999);
 for(const [role,ref]of Object.entries(report?.reportMeta?.moduleRefs||{})){
  if(!W.MODULES.includes(role)||role==='synthesis'||!ref||!new RegExp('^data/runs/'+role+'/[A-Za-z0-9_-]+\\.json$').test(ref.path||'')){errors.push('非法冻结模块引用 '+role);continue;}
  const m=P.read(path.join(root,ref.path));
  if(!m){errors.push('DEPENDENCY_MISSING: '+ref.path);continue;}
  if(m.module!==role||m.runId!==ref.runId||ref.path!==P.archivePath(m))errors.push('冻结模块身份不匹配 '+role);
  if(W.time(m.generatedAt)>cutoff)errors.push('冻结模块位于报告未来 '+role);
  if(ref.generatedAt!=null&&W.time(ref.generatedAt)!==W.time(m.generatedAt))errors.push('冻结模块生成时点不匹配 '+role);
  if(ref.dataAsOf!=null&&W.time(ref.dataAsOf)!==W.time(m.dataAsOf))errors.push('冻结模块数据时点不匹配 '+role);
  if(W.validate(m,role,now).length)errors.push('冻结模块校验失败 '+role);
 }
 return errors;
}
function preflight(root,m,role,now){
 const errors=[...W.validate(m,role,now),...Control.checkMode(root,m)];
 if(role==='synthesis'){
  if(Control.readControl(root).qualityPolicy==='content-r3')errors.push(...require('../assets/content-contract.js').quality(m?.payload?.report||{},P.read(path.join(root,'data/latest.json'))).errors);
  errors.push(...P.validateReport(m?.payload?.report));
  if(!errors.length){const r=m.payload.report;if(r.reportMeta?.contractVersion!=='reader-r2')errors.push('新综合报告必须使用reader-r2完整内容契约');if(W.time(r.updatedAt)>W.time(m.generatedAt))errors.push('报告截止晚于模块生成时间');errors.push(...references(root,r,now,true));}
 }
 return [...new Set(errors)];
}
function candidateFile(root,role,runId){if(!W.MODULES.includes(role)||!/^\w[\w-]{0,95}$/.test(runId||''))throw Error('非法候选身份');return path.join(root,'data/inbox',role,runId+'.json');}
function submit(root,m){
 const file=candidateFile(root,m.module,m.runId),text=P.json(m);if(Buffer.byteLength(text)>MAX_BYTES)throw Error('候选超过4MB');fs.mkdirSync(path.dirname(file),{recursive:true});
 try{fs.writeFileSync(file,text,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==text)throw Error('候选ID已存在且不同；修订须换runId');}return file;
}
function applyWrites(root,writes,write=P.atomic){
 const done=[];
 try{for(const [rel,text]of writes){const p=path.join(root,rel),old=fs.existsSync(p)?fs.readFileSync(p):null;done.push([p,old]);write(p,text);}}
 catch(e){for(const [p,old]of done.reverse()){if(old===null)fs.rmSync(p,{force:true});else fs.writeFileSync(p,old);}throw e;}
}
function prepare(root,m,now){
 if(m.module==='synthesis')m={...m,payload:{...m.payload,report:require('../assets/content-contract.js').normalize(m.payload.report)}};
 const errors=preflight(root,m,m.module,now);if(errors.length)throw Error(errors.join('\n'));
 const rel=P.archivePath(m),moduleRel='data/modules/'+m.module+'.json';
 const stagedRoot=fs.mkdtempSync(path.join(root,'.runtime','stage-'));
 try{
  const seeds=[moduleRel,rel];
  if(m.module==='synthesis'){
   const r=m.payload.report,old=P.read(path.join(root,'data/latest.json'));
   if(old&&W.time(old.updatedAt)>W.time(r.updatedAt))throw Error('旧综合报告不能回退首页');
   seeds.push('data/latest.json','data/history-index.json',`history/${r.reportId.slice(0,10)}/${r.reportId.slice(-4)}.json`);
  }
  for(const p of seeds)if(fs.existsSync(path.join(root,p))){fs.mkdirSync(path.dirname(path.join(stagedRoot,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(stagedRoot,p));}
  if(['quotes','asia-equities','us-equities'].includes(m.module)){const old=P.read(path.join(root,moduleRel));if(old){const retained=require('./retention.cjs').restore(root,old);P.atomic(path.join(stagedRoot,moduleRel),retained);}}
  const moduleResult=P.ingest(stagedRoot,m,now),reportResult=m.module==='synthesis'?P.publishReport(stagedRoot,m.payload.report):null;
  if(reportResult?.status==='skipped-older')throw Error('较旧报告未发布');
  const paths=[rel];if(moduleResult.status!=='archived-older')paths.push(moduleRel);
  if(reportResult)paths.push(reportResult.path,'data/history-index.json','data/latest.json');
  const writes=paths.filter(p=>fs.existsSync(path.join(stagedRoot,p))).map(p=>[p,fs.readFileSync(path.join(stagedRoot,p),'utf8')]);
  return {writes,moduleResult,reportResult};
 }finally{fs.rmSync(stagedRoot,{recursive:true,force:true});}
}
function promote(root,now=Date.now(),write=P.atomic){
 const control=Control.readControl(root);
 if(control.productionPaused&&!Control.isIsolated(root))return [{status:'paused',reason:control.reason||'Production is paused',writes:0}];
 return P.locked(root,()=>{
  const queue=[];
  for(const role of W.MODULES){const dir=path.join(root,'data/inbox',role);if(!fs.existsSync(dir))continue;for(const f of fs.readdirSync(dir)){if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}\.json$/.test(f))continue;const file=path.join(dir,f);if(!fs.lstatSync(file).isFile())continue;queue.push({role,file,runId:f.slice(0,-5)});}}
  queue.sort((a,b)=>(a.role==='synthesis')-(b.role==='synthesis')||a.runId.localeCompare(b.runId));
  const result=[];
  for(const item of queue){
   const receiptRel=`data/receipts/${item.role}/${item.runId}.json`,receiptPath=path.join(root,receiptRel),previous=P.read(receiptPath);
   const content=fs.readFileSync(item.file,'utf8'),inputHash=P.hash(content);
   if(previous?.inputHash===inputHash&&previous.status!=='waiting-dependencies')continue;
   if(previous&&previous.inputHash!==inputHash){result.push({role:item.role,runId:item.runId,status:'rejected',errors:['不可修改已经处理过的候选；旧回执保留']});continue;}
   const receipt={role:item.role,runId:item.runId,inputHash,processedAt:utc8(now),status:'rejected',errors:[],attempts:(previous?.attempts||0)+1};
   try{
    if(Buffer.byteLength(content)>MAX_BYTES)throw Error('候选超过4MB');
    const m=JSON.parse(content);if(m.module!==item.role||m.runId!==item.runId)throw Error('候选路径与身份不一致');
    receipt.execution=m.execution||null;
    if(control.executionProtocol==='lease-v1'&&!Control.isIsolated(root)){const internal=P.read(path.join(root,'.runtime/execution-batch.json'));if(!internal||internal.batchId!==m.execution?.batchId||!internal.runIds.includes(m.runId))throw Error('Single-module production writes disabled: an execution-fenced batch is required');}
    const p=prepare(root,m,now);receipt.module=p.moduleResult;if(p.reportResult)receipt.report=p.reportResult;
    receipt.status=p.moduleResult.status==='archived-older'?'archived-older':'published';
    applyWrites(root,[...p.writes,[receiptRel,P.json(receipt)]],write);
   }catch(e){
    receipt.status=e.message.split('\n').every(s=>s.startsWith('DEPENDENCY_MISSING:'))?'waiting-dependencies':'rejected';receipt.errors=[e.message];delete receipt.module;delete receipt.report;P.atomic(receiptPath,receipt);
   }
   result.push(receipt);
  }
  const status={checkedAt:utc8(now),latestReportId:P.read(path.join(root,'data/latest.json'))?.reportId||null,modules:{}};
  for(const role of W.MODULES){const m=P.read(path.join(root,'data/modules',role+'.json')),dir=path.join(root,'data/receipts',role);let last=null;
   if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){const x=P.read(path.join(dir,f));if(!last||Date.parse(x.processedAt)>Date.parse(last.processedAt)||x.processedAt===last.processedAt&&x.runId>last.runId)last=x;}
   status.modules[role]={runId:m?.runId||null,generatedAt:m?.generatedAt||null,dataAsOf:m?.dataAsOf||null,status:m?.status||'missing',lastAttempt:last};
  }
  if(result.length||!fs.existsSync(path.join(root,'data/publication-status.json')))P.atomic(path.join(root,'data/publication-status.json'),status);return result;
 });
}
module.exports={references,preflight,submit,prepare,promote,applyWrites};
