'use strict';
// A shared compare-and-swap lease covers collection, analysis and publication.
// Publishing leases are never stolen by a timer: a stopped workflow must be reconciled first.
const crypto=require('node:crypto');
const GROUPS=new Set(['global-main','asia-session','us-session']);
const ACTIVE=new Set(['collecting','analyzing','awaiting-publication']);
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(x);
const ms=x=>typeof x==='string'?Date.parse(x):NaN;
const iso=x=>new Date(x).toISOString();
class Conflict extends Error { constructor(message='Lease compare-and-swap conflict'){super(message);this.code='CONFLICT';} }
class Busy extends Error { constructor(message='Another execution owns the lease'){super(message);this.code='BUSY';} }
function validate(s){if(!s||s.version!==1||!Number.isInteger(s.generation)||s.generation<0||!['idle','collecting','analyzing','awaiting-publication','publishing','completed','failed'].includes(s.phase))throw Error('Invalid execution state: fail closed');if(s.phase!=='idle'&&(!safe(s.executionId)||!GROUPS.has(s.taskGroup)||!Number.isFinite(ms(s.startedAt))||!Number.isFinite(ms(s.deadlineAt))||ms(s.deadlineAt)<=ms(s.startedAt)||!Array.isArray(s.stages)||!Array.isArray(s.recentSlots)||!Number.isFinite(ms(s.updatedAt))))throw Error('Invalid execution identity or deadline');return s;}
function idle(){return {version:1,generation:0,phase:'idle',recentSlots:[]};}
function slot(taskGroup,now){return taskGroup+':'+iso(now).slice(0,13);}
function acquire(previous,taskGroup,{now=Date.now(),budgetMs=20*60000,executionId=crypto.randomUUID()}={}){
 const s=validate(previous||idle());if(!GROUPS.has(taskGroup)||!safe(executionId)||budgetMs<100||budgetMs>30*60000)throw Error('Invalid acquisition parameters');
 if(s.phase==='publishing'||ACTIVE.has(s.phase)&&ms(s.deadlineAt)>now)throw new Busy();
 const window=slot(taskGroup,now),recent=(s.recentSlots||[]).filter(x=>ms(x.at)>now-72*3600000);
 if(recent.some(x=>x.slot===window&&x.status==='completed'))throw new Busy('This task hour is already completed');
 if(recent.filter(x=>x.slot===window).length>=2)throw new Busy('This task hour exhausted its two attempts');
 return {version:1,generation:s.generation+1,executionId,taskGroup,slot:window,phase:'collecting',startedAt:iso(now),deadlineAt:iso(now+budgetMs),updatedAt:iso(now),stages:[],recentSlots:[...recent,{slot:window,status:'started',at:iso(now),executionId}].slice(-144)};
}
function assertOwner(state,token,now=Date.now(),allowPublishing=false){const s=validate(state);if(s.executionId!==token.executionId||s.generation!==token.generation)throw new Conflict('Fenced: obsolete execution token');if(s.phase==='publishing'&&allowPublishing)return s;if(!ACTIVE.has(s.phase))throw new Conflict('Execution is terminal or not writable');if(now>=ms(s.deadlineAt))throw new Conflict('Execution deadline exceeded; late work cannot publish');return s;}
function transition(state,token,phase,extra={},now=Date.now()){
 const s=assertOwner(state,token,now,phase==='completed'||phase==='failed');
 const allowed={collecting:['analyzing','failed'],analyzing:['awaiting-publication','failed'], 'awaiting-publication':['publishing','failed'],publishing:['completed','failed']};
 if(!allowed[s.phase]?.includes(phase))throw Error('Illegal execution phase transition');
 if(phase==='awaiting-publication'&&(!safe(extra.batchId)||!/^[a-f0-9]{64}$/.test(extra.batchHash||'')))throw Error('A complete batch identity and hash are required');
 if(phase==='publishing'&&(!Number.isInteger(extra.workflowRunId)||extra.workflowRunId<=0))throw Error('A publishing workflow run identity is required');
 if(phase==='completed'&&(!/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(extra.reportId||'')||!/^[a-f0-9]{64}$/.test(extra.receiptHash||'')))throw Error('Completion requires report and receipt evidence');
 const last=ms(s.updatedAt),stages=[...s.stages,{phase:s.phase,startedAt:s.updatedAt,finishedAt:iso(now),durationMs:Math.max(0,now-last)}];
 const allowedExtra={};for(const key of ['batchId','batchHash','workflowRunId','reportId','receiptHash','reason','sourcePacketPath','sourcePacketHash'])if(extra[key]!==undefined)allowedExtra[key]=extra[key];
 const out={...s,...allowedExtra,phase,updatedAt:iso(now),stages};
 if(['completed','failed'].includes(phase)){out.finishedAt=iso(now);out.totalDurationMs=now-ms(s.startedAt);out.recentSlots=s.recentSlots.map(x=>x.executionId===s.executionId?{...x,status:phase}:x);}
 return out;
}
// Terminal cleanup may happen after the analysis deadline, but never grants publication.
function terminate(state,token,reason,now=Date.now()){
 const s=validate(state);if(s.executionId!==token.executionId||s.generation!==token.generation)throw new Conflict('Fenced: obsolete execution token');
 if(!['collecting','analyzing'].includes(s.phase))throw new Conflict('Cannot abort publishing or terminal execution');
 return {...s,phase:'failed',reason,updatedAt:iso(now),finishedAt:iso(now),totalDurationMs:Math.max(0,now-ms(s.startedAt)),stages:[...s.stages,{phase:s.phase,startedAt:s.updatedAt,finishedAt:iso(now),durationMs:Math.max(0,now-ms(s.updatedAt))}],recentSlots:s.recentSlots.map(x=>x.executionId===s.executionId?{...x,status:'failed'}:x)};
}
function rejectEditorial(state,token,reason,now=Date.now()){
 const s=assertOwner(state,token,now);if(s.phase!=='analyzing')throw new Conflict('Only analyzing permits a bounded editorial repair');
 const count=(s.submissionAttempts||0)+1;
 if(count>=2)return {...terminate(s,token,reason,now),submissionAttempts:count};
 return {...s,submissionAttempts:count,validationReason:reason,lastValidationAt:iso(now)};
}
function permit(state,batch,now=Date.now()){
 const t=batch?.execution;if(!t)throw new Conflict('Missing execution fencing token');const s=assertOwner(state,t,now,true);
 if(s.phase!=='publishing'||s.taskGroup!==batch.taskGroup||s.batchId!==batch.batchId||s.batchHash!==digest(batch))throw new Conflict('Publication permit does not match the exact batch');return {executionId:s.executionId,generation:s.generation,batchId:s.batchId,batchHash:s.batchHash,workflowRunId:s.workflowRunId};
}
function digest(x){return crypto.createHash('sha256').update(JSON.stringify(x,null,2)+'\n').digest('hex');}
class GitHubStore {
 constructor({repository='StupidYang/gobal-daily-report',branch='gdr-runtime',file='runtime/leases/production.json',token=process.env.GH_TOKEN,fetchImpl=globalThis.fetch}={}){if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!/^runtime\/leases\/[\w-]+\.json$/.test(file)||branch!=='gdr-runtime')throw Error('Invalid execution store scope');this.repository=repository;this.branch=branch;this.file=file;this.token=token;this.fetch=fetchImpl;}
 async request(method,url,body){if(!this.token)throw Error('Execution store needs an authorized GitHub token');const r=await this.fetch('https://api.github.com/repos/'+this.repository+url,{method,signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+this.token,Accept:'application/vnd.github+json','Content-Type':'application/json','Cache-Control':'no-cache'},body:body?JSON.stringify(body):undefined});if(r.status===404&&method==='GET')return null;if([409,422].includes(r.status))throw new Conflict();if(!r.ok)throw Error('Execution store HTTP '+r.status);return r.status===204?null:r.json();}
 async read(){const r=await this.request('GET','/contents/'+this.file+'?ref='+this.branch);return r?{sha:r.sha,state:validate(JSON.parse(Buffer.from(r.content,'base64').toString('utf8')))}:{sha:null,state:idle()};}
 async cas(snapshot,state){validate(state);const body={branch:this.branch,message:'runtime: '+state.phase+' '+(state.executionId||'idle'),content:Buffer.from(JSON.stringify(state,null,2)+'\n').toString('base64')};if(snapshot.sha)body.sha=snapshot.sha;const r=await this.request('PUT','/contents/'+this.file,body);return {sha:r.content.sha,state};}
}
async function begin(store,group,options){const snapshot=await store.read(),state=acquire(snapshot.state,group,options);try{return await store.cas(snapshot,state);}catch(e){if(e.code!=='CONFLICT'){
 // A timed-out write may have succeeded. Read back the unique execution ID once.
 const actual=await store.read();if(actual.state.executionId===state.executionId&&actual.state.generation===state.generation)return actual;
 }throw e;}}
async function advance(store,token,phase,extra,now){const snapshot=await store.read();return store.cas(snapshot,transition(snapshot.state,token,phase,extra,now));}
module.exports={Conflict,Busy,validate,idle,acquire,assertOwner,transition,permit,digest,GitHubStore,begin,advance,slot,terminate,rejectEditorial};
