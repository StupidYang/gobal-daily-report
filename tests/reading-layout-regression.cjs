'use strict';
const assert=require('node:assert/strict');
module.exports=async function checkReading({page,report,width,out}){
 if(!await page.evaluate(()=>!!window.GDRReading))return [];
 await page.evaluate(()=>document.querySelectorAll('#reportRoot details').forEach(d=>d.open=true));
 const bodies=await page.locator('#research .research-item .research-body > .prose').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,visible:n.getClientRects().length>0,parts:[...n.querySelectorAll('.reading-paragraph')].map(p=>({text:p.textContent,visible:p.getClientRects().length>0,top:p.getBoundingClientRect().top,bottom:p.getBoundingClientRect().bottom,font:parseFloat(getComputedStyle(p).fontSize)}))})));
 assert.equal(bodies.length,report.deepDive.length);
 for(const [i,b]of bodies.entries()){
  assert.equal(b.text,report.deepDive[i].analysis,'Exact analysis bytes lost by paragraph layout');
  assert.ok(b.visible);assert.ok(b.parts.every(p=>p.visible));
  if(b.parts.length){assert.equal(b.parts.map(p=>p.text).join(''),b.text);for(let j=1;j<b.parts.length;j++)assert.ok(b.parts[j].top-b.parts[j-1].bottom>=12,'Paragraphs need visible separation');}
  if(width<=760)assert.ok(b.parts.every(p=>p.font>=16),'Mobile body text must not be compressed');
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile reading overflow');
 const first=page.locator('#research .research-item').first();
 await first.evaluate(n=>{n.scrollIntoView({behavior:'instant',block:'start'});});
 await page.evaluate(()=>window.scrollBy({top:-116,behavior:'instant'}));
 if(out)await first.screenshot({path:require('node:path').join(out,width+'-reading.png')});
 return ['lossless-analysis-text','visible-separated-paragraphs','mobile-body-16px','full-width-event-body'];
};
