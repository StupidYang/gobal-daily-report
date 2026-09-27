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
