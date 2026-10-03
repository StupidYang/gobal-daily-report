'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sanitizeDocuments,DOCUMENT_KINDS,DOCUMENT_HOSTS}=require('../scripts/execution-worker.cjs');

test('market evidence kind is accepted for approved news sources',()=>{
 const x=sanitizeDocuments([
  {id:'reuters-market',url:'https://www.reuters.com/world/test-2026-09-24/',title:'Reuters market evidence',kind:'market'},
  {id:'ap-general',url:'https://apnews.com/article/example',title:'AP general evidence',kind:'general'},
  {id:'bea-official',url:'https://www.bea.gov/news/glance',title:'BEA official evidence',kind:'official'}
 ]);
 assert.equal(DOCUMENT_KINDS.has('market'),true);
 assert.equal(x.accepted.length,3);
 assert.deepEqual(x.blocked,[]);
});

test('one unapproved document is isolated without discarding approved evidence',()=>{
 const x=sanitizeDocuments([
  {id:'good',url:'https://www.reuters.com/world/good/',title:'good',kind:'news'},
  {id:'blocked',url:'https://example.com/not-approved',title:'blocked',kind:'news'}
 ]);
 assert.deepEqual(x.accepted.map(d=>d.id),['good']);
 assert.equal(x.blocked.length,1);
 assert.equal(x.blocked[0].id,'blocked');
 assert.equal(x.blocked[0].reason,'host-not-allowed');
});

test('unsupported metadata kind is isolated instead of aborting the request envelope',()=>{
 const x=sanitizeDocuments([
  {id:'good',url:'https://www.bls.gov/news.release/cpi.nr0.htm',title:'CPI',kind:'official'},
  {id:'odd-kind',url:'https://www.reuters.com/world/example/',title:'odd',kind:'opinion'}
 ]);
 assert.equal(x.accepted.length,1);
 assert.equal(x.blocked[0].reason,'kind-not-allowed');
});

test('duplicate document ids do not enter the accepted source packet twice',()=>{
 const x=sanitizeDocuments([
  {id:'same',url:'https://www.reuters.com/world/a/',title:'a',kind:'news'},
  {id:'same',url:'https://apnews.com/article/b',title:'b',kind:'general'}
 ]);
 assert.equal(x.accepted.length,1);
 assert.equal(x.blocked[0].reason,'duplicate-id');
});

test('document envelope limits remain strict',()=>{
 assert.throws(()=>sanitizeDocuments(null),/envelope/);
 assert.throws(()=>sanitizeDocuments(Array.from({length:33},(_,i)=>({id:'d'+i,url:'https://www.reuters.com/world/'+i+'/',kind:'news'}))),/envelope/);
});


test('calendar evidence kind and EIA host are explicitly allowed',()=>{
 const x=sanitizeDocuments([
  {id:'fed-calendar',url:'https://www.federalreserve.gov/newsevents/calendar.htm',title:'Fed calendar',kind:'calendar'},
  {id:'bls-calendar',url:'https://www.bls.gov/schedule/2026/',title:'BLS calendar',kind:'calendar'},
  {id:'bea-calendar',url:'https://www.bea.gov/news/schedule',title:'BEA calendar',kind:'calendar'},
  {id:'eia-calendar',url:'https://www.eia.gov/petroleum/supply/weekly/schedule.php',title:'EIA WPSR schedule',kind:'calendar'}
 ]);
 assert.equal(DOCUMENT_KINDS.has('calendar'),true);
 assert.equal(DOCUMENT_HOSTS.has('www.eia.gov'),true);
 assert.equal(x.accepted.length,4);
 assert.deepEqual(x.blocked,[]);
});


test('reviewed public evidence hosts are exact and do not permit lookalikes or private networks',()=>{
 const hosts=['data.sec.gov','www.deribit.com','farside.co.uk','www.nmc.cn','www.cdc.gov','www.nasa.gov','www.elysee.fr','www.afro.who.int','www.justice.gov','beta.weather.gov','news.met.police.uk','www.epa.gov','www.fda.gov','www.tse.jus.br','www.mem.gov.cn','www.ishares.com','9to5mac.com'];
 for(const [i,host]of hosts.entries()){
  assert.equal(sanitizeDocuments([{id:'source'+i,url:'https://'+host+'/public',kind:'official'}]).accepted.length,1);
  assert.equal(sanitizeDocuments([{id:'source'+i,url:'https://'+host+'.example.com/public',kind:'official'}]).blocked[0].reason,'host-not-allowed');
 }
 assert.equal(sanitizeDocuments([{id:'private',url:'https://127.0.0.1/private',kind:'official'}]).blocked[0].reason,'host-not-allowed');
});


test('HKEX automated website retrieval stays excluded pending source permission',()=>{
 for(const host of ['www.hkex.com.hk','www.hkexnews.hk']){
  const x=sanitizeDocuments([{id:'restricted',url:'https://'+host+'/public-statistics',kind:'macro'}]);
  assert.equal(x.accepted.length,0);assert.equal(x.blocked[0].reason,'host-not-allowed');
 }
});
