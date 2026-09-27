'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../assets/execution-status.js');

test('paused canary groups are described as intentionally paused, not missing',()=>{
 const control={supervisedAcceptance:{pausedTaskGroups:['asia-session','us-session']}};
 assert.equal(S.taskStatus('asia-session',null,control),'canary期间主动暂停');
 assert.equal(S.taskStatus('us-session',null,control),'canary期间主动暂停');
 assert.equal(S.taskStatus('global-main',null,control),'尚无新执行记录');
});

test('actual runtime state always wins over canary fallback',()=>{
 const control={supervisedAcceptance:{pausedTaskGroups:['asia-session']}};
 assert.equal(S.taskStatus('asia-session',{status:'failed'},control),'本轮失败，保留旧报告');
});


test('stale enabled global-main is surfaced even when repository production switch is open',()=>{
 const control={productionPaused:false,supervisedAcceptance:{enabledTaskGroups:['global-main']}};
 const now=Date.parse('2026-09-27T04:00:00Z');
 const x=S.freshnessStatus(
  {reportMeta:{generatedAt:'2026-09-25T03:13:03+08:00'}},
  {updatedAt:'2026-09-24T19:16:23Z'},
  control,now
 );
 assert.equal(x.stale,true);
 assert.match(x.text,/连续更新疑似中断/);
 assert.match(x.text,/原生定时任务/);
});

test('fresh runtime and report do not show a scheduler alarm',()=>{
 const control={productionPaused:false,supervisedAcceptance:{enabledTaskGroups:['global-main']}};
 const now=Date.parse('2026-09-27T04:00:00Z');
 assert.equal(S.freshnessStatus(
  {reportMeta:{generatedAt:'2026-09-27T11:20:00+08:00'}},
  {updatedAt:'2026-09-27T03:25:00Z'},
  control,now
 ),null);
});

test('maintenance pause suppresses scheduler staleness alarm',()=>{
 const control={productionPaused:true,supervisedAcceptance:{enabledTaskGroups:['global-main']}};
 assert.equal(S.freshnessStatus({}, {}, control,Date.now()),null);
});
