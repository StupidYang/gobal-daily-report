'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../assets/execution-status.js');

test('paused canary groups are described as intentionally paused, not missing',()=>{
 const control={supervisedAcceptance:{pausedTaskGroups:['asia-session','us-session']}};
 assert.equal(S.taskStatus('asia-session',null,control),'额外交易节点按配置暂停');
 assert.equal(S.taskStatus('us-session',null,control),'额外交易节点按配置暂停');
 assert.equal(S.taskStatus('global-main',null,control),'尚无新执行记录');
});

test('actual runtime state always wins over canary fallback',()=>{
 const control={supervisedAcceptance:{pausedTaskGroups:['asia-session']}};
 assert.equal(S.taskStatus('asia-session',{status:'failed'},control),'本轮失败，保留旧报告');
});


test('stale enabled global-main is surfaced even while production is open',()=>{
 const control={productionPaused:false,supervisedAcceptance:{enabledTaskGroups:['global-main']}};
 const now=Date.parse('2026-09-27T04:00:00Z');
 const x=S.freshnessStatus({reportMeta:{generatedAt:'2026-09-25T03:13:03+08:00'}},{updatedAt:'2026-09-24T19:16:23Z'},control,now);
 assert.equal(x.stale,true);assert.match(x.text,/连续更新疑似中断/);assert.match(x.text,/原生定时任务/);
});
test('fresh report and runtime suppress the stale alarm',()=>{
 const control={productionPaused:false,supervisedAcceptance:{enabledTaskGroups:['global-main']}},now=Date.parse('2026-09-27T04:00:00Z');
 assert.equal(S.freshnessStatus({reportMeta:{generatedAt:'2026-09-27T11:20:00+08:00'}},{updatedAt:'2026-09-27T03:25:00Z'},control,now),null);
});
test('maintenance pause suppresses the stale alarm',()=>assert.equal(S.freshnessStatus({}, {}, {productionPaused:true,supervisedAcceptance:{enabledTaskGroups:['global-main']}},Date.now()),null));

const expiredExecution={requestId:'20261004T040252-global-main',status:'ready-for-analysis',at:'2026-10-04T04:03:40.561Z',deadlineAt:'2026-10-04T04:23:32.671Z',error:null,reportId:null};
const oldScheduler={schedulerObservation:{version:1,recordedAt:'2026-09-29T14:09:50.322Z',tasks:[{id:'global-main',enabled:true}]}};
const afterDeadline=Date.parse('2026-10-05T04:00:00Z');
test('actual health shape without executionStartedAt shows expiry and the independent old scheduler clock',()=>{
 const text=S.taskText('global-main',expiredExecution,oldScheduler,afterDeadline);
 assert.match(text,/^本轮已超时，不能继续发布/);
 assert.match(text,/执行记录：2026\/10\/4 12:03:40 UTC\+8/);
 assert.match(text,/调度器当前状态未核验；上次排查记录为启用 · 排查记录：2026\/9\/29 22:09:50 UTC\+8/);
 assert.equal(text.match(/12:03:40/g).length,1);
});
test('scheduler observations never hide active, failed, or terminal execution evidence',()=>{
 for(const [status,expected]of [['collecting','正在采集'],['ready-for-analysis','采集已完成，等待分析提交'],['needs-revision','内容待修订'],['failed','本轮失败'],['completed','仓库发布已确认'],['deployed','公网版本与正文验收已通过']]){
  const x={...expiredExecution,status,deployed:true,deployment:{status:'verified'}};
  const text=S.taskText('global-main',x,oldScheduler,Date.parse('2026-10-04T04:10:00Z'));
  assert.ok(text.startsWith(expected));assert.match(text,/调度器当前状态未核验/);
 }
 for(const status of ['collecting','ready-for-analysis','needs-revision'])assert.match(S.taskText('global-main',{...expiredExecution,status},oldScheduler,afterDeadline),/^本轮已超时/);
});
test('errors and valid fallback timestamps stay attached to execution, never scheduler evidence',()=>{
 const x={status:'failed',at:'invalid',executionFinishedAt:'2026-10-04T04:24:00Z',error:'submission rejected\nprivate detail'};
 const text=S.taskText('global-main',x,oldScheduler,afterDeadline);
 assert.match(text,/执行结束：2026\/10\/4 12:24:00 UTC\+8；执行错误：submission rejected；调度器/);
 assert.doesNotMatch(text,/Invalid Date|private detail/);
 const missing=S.taskText('global-main',{status:'failed',at:'invalid'},oldScheduler,afterDeadline);
 assert.match(missing,/执行记录时间未提供/);assert.match(missing,/排查记录：2026\/9\/29/);
});
test('missing or invalid scheduler records do not inherit the execution timestamp',()=>{
 for(const control of [null,{schedulerObservation:{version:1,recordedAt:'invalid',tasks:[{id:'global-main',enabled:true}]}},{schedulerObservation:{version:1,recordedAt:'2026-10-06T00:00:00Z',tasks:[{id:'global-main',enabled:true}]}}]){
  const text=S.taskText('global-main',expiredExecution,control,afterDeadline);
  assert.match(text,/调度器当前状态未核验；缺少有效排查记录$/);assert.doesNotMatch(text,/ · 排查记录：/);
 }
 const missing=S.taskText('global-main',null,oldScheduler,afterDeadline);
 assert.match(missing,/^尚无新执行记录；调度器当前状态未核验/);assert.doesNotMatch(missing,/执行记录：/);
});
test('reader rendering and refresh preserve separate execution and scheduler timestamps',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let current=Date.parse('2026-10-04T04:10:00Z'),refresh;
 class Clock extends Date{static now(){return current;}}
 const box={children:[],replaceChildren(){this.children=[];},append(x){this.children.push(x);}};
 const document={documentElement:{dataset:{mode:'production'}},getElementById:id=>id==='executionStatus'?box:{addEventListener:(_,fn)=>{refresh=fn;}},createElement:()=>({textContent:'',children:[],append(x){this.children.push(x);}})};
 const health={version:1,tasks:{'global-main':expiredExecution}};
 const fetch=async url=>({ok:true,json:async()=>url.includes('health.json')?health:url.includes('runtime-control')?oldScheduler:{}});
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/execution-status.js'),'utf8'),{document,fetch,Date:Clock,AbortController,setTimeout,clearTimeout});
 await new Promise(resolve=>setImmediate(resolve));assert.match(box.children.find(x=>x.className==='execution-details').children.find(x=>x.textContent.startsWith('全球主报告：')).textContent,/全球主报告：采集已完成，等待分析提交 · 执行记录：2026\/10\/4/);
 current=afterDeadline;await refresh();
 assert.match(box.children[0].textContent,/报告时效无法核验/);const global=box.children.find(x=>x.className==='execution-details').children.find(x=>x.textContent.startsWith('全球主报告：'));assert.match(global.textContent,/全球主报告：本轮已超时/);assert.match(global.textContent,/排查记录：2026\/9\/29/);assert.equal(box.children.length,7);assert.ok(box.children.some(x=>x.textContent.startsWith('最后成功发布：回执尚未核验')));assert.ok(box.children.some(x=>x.textContent.startsWith('最近一次尝试（全球主报告）：本轮已超时')));
});
