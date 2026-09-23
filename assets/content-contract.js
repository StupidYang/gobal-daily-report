/* Shared reader/publication contract. Aliases are projections, never invented evidence. */
(function(root){
'use strict';
const arr=x=>Array.isArray(x)?x:[],str=x=>typeof x==='string'?x.trim():'',clone=x=>JSON.parse(JSON.stringify(x));
const markets=['A股','港股','美股','BTC','黄金','原油'];
const first=(...xs)=>xs.map(str).find(Boolean)||'';
const label=x=>first(x.title,x.name,x.point,x.item,x.term);
function normalize(input){
 const r=clone(input);
 for(const k of ['recentChanges','changes','evolution24h'])r[k]=arr(r[k]).map(x=>({...x,title:first(x.title,x.name,x.summary,x.detail,x.body,x.change),detail:first(x.detail,x.body,x.summary,x.change),summary:first(x.summary,x.detail,x.body,x.change)}));
 r.analysisTheses=arr(r.analysisTheses).map(x=>({...x,title:first(x.title,x.topic,x.name)}));
 r.news=arr(r.news).map(x=>({...x,title:first(x.title,x.name,x.summary,x.body)}));
 r.macroEvents=arr(r.macroEvents).map(x=>({...x,title:first(x.title,x.name,x.event)}));
 r.assets=arr(r.assets).map(x=>({...x,name:first(x.name,x.asset,x.market,x.title)}));
 r.watch=arr(r.watch).map(x=>({...x,point:first(x.point,x.name,x.item,x.title),detail:first(x.detail,x.why,x.summary)}));
 r.narrativeTriggers=arr(r.narrativeTriggers).map(x=>({...x,title:first(x.title,x.trigger,x.name,x.summary,x.detail),effect:first(x.effect,x.why,x.detail,x.text,x.summary)}));
 r.dataDefinitions=arr(r.dataDefinitions).map(x=>({...x,term:first(x.term,x.name,x.title)||('说明 '+(x.id||'')+'（原文术语未命名）'),_missingTerm:x._missingTerm===true||!first(x.term,x.name,x.title),definition:first(x.definition,x.detail,x.text,x.explanation)}));
 r.sources=arr(r.sources).map(x=>({...x,checkedAt:first(x.checkedAt,x.verifiedAt),retrievedAt:first(x.retrievedAt,x.checkedAt,x.verifiedAt)}));
 r.deepDive=arr(r.deepDive).map(x=>({...x,title:first(x.title,x.name,x.asset,x.market)}));
 return r;
}
function marketOf(x){
 const v=first(x.asset,x.name,x.market,x.title);
 if(markets.includes(v))return v;
 return markets.find(m=>new RegExp('^'+m+'(?:[\\s·：:（(]|$)').test(v))||null;
}
function placeholder(v){return !str(v)||/^(见|参见|详见)(上文|下文|白话影响|总览|综合|原报告)|^(保持原始时点|缺失不补值|同上|略|暂无分析|待补充)[。；;]?$/u.test(str(v));}
function quality(input,previous=null){
 const r=normalize(input),errors=[],warnings=[],by=new Map();
 for(const [i,d]of r.deepDive.entries()){
  const market=marketOf(d);if(market){if(by.has(market))errors.push('重复资产详报 '+market);by.set(market,d);}
  if(placeholder(d.analysis))errors.push('deepDive['+i+']不能是空白或转述占位');
 }
 for(const market of markets){
  const d=by.get(market);if(!d){errors.push('缺少独立资产详报 '+market+'（A–G总论不能代替资产详报）');continue;}
  for(const k of ['mechanism','risk','invalidation','horizon'])if(placeholder(d[k]))errors.push(market+'详报缺少 '+k);
  if(!arr(d.factIds).length&&!arr(d.evidenceFactIds).length&&!arr(d.sourceIds).length)errors.push(market+'详报缺少证据引用');
  if(d.retention){if(!str(d.retention.reportId)||!str(d.retention.analyzedAt)||!str(d.retention.reason))errors.push(market+'沿用分析缺原报告/分析时间/原因');}
 }
 const bodies=[...by.values()].map(x=>str(x.analysis));if(bodies.length>1&&new Set(bodies).size!==bodies.length)errors.push('不同资产不能复制同一段详报占位');
 for(const k of ['recentChanges','changes','evolution24h'])for(const [i,x]of r[k].entries())if(!str(x.title)||!str(x.detail))errors.push(k+'['+i+']标题或正文缺失');
 for(const [i,x]of r.watch.entries())if(!str(x.point)||(!str(x.detail)&&!str(x.a)&&!str(x.b)))errors.push('watch['+i+']观察条件为空');
 for(const [i,x]of r.dataDefinitions.entries())if(x._missingTerm||!str(x.term)||!str(x.definition))errors.push('dataDefinitions['+i+']术语或解释为空');
 for(const k of ['frameworkAnalysis','watch','dataDefinitions'])if(!arr(r[k]).length&&!str(r.sectionGaps?.[k]?.reason))errors.push(k+'缺失，需具体缺口原因而不是空数组');
 if(previous)for(const k of ['watch','dataDefinitions'])if(arr(previous[k]).length&&!arr(r[k]).length&&!str(r.sectionGaps?.[k]?.reason))errors.push('不允许静默删除已有 '+k);
 if(arr(r.newsroom?.items).length<18)warnings.push('新闻覆盖不足18条，必须如实披露，不可凑数');
 return {errors:[...new Set(errors)],warnings,assetCoverage:markets.filter(m=>by.has(m)),contract:'content-r3'};
}
function quoteCoverage(config,m,now=Date.now()){
 const items=new Map(arr(m?.payload?.items).map(x=>[x.instrumentId,x])),s=new Set(arr(m?.sources).filter(x=>/^https?:\/\//.test(x.url||'')).map(x=>x.id));
 const counts={required:arr(config?.required).length,numeric:0,fresh:0,stale:0,retained:0,textOnly:0,missing:0};
 const ttl=(config?.moduleTtlHours?.quotes||6)*3600000;
 const rows=arr(config?.required).map(x=>{const q=items.get(x.id),t=Date.parse(q?.asOf);let state='missing';
  if(q&&!['missing','error','invalid','unknown','window-unclear'].includes(q.status||q.dataStatus)&&typeof q.price==='number'&&Number.isFinite(q.price)&&Number.isFinite(t)&&t<=now&&arr(q.sourceIds).some(id=>s.has(id))){counts.numeric++;state=q.retention?'retained':now-t>ttl?'stale':'fresh';}
  else if(q&&q.displayValue&&arr(q.sourceIds).some(id=>s.has(id))&&!/缺失|未采集|未知|暂无|隔离/.test(q.displayValue))state='textOnly';
  counts[state]++;return {instrumentId:x.id,name:x.name,state,asOf:q?.asOf||null};
 });return {...counts,rows};
}
const projectionCache=new Map();
async function projection(report){
 if(!root.document||report.reportMeta?.dataMode==='synthetic'||!/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(report.reportId||'')||!root.crypto?.subtle)return null;
 const bytes=new TextEncoder().encode(JSON.stringify(report,null,2)+'\n'),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const key=report.reportId+':'+digest;if(projectionCache.has(key))return projectionCache.get(key);
 const pending=(async()=>{const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);try{
  const res=await fetch('./data/reader-projections/'+report.reportId+'.json',{cache:'no-store',signal:abort.signal});if(!res.ok)return null;const p=await res.json();
  return p.version===1&&p.reportId===report.reportId&&p.reportHash===digest?p:null;
 }catch{return null;}finally{clearTimeout(timer);}})();projectionCache.set(key,pending);return pending;
}
async function view(report){const p=await projection(report);return p?{...normalize(report),_readerProjection:p}:normalize(report);}
const api={normalize,quality,markets,marketOf,placeholder,quoteCoverage,projection,view};root.GDRContent=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
