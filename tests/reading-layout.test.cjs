'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../assets/reading-layout.js');
test('reading segmentation preserves every character, number, timestamp and reference',()=>{
 const examples=['', '短段落，不用拆。', '  原文前后空白也要保留。\n\n', 'BTC 82,720.12 USD，变化-0.98%，合约BZX26.NYM；来源https://example.org/price?id=1.2。'.repeat(5), '“'+ '完整证据与条件。'.repeat(25)+'”\n\n不能改写时间2026-10-08T07:02:16Z。', '英文source.with.dots@example.org does not create sentence breaks.'];
 for(const text of examples)assert.equal(R.segments(text).join(''),text);
 assert.ok(R.segments(examples[3]).length>1);
 assert.equal(R.segments(examples.at(-1)).length,1);
});
test('all deployed editorial strings remain lossless after segmentation',()=>{
 const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/latest.json'),'utf8'));
 let count=0;function walk(x){if(typeof x==='string'){assert.equal(R.segments(x).join(''),x);count++;}else if(x&&typeof x==='object')Object.values(x).forEach(walk);}walk(report);assert.ok(count>100);
});
test('DOM fill emits plain text only, including strings that look like HTML',()=>{
 const node=tag=>({tagName:tag,className:'',textContent:'',children:[],classList:{add(){}},append(n){this.children.push(n);}});
 const doc={createElement:node},p=node('p'),text='<img src=x onerror=alert(1)>长文本。'.repeat(15);
 R.fill(p,text,doc);assert.ok(p.children.length>1);assert.equal(p.children.map(n=>n.textContent).join(''),text);assert.ok(p.children.every(n=>n.tagName==='span'));assert.ok(!Object.hasOwn(p,'innerHTML'));
});
test('mobile reading assets load before the reader and after existing styles',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.ok(html.indexOf('assets/reading-layout.js')<html.indexOf('assets/reader.js'));
 assert.ok(html.indexOf('assets/mobile-reading.css')>html.indexOf('assets/mainland.css'));
});
test('reading layout does not truncate evidence or force tiny text',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../assets/mobile-reading.css'),'utf8');
 assert.doesNotMatch(css,/line-clamp|text-overflow|overflow\s*:\s*hidden/);
 assert.match(css,/font-size:16px;line-height:1.85/);
 assert.match(css,/\.event-row\{grid-template-columns:1fr/);
});
