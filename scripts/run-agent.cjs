#!/usr/bin/env node
/* AI-agnostic command adapter. No shell interpolation; data/API keys stay in environment. */
'use strict';
const path=require('node:path'),fs=require('node:fs'),cp=require('node:child_process'),P=require('../lib/pipeline.cjs');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),role=process.argv[2];
(async()=>{
 const prompt=P.compile(root,role),ctx=P.context(root,role),exe=process.env.GDR_AGENT_EXEC;
 if(!exe)throw Error('设置GDR_AGENT_EXEC到你自己的AI适配器可执行文件。适配器从stdin读取JSON，stdout只输出模块JSON。');
 const args=JSON.parse(process.env.GDR_AGENT_ARGS||'[]');if(!Array.isArray(args)||args.some(x=>typeof x!=='string'))throw Error('GDR_AGENT_ARGS须为JSON字符串数组');
 const limit=Number(process.env.GDR_AGENT_TIMEOUT_MS)||600000;
 const result=await new Promise((resolve,reject)=>{const child=cp.spawn(exe,args,{cwd:root,env:process.env,shell:false,stdio:['pipe','pipe','pipe']});let out='',err='',done=false;
  const timer=setTimeout(()=>{child.kill('SIGTERM');finish(Error('AI适配器超时'));},limit);
  function finish(e){if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(out);}
  child.on('error',finish);child.stdout.on('data',b=>{out+=b;if(out.length>16000000){child.kill();finish(Error('输出超过16MB'));}});child.stderr.on('data',b=>{err=(err+b).slice(-4000);});child.on('close',code=>finish(code===0?null:Error('适配器失败 '+code+': '+err)));
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({protocol:'gdr-agent-v1',role,prompt,context:ctx}));
 });
 const module=JSON.parse(result);if(module.module!==role)throw Error('适配器跨角色输出，拒绝');
 const e=P.W.validate(module,role);if(e.length)throw Error(e.join('\n'));
 const Pub=require('../lib/publication.cjs');
 Pub.submit(root,module);Pub.promote(root);
 const receipt=P.read(path.join(root,'data/receipts',role,module.runId+'.json'));
 if(!receipt||!['published','archived-older'].includes(receipt.status))throw Error('候选未发布: '+JSON.stringify(receipt));
 console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
