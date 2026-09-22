'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const W=require('../assets/watchlist-core.js'),P=require('../lib/pipeline.cjs'),config=require('../config/watchlist.json');
const at='2026-09-22T09:35:00+08:00',now=W.time('2026-09-22T12:00:00+08:00');
const quote=(o={})=>({instrumentId:'CRYPTO:BTC:USD',price:100,changePct:1,asOf:at,currency:'USD',status:'snapshot',sourceIds:['s'],...o});
const moduleOf=(role='quotes',o={})=>({moduleVersion:1,module:role,runId:'20260922T093500-'+role,generatedAt:at,dataAsOf:at,status:'ok',sources:[{id:'s',url:'https://example.org/source'}],payload:role==='quotes'?{items:[quote()]}:role==='research'?{records:[],checks:[]}:role.endsWith('equities')?{groups:[]}:{},...o});
const row=(id,v,o={})=>({instrumentId:'EQUITY:CN:'+id+'.SH',symbol:id,name:id,price:10,changePct:v,asOf:at,currency:'CNY',tradingDate:'2026-09-22',session:'regular',comparisonBasis:'previous-official-close',volumeRatio20d:1+v/20,volumeBaseline:'20-session-same-elapsed',turnoverPct:2,valueTraded:50000000,avgDailyValue20d:60000000,listingDays:1000,isST:false,suspended:false,sourceIds:['s'],...o});
const group=(rows,o={})=>({id:'电子',name:'电子',market:'CN',classification:'SW2021-L1',asOf:at,currency:'CNY',tradingDate:'2026-09-22',session:'regular',comparisonBasis:'previous-official-close',universeScope:'sample',expectedCount:null,rows,...o});
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'gdr-'));
function research(o={}){return {instrumentId:'EQUITY:US:TEST',eventKey:'2026Q2-doc1',eventType:'earnings',period:'2026Q2',documentId:'doc1',documentUrl:'https://example.org/filing',analyzedAt:at,analysis:{conclusion:'fixture only'},sourceIds:['s'],...o};}
test('required assets include all five crypto, silver, both RMB rates and oil',()=>{for(const s of ['BTC','ETH','SOL','PEPE','HYPE','XAG/USD','USD/CNY','USD/CNH','WTI','BRENT'])assert.ok(config.required.some(x=>x.symbol===s));assert.equal(new Set(config.required.map(x=>x.id)).size,config.required.length);});
test('31 CN industries and 12 HK industries are explicit',()=>{assert.equal(config.sectors.CN.names.length,31);assert.equal(config.sectors.HK.names.length,12);});
test('time parsing is UTC+8, rejects ambiguous, rollover dates and offsets',()=>{assert.equal(W.time('2026-09-22 09:35'),W.time(at));for(const x of ['2026-09-22','09:35','2026-09-22 09:35附近','2026-02-30 09:35'])assert.equal(W.time(x),null);});
test('valid quote accepted; future envelope rejected',()=>{assert.deepEqual(W.validate(moduleOf(),'quotes',now),[]);assert.ok(W.validate(moduleOf('quotes',{generatedAt:'2999-01-01T00:00:00+08:00'}),'quotes',now).length);});
test('missing is not numeric zero; raw strings and thresholds rejected',()=>{assert.ok(W.validate(moduleOf('quotes',{payload:{items:[quote({price:'100'})]}}),'quotes',now).length);assert.ok(W.validate(moduleOf('quotes',{payload:{items:[quote({rawValue:87000,displayValue:'>87000'})]}}),'quotes',now).length);assert.equal(W.quoteRows(config,null).find(q=>q.symbol==='BTC').price,null);});
test('numeric quote without precise asOf or evidence fails',()=>{for(const o of [{asOf:null},{sourceIds:[]},{sourceIds:['absent']}])assert.ok(W.validate(moduleOf('quotes',{payload:{items:[quote(o)]}}),'quotes',now).length);});
test('duplicated quote identity and cross-role write rejected',()=>{assert.ok(W.validate(moduleOf('quotes',{payload:{items:[quote(),quote()]}}),'quotes',now).length);assert.ok(W.validate(moduleOf(),'research',now).length);});
test('oil requires actual contract, not perpetual front-month or invalid month',()=>{for(const contract of [null,'front','2026-99'])assert.ok(W.validate(moduleOf('quotes',{payload:{items:[quote({instrumentId:'ENERGY:WTI',contract})]}}),'quotes',now).length);assert.deepEqual(W.validate(moduleOf('quotes',{payload:{items:[quote({instrumentId:'ENERGY:WTI',contract:'2026-11'})]}}),'quotes',now),[]);});
test('PEPE tiny price is not displayed as zero',()=>{assert.notEqual(W.priceText({price:.000000000001}), '0');assert.match(W.priceText({price:.0000081234}),/81234/);});
test('rank has deterministic ties and sample label',()=>{const g=group([row('600001',0),row('600002',0),row('600003',0)]),r=W.rankGroup(g,config,2);assert.equal(r.hot.length,2);assert.equal(r.hot[0].instrumentId,'EQUITY:CN:600001.SH');assert.equal(r.hot[0].heatScore,50);assert.equal(r.scope,'sample');});
test('hot is not gainers; high activity falling stock can be both hot and weak',()=>{const g=group([row('600001',-9,{volumeRatio20d:10,turnoverPct:30,valueTraded:900000000}),row('600002',3),row('600003',4)]),r=W.rankGroup(g,config,1);assert.equal(r.hot[0].symbol,'600001');assert.equal(r.weak[0].symbol,'600001');});
test('missing volume baseline never becomes hot, weak still available',()=>{const r=W.rankGroup(group([row('600001',-1,{volumeRatio20d:null}),row('600002',1,{volumeBaseline:null})]),config);assert.equal(r.hot.length,0);assert.equal(r.weak.length,2);});
test('wrong currency/session/basis/date excluded',()=>{for(const o of [{currency:'HKD'},{session:'after'},{comparisonBasis:'open'},{tradingDate:'2026-09-21'}])assert.equal(W.rankGroup(group([row('600001',1,o)]),config).eligible,0);});
test('suspended/ST/newly-listed/unknown liquidity excluded with reason',()=>{for(const o of [{suspended:true},{isST:true},{listingDays:5},{listingDays:null},{avgDailyValue20d:null},{avgDailyValue20d:1}]){const r=W.rankGroup(group([row('600001',1,o)]),config);assert.equal(r.eligible,0);assert.equal(r.excluded.length,1);}});
test('stale/asynchronous timestamps cannot join a ranking cohort',()=>{assert.equal(W.rankGroup(group([row('600001',1,{asOf:'2026-09-22 08:00'})]),config).eligible,0);});
test('full universe claim requires exact observed count and membership evidence',()=>{const rows=[row('600001',1),row('600002',2)];assert.equal(W.rankGroup(group(rows,{universeScope:'full-sector',expectedCount:20,membershipSourceId:'s'}),config).scope,'sample');assert.equal(W.rankGroup(group(rows,{universeScope:'full-sector',expectedCount:2,membershipSourceId:'s'}),config).scope,'full-sector');});
test('all-positive bottom list says relative weakness, not invented negative return',()=>{const r=W.rankGroup(group([row('600001',1),row('600002',2),row('600003',3)]),config,1);assert.equal(r.weak[0].changePct,1);assert.equal(r.weak[0].relativePp,-1);});
test('N is bounded, not negative slice semantics',()=>{assert.equal(W.nValue(-1),1);assert.equal(W.nValue(100),20);assert.equal(W.nValue('bad'),5);});
test('research needs identifiable source event, no forged empty analysis',()=>{assert.ok(W.validate(moduleOf('research',{payload:{records:[{}],checks:[]}}),'research',now).length);assert.deepEqual(W.validate(moduleOf('research',{payload:{records:[research()],checks:[]}}),'research',now),[]);});
test('same financial event reuses old analysis date; new document creates new entry',()=>{const prev=moduleOf('research',{payload:{records:[research()],checks:[]}}),next=moduleOf('research',{payload:{records:[research({analyzedAt:'2026-09-22 11:00',analysis:{conclusion:'should not replace'}}),research({eventKey:'new-doc',documentId:'doc2'})],checks:[]}});const r=P.mergeResearch(prev,next);assert.equal(r.payload.records.length,2);assert.equal(r.payload.records[0].analyzedAt,at);assert.equal(r.payload.records[0].analysis.conclusion,'fixture only');});
test('historical research selection cannot show future analysis',()=>{assert.equal(W.selectResearch([research(),research({instrumentId:'future',analyzedAt:'2026-09-23 09:00'})],now).length,1);});
test('unknown/old module states do not become fresh',()=>{assert.equal(W.freshness(null,6,now),'missing');assert.equal(W.freshness(moduleOf(),1,now),'stale');});
test('local ingestion is idempotent and rejects different content same runId',()=>{const dir=temp();try{const m=moduleOf();assert.equal(P.ingest(dir,m,now).status,'published-module');assert.equal(P.ingest(dir,m,now).status,'idempotent');assert.throws(()=>P.ingest(dir,{...m,status:'partial'},now),/不可覆盖/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('late older producer archived without rollback',()=>{const dir=temp();try{P.ingest(dir,moduleOf(),now);const late=moduleOf('quotes',{runId:'older',generatedAt:'2026-09-22 08:00',dataAsOf:'2026-09-22 08:00',payload:{items:[]}});assert.equal(P.ingest(dir,late,now).status,'archived-older');assert.equal(P.read(path.join(dir,'data/modules/quotes.json')).runId,moduleOf().runId);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('research ingest retries do not change cache or overwrite old analyzedAt',()=>{const dir=temp();try{const m=moduleOf('research',{payload:{records:[research()],checks:[]}});P.ingest(dir,m,now);assert.equal(P.ingest(dir,m,now).status,'idempotent');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('local publishing lock fails closed, never removes another process lock',()=>{const dir=temp();try{fs.mkdirSync(path.join(dir,'.runtime/publish.lock'),{recursive:true});assert.throws(()=>P.ingest(dir,moduleOf(),now),/持锁/);assert.ok(fs.existsSync(path.join(dir,'.runtime/publish.lock')));}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('unsafe URLs and run path traversal rejected',()=>{assert.equal(W.safeUrl('javascript:alert(1)'),null);assert.ok(W.validate(moduleOf('quotes',{runId:'../../latest'}),'quotes',now).length);});
test('manifest has seven independent roles and only one global report writer',()=>{const m=require('../automation/manifest.json');assert.equal(m.roles.length,7);assert.equal(m.tasks.length,3);assert.deepEqual(m.roles.filter(t=>t.ownedPaths.includes('data/latest.json')).map(t=>t.role),['synthesis']);});
test('research cache preserves prior evidence catalog and refuses source identity collision',()=>{
 const prev=moduleOf('research',{sources:[{id:'old',url:'https://example.org/old'}],payload:{records:[research({sourceIds:['old']})],checks:[]}});
 const incoming=moduleOf('research',{payload:{records:[research({eventKey:'new',documentId:'new'})],checks:[]}});
 const result=P.mergeResearch(prev,incoming);assert.equal(result.sources.length,2);assert.deepEqual(W.validate(result,'research',now),[]);
 assert.throws(()=>P.mergeResearch(prev,{...incoming,sources:[{id:'old',url:'https://example.org/changed'}]}),/不同URL/);
});
test('future analyzedAt and numeric threshold quotes are rejected',()=>{
 assert.ok(W.validate(moduleOf('research',{payload:{records:[research({analyzedAt:'2026-09-23 00:00'})],checks:[]}}),'research',now).length);
 assert.ok(W.validate(moduleOf('quotes',{payload:{items:[quote({displayValue:'>100'})]}}),'quotes',now).length);
});
function fullReport(t='2026-09-22 09:35'){
 const r={schemaVersion:5,reportId:t.replace(' ','-').replace(':',''),updatedAt:t,overview:'测试资料，不是行情',rolling24hSummary:'测试',methodology:'测试',period:{to:t},recentPeriod:{to:t},coreAnalysis:{}};
 for(const k of ['canonicalFacts','metrics','marketCoverage','worldEvents','analysisTheses','judgmentRevisions','dataDefinitions','deepDive','evolution24h','changes','recentChanges','assets','macroEvents','news','narrativeTriggers','events','watch','sources'])r[k]=[];
 for(const k of ['mainTheme','expectationGap','divergence','regime','priceIn','bullCase','bullInvalidation','bearCase','bearInvalidation'])r.coreAnalysis[k]='测试';
 r.marketCoverage=[{market:'港股'}];r.deepDive=[{analysis:'测试'}];r.sources=[{id:'local-source',url:'https://example.org/local'}];r.news=[{sourceIds:['local-source']}];return r;
}
test('synthesis report sources are scoped independently from its module envelope',()=>{
 const m=moduleOf('synthesis',{payload:{report:fullReport()}});assert.deepEqual(W.validate(m,'synthesis',now),[]);assert.deepEqual(P.validateReport(m.payload.report),[]);
});
test('report publisher uses immutable history, sorted index and never rolls latest backward',()=>{
 const dir=temp();try{const old=fullReport(),newer=fullReport('2026-09-22 12:00');
 assert.equal(P.publishReport(dir,old).status,'published-report');assert.equal(P.publishReport(dir,newer).status,'published-report');
 assert.equal(P.publishReport(dir,old).status,'skipped-older');assert.equal(P.read(path.join(dir,'data/latest.json')).reportId,newer.reportId);
 assert.equal(P.read(path.join(dir,'data/history-index.json')).reports[0].reportId,newer.reportId);
 assert.equal(P.hash(P.read(path.join(dir,'data/latest.json'))),P.hash(P.read(path.join(dir,'history/2026-09-22/1200.json'))));
 assert.throws(()=>P.publishReport(dir,{...newer,overview:'different'}),/拒绝/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('candidate reports cannot omit details or use mismatched cutoff and dangling citations',()=>{
 assert.ok(P.validateReport({...fullReport(),deepDive:[]}).length);
 assert.ok(P.validateReport({...fullReport(),period:{to:'2026-09-22 08:00'}}).length);
 assert.ok(P.validateReport({...fullReport(),sources:[]}).length);
});
