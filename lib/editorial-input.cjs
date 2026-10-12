'use strict';

// Pure, collecting validation of new editorial input. No defaults, repairs, or writes.
const P=require('./pipeline.cjs'),W=require('../assets/watchlist-core.js'),Q=require('../assets/content-contract.js');
const {EditorialValidationError}=require('./editorial-errors.cjs');
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'?x.trim():'';
const first=(...xs)=>xs.map(text).find(Boolean)||'';
const markets=['A股','港股','美股','BTC','黄金','原油'];
const own=(x,k)=>Object.hasOwn(x,k);
const field=(p,k)=>/^[A-Za-z_$][\w$]*$/.test(k)?p+'.'+k:p+'['+JSON.stringify(k)+']';
const sourceId=url=>'src-'+P.hash(url).slice(0,24);

// Shared with live-report: only a successfully parsed item and its exact HTTP receipt count.
function currentEvidenceSources(packet) {
  const receipts=packet.requests.filter(r=>r.status===200&&/^[a-f0-9]{64}$/i.test(r.sha256||'')&&Number.isFinite(Date.parse(r.retrievedAt)));
  const sources=new Map();
  for(const item of [...packet.rows,...(packet.documents||[])]) {
    const document=own(item,'url'),url=document?item.url:item.sourceUrl;
    if(document&&item.contentRetrieved!==true)continue;
    const receipt=receipts.find(r=>r.url===url&&r.sha256===item.sourceHash&&r.retrievedAt===item.retrievedAt);
    if(!receipt)continue;
    const source={id:sourceId(url),name:receipt.id,short:receipt.id,url,retrievedAt:receipt.retrievedAt,checkedAt:receipt.retrievedAt,sourceHash:receipt.sha256};
    sources.set(source.id,document?{id:source.id,name:item.title||item.id,short:item.short||item.id,url,sourceHash:item.sourceHash,retrievedAt:item.retrievedAt,evidenceKind:item.kind||'general'}:source);
  }
  return sources;
}

