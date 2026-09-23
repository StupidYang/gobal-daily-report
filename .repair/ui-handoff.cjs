'use strict';
// Exercise complete real native handoffs, including user-visible news pagination.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright'),Q=require('../assets/content-contract.js');
const base=process.env.GDR_TEST_URL||'http://127.0.0.1:8183/',out=process.env.GDR_UI_OUTPUT||'/tmp/gdr-handoff/browser';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:fs.existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':'/usr/bin/chromium',args:['--no-sandbox']});const proof={url:base,status:'running',cases:[]};
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const res=await context.request.get(new URL('data/latest.json',base).href);assert.equal(res.status(),200);const raw=await res.json(),r=Q.normalize(raw);assert.deepEqual(Q.quality(raw).errors,[]);
   await page.goto(base,{waitUntil:'networkidle',timeout:45000});await page.waitForSelector('#mainlandIndices');await page.waitForFunction(()=>document.querySelector('#mainlandIndices')?.dataset.loadStatus!=='loading');
   await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
   const more=page.locator('#world .show-more');for(let i=0;i<10&&await more.isVisible();i++)await more.click();
   await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));const text=await page.locator('#reportRoot').innerText();
   fs.writeFileSync(path.join(out,width+'-expanded.txt'),text);
   for(const f of r.frameworkAnalysis){assert.ok(text.includes(f.framework),'Framework name not rendered');assert.ok(text.includes(f.conclusion),'Framework conclusion not rendered');}
   assert.equal(new Set(r.deepDive.map(Q.marketOf)).size,6);for(const d of r.deepDive)assert.ok(text.includes(d.analysis),'Full asset analysis not rendered');
   for(const n of r.newsroom.items)assert.ok(text.includes(n.plainImpact),'News impact not rendered: '+n.eventId);
   if(r.newsroom.legacyItems.length){assert.ok(text.includes('待复核历史新闻'));for(const n of r.newsroom.legacyItems)assert.ok(text.includes(n.title),'Legacy news silently discarded');}
   assert.equal(await page.locator('#mainlandIndices .cn-index-value').count(),6);assert.equal(await page.locator('#reportRoot h3').evaluateAll(xs=>xs.filter(x=>!x.textContent.trim()).length),0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,width+'-expanded.png'),fullPage:true});
   await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=false);scrollTo(0,0)});await page.screenshot({path:path.join(out,width+'-top.png')});
   proof.cases.push({width,reportId:r.reportId,deepDive:r.deepDive.length,frameworks:r.frameworkAnalysis.length,activeNews:r.newsroom.items.length,legacyNews:r.newsroom.legacyItems.length,status:'passed'});await context.close();
  }proof.status='passed';
 }catch(e){proof.status='failed';proof.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(proof,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
