/* Real published report regression. Does not substitute toy market fixtures. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const url=process.env.GDR_TEST_URL||'http://127.0.0.1:8181/';
const out=process.env.GDR_UI_OUTPUT||'/tmp/gdr-ui-after';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const opts={headless:true};for(const p of ['/usr/bin/google-chrome','/usr/bin/chromium'])if(fs.existsSync(p)){opts.executablePath=p;break;}
 const browser=await chromium.launch(opts),results=[];
 try{for(const width of [320,390,768,1440]){
  const ctx=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(url+(url.includes('?')?'&':'?')+'ui-proof='+Date.now(),{waitUntil:'networkidle',timeout:45000});
   await page.waitForSelector('.readable-metrics .metric');
   await page.waitForSelector('#watchlist');
   const metricText=await page.locator('.readable-metrics').innerText();assert.doesNotMatch(metricText,/INDEX:|provider regular session|待核验|样本不足/);assert.match(metricText,/\$/);assert.match(metricText,/上证指数|标普500/);assert.ok(await page.locator('.readable-metrics .metric').count()<=6);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:path.join(out,width+'-top.png')});
   await page.locator('nav a[href="#watchlist"]').click();await page.waitForTimeout(100);
   assert.ok(await page.locator('#watchlist').evaluate(d=>d.open));
   await page.getByLabel('资产类别',{exact:true}).selectOption('加密');assert.equal(await page.locator('.wl-table tbody tr').count(),5);
   const table=await page.locator('.wl-table').innerText();assert.doesNotMatch(table,/provider-regular-session-change|Public delayed feed|1e-|5\.15e-/);
   await page.getByLabel('搜索自选模块',{exact:true}).fill('ETH');assert.equal(await page.locator('.wl-table tbody tr').count(),1);assert.ok(await page.getByLabel('搜索自选模块',{exact:true}).evaluate(n=>n===document.activeElement));
   await page.getByLabel('搜索自选模块',{exact:true}).fill('');
   await page.getByLabel('资产类别',{exact:true}).selectOption('ALL');
   await page.locator('#watchlist').evaluate(d=>d.scrollIntoView());await page.evaluate(()=>scrollBy(0,-115));
   await page.screenshot({path:path.join(out,width+'-watch.png')});
   await page.getByRole('button',{name:'板块热 / 弱榜',exact:true}).click();await page.getByLabel('每组显示前N只',{exact:true}).fill('3');await page.getByLabel('每组显示前N只',{exact:true}).dispatchEvent('change');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.getByRole('button',{name:'必看资产',exact:true}).click();await page.getByLabel('资产类别',{exact:true}).selectOption('加密');
   await page.locator('.wl-table tbody tr').filter({hasText:'Bitcoin'}).getByRole('button').first().click();
   await page.getByRole('button',{name:'我的自选',exact:true}).click();assert.ok((await page.locator('.wl-table').innerText()).includes('Bitcoin'));
   await page.locator('#historySelect').selectOption('history/2026-09-22/0935.json');await page.waitForTimeout(1000);assert.ok((await page.locator('#watchlist').innerText()).includes('历史'));assert.ok(!(await page.locator('#watchlist').innerText()).includes('85,308.22'));
   await page.locator('#historySelect').selectOption('data/latest.json');await page.waitForTimeout(1000);
   await page.locator('a[href="#changes"]').first().click();await page.waitForTimeout(100);const options=await page.locator('#chartSelect option').allTextContents();
   const single=options.findIndex(x=>/ · 1点$/.test(x));if(single>=0){await page.locator('#chartSelect').selectOption({index:single});assert.equal(await page.locator('#chartCanvas svg').count(),0);assert.match(await page.locator('#chartCanvas').innerText(),/仅1次观测/);}
   await page.locator('#fontBtn').click();await page.locator('#themeBtn').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.deepEqual(errors,[]);results.push({width,result:'pass',reportData:'actual published files',pageErrors:errors});
  }catch(e){results.push({width,result:'fail',message:e.message,pageErrors:errors});throw e;}finally{await ctx.close();}
 }}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,results},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
