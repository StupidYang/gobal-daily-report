#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const expected=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/gdr-site/data/build.json','utf8'));
const base=process.env.GDR_TEST_URL||'https://stupidyang.github.io/gobal-daily-report/';
const attempts=Math.max(1,Math.min(30,Number(process.env.GDR_READY_ATTEMPTS)||18));
(async()=>{
 const observations=[];
 for(let i=0;i<attempts;i++){
  let item={attempt:i+1,checkedAt:new Date().toISOString()};
  try{
   const response=await fetch(new URL('data/build.json?proof='+Date.now(),base),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   item.http=response.status;
   if(response.ok){const b=await response.json();item.buildId=b.buildId;item.reportId=b.reportId;
    if(b.buildId===expected.buildId){console.log(JSON.stringify({status:'ready',expected:expected.buildId,observations:[...observations,item]},null,2));return;}
   }
  }catch(e){item.error=e.message;}
  observations.push(item);console.error('Waiting for public build',JSON.stringify(item));
  if(i+1<attempts)await new Promise(r=>setTimeout(r,10000));
 }
 console.error(JSON.stringify({status:'not-ready',expected:expected.buildId,observations},null,2));process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
