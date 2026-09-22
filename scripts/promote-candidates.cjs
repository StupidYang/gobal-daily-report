#!/usr/bin/env node
'use strict';
const path=require('node:path'),{promote}=require('../lib/publication.cjs'),{promoteBatches}=require('../lib/batch.cjs');
if(require.main===module){try{const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'));console.log(JSON.stringify({batches:promoteBatches(root),legacyCandidates:promote(root)},null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={promote,promoteBatches};
