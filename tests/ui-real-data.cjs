/* Verify served bytes and interactions. Synthetic/production mode and offline transport are explicitly labeled in proof. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const base=process.env.GDR_TEST_URL||'http://127.0.0.1:8181/',out=process.env.GDR_UI_OUTPUT||'/tmp/gdr-ui-e2e';fs.mkdirSync(out,{recursive:true});
const sum=b=>crypto.createHash('sha256').update(b).digest('hex'),abs=p=>new URL(p,base).href;
async function read(request,p){if(process.env.GDR_OFFLINE_ROOT)return fs.readFileSync(path.join(process.env.GDR_OFFLINE_ROOT,p));const r=await request.get(abs(p)+'?acceptance='+Date.now(),{timeout:25000});assert.equal(r.status(),200,p+' HTTP '+r.status());return await r.body();}
async function visit(page){
 if(process.env.GDR_OFFLINE_ROOT){
  await require('./offline-crypto.cjs')(page);
  const folder=path.resolve(process.env.GDR_OFFLINE_ROOT);
  await page.route('**/*',async route=>{const p=path.resolve(folder,'.'+new URL(route.request().url()).pathname);if(!p.startsWith(folder+path.sep)||!fs.existsSync(p))return route.fulfill({status:404,body:'not found'});const type={'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html'}[path.extname(p)]||'text/plain';return route.fulfill({status:200,contentType:type,body:fs.readFileSync(p)});});
  await page.setContent(fs.readFileSync(path.join(folder,'index.html'),'utf8').replace('<head>','<head><base href="https://gdr-local-test.invalid/">'),{waitUntil:'networkidle'});
  await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a[href^="#"]'))e.preventDefault();},true));
 }else await page.goto(base+(base.includes('?')?'&':'?')+'acceptance='+Date.now(),{waitUntil:'networkidle',timeout:60000});
}
(async()=>{
 const opts={headless:true};for(const p of ['/usr/bin/google-chrome','/usr/bin/chromium'])if(fs.existsSync(p)){opts.executablePath=p;break;}
 const browser=await chromium.launch(opts),results=[],proof={url:base,checkedAt:new Date().toISOString(),tests:results,offline:!!process.env.GDR_OFFLINE_ROOT,scope:'Actual published files; simulated network failures are browser-local only.'};
 try{
  const request=await browser.newContext();
  const build=JSON.parse(await read(request.request,'data/build.json'));proof.build=build;
  if(process.env.GDR_EXPECT_BUILD){const expected=JSON.parse(fs.readFileSync(process.env.GDR_EXPECT_BUILD,'utf8'));assert.equal(build.commit,expected.commit,'Public Pages still serves a different build');assert.equal(build.files['data/latest.json'],expected.files['data/latest.json']);}
  const reportBytes=await read(request.request,'data/latest.json'),report=JSON.parse(reportBytes);proof.reportId=report.reportId;proof.dataMode=report.reportMeta?.dataMode||'production';
  assert.equal(sum(reportBytes),build.files['data/latest.json']);assert.equal(report.reportId,build.reportId);
  const hp=`history/${report.reportId.slice(0,10)}/${report.reportId.slice(-4)}.json`;
  assert.ok(reportBytes.equals(await read(request.request,hp)),'Public latest and history differ');
  const index=JSON.parse(await read(request.request,'data/history-index.json'));assert.ok(index.reports.some(x=>x.path===hp&&x.reportId===report.reportId));
  const config=JSON.parse(await read(request.request,'config/watchlist.json'));
  const hashChecks=[];
  for(const [p,hash]of Object.entries(build.files)){assert.equal(sum(await read(request.request,p)),hash,'Mismatched deployed asset/module '+p);hashChecks.push(p);}
  proof.verifiedHashes=hashChecks;proof.moduleCounts={};
  for(const role of ['quotes','asia-equities','us-equities','news','macro','research','synthesis']){
   const m=JSON.parse(await read(request.request,`data/modules/${role}.json`));
   proof.moduleCounts[role]={runId:m.runId,status:m.status,generatedAt:m.generatedAt,dataAsOf:m.dataAsOf};
  }
  for(const [role,ref]of Object.entries(report.reportMeta?.moduleRefs||{})){
   const m=JSON.parse(await read(request.request,ref.path));assert.equal(m.runId,ref.runId);assert.equal(m.module,role);assert.ok(Date.parse(m.generatedAt)<=(require('../assets/watchlist-core.js').time(report.reportMeta?.generatedAt)??require('../assets/watchlist-core.js').time(report.updatedAt)+59999),'Future frozen module');
  }
  await request.close();
  const widths=process.env.GDR_TEST_WIDTHS?process.env.GDR_TEST_WIDTHS.split(',').map(Number):[320,390,768,1440];
  for(const width of widths){
   const ctx=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
   page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));const checks=[];
   try{
    await visit(page);await page.waitForSelector('#reportRoot .directory');await page.waitForSelector('#watchlist');
    assert.ok(await page.locator('.readable-metrics .metric').count()<=6,'More than six overview groups');
    await page.waitForFunction(()=>document.querySelector('#mainlandIndices')?.dataset.loadStatus!=='loading');
    const cn=page.locator('#mainlandIndices');
    assert.equal(await cn.locator('.cn-index').count(),6,'Mainland indices disappeared from overview');
    for(const x of config.required.filter(q=>q.id.startsWith('INDEX:CN:'))){assert.equal(await cn.locator('[data-instrument-id="'+x.id+'"]').count(),1,'Missing mainland identity '+x.id);}
    if(report.reportMeta?.moduleRefs?.quotes){assert.equal(await cn.getAttribute('data-load-status'),'ready','Frozen mainland quotes failed to load');}
    checks.push('six-mainland-indices-always-visible');
    assert.doesNotMatch(await page.locator('#reportRoot').innerText(),/\[object Object\]|\bNaN\b|\bundefined\b/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('overview-layout','no-machine-serialization');
    await page.screenshot({path:path.join(out,width+'-top.png')});
    await page.evaluate(()=>window.__reportBefore=document.querySelector('#reportRoot').firstElementChild);
    await page.locator('#refreshBtn').click();await page.waitForFunction(()=>!document.querySelector('#refreshBtn').disabled);
    assert.ok(await page.evaluate(()=>window.__reportBefore===document.querySelector('#reportRoot').firstElementChild));checks.push('unchanged-report-no-redraw');
    await page.locator('a[href="#watchlist"]').first().click();await page.waitForFunction(()=>document.querySelector('#watchlist')?.open);
    assert.equal(await page.locator('.wl-table tbody tr').count(),config.required.length);checks.push('all-required-identities');
    await page.getByLabel('资产类别',{exact:true}).selectOption('加密');assert.equal(await page.locator('.wl-table tbody tr').count(),5);
    await page.getByLabel('搜索自选模块',{exact:true}).fill('ETH');assert.equal(await page.locator('.wl-table tbody tr').count(),1);
    assert.ok(await page.getByLabel('搜索自选模块',{exact:true}).evaluate(n=>n===document.activeElement));checks.push('filter-search-focus');
    await page.getByLabel('搜索自选模块',{exact:true}).fill('');await page.getByLabel('资产类别',{exact:true}).selectOption('ALL');
    const before=await page.locator('.wl-table').innerText();
    await page.route('**/data/modules/quotes.json*',r=>r.fulfill({status:503,body:'simulated outage'}));
    await page.getByRole('button',{name:'检查模块更新',exact:true}).click();await page.waitForTimeout(1500);
    assert.match(await page.locator('#watchlist').innerText(),/503|失败|上次/);assert.equal(await page.locator('.wl-table tbody tr').count(),config.required.length);
    assert.equal(await page.locator('.wl-table').innerText(),before,'Quote outage erased last good rows');checks.push('quote-outage-retains-data');
    await page.unroute('**/data/modules/quotes.json*');await page.getByRole('button',{name:'检查模块更新',exact:true}).click();await page.waitForTimeout(1500);
    assert.doesNotMatch(await page.locator('#watchlist').innerText(),/503/);checks.push('recovery-clears-error');
    const btc=page.locator('.wl-table tbody tr').filter({hasText:/Bitcoin|BTC/}).first();await btc.getByRole('button').first().click();
    await page.getByRole('button',{name:'我的自选',exact:true}).click();assert.match(await page.locator('.wl-table').innerText(),/Bitcoin|BTC/);checks.push('favorites');
    await page.getByRole('button',{name:'板块数据 / 热弱榜',exact:true}).click();
    for(const market of ['CN','HK','US']){await page.getByLabel('榜单市场',{exact:true}).selectOption(market);await page.getByLabel('每组显示前N只',{exact:true}).fill('3');await page.getByLabel('每组显示前N只',{exact:true}).dispatchEvent('change');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
    checks.push('three-market-boards-and-N');
    await page.getByRole('button',{name:'公司研究',exact:true}).click();assert.match(await page.locator('#watchlist').innerText(),/研究|财报/);checks.push('research-cache-view');
    const previous=index.reports.find(x=>x.path!==hp);
    if(previous){await page.locator('#historySelect').selectOption(previous.path);await page.waitForTimeout(1800);assert.match(await page.locator('#watchlist').innerText(),/历史/);await page.locator('#historySelect').selectOption('data/latest.json');await page.waitForTimeout(1800);checks.push('history-isolation-and-return');}
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.locator('#fontBtn').click();await page.locator('#themeBtn').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('large-type-dark-theme');
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.locator('#fontBtn').click();await page.locator('#themeBtn').click();
    await page.getByRole('button',{name:'必看资产',exact:true}).click();await page.locator('#watchlist').evaluate(d=>{d.open=true;d.scrollIntoView();});await page.evaluate(()=>scrollBy(0,-110));await page.screenshot({path:path.join(out,width+'-watch.png')});
    assert.deepEqual(errors,[]);results.push({width,status:'pass',checks,pageErrors:errors});
   }catch(e){await page.screenshot({path:path.join(out,width+'-failure.png')}).catch(()=>{});results.push({width,status:'fail',checks,message:e.message,pageErrors:errors});throw e;}finally{await ctx.close();}
  }
  const ctx=await browser.newContext({viewport:{width:390,height:1000}});await ctx.addInitScript("Object.defineProperty(window,'localStorage',{get(){throw Error('storage denied')}})");const p=await ctx.newPage();await visit(p);await p.waitForSelector('#watchlist');results.push({scenario:'storage-denied',status:'pass'});await ctx.close();proof.status='passed';
 }catch(e){proof.status='failed';proof.error=e.message;throw e;}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(proof,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
