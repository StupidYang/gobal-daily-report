#!/usr/bin/env node
'use strict';
const path=require('node:path'),fs=require('node:fs'),P=require('../lib/pipeline.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'));
async function main(){const [cmd,arg,flag]=process.argv.slice(2);
 if(cmd==='prompt'){console.log(P.compile(root,arg,flag==='--entry'));return;}
 if(cmd==='context'){console.log(P.json(P.context(root,arg)));return;}
 if(cmd==='validate'){const m=P.read(path.resolve(arg));const e=P.W.validate(m,m?.module);if(e.length)throw Error(e.join('\n'));console.log('模块结构检查通过；不证明源数据真实性。');return;}
 if(cmd==='ingest'){console.log(P.json(P.ingest(root,P.read(path.resolve(arg)))));return;}
 if(cmd==='publish'){console.log(P.json(P.publishReport(root,P.read(path.resolve(arg)))));return;}
 if(cmd==='rank'){const m=P.read(path.resolve(arg)),config=P.read(path.join(root,'config/watchlist.json'));const e=P.W.validate(m,m?.module);if(e.length)throw Error(e.join('\n'));console.log(P.json(P.W.arr(m.payload.groups).map(g=>P.W.rankGroup(g,config,Number(flag)||config.defaultN))));return;}
 if(cmd==='export-tasks'){const m=P.read(path.join(root,'automation/manifest.json'));console.log(P.json({manifestVersion:m.version,repository:m.repository,tasks:m.tasks.map(t=>({...t,prompt:P.compile(root,t.role,true)}))}));return;}
 if(cmd==='check-config'){const m=P.read(path.join(root,'automation/manifest.json')),c=P.read(path.join(root,'config/watchlist.json'));if(new Set(c.required.map(x=>x.id)).size!==c.required.length)throw Error('重复资产ID');if(m.tasks.filter(t=>t.ownedPaths.includes('data/latest.json')).length!==1)throw Error('必须且仅有一个报告发布者');for(const t of m.tasks){if(!P.W.MODULES.includes(t.role))throw Error('未知角色');fs.readFileSync(path.join(root,t.promptFile));}console.log('配置/角色/单发布者检查通过');return;}
 if(cmd==='serve'){const http=require('node:http');const port=Number(arg)||8080;http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost'),rel=decodeURIComponent(u.pathname),p=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));if(!p.startsWith(root+path.sep)||rel.includes('/.'))throw Error();const actual=fs.realpathSync(p),base=fs.realpathSync(root);if(!actual.startsWith(base+path.sep))throw Error();const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};res.setHeader('Content-Type',types[path.extname(p)]||'text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');fs.createReadStream(p).on('error',()=>{res.statusCode=404;res.end('Not found');}).pipe(res);}catch{res.statusCode=400;res.end('Bad request');}}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));return;}
 throw Error('用法: node scripts/gdr.cjs prompt ROLE [--entry] | context ROLE | validate FILE | ingest FILE | publish REPORT | rank MODULE [N] | export-tasks | check-config | serve [PORT]');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
