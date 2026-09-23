'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{route,select}=require('../scripts/route-execution-event.cjs');
const sha='a'.repeat(40),event={ref:'refs/heads/gdr-runtime',after:sha,commits:[{id:sha}]};
test('Actions payload without added arrays is routed using pinned commit metadata',async()=>{const r=await route(event,async(method,url)=>{assert.equal(method,'GET');assert.ok(url.includes('/commits/'+sha));return {sha,files:[{filename:'runtime/requests/request-1.json',status:'added'}]};});assert.equal(r.mode,'request');assert.equal(r.id,'request-1');});
test('modified immutable request and multiple submissions are rejected',()=>{assert.throws(()=>select([{filename:'runtime/requests/a.json',status:'modified'}]));assert.throws(()=>select([{filename:'runtime/requests/a.json',status:'added'},{filename:'runtime/submissions/b.json',status:'added'}]));});
test('cross-branch and mismatched commit responses fail closed',async()=>{await assert.rejects(route({...event,ref:'refs/heads/main'},()=>{}));await assert.rejects(route(event,async()=>({sha:'b'.repeat(40),files:[]})));});
