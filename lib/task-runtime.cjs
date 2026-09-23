"use strict";
const fs=require('node:fs'),path=require('node:path'),P=require('./pipeline.cjs'),B=require('./batch.cjs');
function entry(root,id){const m=P.read(path.join(root,'automation/manifest.json')),t=m.tasks.find(x=>x.id===id);if(!t)throw Error('Unknown task group');return `执行GDR任务 ${id}，仓库 StupidYang/gobal-daily-report。先读取main分支automation/control.json；productionPaused=true、缺失、格式错误或读取失败立即停止，不创建请求或触发构建。读取automation/tasks/common.md、${t.promptFile}、docs/live-execution.md及docs/reader-r2-contract.md。按execution-lease-v1工作：只在gdr-runtime分支新建runtime/requests/<executionId>.json；代码取得三任务共享执行锁后并发采集。读取runtime/outcomes/<executionId>.json、runtime/results/<executionId>.json及runtime/leases/production.json，确认执行令牌、固定截止时间和来源包哈希，忙碌则跳过，不另建任务或重复请求。阅读本轮原始来源，编写完整六资产详报、白话影响、多框架、观察条件与新闻；事实和判断分开，缺口如实说明，不把日度、历史或测试数据当最新行情。仅新建runtime/submissions/<executionId>.json，包含原execution令牌及绑定packetHash的editorial。禁止直接写main候选、正式模块、回执或锁。代码组装、严格校验并提交唯一整批候选；核对main的data/receipts/batches/<executionId>.json和公网报告后才能称发布成功。过期或旧令牌停止；pending、失败、忙碌分别如实报告。保留每小时增量、四小时深度规则，不用增量短句替代完整内容。不创建、修改、启用任务，不修改代码、配置、权限，不无限重试。`; }
function validate(root){const m=P.read(path.join(root,'automation/manifest.json')),roles=m?.roles||[],tasks=m?.tasks||[];
 if(roles.length!==7||new Set(roles.map(x=>x.role)).size!==7||P.W.MODULES.some(x=>!roles.some(y=>y.role===x)))throw Error('Seven internal role contracts required');
 if(tasks.length!==3||new Set(tasks.map(x=>x.id)).size!==3||new Set(tasks.map(x=>x.taskId)).size!==3)throw Error('Exactly three unique external tasks required');
 if(roles.filter(t=>t.ownedPaths.includes('data/latest.json')).length!==1)throw Error('Only synthesis owns the report');
 for(const t of tasks){if(JSON.stringify([...t.roles].sort())!==JSON.stringify([...(B.GROUPS[t.id]||[])].sort()))throw Error('Task ownership drift '+t.id);if(!t.timezone||!t.rrule)throw Error('Missing schedule');fs.readFileSync(path.join(root,t.promptFile));}
 for(const role of roles)fs.readFileSync(path.join(root,role.promptFile));return m;
}
module.exports={entry,validate};
