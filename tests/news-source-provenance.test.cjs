'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs');
const hour=3600000,iso=n=>new Date(n).toISOString(),copy=x=>JSON.parse(JSON.stringify(x));
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-news-provenance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fixture=path.join(__dirname,'fixtures/native-handoff'),seed=P.read(path.join(fixture,'baseline.json'));
 const packet=P.read(path.join(fixture,'20260923T145853-global-main.json')).packet,editorial=P.read(path.join(fixture,'20260923T145853-global-main-submission.json')).editorial;
 const now=Date.parse(editorial.analyzedAt)+20000;
 P.atomic(path.join(root,'config/watchlist.json'),seed.config);P.atomic(path.join(root,'data/latest.json'),seed.latest);
 for(const [role,m]of Object.entries(seed.modules)){P.atomic(path.join(root,'data/modules',role+'.json'),m);P.atomic(path.join(root,P.archivePath(m)),m);}
 const doc=packet.documents.find(d=>d.id==='fed-press-releases'),source={id:L.sourceId(doc.url),url:doc.url,name:'Original rolling news page',retrievedAt:iso(now-hour),sourceHash:P.hash('original-page'),evidenceKind:'news'};
 const item={id:'old-news',eventId:'old-news',title:'Original event',regions:['US'],kind:'general',summary:'Original body',plainImpact:'Original impact',assessment:'Original assessment',publishedAt:iso(now-hour),sourceIds:[source.id]};
 const legacy={...item,id:'old-legacy',eventId:'old-legacy',title:'Old background',publishedAt:iso(now-48*hour)};
 const previous={...seed.modules.news,runId:'original-news',generatedAt:iso(now-hour),sources:[source,{...source,id:'unused-source',url:'https://www.bls.gov/unused'}],payload:{newsroom:{items:[item],legacyItems:[legacy]}}};
 P.atomic(path.join(root,'data/modules/news.json'),previous);
 return {root,packet,editorial,now,previous,source,doc};
}
function run(x,input=x.editorial,n=0){const batch=L.compile(x.root,x.packet,input,{executionId:'news-provenance-'+n,generation:n+1,now:x.now+n*hour});return {news:batch.modules.find(m=>m.module==='news'),report:batch.modules.find(m=>m.module==='synthesis').payload.report};}
test('repeated hourly news retention preserves both active and legacy source receipts on reused URLs',t=>{
 const x=setup(t),before=P.hash(x.previous),packetBefore=P.hash(x.packet),editorialBefore=P.hash(x.editorial);let retainedId;
 for(let n=0;n<3;n++){
  const {news,report}=run(x,x.editorial,n),old=report.newsroom.items.find(i=>i.id==='old-news'),legacy=report.newsroom.legacyItems.find(i=>i.id==='old-legacy');
  assert.match(old.sourceIds[0],/^news-retained-/);if(retainedId)assert.equal(old.sourceIds[0],retainedId);retainedId=old.sourceIds[0];
  assert.deepEqual(legacy.sourceIds,old.sourceIds);assert.deepEqual(report.sources.find(s=>s.id===retainedId),{...x.source,id:retainedId});
  assert.equal(old.summary,x.previous.payload.newsroom.items[0].summary);assert.equal(old.publishedAt,x.previous.payload.newsroom.items[0].publishedAt);assert.equal(old.retention.generatedAt,x.previous.generatedAt);
  const current=report.sources.find(s=>s.id===L.sourceId(x.doc.url));assert.equal(current.sourceHash,x.doc.sourceHash);assert.equal(current.retrievedAt,x.doc.retrievedAt);
  assert.equal(report.sources.some(s=>s.id==='unused-source'),false);assert.equal(report.sources.filter(s=>s.id===retainedId).length,1);
  P.atomic(path.join(x.root,'data/modules/news.json'),news);
 }
 assert.equal(P.hash(x.previous),before);assert.equal(P.hash(x.packet),packetBefore);assert.equal(P.hash(x.editorial),editorialBefore);
});
test('new same-URL editorial news binds fresh receipts while historical news keeps original evidence',t=>{
 const x=setup(t),input=copy(x.editorial);input.newsItems.push({...copy(x.previous.payload.newsroom.items[0]),id:'new-news',eventId:'new-news',sourceIds:undefined,sourceUrls:[x.doc.url],summary:'New evidence body'});
 const {report}=run(x,input);const incoming=report.newsroom.items.find(i=>i.id==='new-news'),old=report.newsroom.items.find(i=>i.id==='old-news');
 assert.deepEqual(incoming.sourceIds,[L.sourceId(x.doc.url)]);assert.notDeepEqual(old.sourceIds,incoming.sourceIds);assert.equal(report.sources.find(s=>s.id===old.sourceIds[0]).sourceHash,x.source.sourceHash);
});
test('historical-only editorial URLs reject even with a retention label, without rewriting input or published files',t=>{
 const x=setup(t),stale='https://www.bls.gov/historical-only';x.previous.sources.push({id:L.sourceId(stale),url:stale,sourceHash:P.hash('old'),retrievedAt:iso(x.now-hour)});P.atomic(path.join(x.root,'data/modules/news.json'),x.previous);
 const input=copy(x.editorial);input.newsItems[0].sourceUrls=[stale];input.newsItems[0].retention={runId:'original-news',reason:'claimed retention'};
 const before=P.hash(input),packetBefore=P.hash(x.packet),publishedBefore=fs.readFileSync(path.join(x.root,'data/modules/news.json'),'utf8');
 assert.throws(()=>run(x,input),/not retrieved in this execution/);assert.equal(P.hash(input),before);assert.equal(P.hash(x.packet),packetBefore);assert.equal(fs.readFileSync(path.join(x.root,'data/modules/news.json'),'utf8'),publishedBefore);
});
test('successful HTTP receipts without a parsed row or retrieved document cannot authorize editorial citations',t=>{
 const x=setup(t),url='https://www.bls.gov/failed-parse';x.packet.requests.push({id:'bad',url,status:200,sha256:P.hash('unparseable'),retrievedAt:iso(x.now-1000)});
 const input=copy(x.editorial);input.packetHash=P.hash(x.packet);input.newsItems[0].sourceUrls=[url];assert.throws(()=>run(x,input),/not retrieved in this execution/);
});
test('missing historical source metadata never borrows a current receipt',()=>{
 const id=L.sourceId('https://www.bls.gov/current'),previous={sources:[],payload:{newsroom:{items:[{sourceIds:[id]}],legacyItems:[]}}},sources=new Map([[id,{id,url:'https://www.bls.gov/current'}]]);
 const first=L.preparePreviousNews(previous,sources),second=L.preparePreviousNews(first,sources);assert.match(first.payload.newsroom.items[0].sourceIds[0],/^news-unresolved-/);assert.deepEqual(second,first);assert.equal(sources.size,1);
});
