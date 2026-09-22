#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),cp=require('node:child_process');
const expected=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),repo=process.env.GITHUB_REPOSITORY;
if(!/^[\w.-]+\/[\w.-]+$/.test(repo||''))throw Error('Missing repository identity');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function api(endpoint){return JSON.parse(cp.execFileSync('gh',['api',`repos/${repo}/${endpoint}`],{encoding:'utf8',timeout:20000}));}
async function matches(){try{const r=await fetch('https://stupidyang.github.io/gobal-daily-report/data/build.json?identity='+Date.now(),{signal:AbortSignal.timeout(10000)});return r.ok&&(await r.json()).buildId===expected.buildId;}catch{return false;}}
(async()=>{for(let i=0;i<24;i++){
 if(await matches()){console.log('Expected public bytes already deployed; no build requested.');return;}
 const active=['queued','in_progress','waiting','pending'].flatMap(status=>api('actions/runs?event=dynamic&status='+status+'&per_page=100').workflow_runs||[]);
 if(active.length){console.log('Managed Pages deployment busy; waiting without a competing request.');await sleep(10000);continue;}
 try{cp.execFileSync('gh',['api','-X','POST',`repos/${repo}/pages/builds`],{encoding:'utf8',timeout:20000});console.log('Requested one branch build after the deployment queue drained.');return;}catch(e){if(i>=23)throw e;await sleep(10000);}
 }throw Error('Pages deployment queue did not drain; no competing deployment started.');})().catch(e=>{console.error(e.message);process.exitCode=1;});
