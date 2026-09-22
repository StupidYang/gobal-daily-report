'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('../assets/terminal-core.js');require('../assets/display-core.js');
const B=require('../assets/briefing.js');
const report=JSON.parse(fs.readFileSync('history/2026-09-22/1558.json'));
const quotes=JSON.parse(fs.readFileSync(report.reportMeta.moduleRefs.quotes.path));
const copy=x=>JSON.parse(JSON.stringify(x));
test('all configured core mainland indices have a fixed overview position',()=>{
 const config=JSON.parse(fs.readFileSync('config/watchlist.json'));
 assert.deepEqual(B.CN_INDICES.map(x=>x[0]),config.required.filter(x=>x.id.startsWith('INDEX:CN:')).map(x=>x.id));
});
test('regression: 1558 editorial facts omit mainland prices but frozen quotes fill all six',()=>{
 assert.equal(B.mainlandQuotes(report).filter(q=>q.origin!=='missing').length,0);
 const rows=B.mainlandQuotes(report,quotes);assert.equal(rows.length,6);
 for(const q of rows){const raw=quotes.payload.items.find(x=>x.instrumentId===q.instrumentId);assert.equal(q.price,raw.price);assert.equal(q.asOf,raw.asOf);assert.equal(q.status,raw.status);assert.equal(q.origin,'frozen');assert.ok(q.proof.length);}
});
test('overview read never rewrites raw report or source timestamps',()=>{
 const before=JSON.stringify({report,quotes});B.mainlandQuotes(report,quotes);assert.equal(JSON.stringify({report,quotes}),before);
});
test('empty editorial facts and no frozen ref still retain six missing positions',()=>{
 const r={updatedAt:'2026-09-22 20:00',canonicalFacts:[]};const rows=B.mainlandQuotes(r);assert.equal(rows.length,6);assert.ok(rows.every(x=>x.price===null&&x.origin==='missing'));
});
test('evening overview keeps all mainland indices',()=>{
 const r=copy(report);r.updatedAt='2026-09-22 21:00';r.reportMeta.generatedAt='2026-09-22T21:00:00+08:00';
 assert.equal(B.mainlandQuotes(r,quotes).filter(x=>x.origin!=='missing').length,6);
});
test('quote source fetch cannot replace report freeze with newer live module',()=>{
 const q=copy(quotes);q.runId='another-live-run';assert.throws(()=>B.mainlandQuotes(report,q),/身份/);
});
test('invalid or traversing quote paths are never requested as report data',()=>{
 for(const path of ['https://external.test/quotes.json','data/modules/quotes.json','data/runs/quotes/../../latest.json']){const r=copy(report);r.reportMeta.moduleRefs.quotes.path=path;assert.throws(()=>B.mainlandQuotes(r,quotes),/引用/);}
});
test('future quote values remain visibly missing rather than leak into history',()=>{
 const q=copy(quotes);q.payload.items[0].asOf='2026-09-22T23:59:00+08:00';assert.equal(B.mainlandQuotes(report,q)[0].origin,'missing');
});
test('invalid numeric values, wrong units and missing evidence are never shown as index levels',()=>{
 for(const change of [{price:null},{price:0},{price:'3900'},{currency:'CNY'},{sourceIds:[]},{status:'invalid'}]){const q=copy(quotes);Object.assign(q.payload.items[0],change);const row=B.mainlandQuotes(report,q)[0];assert.equal(row.origin,'missing');assert.equal(row.price,null);}
});
test('synthetic quote cannot enter the production report overview',()=>{
 const q=copy(quotes);q.dataMode='synthetic';assert.throws(()=>B.mainlandQuotes(report,q),/模式/);
});
test('canonical instrumentId, seriesKey and namespaced ids resolve without mistaking turnover for an index',()=>{
 assert.equal(B.cnIdentity({id:'quotes:INDEX:CN:SSE'}),'INDEX:CN:SSE');
 assert.equal(B.cnIdentity({seriesKey:'INDEX:CN:CSI300'}),'INDEX:CN:CSI300');
 assert.equal(B.cnIdentity({label:'A股成交额',rawValue:2140000000000}),null);
});
test('frozen run generation and data cutoffs must match the report reference',()=>{
 const q=copy(quotes);q.generatedAt='2026-09-22T15:41:00+08:00';assert.throws(()=>B.mainlandQuotes(report,q),/生成时间/);
 q.generatedAt='2026-09-22T21:00:00+08:00';assert.throws(()=>B.mainlandQuotes(report,q),/晚于报告/);
});
