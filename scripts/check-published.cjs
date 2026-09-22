#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),P=require('../lib/pipeline.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),errors=[];
for(const role of P.W.MODULES){const m=P.read(path.join(root,'data/modules',role+'.json'));if(!m)continue;
 errors.push(...P.W.validate(m,role).map(e=>role+': '+e));
 if(role==='synthesis')errors.push(...P.validateReport(m.payload?.report).map(e=>'synthesis.report: '+e));
 const run=P.read(path.join(root,P.archivePath(m)));if(!run||P.hash(run)!==P.hash(m))errors.push(role+': 模块指针与不可变run不一致');
}
const r=P.read(path.join(root,'data/latest.json'));
if(!r)errors.push('缺少latest');else{
 errors.push(...P.validateReport(r));
 const rel=`history/${r.reportId.slice(0,10)}/${r.reportId.slice(-4)}.json`;
 if(!fs.existsSync(path.join(root,rel))||fs.readFileSync(path.join(root,rel),'utf8')!==fs.readFileSync(path.join(root,'data/latest.json'),'utf8'))errors.push('latest与对应历史字节不一致');
 const idx=P.read(path.join(root,'data/history-index.json'));if(!idx?.reports?.some(x=>x.reportId===r.reportId&&x.path===rel))errors.push('索引未收录latest');
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Published modules, immutable runs, complete report and history/index are consistent. Source truth is a separate check.');
