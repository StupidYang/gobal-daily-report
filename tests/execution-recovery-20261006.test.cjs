'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../assets/execution-status.js'),X=require('../lib/execution.cjs');
const now=Date.parse('2026-10-06T01:30:00Z'),report={reportId:'2026-10-04-0712',updatedAt:'2026-10-04 07:12',reportMeta:{generatedAt:'2026-10-04T07:12:59.141+08:00'}};
const lease={version:1,generation:30,executionId:'20261004T040252-global-main',taskGroup:'global-main',slot:'global-main:2026-10-04T04',phase:'analyzing',startedAt:'2026-10-04T04:03:32.671Z',deadlineAt:'2026-10-04T04:23:32.671Z',updatedAt:'2026-10-04T04:03:39.468Z',stages:[],recentSlots:[]};
test('actual stalled report has a snapshot warning independent of scheduler and health',()=>{
 const before=JSON.stringify(report),s=S.snapshotStatus(report,now);
 assert.equal(s.status,'stale');assert.ok(s.ageMs>50*3600000);assert.match(s.text,/不是当前行情/);assert.match(s.text,/24小时窗口以该报告为准/);assert.equal(JSON.stringify(report),before);
});
test('a future or missing report clock is not accepted as a fresh report',()=>{
 for(const r of [{},{updatedAt:'invalid'},{reportMeta:{generatedAt:'2026-10-07T00:00:00Z'}}])assert.equal(S.snapshotStatus(r,now).status,'unverified');
 assert.equal(S.snapshotStatus({reportMeta:{generatedAt:'2026-10-06T01:00:00Z'}},now).status,'within-window');
});
test('a legacy UTC+8 report time has the same age on every machine timezone',()=>{
 const s=S.snapshotStatus({updatedAt:'2026-10-04 07:12'},now),explicit=S.snapshotStatus({reportMeta:{generatedAt:'2026-10-03T23:12:00Z'}},now);
 assert.equal(s.ageMs,explicit.ageMs);assert.match(s.text,/2026\/10\/4 07:12:00 UTC\+8/);
});
test('health HTTP failure does not suppress the known stale report warning',async()=>{
 const seen=[],fetch=async url=>{seen.push(url);return url.includes('health.json')?{ok:false,status:503}:{ok:true,json:async()=>url.includes('latest.json')?report:{productionPaused:false}};};
 const s=await S.readState(fetch,undefined,now);assert.equal(seen.length,3);assert.equal(s.health,null);assert.equal(s.snapshot.status,'stale');assert.deepEqual(s.readErrors,[{component:'health',error:'HTTP 503'}]);
});
test('invalid health JSON and unavailable control preserve independently read report state',async()=>{
 const s=await S.readState(async url=>{if(url.includes('runtime-control'))throw Error('network unavailable');return {ok:true,json:async()=>url.includes('latest.json')?report:{version:1,tasks:[]}};},undefined,now);
 assert.equal(s.health,null);assert.equal(s.control,null);assert.equal(s.snapshot.status,'stale');
});
test('failed report read is not described as a fresh report even with a deployed health entry',async()=>{
 const s=await S.readState(async url=>url.includes('latest.json')?{ok:false,status:404}:{ok:true,json:async()=>url.includes('health.json')?{version:1,tasks:{'global-main':{status:'deployed'}}}:{}},undefined,now);
 assert.equal(s.snapshot.status,'unverified');assert.ok(s.health);
});
test('ready-for-analysis is only collection complete, never evidence of an active analysis agent',()=>{
 assert.equal(S.describe({status:'ready-for-analysis',deadlineAt:'2026-10-06T02:00:00Z'},now),'采集已完成，等待分析提交');
 assert.equal(S.describe({status:'ready-for-analysis',deadlineAt:lease.deadlineAt},now),'本轮已超时，不能继续发布');
});
test('expired analysis allows a new normal slot via the existing lease authority, without changing the old input',()=>{
 const before=JSON.stringify(lease),next=X.acquire(lease,'global-main',{now,executionId:'20261006T013000-global-main'});
 assert.equal(next.generation,31);assert.equal(next.phase,'collecting');assert.equal(JSON.stringify(lease),before);
 assert.throws(()=>X.assertOwner(next,{executionId:lease.executionId,generation:30},now),/obsolete/);
 assert.throws(()=>X.assertOwner(lease,{executionId:lease.executionId,generation:30},now),/deadline/);
});
test('an active lease or a publishing lease is still never stolen',()=>{
 assert.throws(()=>X.acquire({...lease,deadlineAt:'2026-10-06T02:00:00Z'},'global-main',{now}),e=>e.code==='BUSY');
 assert.throws(()=>X.acquire({...lease,phase:'publishing'},'global-main',{now}),e=>e.code==='BUSY');
});
test('task entry makes expired lease admission conditional without removing denial safeguards',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../automation/entry/global-main.txt'),'utf8');
 assert.match(text,/不得只因非终态就永久busy/);assert.match(text,/phase=publishing始终视为占用/);assert.match(text,/不续交旧execution、不手改锁/);
 assert.match(text,/未取得解除或批准证据/);assert.match(text,/不换工具或传输格式重试/);assert.match(text,/不得调用任务管理工具/);
});
