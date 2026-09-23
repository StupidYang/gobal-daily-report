'use strict';
// Deterministic synthetic data. These functions never fetch a market or write production files.
const fs = require('node:fs');
const path = require('node:path');
const P = require('../lib/pipeline.cjs');
const Pub = require('../lib/publication.cjs');
const Control = require('../lib/control.cjs');
const MARKETS = ['A股', '港股', '美股', 'BTC', '黄金', '原油'];
const PRODUCERS = P.W.MODULES.filter(role => role !== 'synthesis');
const LABEL = '测试数据，非真实行情';
const EVIDENCE = 'https://stupidyang.github.io/gobal-daily-report/demo/fixture-evidence.html';
const utc8 = n => new Date(n + 8 * 3600000).toISOString().replace('Z', '+08:00');
const minute = n => utc8(n).slice(0,16).replace('T',' ');
const stamp = n => utc8(n).slice(0,19).replace(/[-:]/g,'');
const source = role => ({id: role + '-fixture', name: role + ' · 人工合成测试样本', short:'测试证据', url:EVIDENCE+'#'+role, use:LABEL});
function quote(item, i, at, step) {
  const tiny = item.symbol === 'PEPE';
  const rate = item.id.startsWith('RATE:');
  const base = tiny ? 0.0000000137 : rate ? 2.5 + i / 100 : 100 + i * 83;
  const missing = item.id === 'RATE:US2Y';
  return {...item, instrumentId:item.id, name:item.name+'（测试）', price:missing?null:Number((base*(1+(Math.sin(step+i)*0.007)+step*0.002)).toPrecision(10)),
    changePct:missing?null:Number((Math.sin(step+i)*2).toFixed(3)), asOf:missing?null:utc8(at), status:missing?'missing':'snapshot',
    sourceIds:[source('quotes').id], contract:item.id.startsWith('ENERGY:')?'2026-11':null,
    displayValue:missing?'测试缺失场景':undefined, note:LABEL+(missing?'；故意保留缺项，验证不补零':'；确定性函数生成')};
}
function boardRows(market, groupId, at, count, pool, step) {
  return Array.from({length:count},(_,i)=>({instrumentId:pool?'EQUITY:US:'+pool[i]:`TEST:${market}:${groupId}:${i}`,symbol:pool?pool[i]:`T${i+1}`,
    name:pool?pool[i]+'（测试报价）':`演示企业${i+1}`, market, currency:market==='CN'?'CNY':market==='HK'?'HKD':'USD',
    price:50+i*3+step,changePct:(i-3)*0.8+step*0.1,asOf:utc8(at),tradingDate:minute(at).slice(0,10),session:'regular',comparisonBasis:'previous-close',
    listingDays:500,avgDailyValue20d:100000000,valueTraded:(i+1)*10000000,turnoverPct:(i+1)*0.4,volumeRatio20d:(i+1)*0.6,
    volumeBaseline:'20-session-same-elapsed',suspended:i===count-1,isST:false,sourceIds:[source(market==='US'?'us-equities':'asia-equities').id],note:LABEL}));
}
function groups(config, role, at, step) {
  if(role==='us-equities')return Object.entries(config.usPools).map(([id,pool])=>({id,market:'US',name:(id==='technology'?'科技候选池':'投资候选池')+'（测试）',classification:'configured-pool',universeScope:'sample',
    expectedCount:pool.length,asOf:utc8(at),tradingDate:minute(at).slice(0,10),currency:'USD',session:'regular',comparisonBasis:'previous-close',membershipSourceId:source(role).id,
    rows:boardRows('US',id,at,pool.length,pool,step)}));
  return ['CN','HK'].flatMap(market=>config.sectors[market].names.map((name,i)=>({id:name,market,name:name+'（测试）',classification:config.sectors[market].classification,
    universeScope:'sample',expectedCount:null,currency:market==='CN'?'CNY':'HKD',session:'regular',comparisonBasis:'previous-close',asOf:utc8(at),tradingDate:minute(at).slice(0,10),
    membershipSourceId:source(role).id,rows:boardRows(market,i,at,6,null,step)})));
}
function news(at) {
  const topics=['演示科研成果','演示交通调整','演示服务升级','演示企业披露','演示设备测试','演示供应变化'];
  return Array.from({length:18},(_,i)=>({id:'synthetic-event-'+i,eventId:'synthetic-event-'+i,regions:[['CN','US','WORLD'][i%3]],kind:i%3?'general':'market',category:topics[i%topics.length],priority:i<3?'high':'normal',
    title:`测试事件 ${String(i+1).padStart(2,'0')} · ${topics[i%topics.length]}`,summary:'这是为验证长文本、分页、搜索和区域去重而构造的事件。没有对应的现实新闻，不可引用为事实。',
    plainImpact:'测试影响说明：展示受影响对象、传导渠道与时间范围。此处只验收内容能否完整到达页面。',assessment:'测试判断：不从这条虚构事件推导现实投资结论。',
    affectedGroups:'演示人群 / 演示企业',marketImpact:'无现实市场影响，本条为人工合成测试。',counterRisk:'主要用于验证遗漏、截断和错误引用。',nextWatch:'检查此条是否能通过搜索和分页找到。',horizon:'测试窗口',confidence:'low',
    eventAt:utc8(at-i*3600000),publishedAt:utc8(at-i*3600000),updatedAt:utc8(at-i*3600000),firstSeenAt:utc8(at-i*3600000),updateType:i<3?'new':'developing',sourceIds:[source('news').id]}));
}
function producers(config, at, step=0, batchId='fixture-batch') {
  const observed=at-120000,generated=at-60000;
  const modules={};
  for(const role of PRODUCERS) {
    const m={moduleVersion:1,module:role,runId:stamp(generated)+'-fixture-'+role,generatedAt:utc8(generated),dataAsOf:utc8(observed),dataMode:'synthetic',status:role==='news'?'ok':'partial',sources:[source(role)],
      execution:{batchId,mode:'fixture',role},payload:{},note:LABEL};
    if(role==='quotes')m.payload={items:config.required.map((item,i)=>quote(item,i,observed,step))};
    if(role.endsWith('equities'))m.payload={groups:groups(config,role,observed,step),coverage:{note:'配置范围内的合成样本，不是全市场实采数据。'}};
    if(role==='news')m.payload={newsroom:{windowStart:utc8(at-86400000),windowEnd:utc8(observed),items:news(observed),coverage:{CN:'6条测试事件',US:'6条测试事件',WORLD:'6条测试事件'}},worldEvents:[]};
    if(role==='macro')m.payload={canonicalFacts:[],macroEvents:[{title:'测试宏观事件',actual:'演示数值',expected:'演示预期',analysis:'检验事实、预期和判断分栏展示。非真实宏观数据。',sourceIds:[source(role).id]}],events:[]};
    if(role==='research')m.payload={records:[{instrumentId:'EQUITY:US:AAPL',eventKey:'synthetic-earnings-v1',eventType:'earnings',period:'合成季度',documentId:'synthetic-document-v1',documentUrl:EVIDENCE+'#research',
      analyzedAt:'2026-09-20T12:00:00+08:00',analysis:{conclusion:'测试研究缓存：同一文件重复检查不改写最初分析时间。',business:'演示业务',risk:'所有样本仅供工程验收。'},sourceIds:[source(role).id]}],
      checks:[{instrumentId:'EQUITY:US:AAPL',checkedAt:utc8(generated),result:'no-new-material',note:'测试复用原分析'}],pendingQueue:[{instrumentId:'TEST:pending',reason:'测试待处理队列'}]};
    modules[role]=m;
  }
  return modules;
}
function reportFor(modules, at, step=0) {
  const updatedAt=minute(at),reportId=updatedAt.replace(' ','-').replace(':',''),refs={};
  for(const role of PRODUCERS) {const m=modules[role];refs[role]={path:P.archivePath(m),runId:m.runId,generatedAt:m.generatedAt,dataAsOf:m.dataAsOf};}
  const facts=modules.quotes.payload.items.map((q,i)=>({id:'fixture-fact-'+i,label:q.name,displayValue:q.price===null?'测试缺失':String(q.price),rawValue:q.price,
    changePct:q.changePct,changeBasis:'previous-close',unit:q.currency,scope:'synthetic-only:'+q.instrumentId,seriesKey:q.instrumentId,valueType:q.instrumentId.startsWith('INDEX:')?'index':q.instrumentId.startsWith('RATE:')?'yield':'price',
    contract:q.contract,asOf:q.asOf,verifiedAt:modules.quotes.generatedAt,dataStatus:q.price===null?'missing':'complete',marketState:'test',sourceIds:q.sourceIds,
    evidenceNote:LABEL,window:'合成快照',direction:q.changePct>0?'up':'down'}));
  const factFor=market=>[facts[market==='A股'?0:market==='港股'?6:market==='美股'?9:market==='BTC'?16:market==='黄金'?21:23]?.id].filter(Boolean);
  const r={schemaVersion:5,reportId,updatedAt,reportMeta:{generatedAt:utc8(at+30000),analysisAsOf:utc8(at),dataMode:'synthetic',contractVersion:'reader-r2',pipelineVersion:'candidate-gate-v2',moduleRefs:refs,edition:'隔离演示 / 测试数据',status:'synthetic-partial'},
    marketState:'测试环境',overview:'这是隔离的工程验收页面。报价、新闻与分析均为人工合成，不能用作真实市场信息。',brief:'只验证系统，不提供真实行情',rolling24hSummary:'七份四小时测试快照构成24小时样本，用来检查曲线、历史切换和最近新增。',
    period:{mode:'rolling-24h',from:minute(at-86400000),to:updatedAt,label:'合成24小时窗口',coverageHours:Math.min(step*4,24),isFull24h:step>=6,gaps:step<6?['测试启动阶段，尚未满24小时']:[]},
    recentPeriod:{from:minute(at-14400000),to:updatedAt,label:'最近一轮测试增量'},canonicalFacts:facts,sources:PRODUCERS.map(source),
    metrics:MARKETS.map((name,i)=>({name:name+'（测试）',value:'合成样本',factId:factFor(name)[0],primary:true})),
    marketCoverage:MARKETS.map(market=>({market,status:'partial',sessionState:'测试',note:'人工合成样本，不代表实际交易状态。',asOf:utc8(at-120000)})),
    assets:MARKETS.map(name=>({name,summary:'测试资产摘要',detail:'检查报价、数据时点和解释是否相互匹配。',factIds:factFor(name)})),
    coreAnalysis:{mainTheme:'测试主线：数据先校验，再组装，再发布；任何一步失败都保留旧报告。',expectationGap:'测试预期差：故意保留一个缺失字段，确认页面不会把它显示为零。',divergence:'测试背离：不同资产使用独立合成序列，不能混用单位或时点。',regime:'隔离工程验收，不描述现实市场状态。',priceIn:'仅有人工合成输入，没有实际市场定价判断。',bullCase:'测试成功情景：所有依赖齐全并通过校验。',bullInvalidation:'任一冻结输入缺失、引用错误或发生生产污染。',bearCase:'测试失败情景：接口报错、格式损坏、历史切换竞态。',bearInvalidation:'故障恢复后读取正确版本，旧内容未被抹掉。'},
    deepDive:MARKETS.map(name=>({name,mechanism:'测试机制：检查本资产输入到结论的引用链。',risk:'测试风险：真实来源不在本合成测试范围。',invalidation:'测试证伪：任一冻结输入与回执不一致。',horizon:'仅限本次工程验收窗口',title:name+'（测试详报）',oneLine:'用途：核对完整正文、事实引用和展开阅读',analysis:`${name}的测试详报不对应现实走势。这里用多段信息验证：首屏摘要不会替代完整正文；每个来源都能定位测试证据；同一时间点的观测不会因为报告刷新而重复造点。\n\n故障注入时保留最后一份有效数据，恢复后清除错误提示。未知数据保持未知，不能用零、编造时间或临时排名填补。`,factIds:factFor(name),sourceIds:[source('quotes').id]})),
    analysisTheses:[{id:'fixture-thesis',topic:'测试假设',observed:'同批六个模块均有不可变快照。',interpretation:'综合报告应冻结同一批次的准确输入。',alternatives:'部分模块缺失时应等待，不能伪装完整成功。',validation:'读取回执、历史、索引和公网字节校验。',confidence:'high',evidenceFactIds:[facts[0].id]}],
    judgmentRevisions:[{id:'fixture-revision',topic:'测试修正记录',previous:'上一轮含有未知数据。',newEvidence:'本轮仍故意保留缺口以检查降级显示。',revised:'不把未知改成零。',unresolved:'此页面不验证真实数据源。',updatedAt:utc8(at),status:'待验证'}],
    dataDefinitions:[{name:'测试数据',term:'测试数据',definition:'所有数值与事件来自确定性合成函数，不是市场采集结果。'},{name:'数据时点',term:'数据时点',definition:'asOf是观测时间，generatedAt是生成时间；两者分开。'}],
    macroEvents:modules.macro.payload.macroEvents,news:modules.news.payload.newsroom.items.slice(0,3),worldEvents:[],newsroom:modules.news.payload.newsroom,
    narrativeTriggers:[{title:'依赖齐全（测试）',effect:'发布器只在完整校验成功后更新指针。'}],events:[{at:utc8(at+7200000),time:minute(at+7200000),title:'下一次测试检查点（非真实事件）',impact:'展示倒计时与未知时间的区别。'},{at:null,time:'时间待定',title:'未确认时点测试',impact:'不制造假的倒计时。'}],
    watch:[{point:'测试发布闭环',a:'依赖齐全：发布完整报告。',b:'输入错误：拒绝且保持旧数据。'}],evolution24h:[{at:utc8(at),time:updatedAt,title:'第'+(step+1)+'份测试快照',summary:'检查24小时演化、增量和来源。',observed:'合成数值更新',interpretation:'工程验收专用',firstSeenAt:utc8(at)}],
    changes:[{title:'测试变化',change:'本轮合成序列变化。',why:'用于验证历史曲线。'}],recentChanges:[{title:'最近测试增量',summary:'新快照已经进入隔离目录，正式报告保持不变。',firstSeenAt:utc8(at)}],
    plainLanguage:{verdict:'测试环境：验证完整发布与阅读，不是真实行情',bottomLine:'这是合成数据演示。七个模块、24小时曲线、行业榜、新闻和研究缓存一起验收；自动任务保持暂停。',whyNow:'用于发现只测首页无法覆盖的发布和阅读错误。',horizon:'工程验收窗口',confidence:'high',invalidation:'任何测试失败，或测试内容进入正式数据目录。',impacts:MARKETS.map(asset=>({asset,effect:'仅供测试',reason:'该资产使用合成输入展示完整路径。',takeaway:'不据此形成现实投资判断。',horizon:'测试窗口',counterRisk:'真实数据源尚需单独验收。',invalidation:'字段缺失或引用错误。',confidence:'low',evidenceFactIds:factFor(asset)}))},
    frameworkAnalysis:[{id:'source-time',framework:'数据时点一致性（测试）',concept:'来源时间与生成时间分别记录。',observed:'每条测试报价有独立asOf。',mechanism:'通过冻结引用防止读到后续更新的模块。',conclusion:'曲线只能连接同口径、不同观测时间的点。',invalidation:'发生混合时点或单位。'},{id:'dependency',framework:'依赖与事务完整性（测试）',concept:'完整输入先验证，再提交可见结果。',observed:'六个输入指向不可变run。',mechanism:'报告、历史、索引和回执构成同一写入集合。',conclusion:'部分失败不能更新正式指针。',invalidation:'任一输出和回执不一致。'},{id:'degradation',framework:'故障降级（测试）',concept:'错误发生时保留最后一次有效内容。',observed:'缺值、损坏JSON和503由测试注入。',mechanism:'错误与旧值分别显示。',conclusion:'恢复后清除错误，不重置研究时间。',invalidation:'发生空白覆盖或残留假成功提示。'}],
    frameworkSynthesis:{verdict:'这些是工程验收框架，不是对现实市场的预测。',agreement:'所有检查都要求可重复、可追溯。',disagreement:'技术通过不等于真实新闻和报价准确。',weighting:'先检查数据隔离与完整性，再检查布局和交互。',invalidation:'真实任务与测试状态混淆。'},
    methodology:LABEL+'。通过与生产相同的校验、不可变快照、历史索引及浏览器代码；测试通过不证明外部来源准确或定时任务已经运行。'};
  return r;
}
function writeBatch(root,config,at,step=0) {
  const batchId='fixture-'+stamp(at),mods=producers(config,at,step,batchId);
  const report=reportFor(mods,at,step),synthesis={moduleVersion:1,module:'synthesis',runId:stamp(at+30000)+'-fixture-synthesis',generatedAt:utc8(at+30000),dataAsOf:utc8(at-120000),dataMode:'synthetic',status:'partial',sources:[],
    execution:{batchId,mode:'fixture',role:'synthesis'},payload:{report}};
  const B=require('../lib/batch.cjs');B.submitBatch(root,{batchVersion:1,batchId,taskGroup:'global-main',modules:[...Object.values(mods),synthesis]});
  const result=B.promoteBatches(root,at+60000);if(result.length!==1||result[0].status!=='published')throw Error('Fixture batch rejected: '+JSON.stringify(result));
  const receipts=[...Object.values(mods),synthesis].map(m=>P.read(path.join(root,'data/receipts',m.module,m.runId+'.json')));
  return {batchId,reportId:report.reportId,modules:mods,synthesis,receipts,batchReceipt:result[0]};
}
function initialize(root) {
  fs.mkdirSync(root,{recursive:true});P.atomic(path.join(root,Control.MARKER),{purpose:'isolated-synthetic-fixtures',allowSynthetic:true});
}
module.exports={LABEL,MARKETS,PRODUCERS,utc8,minute,source,producers,reportFor,writeBatch,initialize};
