'use strict';
// Fault injection below is browser-local; never writes a runtime or report record.
const assert=require('node:assert/strict');
module.exports=async function checkStatus({page,report,control}){
 const panel=page.locator('#executionStatus');
 await page.waitForSelector('#executionStatus .execution-published');
 assert.ok((await panel.locator('.execution-published').innerText()).includes(report.reportId));
 await panel.locator('details').evaluate(n=>{n.open=true;});
 for(const [id,label]of [['asia-session','A股港股额外任务'],['us-session','美股额外任务']]){
  const row=panel.locator('.execution-region').filter({hasText:label}),text=await row.innerText();
  assert.ok(text.includes(report.reportId)||text.includes('沿用模块'));
  const paused=control.productionPaused===true||(control.supervisedAcceptance?.pausedTaskGroups||[]).includes(id);
  assert.match(text,paused?/暂停/:/配置允许/);
 }

 await page.evaluate(()=>window.__statusRegressionRoot=document.querySelector('#reportRoot').firstElementChild);
 const pattern='**/gdr-runtime/runtime/health.json*';
 const health={version:1,tasks:{'global-main':{status:'skipped-busy',error:'This task hour is already completed',at:new Date().toISOString()}}};
 await page.route(pattern,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(health)}));
 try{
  await page.locator('#refreshBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#refreshBtn').disabled);
  await page.waitForFunction(()=>document.querySelector('#executionStatus .execution-attempt')?.textContent.includes('重复请求已跳过'));
  assert.ok((await panel.locator('.execution-published').innerText()).includes(report.reportId));
  assert.ok(await panel.locator('details').evaluate(n=>n.open));
  assert.ok(await page.evaluate(()=>window.__statusRegressionRoot===document.querySelector('#reportRoot').firstElementChild));
 }finally{await page.unroute(pattern);}
 await page.route(pattern,route=>route.fulfill({status:503,body:'simulated health outage'}));
 try{
  await page.locator('#refreshBtn').click();
  await page.waitForFunction(()=>!document.querySelector('#refreshBtn').disabled);
  await page.waitForFunction(()=>document.querySelector('#executionStatus')?.textContent.includes('执行状态接口暂时不可用'));
  assert.ok((await panel.locator('.execution-published').innerText()).includes(report.reportId));
  assert.equal(await panel.locator('.execution-region').count(),2);
 }finally{await page.unroute(pattern);}
 await page.locator('#refreshBtn').click();
 await page.waitForFunction(()=>!document.querySelector('#refreshBtn').disabled);
 await page.waitForTimeout(1000);
 await panel.locator('details').evaluate(n=>{n.open=false;});
 return ['receipt-independent-of-retry','regional-admission-and-module-source','health-503-preserves-receipt','status-refresh-keeps-reader-and-disclosure'];
};
