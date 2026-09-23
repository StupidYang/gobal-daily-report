#!/usr/bin/env node
'use strict';
// Actions push payloads omit per-commit added/removed/modified arrays. Read the pinned commit.
const fs=require('node:fs'),cp=require('node:child_process'),E=require('../lib/execution.cjs');
function select(files){
 const scoped=files.filter(x=>/^runtime\/(requests|submissions)\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}\.json$/.test(x.filename||''));
 if(scoped.length!==1||scoped[0].status!=='added')throw Error('Exactly one new immutable request or submission is required');
 const file=scoped[0].filename;return {file,mode:file.includes('/requests/')?'request':'submit',id:file.split('/').pop().slice(0,-5)};
}
async function route(event,request){
 if(event.ref!=='refs/heads/gdr-runtime'||event.deleted||!(/^[0-9a-f]{40}$/.test(event.after||''))||/^0+$/.test(event.after))throw Error('Invalid runtime push identity');
 const files=[];let finished=false;
 for(let page=1;page<=5;page++){const r=await request('GET','/commits/'+event.after+'?per_page=100&page='+page);if(r?.sha!==event.after||!Array.isArray(r.files))throw Error('Commit response does not match the event SHA');files.push(...r.files);if(r.files.length<100){finished=true;break;}}
 if(!finished)throw Error('Commit exceeds bounded routing scope');return select(files);
}
if(require.main===module){const store=new E.GitHubStore({repository:process.env.GITHUB_REPOSITORY});(async()=>{const r=await route(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),store.request.bind(store));console.log(JSON.stringify({routing:'pinned-commit-api',...r}));cp.execFileSync(process.execPath,['scripts/execution-worker.cjs',r.mode,r.id],{stdio:'inherit',timeout:240000});})().catch(e=>{console.error(e.stack);process.exitCode=1;});}
module.exports={route,select};
