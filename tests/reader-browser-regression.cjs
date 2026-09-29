'use strict';
// Browser-only failure injection. Nothing is submitted, published, or written to history.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const R=require('../assets/reader-core.js');
module.exports=async function consistency({browser,base,read,report,out}){
 const proofs=[];
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'});
  await context.addInitScript(()=>{const original=window.setInterval;window.__gdrIntervalProbes=[];window.setInterval=function(fn,ms,...args){if(ms===600000)window.__gdrIntervalProbes.push(fn);return original.call(this,fn,ms,...args);};});
  const page=await context.newPage(),errors=[],moving=[];let delayedWatchlistLoads=0;page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/data\/modules\//.test(r.url()))moving.push(r.url());});
  try{
   // Force the consumer script to arrive after a fast report response.
   // Ordered defer bootstrap must register it before reader.js starts.
   await page.route('**/assets/watchlist.js*',async route=>{delayedWatchlistLoads++;await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});
   await page.goto(base,{waitUntil:'networkidle'});
   assert.ok(delayedWatchlistLoads>0,'Late-script injection must hit the actual watchlist asset');
   await page.waitForFunction(id=>document.querySelector('#watchlist')?.dataset.reportId===id,report.reportId);
   await page.waitForFunction(()=>!document.querySelector('#chartNote')?.textContent.includes('正在读取窗口历史'));
   const radar=R.radarState(report,Date.now());
   if(radar.kind==='overdue')assert.equal(await page.locator('#nextCount').innerText(),'已过期','Expired events must not become untimed');
   const index=await read(context.request,'data/history-index.json');
   const self=index.reports.find(x=>x.reportId===report.reportId);assert.ok(self,'Latest immutable history counterpart missing');
   await page.selectOption('#historySelect',self.path);
   await page.waitForFunction(p=>document.querySelector('#watchlist')?.dataset.viewPath===p,self.path);
   await page.locator('#watchlist').evaluate(n=>n.open=true);
   assert.doesNotMatch(await page.locator('#watchlist').innerText(),/拒绝未来模块|冻结模块晚于报告/,'Precise same-minute frozen modules must remain readable');
   await page.selectOption('#historySelect','data/latest.json');
   await page.waitForFunction(()=>document.querySelector('#watchlist')?.dataset.viewPath==='data/latest.json');
   // A different latest pointer must remain pending until the reader explicitly applies it.
   const newer=JSON.parse(JSON.stringify(report)),now=Date.parse(report.reportMeta.generatedAt)+3600000;
   newer.reportMeta.generatedAt=new Date(now).toISOString();newer.updatedAt=new Date(now+28800000).toISOString().slice(0,16).replace('T',' ');newer.reportId=newer.updatedAt.replace(' ','-').replace(':','');
   await page.route('**/data/latest.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(newer)}));
   await page.evaluate(()=>window.__gdrIntervalProbes.forEach(fn=>fn()));
   await page.waitForFunction(()=>!document.querySelector('#pendingBar').hidden);
   assert.equal(await page.locator('#watchlist').getAttribute('data-report-id'),report.reportId,'Pending report must not advance watchlist independently');
   assert.equal(await page.locator('#mainlandIndices').getAttribute('data-report-id'),report.reportId,'Pending report must not advance正文');
   await page.locator('#applyBtn').click();
   await page.waitForFunction(id=>document.querySelector('#watchlist')?.dataset.reportId===id,newer.reportId);
   assert.equal(await page.locator('#mainlandIndices').getAttribute('data-report-id'),newer.reportId);
   assert.deepEqual(moving,[],'Reader must not request unbound moving module pointers');
   assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
   await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=false));
   await page.screenshot({path:path.join(out,'consistency-'+width+'.png')});
   proofs.push({width,status:'passed',tests:['late-consumer-startup','expired-event-state','same-minute-frozen-history','no-moving-module-reads','pending-selection-atomicity','applied-selection-atomicity','no-page-errors','no-overflow']});
  }catch(error){await page.screenshot({path:path.join(out,'consistency-'+width+'-failure.png')}).catch(()=>{});throw error;}finally{await context.close();}
 }
 fs.writeFileSync(path.join(out,'reader-consistency-results.json'),JSON.stringify({scope:'Isolated browser failure-injection; no production writes',tests:proofs},null,2));
};
