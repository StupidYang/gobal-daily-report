'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../assets/editorial-scope.js'),N=require('../lib/news-retention.cjs'),L=require('../lib/live-report.cjs');
const bulletin={id:'nmc-next',title:'中央气象台彩云台风下一通报计划',summary:'下一通报计划08:30发布。',sourceIds:['s']};
const market={id:'rate',title:'央行公布利率决定',summary:'央行公布正式决定。',sourceIds:['s'],regions:['US'],kind:'market',publishedAt:'2026-10-04T00:00:00Z',plainImpact:'利率变化影响融资条件。',assessment:'按公告实际值分析。'};
test('weather in Chinese and English cannot fill the newsroom or future radar',()=>{
 for(const title of [bulletin.title,'美国气象部门维持南佛州海滩离岸流高风险提示','NWS weather forecast','Hurricane position bulletin','体感温度预报']){
  assert.ok(S.outOfScope({title}));assert.throws(()=>S.assertEditorial({newsItems:[{title}]}),/editorial-scope-v1/);assert.throws(()=>S.assertEditorial({events:[{title}]}),/editorial-scope-v1/);
 }
});
test('source receipts and economic or public policy news are not weather forecasts',()=>{
 assert.doesNotThrow(()=>S.assertEditorial({newsItems:[market,{title:'美国环保署启动PM2.5区域达标认定程序',summary:'环境政策调整。'}],report:{sources:[{name:'NMC bulletin',url:'https://www.nmc.cn'}],sectionGaps:{events:{reason:'无合格新事件，不用天气预报凑数。'}}}}));
});
test('a generic possible market effect does not exempt a forecast',()=>{
 assert.ok(S.outOfScope({...bulletin,marketImpact:'可能影响原油'}));
 assert.ok(S.outOfScope({...bulletin,marketImpactEvidence:{status:'verified',channel:'energy',observedEffect:'可能影响原油',sourceIds:['s']}}));
});
test('a specific source-bound economic disruption can be reported',()=>{
 const x={...bulletin,title:'飓风导致能源设施停产',marketImpactEvidence:{status:'verified',channel:'energy',observedEffect:'运营商正式公告确认两座能源设施已停产，恢复时间尚未确定。',sourceIds:['s']}};
 assert.ok(S.material(x));assert.doesNotThrow(()=>S.assertEditorial({newsItems:[x]}));assert.deepEqual(S.project({news:[x]}).news,[x]);
 x.marketImpactEvidence.sourceIds=['unrelated'];assert.ok(S.outOfScope(x));
});
test('weather-only narrative updates are rejected even when the event list is empty',()=>{
 assert.throws(()=>S.assertEditorial({report:{overview:'BTC保留原观测。NMC下一通报08:30发布。'}}),/市场摘要/);
 assert.throws(()=>S.assertEditorial({report:{frameworkAnalysis:[{observed:'NMC05时观测与05:40发布分别记录。'}]}}),/市场摘要/);
});
test('reader projects all duplicate lanes without changing any original report data or timestamps',()=>{
 const original={reportId:'2026-10-04-0706',updatedAt:'2026-10-04 07:06',overview:'BTC为84760.62美元。NMC下一通报08:30发布。',sources:[{id:'s',name:'NMC bulletin'}],news:[market,bulletin],worldEvents:[bulletin],events:[bulletin],newsroom:{items:[market,bulletin],legacyItems:[bulletin],coverage:{active:2,complete:true}},canonicalFacts:[{id:'BTC',rawValue:84760.62,asOf:'2026-10-03T23:06:43Z'}]};
 const before=JSON.stringify(original),r=S.project(original);
 assert.equal(JSON.stringify(original),before);assert.equal(r.reportId,original.reportId);assert.equal(r.updatedAt,original.updatedAt);assert.deepEqual(r.canonicalFacts,original.canonicalFacts);assert.deepEqual(r.sources,original.sources);
 assert.deepEqual(r.news,[market]);assert.equal(r.events.length,0);assert.equal(r.worldEvents.length,0);assert.equal(r.newsroom.items.length,1);assert.equal(r.newsroom.legacyItems.length,0);assert.equal(r.newsroom.coverage.active,1);assert.equal(r.newsroom.coverage.complete,false);
 assert.equal(r.overview,'BTC为84760.62美元。');assert.match(r.sectionGaps.events.reason,/未重新检查官方日历/);assert.ok(r._editorialScope.displayOnly);
});
test('weather is not counted as retained current news, but its original receipt remains traceable',()=>{
 const prior={runId:'old',generatedAt:'2026-10-04T00:00:00Z',payload:{newsroom:{items:[{...market,...bulletin},market]}}},before=JSON.stringify(prior);
 const n=N.merge(prior,[],{now:Date.parse('2026-10-04T01:00:00Z'),sources:[{id:'s',url:'https://example.org/official'}]});
 assert.equal(JSON.stringify(prior),before);assert.deepEqual(n.items.map(x=>x.id),['rate']);assert.equal(n.coverage.active,1);assert.equal(n.coverage.retained,1);assert.equal(n.scopeExclusions.length,1);assert.equal(n.legacyItems[0].scopeExcluded,true);assert.equal(n.legacyItems[0].summary,bulletin.summary);
 assert.throws(()=>N.merge(null,[bulletin]),/editorial-scope-v1/);
});
test('an omitted new regional radar does not carry forward old weather',()=>{
 const prior={runId:'old',generatedAt:'2026-10-04T00:00:00Z',sources:[],payload:{events:[{...bulletin,at:'2026-10-04T02:00:00Z'}]}};
 const m=L.prepareMacro(prior,{},Date.parse('2026-10-04T01:00:00Z'));assert.equal(m.payload.events.length,0);
});
test('compiler scope gate precedes radar acceptance and browser script loads before contract',()=>{
 const root=path.join(__dirname,'..'),code=fs.readFileSync(path.join(root,'lib/live-report.cjs'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(code.indexOf('Q.editorialScope.assertEditorial(e)')<code.indexOf("assertEventRadar(e,options.taskGroup"));assert.ok(html.indexOf('assets/editorial-scope.js')<html.indexOf('assets/content-contract.js'));
});
