#!/usr/bin/env node
'use strict';
const path=require('node:path'),{promote}=require('../lib/publication.cjs');
if(require.main===module){try{console.log(JSON.stringify(promote(path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..'))),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={promote};
