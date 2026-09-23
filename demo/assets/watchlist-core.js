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
 if(!m.payload||typeof m.payload!=='object'||Array.isArray(m.payload))return [...errors,'payload 必须是对象'];
 if(!Array.isArray(m.sources))errors.push('sources 必须是数组');
 const sources=new Set();
 arr(m.sources).forEach(s=>{if(!s||!s.id||sources.has(s.id)||!safeUrl(s.url)){errors.push('来源重复或缺id/url');return;}sources.add(s.id);});
 const numberKeys=new Set(['price','changePct','rawValue','volumeRatio20d','turnoverPct','valueTraded','avgDailyValue20d']);
 const pointerKey=k=>String(k).replace(/~/g,'~0').replace(/\//g,'~1');
 // This is declared coverage metadata, not an observation. Check its own schema;
 // never exempt similarly named objects nested inside a quote or a sector row.
 function gapMetadata(x,p){
  if(!x||typeof x!=='object'||Array.isArray(x)){errors.push('rankingInputGaps必须是字段到状态的对象 @ '+p);return;}
  const allowed=new Set(['missing','available','partial','not-applicable','unknown']);
  const fields=new Set([...numberKeys,'volumeBaseline','listingDays','valueTradedComparable']);
  for(const [k,v]of Object.entries(x)){
   const at=p+'/'+pointerKey(k);
   if(k==='note'){if(typeof v!=='string')errors.push('排名缺口note必须是字符串 @ '+at);continue;}
   if(['heatRankingGenerated','weakRankingGenerated'].includes(k)){if(typeof v!=='boolean')errors.push('排名生成标记必须是布尔值 @ '+at);continue;}
   if(k==='missingFields'){if(!Array.isArray(v)||v.some(f=>typeof f!=='string'||!fields.has(f)))errors.push('missingFields必须是已知字段名数组 @ '+at);continue;}
   if(!fields.has(k))errors.push('未知排名缺口字段 @ '+at);
   if(typeof v!=='string'||!allowed.has(v))errors.push('排名缺口状态无效 @ '+at);
  }
 }
 function scan(x,catalog=sources,p='/payload'){
  if(x&&x===m.payload?.report&&m.module==='synthesis')catalog=new Set(arr(x.sources).map(s=>s?.id));
  if(!x||typeof x!=='object')return;
  if(Array.isArray(x)){x.forEach((v,i)=>scan(v,catalog,p+'/'+i));return;}
  if(x.sourceIds!==undefined){if(!Array.isArray(x.sourceIds))errors.push('sourceIds必须是数组 @ '+p+'/sourceIds');else x.sourceIds.forEach((id,i)=>{if(!catalog.has(id))errors.push('来源不存在: '+id+' @ '+p+'/sourceIds/'+i);});}
  for(const [k,v] of Object.entries(x)){
   const at=p+'/'+pointerKey(k);
   if(at==='/payload/rankingInputGaps'&&['asia-equities','us-equities'].includes(m.module)){gapMetadata(v,at);continue;}
   if(numberKeys.has(k)&&v!==null&&!finite(v))errors.push('非数值 '+k+'（必须为有限数字或null） @ '+at);
   if(['rawValue','price'].includes(k)&&finite(v)&&/[<>≥≤]/.test(String(x.displayValue||'')))errors.push('阈值文字不能当精确数值 @ '+at);
   if(k==='asOf'&&v!==null&&time(v)===null)errors.push('asOf必须精确或null @ '+at);
   if(k==='asOf'&&generated!==null&&time(v)!==null&&time(v)>generated+300000)errors.push('asOf不能在未来 @ '+at);
   scan(v,catalog,at);
  }
 }
 scan(m.payload);
 if(m.module==='quotes'){
  if(!Array.isArray(m.payload?.items))errors.push('quotes.items必须是数组');
  const ids=new Set();arr(m.payload?.items).forEach(q=>{if(!q||!q.instrumentId||ids.has(q.instrumentId))errors.push('报价instrumentId缺失或重复');ids.add(q?.instrumentId);
   if(finite(q?.price)&&(!arr(q.sourceIds).length||time(q.asOf)===null))errors.push('数值报价必须有来源和精确asOf');
   if(/^ENERGY:/.test(q?.instrumentId||'')&&finite(q?.price)&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.contract||'')))errors.push('原油必须标明YYYY-MM合约');
  });
 }
 if(['asia-equities','us-equities'].includes(m.module)){
  if(!Array.isArray(m.payload?.groups))errors.push('equities.groups必须是数组');
  // Industry identifiers are local to a market; CN and HK can both contain 公用事业.
  const groupIds=new Set();arr(m.payload?.groups).forEach(g=>{const groupKey=JSON.stringify([g?.market,g?.id]);if(!g||!g.id||groupIds.has(groupKey)||!['CN','HK','US'].includes(g.market)||!Array.isArray(g.rows))errors.push('板块分组无效');groupIds.add(groupKey);
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
 if(m.module==='news'){
  if(!m.payload.newsroom||!Array.isArray(m.payload.newsroom.items))errors.push('newsroom.items必须是数组');
  const ids=new Set();arr(m.payload.newsroom?.items).forEach(n=>{const id=n?.eventId||n?.id;if(!id||ids.has(id))errors.push('新闻ID缺失或重复');ids.add(id);if(!n?.title||!n?.summary||!arr(n?.sourceIds).length)errors.push('新闻缺标题/摘要/来源');});
 }
 if(m.module==='macro')for(const k of ['canonicalFacts','macroEvents','events'])if(!Array.isArray(m.payload[k]))errors.push('macro.'+k+'必须是数组');
 if(m.module==='synthesis'&&(!m.payload?.report||m.payload.report.schemaVersion!==5))errors.push('synthesis需完整schema5报告');
 return [...new Set(errors)];
}

// Read-side isolation only. Strict validate() is never weakened for publication.
// Invalid values are quarantined, not repaired, interpolated or shown as current quotes.
function projectModule(input, expected, now=Date.now()) {
 const originalErrors=validate(input,expected,now);
 if(!originalErrors.length)return {module:input,issues:[],quarantined:[]};
 if(!input||typeof input!=='object')return {module:null,issues:originalErrors,quarantined:[]};
 const m=JSON.parse(JSON.stringify(input)),quarantined=[];
 const blank={quotes:{items:[]},macro:{canonicalFacts:[],macroEvents:[],events:[]},research:{records:[],checks:[]},'asia-equities':{groups:[]},'us-equities':{groups:[]},news:{newsroom:{items:[]}}};
 if(!blank[expected])return {module:null,issues:originalErrors,quarantined};
 const envelope=validate({...m,payload:blank[expected]},expected,now);
 if(envelope.length)return {module:null,issues:envelope,quarantined};
 if(expected==='quotes'){
  if(!Array.isArray(m.payload?.items))return {module:null,issues:originalErrors,quarantined};
  const seen=new Set();
  m.payload.items=m.payload.items.map((q,i)=>{
   const errors=validate({...m,payload:{items:[q]}},expected,now);
   if(q?.instrumentId&&seen.has(q.instrumentId))errors.push('重复资产身份');
   if(q?.instrumentId)seen.add(q.instrumentId);
   if(!errors.length)return q;
   quarantined.push({path:`payload.items[${i}]`,instrumentId:q?.instrumentId||null,errors,original:q});
   if(!q?.instrumentId||errors.includes('重复资产身份'))return null;
   return {instrumentId:q.instrumentId,symbol:q.symbol,name:q.name,market:q.market,group:q.group,currency:q.currency,
    price:null,displayValue:'异常记录已隔离',changePct:null,asOf:null,status:'error',sourceIds:[],contract:null,
    note:'原始记录未通过校验：'+errors.join('；')+'。其他合格资产仍正常展示。'};
  }).filter(Boolean);
 } else if(expected==='macro'){
  for(const key of ['canonicalFacts','macroEvents','events'])if(Array.isArray(m.payload?.[key])){
   m.payload[key]=m.payload[key].filter((row,i)=>{
    const errors=validate({...m,payload:{canonicalFacts:[],macroEvents:[],events:[],[key]:[row]}},expected,now);
    if(!errors.length)return true;
    quarantined.push({path:`payload.${key}[${i}]`,errors,original:row});return false;
   });
  }
 } else return {module:null,issues:originalErrors,quarantined};
 const remaining=validate(m,expected,now);
 if(remaining.length)return {module:null,issues:remaining,quarantined};
 m.status='partial';
 return {module:m,issues:originalErrors,quarantined};
}

function nValue(n,max=20){const v=Number(n);return Number.isInteger(v)?Math.max(1,Math.min(max,v)):5;}
function median(v){const a=v.filter(finite).sort((a,b)=>a-b);return a.length?a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2:null;}
function percentile(a,value){if(a.length<2)return .5;const lo=a.filter(x=>x<value).length,eq=a.filter(x=>x===value).length;return (lo+(eq-1)/2)/(a.length-1);}
function rankGroup(group,config,n=5){
 const rules=config.ranking||{}, as=time(group.asOf), observed=arr(group.rows), seen=new Set(), excluded=[];
 const eligible=observed.filter(q=>{
  let why=group.retention?'沿用的历史样本不参与当前排名':null;
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
function quoteRows(config,module){const map=new Map(arr(module?.payload?.items).filter(q=>q?.instrumentId).map(q=>[q.instrumentId,q]));return arr(config.required).map(i=>({...i,...(map.get(i.id)||{}),instrumentId:i.id,status:map.get(i.id)?.status||'missing',price:map.has(i.id)?map.get(i.id).price:null}));}
function priceText(q){if(!finite(q.price))return q.displayValue||'待采集';if(q.price!==0&&Math.abs(q.price)<1e-9)return q.price.toPrecision(4);return new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(q.price)<.001?10:Math.abs(q.price)<1?6:3}).format(q.price);}
function freshness(m,ttl,now=Date.now()) {if(!m)return 'missing';if(time(m.generatedAt)===null||time(m.generatedAt)>now+300000)return 'unknown';if(m.status==='error'||m.status==='missing')return m.status;const t=time(m.generatedAt);return t===null?'unknown':now-t>ttl*3600000?'stale':m.status;}
// A missing/newer record cannot erase an actual known quote or alter its asOf.
function chooseQuote(old,next){
 if(!old)return next;if(!next)return old;
 const ot=time(old.asOf),nt=time(next.asOf),ov=finite(old.price),nv=finite(next.price);
 if(ov&&!nv)return {...old,status:'previous',note:(old.note||'')+'；新检查未获得合格报价，保留此原时点值。'};
 if(!ov&&nv)return next;
 return nt!==null&&(ot===null||nt>=ot)?next:old;
}
function combinedQuotes(config,modules){
 const map=new Map(quoteRows(config,modules.quotes).map(q=>[q.instrumentId,{...q,sourceModule:'quotes'}]));
 for(const role of ['asia-equities','us-equities'])for(const g of arr(modules[role]?.payload?.groups))for(const q of arr(g?.rows)){
  if(!q?.instrumentId)continue;
  const next={...q,group:q.group||g.name,market:g.market,status:q.retention||g.retention?'previous':q.status||'snapshot',retention:q.retention||g.retention||null,sourceModule:role};
  map.set(q.instrumentId,chooseQuote(map.get(q.instrumentId),next));
 }
 return [...map.values()];
}
function researchFingerprint(r){return JSON.stringify([r.instrumentId,r.eventType,r.period,r.documentId,r.documentUrl,r.sourceHash||'']);}
function selectResearch(records,cutoff=Infinity){const map=new Map();arr(records).forEach(r=>{const t=time(r.analyzedAt);if(t===null||t>cutoff)return;const old=map.get(r.instrumentId);if(!old||t>time(old.analyzedAt))map.set(r.instrumentId,r);});return [...map.values()];}
const api={arr,finite,MODULES,STATUSES,time,stamp,safeUrl,validate,projectModule,nValue,median,percentile,rankGroup,quoteRows,priceText,freshness,chooseQuote,combinedQuotes,researchFingerprint,selectResearch};
if(typeof module!=='undefined')module.exports=api;root.GDRWatch=api;
})(typeof globalThis!=='undefined'?globalThis:window);
