'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {assertEventRadar}=require('../lib/live-report.cjs');
const {collectionPlan}=require('../lib/collection-plan.cjs');

test('global-main cannot silently publish an empty future-event radar',()=>{
 assert.throws(()=>assertEventRadar({events:[],report:{}},'global-main'),/events缺失/);
 assert.doesNotThrow(()=>assertEventRadar({events:[],report:{sectionGaps:{events:{reason:'已核验Fed、BLS、BEA官方日历，未来窗口无重大事件'}}}},'global-main'));
 assert.doesNotThrow(()=>assertEventRadar({events:[{title:'Scheduled release'}],report:{}},'global-main'));
});

test('regional tasks are not forced to manufacture a new event radar',()=>{
 assert.doesNotThrow(()=>assertEventRadar({events:[],report:{}},'asia-session'));
 assert.doesNotThrow(()=>assertEventRadar({events:[],report:{}},'us-session'));
});

test('calendar documents get a dedicated early collection lane',()=>{
 const config={required:[{id:'Q1'}],usPools:{technology:['AAPL'],investment:[]}};
 const documents=[
  {id:'news',kind:'news'},
  {id:'calendar',kind:'calendar'},
  {id:'macro',kind:'macro'},
  {id:'research',kind:'research'}
 ];
 const plan=collectionPlan(config,documents);
 const lanes=Object.fromEntries(plan.lanes.map(x=>[x.id,x.requested]));
 assert.equal(lanes['calendar-documents'],1);
 assert.equal(lanes['news-documents'],1);
 assert.equal(lanes['macro-documents'],1);
 assert.equal(lanes['research-documents'],1);
 const firstRound=plan.jobs.slice(0,6).map(x=>x.lane);
 assert.ok(firstRound.includes('calendar-documents'));
});
