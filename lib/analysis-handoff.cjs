'use strict';
// Compact, code-generated evidence inventory. No new prices, analysis or source claims.
const E=require('./execution.cjs');
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(x,k)).map(k=>[k,x[k]]));
function handoff(result,now=Date.now()){
 if(!result?.packet||E.digest(result.packet)!==result.packetHash||result.execution?.executionId!==result.requestId||!Number.isFinite(now)||!Number.isFinite(Date.parse(result.deadlineAt)))throw Error('Invalid handoff identity or packet');
 const packet=result.packet,keys=['instrumentId','price','displayValue','changePct','asOf','tradingDate','currency','unit','session','status','dataStatus','contractMonth','contractSymbol','sourceUrl','sourceHash','retrievedAt'];
 return {version:1,requestId:result.requestId,taskGroup:result.taskGroup,execution:{...result.execution},packetHash:result.packetHash,deadlineAt:result.deadlineAt,generatedAt:new Date(now).toISOString(),nextAction:'READ_EVIDENCE_AND_SUBMIT',submissionPath:'runtime/submissions/'+result.requestId+'.json',resultPath:'runtime/results/'+result.requestId+'.json',editorialContract:result.editorialContract,scope:'Code-derived inventory only. Read source documents before analysis. HTTP success does not prove full-text review. Raw packet and publisher checks remain authoritative.',observations:(packet.rows||[]).map(x=>pick(x,keys)),documents:(packet.documents||[]).map(x=>pick(x,['id','url','title','kind','sourceHash','retrievedAt','contentRetrieved'])),errors:packet.errors||[],blockedDocuments:packet.blockedDocuments||[]};
}
module.exports={handoff};
