'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),N=require('../lib/news-retention.cjs');
const I=require('../lib/editorial-input.cjs');
const {EditorialValidationError,isEditorialValidationError,formatValidationIssue}=require('../lib/editorial-errors.cjs');
const fixtures=path.join(__dirname,'fixtures/native-handoff'),load=name=>P.read(path.join(fixtures,name)),copy=structuredClone;
function valid(){
 const result=load('20260923T145853-global-main.json'),submission=load('20260923T145853-global-main-submission.json');
 return {packet:result.packet,editorial:submission.editorial,options:{packet:result.packet,now:Date.parse(submission.editorial.analyzedAt)+20000,taskGroup:'global-main'}};
}
const paths=issues=>new Set(issues.map(x=>x.path));
const has=(issues,...required)=>{const found=paths(issues);for(const path of required)assert.ok(found.has(path),'missing diagnostic '+path);};
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-editorial-input-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const seed=load('baseline.json');P.atomic(path.join(root,'config/watchlist.json'),seed.config);P.atomic(path.join(root,'data/latest.json'),seed.latest);
 for(const [role,module]of Object.entries(seed.modules))P.atomic(path.join(root,'data/modules',role+'.json'),module);
 return root;
}
function addResearch(x){
 const url='https://www.sec.gov/Archives/edgar/data/1/test-filing.htm',sourceHash=P.hash('controlled test filing body'),retrievedAt=x.packet.completedAt;
 x.packet.requests.push({id:'test-filing',url,status:200,sha256:sourceHash,retrievedAt});
 x.packet.documents.push({id:'test-filing',url,title:'Controlled company filing fixture',kind:'research',sourceHash,retrievedAt,contentRetrieved:true});
 x.editorial.packetHash=P.hash(x.packet);
 x.editorial.researchRecords=[{instrumentId:'EQUITY:US:TEST',eventKey:'filing-test-v1',eventType:'filing',period:null,documentId:'filing-test-v1',documentUrl:url,publishedAt:null,sourceHash,analyzedAt:x.editorial.analyzedAt,sourceUrls:[url],analysis:{conclusion:'Controlled test analysis; not a production research claim.'}}];
 x.editorial.researchChecks=[{instrumentId:'EQUITY:US:TEST',checkedAt:x.editorial.analyzedAt,status:'no-new-material',note:'Controlled disclosure check fixture.',sourceUrls:[url]}];
 return x;
}

