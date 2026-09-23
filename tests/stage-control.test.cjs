'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const stage=path.resolve(__dirname,'../scripts/stage-site.cjs'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,control){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-control-bytes-')),root=path.join(base,'source'),dest=path.join(base,'site');t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.mkdirSync(path.join(root,'automation'),{recursive:true});fs.writeFileSync(path.join(root,'data/latest.json'),'{"reportId":"2026-09-23-1708"}\n');
 if(control!==null)fs.writeFileSync(path.join(root,'automation/control.json'),control);
 fs.writeFileSync(path.join(root,'data/runtime-control.json'),'{"version":1,"productionPaused":true}\n');
 const run=(persist=false)=>cp.spawnSync(process.execPath,[stage,dest],{env:{...process.env,GDR_ROOT:root,GDR_PERSIST_BUILD:persist?'1':'0'},encoding:'utf8'});
 return {root,dest,run};
}
for(const control of ['{"version":1,"productionPaused":false,"resumeRequires":["a","b"]}\n','{\r\n  "version":1,\r\n  "productionPaused":false,\r\n  "reason":"保持原始字节"\r\n}']){
 test('Stage hashes exact public control bytes, not reserialized JSON '+control.length,t=>{
  const x=fixture(t,control),r=x.run();assert.equal(r.status,0,r.stderr);const bytes=fs.readFileSync(path.join(x.dest,'data/runtime-control.json')),build=JSON.parse(fs.readFileSync(path.join(x.dest,'data/build.json')));assert.equal(bytes.toString(),control);assert.equal(build.files['data/runtime-control.json'],hash(Buffer.from(control)));
  assert.equal(fs.readFileSync(path.join(x.root,'data/runtime-control.json'),'utf8'),'{"version":1,"productionPaused":true}\n','Nonpersistent staging must not mutate repository');
 });
}
test('Persisted build and branch-served runtime control have identical bytes',t=>{
 const control='{"version":1,"productionPaused":false,"resumeRequires":["a","b"]}\n',x=fixture(t,control),r=x.run(true);assert.equal(r.status,0,r.stderr);
 const build=JSON.parse(fs.readFileSync(path.join(x.root,'data/build.json'))),p=path.join(x.root,'data/runtime-control.json');assert.equal(fs.readFileSync(p,'utf8'),control);assert.equal(hash(fs.readFileSync(p)),build.files['data/runtime-control.json']);const previous=fs.readFileSync(path.join(x.root,'data/build.json'),'utf8');assert.equal(x.run(true).status,0);assert.equal(fs.readFileSync(path.join(x.root,'data/build.json'),'utf8'),previous,'Repeated builds remain deterministic');
});
for(const control of ['{invalid','{"version":1,"productionPaused":"false"}','{"version":2,"productionPaused":false}'])test('Invalid control stops staging: '+control,t=>{const x=fixture(t,control);assert.notEqual(x.run().status,0);assert.ok(!fs.existsSync(path.join(x.dest,'data/build.json')));});
test('Isolated roots without automation control retain their existing public mirror',t=>{const x=fixture(t,null);assert.equal(x.run().status,0);assert.equal(fs.readFileSync(path.join(x.dest,'data/runtime-control.json'),'utf8'),fs.readFileSync(path.join(x.root,'data/runtime-control.json'),'utf8'));});
