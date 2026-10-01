'use strict';
// Exact archived failure inputs. Replay is local-only and cannot publish to the repository.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),B=require('../lib/batch.cjs'),Q=require('../assets/content-contract.js');
const project=path.resolve(__dirname,'..'),fixture=path.join(__dirname,'fixtures/native-handoff');
test('literal generation19 r1 now compiles and stages atomically without changing original evidence',t=>{
 const result=P.read(path.join(fixture,'20260930T000504-global-main-result.json'));
 const submission=P.read(path.join(fixture,'20260930T000504-global-main-r1.json'));
 assert.equal(result.packetHash,'a77eb205bf5d404ab5312d20c1cb6fd1407e2a50e970d5a36e2e3e3ab4a70b02');
 assert.equal(P.hash(result.packet),result.packetHash);
 assert.equal(P.hash(submission),'bc32e303803caa3797558b54b553ce04bce173177b8268b230b6f0924bd65638');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-literal-equity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 // Freeze the pre-incident report and its inputs: advancing production must not
 // make this historical regression consume tomorrow's module pointers.
 const priorPath='history/2026-09-29/2311.json',prior=P.read(path.join(project,priorPath));
 P.atomic(path.join(root,'config/watchlist.json'),P.read(path.join(fixture,'baseline.json')).config);
 P.atomic(path.join(root,'automation/control.json'),{version:1,productionPaused:false,qualityPolicy:'content-r3'});
 P.atomic(path.join(root,'data/latest.json'),prior);P.atomic(path.join(root,priorPath),prior);
 P.atomic(path.join(root,'data/history-index.json'),{reports:[{reportId:prior.reportId,label:prior.updatedAt,path:priorPath}]});
 for(const [role,ref]of Object.entries(prior.reportMeta.moduleRefs)){
  const frozen=P.read(path.join(project,ref.path));
  assert.equal(frozen.runId,ref.runId);
  P.atomic(path.join(root,'data/modules',role+'.json'),frozen);
  P.atomic(path.join(root,ref.path),frozen);
 }
 const before=P.hash(submission),latestBefore=fs.readFileSync(path.join(root,'data/latest.json'),'utf8');
 const now=Date.parse(submission.editorial.analyzedAt)+20000;
 const batch=L.compile(root,result.packet,submission.editorial,{...submission.execution,taskGroup:result.taskGroup,now});
 const report=batch.modules.find(m=>m.module==='synthesis').payload.report;
 assert.deepEqual(Q.quality(report).errors,[]);assert.deepEqual(P.validateReport(report),[]);
 const prepared=B.prepareBatch(root,batch,now);assert.ok(prepared.receipts.every(r=>r.status==='published'));
 for(const symbol of ['ORCL','ARM','AVGO','AAPL','MSTR']){
  const id='EQUITY:US:'+symbol,q=result.packet.rows.find(q=>q.instrumentId===id),f=report.canonicalFacts.find(f=>f.id===id);
  assert.ok(f,'Missing '+id);assert.equal(f.rawValue,q.price);assert.equal(f.asOf,q.asOf);
  assert.equal(f.observationRef.runId,report.reportMeta.moduleRefs['us-equities'].runId);
 }
 assert.equal(batch.modules.find(m=>m.module==='quotes').payload.items.length,31);
 assert.equal(P.hash(submission),before);assert.equal(P.hash(result.packet),result.packetHash);
 assert.equal(fs.readFileSync(path.join(root,'data/latest.json'),'utf8'),latestBefore);
 assert.equal(fs.existsSync(path.join(root,'history/2026-09-30/0013.json')),false);
});
