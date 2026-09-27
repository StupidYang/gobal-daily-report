'use strict';
const test=require('node:test'),a=require('node:assert/strict'),C=require('../assets/terminal-core.js'),R=require('../assets/reader-core.js');
const f=(x={})=>({id:'btc',label:'BTC',rawValue:100,unit:'USD',scope:'BTC/USD',asOf:'2026-09-22 08:00',dataStatus:'delayed',sourceIds:['s'],...x});
const report=(at,fs)=>({reportId:at,updatedAt:at,canonicalFacts:fs,sources:[{id:'s'}]});
test('explicit ISO and local UTC+8 parse identically',()=>a.equal(C.parseTime('2026-09-22 08:00'),C.parseTime('2026-09-22T00:00:00Z')));
test('ambiguous and invalid times rejected; future is not just now',()=>{['08:00','2026-02-30 10:00','2026-09-22 08:00附近'].forEach(x=>a.equal(C.parseTime(x),null));a.match(C.age('2026-09-22 10:00',C.parseTime('2026-09-22 08:00')),/未来/);});
test('health counts are exhaustive, not a score',()=>{const h=C.health([f(),f({dataStatus:'missing'}),f({dataStatus:'closed'})]);a.equal(Object.values(h.counts).reduce((x,y)=>x+y,0),3);a.equal(h.counts.live,0);});
test('coverage absent never means full',()=>a.match(C.coverage({}).label,/未知/));
test('ledger counts distinct topic latest status',()=>a.equal(C.ledger([{id:'a',status:'待验证'},{id:'a',status:'得到支持',updatedAt:'2026-09-22 08:00'}]).total,1));
test('one cross-region news item is counted once',()=>{const n=R.newsRows({worldEvents:[{id:'a',title:'旧',regions:['CN']}],newsroom:{items:[{id:'a',title:'新',regions:['US','US'],updatedAt:'2026-09-22 09:00'}]}});a.equal(n.length,1);a.equal(n[0].title,'新');a.deepEqual(R.newsCounts(n),{total:1,CN:1,US:1,WORLD:0,UNSPECIFIED:0,general:0});});
test('unclassified legacy news not silently classified',()=>a.deepEqual(R.newsRows({worldEvents:[{id:'a',title:'美国会议'}]})[0].regions,['UNSPECIFIED']));
test('legacy data preserves original statements; does not invent verdict',()=>{const p=R.plain({marketState:'原判断',assets:[{name:'BTC',summary:'原摘要'}]});a.equal(p.verdict,'原判断');a.equal(p.impacts[0].reason,'原摘要');a.equal(p.legacy,true);});
test('explicit plain-language conclusions retained',()=>{const p=R.plain({plainLanguage:{verdict:'判断',impacts:[]}});a.equal(p.verdict,'判断');a.equal(p.legacy,false);});
test('null, threshold, numeric text excluded from graph',()=>{[null,'87000',NaN,Infinity].forEach(rawValue=>a.ok(R.rejectReason(f({rawValue,displayValue:'>87000'}))));});
test('same id with level vs return percentage cannot join',()=>{const price=f({id:'n',label:'Nasdaq',scope:'Nasdaq Composite',unit:'index',rawValue:27000});a.ok(R.normalizedId(price));a.equal(R.normalizedId({...price,unit:'%',rawValue:2.2}),null);});
test('same stable key with different scope is separated',()=>{const x=f({seriesKey:'BTC:spot',valueType:'price'});a.notEqual(R.normalizedId(x),R.normalizedId({...x,scope:'BTC/USDT'}));});
test('futures contracts must be explicit and cannot join',()=>{const x=f({scope:'WTI futures',seriesKey:'WTI',valueType:'price',unit:'USD/bbl'});a.equal(R.normalizedId(x),null);a.notEqual(R.normalizedId({...x,contract:'2026-10'}),R.normalizedId({...x,contract:'2026-11'}));});
test('unknown status and stale quote rejected',()=>{['stale','partial','foobar','error','window-unclear'].forEach(dataStatus=>a.ok(R.rejectReason(f({dataStatus}))));});
test('negative yields are allowed but not negative spot prices',()=>{a.equal(R.rejectReason(f({seriesKey:'BOND:yield',valueType:'yield',rawValue:-.2,unit:'%'})),null);a.ok(R.rejectReason(f({rawValue:-2})));});
test('missing sources excluded from series, not just labeled',()=>a.equal(R.series([{updatedAt:'2026-09-22 09:00',canonicalFacts:[f()],sources:[]}],'2026-09-22 09:00').observations,0));
test('no future lookahead and repeated same-time quotes deduplicated',()=>{const res=R.series([report('2026-09-22 09:00',[f({rawValue:101})]),report('2026-09-22 08:00',[f()]),report('2026-09-22 11:00',[f({asOf:'2026-09-22 11:00',rawValue:150})])],'2026-09-22 10:00');a.equal(res.rows[0].points.length,1);a.equal(res.rows[0].points[0].value,101);});
test('one incompatible asset does not block compatible subset',()=>{const s=(group,points)=>({group,kind:'price',points:points.map(([at,value])=>({at,value}))});const res=R.comparable([s('BTC',[[1,100],[2,110]]),s('Au',[[1,100],[2,90]]),s('Brent',[[3,50],[4,51]])]);a.equal(res.series.length,2);a.equal(res.base,1);a.ok(Math.abs(res.series[0].points[1].value-10)<1e-6);});
test('asynchronous baselines not normalized together',()=>a.equal(R.comparable([{group:'a',kind:'price',points:[{at:1,value:1},{at:2,value:2}]},{group:'b',kind:'price',points:[{at:3,value:1},{at:4,value:2}]}]).series.length,0));
test('all new module references are checked',()=>{const r=report('2026-09-22 10:00',[f()]);r.plainLanguage={verdict:'判断',impacts:[{evidenceFactIds:['missing']}]};a.match(R.check(r).join(),/未解析事实/);});
test('invalid null objects reported without exception',()=>a.ok(R.check({updatedAt:'2026-09-22 10:00',canonicalFacts:[null]}).length));
test('bad array types rejected',()=>a.ok(R.check({updatedAt:'2026-09-22 10:00',newsroom:{items:{}}}).length));
test('all original modules stay serializable and unchanged by adapters',()=>{const r=report('2026-09-22 10:00',[f()]);r.newsroom={items:[{id:'a',regions:['CN'],summary:'事实',title:'标题'}]};const s=JSON.stringify(r);R.newsRows(r);R.series([r],r.updatedAt);R.plain(r);a.equal(JSON.stringify(r),s);});
test('history path traversal rejected',()=>{a.equal(C.safePath('../data/latest.json'),null);a.ok(C.safePath('history/2026-09-22/0935.json'));});


