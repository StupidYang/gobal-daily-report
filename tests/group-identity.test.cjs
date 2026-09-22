'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../assets/watchlist-core.js');
const now=Date.parse('2026-09-22T13:00:00+08:00');
const base=()=>({moduleVersion:1,module:'asia-equities',runId:'fixture-asia-equities',generatedAt:'2026-09-22T12:00:00+08:00',dataAsOf:'2026-09-22T11:30:00+08:00',status:'partial',sources:[],payload:{groups:[]}});
const group=market=>({id:'公用事业',name:'公用事业',market,expectedCount:null,rows:[]});
test('same industry name across CN and HK is not a duplicate',()=>{
 const m=base();m.payload.groups=[group('CN'),group('HK')];
 assert.deepEqual(W.validate(m,'asia-equities',now),[]);
});
test('same market and industry identity still rejects duplicates',()=>{
 const m=base();m.payload.groups=[group('CN'),group('CN')];
 assert.ok(W.validate(m,'asia-equities',now).includes('板块分组无效'));
});
test('market-scoped identities do not permit cross-role writes',()=>{
 const m=base();m.payload.groups=[group('US')];
 assert.ok(W.validate(m,'asia-equities',now).includes('跨模块市场越权'));
});
