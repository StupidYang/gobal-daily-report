'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../assets/execution-status.js');
const now=Date.parse('2026-10-08T03:00:00Z'),batch='20261008T020521-global-main',reportId='2026-10-08-1010';
const roles=['quotes','asia-equities','us-equities','news','macro','research','synthesis'];
function fixture(){
 const ref=role=>({runId:batch+'-'+role,path:'data/runs/'+role+'/'+batch+'-'+role+'.json',generatedAt:'2026-10-08T10:10:15+08:00',dataAsOf:null});
 const report={reportId,updatedAt:'2026-10-08 10:10',reportMeta:{generatedAt:'2026-10-08T10:10:15+08:00',moduleRefs:Object.fromEntries(roles.filter(r=>r!=='synthesis').map(r=>[r,ref(r)]))}};
 const receipt={batchId:batch,reportId,status:'published',errors:[],processedAt:'2026-10-08T10:10:59+08:00',taskGroup:'global-main',modules:roles.map(role=>({role,runId:batch+'-'+role,sha256:'a'.repeat(64)}))};
 const health={version:1,tasks:{'global-main':{requestId:'20261008T023430-global-main',status:'skipped-busy',at:'2026-10-08T02:34:41Z',error:'This task hour is already completed',reportId:null}}};
 const control={productionPaused:false,supervisedAcceptance:{enabledTaskGroups:['global-main'],pausedTaskGroups:['asia-session','us-session']}};
 return {report,receipt,health,control};
}
function dom(){
 const node=tag=>({tagName:tag,children:[],textContent:'',append(x){this.children.push(x);},replaceChildren(){this.children=[];}});
 return {box:node('aside'),document:{createElement:node}};
}
function draw(f){const d=dom();S.render(d.box,{latest:f.report,receipt:f.receipt,health:f.health,control:f.control,snapshot:S.snapshotStatus(f.report,now),readErrors:[]},d.document,now);return d.box;}
const all=node=>[node.textContent,...node.children.flatMap(all)].join('\n');
test('published report and later duplicate are independent visible facts',()=>{
 const f=fixture(),box=draw(f),text=all(box);
 assert.match(text,/最后成功发布：2026\/10\/8 10:10:59 UTC\+8 · 2026-10-08-1010 · 7个模块发布回执已核对/);
 assert.match(text,/最近一次尝试（全球主报告）：该小时已完成，重复请求已跳过/);
 assert.match(text,/10:34:41 UTC\+8；不是发布失败/);
 assert.ok(text.indexOf('最后成功发布')<text.indexOf('最近一次尝试'));
 assert.match(text,/A股港股额外任务：按配置暂停；对应模块已随 2026-10-08-1010 全球主报告发布/);
 assert.match(text,/美股额外任务：按配置暂停；对应模块已随 2026-10-08-1010 全球主报告发布/);
 assert.match(text,/不代表行情实时/);assert.doesNotMatch(text,/canary/);
});
test('later failed, collecting or expired attempts cannot replace last successful publication',()=>{
 for(const status of ['failed','collecting','ready-for-analysis','needs-revision']){
  const f=fixture();f.health.tasks['global-main']={status,at:'2026-10-08T02:40:00Z',deadlineAt:'2026-10-08T02:50:00Z',error:status==='failed'?'actual failure':null};
  const text=all(draw(f));assert.match(text,/7个模块发布回执已核对/);
  assert.match(text,status==='failed'?/最近一次尝试.*本轮失败.*actual failure/:/最近一次尝试.*本轮已超时/);
 }
});
test('other busy reasons are not presented as already completed',()=>{
 assert.equal(S.describe({status:'skipped-busy',error:'Another live execution owns the lease'},now),'本轮跳过：已有执行');
 assert.match(S.attemptText('global-main',{status:'skipped-busy',error:'Another live execution owns the lease'},now),/原因：Another live execution/);
});
test('a report alone or an unrelated, failed, incomplete or malformed receipt cannot prove success',()=>{
 for(const change of [f=>f.receipt=null,f=>f.receipt.reportId='2026-10-08-0916',f=>f.receipt.batchId='other',f=>f.receipt.status='failed',f=>f.receipt.errors=['bad'],f=>delete f.receipt.errors,f=>f.receipt.modules.pop(),f=>f.receipt.modules[1]=f.receipt.modules[0],f=>f.receipt.modules[0].runId='wrong',f=>f.receipt.modules[0].sha256='invalid',f=>f.receipt.processedAt='2026-10-08T04:00:00Z',f=>f.receipt.processedAt='invalid',f=>f.receipt.taskGroup='unknown']){
  const f=fixture();change(f);assert.equal(S.publication(f.report,f.receipt,now).verified,false);
  const text=all(draw(f));assert.match(text,/回执尚未核验/);assert.doesNotMatch(text,/对应模块已随/);
 }
});
test('regional publication distinguishes refreshed modules from inherited references',()=>{
 const f=fixture();f.receipt.taskGroup='asia-session';f.receipt.modules=f.receipt.modules.filter(m=>['quotes','asia-equities','news','synthesis'].includes(m.role));
 const old=f.report.reportMeta.moduleRefs['us-equities'];old.runId='old-us-equities';old.path='data/runs/us-equities/old-us-equities.json';old.generatedAt='2026-10-07T16:30:00+08:00';
 assert.ok(S.publication(f.report,f.receipt,now).verified);
 assert.match(S.regionText('asia-session',f.report,f.receipt,f.control,now),/对应模块已随.*A股港股节点发布/);
 assert.match(S.regionText('us-session',f.report,f.receipt,f.control,now),/当前报告沿用模块.*2026\/10\/7 16:30:00.*不是本轮新采集/);
 assert.doesNotMatch(S.regionText('us-session',f.report,f.receipt,f.control,now),/对应模块已随/);
});
test('regional scheduler configuration is not confused with observed execution or enablement',()=>{
 const f=fixture();f.control.supervisedAcceptance={enabledTaskGroups:['asia-session']};
 assert.match(S.regionText('asia-session',f.report,f.receipt,f.control,now),/配置允许，实际调度另行核验/);
 assert.match(S.regionText('us-session',f.report,f.receipt,null,now),/配置状态未核验/);
 const noModule=structuredClone(f.report);delete noModule.reportMeta.moduleRefs['us-equities'];
 assert.doesNotMatch(S.regionText('us-session',noModule,f.receipt,f.control,now),/对应模块已随/);
});
test('only validated local batch paths are fetched',()=>{
 for(const runId of ['../../secret-quotes','https://evil.test/x-quotes','a/b-quotes','x'.repeat(81)+'-quotes']){
  const f=fixture();f.report.reportMeta.moduleRefs.quotes={runId,path:'data/runs/quotes/'+runId+'.json'};assert.equal(S.reportBatch(f.report),null);
 }
 const f=fixture();f.report.reportMeta.moduleRefs.quotes.path='https://evil.test/file.json';assert.equal(S.reportBatch(f.report),null);
});
test('health outage cannot erase a matching publication receipt or regional module state',async()=>{
 const f=fixture(),seen=[];
 const result=await S.readState(async url=>{seen.push(url);if(url.includes('health.json'))return {ok:false,status:503};return {ok:true,json:async()=>url.includes('receipts/batches')?f.receipt:url.includes('latest.json')?f.report:f.control};},undefined,now);
 assert.equal(result.health,null);assert.equal(result.publication.verified,true);assert.equal(seen.length,4);
 const d=dom();S.render(d.box,result,d.document,now);const text=all(d.box);
 assert.match(text,/7个模块发布回执已核对/);assert.match(text,/执行状态接口暂时不可用/);assert.match(text,/对应模块已随/);
});
test('receipt outage cannot be hidden by healthy/deployed runtime',async()=>{
 const f=fixture();f.health.tasks['global-main'].status='deployed';f.health.tasks['global-main'].deployed=true;f.health.tasks['global-main'].deployment={status:'verified'};
 const s=await S.readState(async url=>({ok:!url.includes('receipts'),status:503,json:async()=>url.includes('latest.json')?f.report:url.includes('health.json')?f.health:f.control}),undefined,now);
 assert.equal(s.publication.verified,false);assert.ok(s.readErrors.some(e=>e.component==='receipt'));
});
test('stale report warning remains visible even with a success receipt and a recent skip',()=>{
 const f=fixture(),d=dom(),late=now+5*3600000;
 S.render(d.box,{latest:f.report,receipt:f.receipt,health:f.health,control:f.control,snapshot:S.snapshotStatus(f.report,late),readErrors:[]},d.document,late);
 assert.equal(d.box.children[0].className,'execution-stale');assert.match(all(d.box),/历史快照，不是当前行情/);assert.match(all(d.box),/最后成功发布/);
});
test('out-of-order status refresh does not redraw the panel with older data',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),f=fixture(),d=dom();let refresh,release;
 const pending=new Promise(resolve=>release=resolve);let calls=0;
 const document={...d.document,documentElement:{dataset:{mode:'production'}},getElementById:id=>id==='executionStatus'?d.box:{addEventListener:(_,fn)=>refresh=fn}};
 class Clock extends Date{static now(){return now;}}
 const fetch=async url=>{const first=calls++<3;if(first)await pending;return {ok:true,json:async()=>url.includes('health.json')?{version:1,tasks:{'global-main':first?{status:'failed',error:'old status'}:f.health.tasks['global-main']}}:url.includes('runtime-control')?f.control:url.includes('receipts')?f.receipt:f.report};};
 vm.runInNewContext(fs.readFileSync(require.resolve('../assets/execution-status.js'),'utf8'),{document,fetch,Date:Clock,AbortController,setTimeout,clearTimeout});
 await refresh();const before=all(d.box);assert.match(before,/重复请求已跳过/);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(all(d.box),before);assert.doesNotMatch(all(d.box),/old status/);
});

