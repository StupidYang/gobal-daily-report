#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{collect}=require('../lib/live-collector.cjs');
const dir=path.resolve(process.argv[2]||'.runtime/live'),config=JSON.parse(fs.readFileSync('config/watchlist.json','utf8'));
const documents=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):[];
(async()=>{fs.mkdirSync(dir,{recursive:true});const x=await collect(config,{rawDir:path.join(dir,'raw'),documents,onProgress:p=>fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(p))});fs.writeFileSync(path.join(dir,'packet.json'),JSON.stringify(x,null,2)+'\n');console.log(JSON.stringify({rows:x.rows.length,errors:x.errors.length,durationMs:x.durationMs,complete:x.complete}));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
