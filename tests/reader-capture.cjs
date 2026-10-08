'use strict';
const assert=require('node:assert/strict');
function assertPainted(stats){
 assert.ok(Number.isInteger(stats?.total)&&stats.total>0,'Screenshot pixel count is invalid');
 assert.ok(Number.isInteger(stats?.changed)&&stats.changed>=0&&stats.changed<=stats.total,'Screenshot pixel statistics are invalid');
 assert.ok(stats.changed/stats.total>0.01,'Screenshot is blank or lacks visible reader content');
}
async function verifyPaint(page,bytes){
 const stats=await page.evaluate(async data=>{
  const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let changed=0;
  for(let i=4;i<rgba.length;i+=4)if(Math.abs(rgba[i]-rgba[0])+Math.abs(rgba[i+1]-rgba[1])+Math.abs(rgba[i+2]-rgba[2])>24)changed++;
  return {total:canvas.width*canvas.height,changed};
 },bytes.toString('base64'));
 assertPainted(stats);return stats;
}
async function captureReaderTop(page,file){
 await page.evaluate(async()=>{
  await document.fonts.ready;
  // Anchor opening queues its scroll in rAF. Drain that before collapsing panels.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  document.querySelectorAll('#reportRoot details').forEach(n=>{n.open=false;});
  window.scrollTo({left:0,top:0,behavior:'instant'});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 });
 await page.waitForFunction(()=>{
  const heading=document.querySelector('#reportRoot h1'),bar=document.querySelector('.topbar');
  const rect=bar?.getBoundingClientRect();
  return Math.abs(scrollY)<1&&heading?.textContent.trim()&&heading.getBoundingClientRect().height>0&&rect?.height>0&&rect.top>=-1&&rect.bottom<=innerHeight;
 });
 const bytes=await page.screenshot({path:file,animations:'disabled'});
 return verifyPaint(page,bytes);
}
module.exports={captureReaderTop,verifyPaint,assertPainted};
