'use strict';
// Retain source-backed news without inventing the analysis missing from legacy records.
const P=require('./pipeline.cjs');
const arr=x=>Array.isArray(x)?x:[],text=x=>typeof x==='string'?x.trim():'',clone=x=>JSON.parse(JSON.stringify(x));
const marketDataHosts=new Set(['query1.finance.yahoo.com','query2.finance.yahoo.com','api.exchange.coinbase.com','api.gold-api.com']);
function issues(x,sources){
 const out=[];
 if(!x||typeof x!=='object'||Array.isArray(x))return ['item'];
 if(!text(x.eventId||x.id))out.push('eventId');
 if(!arr(x.regions).length||x.regions.some(k=>!['CN','US','WORLD'].includes(k)))out.push('regions');
 if(!['general','market'].includes(x.kind))out.push('kind');
 for(const k of ['title','summary','plainImpact','assessment'])if(!text(x[k]))out.push(k);
 if(!arr(x.sourceIds).length||x.sourceIds.some(id=>!sources.has(id)))out.push('sourceIds');
 return out;
}
function evidenceClass(x,catalog){
 let external=false,market=false,unknown=false;
 for(const id of arr(x?.sourceIds)){
  const source=catalog.get(id);if(!source){unknown=true;continue;}
  try{if(marketDataHosts.has(new URL(source.url).hostname))market=true;else external=true;}catch{unknown=true;}
 }
 return external?'external':market?'market-data':unknown?'unknown':'none';
}
function merge(previous,incoming,{now=Date.now(),coverage,sources=[]}={}){
 if(!Array.isArray(incoming))throw Error('editorial.newsItems must be an array');
 const sourceMap=new Map(sources.filter(s=>s?.id&&/^https?:\/\//.test(s.url||'')).map(s=>[s.id,s])),catalog=new Set(sourceMap.keys());
 const active=new Map(),legacy=new Map(),prior=previous?.payload?.newsroom||{},newIds=new Set();
 for(const original of [...arr(prior.legacyItems),...arr(prior.items)]){
  const x=clone(original);const missing=issues(x,catalog);const at=Date.parse(x.publishedAt||x.eventAt||x.updatedAt);
  const id=x.eventId||x.id||'legacy-'+P.hash(x).slice(0,16);
  if(missing.length||!Number.isFinite(at)||at<now-86400000||at>now){
   legacy.set(id,{...x,id:x.id||id,legacyReason:missing.length?'历史字段不完整，不冒充本轮已分析新闻':!Number.isFinite(at)?'历史新闻缺精确发布时间':'不在本轮24小时窗口',missingFields:missing,retention:x.retention||{runId:previous?.runId||null,generatedAt:previous?.generatedAt||null,reason:'只保留原文和原来源供追溯；未重新采集或补写判断'}});
  }else active.set(id,{...x,retention:x.retention||{runId:previous.runId,generatedAt:previous.generatedAt,reason:'仍在24小时窗口内，沿用原文、分析及来源时点'}});
 }
 for(const [i,x]of incoming.entries()){
  const invalid=issues(x,catalog);if(invalid.length)throw Error('editorial.newsItems['+i+'] missing/invalid: '+invalid.join(', '));
  const id=x.eventId||x.id;if(newIds.has(id))throw Error('Duplicate editorial news event '+id);newIds.add(id);
  active.set(id,clone(x));legacy.delete(id);
 }
 const items=[...active.values()],regionCounts={CN:0,US:0,WORLD:0};
 for(const x of items)for(const region of arr(x.regions))regionCounts[region]++;
 const general=items.filter(x=>x.kind==='general').length,market=items.length-general;
 const externalVerified=items.filter(x=>evidenceClass(x,sourceMap)==='external').length;
 const marketDataOnly=items.filter(x=>evidenceClass(x,sourceMap)==='market-data').length;
 const declared=coverage&&typeof coverage==='object'&&!Array.isArray(coverage)?clone(coverage):{};
 const claimedComplete=declared.complete===true||declared.status==='complete';
 const complete=claimedComplete&&externalVerified>0&&Object.values(regionCounts).every(Boolean)&&items.length>=3;
 const scope=declared.scope||declared.note||text(coverage)||'本轮只收录已核验事件；沿用与待复核历史信息独立标注。';
 return {windowStart:new Date(now-86400000).toISOString(),windowEnd:new Date(now).toISOString(),items,legacyItems:[...legacy.values()].slice(-120),coverage:{...declared,scope,status:complete?'complete':declared.status==='complete'?'partial':declared.status||'partial',targetMin:18,verified:incoming.length,retained:[...active.keys()].filter(k=>!newIds.has(k)).length,active:items.length,legacy:legacy.size,general,market,externalVerified,marketDataOnly,regionCounts,claimedComplete,complete,claimIssue:claimedComplete&&!complete?'覆盖声明缺少可核验外部新闻或CN/US/WORLD实际事件，已降级为partial':null}};
}
module.exports={issues,evidenceClass,merge};
