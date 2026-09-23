'use strict';
/* Keep whole source observations. Never mix contracts, currencies, times or ranking baselines. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),W=require('../assets/watchlist-core.js');
const arr=W.arr,clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function usable(q,m){return q&&W.finite(q.price)&&W.time(q.asOf)!==null&&W.time(q.asOf)<=W.time(m.generatedAt)&&arr(q.sourceIds).length>0&&arr(q.sourceIds).every(id=>arr(m.sources).some(s=>s.id===id&&W.safeUrl(s.url)))&&!['missing','error','invalid','unknown'].includes(q.status)&&(!/^ENERGY:/.test(q.instrumentId)||/^\d{4}-\d{2}$/.test(q.contract||''));}
function carry(value,from,target,reason){
 const copy=clone(value),sourceMap=new Map(),needed=new Set();
 function find(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(find);return;}for(const [k,v]of Object.entries(x)){if(k==='sourceIds')arr(v).forEach(id=>needed.add(id));else if(k==='membershipSourceId'&&v)needed.add(v);else if(k!=='retention')find(v);}}
 find(copy);
 for(const s of arr(from.sources).filter(s=>needed.has(s.id))){const {id:oldId,...record}=s;const id='retained-'+hash(record).slice(0,24);sourceMap.set(oldId,id);if(!target.sources.some(x=>x.id===id))target.sources.push({...record,id});}
 function remap(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(remap);return;}for(const [k,v]of Object.entries(x)){if(k==='sourceIds')x[k]=arr(v).map(id=>sourceMap.get(id)||id);else if(k==='membershipSourceId'&&v)x[k]=sourceMap.get(v)||v;else if(k!=='retention')remap(v);}}
 remap(copy);
 copy.retention={fromRunId:from.runId,path:'data/runs/'+from.module+'/'+from.runId+'.json',asOf:copy.asOf??null,reason,retainedAt:target.generatedAt,originalStatus:copy.status||null,origin:copy.retention?.origin||{runId:from.runId,asOf:copy.asOf??null}};
 if(copy.instrumentId)copy.status='previous';
 return copy;
}
function merge(previous,incoming){
 let m=clone(incoming);if(!previous||previous.module!==m.module||W.time(previous.generatedAt)>W.time(m.generatedAt))return m;
 if((previous.dataMode==='synthetic')!==(m.dataMode==='synthetic'))throw Error('Retention cannot cross synthetic/production boundaries');
 let kept=0;
 if(m.module==='quotes'){
  const old=new Map(arr(previous.payload?.items).map(q=>[q.instrumentId,q])),next=new Map(arr(m.payload?.items).map(q=>[q.instrumentId,q]));
  for(const [id,q]of old){if(!usable(q,previous))continue;const n=next.get(id),valid=usable(n,m);
   if(n?.invalidatePrevious===true){if(!n.note||!arr(n.sourceIds).length)throw Error('撤回旧观测必须提供原因与来源 '+id);continue;}
   if(valid&&W.time(n.asOf)>W.time(q.asOf)){delete n.retention;delete n.latestAttempt;}
   if(!valid||W.time(n.asOf)<W.time(q.asOf)){
    const reason=n?.note||n?.missingReason||(!valid?'本轮未获得合格报价，保留历史记录及原数据时点':'本轮返回的来源时点早于已有记录');
    const saved=carry(q,previous,m,reason);saved.latestAttempt={at:m.generatedAt,status:n?.status||'missing',reason,displayValue:n?.displayValue||null};next.set(id,saved);kept++;
   }else if(W.time(n.asOf)===W.time(q.asOf)){
    if(n.price!==q.price||String(n.currency||'')!==String(q.currency||'')||String(n.contract||'')!==String(q.contract||''))throw Error('同一资产同一数据时点的数值/币种/合约冲突 '+id);
    // A new envelope is not evidence of a new observation, even when the input copies old values.
    if(!n.retention){next.set(id,carry(q,previous,m,'来源观测时点未变，沿用旧观测，不计作新行情'));kept++;}
   }
  }m.payload.items=[...next.values()];
 }
 if(['asia-equities','us-equities'].includes(m.module)){
  const key=g=>JSON.stringify([g.market,g.id]),groups=new Map(arr(m.payload.groups).map(g=>[key(g),g]));
  for(const g of arr(previous.payload?.groups)){
   const valid=arr(g.rows).some(q=>usable(q,previous));if(!valid)continue;
   const n=groups.get(key(g));
   if(!n||!arr(n.rows).some(q=>usable(q,m))){groups.set(key(g),carry(g,previous,m,'本轮未取得新证券样本，沿用整个历史样本及其原基准；不生成当前排名'));kept+=g.rows.length;}
   else {
    // Missing members are historical samples, not peers in the new ranking cohort.
    const ids=new Set(n.rows.map(q=>q.instrumentId)),rows=g.rows.filter(q=>usable(q,previous)&&!ids.has(q.instrumentId));
    if(rows.length){m.payload.retainedGroups=arr(m.payload.retainedGroups);m.payload.retainedGroups.push(carry({...g,rows},previous,m,'当前样本未覆盖这些证券；仅历史参考，不参与当前排名'));kept+=rows.length;}
   }
  }m.payload.groups=[...groups.values()];
  for(const k of ['verifiedSamples','observedThemes'])if(!arr(m.payload[k]).length&&arr(previous.payload?.[k]).length){m.payload[k]=arr(previous.payload[k]).map(x=>carry(x,previous,m,'历史样本沿用，未重新核验'));kept+=m.payload[k].length;}
 }
 if(kept){m.status='partial';m.retentionSummary={kept,policy:'last-known-observation-v1',note:'沿用数据保留原时点与来源，不能作为本轮新行情或当前排名'};}
 return m;
}
function restore(root,previous){
 if(!previous||!['quotes','asia-equities','us-equities'].includes(previous.module))return previous;
 const dir=path.join(root,'data/runs',previous.module),cut=W.time(previous.generatedAt);if(cut===null||!fs.existsSync(dir))return previous;
 const rows=fs.readdirSync(dir).filter(n=>/^[\w-]+\.json$/.test(n)).map(n=>{try{return JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));}catch{return null;}}).filter(m=>m&&m.module===previous.module&&(m.dataMode==='synthetic')===(previous.dataMode==='synthetic')&&m.execution?.mode!=='fixture'&&W.time(m.generatedAt)<cut&&!W.validate(m,m.module,cut).length).sort((a,b)=>W.time(a.generatedAt)-W.time(b.generatedAt)||a.runId.localeCompare(b.runId));
 let effective=null;
 for(const m of rows){try{effective=merge(effective,m);}catch{/* Conflicting old observations are not selected as evidence. */}}
 return merge(effective,previous);
}
module.exports={usable,carry,merge,restore};
