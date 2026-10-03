'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {researchContentFingerprint:F,PROFILE,MAX_BYTES}=require('../lib/research-content-fingerprint.cjs');
const {collect}=require('../lib/live-collector.cjs');
const doc={id:'filing',kind:'research',url:'https://www.sec.gov/Archives/edgar/data/123/00012326000001/ex99.htm',title:'Synthetic filing'};
const body='<html><head><title>Synthetic filing</title></head><body><p id="fact" class="amount">Revenue: $1,250.00 on 2026-10-03.</p><table><tr><th>2026</th><th>2025</th></tr><tr><td>1250</td><td>900</td></tr></table></body></html>';
const fingerprint=value=>{const result=F(doc,value);assert.equal(result.status,'available');return result.sha256;};
const raw=value=>crypto.createHash('sha256').update(value).digest('hex');

test('v1 token framing has a stable synthetic known-answer vector',()=>{
 const result=F(doc,'<html><p a="1" b="2">A &amp; B: 100</p></html>');
 assert.equal(result.status,'available');assert.equal(result.tokenCount,6);
 assert.equal(result.sha256,'5e8821cbee586c175f668352c246bc8b579d3a1e897ff7488bab7d24d51dbc43');
});

test('versioned projection matches only defined syntax-level markup variations',()=>{
 const varied=body.replace('<p id="fact" class="amount">',"<p\n class = 'amount'\t id= fact >");
 assert.notEqual(raw(body),raw(varied));assert.equal(fingerprint(body),fingerprint(varied));
 assert.deepEqual(Object.keys(F(doc,body)).sort(),['algorithm','profile','sha256','status','tokenCount','version']);
 assert.equal(F(doc,body).profile,PROFILE);assert.equal(F(doc,body).version,1);
 assert.equal(fingerprint('<html><p hidden id="f">A</p></html>'),fingerprint("<html><p id='f' hidden>A</p></html>"));
});

test('amount, date, text, whitespace, Unicode, row and column order changes fail comparison',()=>{
 const changed=[body.replace('$1,250.00','$1,250.01'),body.replace('2026-10-03','2026-10-04'),body.replace('Revenue','Loss'),body.replace('Revenue: ','Revenue:'),body.replace('Revenue','Revenu\u0435'),body.replace('<th>2026</th><th>2025</th>','<th>2025</th><th>2026</th>'),body.replace('<td>1250</td><td>900</td>','<td>900</td><td>1250</td>'),body.replace('<tr><th>2026</th><th>2025</th></tr><tr><td>1250</td><td>900</td></tr>','<tr><td>1250</td><td>900</td></tr><tr><th>2026</th><th>2025</th></tr>')];
 for(const other of changed)assert.notEqual(fingerprint(body),fingerprint(other));
});

test('attributes, hidden text, inline XBRL, alternative text and table spans remain covered',()=>{
 const original='<html><div hidden style="display:none" data-amount="100"><ix:nonFraction unitRef="USD" scale="3">100</ix:nonFraction></div><table><tr><td colspan="2">Revenue</td></tr></table><img alt="Net loss 100" src="chart.png"></html>';
 for(const [from,to]of [['data-amount="100"','data-amount="101"'],['>100<','>101<'],['scale="3"','scale="6"'],['unitRef="USD"','unitRef="EUR"'],['colspan="2"','colspan="3"'],['display:none','display:block'],['Net loss 100','Net loss 101'],['chart.png','different.png']])assert.notEqual(fingerprint(original),fingerprint(original.replace(from,to)));
});

test('comments, scripts, styles and raw-text elements are never stripped',()=>{
 for(const fragment of ['<!-- revenue 100 -->','<script>const revenue=100;</script>','<style>p::after{content:"100"}</style>','<textarea><b data-amount="100">Revenue</b></textarea>','<![CDATA[Revenue 100]]>']){
  const original='<html>'+fragment+'<p>Report</p></html>';
  assert.notEqual(fingerprint(original),fingerprint(original.replace('100','101')));
  assert.notEqual(fingerprint(original),fingerprint('<html><p>Report</p></html>'));
 }
 const unchanged=body+'<!--'+'x'.repeat(356)+'-->'; // An arbitrary 363-byte suffix is not normalized away.
 assert.equal(Buffer.byteLength(unchanged)-Buffer.byteLength(body),363);
 assert.notEqual(fingerprint(body),fingerprint(unchanged));
 const script='<html><script><!--<script>example</script>--></script><p id="x" class="y">100</p></html>';
 assert.notEqual(fingerprint(script),fingerprint(script.replace('id="x" class="y"',"class='y' id='x'")));
});

