'use strict';
const fs=require('node:fs');
const C=require('../assets/terminal-core.js');
const R=require('../assets/reader-core.js');
const arrayKeys=['canonicalFacts','metrics','marketCoverage','worldEvents','analysisTheses','judgmentRevisions','dataDefinitions','assets','macroEvents','news','deepDive','narrativeTriggers','events','watch','sources','evolution24h','changes','recentChanges'];
function validate(report){
 const errors=R.check(report),warnings=[];
 if(errors.length)return {errors,warnings};
 if(report.reportMeta?.contractVersion!=='reader-r2')return {errors,warnings:['旧版报告：仅执行兼容结构和引用检查，不回写历史补造新字段。']};
 if(report.schemaVersion!==5)errors.push('reader-r2仍要求schemaVersion=5');
 for(const k of arrayKeys)if(!Array.isArray(report[k]))errors.push(k+'缺失或不是数组');
 for(const k of ['reportId','updatedAt','overview','rolling24hSummary','methodology'])if(typeof report[k]!=='string'||!report[k].trim())errors.push(k+'必须是非空字符串');
 const p=report.plainLanguage;
 if(!p||typeof p!=='object'||Array.isArray(p))errors.push('plainLanguage对象缺失');
 else{
  for(const k of ['verdict','bottomLine','whyNow','horizon','confidence','invalidation'])if(typeof p[k]!=='string'||!p[k].trim())errors.push('plainLanguage.'+k+'缺失');
  const labels=C.arr(p.impacts).map(x=>C.text(x?.asset)).join(' ');
  for(const label of ['A股','港股','美股','BTC','黄金','原油'])if(!labels.includes(label))errors.push('白话影响未覆盖'+label);
  C.arr(p.impacts).forEach((x,i)=>{for(const k of ['effect','reason','takeaway','horizon'])if(!C.text(x?.[k]))errors.push('impacts['+i+'].'+k+'缺失');});
 }
 if(!Array.isArray(report.frameworkAnalysis)||!report.frameworkAnalysis.length)errors.push('多框架分析缺失');
 if(!report.frameworkSynthesis||!C.text(report.frameworkSynthesis.verdict))errors.push('框架综合结论缺失');
 const n=report.newsroom;
 if(!n||!Array.isArray(n.items)||!n.coverage)errors.push('newsroom.items或coverage缺失');
 else{
  const ids=new Set();
  n.items.forEach((x,i)=>{
   const id=x?.eventId||x?.id;if(!id||ids.has(id))errors.push('新闻ID缺失或重复: '+i);ids.add(id);
   if(!C.arr(x?.regions).length||C.arr(x.regions).some(k=>!['CN','US','WORLD'].includes(k)))errors.push('新闻地区非法: '+i);
   if(!['general','market'].includes(x?.kind))errors.push('新闻kind缺失: '+i);
   for(const k of ['summary','plainImpact','assessment'])if(!C.text(x?.[k]))errors.push('新闻'+i+'.'+k+'缺失');
   if(!C.arr(x?.sourceIds).length)errors.push('新闻缺少来源: '+i);
  });
  if(n.items.length<18)warnings.push('少于18条：这是覆盖提醒，不得为过检查虚构新闻。说明真实检索范围与缺口。');
 }
 const coverage=C.arr(report.marketCoverage).map(x=>x?.market);
 for(const m of ['A股','港股','美股','BTC','黄金','原油'])if(!coverage.includes(m))errors.push('marketCoverage缺少'+m);
 C.arr(report.deepDive).forEach((x,i)=>{if(!C.text(x?.analysis).trim())errors.push('deepDive['+i+'].analysis为空');});
 for(const k of ['mainTheme','expectationGap','divergence','regime','priceIn','bullCase','bullInvalidation','bearCase','bearInvalidation'])if(!C.text(report.coreAnalysis?.[k]).trim())errors.push('核心分析缺少'+k);
 for(const k of ['period','recentPeriod'])if(C.parseTime(report[k]?.to)!==C.reportTime(report))errors.push(k+'.to与报告时点不一致');
 return {errors:[...new Set(errors)],warnings};
}
if(require.main===module){
 const file=process.argv[2]||'data/latest.json';
 try{const report=JSON.parse(fs.readFileSync(file,'utf8')),result=validate(report);result.warnings.forEach(x=>console.warn('WARNING: '+x));result.errors.forEach(x=>console.error('ERROR: '+x));console.log(result.errors.length?'报告校验失败':'报告结构与引用校验通过（不证明新闻真实性）');process.exitCode=result.errors.length?1:0;}
 catch(e){console.error('无法校验报告: '+e.message);process.exitCode=1;}
}
module.exports={validate};
