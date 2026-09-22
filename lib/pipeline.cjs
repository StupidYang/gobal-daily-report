'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const W=require('../assets/watchlist-core.js');
const json=x=>JSON.stringify(x,null,2)+'\n';
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:json(x)).digest('hex');
function read(p,fallback=null){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function atomic(p,value){fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');try{fs.writeFileSync(tmp,typeof value==='string'?value:json(value),{flag:'wx'});fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function locked(root,fn){const lock=path.join(root,'.runtime','publish.lock');fs.mkdirSync(path.dirname(lock),{recursive:true});try{fs.mkdirSync(lock);}catch(e){if(e.code==='EEXIST')throw Error('已有本地发布者持锁；不要同时运行多个runner');throw e;}try{return fn();}finally{fs.rmSync(lock,{recursive:true,force:true});}}
function validateReport(r){
 const e=[];
 if(!r||r.schemaVersion!==5)return ['综合报告必须是schema5'];
 if(W.time(r.updatedAt)===null||!/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(r.reportId||''))e.push('报告时点/ID无效');
 if(r.reportId!==String(r.updatedAt||'').slice(0,16).replace(' ','-').replace(/:(\d{2})$/,'$1'))e.push('reportId与updatedAt不一致（需UTC+8文本）');
 for(const k of ['overview','rolling24hSummary','methodology'])if(!r[k]||typeof r[k]!=='string')e.push('缺少完整字段 '+k);
 for(const k of ['canonicalFacts','metrics','marketCoverage','worldEvents','analysisTheses','judgmentRevisions','dataDefinitions','deepDive','evolution24h','changes','recentChanges','assets','macroEvents','news','narrativeTriggers','events','watch','sources'])if(!Array.isArray(r[k]))e.push('缺少数组 '+k);
 const required=['mainTheme','expectationGap','divergence','regime','priceIn','bullCase','bullInvalidation','bearCase','bearInvalidation'];
 for(const k of required)if(typeof r.coreAnalysis?.[k]!=='string'||!r.coreAnalysis[k])e.push('核心分析缺失 '+k);
 if(!W.arr(r.deepDive).length||W.arr(r.deepDive).some(x=>!x?.analysis))e.push('详细分析不得为空');
 if(!W.arr(r.marketCoverage).some(x=>x?.market==='港股'))e.push('港股不可缺席');
 const facts=new Set(W.arr(r.canonicalFacts).map(x=>x?.id)),sources=new Set(W.arr(r.sources).map(x=>x?.id));
 if(facts.size!==W.arr(r.canonicalFacts).length)e.push('重复事实ID');
 function scan(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(scan);return;}for(const[k,v]of Object.entries(x)){if(k==='factId'&&v&&!facts.has(v))e.push('未知事实 '+v);if(['factIds','evidenceFactIds'].includes(k))W.arr(v).forEach(id=>{if(!facts.has(id))e.push('未知事实 '+id);});if(k==='sourceIds')W.arr(v).forEach(id=>{if(!sources.has(id))e.push('未知来源 '+id);});scan(v);}}
 if(W.arr(r.sources).some(s=>!s?.id||!W.safeUrl(s.url))||sources.size!==W.arr(r.sources).length)e.push('来源目录无效或重复');
 if(W.arr(r.canonicalFacts).some(f=>!f?.id))e.push('事实ID缺失');
 if(r.period?.to!==r.updatedAt||r.recentPeriod?.to!==r.updatedAt)e.push('窗口截止时间不一致');
 scan(r);
 if(r.reportMeta?.contractVersion==='reader-r2')e.push(...require('../scripts/validate-report.cjs').validate(r).errors);
 return [...new Set(e)];
}
function mergeResearch(previous,incoming){
 const sources=new Map();for(const s of [...W.arr(previous?.sources),...W.arr(incoming.sources)]){const old=sources.get(s.id);if(old&&old.url!==s.url)throw Error('研究来源ID对应不同URL，必须使用新sourceId');sources.set(s.id,s);}
 const records=new Map();W.arr(previous?.payload?.records).forEach(r=>records.set(r.instrumentId+'|'+r.eventKey,r));
 const reused=[],added=[];
 W.arr(incoming.payload.records).forEach(r=>{const key=r.instrumentId+'|'+r.eventKey;if(records.has(key)){if(W.researchFingerprint(records.get(key))!==W.researchFingerprint(r))throw Error('同一eventKey对应不同研究材料，必须创建新事件版本');reused.push(key);return;}records.set(key,r);added.push(key);});
 return {...incoming,sources:[...sources.values()],payload:{...incoming.payload,records:[...records.values()],cacheAudit:{added,reused,note:'同事件沿用原分析及analyzedAt；新财报/指引/重述/研报需新eventKey。'}}};
}
function archivePath(m){return `data/runs/${m.module}/${m.runId}.json`;}
function ingest(root,m,now=Date.now()){
 const e=W.validate(m,m.module,now);if(m.module==='synthesis')e.push(...validateReport(m.payload?.report));if(e.length)throw Error(e.join('\n'));
 return locked(root,()=>{
  const pointer=path.join(root,'data/modules',m.module+'.json'),previous=read(pointer);
  const inputHash=hash(m),existing=read(path.join(root,archivePath(m)));
  if(existing?._inputHash===inputHash)return {status:previous&&W.time(previous.generatedAt)>W.time(m.generatedAt)?'archived-older':'idempotent',path:archivePath(m),sha256:hash(existing)};
  if(m.module==='research'&&(!previous||W.time(previous.generatedAt)<=W.time(m.generatedAt))){m=mergeResearch(previous,m);const errors=W.validate(m,'research',now);if(errors.length)throw Error(errors.join('\n'));}
  m={...m,_inputHash:inputHash};
  const rel=archivePath(m),dest=path.join(root,rel),old=read(dest);
  if(old&&hash(old)!==hash(m))throw Error('runId已存在且内容不同，历史快照不可覆盖');
  if(!old)atomic(dest,m);
  if(previous&&W.time(previous.generatedAt)>W.time(m.generatedAt))return {status:'archived-older',path:rel};
  if(previous&&W.time(previous.generatedAt)===W.time(m.generatedAt)&&previous.runId!==m.runId)throw Error('相同时点不同runId需人工复核，不猜测新旧');
  atomic(pointer,m);
  return {status:'published-module',path:rel,sha256:hash(m)};
 });
}
function publishReport(root,report){
 const e=validateReport(report);if(e.length)throw Error(e.join('\n'));
 return locked(root,()=>{
  const p=path.join(root,'data/latest.json'),old=read(p),t=W.time(report.updatedAt);
  if(old&&W.time(old.updatedAt)>t)return {status:'skipped-older'};
  const [date,h]=report.reportId.match(/^(\d{4}-\d{2}-\d{2})-(\d{4})$/).slice(1),rel=`history/${date}/${h}.json`,dest=path.join(root,rel),history=read(dest);
  if(history&&hash(history)!==hash(report))throw Error('报告时点已有不同历史，拒绝悄悄重写');
  atomic(dest,report);
  const idx=read(path.join(root,'data/history-index.json'),{reports:[]});
  const rows=new Map(W.arr(idx.reports).map(x=>[x.path,x]));rows.set(rel,{reportId:report.reportId,label:report.updatedAt,path:rel,schemaVersion:5});
  atomic(path.join(root,'data/history-index.json'),{updatedAt:report.updatedAt,reports:[...rows.values()].sort((a,b)=>(W.time(b.label)||0)-(W.time(a.label)||0)).slice(0,240)});
  atomic(p,report); // latest is the commit marker; history and index exist first.
  if(hash(read(p))!==hash(read(dest)))throw Error('写后校验失败');
  return {status:'published-report',path:rel,sha256:hash(report)};
 });
}
function context(root,role){
 const manifest=read(path.join(root,'automation/manifest.json')),task=manifest.tasks.find(t=>t.role===role);if(!task)throw Error('未知角色 '+role);
 const config=read(path.join(root,'config/watchlist.json'));
 const modules={};for(const k of task.readModules||[]){const m=read(path.join(root,'data/modules',k+'.json'));modules[k]={state:W.freshness(m,config.moduleTtlHours[k]||8),data:m};}
 return {role,now:new Date().toISOString(),config,modules,latest:role==='synthesis'?read(path.join(root,'data/latest.json')):undefined,publicationNote:'模块有独立时点；失效输入不能冒充新数据。'};
}
function compile(root,role,entry=false){
 const manifest=read(path.join(root,'automation/manifest.json')),task=manifest.tasks.find(t=>t.role===role);if(!task)throw Error('未知角色 '+role);
 if(entry)return `执行GDR模块 ${role}。仓库：${process.env.GDR_REPO||manifest.repository}。先读取 automation/manifest.json、automation/prompts/common.md、${task.promptFile}、docs/modules-contract.md 和 config/watchlist.json。按candidate-gate-v1执行：AI只能新增data/inbox/${role}/<runId>.json候选，禁止直接写data/modules、data/runs、latest、history或索引；由代码校验器发布。${role==='synthesis'?'候选payload.report必须包含完整schema5/reader-r2报告，不能只有报告编号、路径或发布计划。':'保留本模块全部合格数据，坏项null加原因，不编行情或排名。'}先联网采集，复用数据保留真实时点，按契约验证。提交后读取data/receipts/${role}/<runId>.json；只有status=published并回读正式产物才叫发布成功，waiting-dependencies/pending/rejected分别说明；完整执行细则以共用及角色文件为准，不以本入口替代。调度已配置，不创建或修改任务，不修改代码与提示词。`;

 return ['# 执行角色 '+role,fs.readFileSync(path.join(root,'automation/prompts/common.md'),'utf8'),fs.readFileSync(path.join(root,task.promptFile),'utf8'),'\n## 数据契约\n',fs.readFileSync(path.join(root,'docs/modules-contract.md'),'utf8')].join('\n\n');
}
module.exports={W,json,hash,read,atomic,locked,validateReport,mergeResearch,archivePath,ingest,publishReport,context,compile};
