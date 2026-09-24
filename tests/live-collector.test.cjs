'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../lib/live-collector.cjs');
const now=Date.parse('2026-09-23T03:00:00Z');
const i={id:'EQUITY:US:AAPL',symbol:'AAPL',name:'Apple',currency:'USD'};
const meta={symbol:'AAPL',regularMarketPrice:100,regularMarketTime:now/1000-100,chartPreviousClose:90,instrumentType:'EQUITY',currency:'USD',exchangeTimezoneName:'America/New_York'};
const wrap=m=>({chart:{result:[{meta:m}]}});
test('source time is never replaced by retrieval time',()=>assert.equal(C.yahoo(i,wrap(meta),'AAPL',now).asOf,'2026-09-23T02:58:20.000Z'));
test('wrong instrument or currency is rejected',()=>{assert.throws(()=>C.yahoo(i,wrap({...meta,symbol:'MSFT'}),'AAPL',now));assert.throws(()=>C.yahoo(i,wrap({...meta,currency:'EUR'}),'AAPL',now));assert.throws(()=>C.yahoo(i,wrap({...meta,instrumentType:'ETF'}),'AAPL',now));});
test('future and timezone-less timestamps are rejected',()=>{assert.throws(()=>C.timestamp('2026-09-23T05:00:00Z',now));assert.throws(()=>C.timestamp('2026-09-23T02:00:00',now));});
test('crude contract is read from explicit delivery metadata',()=>{assert.equal(C.contractFromMeta({shortName:'Brent Crude Oil Last Day Financ',longName:'Brent Dec 26'}),'2026-12');assert.equal(C.contractFromMeta({shortName:'Crude Oil Nov 2026'}),'2026-11');assert.throws(()=>C.contractFromMeta({shortName:'Crude Oil front month'}));});
test('metals must be spot identity with exact time, not GC future alias',()=>{assert.throws(()=>C.gold({id:'METAL:XAUUSD',symbol:'XAU/USD'},{symbol:'GC',price:4500,updatedAt:'2026-09-23T02:58:00Z'},now));assert.equal(C.gold({id:'METAL:XAUUSD',symbol:'XAU/USD'},{symbol:'XAU',currency:'USD',price:4500,updatedAt:'2026-09-23T02:58:00Z'},now).currency,'USD/oz');});
test('Treasury date-only observation never invents an intraday asOf',()=>{const x=C.treasury({id:'RATE:US2Y'},'<m:properties><d:NEW_DATE>2026-09-22T00:00:00</d:NEW_DATE><d:BC_2YEAR>4.50</d:BC_2YEAR></m:properties>',now);assert.equal(x.price,null);assert.equal(x.asOf,null);assert.equal(x.observationDate,'2026-09-22');assert.equal(x.dailyValue,4.5);});
test('spot USD trade has no invented 24-hour return',()=>{const x=C.coinbase({id:'CRYPTO:BTC:USD',symbol:'BTC'},{price:'86000',time:'2026-09-23T02:59:00Z'},now);assert.equal(x.changePct,null);assert.equal(x.currency,'USD');});
test('429 stops further calls to the same provider',async()=>{let calls=0;const config={required:[{...i,id:'INDEX:US:SP500'},{...i,id:'INDEX:US:NDX'}],usPools:{}};const x=await C.collect(config,{concurrency:1,fetchImpl:async()=>{calls++;return {ok:false,status:429};}});assert.equal(calls,1);assert.equal(x.errors.length,2);});
test('collector request is bounded even if a provider ignores abort',async()=>{const start=Date.now(),x=await C.collect({required:[{id:'CRYPTO:BTC:USD',market:'CRYPTO',symbol:'BTC'}],usPools:{}},{requestMs:30,budgetMs:100,fetchImpl:()=>new Promise(()=>{})});assert.equal(x.errors.length,1);assert.ok(Date.now()-start<500);});
test('slow response body is independently bounded',async()=>{const start=Date.now(),x=await C.collect({required:[{id:'CRYPTO:BTC:USD',market:'CRYPTO',symbol:'BTC'}],usPools:{}},{requestMs:30,budgetMs:100,fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},text:()=>new Promise(()=>{})})});assert.equal(x.errors.length,1);assert.ok(Date.now()-start<500);});

test('packet completeness cannot ignore a failed requested evidence document',async()=>{
 const documents=[{id:'doc-ok',url:'https://example.org/ok',title:'ok'},{id:'doc-fail',url:'https://example.org/fail',title:'fail'}];
 const x=await C.collect({required:[],usPools:{}},{documents,concurrency:2,requestMs:200,budgetMs:1000,fetchImpl:async url=>url.endsWith('/fail')?{ok:false,status:503}:{ok:true,status:200,headers:{get:()=>null},text:async()=>'<html>ok</html>'}});
 assert.equal(x.quotesComplete,true);assert.equal(x.documentsRequested,2);assert.equal(x.documentsRetrieved,1);assert.equal(x.documentsComplete,false);assert.equal(x.complete,false);
});
test('evidence documents use bounded concurrency instead of serial waits',async()=>{
 let active=0,maxActive=0;
 const fetchImpl=async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,20));active--;return {ok:true,status:200,headers:{get:()=>null},text:async()=>'<html>evidence</html>'};};
 const documents=[1,2,3].map(n=>({id:'doc-'+n,url:'https://example.org/'+n,title:'doc '+n,kind:'news'}));
 const x=await C.collect({required:[],usPools:{}},{documents,concurrency:3,requestMs:200,budgetMs:1000,fetchImpl});
 assert.equal(x.documents.length,3);assert.equal(x.errors.length,0);assert.equal(maxActive,3);assert.deepEqual(x.documents.map(d=>d.id),documents.map(d=>d.id));
});


test('401 or 403 on a document host stops later document calls to that host',async()=>{
 let calls=0;
 const documents=[
  {id:'r1',url:'https://www.reuters.com/world/a/',title:'a',kind:'news'},
  {id:'r2',url:'https://www.reuters.com/world/b/',title:'b',kind:'news'}
 ];
 const x=await C.collect({required:[],usPools:{}},{documents,concurrency:1,requestMs:200,budgetMs:1000,fetchImpl:async()=>{calls++;return {ok:false,status:401,headers:{get:()=>null},text:async()=>''};}});
 assert.equal(calls,1);
 assert.equal(x.documentsRetrieved,0);
 assert.equal(x.documentsComplete,false);
 assert.equal(x.errors.length,2);
 assert.match(x.errors[0].error,/401/);
 assert.match(x.errors[1].error,/paused after rate limit|paused after access denial|Provider paused/);
});

test('access denial on document host does not block quote provider or another document host',async()=>{
 let calls=[];
 const documents=[
  {id:'r1',url:'https://www.reuters.com/world/a/',title:'a',kind:'news'},
  {id:'b1',url:'https://www.bls.gov/news.release/cpi.nr0.htm',title:'b',kind:'official'}
 ];
 const fetchImpl=async url=>{calls.push(url);if(url.includes('reuters.com'))return {ok:false,status:403,headers:{get:()=>null},text:async()=>''};return {ok:true,status:200,headers:{get:()=>null},text:async()=>'<html>ok</html>'};};
 const x=await C.collect({required:[],usPools:{}},{documents,concurrency:1,requestMs:200,budgetMs:1000,fetchImpl});
 assert.equal(calls.length,2);
 assert.equal(x.documentsRetrieved,1);
 assert.equal(x.documents[0].id,'b1');
});
