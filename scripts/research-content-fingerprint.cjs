#!/usr/bin/env node
'use strict';
// Local-only diagnostic: never fetches, writes a packet, or permits publication.
const fs=require('node:fs'),crypto=require('node:crypto');
const {researchContentFingerprint,researchContentDiagnostics,MAX_BYTES}=require('../lib/research-content-fingerprint.cjs');
try{
 const [url,file,...extra]=process.argv.slice(2);
 if(!url||!file||extra.length)throw Error('Usage: node scripts/research-content-fingerprint.cjs EXACT_URL LOCAL_RESPONSE_BODY');
 if(fs.statSync(file).size>MAX_BYTES)throw Error('Response too large');
 // Match Response.text(): UTF-8 decoding, including BOM removal. These hashes
 // cover the decoded body, as the existing collector does, not wire bytes.
 const body=new TextDecoder('utf-8').decode(fs.readFileSync(file));
 const contentFingerprint=researchContentFingerprint({url,kind:'research'},body);
 if(!contentFingerprint)throw Error('URL is outside the SEC Archives research HTML profile');
 const contentDiagnostics=researchContentDiagnostics({url,kind:'research'},body);
 console.log(JSON.stringify({url,sourceHash:crypto.createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body),contentFingerprint,contentDiagnostics},null,2));
 if(contentFingerprint.status!=='available')process.exitCode=2;
}catch(error){console.error(error.message);process.exitCode=1;}
