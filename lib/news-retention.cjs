'use strict';
// Retain source-backed news without inventing the analysis missing from legacy records.
const P=require('./pipeline.cjs');
const arr=x=>Array.isArray(x)?x:[],text=x=>typeof x==='string'?x.trim():'',clone=x=>JSON.parse(JSON.stringify(x));
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
function merge(previous,incoming,{now=Date.now(),coverage,sources=[]}={}){
 if(!Array.isArray(incoming))throw Error('editorial.newsItems must be an array');
 const catalog=new Set(sources.filter(s=>s?.id&&/^https?:\/\//.test(s.url||'')).map(s=>s.id));
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
 return {windowStart:new Date(now-86400000).toISOString(),windowEnd:new Date(now).toISOString(),items:[...active.values()],legacyItems:[...legacy.values()].slice(-120),coverage:{scope:coverage||'本轮只收录已核验事件；沿用与待复核历史信息独立标注。',targetMin:18,verified:incoming.length,retained:[...active.keys()].filter(k=>!newIds.has(k)).length,legacy:legacy.size,complete:false}};
}
module.exports={issues,merge};
