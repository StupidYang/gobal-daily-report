'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/terminal-core.js');
const f=(o={})=>({id:'btc',label:'BTC',rawValue:100,unit:'USD',scope:'BTC/USD',asOf:'2026-09-22T08:00:00+08:00',dataStatus:'delayed',sourceIds:['source'],...o});
const r=(t,fs)=>({reportId:t,updatedAt:t,canonicalFacts:fs});

test('UTC+8 text, ISO and explicit offset identify the same instant',()=>{
 assert.equal(C.parseTime('2026-09-22 08:00'),C.parseTime('2026-09-22T08:00:00+08:00'));
 assert.equal(C.parseTime('2026-09-22 08:00 UTC+8'),C.parseTime('2026-09-22T00:00:00Z'));
});
test('ambiguous dates and invalid/future times never become just now',()=>{
 ['08:00','2026-09-22 08:00附近','2026-02-30 09:00','2026-09-22','wrong'].forEach(x=>assert.equal(C.parseTime(x),null));
 assert.equal(C.parseTime(new Date(NaN)),null);
 assert.match(C.age('2026-09-22 10:00',C.parseTime('2026-09-22 08:00')),/未来/);
});
test('health categories sum exactly; closed or stale is not fresh',()=>{
 const h=C.health([f({dataStatus:'closed'}),f({dataStatus:'stale'}),f({dataStatus:'partial'}),f({dataStatus:'other'})]);
 assert.equal(h.total,4);assert.equal(h.counts.live,0);assert.equal(h.counts.stale,1);assert.equal(h.counts.unknown,1);
 assert.equal(Object.values(h.counts).reduce((a,b)=>a+b,0),4);
});
test('coverage absent is unknown, not 24 hours',()=>{assert.match(C.coverage({}).label,/未知/);assert.equal(C.coverage({coverageHours:13.58,isFull24h:false}).ratio,13.58/24);});
test('ledger uses last status per topic, not number of revisions as predictions',()=>{
 const l=C.ledger([{id:'a',status:'待验证',updatedAt:'2026-09-22 08:00'},{id:'a',status:'得到支持',updatedAt:'2026-09-22 09:00'},{id:'b',status:'受到削弱'}]);
 assert.equal(l.total,2);assert.equal(l.counts['得到支持'],1);assert.equal(l.counts['待验证'],0);
});
test('null, text thresholds and nonfinite values cannot become chart points',()=>{
 [null,NaN,Infinity,'87000'].forEach(v=>assert.equal(C.seriesIdentity(f({rawValue:v,displayValue:'>$87,000'})),null));
});
test('Nasdaq index levels and return percentages cannot share a series',()=>{
 const index=f({id:'nasdaq_close',label:'Nasdaq',scope:'Nasdaq Composite',rawValue:27122.09,unit:'index'});
 assert.ok(C.seriesIdentity(index));assert.equal(C.seriesIdentity({...index,rawValue:2.26,unit:'%'}),null);
});
test('a futures contract cannot be inferred from a front-month label',()=>{
 const oil=f({scope:'Brent November futures',seriesKey:'ICE:BRENT',valueType:'price',unit:'USD/bbl'});
 assert.equal(C.seriesIdentity(oil),null);
 assert.notEqual(C.seriesIdentity({...oil,contract:'2026-11'}),C.seriesIdentity({...oil,contract:'2026-12'}));
});
test('missing or stale observations cannot create false continuity',()=>{
 ['missing','error','stale','window-unclear','unknown','partial'].forEach(dataStatus=>assert.equal(C.seriesIdentity(f({dataStatus})),null));
});
test('repeated closing quote deduplicates and newer evidence wins regardless of input order',()=>{
 const reports=[r('2026-09-22 09:00',[f({rawValue:101})]),r('2026-09-22 08:00',[f()])];
 const a=C.collectSeries(reports,'2026-09-22 10:00');assert.equal(a[0].points.length,1);assert.equal(a[0].points[0].value,101);
});
test('historical viewing never includes future observations or reports',()=>{
 const reports=[r('2026-09-22 08:00',[f()]),r('2026-09-22 10:00',[f({asOf:'2026-09-22 10:00',rawValue:200})])];
 assert.equal(C.collectSeries(reports,'2026-09-22 09:00')[0].points.length,1);
});
test('cross asset chart rejects asynchronous baselines',()=>{
 assert.deepEqual(C.comparable([{kind:'price',points:[{at:1,value:1},{at:2,value:2}]},{kind:'price',points:[{at:3,value:1},{at:4,value:2}]}]).series,[]);
});
test('normalization uses actual same-time baseline and no interpolation',()=>{
 const a=C.comparable([{kind:'price',points:[{at:1,value:100},{at:2,value:105}]},{kind:'index',points:[{at:1,value:10},{at:3,value:9}]}]);
 assert.equal(a.base,1);assert.ok(Math.abs(a.series[0].points[1].value-5)<1e-8);assert.ok(Math.abs(a.series[1].points[1].value+10)<1e-8);assert.equal(a.series[0].points.length,2);
});
test('history index accepts only local report paths',()=>{
 assert.ok(C.safePath('history/2026-09-22/0935.json'));assert.ok(C.safePath('history/2026-09-22/0935-r2.json'));
 ['https://evil.test/a.json','../secrets.json','history/../data/latest.json'].forEach(p=>assert.equal(C.safePath(p),null));
});
test('fact/source references are checked without reading display numbers',()=>{
 const x={canonicalFacts:[f()],sources:[{id:'source'}],metrics:[{factId:'missing'}]};assert.ok(C.issues(x).includes('未解析事实: missing'));
});
test('daily return parser refuses bp and mixed windows',()=>{assert.equal(C.returnPct({changeLabel:'+2.51%'}),2.51);assert.equal(C.returnPct({changeLabel:'-4.5bp'}),null);assert.equal(C.returnPct({changeLabel:'7% / 24h'}),null);});
