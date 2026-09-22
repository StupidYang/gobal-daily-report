#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(process.env.GDR_ROOT||path.join(__dirname,'..')),dest=path.resolve(process.argv[2]||path.join(root,'.runtime/site'));
if(dest===root||root.startsWith(dest+path.sep))throw Error('Site destination cannot contain the source repository');
if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('Site destination must not be a symlink');
if(fs.existsSync(dest)&&fs.readdirSync(dest).length&&!fs.existsSync(path.join(dest,'data/build.json')))throw Error('Destination is nonempty and not a GDR staging directory');
fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
function copy(rel){const src=path.join(root,rel);if(!fs.existsSync(src))return;const stat=fs.lstatSync(src);if(stat.isSymbolicLink())throw Error('Do not publish symbolic links: '+rel);if(stat.isDirectory()){for(const item of fs.readdirSync(src))copy(rel+'/'+item);return;}const target=path.join(dest,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(src,target);}
for(const rel of ['index.html','.nojekyll','assets','config','docs','history','data/latest.json','data/history-index.json','data/publication-status.json','data/modules','data/runs','data/receipts','data/runtime-control.json','demo','synthetic-manifest.json','fixture-evidence.html'])copy(rel);
for(const f of fs.readdirSync(path.join(root,'data')))if(/^editorial-[\w-]+\.json$/.test(f))copy('data/'+f);
const controlFile=path.join(root,'automation/control.json');
if(fs.existsSync(controlFile)){const control=JSON.parse(fs.readFileSync(controlFile,'utf8'));fs.mkdirSync(path.join(dest,'data'),{recursive:true});fs.writeFileSync(path.join(dest,'data/runtime-control.json'),JSON.stringify(control,null,2)+'\n');}
const report=JSON.parse(fs.readFileSync(path.join(dest,'data/latest.json'),'utf8'));
const files={};function inventory(dir){for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())inventory(file);else if(path.relative(dest,file).split(path.sep).join('/')!=='data/build.json') files[path.relative(dest,file).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}
for(const rel of ['assets','data','history','config','docs','demo'])if(fs.existsSync(path.join(dest,rel)))inventory(path.join(dest,rel));
for(const rel of ['index.html','data/latest.json','synthetic-manifest.json','fixture-evidence.html'].filter(x=>fs.existsSync(path.join(dest,x))))files[rel]=crypto.createHash('sha256').update(fs.readFileSync(path.join(dest,rel))).digest('hex');
let commit=null;try{commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
const buildId=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');let old=null;
try{old=JSON.parse(fs.readFileSync(path.join(root,'data/build.json'),'utf8'));}catch{}
const build=old?.buildId===buildId?old:{buildVersion:1,buildId,commit,builtAt:process.env.GDR_BUILD_TIME||new Date().toISOString(),reportId:report.reportId,files,note:'commit is the source context before a possible publication commit; buildId and file hashes identify the actual public bytes. Not proof of market source truth.'};
const text=JSON.stringify(build,null,2)+'\n';
if(process.env.GDR_PERSIST_BUILD==='1'){const file=path.join(root,'data/build.json'),tmp=file+'.tmp-'+process.pid;fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);}
fs.writeFileSync(path.join(dest,'data/build.json'),text);
console.log(JSON.stringify({dest,reportId:report.reportId,commit:build.commit,buildId,files:Object.keys(files).length}));
