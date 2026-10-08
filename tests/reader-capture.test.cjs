'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{assertPainted}=require('./reader-capture.cjs');
test('blank or nearly blank screenshots fail visual proof',()=>{
 for(const changed of [0,1,3900])assert.throws(()=>assertPainted({total:390000,changed}),/blank/);
});
test('visible screenshot content passes pixel proof',()=>assert.doesNotThrow(()=>assertPainted({total:390000,changed:35000})));
test('invalid screenshot pixel measurements cannot pass',()=>{
 for(const stats of [null,{}, {total:0,changed:0},{total:100,changed:101},{total:100,changed:NaN},{total:100,changed:1.5}])assert.throws(()=>assertPainted(stats));
});
