/* Reading-only segmentation. Every character stays in order; no facts are rewritten. */
(function(root){
 'use strict';
 function segments(value){
  const text=typeof value==='string'?value:String(value??'');
  if(!text)return [];
  const result=[];let start=0;
  for(let i=0;i<text.length;i++){
   const c=text[i],length=i-start+1;
   const newline=c==='\n';
   const sentence='。！？'.includes(c)&&length>=80;
   const clause='；;'.includes(c)&&length>=140;
   if(!newline&&!sentence&&!clause)continue;
   let end=i+1;
   // Closing quotation marks stay with their sentence; decimals/URLs are never split.
   if(!newline)while(end<text.length&&'”’」』'.includes(text[end]))end++;
   while(end<text.length&&/\s/.test(text[end]))end++;
   if(text.slice(start,end).trim()){result.push(text.slice(start,end));start=end;i=end-1;}
  }
  if(start<text.length)result.push(text.slice(start));
  return result.length?result:[text];
 }
 function fill(node,value,document){
  const text=typeof value==='string'?value:String(value??''),parts=segments(text);
  node.textContent='';
  if(parts.length<2){node.textContent=text;return node;}
  node.classList.add('reading-segmented');
  for(const part of parts){const span=document.createElement('span');span.className='reading-paragraph';span.textContent=part;node.append(span);}
  return node;
 }
 function install(document){
  const report=document.getElementById('reportRoot');
  if(!report||!root.MutationObserver)return null;
  const selector='.prose, .news-take, dd',seen=new WeakMap();
  function enhance(node){
   if(!node.matches?.(selector))return;
   // Existing links or rich markup are left untouched; only the renderer's plain text is segmented.
   if([...node.children].some(c=>!c.classList.contains('reading-paragraph')))return;
   const text=node.textContent||'';if(seen.get(node)===text)return;
   seen.set(node,text);fill(node,text,document);
  }
  function scan(node){
   if(node.nodeType!==1)return;
   enhance(node);node.querySelectorAll(selector).forEach(enhance);
  }
  const observer=new root.MutationObserver(records=>{
   const pending=new Set();
   for(const r of records){
    const parent=r.target.nodeType===1?r.target:r.target.parentElement;
    const text=parent?.closest(selector);if(text&&report.contains(text))pending.add(text);
    for(const n of r.addedNodes||[])if(n.nodeType===1)pending.add(n);
   }
   pending.forEach(scan);
  });
  observer.observe(report,{childList:true,subtree:true,characterData:true});scan(report);
  return observer;
 }
 const api={segments,fill,install};root.GDRReading=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else if(root.document)install(root.document);
})(typeof globalThis!=='undefined'?globalThis:window);
