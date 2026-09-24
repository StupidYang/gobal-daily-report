'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const P=require('../lib/pipeline.cjs'),L=require('../lib/live-report.cjs'),C=require('../assets/terminal-core.js');

test('rolling window reports actual snapshot span without claiming continuous coverage',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-period-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 P.atomic(path.join(root,'data/history-index.json'),{reports:[
  {reportId:'2026-09-24-1212',label:'2026-09-24 12:12',path:'history/2026-09-24/1212.json'},
  {reportId:'2026-09-24-1410',label:'2026-09-24 14:10',path:'history/2026-09-24/1410.json'},
  {reportId:'2026-09-24-1507',label:'2026-09-24 15:07',path:'history/2026-09-24/1507.json'}
 ]});
 const now=Date.parse('2026-09-24T09:13:00Z'); // 17:13 UTC+8
 const p=L.snapshotPeriod(root,now,false);
 assert.equal(p.coverageMode,'snapshot-span');
 assert.equal(p.snapshotCount,4);
 assert.equal(p.isFull24h,false);
 assert.ok(p.coverageHours>5&&p.coverageHours<5.1);
 assert.match(p.gaps[0],/不代表中间每小时都有行情/);
 const display=C.coverage(p);
 assert.match(display.label,/4个快照/);
 assert.match(display.label,/非连续采样/);
 assert.ok(display.ratio>0&&display.ratio<1);
});

test('single snapshot stays zero-span rather than pretending an hour of coverage',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-period-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const p=L.snapshotPeriod(root,Date.parse('2026-09-24T09:13:00Z'),false);
 assert.equal(p.snapshotCount,1);
 assert.equal(p.coverageHours,0);
 assert.match(C.coverage(p).label,/1个快照/);
});
