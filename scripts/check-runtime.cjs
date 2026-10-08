#!/usr/bin/env node
'use strict';
const path=require('node:path'),T=require('../lib/task-runtime.cjs');
T.validateConfiguration(path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')));
console.log('Repository: 3 external schedules, 7 roles, canonical prompts, bindings and admission agree. Live execution still requires independent verification.');
