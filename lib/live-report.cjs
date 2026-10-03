'use strict';
// Code owns identities, quote units, input snapshots and citations. Editorial input owns analysis.
const path=require('node:path'),P=require('./pipeline.cjs'),R=require('./retention.cjs'),Q=require('../assets/content-contract.js'),N=require('./news-retention.cjs'),GROUPS=require('./batch.cjs').GROUPS;
const clone=x=>JSON.parse(JSON.stringify(x)),utc8=n=>new Date(n+28800000).toISOString().replace('Z','+08:00'),minute=n=>utc8(n).slice(0,16).replace('T',' ');
const sourceId=url=>'src-'+P.hash(url).slice(0,24);
function sourcesFrom(packet){return packet.requests.filter(x=>x.status===200).map(x=>({id:sourceId(x.url),name:x.id,short:x.id,url:x.url,retrievedAt:x.retrievedAt,checkedAt:x.retrievedAt,sourceHash:x.sha256})).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);}
// A successful HTTP response alone is not usable evidence (parsing can still fail).
function currentEvidenceSources(packet){
 const receipts=packet.requests.filter(r=>r.status===200&&/^[a-f0-9]{64}$/i.test(r.sha256||'')&&Number.isFinite(Date.parse(r.retrievedAt)));
 const sources=new Map();
 for(const item of [...packet.rows,...(packet.documents||[])]){
  const document=Object.hasOwn(item,'url'),url=document?item.url:item.sourceUrl;
  if(document&&item.contentRetrieved!==true)continue;
  const receipt=receipts.find(r=>r.url===url&&r.sha256===item.sourceHash&&r.retrievedAt===item.retrievedAt);if(!receipt)continue;
  const source={id:sourceId(url),name:receipt.id,short:receipt.id,url,retrievedAt:receipt.retrievedAt,checkedAt:receipt.retrievedAt,sourceHash:receipt.sha256};
  sources.set(source.id,document?{id:source.id,name:item.title||item.id,short:item.short||item.id,url,sourceHash:item.sourceHash,retrievedAt:item.retrievedAt,evidenceKind:item.kind||'general'}:source);
 }
 return sources;
}
function preparePreviousNews(previous,allSources){
 if(!previous)return previous;
 const prepared=clone(previous),catalog=new Map((previous.sources||[]).map(s=>[s.id,s])),retained=new Map(),remapped=new Map();
 function remap(x){
  if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(remap);return;}
  for(const [key,value]of Object.entries(x))if(key==='sourceIds'&&Array.isArray(value))x[key]=value.map(oldId=>{
   if(remapped.has(oldId))return remapped.get(oldId);
   const source=catalog.get(oldId);
   // Missing historical receipts must not accidentally resolve against fresh same-URL evidence.
   if(!source)return String(oldId).startsWith('news-unresolved-')?oldId:'news-unresolved-'+P.hash(oldId).slice(0,24);
   const {id:ignored,...record}=source,id='news-retained-'+P.hash(record).slice(0,24),saved={...record,id};
   const existing=allSources.get(id);if(existing&&P.hash(existing)!==P.hash(saved))throw Error('News retained source ID collision');
   allSources.set(id,saved);retained.set(id,saved);remapped.set(oldId,id);return id;
  });else if(key!=='retention')remap(value);
 }
 // Only historical news bodies are remapped; unrelated prior catalogs are never imported.
 remap(prepared.payload?.newsroom?.items);remap(prepared.payload?.newsroom?.legacyItems);
 prepared.sources=[...retained.values()];return prepared;
}
function preparedInputs(root,packet,{executionId,generation,taskGroup='global-main',now=Date.now(),validationOnly=false}={}){
 if(!/^[\w-]{1,80}$/.test(executionId||'')||!Number.isInteger(generation)||generation<1)throw Error('Real report requires an execution identity');
 if(!packet||packet.version!==1||!Array.isArray(packet.rows)||!Number.isFinite(Date.parse(packet.completedAt))||Date.parse(packet.completedAt)>now+30000)throw Error('Invalid source packet');
 const config=P.read(path.join(root,'config/watchlist.json')),sourceCatalog=sourcesFrom(packet),known=new Set(sourceCatalog.map(x=>x.id));
 const sources=sourceCatalog,base=role=>({moduleVersion:1,module:role,runId:executionId+'-'+role,generatedAt:utc8(now),dataAsOf:null,status:'partial',dataMode:'production',validationOnly,execution:{batchId:executionId,mode:'scheduled-batch',role},payload:{},sources:clone(sources)});
 const rows=packet.rows.map(x=>{if(!known.has(sourceId(x.sourceUrl)))throw Error('Quote missing a retrieved source receipt');return {...x,sourceIds:[sourceId(x.sourceUrl)]};});
 const byId=new Map(rows.map(x=>[x.instrumentId,x])),modules={};
 const q=base('quotes');q.dataAsOf=rows.filter(x=>x.asOf).map(x=>x.asOf).sort().at(-1)||null;
 q.payload={items:config.required.map(c=>byId.get(c.id)?{...c,...byId.get(c.id)}:{...c,instrumentId:c.id,price:null,changePct:null,asOf:null,status:'missing',sourceIds:[],note:packet.errors.find(x=>x.instrumentId===c.id)?.error||'No verified observation in this run'}),collection:{startedAt:packet.capturedAt,completedAt:packet.completedAt,durationMs:packet.durationMs,errors:packet.errors}};
 modules.quotes=q;
 const us=base('us-equities');us.payload={groups:Object.entries(config.usPools).map(([id,symbols])=>{const sample=symbols.map(s=>byId.get('EQUITY:US:'+s)).filter(Boolean);return {id,name:id==='technology'?'科技候选池':'投资公司候选池',market:'US',classification:'configured-pool',universeScope:'sample',expectedCount:symbols.length,asOf:sample.map(x=>x.asOf).sort().at(-1)||null,currency:'USD',session:'regular',comparisonBasis:'provider-previous-close',tradingDate:sample[0]?.tradingDate||null,rows:sample};}),rankingInputGaps:{volumeRatio20d:'missing',turnoverPct:'missing',avgDailyValue20d:'missing',heatRankingGenerated:false,weakRankingGenerated:false,note:'基础报价与排名输入分离；没有全量成员及同基准成交数据，不生成全市场热度榜。'}};modules['us-equities']=us;
 const asia=base('asia-equities');asia.payload={groups:['CN','HK'].flatMap(market=>config.sectors[market].names.map(name=>({id:name,name,market,classification:config.sectors[market].classification,universeScope:'sample',expectedCount:null,asOf:null,currency:market==='CN'?'CNY':'HKD',comparisonBasis:'unavailable',rows:[],note:'只实采宽基指数，未取得此行业完整成员、个股同基准量价输入；不是零只股票。'}))),coverage:{note:'31个A股行业及12个港股行业是覆盖清单，不是假造的全行业排名。'}};modules['asia-equities']=asia;
 for(const role of ['news','macro','research'])modules[role]=base(role);
 // Reusing historical samples is explicit and never re-dates their market observations.
 for(const role of ['quotes','asia-equities','us-equities']){const prev=P.read(path.join(root,'data/modules',role+'.json'));if(prev){const recovered=R.restore(root,prev);const older=recovered;modules[role]=R.merge(older,modules[role]);}}
 return {modules,config,sourceCatalog,execution:{executionId,generation},taskGroup,packetHash:P.hash(packet)};
}
function snapshotPeriod(root,now,validationOnly=false){
 const index=P.read(path.join(root,'data/history-index.json'),{reports:[]}),start=now-86400000,times=[now];
 for(const row of Array.isArray(index?.reports)?index.reports:[]){const t=P.W.time(row?.label);if(t!==null&&t>=start&&t<=now)times.push(t);}
 const unique=[...new Set(times)].sort((a,b)=>a-b),first=unique[0]??now,span=Math.max(0,Math.min(24,(now-first)/3600000));
 return {mode:'rolling-24h',coverageMode:'snapshot-span',from:minute(start),to:minute(now),coverageHours:span,coverageSpanHours:span,snapshotCount:unique.length,firstSnapshotAt:minute(first),lastSnapshotAt:minute(now),isFull24h:false,label:validationOnly?'隔离真实来源快照跨度，非连续24小时行情':'滚动24小时内已发布/当前快照跨度，非连续采样',gaps:[validationOnly?'本轮为隔离真实来源验证，没有伪造缺失时段的连续行情或新闻覆盖。':'快照之间没有持续采集；跨度只表示最早与最新已发布报告之间的时间，不代表中间每小时都有行情。']};
}
function prepareMacro(previous,input={},now=Date.now()){
 const lanes={canonicalFacts:'macroFacts',macroEvents:'macroEvents',events:'events',fundingNotes:'macroFundingNotes'};
 const reason='本轮未取得该类新的合格宏观/资金证据，保留24小时内来源支持的旧项目，所有原时点保持不变。';
 const payload={laneRetention:{}},origins=[];
 const fallback=previous?.retention||{runId:previous?.runId,generatedAt:previous?.generatedAt,dataAsOf:previous?.dataAsOf??null,reason};
 const selected=input.retainedMacroFactIds;
 if(selected!==undefined&&(!Array.isArray(selected)||selected.some(id=>typeof id!=='string'||!id.trim())))throw Error('retainedMacroFactIds must be an array of nonempty fact IDs');
 let hasNew=false;
 for(const [key,inputKey]of Object.entries(lanes)){
  const incoming=input[inputKey];
  if(key==='canonicalFacts'&&selected!==undefined){
   payload[key]=Array.isArray(incoming)?clone(incoming):[];hasNew=hasNew||payload[key].length>0;
   payload.retainedFactIds=[];
   const freshIds=new Set(payload[key].map(item=>item?.id)),prior=Array.isArray(previous?.payload?.[key])?previous.payload[key]:[];
   for(const id of new Set(selected)){
    const matches=prior.filter(item=>item?.id===id);
    if(matches.length!==1)throw Error('Selected retained macro fact is unknown or ambiguous: '+id);
    if(freshIds.has(id))continue;
    const item=matches[0],origin=item.retention||previous?.payload?.laneRetention?.[key]||fallback;
    const at=P.W.time(origin.generatedAt),age=at===null?Infinity:now-at;
    if(age<0||age>24*3600000)throw Error('Selected retained macro fact has an expired or invalid retention anchor: '+id);
    payload[key].push({...clone(item),retention:clone(origin)});payload.retainedFactIds.push(id);origins.push(origin);
   }
   continue;
  }
  // A checked-empty calendar replaces the radar. Empty evidence lanes are not new evidence.
  if(Array.isArray(incoming)&&(incoming.length||key==='events')){
   payload[key]=clone(incoming);hasNew=hasNew||incoming.length>0;continue;
  }
  const laneOrigin=previous?.payload?.laneRetention?.[key]||fallback;
  payload[key]=[];
  for(const item of Array.isArray(previous?.payload?.[key])?previous.payload[key]:[]){
   // A fresh radar or wrapper must never renew an older item's retention clock.
   const origin=item?.retention||laneOrigin,at=P.W.time(origin.generatedAt),age=at===null?Infinity:now-at;
   const eventAt=key==='events'?P.W.time(item?.at??item?.eventAt):null;
   if(age<0||age>24*3600000||(eventAt!==null&&eventAt<=now))continue;
   payload[key].push(item&&typeof item==='object'?{...clone(item),retention:clone(origin)}:item);
   origins.push(origin);
  }
  // Strings (legacy funding notes) cannot carry item metadata, so also preserve a lane anchor.
  if(payload[key].length)payload.laneRetention[key]=clone(laneOrigin);
 }
 const retainedLanes=[...new Set([...Object.keys(payload.laneRetention),...(payload.retainedFactIds?.length?['canonicalFacts']:[])])],retained=retainedLanes.length>0;
 const originKeys=new Set(origins.map(x=>JSON.stringify([x.runId,x.generatedAt,x.dataAsOf??null])));
 const retention=!hasNew&&originKeys.size===1?clone(origins[0]):null;
 payload.coverage=clone(input.macroCoverage||(retained?previous?.payload?.coverage:null)||{status:'partial',note:hasNew?'本轮宏观/资金内容仅包含已提交的来源支持项目。':'本轮没有新的合格宏观/资金证据，且上一模块超过24小时保留窗口。'});
 if(retained){
  const runIds=[...new Set(origins.map(x=>x.runId))];
  payload.coverage={...payload.coverage,status:'partial',retained:true,retainedLanes,note:[...new Set([...(payload.coverage.note||'').split('；'),reason].filter(Boolean))].join('；')};
  if(runIds.length===1)payload.coverage.retainedFrom=runIds[0];else delete payload.coverage.retainedFrom;
 }
 return {status:!hasNew&&retained?'no-change':'partial',dataAsOf:retention?.dataAsOf??null,payload,retention,retainedSources:retained?clone(previous.sources||[]):[]};
}
function mergeRetainedMacroSources(prepared,allSources){
 const previous=new Map(prepared.retainedSources.map(s=>[s.id,s])),remapped=new Map();
 function remap(value){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(remap);return;}
  for(const [key,child]of Object.entries(value)){
   if(key==='sourceIds'&&Array.isArray(child))value[key]=child.map(oldId=>{
    if(remapped.has(oldId))return remapped.get(oldId);
    const source=previous.get(oldId);if(!source)throw Error('Retained macro evidence is missing source '+oldId);
    // Excluding the ID keeps the archive identity stable through repeated hourly retention.
    const {id:ignored,...record}=source,id='macro-retained-'+P.hash(record).slice(0,24),saved={...record,id};
    const existing=allSources.get(id);if(existing&&P.hash(existing)!==P.hash(saved))throw Error('Macro retained source ID collision');
    if(!existing)allSources.set(id,saved);remapped.set(oldId,id);return id;
   });
   else if(key!=='retention')remap(child);
  }
 }
 // Only these lanes came from the old module; new editorial references keep current IDs.
 for(const lane of Object.keys(prepared.payload.laneRetention))remap(prepared.payload[lane]);
 // Selected historical facts can share a lane and URL with fresh facts. Never remap the fresh ones.
 if(!Object.hasOwn(prepared.payload.laneRetention,'canonicalFacts')){
  const selected=new Set(prepared.payload.retainedFactIds||[]);
  for(const fact of prepared.payload.canonicalFacts||[])if(selected.has(fact.id))remap(fact);
 }
}
function assertEventRadar(editorial,taskGroup='global-main'){
 if(taskGroup!=='global-main')return;
 const events=Array.isArray(editorial?.events)?editorial.events:[],reason=String(editorial?.report?.sectionGaps?.events?.reason||'').trim();
 if(!events.length&&!reason)throw Error('events缺失：global-main必须提交未来12–24小时官方事件雷达，或在sectionGaps.events.reason说明已核验的日历范围与空缺原因');
}
function compile(root,packet,editorial,options){
 const now=options.now??Date.now(),owned=GROUPS[options.taskGroup||'global-main'];if(!owned)throw Error('Unknown task group');
 const inputs=preparedInputs(root,packet,{...options,now}),{modules,config}=inputs;
 if(editorial.packetHash!==P.hash(packet))throw Error('Editorial analysis is not bound to the exact source packet');
 if(!Number.isFinite(Date.parse(editorial.analyzedAt))||Date.parse(editorial.analyzedAt)>now||Date.parse(editorial.analyzedAt)<Date.parse(packet.capturedAt))throw Error('Analysis timestamp must follow actual source collection');
 if(owned.length!==7){for(const role of P.W.MODULES.filter(x=>x!=='synthesis'&&!owned.includes(x))){const old=P.read(path.join(root,'data/modules',role+'.json'));if(!old)throw Error('Missing published regional dependency '+role);modules[role]=clone(old);}}
 const allSources=new Map(inputs.sourceCatalog.map(s=>[s.id,s]));for(const m of Object.values(modules))for(const s of m.sources)allSources.set(s.id,s);
 for(const d of packet.documents||[])allSources.set(sourceId(d.url),{id:sourceId(d.url),name:d.title||d.id,short:d.short||d.id,url:d.url,sourceHash:d.sourceHash,retrievedAt:d.retrievedAt,evidenceKind:d.kind||'general'});
 const currentSources=currentEvidenceSources(packet);for(const [id,source]of currentSources)allSources.set(id,source);
 const previousNews=preparePreviousNews(P.read(path.join(root,'data/modules/news.json')),allSources);
 const permitted=new Set(currentSources.keys());const docSource=url=>{const id=sourceId(url);if(!permitted.has(id))throw Error('Editorial references a document not retrieved in this execution: '+url);return id;};
 // External editorial documents use sourceUrls; only retrieved URLs become internal source IDs.
 function convert(x){if(Array.isArray(x))return x.map(convert);if(!x||typeof x!=='object')return x;const y={};for(const [k,v]of Object.entries(x))y[k==='sourceUrls'?'sourceIds':k]=k==='sourceUrls'?v.map(docSource):convert(v);return y;}
 const e=convert(editorial);e.report=Q.normalize(e.report);
 assertEventRadar(e,options.taskGroup||'global-main');
 const newsroom=N.merge(previousNews,e.newsItems||[],{now,coverage:e.newsCoverage,sources:[...allSources.values()]});
 modules.news.sources=[...allSources.values()];modules.news.payload={newsroom,worldEvents:[]};
 const previousMacro=P.read(path.join(root,'data/modules/macro.json')),macroPrepared=prepareMacro(previousMacro,e,now);
 mergeRetainedMacroSources(macroPrepared,allSources);
 modules.macro.sources=[...allSources.values()];modules.macro.payload=macroPrepared.payload;modules.macro.dataAsOf=macroPrepared.dataAsOf;modules.macro.status=macroPrepared.status;
 if(macroPrepared.retention)modules.macro.retention=macroPrepared.retention;
 const previousResearch=P.read(path.join(root,'data/modules/research.json')),newResearch=e.researchRecords||[],priorResearch=previousResearch?.payload?.records||[];
 const coveredResearch=new Set([...priorResearch,...newResearch].map(x=>x?.instrumentId).filter(Boolean));
 const explicitPending=Array.isArray(e.researchPendingQueue)?e.researchPendingQueue:[];
 modules.research.sources=[...allSources.values()];modules.research.payload={records:newResearch,checks:e.researchChecks||[],pendingQueue:explicitPending.length?explicitPending:Object.values(config.usPools).flat().filter(symbol=>!coveredResearch.has('EQUITY:US:'+symbol)).map(symbol=>({instrumentId:'EQUITY:US:'+symbol,reason:'尚无已发表公司研究记录；需要在新财报、指引、公告或证伪事件出现时补原文研究。'}))};
 if(options.taskGroup&&options.taskGroup!=='global-main')for(const role of ['macro','research'])modules[role]=P.read(path.join(root,'data/modules',role+'.json'));
 const facts=require('./report-quote-facts.cjs').buildQuoteFacts(modules,[e.report,modules.news.payload,modules.macro.payload],now);
 const updatedAt=minute(now),reportId=updatedAt.replace(' ','-').replace(':','');
 const report={...e.report,schemaVersion:5,reportId,updatedAt,reportMeta:{generatedAt:utc8(now),analysisAsOf:e.analyzedAt,contractVersion:'reader-r2',pipelineVersion:'execution-lease-v1',dataMode:'production',validationOnly:options.validationOnly===true,edition:options.validationOnly?'真实来源验收快照 · 自动任务暂停':'每小时全球报告',status:'partial',sourcePacketHash:P.hash(packet),moduleRefs:Object.fromEntries(Object.entries(modules).map(([role,m])=>[role,{path:P.archivePath(m),runId:m.runId,generatedAt:m.generatedAt,dataAsOf:m.dataAsOf}]))},canonicalFacts:[...facts,...(modules.macro.payload.canonicalFacts||[])],sources:[...allSources.values()],period:snapshotPeriod(root,now,options.validationOnly===true),recentPeriod:{from:minute(Date.parse(packet.capturedAt)),to:updatedAt,label:'本轮实际采集与分析窗口'},newsroom:modules.news.payload.newsroom,news:modules.news.payload.newsroom.items||[],worldEvents:e.report.worldEvents||[],macroEvents:modules.macro.payload.macroEvents||[],events:modules.macro.payload.events||[]};
 for(const k of ['metrics','analysisTheses','judgmentRevisions','narrativeTriggers','changes','recentChanges','evolution24h'])report[k]=report[k]||[];
 const q=Q.quality(report),errors=[...q.errors,...P.validateReport(report)];if(errors.length)throw Error(errors.join('\n'));
 modules.synthesis={moduleVersion:1,module:'synthesis',runId:options.executionId+'-synthesis',generatedAt:utc8(now),dataAsOf:null,status:'partial',dataMode:'production',validationOnly:options.validationOnly===true,execution:{batchId:options.executionId,mode:'scheduled-batch',role:'synthesis'},sources:[],payload:{report}};
 const roles=owned;
 if(roles.length!==7){for(const role of P.W.MODULES.filter(x=>!roles.includes(x))){const old=P.read(path.join(root,'data/modules',role+'.json'));if(!old)throw Error('Regional report requires published '+role);report.reportMeta.moduleRefs[role]={path:P.archivePath(old),runId:old.runId,generatedAt:old.generatedAt,dataAsOf:old.dataAsOf};}}
 return {batchVersion:1,batchId:options.executionId,taskGroup:options.taskGroup||'global-main',execution:{executionId:options.executionId,generation:options.generation},modules:roles.map(role=>modules[role])};
}
module.exports={sourceId,sourcesFrom,currentEvidenceSources,preparePreviousNews,preparedInputs,snapshotPeriod,prepareMacro,assertEventRadar,compile,minute,utc8};
