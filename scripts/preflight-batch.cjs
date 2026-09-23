#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),B=require('../lib/batch.cjs'),Q=require('../assets/content-contract.js');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'));
try{
 if(!process.argv[2])throw Error('Usage: node scripts/preflight-batch.cjs /path/to/candidate.json');
 const batch=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),bad=B.validateBatch(batch);if(bad.length)throw Error(bad.join('\n'));
 const synthesis=batch.modules.find(m=>m.module==='synthesis'),quality=Q.quality(synthesis.payload.report);if(quality.errors.length)throw Error(quality.errors.join('\n'));
 const prepared=B.prepareBatch(root,batch,Date.now());
 console.log(JSON.stringify({status:'preflight-passed-not-published',batchId:batch.batchId,reportId:prepared.reportId,moduleCount:prepared.receipts.length,writesPrepared:prepared.writes.length,warnings:quality.warnings,note:'No production pointers or receipts were written. Source truth still needs verification.'},null,2));
}catch(e){console.error(JSON.stringify({status:'preflight-rejected',error:e.message},null,2));process.exitCode=1;}