test('malformed source records are reported before reference scanning',()=>{
 const r={updatedAt:'2026-09-22 09:35',canonicalFacts:[],sources:[null],judgmentRevisions:[null]};
 a.doesNotThrow(()=>R.check(r));
 a.ok(R.check(r).includes('sources含无效对象'));
 a.ok(R.check(r).includes('judgmentRevisions含无效对象'));
});


test('event radar aliases preserve pending timing and readable summary',()=>{
 const input={title:'中美元首会晤后续正式结果',eventAt:null,timing:'未来12—24小时重点观察，精确时点未确认',summary:'等待正式结果',scenarioA:'缓和',scenarioB:'摩擦'};
 const x=R.normalizeEvent(input);
 a.equal(x.at,null);
 a.equal(x.time,input.timing);
 a.equal(x.impact,input.summary);
 a.equal(x.summary,input.summary);
 a.equal(input.at,undefined,'adapter must not mutate original event');
});

test('eventAt is normalized to the same precise event time as at',()=>{
 const x=R.normalizeEvent({title:'release',eventAt:'2026-09-25T14:00:00Z',summary:'scheduled'});
 a.equal(C.parseTime(x.at),C.parseTime('2026-09-25T14:00:00Z'));
 a.equal(R.eventTime({eventAt:'2026-09-25T14:00:00Z'}),C.parseTime('2026-09-25T14:00:00Z'));
});
