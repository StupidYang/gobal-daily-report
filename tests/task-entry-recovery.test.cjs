'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..'),P=require('../lib/pipeline.cjs'),T=require('../lib/task-runtime.cjs');
test('global runtime entry export and binding retain the repaired exact prompt',()=>{
 const prompt=T.entry(root,'global-main'),exported=P.read(path.join(root,'automation/task-export.json')).tasks.find(t=>t.id==='global-main'),binding=P.read(path.join(root,'automation/bindings.json')).bindings.find(t=>t.id==='global-main');
 assert.equal(prompt,fs.readFileSync(path.join(root,'automation/entry/global-main.txt'),'utf8').trimEnd());assert.equal(exported.prompt,prompt);assert.equal(binding.entryPromptSha256,P.hash(prompt));
 assert.match(prompt,/本任务不得调用任务管理工具/);assert.match(prompt,/真实工具拒绝、需要审批时立即停止/);assert.match(prompt,/没有实际工具错误就不能声称/);assert.match(prompt,/content-r3/);assert.match(prompt,/原deadlineAt/);assert.match(prompt,/最多32份/);
});
test('missing canonical entry fails instead of silently reverting to the old prompt',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-entry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));P.atomic(path.join(dir,'automation/manifest.json'),P.read(path.join(root,'automation/manifest.json')));assert.throws(()=>T.entry(dir,'global-main'),/ENOENT/);
});
test('owner-authorized regional entries, hashes and admission remain aligned',()=>{
 for(const id of ['asia-session','us-session']){const prompt=T.entry(root,id),e=P.read(path.join(root,'automation/task-export.json')).tasks.find(t=>t.id===id),b=P.read(path.join(root,'automation/bindings.json')).bindings.find(t=>t.id===id);assert.equal(e.prompt,prompt);assert.equal(b.entryPromptSha256,P.hash(prompt));assert.equal(prompt,fs.readFileSync(path.join(root,'automation/entry',id+'.txt'),'utf8').trimEnd());assert.equal(b.enabled,e.enabled);if(b.enabled)assert.doesNotThrow(()=>require('../lib/task-admission.cjs').assertTaskAllowed(P.read(path.join(root,'automation/control.json')),id));}
});

test('runtime validates all entries and rejects disabled-admission or duplicate-export drift',t=>{
 assert.doesNotThrow(()=>T.validateConfiguration(root));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-config-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.cpSync(path.join(root,'automation'),path.join(dir,'automation'),{recursive:true});
 const c=P.read(path.join(dir,'automation/control.json'));c.supervisedAcceptance.pausedTaskGroups=['asia-session'];P.atomic(path.join(dir,'automation/control.json'),c);
 assert.throws(()=>T.validateConfiguration(dir),/paused/);
 fs.copyFileSync(path.join(root,'automation/control.json'),path.join(dir,'automation/control.json'));
 const e=P.read(path.join(dir,'automation/task-export.json'));e.tasks[1]=e.tasks[0];P.atomic(path.join(dir,'automation/task-export.json'),e);
 assert.throws(()=>T.validateConfiguration(dir),/Duplicate/);
});
test('missing regional canonical entries cannot silently fall back to stale prompts',t=>{
 for(const id of ['asia-session','us-session']){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-regional-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  P.atomic(path.join(dir,'automation/manifest.json'),P.read(path.join(root,'automation/manifest.json')));
  assert.throws(()=>T.entry(dir,id),/ENOENT/);
 }
});
