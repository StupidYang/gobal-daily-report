/* Expanded-reader assertions against actual published data, not a generated price fixture. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),R=require('../assets/reader-core.js');
const base=process.env.GDR_TEST_URL||'http://127.0.0.1:8181/';
const folder=process.env.GDR_OFFLINE_ROOT&&path.resolve(process.env.GDR_OFFLINE_ROOT);
const out=process.env.GDR_UI_OUTPUT||'/tmp/gdr-expanded';fs.mkdirSync(out,{recursive:true});
const proof={checkedAt:new Date().toISOString(),url:base,offline:!!folder,tests:[],scope:'Expanded content and deployed identity; not an audit of market-source truth.'};
async function read(request,file){if(folder)return JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));const res=await request.get(new URL(file+'?expanded='+Date.now(),base).href,{timeout:25000});assert.equal(res.status(),200,file);return res.json();}
async function visit(page){
 if(!folder)return page.goto(base+'?expanded='+Date.now(),{waitUntil:'networkidle',timeout:60000});
 await require('./offline-crypto.cjs')(page);
 await page.route('**/*',async route=>{const file=path.resolve(folder,'.'+new URL(route.request().url()).pathname);if(!file.startsWith(folder+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'not found'});return route.fulfill({status:200,contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});});
 await page.setContent(fs.readFileSync(path.join(folder,'index.html'),'utf8').replace('<head>','<head><base href="https://gdr-expanded-test.invalid/">'),{waitUntil:'networkidle'});
 await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a[href^="#"]'))e.preventDefault();},true));
}
async function allNews(page){for(let i=0;i<50;i++){const b=page.locator('#world .show-more');if(!await b.isVisible())return;await b.click();}throw Error('News expansion did not terminate');}
(async()=>{
 const options={headless:true};for(const p of ['/usr/bin/google-chrome','/usr/bin/chromium'])if(fs.existsSync(p)){options.executablePath=p;break;}
 const browser=await chromium.launch(options);
 try{
  const req=await browser.newContext(),report=await read(req.request,'data/latest.json'),build=await read(req.request,'data/build.json');proof.reportId=report.reportId;proof.buildId=build.buildId;
  if(process.env.GDR_EXPECT_BUILD){const expected=JSON.parse(fs.readFileSync(process.env.GDR_EXPECT_BUILD,'utf8'));assert.equal(build.buildId,expected.buildId,'Public UI/data build differs');assert.deepEqual(build.files,expected.files,'Public build inventory differs');}
  const news=R.newsRows(report);await req.close();
  for(const width of (process.env.GDR_TEST_WIDTHS||'320,390,768,1440').split(',').map(Number)){
   const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'}),page=await context.newPage(),errors=[],checks=[];
   page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   try{
    await visit(page);await page.waitForSelector('#reportRoot .directory');await page.waitForSelector('#watchlist');
    await page.locator('#world').evaluate(n=>{n.open=true;});
    for(const region of ['CN','US','WORLD','ALL']){
     const button=page.locator('#world [data-region="'+region+'"]');await button.click();await allNews(page);
     assert.equal(await page.locator('#world .news-item').count(),news.filter(n=>region==='ALL'||n.regions.includes(region)).length,'Region lost or duplicated stories: '+region);
    }
    checks.push('all-regions-and-all-news-reachable');
    await page.getByLabel('筛选新闻',{exact:true}).fill('___NO_SUCH_NEWS___');assert.equal(await page.locator('#world .news-item').count(),0);await page.getByLabel('筛选新闻',{exact:true}).fill('');await allNews(page);checks.push('news-search-empty-and-recovery');
    await page.evaluate(()=>document.querySelectorAll('#reportRoot details').forEach(n=>{n.open=true;}));
    const text=await page.locator('#reportRoot').innerText();assert.doesNotMatch(text,/\[object Object\]|\bNaN\b|\bundefined\b/,'Hidden details serialize machine objects');
    for(const section of report.deepDive||[])assert.ok(text.includes(section.analysis),'An existing detailed analysis disappeared: '+section.title);
    for(const frame of report.frameworkAnalysis||[])assert.ok(text.includes(frame.framework),'A reasoning framework disappeared');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Expanded content has horizontal overflow');checks.push('full-analysis-retained','all-details-readable');
    const ref=page.locator('a[href^="#fact-"]').first();if(await ref.count()){
     const href=await ref.getAttribute('href');await ref.click();assert.ok(await page.evaluate(h=>{const n=document.getElementById(h.slice(1));return n&&!n.hidden&&n.getClientRects().length>0;},href));checks.push('fact-reference-opens-real-evidence');
    }
    await page.evaluate(()=>{document.querySelectorAll('#reportRoot details').forEach(n=>n.open=false);window.scrollTo(0,0);});
    await page.screenshot({path:path.join(out,width+'-top.png')});assert.deepEqual(errors,[]);proof.tests.push({width,status:'pass',checks,pageErrors:errors});
   }catch(e){await page.screenshot({path:path.join(out,width+'-failure.png')}).catch(()=>{});proof.tests.push({width,status:'fail',checks,error:e.message,pageErrors:errors});throw e;}finally{await context.close();}
  }
  proof.status='passed';
 }catch(e){proof.status='failed';proof.error=e.message;throw e;}finally{fs.writeFileSync(path.join(out,'expanded-results.json'),JSON.stringify(proof,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
