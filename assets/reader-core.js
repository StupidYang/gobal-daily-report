/* Pure reader-r2 adapters. No generated prices, no generated market judgments. */
(function(root){
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./terminal-core.js'):root.GDR;
  const A=C.arr,T=C.text,regions={CN:'中国',US:'美国',WORLD:'全球其他地区',UNSPECIFIED:'旧版未分类'};
  function newsRows(r){
    const byId=new Map();
    [...A(r?.worldEvents),...A(r?.newsroom?.items)].forEach((x,i)=>{
      if(!x||typeof x!=='object')return;
      const id=T(x.eventId||x.id)||'legacy-'+i;
      const normalized={...x,id,regions:[...new Set(A(x.regions).filter(v=>Object.hasOwn(regions,v)))]};
      if(!normalized.regions.length)normalized.regions=['UNSPECIFIED'];
      const old=byId.get(id);
      if(!old){byId.set(id,normalized);return;}
      const time=v=>C.parseTime(v.updatedAt||v.publishedAt)||0;
      const merged=time(normalized)>=time(old)?{...old,...normalized}:{...normalized,...old};
      merged.regions=[...new Set([...old.regions,...normalized.regions])].filter(v=>v!=='UNSPECIFIED');
      if(!merged.regions.length)merged.regions=['UNSPECIFIED'];
      merged.sourceIds=[...new Set([...A(old.sourceIds),...A(normalized.sourceIds)])];
      byId.set(id,merged);
    });
    return [...byId.values()].sort((a,b)=>(C.parseTime(b.updatedAt||b.publishedAt)||0)-(C.parseTime(a.updatedAt||a.publishedAt)||0));
  }
  function newsCounts(rows){const out={total:rows.length,CN:0,US:0,WORLD:0,UNSPECIFIED:0,general:0};rows.forEach(x=>{A(x.regions).forEach(k=>{if(Object.hasOwn(regions,k))out[k]++;});if(x.kind==='general')out.general++;});return out;}
  function plain(r){
    const p=r?.plainLanguage;
    if(p&&typeof p==='object'&&!Array.isArray(p)&&T(p.verdict))return {...p,legacy:false,impacts:A(p.impacts)};
    return {legacy:true,verdict:T(r?.brief||r?.marketState,'本版本尚未提供白话结论'),whyNow:'以下摘自原报告；不是本次页面更新生成的新研究。',bottomLine:'白话影响与多框架综合判断将在采用 reader-r2 契约的新报告中提供。原有分析仍完整保留。',impacts:A(r?.assets).map(x=>({asset:x.name,effect:'未单独评级',reason:x.summary,takeaway:x.detail,evidenceFactIds:A(x.factIds),sourceIds:A(x.sourceIds)}))};
  }
  function normalizedId(f){
    // Use only source-backed, finite, timed observations. Changing scope splits series.
    if(f?.valueType==='yield'&&C.finite(f.rawValue)&&T(f.seriesKey)&&f.unit==='%'&&T(f.scope)&&C.parseTime(f.asOf)!==null&&['live','complete','closed','delayed'].includes(f.dataStatus)&&A(f.sourceIds).length)return [f.seriesKey,'yield',f.unit,T(f.contract),f.scope].join('|');
    const id=C.seriesIdentity(f);return id&&T(f.scope)?id+'|'+T(f.scope):null;
  }
  function rejectReason(f){
    if(!C.finite(f.rawValue)||(f.rawValue<=0&&f.valueType!=='yield'))return '没有精确正数值（缺失或阈值报价）';
    if(C.parseTime(f.asOf)===null)return '数据时点不精确';
    if(!['live','complete','closed','delayed'].includes(f.dataStatus))return '质量或披露状态不适合价格曲线';
    if(f.valueType&&!['price','index','yield'].includes(f.valueType))return '流量、涨幅或概率不是价格序列';
    if(!normalizedId(f))return '指标身份、单位、来源或合约不完整';
    return null;
  }
  function series(reports,end){
    const cutoff=C.parseTime(end),bins=new Map(),rejected={}, seenReports=new Set();let accepted=0;
    if(cutoff===null)return {rows:[],rejected:{'报告时点无效':1},accepted:0,observations:0,reports:0};
    A(reports).forEach(r=>{
      const rt=C.reportTime(r);if(rt===null||rt>cutoff)return;
      const rid=T(r.reportId||r.updatedAt);if(seenReports.has(rid))return;seenReports.add(rid);
      C.facts(r).forEach(f=>{
        let reason=rejectReason(f),at=C.parseTime(f.asOf);
        if(!reason&&(at>cutoff||at<cutoff-86400000))reason='不在本报告24小时窗口';
        if(reason){rejected[reason]=(rejected[reason]||0)+1;return;}
        if(!A(f.sourceIds).every(id=>A(r.sources).some(s=>s?.id===id))){rejected['来源引用不存在']=(rejected['来源引用不存在']||0)+1;return;}
        const key=normalizedId(f);accepted++;
        if(!bins.has(key))bins.set(key,{key,label:T(f.label),group:C.group(f),kind:f.valueType||key.split('|')[1],unit:f.unit,points:new Map()});
        const b=bins.get(key),old=b.points.get(at);
        if(!old||rt>=(C.parseTime(old.recordedAt)||0))b.points.set(at,{at,value:f.rawValue,factId:f.id,reportId:rid,recordedAt:r.updatedAt,sourceIds:A(f.sourceIds)});
      });
    });
    const rows=[...bins.values()].map(b=>({...b,points:[...b.points.values()].sort((a,b)=>a.at-b.at)}));
    return {rows,rejected,accepted,observations:rows.reduce((a,b)=>a+b.points.length,0),reports:seenReports.size};
  }
  function comparable(rows){
    const good=A(rows).filter(s=>['price','index'].includes(s.kind)&&s.points.length>=2), bases=new Map();
    good.forEach(s=>s.points.slice(0,-1).forEach(p=>{if(!bases.has(p.at))bases.set(p.at,[]);bases.get(p.at).push(s);}));
    const choices=[...bases.entries()].map(([at,ss])=>{const groups=new Map();ss.forEach(s=>{if(!groups.has(s.group))groups.set(s.group,s);});return [at,[...groups.values()].slice(0,4)];}).filter(x=>x[1].length>=2).sort((a,b)=>b[1].length-a[1].length||a[0]-b[0]);
    if(!choices.length)return {series:[],reason:'需至少两个不同资产各有两次观测，并共享实际数据时点；不会用不同时间各自归零。'};
    const [base,selected]=choices[0];return {base,series:selected.map(s=>{const start=s.points.find(p=>p.at===base).value;return {...s,points:s.points.filter(p=>p.at>=base).map(p=>({...p,value:(p.value/start-1)*100}))};}),reason:''};
  }
  function check(r){
    const errors=[];
    if(!r||typeof r!=='object'||Array.isArray(r))return ['报告必须是对象'];
    if(C.reportTime(r)===null)errors.push('updatedAt必须有完整有效时点');
    ['metrics','canonicalFacts','sources','deepDive','worldEvents','frameworkAnalysis','analysisTheses','events'].forEach(k=>{if(r[k]!==undefined&&!Array.isArray(r[k]))errors.push(k+'必须为数组');});
    if(r.newsroom?.items!==undefined&&!Array.isArray(r.newsroom.items))errors.push('newsroom.items必须为数组');
    if(errors.length)return errors;
    if(A(r.canonicalFacts).some(x=>!x||typeof x!=='object'||Array.isArray(x)))return ['canonicalFacts含无效对象'];
    errors.push(...C.issues(r));
    ['metrics','canonicalFacts','sources','deepDive','worldEvents','analysisTheses','events','judgmentRevisions'].forEach(k=>A(r[k]).forEach(x=>{if(!x||typeof x!=='object'||Array.isArray(x))errors.push(k+'含无效对象');}));
    A(r.frameworkAnalysis).forEach(x=>{if(!x||typeof x!=='object'){errors.push('分析框架必须为对象');return;}if(!T(x.framework)||!T(x.conclusion))errors.push('框架缺少名称或结论');});
    A(r.newsroom?.items).forEach(x=>{if(!x?.id&&!x?.eventId)errors.push('时事缺少稳定事件ID');if(!T(x?.summary)||!T(x?.title))errors.push('时事缺少事实摘要');});
    return [...new Set(errors)];
  }
  const api={regions,newsRows,newsCounts,plain,normalizedId,rejectReason,series,comparable,check};
  root.GDREditorial=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
