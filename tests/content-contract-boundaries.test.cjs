'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Q=require('../assets/content-contract.js');
test('Repeated normalization cannot turn an unnamed definition into a valid term',()=>{
 const r={dataDefinitions:[{id:'x',text:'Preserved original explanation'}]};
 const once=Q.normalize(r),twice=Q.normalize(once);assert.deepEqual(twice,once);
 assert.equal(twice.dataDefinitions[0]._missingTerm,true);
 assert.ok(Q.quality(twice).errors.some(e=>e.includes('术语或解释为空')));
});
test('Invalid numerical observations must not inflate coverage',()=>{
 const c={required:[{id:'x',name:'x'}]},m={sources:[{id:'s',url:'https://example.com/'}],payload:{items:[{instrumentId:'x',price:100,asOf:'2026-09-22T10:00:00Z',sourceIds:['s'],status:'invalid'}]}};
 assert.equal(Q.quoteCoverage(c,m,Date.parse('2026-09-23T00:00:00Z')).numeric,0);
});
