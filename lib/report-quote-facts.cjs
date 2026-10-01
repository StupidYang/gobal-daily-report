'use strict';
// Compile quote evidence from the report's bound module snapshots, never from prose.
const W=require('../assets/watchlist-core.js');
const list=x=>Array.isArray(x)?x:[];
function quoteFact(q){
 return {id:q.instrumentId,instrumentId:q.instrumentId,seriesKey:q.instrumentId,label:q.name||q.symbol||q.instrumentId,displayValue:q.price==null?(q.displayValue||'暂无合格报价'):String(q.price),rawValue:q.price??null,unit:q.currency,scope:q.provider||q.note||q.instrumentId,window:q.comparisonBasis||'unknown',asOf:q.asOf||null,verifiedAt:q.retrievedAt||null,dataStatus:q.price==null?'partial':q.retention?'previous':q.status,marketState:q.session||'provider-snapshot',comparisonBasis:q.comparisonBasis||'unknown',changePct:q.changePct??null,contract:q.contract||null,sourceIds:q.sourceIds||[],retention:q.retention||undefined,observationDate:q.observationDate||undefined};
}
function referencedFactIds(value,out=new Set()){
 if(Array.isArray(value)){value.forEach(x=>referencedFactIds(x,out));return out;}
 if(!value||typeof value!=='object')return out;
 for(const [key,v]of Object.entries(value)){
  if(key==='factId'&&typeof v==='string')out.add(v);
  if(['factIds','evidenceFactIds'].includes(key))for(const id of list(v))if(typeof id==='string')out.add(id);
  referencedFactIds(v,out);
 }
 return out;
}
function buildQuoteFacts(modules,references,now=Date.now()){
 const facts=list(modules.quotes?.payload?.items).map(quoteFact),known=new Set(facts.map(f=>f.id));
 const wanted=new Set([...referencedFactIds(references)].filter(id=>/^EQUITY:(CN|HK|US):/.test(id)&&!known.has(id)));
 const selected=new Map();
 for(const role of ['asia-equities','us-equities']){
  const m=modules[role];if(!m)continue;
  for(const g of [...list(m.payload?.groups),...list(m.payload?.retainedGroups)])for(const original of list(g?.rows)){
   if(!wanted.has(original?.instrumentId))continue;
   const q={...original,retention:original.retention||g.retention||undefined};
   const fail=reason=>{throw Error('Invalid referenced quote '+q.instrumentId+' in '+role+': '+reason);};
   const match=/^EQUITY:(CN|HK|US):([A-Za-z0-9.-]+)$/.exec(q.instrumentId);
   if(!match||match[1]!==g.market||(role==='us-equities'?g.market!=='US':!['CN','HK'].includes(g.market)))fail('instrument/market mismatch');
   if(m.module!==role||!m.runId)fail('missing module identity');
   const at=W.time(q.asOf),generated=W.time(m.generatedAt);
   if(at===null||generated===null||at>generated||generated>now)fail('invalid or future observation time');
   if(!W.finite(q.price)||q.price<=0||/[<>≥≤]|超过|至少|至多|区间|约/.test(String(q.displayValue||'')))fail('not an exact positive price');
   if(!q.currency||q.currency!==g.currency)fail('currency mismatch');
   if(q.changePct!=null&&!W.finite(q.changePct))fail('invalid changePct');
   if(q.status!=null&&!['live','complete','closed','delayed','snapshot','previous'].includes(q.status))fail('unusable quote status');
   const sources=new Map(list(m.sources).map(s=>[s?.id,s]));
   if(!list(q.sourceIds).length||q.sourceIds.some(id=>!sources.has(id)||!W.safeUrl(sources.get(id).url)))fail('missing source evidence');
   const old=selected.get(q.instrumentId);
   if(old&&W.time(old.quote.asOf)===at){
    // A single identity/time cannot point to two different prices or comparison bases.
    for(const key of ['price','currency','changePct','comparisonBasis','session','tradingDate','contract'])if((old.quote[key]??null)!==(q[key]??null))fail('conflicting same-time observation');
   }
   if(!old||at>W.time(old.quote.asOf))selected.set(q.instrumentId,{quote:q,module:m});
  }
 }
 for(const id of wanted){
  const chosen=selected.get(id);if(!chosen)throw Error('Referenced equity fact unavailable in frozen modules: '+id);
  const {quote:q,module:m}=chosen;
  facts.push({...quoteFact(q),valueType:'price',dataStatus:q.retention?'previous':q.status||'snapshot',observationRef:{module:m.module,runId:m.runId,instrumentId:id,asOf:q.asOf}});
 }
 return facts;
}
module.exports={quoteFact,referencedFactIds,buildQuoteFacts};
