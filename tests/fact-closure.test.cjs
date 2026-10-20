'use strict';
const test=require('node:test'),assert=require('node:assert');
const L=require('../lib/live-report.cjs');
const t=s=>Date.parse(s);
const now=t('2026-10-20T09:19:00Z');
const previousMacro={
 generatedAt:'2026-10-20T07:28:00.000Z',
 payload:{canonicalFacts:[
  {id:'PROP:CSRC:2026-10-20-ACTIVE-ETF',asOf:'2026-10-20T07:00:00.000Z',sourceIds:['s1']},
  {id:'FLOW:CN:TURNOVER:2026-10-20',asOf:'2026-10-20T07:00:00.000Z',sourceIds:['s1']}
 ],macroEvents:[],events:[]}
};
const editorialWith=(ids,extra={})=>({
 macroFacts:[{id:'FLOW:CN:NEW:2026-10-20',asOf:'2026-10-20T09:15:00.000Z',sourceIds:['s2']}],
 report:{overview:'x',plainLanguage:{impacts:[{asset:'A股',evidenceFactIds:ids}]}},
 ...extra
});

test('carried-over section references restore their still-valid previous facts',()=>{
 const out=L.autoRetainReferencedFacts(editorialWith(['PROP:CSRC:2026-10-20-ACTIVE-ETF']),{previousMacro,newsroom:{items:[],legacyItems:[]},now});
 assert.deepEqual(out.retainedMacroFactIds,['PROP:CSRC:2026-10-20-ACTIVE-ETF']);
});

test('retained news lanes are scanned too',()=>{
 const newsroom={items:[{eventId:'e1',evidenceFactIds:['FLOW:CN:TURNOVER:2026-10-20']}],legacyItems:[]};
 const out=L.autoRetainReferencedFacts(editorialWith([]),{previousMacro,newsroom,now});
 assert.deepEqual(out.retainedMacroFactIds,['FLOW:CN:TURNOVER:2026-10-20']);
});

test('invented ids are never restored, so they still fail validation',()=>{
 const out=L.autoRetainReferencedFacts(editorialWith(['EQUITY:CN:TURNOVER:2026-10-20']),{previousMacro,newsroom:null,now});
 assert.equal(out.retainedMacroFactIds,undefined);
});

test('facts outside the 24h anchor are not restored',()=>{
 const stale={generatedAt:'2026-10-18T07:28:00.000Z',payload:{canonicalFacts:[{id:'PROP:OLD',sourceIds:['s1']}]}};
 const out=L.autoRetainReferencedFacts(editorialWith(['PROP:OLD']),{previousMacro:stale,newsroom:null,now});
 assert.equal(out.retainedMacroFactIds,undefined);
});

test('no fresh macroFacts leaves the whole lane to the normal retention branch',()=>{
 const editorial={macroFacts:[],report:{plainLanguage:{impacts:[{evidenceFactIds:['PROP:CSRC:2026-10-20-ACTIVE-ETF']}]}}};
 const out=L.autoRetainReferencedFacts(editorial,{previousMacro,newsroom:null,now});
 assert.equal(out,editorial);
 assert.equal(out.retainedMacroFactIds,undefined);
});

test('explicit retained ids are merged without duplicates',()=>{
 const out=L.autoRetainReferencedFacts(
  editorialWith(['PROP:CSRC:2026-10-20-ACTIVE-ETF'],{retainedMacroFactIds:['PROP:CSRC:2026-10-20-ACTIVE-ETF']}),
  {previousMacro,newsroom:null,now});
 assert.deepEqual(out.retainedMacroFactIds,['PROP:CSRC:2026-10-20-ACTIVE-ETF']);
});

test('dangling fact references are repairable content, machine faults are not',()=>{
 const {editorial,owned}=L.classifyReportErrors([
  '未知事实 PROP:CSRC:2026-10-20-ACTIVE-ETF',
  '未解析事实: PROP:CSRC:2026-10-20-ACTIVE-ETF',
  '未知来源 news-retained-abc',
  '未解析来源: news-retained-abc',
  '重复事实ID',
  '事实ID缺失',
  '缺少完整字段 overview',
  '核心分析缺失 mainTheme',
  '详细分析不得为空',
  '港股不可缺席',
  'canonicalFacts[0].rawValue: 非数值 rawValue',
  'reportId与updatedAt不一致（需UTC+8文本）',
  '窗口截止时间不一致'
 ]);
 assert.deepEqual(editorial,[
  '未知事实 PROP:CSRC:2026-10-20-ACTIVE-ETF',
  '未解析事实: PROP:CSRC:2026-10-20-ACTIVE-ETF',
  '未知来源 news-retained-abc',
  '未解析来源: news-retained-abc',
  '重复事实ID',
  '事实ID缺失',
  '缺少完整字段 overview',
  '核心分析缺失 mainTheme',
  '详细分析不得为空',
  '港股不可缺席'
 ]);
 assert.deepEqual(owned,[
  'canonicalFacts[0].rawValue: 非数值 rawValue',
  'reportId与updatedAt不一致（需UTC+8文本）',
  '窗口截止时间不一致'
 ]);
});
