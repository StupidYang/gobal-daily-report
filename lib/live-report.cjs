'use strict';
// Code owns identities, quote units, input snapshots and citations. Editorial input owns analysis.
const path=require('node:path'),P=require('./pipeline.cjs'),R=require('./retention.cjs'),Q=require('../assets/content-contract.js'),N=require('./news-retention.cjs'),GROUPS=require('./batch.cjs').GROUPS;
const clone=x=>JSON.parse(JSON.stringify(x)),utc8=n=>new Date(n+28800000).toISOString().replace('Z','+08:00'),minute=n=>utc8(n).slice(0,16).replace('T',' ');
const sourceId=url=>'src-'+P.hash(url).slice(0,24);
function sourcesFrom(packet){return packet.requests.filter(x=>x.status===200).map(x=>({id:sourceId(x.url),name:x.id,short:x.id,url:x.url,retrievedAt:x.retrievedAt,checkedAt:x.retrievedAt,sourceHash:x.sha256})).filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);}
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
function compile(root,packet,editorial,options){
 const now=options.now??Date.now(),owned=GROUPS[options.taskGroup||'global-main'];if(!owned)throw Error('Unknown task group');
 const inputs=preparedInputs(root,packet,{...options,now}),{modules,config}=inputs;
 if(editorial.packetHash!==P.hash(packet))throw Error('Editorial analysis is not bound to the exact source packet');
 if(!Number.isFinite(Date.parse(editorial.analyzedAt))||Date.parse(editorial.analyzedAt)>now||Date.parse(editorial.analyzedAt)<Date.parse(packet.capturedAt))throw Error('Analysis timestamp must follow actual source collection');
 if(owned.length!==7){for(const role of P.W.MODULES.filter(x=>x!=='synthesis'&&!owned.includes(x))){const old=P.read(path.join(root,'data/modules',role+'.json'));if(!old)throw Error('Missing published regional dependency '+role);modules[role]=clone(old);}}
 const allSources=new Map(inputs.sourceCatalog.map(s=>[s.id,s]));for(const m of Object.values(modules))for(const s of m.sources)allSources.set(s.id,s);
 for(const d of packet.documents||[])allSources.set(sourceId(d.url),{id:sourceId(d.url),name:d.title||d.id,short:d.short||d.id,url:d.url,sourceHash:d.sourceHash,retrievedAt:d.retrievedAt});
 const previousNews=P.read(path.join(root,'data/modules/news.json'));for(const s of previousNews?.sources||[])if(!allSources.has(s.id))allSources.set(s.id,s);
 const permitted=new Set(allSources.keys());const docSource=url=>{const id=sourceId(url);if(!permitted.has(id))throw Error('Editorial references a document not retrieved in this execution: '+url);return id;};
 // External editorial documents use sourceUrls; only retrieved URLs become internal source IDs.
 function convert(x){if(Array.isArray(x))return x.map(convert);if(!x||typeof x!=='object')return x;const y={};for(const [k,v]of Object.entries(x))y[k==='sourceUrls'?'sourceIds':k]=k==='sourceUrls'?v.map(docSource):convert(v);return y;}
 const e=convert(editorial);e.report=Q.normalize(e.report);
 const newsroom=N.merge(previousNews,e.newsItems||[],{now,coverage:e.newsCoverage,sources:[...allSources.values()]});
 modules.news.sources=[...allSources.values()];modules.news.payload={newsroom,worldEvents:[]};
 modules.macro.sources=[...allSources.values()];modules.macro.payload={canonicalFacts:e.macroFacts||[],macroEvents:e.macroEvents||[],events:e.events||[]};
 const previousResearch=P.read(path.join(root,'data/modules/research.json')),newResearch=e.researchRecords||[],priorResearch=previousResearch?.payload?.records||[];
 const coveredResearch=new Set([...priorResearch,...newResearch].map(x=>x?.instrumentId).filter(Boolean));
 const explicitPending=Array.isArray(e.researchPendingQueue)?e.researchPendingQueue:[];
 modules.research.sources=[...allSources.values()];modules.research.payload={records:newResearch,checks:e.researchChecks||[],pendingQueue:explicitPending.length?explicitPending:Object.values(config.usPools).flat().filter(symbol=>!coveredResearch.has('EQUITY:US:'+symbol)).map(symbol=>({instrumentId:'EQUITY:US:'+symbol,reason:'尚无已发表公司研究记录；需要在新财报、指引、公告或证伪事件出现时补原文研究。'}))};
 if(options.taskGroup&&options.taskGroup!=='global-main')for(const role of ['macro','research'])modules[role]=P.read(path.join(root,'data/modules',role+'.json'));
 const facts=modules.quotes.payload.items.map(q=>({id:q.instrumentId,instrumentId:q.instrumentId,seriesKey:q.instrumentId,label:q.name,displayValue:q.price==null?(q.displayValue||'暂无合格报价'):String(q.price),rawValue:q.price??null,unit:q.currency,scope:q.provider||q.note||q.instrumentId,window:q.comparisonBasis||'unknown',asOf:q.asOf||null,verifiedAt:q.retrievedAt||null,dataStatus:q.price==null?'partial':q.retention?'previous':q.status,marketState:q.session||'provider-snapshot',comparisonBasis:q.comparisonBasis||'unknown',changePct:q.changePct??null,contract:q.contract||null,sourceIds:q.sourceIds||[],retention:q.retention||undefined,observationDate:q.observationDate||undefined}));
 const updatedAt=minute(now),reportId=updatedAt.replace(' ','-').replace(':','');
 const report={...e.report,schemaVersion:5,reportId,updatedAt,reportMeta:{generatedAt:utc8(now),analysisAsOf:e.analyzedAt,contractVersion:'reader-r2',pipelineVersion:'execution-lease-v1',dataMode:'production',validationOnly:options.validationOnly===true,edition:options.validationOnly?'真实来源验收快照 · 自动任务暂停':'每小时全球报告',status:'partial',sourcePacketHash:P.hash(packet),moduleRefs:Object.fromEntries(Object.entries(modules).map(([role,m])=>[role,{path:P.archivePath(m),runId:m.runId,generatedAt:m.generatedAt,dataAsOf:m.dataAsOf}]))},canonicalFacts:[...facts,...(modules.macro.payload.canonicalFacts||[])],sources:[...allSources.values()],period:{mode:'rolling-24h',from:minute(now-86400000),to:updatedAt,coverageHours:0,isFull24h:false,label:'来源复核快照，非完整24小时连续采样',gaps:[options.validationOnly?'本轮为隔离真实来源验证，没有伪造缺失时段的连续行情或新闻覆盖。':'本轮保存实际采样与原有历史版本；没有完整逐时原始输入时，不把报告跨度等同于连续行情覆盖。']},recentPeriod:{from:minute(Date.parse(packet.capturedAt)),to:updatedAt,label:'本轮实际采集与分析窗口'},newsroom:modules.news.payload.newsroom,news:modules.news.payload.newsroom.items||[],worldEvents:e.report.worldEvents||[],macroEvents:modules.macro.payload.macroEvents||[],events:modules.macro.payload.events||[]};
 for(const k of ['metrics','analysisTheses','judgmentRevisions','narrativeTriggers','changes','recentChanges','evolution24h'])report[k]=report[k]||[];
 const q=Q.quality(report),errors=[...q.errors,...P.validateReport(report)];if(errors.length)throw Error(errors.join('\n'));
 modules.synthesis={moduleVersion:1,module:'synthesis',runId:options.executionId+'-synthesis',generatedAt:utc8(now),dataAsOf:null,status:'partial',dataMode:'production',validationOnly:options.validationOnly===true,execution:{batchId:options.executionId,mode:'scheduled-batch',role:'synthesis'},sources:[],payload:{report}};
 const roles=owned;
 if(roles.length!==7){for(const role of P.W.MODULES.filter(x=>!roles.includes(x))){const old=P.read(path.join(root,'data/modules',role+'.json'));if(!old)throw Error('Regional report requires published '+role);report.reportMeta.moduleRefs[role]={path:P.archivePath(old),runId:old.runId,generatedAt:old.generatedAt,dataAsOf:old.dataAsOf};}}
 return {batchVersion:1,batchId:options.executionId,taskGroup:options.taskGroup||'global-main',execution:{executionId:options.executionId,generation:options.generation},modules:roles.map(role=>modules[role])};
}
module.exports={sourceId,sourcesFrom,preparedInputs,compile,minute,utc8};
