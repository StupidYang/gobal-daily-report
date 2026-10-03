'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../lib/live-collector.cjs');
const url='https://www.deribit.com/api/v2/public/ticker?instrument_name=BTC-PERPETUAL';
const checkedAt=1791045009703+1000;
const raw={jsonrpc:'2.0',testnet:false,result:{instrument_name:'BTC-PERPETUAL',timestamp:1791045009703,open_interest:800706030,current_funding:0,funding_8h:0,mark_price:84801.78}};
test('volatile public venue facts freeze exact observation values including genuine zero rates',()=>{const x=C.publicData(url,JSON.stringify(raw),checkedAt);assert.equal(x.observedAt,'2026-10-03T16:30:09.703Z');assert.equal(x.openInterest,800706030);assert.equal(x.currentFunding,0);assert.equal(x.funding8h,0);assert.match(x.scope,/not global/);});
test('wrong instrument, testnet, malformed response and unavailable HTML cannot become evidence',()=>{for(const x of [{...raw,testnet:true},{...raw,result:{...raw.result,instrument_name:'ETH-PERPETUAL'}},{...raw,result:{...raw.result,open_interest:null}},{error:{code:1}}])assert.throws(()=>C.publicData(url,JSON.stringify(x),checkedAt));assert.throws(()=>C.publicData(url,'<html>Unavailable</html>'));});
test('ordinary news and unapproved lookalikes never publish body content',()=>{assert.equal(C.publicData('https://www.bls.gov/news.release/empsit.htm','copyright body'),undefined);assert.equal(C.publicData(url.replace('www.deribit.com','www.deribit.com.evil.test'),JSON.stringify(raw)),undefined);});

test('future timestamps, negative OI, and nonpositive mark prices are rejected',()=>{for(const invalid of [{timestamp:checkedAt+30001},{timestamp:1.5},{open_interest:-1},{mark_price:0},{mark_price:-1}])assert.throws(()=>C.publicData(url,JSON.stringify({...raw,result:{...raw.result,...invalid}}),checkedAt));});
test('negative funding remains legitimate and the documented clock skew is bounded',()=>{const x=C.publicData(url,JSON.stringify({...raw,result:{...raw.result,timestamp:checkedAt+30000,current_funding:-0.001,funding_8h:-0.002}}),checkedAt);assert.equal(x.currentFunding,-0.001);assert.equal(x.funding8h,-0.002);});
