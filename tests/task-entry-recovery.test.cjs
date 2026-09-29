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
test('original regional entries and their hashes are unchanged',()=>{
 for(const id of ['asia-session','us-session']){const prompt=T.entry(root,id),e=P.read(path.join(root,'automation/task-export.json')).tasks.find(t=>t.id===id),b=P.read(path.join(root,'automation/bindings.json')).bindings.find(t=>t.id===id);assert.equal(e.prompt,prompt);assert.equal(b.entryPromptSha256,P.hash(prompt));assert.equal(b.enabled,false);}
});
