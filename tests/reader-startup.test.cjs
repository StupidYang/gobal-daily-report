'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tags=[...html.matchAll(/<script\b([^>]*)\bsrc="\.\/([^"?]+)[^"]*"[^>]*>/g)].map(m=>({attrs:m[1],src:m[2]}));
function index(name){const i=tags.findIndex(x=>x.src===name);assert.ok(i>=0,'Missing script '+name);return i;}
test('watchlist listener is registered before the async reader can publish its initial selection',()=>{
 assert.ok(index('assets/watchlist-core.js')<index('assets/watchlist.js'),'Watchlist dependency must load first');
 assert.ok(index('assets/watchlist.js')<index('assets/reader.js'),'One-shot selection event must not precede its consumer');
});
test('selection bootstrap scripts keep ordered defer execution, never unordered async',()=>{
 for(const name of ['assets/watchlist-core.js','assets/watchlist.js','assets/reader.js']){
  const t=tags[index(name)];assert.match(t.attrs,/\bdefer\b/);assert.doesNotMatch(t.attrs,/\basync\b/);
 }
});