test('health timeout does not postpone a valid report receipt until its signal is aborted',async()=>{
 const f=fixture(),abort=new AbortController();let receiptRead=false;
 const fetch=async(url,options)=>{
  if(url.includes('health.json'))return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('health timed out')),{once:true}));
  if(url.includes('receipts/'))receiptRead=true;
  return {ok:true,json:async()=>url.includes('receipts/')?f.receipt:url.includes('latest.json')?f.report:f.control};
 };
 const pending=S.readState(fetch,abort.signal,now);await new Promise(r=>setImmediate(r));
 assert.equal(receiptRead,true);abort.abort();const result=await pending;
 assert.equal(result.publication.verified,true);assert.equal(result.health,null);
 assert.equal(S.freshnessStatus(f.report,null,f.control,now),null);
});
test('regional admission respects the global pause and distinguishes enabled observations from a current heartbeat',()=>{
 const f=fixture();f.control.supervisedAcceptance={enabledTaskGroups:['asia-session'],pausedTaskGroups:[]};
 f.control.schedulerObservation={version:1,recordedAt:new Date(now-60000).toISOString(),tasks:[{id:'asia-session',enabled:true}]};
 assert.match(S.regionText('asia-session',f.report,f.receipt,f.control,now),/最近核验已启用/);
 f.control.productionPaused=true;assert.match(S.regionText('asia-session',f.report,f.receipt,f.control,now),/生产维护暂停/);
 f.control.productionPaused=false;f.control.schedulerObservation.tasks[0].enabled=false;
 assert.match(S.regionText('asia-session',f.report,f.receipt,f.control,now),/最近核验调度停用/);
 f.control.schedulerObservation.recordedAt=new Date(now-3*3600000).toISOString();
 assert.match(S.regionText('asia-session',f.report,f.receipt,f.control,now),/实际调度另行核验/);
});