test('syntax, decoding or size uncertainty returns unavailable without a digest',()=>{
 const cases=[['<html><p id="a" ID="b">100</p></html>','duplicate-attribute'],['<html><!--100</html>','unterminated-opaque-markup'],['<html><p a="100></p></html>','unterminated-attribute'],['<html><style>100</html>','unterminated-raw-text'],['<!DOCTYPE html [<!ENTITY amount "100">]><html>&amount;</html>','unsupported-doctype'],['<html>\uFFFD</html>','unsupported-decoded-character'],['<html>\0</html>','unsupported-decoded-character'],['<html>1 < 2</html>','unsupported-markup'],['No filing retrieved','missing-html-element'],['x'.repeat(MAX_BYTES+1),'response-too-large']];
 for(const [value,reason]of cases){const result=F(doc,value);assert.equal(result.status,'unavailable');assert.equal(result.reason,reason);assert.equal(result.sha256,undefined);}
});

test('projection scope is exact HTTPS SEC Archives research HTML only',()=>{
 for(const url of ['http://www.sec.gov/Archives/edgar/data/123/456/ex99.htm','https://www.sec.gov.example.com/Archives/edgar/data/123/456/ex99.htm','https://data.sec.gov/Archives/edgar/data/123/456/ex99.htm','https://www.sec.gov:8443/Archives/edgar/data/123/456/ex99.htm','https://name@www.sec.gov/Archives/edgar/data/123/456/ex99.htm','https://www.sec.gov/Archives/edgar/data/123/456/ex99.pdf','https://www.sec.gov/Archives/edgar/data/123/456/ex99.htm?x=1','https://www.sec.gov/Archives/edgar/data/123/456/ex99.htm#x','https://www.sec.gov/news/example.htm','https://127.0.0.1/Archives/edgar/data/123/456/ex99.htm'])assert.equal(F({...doc,url},body),undefined);
 for(const kind of ['news','official',undefined])assert.equal(F({...doc,kind},body),undefined);
});

test('collector adds actual-body fingerprint while preserving raw identity, requests and no saved document bodies',async t=>{
 const rawDir=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-fingerprint-'));t.after(()=>fs.rmSync(rawDir,{recursive:true,force:true}));
 const now=()=>Date.parse('2026-10-03T12:00:00Z');let options;
 const packet=await collect({required:[],usPools:{}},{documents:[{...doc,contentFingerprint:{sha256:'forged'}}],rawDir,now,fetchImpl:async(url,opts)=>{assert.equal(url,doc.url);options=opts;return {ok:true,status:200,headers:{get:()=>null},text:async()=>body};}});
 const receipt=packet.documents[0];assert.equal(receipt.sourceHash,raw(body));assert.equal(receipt.bytes,Buffer.byteLength(body));assert.equal(receipt.url,doc.url);assert.equal(receipt.retrievedAt,'2026-10-03T12:00:00.000Z');
 assert.deepEqual(receipt.contentFingerprint,F(doc,body));assert.equal(packet.requests[0].sha256,receipt.sourceHash);assert.equal(packet.complete,true);
 assert.equal(options.redirect,'error');assert.equal(options.headers['User-Agent'],'GDR-personal-research/2.0');assert.deepEqual(fs.readdirSync(rawDir),[]);assert.equal(JSON.stringify(packet).includes('Revenue:'),false);
});

test('unavailable projection does not falsely fail retrieval or create a successful digest',async()=>{
 const packet=await collect({required:[],usPools:{}},{documents:[doc],fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>'<html><p a="1" a="2">100</p></html>'})});
 assert.equal(packet.complete,true);assert.equal(packet.documents[0].contentRetrieved,true);assert.equal(packet.documents[0].contentFingerprint.status,'unavailable');assert.equal(packet.documents[0].contentFingerprint.sha256,undefined);
});

test('collector keeps response size limit and omits metadata for unrelated documents',async()=>{
 const fetchBody=value=>async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>value});
 const oversized=await collect({required:[],usPools:{}},{documents:[doc],fetchImpl:fetchBody('x'.repeat(MAX_BYTES+1))});
 assert.equal(oversized.documentsRetrieved,0);assert.match(oversized.errors[0].error,/Response too large/);
 const other=await collect({required:[],usPools:{}},{documents:[{...doc,kind:'news'}],fetchImpl:fetchBody(body)});
 assert.equal(other.documents[0].contentFingerprint,undefined);assert.equal(other.documents[0].sourceHash,raw(body));
});

test('local CLI reproduces decoded-body receipt including UTF-8 BOM handling',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-fingerprint-cli-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const file=path.join(directory,'synthetic.html');fs.writeFileSync(file,'\uFEFF'+body);
 const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/research-content-fingerprint.cjs'),doc.url,file],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const receipt=JSON.parse(result.stdout);assert.equal(receipt.sourceHash,raw(body));assert.equal(receipt.bytes,Buffer.byteLength(body));assert.deepEqual(receipt.contentFingerprint,F(doc,body));
});
