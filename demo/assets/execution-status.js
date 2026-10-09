/* Latest execution status is independent of the report and the production switch. */
(function(root){
 'use strict';
 const labels={expired:'本轮已过期，未完成发布',paused:'维护暂停，未发布',deployed:'公网版本与正文验收已通过','deployment-failed':'仓库已提交，但公网部署或验收失败','published-unverified':'仓库已提交，公网尚未验收',collecting:'正在采集','ready-for-analysis':'采集已完成，等待分析提交','needs-revision':'内容待修订，尚未发布','submitted-not-published':'已提交，等待发布',failed:'本轮失败，保留旧报告','skipped-busy':'本轮跳过：已有执行','handoff-uncertain':'交接状态待核验',completed:'仓库发布已确认'};
 function describe(x,now=Date.now()){
  if(x?.status==='skipped-busy'&&(x.reasonCode==='SLOT_COMPLETED'||x.error==='This task hour is already completed'))return '该小时已完成，重复请求已跳过';
  if(x?.status==='deployed'&&(x.deployed!==true||x.deployment?.status!=='verified'))return '仓库已提交，公网验收证据待核';
  if(!x||typeof x.status!=='string'||!labels[x.status])return '执行状态未核验';
  const deadline=Date.parse(x.deadlineAt);
  if(['collecting','ready-for-analysis','needs-revision'].includes(x.status)&&Number.isFinite(deadline)&&now>=deadline)return '本轮已超时，不能继续发布';
  return labels[x.status];
 }
 function schedulerObservation(id,x,control,now=Date.now()){
  const audit=control?.schedulerObservation;
  if(audit?.version!==1||!Array.isArray(audit.tasks))return null;
  const recorded=Date.parse(audit.recordedAt),observed=audit.tasks.find(t=>t.id===id);
  if(!Number.isFinite(recorded)||recorded>now+30000||typeof observed?.enabled!=='boolean')return null;
  if(now-recorded>2*3600000)return '调度器当前状态未核验；上次排查记录为'+(observed.enabled?'启用':'停用');
  return '原生调度器排查时为'+(observed.enabled?'启用':'停用')+'；排查记录不代表持续运行';
 }
 function taskStatus(id,x,control,now=Date.now()){
  if(x)return describe(x,now);
  const paused=new Set(control?.supervisedAcceptance?.pausedTaskGroups||[]);
  return paused.has(id)?'额外交易节点按配置暂停':'尚无新执行记录';
 }
 function taskText(id,x,control,now=Date.now()){
  const time=at=>Number.isFinite(Date.parse(at))?new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Singapore',hour12:false})+' UTC+8':null;
  const executionClock=[['at','执行记录'],['executionFinishedAt','执行结束'],['executionStartedAt','执行开始']].find(([key])=>time(x?.[key]));
  const observed=schedulerObservation(id,x,control,now);
  // An execution and a scheduler inspection are independent observations, with their own clocks.
  const execution=taskStatus(id,x,control,now)+(executionClock?' · '+executionClock[1]+'：'+time(x[executionClock[0]]):x?' · 执行记录时间未提供':'')+(x?.error?'；执行错误：'+String(x.error).split('\n')[0]:'');
  const scheduler=observed?observed+' · 排查记录：'+time(control.schedulerObservation.recordedAt):'调度器当前状态未核验；缺少有效排查记录';
  return execution+'；'+scheduler;
 }
 function freshnessStatus(latest,health,control,now=Date.now()){
  if(control?.productionPaused===true)return null;
  const enabled=new Set(control?.supervisedAcceptance?.enabledTaskGroups||[]);
  if(!enabled.has('global-main'))return null;
  const task=health?.tasks?.['global-main'];
  const reportAt=stamp(latest?.reportMeta?.generatedAt||latest?.updatedAt),healthAt=stamp(task?.executionFinishedAt||task?.at||(health?.tasks?null:health?.updatedAt));
  if(!Number.isFinite(reportAt)&&!Number.isFinite(healthAt))return {stale:true,text:'连续更新状态无法核验：报告与运行状态均缺少有效时间。'};
  const reportAge=Number.isFinite(reportAt)?Math.max(0,now-reportAt):Infinity,healthAge=Number.isFinite(healthAt)?Math.max(0,now-healthAt):Infinity,limit=2*3600000;
  if(reportAge<=limit&&(!Number.isFinite(healthAt)||healthAge<=limit))return null;
  const ageText=ms=>Number.isFinite(ms)?(ms/3600000).toFixed(ms>=10*3600000?0:1)+'小时':'未知';
  return {stale:true,text:'连续更新疑似中断：最新报告距今 '+ageText(reportAge)+'，全球任务执行记录距今 '+ageText(healthAge)+'；生产开关仍开启，请检查原生定时任务是否失活。'};
 }
 function snapshotStatus(latest,now=Date.now()){
  const raw=latest?.reportMeta?.generatedAt||latest?.updatedAt;
  // Legacy local report timestamps are UTC+8, never the viewer's machine timezone.
  const iso=typeof raw==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+':00+08:00':raw;
  const at=typeof iso==='string'?Date.parse(iso):NaN;
  if(!Number.isFinite(at)||at>now+30000)return {stale:true,status:'unverified',text:'报告时效无法核验：缺少有效的报告时间。页面可打开不代表内容已更新。'};
  const age=Math.max(0,now-at),clock=new Date(at).toLocaleString('zh-CN',{timeZone:'Asia/Singapore',hour12:false})+' UTC+8';
  if(age<=2*3600000)return {stale:false,status:'within-window',ageMs:age,reportAt:iso};
  return {stale:true,status:'stale',ageMs:age,reportAt:iso,text:'报告已超过 '+(age/3600000).toFixed(1)+' 小时未更新；最后报告：'+clock+'。以下是历史快照，不是当前行情；新闻的24小时窗口以该报告为准，事件日历也未重新核验。'};
 }
 // Publication identity comes from the served report and its exact batch receipt,
 // never from whichever retry most recently overwrote runtime/health.json.
 const groups={'global-main':'全球主报告','asia-session':'A股港股节点','us-session':'美股节点'};
 const roles=['quotes','asia-equities','us-equities','news','macro','research','synthesis'];
 const list=x=>Array.isArray(x)?x:[];
 const stamp=x=>typeof x==='string'?Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(x)?x.replace(' ','T')+':00+08:00':x):NaN;
 const clock=x=>Number.isFinite(stamp(x))?new Date(stamp(x)).toLocaleString('zh-CN',{timeZone:'Asia/Singapore',hour12:false}):'时间未核验';
 function reportBatch(latest){
  const ref=latest?.reportMeta?.moduleRefs?.quotes,run=ref?.runId;
  if(typeof run!=='string'||!run.endsWith('-quotes'))return null;
  const id=run.slice(0,-7);
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)&&ref.path==='data/runs/quotes/'+run+'.json'?id:null;
 }
 function publication(latest,receipt,now=Date.now()){
  const id=reportBatch(latest),refs=latest?.reportMeta?.moduleRefs||{},items=list(receipt?.modules);
  const generated=stamp(latest?.reportMeta?.generatedAt||latest?.updatedAt),processed=stamp(receipt?.processedAt);
  const basic=id&&/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(latest?.reportId||'')&&receipt?.status==='published'&&receipt.batchId===id&&receipt.reportId===latest.reportId&&Object.hasOwn(groups,receipt.taskGroup)&&Array.isArray(receipt.errors)&&receipt.errors.length===0&&Number.isFinite(generated)&&generated<=now+30000&&Number.isFinite(processed)&&processed>=generated&&processed<=now+30000;
  const expected=receipt?.taskGroup==='global-main'?roles:['quotes',receipt?.taskGroup==='asia-session'?'asia-equities':'us-equities','news','synthesis'];
  const matched=basic&&items.length===expected.length&&new Set(items.map(x=>x?.role)).size===expected.length&&items.every(x=>x&&expected.includes(x.role)&&/^[a-f0-9]{64}$/i.test(x.sha256||'')&&(x.role==='synthesis'?x.runId===id+'-synthesis':refs[x.role]?.runId===x.runId&&refs[x.role]?.path==='data/runs/'+x.role+'/'+x.runId+'.json'));
  if(!matched)return {verified:false,reportId:latest?.reportId||null,text:'最后成功发布：回执尚未核验'+(latest?.reportId?'；当前读取报告 '+latest.reportId:'')+'。不能用最近一次尝试推断发布成功。'};
  return {verified:true,reportId:latest.reportId,batchId:id,taskGroup:receipt.taskGroup,modules:items,processedAt:receipt.processedAt,text:'最后成功发布：'+clock(receipt.processedAt)+' UTC+8 · '+latest.reportId+' · '+items.length+'个模块发布回执已核对'};
 }
 function attemptText(id,x,now=Date.now()){
  if(!x)return '最近一次尝试（'+groups[id]+'）：暂无可核验记录';
  const at=['at','executionFinishedAt','executionStartedAt'].map(k=>x[k]).find(v=>Number.isFinite(stamp(v)));
  const duplicate=x.status==='skipped-busy'&&x.error==='This task hour is already completed';
  const error=x.error&&!duplicate?'；原因：'+String(x.error).split('\n')[0]:'';
  return '最近一次尝试（'+groups[id]+'）：'+describe(x,now)+(at?' · '+clock(at)+' UTC+8':' · 时间未核验')+(duplicate?'；不是发布失败':'' )+error;
 }
 function regionText(id,latest,receipt,control,now=Date.now()){
  const role=id==='asia-session'?'asia-equities':'us-equities',ref=latest?.reportMeta?.moduleRefs?.[role],p=publication(latest,receipt,now);
  const paused=list(control?.supervisedAcceptance?.pausedTaskGroups).includes(id),enabled=list(control?.supervisedAcceptance?.enabledTaskGroups).includes(id);
  const audit=control?.schedulerObservation,observed=list(audit?.tasks).find(t=>t.id===id),at=stamp(audit?.recordedAt);
  const recent=audit?.version===1&&Number.isFinite(at)&&at<=now+30000&&now-at<=2*3600000&&typeof observed?.enabled==='boolean';
  const mode=control?.productionPaused===true?'生产维护暂停':paused?'按配置暂停':enabled?(recent?(observed.enabled?'配置允许，最近核验已启用（'+clock(audit.recordedAt)+' UTC+8）':'配置允许，但最近核验调度停用'):'配置允许，实际调度另行核验'):'配置状态未核验';
  const label=id==='asia-session'?'A股港股额外任务':'美股额外任务';
  const updated=p.verified&&p.modules.some(m=>m.role===role&&m.runId===ref?.runId);
  let moduleText='对应模块尚无可核验引用';
  if(updated)moduleText='对应模块已随 '+latest.reportId+' '+groups[p.taskGroup]+'发布';
  else if(ref?.runId)moduleText=(p.verified?'当前报告沿用模块':'当前报告引用模块')+'，原生成时间：'+clock(ref.generatedAt)+' UTC+8'+(p.verified?'（不是本轮新采集）':'；发布回执待核验');
  return label+'：'+mode+'；'+moduleText+'。';
 }
 async function readState(fetchImpl,signal,now=Date.now()){
  const get=async url=>{const r=await fetchImpl(url,{cache:'no-store',signal});if(!r.ok)throw Error('HTTP '+r.status);return r.json();};
  const urls=['https://raw.githubusercontent.com/StupidYang/gobal-daily-report/gdr-runtime/runtime/health.json?check='+now,'./data/runtime-control.json?check='+now,'./data/latest.json?check='+now];
  // The latest report and receipt remain readable when the independent health API fails.
  const initial=urls.map(get);
  // A stalled cross-origin health request must not delay the same-origin receipt.
  const receiptPromise=initial[2].then(async latest=>{const id=reportBatch(latest);return id?get('./data/receipts/batches/'+id+'.json?check='+now):null;});
  const result=await Promise.allSettled([...initial,receiptPromise]);
  const value=i=>result[i].status==='fulfilled'?result[i].value:null;
  const health=value(0),control=value(1),latest=value(2),id=reportBatch(latest);
  const readErrors=result.map((r,i)=>r.status==='rejected'?{component:['health','control','latest','receipt'][i],error:String(r.reason?.message||r.reason)}:null).filter(Boolean);
  const receipt=value(3);
  return {health:health?.version===1&&health.tasks&&typeof health.tasks==='object'&&!Array.isArray(health.tasks)?health:null,control,latest,receipt,publication:publication(latest,receipt,now),snapshot:snapshotStatus(latest,now),readErrors};
 }
 function render(box,state,document,now=Date.now()){
  const {health,control,latest,receipt,snapshot,readErrors}=state,p=publication(latest,receipt,now);
  box.replaceChildren();
  const line=(parent,text,className)=>{const node=document.createElement('p');node.className=className||'';node.textContent=text;parent.append(node);return node;};
  if(snapshot.stale)line(box,snapshot.text,'execution-stale');
  else {const stale=freshnessStatus(latest,health,control,now);if(stale)line(box,stale.text,'execution-stale');}
  line(box,p.text,p.verified?'execution-published':'execution-unverified');
  if(!health)line(box,'执行状态接口暂时不可用；不能据此认定任务正在运行。'+readErrors.filter(e=>e.component==='health').map(e=>' '+e.error).join(''),'execution-unverified');
  else for(const id of Object.keys(groups))if(id==='global-main'||health.tasks[id])line(box,attemptText(id,health.tasks[id],now),'execution-attempt');
  const details=document.createElement('details'),summary=document.createElement('summary');
  details.className='execution-details';summary.textContent='查看执行、调度观测与模块来源';details.append(summary);
  for(const id of ['asia-session','us-session'])line(details,regionText(id,latest,receipt,control,now),'execution-region');
  line(details,'模块发布不代表行情实时、行业排名或研究覆盖完整；具体缺口见下方内容状态。','execution-note');
  const attempts=list(health?.attempts).filter(x=>Object.hasOwn(groups,x?.taskGroup)&&Number.isFinite(stamp(x.at))&&stamp(x.at)<=now&&now-stamp(x.at)<=86400000).slice(-24);
  if(attempts.length){
   line(details,'最近已入库尝试（不是平台全部触发日志；写入前失败或未触发不可由此推断）','execution-note');
   for(const x of attempts)line(details,attemptText(x.taskGroup,x,now)+(x.reasonCode?'；分类：'+x.reasonCode:''),'execution-attempt');
  }
  for(const id of Object.keys(groups))line(details,groups[id]+'：'+taskText(id,health?.tasks?.[id],control,now));
  if(p.verified)line(details,'发布批次：'+p.batchId+'；回执处理时间：'+clock(p.processedAt)+' UTC+8。此处核对发布回执，不代替独立公网浏览器验收。');
  for(const error of readErrors.filter(e=>e.component!=='health'))line(details,'读取未完成：'+error.component+' · '+error.error);
  box.append(details);
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={describe,taskStatus,taskText,freshnessStatus,schedulerObservation,snapshotStatus,readState,reportBatch,publication,attemptText,regionText,render};return;}
 if(!root.document||['synthetic','validation'].includes(document.documentElement.dataset.mode))return;
 const box=document.getElementById('executionStatus');if(!box)return;
 let loadId=0,activeAbort=null;
 async function load(){
  const id=++loadId;activeAbort?.abort();
  const abort=new AbortController();activeAbort=abort;
  const timer=setTimeout(()=>abort.abort(),6000);
  try{
   const state=await readState(fetch,abort.signal);
   if(id!==loadId)return;
   // Retain the user's disclosure state during a read-only status refresh.
   const open=box.querySelector?.('.execution-details')?.open===true;
   render(box,state,document);
   const details=box.querySelector?.('.execution-details');if(details)details.open=open;
  }catch{if(id===loadId)box.textContent='执行状态暂时无法读取；页面能打开不代表本轮更新成功。';}
  finally{clearTimeout(timer);if(id===loadId)box.hidden=false;}
 }
 load();document.getElementById('refreshBtn')?.addEventListener('click',load);
 // Browser-local reads only: no scheduled production task or report publication is created.
 if(typeof root.setInterval==='function')root.setInterval(()=>{if(!document.hidden)load();},60000);
})(typeof globalThis!=='undefined'?globalThis:window);
