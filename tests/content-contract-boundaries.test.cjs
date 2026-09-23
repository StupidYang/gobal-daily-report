'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Q=require('../assets/content-contract.js');
test('Repeated normalization cannot turn an unnamed definition into a valid term',()=>{
 const r={dataDefinitions:[{id:'x',text:'Preserved original explanation'}]};
 const once=Q.normalize(r),twice=Q.normalize(once);assert.deepEqual(twice,once);
 assert.equal(twice.dataDefinitions[0]._missingTerm,true);
 assert.ok(Q.quality(twice).errors.some(e=>e.includes('术语或解释为空')));
});
test('Invalid numerical observations must not inflate coverage',()=>{
 const c={required:[{id:'x',name:'x'}]},m={sources:[{id:'s',url:'https://example.com/'}],payload:{items:[{instrumentId:'x',price:100,asOf:'2026-09-22T10:00:00Z',sourceIds:['s'],status:'invalid'}]}};
 assert.equal(Q.quoteCoverage(c,m,Date.parse('2026-09-23T00:00:00Z')).numeric,0);
});
// The immutable broken report and the reviewed complete fixture test opposite cases.
// Never assert that the production latest report must remain incomplete, or write projections into the checkout.
for(const [label,file,archival]of [
 ['incomplete','history/2026-09-23/0559.json',true],
 ['complete','validation/data/latest.json',false]
])test('Read projection preserves the correct archival boundary for '+label+' analysis',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),repo=path.join(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-projection-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const load=p=>JSON.parse(fs.readFileSync(path.join(repo,p),'utf8')),write=(p,v)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(v)+'\n');};
 const prior=load('history/2026-09-22/1558.json'),report=load(file);assert.equal(Q.quality(report).errors.length>0,archival,'Test fixture quality changed');
 write('config/watchlist.json',load('config/watchlist.json'));write('data/latest.json',report);
 const entries=[prior,report].map(r=>({reportId:r.reportId,path:'history/'+r.reportId.slice(0,10)+'/'+r.reportId.slice(-4)+'.json'}));entries.forEach((e,i)=>write(e.path,[prior,report][i]));write('data/history-index.json',{reports:entries});
 const result=require('../scripts/build-reader-projections.cjs').build(root);
 assert.ok(result.reports.every(x=>/^\d{4}-\d{2}-\d{2}-\d{4}$/.test(x.reportId)));
 assert.equal(fs.existsSync(path.join(root,'data/reader-projections/undefined.json')),false);
 const latest=JSON.parse(fs.readFileSync(path.join(root,'data/reader-projections',result.latestReportId+'.json'),'utf8'));
 if(archival){assert.equal(latest.archivedReport?.reportId,prior.reportId);assert.equal(latest.archivedReport.updatedAt,prior.updatedAt,'Preserve actual archival analysis time');}
 else assert.equal(latest.archivedReport,undefined,'Complete current analysis must not be replaced with archival fallback');
});
