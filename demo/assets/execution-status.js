/* Latest execution status is independent of the report and the production switch. */
(function(root){
 'use strict';
 const labels={paused:'维护暂停，未发布',deployed:'公网版本与正文验收已通过','deployment-failed':'仓库已提交，但公网部署或验收失败','published-unverified':'仓库已提交，公网尚未验收',collecting:'正在采集','ready-for-analysis':'正在分析','needs-revision':'内容待修订，尚未发布','submitted-not-published':'已提交，等待发布',failed:'本轮失败，保留旧报告','skipped-busy':'本轮跳过：已有执行','handoff-uncertain':'交接状态待核验',completed:'仓库发布已确认'};
 function describe(x,now=Date.now()){
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
  return paused.has(id)?'canary期间主动暂停':'尚无新执行记录';
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
  const reportAt=Date.parse(latest?.reportMeta?.generatedAt||latest?.updatedAt),healthAt=Date.parse(task?.executionFinishedAt||task?.at||(health?.tasks?null:health?.updatedAt));
  if(!Number.isFinite(reportAt)&&!Number.isFinite(healthAt))return {stale:true,text:'连续更新状态无法核验：报告与运行状态均缺少有效时间。'};
  const reportAge=Number.isFinite(reportAt)?Math.max(0,now-reportAt):Infinity,healthAge=Number.isFinite(healthAt)?Math.max(0,now-healthAt):Infinity,limit=2*3600000;
  if(reportAge<=limit&&healthAge<=limit)return null;
  const ageText=ms=>Number.isFinite(ms)?(ms/3600000).toFixed(ms>=10*3600000?0:1)+'小时':'未知';
  return {stale:true,text:'连续更新疑似中断：最新报告距今 '+ageText(reportAge)+'，全球任务执行记录距今 '+ageText(healthAge)+'；生产开关仍开启，请检查原生定时任务是否失活。'};
 }
 if(typeof module!=='undefined'&&module.exports){module.exports={describe,taskStatus,taskText,freshnessStatus,schedulerObservation};return;}
 if(!root.document||['synthetic','validation'].includes(document.documentElement.dataset.mode))return;
 const box=document.getElementById('executionStatus');if(!box)return;
 async function load(){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);
  try{
   const [healthResponse,controlResponse,latestResponse]=await Promise.all([
    fetch('https://raw.githubusercontent.com/StupidYang/gobal-daily-report/gdr-runtime/runtime/health.json?check='+Date.now(),{cache:'no-store',signal:abort.signal}),
    fetch('./data/runtime-control.json?check='+Date.now(),{cache:'no-store',signal:abort.signal}),
    fetch('./data/latest.json?check='+Date.now(),{cache:'no-store',signal:abort.signal})
   ]);
   if(!healthResponse.ok)throw Error('health unavailable');const health=await healthResponse.json();if(health.version!==1||!health.tasks)throw Error('invalid health');
   const control=controlResponse.ok?await controlResponse.json():null,latest=latestResponse.ok?await latestResponse.json():null;
   box.replaceChildren();
   const stale=freshnessStatus(latest,health,control);if(stale){const warning=document.createElement('p');warning.className='execution-stale';warning.textContent=stale.text;box.append(warning);}
   for(const [id,label]of [['global-main','全球主报告'],['asia-session','A股港股节点'],['us-session','美股节点']]){
    const x=health.tasks[id],line=document.createElement('p');line.textContent=label+'：'+taskText(id,x,control);
    box.append(line);
   }
  }catch{box.textContent='执行状态暂时无法读取；页面能打开不代表本轮更新成功。';}
  finally{clearTimeout(timer);box.hidden=false;}
 }
 load();document.getElementById('refreshBtn')?.addEventListener('click',load);
})(typeof globalThis!=='undefined'?globalThis:window);