function validateEditorialInput(editorial,{packet,now=Date.now(),taskGroup='global-main',evidenceSources}={}) {
  const issues=[];
  const add=(path,code,message)=>issues.push({path,code,message});
  const isObject=(x,p)=>{if(!object(x)){add(p,'type','必须是对象');return false;}return true;};
  const isArray=(x,p)=>{if(!Array.isArray(x)){add(p,'type','必须是数组');return false;}return true;};
  const requiredText=(x,k,p)=>{if(!text(x[k]))add(field(p,k),'required','必须是非空字符串');};
  const precise=(value,p)=>{
    if(typeof value!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(value)||W.time(value)===null){add(p,'timestamp','必须是带明确时区的有效精确时间');return null;}
    const at=W.time(value);if(at>now+300000)add(p,'future-time','时间不能位于未来');return at;
  };
  const objectArray=(x,k,p,{required=false}={})=>{
    if(!own(x,k)&&!required)return [];
    const at=field(p,k);if(!isArray(x[k],at))return [];
    return x[k].flatMap((v,i)=>isObject(v,at+'['+i+']')?[[v,at+'['+i+']']]:[]);
  };
  if(!isObject(editorial,'editorial'))return issues;
  const e=editorial;
  if(!/^[a-f0-9]{64}$/i.test(e.packetHash||''))add('editorial.packetHash','packet-hash','必须是本轮packet的SHA-256');
  else if(packet&&e.packetHash!==P.hash(packet))add('editorial.packetHash','packet-mismatch','分析必须绑定本轮不可变packet');
  const analyzed=precise(e.analyzedAt,'editorial.analyzedAt');
  if(analyzed!==null&&(analyzed>now||packet&&analyzed<Date.parse(packet.capturedAt)))add('editorial.analyzedAt','analysis-time','分析结束时点必须在实际采集开始之后且不晚于当前时间');
  const sources=evidenceSources||(packet?currentEvidenceSources(packet):null);
  const byUrl=sources?new Map([...sources.values()].map(x=>[x.url,x])):null;

  // Walk every section, even if another section is malformed. Do not fail on the first URL.
  function references(x,p) {
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){x.forEach((v,i)=>references(v,p+'['+i+']'));return;}
    for(const [k,v]of Object.entries(x)) {
      const at=field(p,k);
      if(v===undefined)continue; // Not a JSON field; retain existing in-process caller compatibility.
      if(k==='sourceUrls') {
        if(!isArray(v,at))continue;
        v.forEach((url,i)=>{
          const location=at+'['+i+']';
          if(typeof url!=='string'||!W.safeUrl(url))add(location,'source-url','必须是有效的http(s)来源URL');
          else if(byUrl&&!byUrl.has(url))add(location,'source-not-retrieved','Editorial references a document not retrieved in this execution（未找到成功解析且回执匹配的证据）: '+url);
        });
      } else if(['sourceIds','factIds','evidenceFactIds'].includes(k)) {
        if(isArray(v,at))v.forEach((id,i)=>{
          if(!text(id))add(at+'['+i+']','type','引用ID必须是非空字符串');
          else if(k==='sourceIds'&&sources&&!sources.has(id))add(at+'['+i+']','source-not-retrieved','手写sourceIds不能引用本轮未取得的来源；外部引用应使用sourceUrls');
        });
      } else {
        if(['price','changePct','rawValue','volumeRatio20d','turnoverPct','valueTraded','avgDailyValue20d'].includes(k)&&v!==null&&!W.finite(v))add(at,'numeric-type','必须为有限数字或null，文字缺口不能冒充观测数值');
        if(['rawValue','price'].includes(k)&&W.finite(v)&&/[<>≥≤]/.test(String(x.displayValue||'')))add(at,'threshold-value','阈值文字不能当精确数值');
        if(k==='asOf'&&v!==null){const time=W.time(v);if(time===null)add(at,'timestamp','asOf必须为有效精确时点或null');else if(time>now+300000)add(at,'future-time','asOf不能在未来');}
        if(k==='factId'&&v!==null&&!text(v))add(at,'type','事实引用ID必须是非空字符串或null');
        references(v,at);
      }
    }
  }
  references(e,'editorial');
  const needsSources=(x,p)=>{if(!Array.isArray(x.sourceUrls)||!x.sourceUrls.length)add(p+'.sourceUrls','required','必须提供本轮实际取得的具体sourceUrls');};
  const sourceTimeText=(x,p)=>{for(const k of ['publishedAt','eventAt','sourceDateText','dateUncertainty'])if(own(x,k)&&x[k]!==null&&typeof x[k]!=='string')add(field(p,k),'type','必须是原始时间文本或null，不能猜造时间');};
  const newsIds=new Set();
  for(const [x,p]of objectArray(e,'newsItems','editorial')) {
    const id=first(x.eventId,x.id);
    if(!id)add(p+'.eventId','required','必须提供稳定eventId（历史别名id亦可）');
    if(id){if(newsIds.has(id))add(p+'.eventId','duplicate','同轮新闻事件ID不能重复');newsIds.add(id);}
    if(!Array.isArray(x.regions)||!x.regions.length||x.regions.some(r=>!['CN','US','WORLD'].includes(r)))add(p+'.regions','enum','必须是CN/US/WORLD组成的非空数组');
    if(!['general','market'].includes(x.kind))add(p+'.kind','enum','新闻kind仅允许general或market；采集文档的official/research/calendar不是新闻分类');
    for(const k of ['title','summary','plainImpact','assessment'])requiredText(x,k,p);
    needsSources(x,p);sourceTimeText(x,p);
  }
  if(own(e,'newsCoverage')&&typeof e.newsCoverage!=='string')isObject(e.newsCoverage,'editorial.newsCoverage');
  if(own(e,'macroCoverage'))isObject(e.macroCoverage,'editorial.macroCoverage');
  for(const message of Q.editorialScope.errors(e)){
    const split=message.indexOf('：');
    add(split<0?'editorial':'editorial.'+message.slice(0,split),'editorial-scope-v1',split<0?message:message.slice(split+1));
  }

  function companyIdentity(x,p){
    requiredText(x,'instrumentId',p);
    if(text(x.instrumentId)&&!/^EQUITY:(?:US|CN|HK):[^\s:]+$/.test(x.instrumentId))add(p+'.instrumentId','company-identity','公司研究必须使用真实EQUITY:US/CN/HK证券身份；宏观活动不是公司');
  }
  function onlyEventPages(x) {
    const urls=text(x.documentUrl)?[x.documentUrl]:Array.isArray(x.sourceUrls)?x.sourceUrls:[];
    if(x.status==='source-read-event-page')return true;
    return urls.length>0&&urls.every(url=>{
      if(byUrl?.get(url)?.evidenceKind==='calendar')return true;
      if(typeof url!=='string'||!W.safeUrl(url))return false;
      const u=new URL(url);return u.hostname==='www.imf.org'&&/^\/en\/meetings\/.*\/schedule(?:\/|$)/.test(u.pathname);
    });
  }
  const recordIds=new Set();
  for(const [x,p]of objectArray(e,'researchRecords','editorial')) {
    companyIdentity(x,p);
    for(const k of ['eventKey','eventType','documentId','documentUrl'])requiredText(x,k,p);
    if(text(x.documentUrl)&&!W.safeUrl(x.documentUrl))add(p+'.documentUrl','source-url','研究原文documentUrl必须是有效http(s) URL');
    if(text(x.documentUrl)&&byUrl&&!byUrl.has(x.documentUrl))add(p+'.documentUrl','source-not-retrieved','研究原文未在本轮实际成功证据中取得');
    if(text(x.documentUrl)&&Array.isArray(x.sourceUrls)&&!x.sourceUrls.includes(x.documentUrl))add(p+'.sourceUrls','primary-source-missing','sourceUrls必须包含本条研究的documentUrl');
    if(!own(x,'period')||x.period!==null&&!text(x.period))add(p+'.period','required','必须提供真实报告期字符串；不适用时显式null，不能虚构报告期');
    if(!own(x,'publishedAt')||x.publishedAt!==null&&!text(x.publishedAt))add(p+'.publishedAt','required','必须保留来源发布日期文本；未知时显式null');
    precise(x.analyzedAt,p+'.analyzedAt');
    if(isObject(x.analysis,p+'.analysis'))requiredText(x.analysis,'conclusion',p+'.analysis');
    else add(p+'.analysis.conclusion','required','必须提供依据实际原文形成的结论，不能用活动摘要自动补出');
    needsSources(x,p);
    if(own(x,'sourceHash')&&x.sourceHash!==null&&!/^[a-f0-9]{64}$/i.test(x.sourceHash))add(p+'.sourceHash','source-hash','sourceHash只能是真实SHA-256或null');
    if(text(x.sourceHash)&&byUrl?.get(x.documentUrl)&&x.sourceHash!==byUrl.get(x.documentUrl).sourceHash)add(p+'.sourceHash','source-hash-mismatch','sourceHash与本轮原文回执不一致');
    if(onlyEventPages(x))add(p,'research-document-kind','仅阅读宏观日历或活动介绍不能提交为已完成的公司原文研究；不得补造证券身份、分析时间或结论');
    if(text(x.instrumentId)&&text(x.eventKey)){const key=x.instrumentId+'|'+x.eventKey;if(recordIds.has(key))add(p+'.eventKey','duplicate','同一公司事件不能在本轮重复提交');recordIds.add(key);}
  }
  const checkIds=new Set();
  for(const [x,p]of objectArray(e,'researchChecks','editorial')) {
    companyIdentity(x,p);precise(x.checkedAt,p+'.checkedAt');
    if(!first(x.status,x.result))add(p+'.status','required','必须提供非空status或result');
    if(!first(x.note,x.reason,x.explanation))add(p+'.note','required','必须说明本轮实际检查结果和范围');
    if(onlyEventPages(x))add(p,'research-check-kind','宏观活动页核验不能作为公司披露检查');
    if(first(x.status,x.result)==='no-new-material')needsSources(x,p);
    if(text(x.instrumentId)&&text(x.checkedAt)){const key=[x.instrumentId,x.checkedAt,x.eventKey||'',x.status||x.result||'',x.documentId||''].join('|');if(checkIds.has(key))add(p,'duplicate','研究检查身份重复，会覆盖同轮检查记录');checkIds.add(key);}
  }
  for(const [x,p]of objectArray(e,'researchPendingQueue','editorial')){companyIdentity(x,p);requiredText(x,'reason',p);}
  const macroIds=new Set();
  for(const [x,p]of objectArray(e,'macroFacts','editorial')){
    requiredText(x,'id',p);
    if(text(x.id)){if(macroIds.has(x.id))add(p+'.id','duplicate','宏观事实ID不能重复');macroIds.add(x.id);}
  }
  for(const k of ['macroEvents','events'])objectArray(e,k,'editorial');
  if(own(e,'macroFundingNotes')&&isArray(e.macroFundingNotes,'editorial.macroFundingNotes'))e.macroFundingNotes.forEach((x,i)=>{if(typeof x!=='string'&&!object(x))add('editorial.macroFundingNotes['+i+']','type','资金说明必须是文本或对象');});
  if(own(e,'retainedMacroFactIds')&&isArray(e.retainedMacroFactIds,'editorial.retainedMacroFactIds'))e.retainedMacroFactIds.forEach((x,i)=>{if(!text(x))add('editorial.retainedMacroFactIds['+i+']','type','沿用事实ID必须是非空字符串');});

  if(isObject(e.report,'editorial.report')) {
    const r=e.report,p='editorial.report';
    for(const k of ['overview','rolling24hSummary','methodology'])requiredText(r,k,p);
    if(isObject(r.coreAnalysis,p+'.coreAnalysis'))for(const k of ['mainTheme','expectationGap','divergence','regime','priceIn','bullCase','bullInvalidation','bearCase','bearInvalidation'])requiredText(r.coreAnalysis,k,p+'.coreAnalysis');
    if(isObject(r.plainLanguage,p+'.plainLanguage')) {
      for(const k of ['verdict','bottomLine','whyNow','horizon','confidence','invalidation'])requiredText(r.plainLanguage,k,p+'.plainLanguage');
      const impacts=objectArray(r.plainLanguage,'impacts',p+'.plainLanguage',{required:true});
      const labels=impacts.map(([x])=>text(x.asset)).join(' ');
      for(const market of markets)if(!labels.includes(market))add(p+'.plainLanguage.impacts','market-coverage','白话影响缺少'+market);
      for(const [x,at]of impacts)for(const k of ['effect','reason','takeaway','horizon'])requiredText(x,k,at);
    }
    if(own(r,'sectionGaps')&&isObject(r.sectionGaps,p+'.sectionGaps'))for(const [k,v]of Object.entries(r.sectionGaps))if(isObject(v,field(p+'.sectionGaps',k)))requiredText(v,'reason',field(p+'.sectionGaps',k));
    const gap=k=>object(r.sectionGaps)&&object(r.sectionGaps[k])&&text(r.sectionGaps[k].reason);
    const coverage=objectArray(r,'marketCoverage',p,{required:true});
    if(Array.isArray(r.marketCoverage))for(const market of markets)if(!coverage.some(([x])=>x.market===market))add(p+'.marketCoverage','market-coverage','必须覆盖'+market);
    for(const [x,at]of coverage)requiredText(x,'market',at);
    const dives=objectArray(r,'deepDive',p,{required:true}),seen=new Set(),bodies=[];
    for(const [x,at]of dives){
      const market=Q.marketOf(x);if(!market)add(at+'.name','market-coverage','需标明A股/港股/美股/BTC/黄金/原油之一');
      else{if(seen.has(market))add(at+'.name','duplicate','资产详报重复：'+market);seen.add(market);}
      for(const k of ['analysis','mechanism','risk','invalidation','horizon'])if(Q.placeholder(x[k]))add(at+'.'+k,'content-required','必须提供独立、非占位的'+k);
      if(!['factIds','evidenceFactIds','sourceUrls','sourceIds'].some(k=>Array.isArray(x[k])&&x[k].length))add(at+'.sourceUrls','evidence-required','资产详报需真实事实或来源引用');
      if(text(x.analysis))bodies.push([x.analysis,at]);
      if(own(x,'retention')&&isObject(x.retention,at+'.retention'))for(const k of ['reportId','analyzedAt','reason'])requiredText(x.retention,k,at+'.retention');
    }
    if(Array.isArray(r.deepDive))for(const market of markets)if(!seen.has(market))add(p+'.deepDive','market-coverage','缺少独立资产详报'+market);
    const seenBodies=new Set();for(const [body,at]of bodies){if(seenBodies.has(body))add(at+'.analysis','duplicate-content','不同资产不得复制同一段详报');seenBodies.add(body);}
    const frameworks=objectArray(r,'frameworkAnalysis',p,{required:true});
    if(Array.isArray(r.frameworkAnalysis)&&!r.frameworkAnalysis.length)add(p+'.frameworkAnalysis','content-required','reader-r2需要实际框架分析');
    for(const [x,at]of frameworks){
      for(const [k,aliases]of Object.entries({framework:['framework','name'],concept:['concept','principle'],observed:['observed','facts']}))if(!first(...aliases.map(a=>x[a])))add(at+'.'+k,'required','必须提供非空'+k+'（保留既有别名兼容）');
      if(!text(x.conclusion))add(at+'.conclusion','required','框架缺少名称或结论：conclusion必须是非空字符串');
    }
    if(isObject(r.frameworkSynthesis,p+'.frameworkSynthesis'))for(const k of ['verdict','agreement','disagreement','weighting','invalidation'])requiredText(r.frameworkSynthesis,k,p+'.frameworkSynthesis');
    for(const k of ['recentChanges','changes','evolution24h'])for(const [x,at]of objectArray(r,k,p)){
      if(!first(x.title,x.name,x.summary,x.detail,x.body,x.change))add(at+'.title','required','必须提供条目标题（或已有兼容别名）');
      if(!first(x.detail,x.body,x.summary,x.change))add(at+'.detail','required','必须提供条目正文（或已有兼容别名）');
    }
    const watches=objectArray(r,'watch',p);
    if((!own(r,'watch')||Array.isArray(r.watch)&&!r.watch.length)&&!gap('watch'))add(p+'.watch','gap-required','无观察条件时须提供sectionGaps.watch.reason');
    for(const [x,at]of watches){if(!first(x.point,x.name,x.item,x.title))add(at+'.point','required','必须提供观察点');if(!first(x.detail,x.why,x.summary,x.a,x.b))add(at+'.detail','required','必须提供具体观察条件');}
    const definitions=objectArray(r,'dataDefinitions',p);
    if((!own(r,'dataDefinitions')||Array.isArray(r.dataDefinitions)&&!r.dataDefinitions.length)&&!gap('dataDefinitions'))add(p+'.dataDefinitions','gap-required','无术语时须提供sectionGaps.dataDefinitions.reason');
    for(const [x,at]of definitions){if(x._missingTerm===true||!first(x.term,x.name,x.title))add(at+'.term','required','必须提供术语名');if(!first(x.definition,x.detail,x.text,x.explanation))add(at+'.definition','required','必须提供术语解释');}
    for(const [x,at]of objectArray(r,'narrativeTriggers',p)){if(!first(x.title,x.trigger,x.name,x.summary,x.detail))add(at+'.title','required','必须提供触发项标题');if(!first(x.effect,x.why,x.detail,x.text,x.summary))add(at+'.effect','required','必须提供触发影响');}
    for(const k of ['assets','worldEvents','analysisTheses','judgmentRevisions','metrics','macroEvents','news','events','canonicalFacts','sources'])objectArray(r,k,p);
    if(taskGroup==='global-main'&&(!Array.isArray(e.events)||!e.events.length)&&!gap('events'))add('editorial.events','event-radar-required','必须提供官方事件雷达，或在report.sectionGaps.events.reason说明已核验日历及空缺');
  }
  return issues;
}
function assertEditorialInput(editorial,options){const issues=validateEditorialInput(editorial,options);if(issues.length)throw new EditorialValidationError(issues);return editorial;}
module.exports={validateEditorialInput,assertEditorialInput,currentEvidenceSources,sourceId};