test('literal historical valid input retains aliases and legacy textual coverage without mutation',()=>{
 const x=valid(),before=P.hash(x.editorial),packetBefore=P.hash(x.packet);
 assert.deepEqual(I.validateEditorialInput(x.editorial,x.options),[]);
 assert.equal(I.assertEditorialInput(x.editorial,x.options),x.editorial);
 assert.equal(P.hash(x.editorial),before);assert.equal(P.hash(x.packet),packetBefore);
 assert.equal(typeof x.editorial.newsCoverage,'string');
});
test('news id alias and unknown source dates stay valid background instead of being invented or rejected',()=>{
 const x=valid(),item=x.editorial.newsItems[0];item.id=item.eventId;delete item.eventId;
 item.publishedAt=null;item.eventAt=null;item.sourceDateText='2026年9月23日（原文未注明时区）';
 const before=P.hash(item);assert.deepEqual(I.validateEditorialInput(x.editorial,x.options),[]);
 const sources=[...I.currentEvidenceSources(x.packet).values()],converted={...item,sourceIds:item.sourceUrls.map(I.sourceId)};
 const merged=N.merge(null,[converted],{now:x.options.now,sources});
 assert.equal(merged.items.length,0);assert.equal(merged.legacyItems.length,1);assert.equal(merged.legacyItems[0].publishedAt,null);assert.equal(P.hash(item),before);
});
for(const [name,kindIssue]of [['20261012T081339Z-global-main-submission.json',true],['20261012T081339Z-global-main--r1.json',false]])test('literal gen57 '+name+' reports all research errors before atomic staging',t=>{
 const result=load('20261012T081339Z-global-main-result.json'),submission=load(name),before=P.hash(submission),now=Date.parse('2026-10-12T08:24:10Z');
 const issues=I.validateEditorialInput(submission.editorial,{packet:result.packet,now});
 assert.equal(paths(issues).has('editorial.newsItems[0].kind'),kindIssue);
 for(const i of [0,1]){
  has(issues,...['instrumentId','eventKey','eventType','period','documentId','documentUrl','publishedAt','analyzedAt','analysis.conclusion'].map(k=>'editorial.researchRecords['+i+'].'+k),'editorial.researchChecks['+i+'].instrumentId','editorial.researchChecks['+i+'].checkedAt');
  assert.ok(issues.some(x=>x.path==='editorial.researchRecords['+i+']'&&x.code==='research-document-kind'));
  assert.ok(issues.some(x=>x.path==='editorial.researchChecks['+i+']'&&x.code==='research-check-kind'));
 }
 const root=setup(t),latestBefore=fs.readFileSync(path.join(root,'data/latest.json'),'utf8'),researchBefore=fs.readFileSync(path.join(root,'data/modules/research.json'),'utf8');
 assert.throws(()=>L.compile(root,result.packet,submission.editorial,{...submission.execution,taskGroup:result.taskGroup,now}),error=>{
  assert.ok(isEditorialValidationError(error));assert.equal(error.code,'EDITORIAL_VALIDATION_FAILED');assert.equal(error.stage,'editorial-input');assert.deepEqual(error.issues,issues);assert.doesNotMatch(error.message,/Atomic batch rejected/);return true;
 });
 assert.equal(P.hash(submission),before);assert.equal(P.hash(result.packet),result.packetHash);assert.equal(fs.readFileSync(path.join(root,'data/latest.json'),'utf8'),latestBefore);assert.equal(fs.readFileSync(path.join(root,'data/modules/research.json'),'utf8'),researchBefore);
 assert.equal(fs.existsSync(path.join(root,'data/inbox')),false);
});
for(const [name,sourceMisses]of [['20261012T074421Z-global-main-submission.json',54],['20261012T074421Z-global-main--r1.json',0]])test('literal gen56 '+name+' exposes citation and report errors in one pass',()=>{
 const result=load('20261012T074421Z-global-main-result.json'),submission=load(name),before=P.hash(submission);
 const issues=I.validateEditorialInput(submission.editorial,{packet:result.packet,now:Date.parse(submission.editorial.analyzedAt)+20000});
 const misses=issues.filter(x=>x.code==='source-not-retrieved');assert.equal(misses.length,sourceMisses);
 if(sourceMisses){assert.equal(new Set(misses.map(x=>x.message.match(/https?:\/\/\S+$/)?.[0])).size,13);has(issues,'editorial.newsItems[0].sourceUrls[0]','editorial.report.plainLanguage.sourceUrls[7]');}
 has(issues,'editorial.report.marketCoverage','editorial.report.dataDefinitions','editorial.report.sectionGaps','editorial.report.watch[0]','editorial.report.recentChanges[0]');
 has(issues,...['verdict','agreement','disagreement','weighting','invalidation'].map(k=>'editorial.report.frameworkSynthesis.'+k));
 assert.equal(P.hash(submission),before);assert.equal(P.hash(result.packet),result.packetHash);
});
test('source misses and every independent report shape error are returned together',()=>{
 const x=valid(),missing=['https://www.reuters.com/world/not-in-this-packet','https://www.sec.gov/Archives/not-in-this-packet'];
 x.editorial.newsItems[0].sourceUrls=missing;x.editorial.report.deepDive[0].sourceUrls=[missing[0]];
 x.editorial.report.marketCoverage={CN:'string instead of object array'};x.editorial.report.dataDefinitions={term:'wrong shape'};
 x.editorial.report.watch=['wrong shape'];x.editorial.report.recentChanges=['wrong shape'];x.editorial.report.sectionGaps=['wrong shape'];
 x.editorial.report.frameworkSynthesis={conclusion:'wrong key'};x.editorial.researchRecords=[{analysis:'wrong shape'}];x.editorial.researchChecks=[null];
 const before=P.hash(x.editorial),issues=I.validateEditorialInput(x.editorial,x.options);
 has(issues,'editorial.newsItems[0].sourceUrls[0]','editorial.newsItems[0].sourceUrls[1]','editorial.report.deepDive[0].sourceUrls[0]','editorial.report.marketCoverage','editorial.report.dataDefinitions','editorial.report.watch[0]','editorial.report.recentChanges[0]','editorial.report.sectionGaps','editorial.researchRecords[0].analysis.conclusion','editorial.researchChecks[0]');
 has(issues,...['verdict','agreement','disagreement','weighting','invalidation'].map(k=>'editorial.report.frameworkSynthesis.'+k));
 assert.equal(issues.filter(x=>x.code==='source-not-retrieved').length,3);assert.equal(P.hash(x.editorial),before);
});
test('HTTP 200 alone, failed parsing, wrong hash and wrong receipt time never authorize a citation',()=>{
 const x=valid(),base='https://www.sec.gov/Archives/';
 const cases=[['http-only',null],['not-retrieved',{contentRetrieved:false}],['wrong-hash',{sourceHash:P.hash('other body')}],['wrong-time',{retrievedAt:new Date(x.options.now-100).toISOString()}],['failed-http',{httpStatus:403}]];
 for(const [key,override]of cases){
  const url=base+key,sourceHash=P.hash(key),retrievedAt=x.packet.completedAt;
  x.packet.requests.push({id:key,url,status:override?.httpStatus||200,sha256:sourceHash,retrievedAt});
  if(override)x.packet.documents.push({id:key,url,kind:'official',contentRetrieved:true,sourceHash,retrievedAt,...override});
 }
 x.editorial.newsItems[0].sourceUrls=cases.map(([key])=>base+key);x.editorial.packetHash=P.hash(x.packet);
 const issues=I.validateEditorialInput(x.editorial,x.options),misses=issues.filter(x=>x.code==='source-not-retrieved');assert.equal(misses.length,cases.length);
 assert.deepEqual(misses.map(x=>x.path),cases.map((_,i)=>'editorial.newsItems[0].sourceUrls['+i+']'));
});
test('malformed URL arrays and numeric metadata are business validation, not incidental TypeErrors',()=>{
 const x=valid();x.editorial.newsItems[0].sourceUrls='not an array';x.editorial.researchRecords=[{analysis:[]}];
 x.editorial.report.deepDive[0].price='123';x.editorial.macroFacts[0].asOf='2026-09-23';
 const issues=I.validateEditorialInput(x.editorial,x.options);
 has(issues,'editorial.newsItems[0].sourceUrls','editorial.researchRecords[0].analysis','editorial.researchRecords[0].analysis.conclusion','editorial.report.deepDive[0].price','editorial.macroFacts[0].asOf');
 assert.throws(()=>I.assertEditorialInput(x.editorial,x.options),isEditorialValidationError);
});
test('complete company records allow unknown source date and report period as explicit null',()=>{
 const x=addResearch(valid()),before=P.hash(x.editorial);assert.deepEqual(I.validateEditorialInput(x.editorial,x.options),[]);assert.equal(P.hash(x.editorial),before);
});
test('company checks need their own identity and time; a failed check may honestly omit unavailable sources',()=>{
 const x=valid();x.editorial.researchChecks=[{instrumentId:'EQUITY:US:TEST',checkedAt:x.editorial.analyzedAt,status:'source-unavailable',note:'HTTP 403; no disclosure conclusion.'}];
 assert.deepEqual(I.validateEditorialInput(x.editorial,x.options),[]);
 x.editorial.researchChecks[0].status='no-new-material';has(I.validateEditorialInput(x.editorial,x.options),'editorial.researchChecks[0].sourceUrls');
 delete x.editorial.researchChecks[0].instrumentId;delete x.editorial.researchChecks[0].checkedAt;
 has(I.validateEditorialInput(x.editorial,x.options),'editorial.researchChecks[0].instrumentId','editorial.researchChecks[0].checkedAt');
});
test('duplicate company event identities and check merge identities are rejected before any data could collapse',()=>{
 const x=addResearch(valid());x.editorial.researchRecords.push(copy(x.editorial.researchRecords[0]));x.editorial.researchChecks.push(copy(x.editorial.researchChecks[0]));
 const issues=I.validateEditorialInput(x.editorial,x.options);has(issues,'editorial.researchRecords[1].eventKey','editorial.researchChecks[1]');assert.ok(issues.filter(x=>x.code==='duplicate').length>=2);
});
test('research source must be retrieved and bound to the exact document hash',()=>{
 const x=addResearch(valid());x.editorial.researchRecords[0].sourceHash=P.hash('different body');
 has(I.validateEditorialInput(x.editorial,x.options),'editorial.researchRecords[0].sourceHash');
 x.editorial.researchRecords[0].documentUrl='https://www.sec.gov/Archives/not-retrieved';
 has(I.validateEditorialInput(x.editorial,x.options),'editorial.researchRecords[0].documentUrl','editorial.researchRecords[0].sourceUrls');
});
test('analysis and check clocks require explicit real timezones; source date uncertainty is a separate matter',()=>{
 const x=addResearch(valid());x.editorial.analyzedAt='2026-09-23';x.editorial.researchRecords[0].analyzedAt='2026-09-23T15:00:00';x.editorial.researchChecks[0].checkedAt='2026-09-31T12:00:00Z';
 has(I.validateEditorialInput(x.editorial,x.options),'editorial.analyzedAt','editorial.researchRecords[0].analyzedAt','editorial.researchChecks[0].checkedAt');
});
test('scope mistakes are aggregated with news classification and schema mistakes',()=>{
 const x=valid();x.editorial.newsItems[0].title='NWS weather forecast';x.editorial.newsItems[0].kind='official';delete x.editorial.report.frameworkSynthesis.weighting;
 const issues=I.validateEditorialInput(x.editorial,x.options);assert.ok(issues.some(x=>x.code==='editorial-scope-v1'));has(issues,'editorial.newsItems[0].kind','editorial.report.frameworkSynthesis.weighting');
});
test('explicit issues have stable type and structured paths; arbitrary failures cannot spoof it with a message or code',()=>{
 const issue={path:'editorial.newsItems[0].kind',code:'enum',message:'kind only allows general/market'},error=new EditorialValidationError([issue]);
 assert.ok(isEditorialValidationError(error));assert.equal(error.message,formatValidationIssue(issue));assert.equal(error.code,'EDITORIAL_VALIDATION_FAILED');
 for(const other of [new TypeError('bad map'),new Error('Atomic batch rejected'),Object.assign(new Error(error.message),{code:error.code,issues:error.issues}),null])assert.equal(isEditorialValidationError(other),false);
 assert.throws(()=>new EditorialValidationError([]),TypeError);assert.throws(()=>new EditorialValidationError([{path:'',message:'bad'}]),TypeError);
});
test('filesystem, missing internal packet arrays, and unexpected implementation errors remain non-editorial failures',t=>{
 const x=valid(),root=setup(t);fs.writeFileSync(path.join(root,'config/watchlist.json'),'{ invalid JSON');
 assert.throws(()=>L.compile(root,x.packet,x.editorial,{executionId:'internal-failure',generation:1,now:x.options.now}),error=>error instanceof SyntaxError&&!isEditorialValidationError(error));
 assert.throws(()=>I.assertEditorialInput(x.editorial,{...x.options,packet:{...x.packet,requests:null}}),error=>error instanceof TypeError&&!isEditorialValidationError(error));
 const unexpected=new TypeError('implementation failure'),input={...x.editorial};Object.defineProperty(input,'report',{enumerable:true,get(){throw unexpected;}});
 assert.throws(()=>I.assertEditorialInput(input,x.options),error=>error===unexpected&&!isEditorialValidationError(error));
});
test('a broken machine-owned quote cannot be classified as rejected editorial content',t=>{
 const x=valid(),root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-editorial-machine-fault-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 P.atomic(path.join(root,'config/watchlist.json'),load('baseline.json').config);
 x.packet.rows.find(x=>x.instrumentId==='CRYPTO:BTC:USD').price='not a numeric observation';x.editorial.packetHash=P.hash(x.packet);
 const originalReport=P.hash(x.editorial.report);assert.deepEqual(I.validateEditorialInput(x.editorial,x.options),[]);
 assert.throws(()=>L.compile(root,x.packet,x.editorial,{executionId:'broken-machine-quote',generation:1,now:x.options.now}),error=>{assert.equal(isEditorialValidationError(error),false);assert.match(error.message,/非数值 rawValue/);return true;});
 assert.equal(P.hash(x.editorial.report),originalReport);assert.equal(fs.existsSync(path.join(root,'data/latest.json')),false);
});
