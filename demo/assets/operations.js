/* Explicit environment identity. A fixture is never evidence of live data readiness. */
(() => {
  'use strict';
  const box=document.getElementById('environmentBanner');
  if(!box)return;
  function show(label,description,linkText,href){
    box.replaceChildren();
    const badge=document.createElement('strong');badge.textContent=label;
    const text=document.createElement('span');text.textContent=description;
    box.append(badge,text);
    if(href){const a=document.createElement('a');a.textContent=linkText;a.href=href;box.append(a);}
    box.hidden=false;
  }
  if(document.documentElement.dataset.mode==='validation'){
    show('真实来源验收 · 自动任务仍暂停','本页是固定的实采与分析验收快照；各资产时点、日度数据和覆盖缺口分别标注，不是自动更新恢复。','返回正式页面','../');
    return;
  }
  if(document.documentElement.dataset.mode==='synthetic'){
    show('测试数据 · 非真实行情','报价、事件与分析均为人工合成；只用于工程验收。正式定时任务仍暂停。','返回正式页面','../');
    return;
  }
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);
  fetch('./data/runtime-control.json',{cache:'no-store',signal:abort.signal}).then(r=>{if(!r.ok)throw Error('control unavailable');return r.json();}).then(c=>{
    if(c.version!==1||typeof c.productionPaused!=='boolean')throw Error('invalid control');
    if(c.productionPaused)show('维护中 · 自动更新暂停',c.reason||'正在验收隔离测试数据。旧报告保留，不代表持续更新。','查看测试演示','./demo/');
    else {
      // A healthy environment label is not a warning banner. Keep its full explanation accessible.
      box.replaceChildren();box.classList.add('is-production');
      const badge=document.createElement('strong');badge.textContent='正式快照';
      const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
      summary.textContent='定时研究，非实时行情';
      body.textContent='发布开关允许更新；请以各模块数据时点和实际发布回执判断新鲜度。';
      const a=document.createElement('a');a.textContent='查看测试演示';a.href='./demo/';body.append(document.createElement('br'),a);
      details.append(summary,body);box.append(badge,details);box.hidden=false;
    }
  }).catch(()=>show('运行状态未核验','无法读取发布开关；不要将页面可访问视为定时更新正常。','查看测试演示','./demo/')).finally(()=>clearTimeout(timer));
})();
