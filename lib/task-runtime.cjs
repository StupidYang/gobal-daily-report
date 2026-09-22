"use strict";
const fs=require('node:fs'),path=require('node:path'),P=require('./pipeline.cjs'),B=require('./batch.cjs');
function entry(root,id){const m=P.read(path.join(root,'automation/manifest.json')),t=m.tasks.find(x=>x.id===id);if(!t)throw Error('Unknown task group');return `执行GDR任务 ${id}，仓库 StupidYang/gobal-daily-report。首先读取 automation/control.json：productionPaused=true、缺失、格式错误或读取失败立即停止，不采集、不写入、不触发构建。仅在允许生产时读取 automation/manifest.json、automation/tasks/common.md、${t.promptFile}、对应角色提示词、docs/modules-contract.md、docs/reader-r2-contract.md 和 config/watchlist.json。按 atomic-batch-v2 执行内部角色 ${t.roles.join(', ')}，必须在一次执行内完成综合报告，仅提交一个 data/inbox/batches/<batchId>.json，包含 batchVersion=1、batchId、taskGroup=${id} 和所有本任务模块；synthesis.payload.report 必须是完整正文并冻结六个正确输入。复用保留原asOf/analyzedAt；测试数据禁止进入生产。提交后读取 data/receipts/batches/<batchId>.json，published且正式产物回读一致才报告成功，否则如实报告pending/waiting-dependencies/rejected。完整细则以仓库文件为准。不创建子任务，不改任何定时任务、代码或正式数据，不进行无限重试。`;}
function validate(root){const m=P.read(path.join(root,'automation/manifest.json')),roles=m?.roles||[],tasks=m?.tasks||[];
 if(roles.length!==7||new Set(roles.map(x=>x.role)).size!==7||P.W.MODULES.some(x=>!roles.some(y=>y.role===x)))throw Error('Seven internal role contracts required');
 if(tasks.length!==3||new Set(tasks.map(x=>x.id)).size!==3||new Set(tasks.map(x=>x.taskId)).size!==3)throw Error('Exactly three unique external tasks required');
 if(roles.filter(t=>t.ownedPaths.includes('data/latest.json')).length!==1)throw Error('Only synthesis owns the report');
 for(const t of tasks){if(JSON.stringify([...t.roles].sort())!==JSON.stringify([...(B.GROUPS[t.id]||[])].sort()))throw Error('Task ownership drift '+t.id);if(!t.timezone||!t.rrule)throw Error('Missing schedule');fs.readFileSync(path.join(root,t.promptFile));}
 for(const role of roles)fs.readFileSync(path.join(root,role.promptFile));return m;
}
module.exports={entry,validate};
