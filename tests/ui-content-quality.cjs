'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright'),Q=require('../assets/content-contract.js');
const base=process.env.GDR_TEST_URL||'http://127.0.0.1:8181/',folder=process.env.GDR_OFFLINE_ROOT&&path.resolve(process.env.GDR_OFFLINE_ROOT),out=process.env.GDR_UI_OUTPUT||'/tmp/gdr-content-quality';fs.mkdirSync(out,{recursive:true});
async function read(api,p){if(folder)return JSON.parse(fs.readFileSync(path.join(folder,p),'utf8'));const r=await api.get(new URL(p,base).href);assert.equal(r.status(),200,p);return r.json();}
async function visit(page){if(!folder)return page.goto(base,{waitUntil:'networkidle'});await require('./offline-crypto.cjs')(page);await page.route('**/*',route=>{const f=path.resolve(folder,'.'+new URL(route.request().url()).pathname);if(!f.startsWith(folder+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:'not found'});return route.fulfill({status:200,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});});return page.setContent(fs.readFileSync(path.join(folder,'index.html'),'utf8').replace('<head>','<head><base href="https://gdr-quality.invalid/">'),{waitUntil:'networkidle'});}
(async()=>{
 const browser=await chromium.launch({executablePath:fs.existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':'/usr/bin/chromium',headless:true}),proof={tests:[],status:'running',url:base,offline:!!folder};
 try{
  const ctx=await browser.newContext(),r=await read(ctx.request,'data/latest.json'),index=await read(ctx.request,'data/history-index.json');await ctx.close();
  const cases=[{path:'data/latest.json',reportId:r.reportId},...index.reports.filter(x=>x.reportId>='2026-09-22-2000'&&x.reportId<='2026-09-23-2359')];
  for(const width of (process.env.GDR_TEST_WIDTHS||'390,1440').split(',').map(Number)){
   const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
   await visit(page);await page.waitForSelector('#contentQuality');await page.waitForSelector('#watchlist');
   for(const c of cases){
    const raw=await read(context.request,c.path),canonical=Q.normalize(raw);
    if(c.path!=='data/latest.json'){await page.selectOption('#historySelect',c.path);await page.waitForFunction(id=>document.querySelector('#mainlandIndices')?.dataset.reportId===id,c.reportId);}
    await page.waitForFunction(()=>document.querySelector('#mainlandIndices')?.dataset.loadStatus!=='loading');
    await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
    const text=await page.locator('#reportRoot').innerText();
    for(const x of canonical.recentChanges)assert.ok(text.includes(x.detail),'Recent-change body lost '+c.reportId);
    for(const x of canonical.evolution24h)assert.ok(text.includes(x.detail),'Timeline body lost '+c.reportId);
    for(const x of canonical.watch)if(x.detail)assert.ok(text.includes(x.detail),'Observation body lost '+c.reportId);
    for(const x of canonical.dataDefinitions)assert.ok(text.includes(x.definition),'Definition body lost '+c.reportId);
    assert.equal(await page.locator('.quick-list a').evaluateAll(xs=>xs.filter(x=>!x.textContent.trim()).length),0,'Empty overview links');
    const blanks=await page.locator('#changes .event-content h3,#research h3').evaluateAll(xs=>xs.filter(x=>!x.textContent.trim()).map(x=>x.parentElement.outerHTML));if(blanks.length)fs.writeFileSync(path.join(out,'blank-debug.json'),JSON.stringify({reportId:c.reportId,blanks},null,2));
    assert.equal(await page.locator('#changes .event-content h3,#research h3').evaluateAll(xs=>xs.filter(x=>!x.textContent.trim()).length),0,'Empty research/timeline headings');
    if(raw.reportMeta?.dataMode!=='synthetic'){const view=await read(context.request,'data/reader-projections/'+c.reportId+'.json');if(view.quoteCoverage.retained>0)assert.ok(text.includes('历史沿用'),'Recovery disclosed');assert.equal(await page.locator('#mainlandIndices .cn-index-value').count(),6);assert.ok(!text.includes('8条事实 · 缺失 0'),'Misleading global health label');if(view.quality.errors.length)assert.ok(text.includes('未通过新的内容质量标准'));}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');proof.tests.push({width,reportId:c.reportId,status:'passed',checks:['visible-alias-bodies','nonempty-navigation','six-mainland-indices','honest-coverage','quality-warning','historical-boundary']});
   }
   await page.selectOption('#historySelect','data/latest.json');await page.waitForFunction(id=>document.querySelector('#mainlandIndices')?.dataset.reportId===id,r.reportId);await page.waitForTimeout(700);await page.evaluate(()=>{document.querySelectorAll('details').forEach(d=>d.open=false);window.scrollTo(0,0);});await page.screenshot({path:path.join(out,width+'-top.png')});
   await page.locator('#watchlist').evaluate(d=>d.open=true);await page.getByRole('button',{name:'板块数据 / 热弱榜',exact:true}).click();await page.getByLabel('榜单市场',{exact:true}).selectOption('US');await page.evaluate(()=>document.querySelectorAll('#watchlist details').forEach(d=>d.open=true));
   const watch=await page.locator('#watchlist').innerText();const latestView=r.reportMeta?.dataMode==='synthetic'?null:await read(context.request,'data/reader-projections/'+r.reportId+'.json');const groups=latestView?.modules?.['us-equities']?.payload;const hasRetained=[...(groups?.groups||[]),...(groups?.retainedGroups||[])].some(g=>g.retention&&(g.rows||[]).length);if(hasRetained)assert.ok(watch.includes('历史候选样本'),'Historical sample origin must be visible');
   await page.locator('#watchlist').screenshot({path:path.join(out,width+'-us-samples.png')});assert.deepEqual(errors,[]);await context.close();
  }
  proof.status='passed';
 }catch(e){proof.status='failed';proof.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'content-results.json'),JSON.stringify(proof,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
