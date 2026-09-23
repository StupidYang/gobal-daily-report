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
 if(typeof module!=='undefined'&&module.exports){module.exports={describe};return;}
 if(!root.document||['synthetic','validation'].includes(document.documentElement.dataset.mode))return;
 const box=document.getElementById('executionStatus');if(!box)return;
 async function load(){
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);
  try{
   const response=await fetch('https://raw.githubusercontent.com/StupidYang/gobal-daily-report/gdr-runtime/runtime/health.json?check='+Date.now(),{cache:'no-store',signal:abort.signal});
   if(!response.ok)throw Error('health unavailable');const health=await response.json();if(health.version!==1||!health.tasks)throw Error('invalid health');
   box.replaceChildren();
   for(const [id,label]of [['global-main','全球主报告'],['asia-session','A股港股节点'],['us-session','美股节点']]){
    const x=health.tasks[id],line=document.createElement('p');line.textContent=label+'：'+(x?describe(x):'尚无新执行记录')+(x?.at?' · '+new Date(x.at).toLocaleString('zh-CN',{timeZone:'Asia/Singapore',hour12:false})+' UTC+8':'');
    if(x?.error){const reason=document.createElement('span');reason.textContent='；'+String(x.error).split('\n')[0];line.append(reason);}box.append(line);
   }
  }catch{box.textContent='执行状态暂时无法读取；页面能打开不代表本轮更新成功。';}
  finally{clearTimeout(timer);box.hidden=false;}
 }
 load();document.getElementById('refreshBtn')?.addEventListener('click',load);
})(typeof globalThis!=='undefined'?globalThis:window);
