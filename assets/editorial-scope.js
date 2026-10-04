/* Editorial scope, shared by the reader and production compiler. No source data is rewritten. */
(function(root){
'use strict';
const arr=x=>Array.isArray(x)?x:[],text=x=>typeof x==='string'?x:'',clone=x=>JSON.parse(JSON.stringify(x));
const weather=/(?:天气预报|气象|台风|飓风|离岸流|阵雨|雷暴|体感温度|\bNMC(?=\b|\d)|\bNWS(?=\b|\d)|weather\s+(?:forecast|bulletin|advisory)|rip\s+currents?|typhoon|hurricane)/i;
const channels=new Set(['energy','shipping','agriculture','insurance','supply-chain']);
const contentKeys=new Set(['title','name','summary','body','detail','observed','overview','rolling24hSummary','methodology','reason','assessment','plainImpact','impact','effect','analysis','takeaway','verdict','bottomLine','whyNow','conclusion','note']);
const lanes=['news','worldEvents','events','macroEvents','changes','recentChanges','evolution24h','narrativeTriggers'];
function material(x){
 const m=x?.marketImpactEvidence,ids=arr(x?.sourceIds),urls=arr(x?.sourceUrls);
 return !!m&&typeof m==='object'&&m.status==='verified'&&channels.has(m.channel)&&text(m.observedEffect).trim().length>=20&&
  ((arr(m.sourceIds).length>0&&m.sourceIds.every(id=>ids.includes(id)))||(arr(m.sourceUrls).length>0&&m.sourceUrls.every(url=>urls.includes(url))));
}
function weatherText(x){return weather.test(text(x));}
function outOfScope(x){
 if(!x||typeof x!=='object'||material(x))return false;
 return ['title','name','category','summary','body'].some(k=>weatherText(x[k]));
}
function cleanProse(value){
 if(typeof value!=='string'||!weatherText(value))return value;
 // Remove whole clauses, never substitute a price, time, outcome, or market judgment.
 return (value.match(/[^。！？\n]+[。！？\n]?/g)||[]).filter(x=>!weatherText(x)).join('').trim();
}
function errors(editorial){
 const found=[];
 function scan(x,path){
  if(!x||typeof x!=='object')return;
  if(Array.isArray(x)){x.forEach((v,i)=>scan(v,path+'['+i+']'));return;}
  if(material(x))return;
  if(outOfScope(x)){found.push(path+'：普通气象预报/通报不属于GDR选题；重大经济影响须有marketImpactEvidence及原始证据');return;}
  for(const [k,v]of Object.entries(x)){
   if(['sources','canonicalFacts','marketImpactEvidence','retention','reportMeta','sectionGaps','newsCoverage','macroCoverage'].includes(k))continue;
   if(contentKeys.has(k)&&weatherText(v))found.push(path+'.'+k+'：不得用天气更新填充市场摘要、新闻或事件雷达');
   else if(v&&typeof v==='object')scan(v,path+'.'+k);
  }
 }
 // Scope only editorial content, not source receipts, request logs or official calendars.
 for(const key of ['newsItems','events','macroEvents','report'])scan(editorial?.[key],key);
 return [...new Set(found)];
}
function assertEditorial(editorial){const e=errors(editorial);if(e.length)throw Error('editorial-scope-v1\n'+e.join('\n'));}
function project(report){
 const r=clone(report),removed=[];
 function prune(items,path){return arr(items).filter((x,i)=>{if(!outOfScope(x))return true;removed.push({path:path+'['+i+']',id:x.id||x.eventId||null});return false;});}
 for(const key of lanes)if(Array.isArray(r[key]))r[key]=prune(r[key],key);
 if(r.newsroom){for(const key of ['items','legacyItems'])if(Array.isArray(r.newsroom[key]))r.newsroom[key]=prune(r.newsroom[key],'newsroom.'+key);}
 function prose(x){
  if(!x||typeof x!=='object'||material(x))return;
  if(Array.isArray(x)){x.forEach(prose);return;}
  for(const [k,v]of Object.entries(x)){
   if(['sources','canonicalFacts','reportMeta','retention','_readerProjection','_editorialScope'].includes(k))continue;
   if(contentKeys.has(k)&&typeof v==='string'){const clean=cleanProse(v);if(clean!==v){removed.push({field:k});x[k]=clean;}}
   else if(v&&typeof v==='object')prose(v);
  }
 }
 prose(r);
 if(removed.length){
  if(r.newsroom){
   const items=arr(r.newsroom.items),c=r.newsroom.coverage||{};
   const regionCounts={CN:0,US:0,WORLD:0};for(const n of items)for(const region of new Set(arr(n.regions)))if(Object.hasOwn(regionCounts,region))regionCounts[region]++;
   // Raw coverage is retained for auditing, never reused as the visible item count.
   const catalog=new Map(arr(r.sources).map(s=>[s.id,s])),marketHosts=new Set(['query1.finance.yahoo.com','query2.finance.yahoo.com','api.exchange.coinbase.com','api.gold-api.com']);
   function evidence(n){let quote=false;for(const id of arr(n.sourceIds)){const source=catalog.get(id);try{if(marketHosts.has(new URL(source.url).hostname))quote=true;else if(source.evidenceKind!=='calendar')return 'external';}catch{}}return quote?'market-data':'unknown';}
   const external=items.filter(n=>evidence(n)==='external'),externalRegionCounts={CN:0,US:0,WORLD:0};
   for(const n of external)for(const region of new Set(arr(n.regions)))if(Object.hasOwn(externalRegionCounts,region))externalRegionCounts[region]++;
   const scope='当前展示'+items.length+'条符合GDR选题的已收录新闻；本次只修正展示，不是重新采集，不证明完整新闻覆盖。';
   r.newsroom.coverage={...c,note:scope,scope,regions:Object.fromEntries(Object.entries(regionCounts).map(([k,v])=>[k,'当前展示'+v+'条；跨地区分类可重叠'])),gaps:['仅覆盖当前已收录事件，缺少合格内容不得凑数'],status:'partial',complete:false,claimedComplete:false,active:items.length,displayed:items.length,verified:items.filter(n=>!n.retention).length,retained:items.filter(n=>n.retention).length,legacy:arr(r.newsroom.legacyItems).length,regionCounts,general:items.filter(n=>n.kind==='general').length,market:items.filter(n=>n.kind==='market').length,externalVerified:external.length,externalGeneral:external.filter(n=>n.kind==='general').length,externalRegionCounts,marketDataOnly:items.filter(n=>evidence(n)==='market-data').length,claimIssue:null};
   if(typeof r.rolling24hSummary==='string')r.rolling24hSummary=r.rolling24hSummary.replace(new RegExp('(?:当前|保留)?'+arr(report.newsroom?.items).length+'条(?=[^。]*24小时窗口)','g'),items.length+'条');
   r.sectionGaps={...r.sectionGaps,newsroom:{reason:'当前展示'+items.length+'条符合选题的已收录新闻；不足之处保持缺口，不以无关资讯凑数。'}};
  }
  if(!arr(r.events).length)r.sectionGaps={...r.sectionGaps,events:{reason:'当前已收录内容中没有符合选题的未来事件；本次展示修正未重新检查官方日历，不代表未来没有事件。'}};
  r._editorialScope={policy:'editorial-scope-v1',displayOnly:true,removed,originalReportId:report.reportId,originalUpdatedAt:report.updatedAt};
 }
 return r;
}
const api={weatherText,outOfScope,material,cleanProse,errors,assertEditorial,project};root.GDREditorialScope=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
