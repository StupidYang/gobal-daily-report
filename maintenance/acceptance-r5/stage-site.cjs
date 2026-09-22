#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),dest=path.resolve(process.argv[2]||path.join(root,'.runtime/site'));
if(dest===root||root.startsWith(dest+path.sep))throw Error('Site destination cannot contain the source repository');
if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('Site destination must not be a symlink');
if(fs.existsSync(dest)&&fs.readdirSync(dest).length&&!fs.existsSync(path.join(dest,'data/build.json')))throw Error('Destination is nonempty and not a GDR staging directory');
fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
function copy(rel){const src=path.join(root,rel);if(!fs.existsSync(src))return;const stat=fs.lstatSync(src);if(stat.isSymbolicLink())throw Error('Do not publish symbolic links: '+rel);if(stat.isDirectory()){for(const item of fs.readdirSync(src))copy(rel+'/'+item);return;}const target=path.join(dest,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(src,target);}
for(const rel of ['index.html','.nojekyll','assets','config','docs','history','data/latest.json','data/history-index.json','data/publication-status.json','data/modules','data/runs','data/receipts'])copy(rel);
for(const f of fs.readdirSync(path.join(root,'data')))if(/^editorial-[\w-]+\.json$/.test(f))copy('data/'+f);
const report=JSON.parse(fs.readFileSync(path.join(dest,'data/latest.json'),'utf8'));
const files={};function inventory(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())inventory(file);else files[path.relative(dest,file).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}
for(const rel of ['assets','data/modules'])inventory(path.join(dest,rel));
files['index.html']=crypto.createHash('sha256').update(fs.readFileSync(path.join(dest,'index.html'))).digest('hex');
files['data/latest.json']=crypto.createHash('sha256').update(fs.readFileSync(path.join(dest,'data/latest.json'))).digest('hex');
let commit=null;try{commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
fs.writeFileSync(path.join(dest,'data/build.json'),JSON.stringify({buildVersion:1,commit,builtAt:new Date().toISOString(),reportId:report.reportId,files,note:'Build identity and byte hashes; not proof of financial source truth.'},null,2)+'\n');
console.log(JSON.stringify({dest,reportId:report.reportId,commit,files:Object.keys(files).length}));
