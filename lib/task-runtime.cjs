"use strict";
const fs=require('node:fs'),path=require('node:path'),P=require('./pipeline.cjs'),B=require('./batch.cjs');
function entry(root,id){
 const m=P.read(path.join(root,'automation/manifest.json')),t=m.tasks.find(x=>x.id===id);
 if(!t||!Object.hasOwn(B.GROUPS,id))throw Error('Unknown task group');
 const prompt=fs.readFileSync(path.join(root,'automation/entry',id+'.txt'),'utf8').trimEnd();
 if(!prompt)throw Error('Empty task entry '+id);return prompt;
}
function validate(root){const m=P.read(path.join(root,'automation/manifest.json')),roles=m?.roles||[],tasks=m?.tasks||[];
 if(roles.length!==7||new Set(roles.map(x=>x.role)).size!==7||P.W.MODULES.some(x=>!roles.some(y=>y.role===x)))throw Error('Seven internal role contracts required');
 if(tasks.length!==3||new Set(tasks.map(x=>x.id)).size!==3||new Set(tasks.map(x=>x.taskId)).size!==3)throw Error('Exactly three unique external tasks required');
 if(roles.filter(t=>t.ownedPaths.includes('data/latest.json')).length!==1)throw Error('Only synthesis owns the report');
 for(const t of tasks){if(JSON.stringify([...t.roles].sort())!==JSON.stringify([...(B.GROUPS[t.id]||[])].sort()))throw Error('Task ownership drift '+t.id);if(!t.timezone||!t.rrule)throw Error('Missing schedule');fs.readFileSync(path.join(root,t.promptFile));}
 for(const role of roles)fs.readFileSync(path.join(root,role.promptFile));return m;
}
function validateConfiguration(root){
 const m=validate(root),e=P.read(path.join(root,'automation/task-export.json')),b=P.read(path.join(root,'automation/bindings.json')),c=P.read(path.join(root,'automation/control.json'));
 if(e?.tasks?.length!==3||b?.bindings?.length!==3)throw Error('Runtime must have exactly three bindings');
 const ids=new Set(m.tasks.map(t=>t.id));
 for(const rows of [e.tasks,b.bindings])if(new Set(rows.map(t=>t.id)).size!==3||rows.some(t=>!ids.has(t.id)))throw Error('Duplicate or unknown task binding');
 for(const t of m.tasks){
  const prompt=entry(root,t.id),exported=e.tasks.find(x=>x.id===t.id),bound=b.bindings.find(x=>x.id===t.id);
  if(exported.prompt!==prompt||exported.taskId!==t.taskId||exported.rrule!==t.rrule||exported.timezone!==t.timezone)throw Error('Export drift '+t.id);
  if(bound.taskId!==t.taskId||bound.entryPromptSha256!==P.hash(prompt)||bound.rrule!==t.rrule||bound.timezone!==t.timezone)throw Error('Binding drift '+t.id);
  if(typeof bound.enabled!=='boolean'||bound.enabled!==exported.enabled)throw Error('Enablement drift '+t.id);
  if(bound.enabled)require('./task-admission.cjs').assertTaskAllowed(c,t.id);
  const observed=c?.schedulerObservation?.tasks?.find(x=>x.id===t.id);
  if(observed&&(observed.taskId!==t.taskId||observed.enabled!==bound.enabled))throw Error('Recorded scheduler observation drift '+t.id);
 }
 return m;
}
module.exports={entry,validate,validateConfiguration};
