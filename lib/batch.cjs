'use strict';
// One scheduled execution submits one immutable bundle. Validate everything in isolation first.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const P=require('./pipeline.cjs'),Pub=require('./publication.cjs'),Control=require('./control.cjs');
const GROUPS={'global-main':P.W.MODULES,'asia-session':['quotes','asia-equities','news','synthesis'],'us-session':['quotes','us-equities','news','synthesis']};
const safeId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(id);
const utc8=n=>new Date(n+8*3600000).toISOString().replace('Z','+08:00');
function validateBatch(batch){
  const errors=[];
  if(!batch||batch.batchVersion!==1||!safeId(batch.batchId))return ['Invalid batch identity/version'];
  const allowed=GROUPS[batch.taskGroup];
  if(!allowed)return ['Unknown task group'];
  if(!Array.isArray(batch.modules))return ['Batch modules must be an array'];
  const roles=batch.modules.map(m=>m?.module);
  if(new Set(roles).size!==roles.length||roles.length!==allowed.length||allowed.some(role=>!roles.includes(role)))errors.push('Batch must include exactly the task-owned modules and a complete synthesis');
  for(const m of batch.modules)if(!safeId(m?.runId))errors.push('Invalid module run identity');
  return errors;
}
function submitBatch(root,batch){
  const errors=validateBatch(batch);if(errors.length)throw Error(errors.join('\n'));
  const file=path.join(root,'data/inbox/batches',batch.batchId+'.json'),text=P.json(batch);
  if(Buffer.byteLength(text)>8*1024*1024)throw Error('Batch exceeds 8MB');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  try{fs.writeFileSync(file,text,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||fs.readFileSync(file,'utf8')!==text)throw Error('Batch identity already exists with different content');}
  return file;
}
function filesUnder(root,rel){
  const file=path.join(root,rel);if(!fs.existsSync(file))return [];
  const stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('Symlink in publication data');
  return stat.isDirectory()?fs.readdirSync(file).flatMap(x=>filesUnder(root,rel+'/'+x)):[rel];
}
function prepareBatch(root,batch,now){
  const errors=validateBatch(batch);if(errors.length)throw Error(errors.join('\n'));
  for(const m of batch.modules){const e=Control.checkMode(root,m);if(e.length)throw Error(e.join('\n'));}
  const stage=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-batch-stage-'));
  const outputRoots=['data/modules','data/runs','data/receipts','data/latest.json','data/history-index.json','data/publication-status.json','history'];
  try {
    for(const rel of [...outputRoots,'automation/control.json','config/watchlist.json',Control.MARKER,Control.VALIDATION_MARKER]){
      const source=path.join(root,rel);if(!fs.existsSync(source))continue;
      filesUnder(root,rel);fs.mkdirSync(path.dirname(path.join(stage,rel)),{recursive:true});fs.cpSync(source,path.join(stage,rel),{recursive:true});
    }
    P.atomic(path.join(stage,'.runtime/execution-batch.json'),{batchId:batch.batchId,runIds:batch.modules.map(m=>m.runId)});
    for(const m of batch.modules)Pub.submit(stage,m);
    Pub.promote(stage,now);
    const receipts=batch.modules.map(m=>P.read(path.join(stage,'data/receipts',m.module,m.runId+'.json')));
    if(receipts.some(r=>!r||r.status!=='published')){
      const waiting=receipts.filter(r=>r?.status==='waiting-dependencies');
      if(waiting.length&&receipts.every(r=>r?.status==='published'||r?.status==='waiting-dependencies'))throw Error(waiting.flatMap(r=>r.errors).join('\n'));
      throw Error('Atomic batch rejected: '+JSON.stringify(receipts.map(r=>({role:r?.role,status:r?.status,errors:r?.errors}))));
    }
    const synthesis=batch.modules.find(m=>m.module==='synthesis'),report=synthesis.payload.report;
    // Freeze all six inputs; task-owned producer refs must use this bundle, never an older pointer.
    for(const m of batch.modules.filter(m=>m.module!=='synthesis'))if(report.reportMeta.moduleRefs[m.module]?.runId!==m.runId)throw Error('Synthesis did not freeze its own task bundle input: '+m.module);
    const writes=[];
    for(const rel of outputRoots.flatMap(rel=>filesUnder(stage,rel))){
      const next=fs.readFileSync(path.join(stage,rel),'utf8'),original=path.join(root,rel);
      if(!fs.existsSync(original)||fs.readFileSync(original,'utf8')!==next)writes.push([rel,next]);
    }
    return {writes,receipts,reportId:report.reportId};
  } finally {fs.rmSync(stage,{recursive:true,force:true});}
}
function promoteBatches(root,now=Date.now(),write=P.atomic){
  const control=Control.readControl(root);if(control.productionPaused&&!Control.isIsolated(root))return [{status:'paused',writes:0}];
  return P.locked(root,()=>{
    const dir=path.join(root,'data/inbox/batches');if(!fs.existsSync(dir))return [];
    const result=[];
    for(const name of fs.readdirSync(dir).filter(n=>safeId(n.slice(0,-5))&&n.endsWith('.json')).sort()){
      const input=fs.readFileSync(path.join(dir,name),'utf8'),inputHash=P.hash(input),id=name.slice(0,-5),rel='data/receipts/batches/'+id+'.json',previous=P.read(path.join(root,rel));
      if(previous?.inputHash===inputHash&&previous.status!=='waiting-dependencies')continue;
      if(previous&&previous.inputHash!==inputHash){result.push({batchId:id,status:'rejected',errors:['Cannot change a processed batch identity']});continue;}
      const receipt={batchId:id,inputHash,processedAt:utc8(now),status:'rejected',attempts:(previous?.attempts||0)+1,errors:[]};
      try{
        if(Buffer.byteLength(input)>8*1024*1024)throw Error('Batch exceeds 8MB');
        const batch=JSON.parse(input);if(batch.batchId!==id)throw Error('Batch path and identity mismatch');
        if(control.executionProtocol==='lease-v1'&&!Control.isIsolated(root)){
          const permit=P.read(path.join(root,'.runtime/execution-permit.json'));
          if(!permit||permit.batchId!==batch.batchId||permit.batchHash!==P.hash(batch)||permit.executionId!==batch.execution?.executionId||permit.generation!==batch.execution?.generation)throw Error('Execution permit missing or obsolete: rejected before publication');
        }
        const prepared=prepareBatch(root,batch,now);receipt.status='published';receipt.taskGroup=batch.taskGroup;receipt.reportId=prepared.reportId;receipt.modules=prepared.receipts.map(r=>({role:r.role,runId:r.runId,sha256:r.module.sha256}));
        Pub.applyWrites(root,[...prepared.writes,[rel,P.json(receipt)]],write);
      }catch(e){receipt.status=e.message.split('\n').every(s=>s.startsWith('DEPENDENCY_MISSING:'))?'waiting-dependencies':'rejected';receipt.errors=[e.message];delete receipt.reportId;delete receipt.modules;P.atomic(path.join(root,rel),receipt);}
      result.push(receipt);
    }
    return result;
  });
}
module.exports={GROUPS,validateBatch,submitBatch,prepareBatch,promoteBatches};
