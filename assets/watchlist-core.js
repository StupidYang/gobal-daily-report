/* GDR modules-v1. Pure functions shared by browser and Node; never infer missing prices. */
(function(root){
'use strict';
const arr=x=>Array.isArray(x)?x:[], finite=x=>typeof x==='number'&&Number.isFinite(x);
const MODULES=['quotes','asia-equities','us-equities','news','macro','research','synthesis'];
const STATUSES=['ok','partial','missing','error','no-change'];
function time(v){
 if(typeof v!=='string')return null;
 let s=v.trim().replace(' ','T');
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s))s+='+08:00';
 const m=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
 if(!m)return null;
 const [y,mo,d,h,mi,se]=m.slice(1,7).map(x=>Number(x||0));
 if(mo<1||mo>12||d<1||d>new Date(Date.UTC(y,mo,0)).getUTCDate()||h>23||mi>59||se>59)return null;
 const n=Date.parse(s);return finite(n)?n:null;
}
function stamp(v){const t=time(v);return t===null?'时间未确认':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Singapore',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);}
function safeUrl(v){try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function validate(m, expected, now=Date.now()){
 const errors=[];
 if(!m||typeof m!=='object'||Array.isArray(m))return ['模块必须是对象'];
 if(m.moduleVersion!==1)errors.push('moduleVersion 必须为1');
 if(!MODULES.includes(m.module)||expected&&m.module!==expected)errors.push('模块归属不匹配');
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(m.runId||''))errors.push('runId 无效');
 const generated=time(m.generatedAt);
 if(generated===null||generated>now+300000)errors.push('generatedAt 无效或位于未来');
 if(m.dataAsOf!==null&&time(m.dataAsOf)===null)errors.push('dataAsOf 应为精确时点或null');
 if(time(m.dataAsOf)!==null&&generated!==null&&time(m.dataAsOf)>generated+300000)errors.push('数据时点晚于生成时点');
 if(!STATUSES.includes(m.status))errors.push('模块状态无效');
 if(!m.payload||typeof m.payload!=='object'||Array.isArray(m.payload))errors.push('payload 必须是对象');
 if(!Array.isArray(m.sources))errors.push('sources 必须是数组');
 const sources=new Set();
 arr(m.sources).forEach(s=>{if(!s||!s.id||sources.has(s.id)||!safeUrl(s.url)){errors.push('来源重复或缺id/url');return;}sources.add(s.id);});
 function scan(x,catalog=sources){
  if(x&&x===m.payload?.report&&m.module==='synthesis')catalog=new Set(arr(x.sources).map(s=>s?.id));
  if(!x||typeof x!=='object')return;
  if(Array.isArray(x)){x.forEach(v=>scan(v,catalog));return;}
  if(x.sourceIds!==undefined){if(!Array.isArray(x.sourceIds))errors.push('sourceIds必须是数组');else x.sourceIds.forEach(id=>{if(!catalog.has(id))errors.push('来源不存在: '+id);});}
  for(const [k,v] of Object.entries(x)){
   if(['price','changePct','rawValue','volumeRatio20d','turnoverPct','valueTraded','avgDailyValue20d'].includes(k)&&v!==null&&!finite(v))errors.push('非数值 '+k);
   if(['rawValue','price'].includes(k)&&finite(v)&&/[<>≥≤]/.test(String(x.displayValue||'')))errors.push('阈值文字不能当精确数值');
   if(k==='asOf'&&v!==null&&time(v)===null)errors.push('asOf必须精确或null');
   if(k==='asOf'&&generated!==null&&time(v)!==null&&time(v)>generated+300000)errors.push('asOf不能在未来');
   scan(v,catalog);
  }
 }
 scan(m.payload);
 if(m.module==='quotes'){
  if(!Array.isArray(m.payload?.items))errors.push('quotes.items必须是数组');
  const ids=new Set();arr(m.payload?.items).forEach(q=>{if(!q||!q.instrumentId||ids.has(q.instrumentId))errors.push('报价instrumentId缺失或重复');ids.add(q?.instrumentId);
   if(finite(q?.price)&&(!arr(q.sourceIds).length||time(q.asOf)===null))errors.push('数值报价必须有来源和精确asOf');
   if(/^ENERGY:/.test(q?.instrumentId||'')&&finite(q.price)&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.contract||'')))errors.push('原油必须标明YYYY-MM合约');
  });
 }
 if(['asia-equities','us-equities'].includes(m.module)){
  if(!Array.isArray(m.payload?.groups))errors.push('equities.groups必须是数组');
  const groupIds=new Set();arr(m.payload?.groups).forEach(g=>{if(!g||!g.id||groupIds.has(g.id)||!['CN','HK','US'].includes(g.market)||!Array.isArray(g.rows))errors.push('板块分组无效');groupIds.add(g?.id);
   if(m.module==='asia-equities'&&g?.market==='US'||m.module==='us-equities'&&g?.market!=='US')errors.push('跨模块市场越权');
   if(g?.expectedCount!==null&&(!Number.isInteger(g?.expectedCount)||g.expectedCount<0))errors.push('expectedCount无效');
   if(arr(g?.rows).length&&(!g.comparisonBasis||!g.currency||time(g.asOf)===null))errors.push('榜单需共同基准/币种/asOf');
   if(g?.membershipSourceId&&!sources.has(g.membershipSourceId))errors.push('板块成员来源不存在');
   const ids=new Set();arr(g?.rows).forEach(q=>{if(!q||!q.instrumentId||ids.has(q.instrumentId))errors.push('板块内证券ID缺失或重复');ids.add(q?.instrumentId);if(!arr(q?.sourceIds).length)errors.push('板块证券需来源');});
  });
 }
 if(m.module==='research'){
  if(!Array.isArray(m.payload?.records)||!Array.isArray(m.payload?.checks))errors.push('研究需records及checks');
  arr(m.payload?.records).forEach(r=>{if(!r?.instrumentId||!r.eventKey||!r.documentId||!safeUrl(r.documentUrl)||time(r.analyzedAt)===null||time(r.analyzedAt)>generated+300000||!r.analysis?.conclusion)errors.push('研究缺事件身份/原文/分析时间/结论');});
 }
 if(m.module==='synthesis'&&(!m.payload?.report||m.payload.report.schemaVersion!==5))errors.push('synthesis需完整schema5报告');
 return [...new Set(errors)];
}
function nValue(n,max=20){const v=Number(n);return Number.isInteger(v)?Math.max(1,Math.min(max,v)):5;}
function median(v){const a=v.filter(finite).sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null;}
function percentile(a,value){if(a.length<2)return .5;const lo=a.filter(x=>x<value).length,eq=a.filter(x=>x===value).length;return (lo+(eq-1)/2)/(a.length-1);}
function rankGroup(group,config,n=5){
 const rules=config.ranking||{}, as=time(group.asOf), observed=arr(group.rows), seen=new Set(), excluded=[];
 const eligible=observed.filter(q=>{
  let why=null;
  if(!q?.instrumentId||seen.has(q.instrumentId))why='重复/无证券ID';else seen.add(q.instrumentId);
  if(!why&&(q.suspended===true||rules.excludeST&&q.isST===true))why='停牌或风险警示';
  if(!why&&(!finite(q.price)||q.price<=0||!finite(q.changePct)))why='缺价格/涨跌幅';
  if(!why&&(q.currency!==group.currency||q.comparisonBasis!==group.comparisonBasis||q.tradingDate!==group.tradingDate||q.session!==group.session))why='币种/日期/时段/涨跌基准不一致';
  if(!why&&(as===null||time(q.asOf)===null||Math.abs(time(q.asOf)-as)>(rules.maxAsOfSkewMinutes||15)*60000))why='报价时点不一致';
  if(!why&&(!Number.isInteger(q.listingDays)||q.listingDays<(rules.minListingDays||20)))why='上市天数不足或未知';
  if(!why&&(!finite(q.avgDailyValue20d)||q.avgDailyValue20d<(rules.minAvgDailyValue20d?.[group.market]||0)))why='流动性不足或基准未知';
  if(!why&&!arr(q.sourceIds).length)why='无可复核来源';
  if(why){excluded.push({instrumentId:q?.instrumentId||'?',reason:why});return false;}return true;
 });
 const scorable=eligible.filter(q=>['volumeRatio20d','turnoverPct','valueTraded'].every(k=>finite(q[k])&&q[k]>=0)&&q.volumeBaseline==='20-session-same-elapsed');
 const weights=rules.heatWeights||{volumeRatio20d:.5,turnoverPct:.3,valueTraded:.2};
 const denom=Object.values(weights).reduce((a,b)=>a+b,0)||1;
 const scored=scorable.map(q=>({...q,heatScore:100*Object.entries(weights).reduce((s,[k,w])=>s+w*percentile(scorable.map(v=>v[k]),q[k]),0)/denom}));
 const med=median(eligible.map(q=>q.changePct)), N=nValue(n,config.maxN||20);
 const weak=eligible.map(q=>({...q,relativePp:q.changePct-med})).sort((a,b)=>a.relativePp-b.relativePp||a.instrumentId.localeCompare(b.instrumentId)).slice(0,N);
 const hot=scored.sort((a,b)=>b.heatScore-a.heatScore||a.instrumentId.localeCompare(b.instrumentId)).slice(0,N);
 const full=group.universeScope==='full-sector'&&Number.isInteger(group.expectedCount)&&group.expectedCount===observed.length&&group.expectedCount===seen.size&&!!group.membershipSourceId;
 return {id:group.id,market:group.market,name:group.name||group.id,asOf:group.asOf,classification:group.classification,currency:group.currency,comparisonBasis:group.comparisonBasis,session:group.session,
  scope:full?'full-sector':'sample',expected:group.expectedCount??null,observed:observed.length,eligible:eligible.length,scorable:scorable.length,excluded,medianChangePct:med,hot,weak,
  note:!full?'仅为已核验样本内排名，不代表全板块。':excluded.length?'全量成员输入；排名已剔除不满足流动性/数据条件的证券。':'全量成员内的条件筛选榜。'};
}
function quoteRows(config,module){const map=new Map(arr(module?.payload?.items).map(q=>[q.instrumentId,q]));return arr(config.required).map(i=>({...i,...(map.get(i.id)||{}),instrumentId:i.id,status:map.get(i.id)?.status||'missing',price:map.has(i.id)?map.get(i.id).price:null}));}
function priceText(q){if(!finite(q.price))return q.displayValue||'待采集';if(q.price!==0&&Math.abs(q.price)<1e-9)return q.price.toPrecision(4);return new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(q.price)<.001?10:Math.abs(q.price)<1?6:3}).format(q.price);}
function freshness(m,ttl,now=Date.now()) {if(!m)return 'missing';if(m.status==='error'||m.status==='missing')return m.status;const t=time(m.generatedAt);return t===null?'unknown':now-t>ttl*3600000?'stale':m.status;}
function researchFingerprint(r){return JSON.stringify([r.instrumentId,r.eventType,r.period,r.documentId,r.documentUrl,r.sourceHash||'']);}
function selectResearch(records,cutoff=Infinity){const map=new Map();arr(records).forEach(r=>{const t=time(r.analyzedAt);if(t===null||t>cutoff)return;const old=map.get(r.instrumentId);if(!old||t>time(old.analyzedAt))map.set(r.instrumentId,r);});return [...map.values()];}
const api={arr,finite,MODULES,STATUSES,time,stamp,safeUrl,validate,nValue,median,percentile,rankGroup,quoteRows,priceText,freshness,researchFingerprint,selectResearch};
if(typeof module!=='undefined')module.exports=api;root.GDRWatch=api;
})(typeof globalThis!=='undefined'?globalThis:window);
