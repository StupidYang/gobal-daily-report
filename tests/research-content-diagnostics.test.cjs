'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {researchContentDiagnostics:D,researchContentFingerprint:F,DIAGNOSTIC_PROFILE,MAX_INLINE_SCRIPT_BYTES,MAX_BYTES}=require('../lib/research-content-fingerprint.cjs');
const {collect}=require('../lib/live-collector.cjs');
const doc={id:'synthetic-filing',kind:'research',url:'https://www.sec.gov/Archives/edgar/data/123/00012326000001/synthetic.htm'};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const original='<html><head><title>Synthetic filing</title></head><body>Revenue 100 on 2026-10-03.<table><tr><td>100</td><td>90</td></tr></table></body></html>';
const script='<script type="text/javascript">window.example = 1;</script>';
const insert=value=>original.replace('<head>','<head>'+value);

test('additive diagnostic binds components to source and reconstructs an exact byte remainder',()=>{
 const body=insert(script),d=D(doc,body);assert.equal(d.status,'available');assert.equal(d.profile,DIAGNOSTIC_PROFILE);
 assert.deepEqual(d.source,{url:doc.url,sourceHash:hash(body),bytes:Buffer.byteLength(body)});
 assert.equal(d.firstOpaque.kind,'opaque-tail');assert.equal(d.firstOpaque.tag,'script');
 const s=d.inlineScript;assert.equal(s.status,'available');assert.equal(s.excludedSpans,1);
 assert.equal(s.span.bytes,Buffer.byteLength(script));assert.equal(s.span.sha256,hash(script));
 assert.equal(s.remainder.sha256,hash(original));assert.equal(s.remainder.bytes,Buffer.byteLength(original));
 const raw=Buffer.from(body);for(const key of ['span','opening','payload','closing','prefix','suffix']){
  const c=s[key];assert.equal(c.endByte-c.startByte,c.bytes);assert.equal(hash(raw.subarray(c.startByte,c.endByte)),c.sha256);
 }
 assert.notEqual(F(doc,body).sha256,F(doc,original).sha256);assert.notEqual(d.source.sourceHash,s.remainder.sha256);
 assert.equal(s.opening.bytes+s.payload.bytes+s.closing.bytes,s.span.bytes);
});

test('offsets are half-open decoded UTF-8 byte ranges, not JavaScript character indices',()=>{
 const prefix='<html><!--中文 😀--><head>',suffix='</head><body>公司 100</body></html>',body=prefix+script+suffix,d=D(doc,body);
 assert.equal(d.inlineScript.span.startByte,Buffer.byteLength(prefix));assert.notEqual(d.inlineScript.span.startByte,prefix.length);
 assert.equal(d.inlineScript.span.endByte,Buffer.byteLength(prefix+script));assert.equal(d.inlineScript.remainder.sha256,hash(prefix+suffix));
 assert.equal(d.firstOpaque.kind,'comment');assert.equal(d.firstOpaque.startByte,6);assert.equal(d.firstOpaqueTail.tag,'script');
});

test('text, amount, date and table order changes outside the span change the exact remainder',()=>{
 const body=insert(script),expected=D(doc,body).inlineScript.remainder.sha256;
 for(const [from,to]of [['Revenue','Loss'],['Revenue 100','Revenue 101'],['2026-10-03','2026-10-04'],['<td>100</td><td>90</td>','<td>90</td><td>100</td>'],['</head><body>','</head>\n<body>']])assert.notEqual(D(doc,body.replace(from,to)).inlineScript.remainder.sha256,expected);
});

test('a changed excluded script can share a remainder, but always changes bound source/span hashes',()=>{
 const a=D(doc,insert('<script>document.body.textContent="100";</script>'));
 const b=D(doc,insert('<script>document.body.textContent="900";</script>'));
 assert.equal(a.inlineScript.remainder.sha256,b.inlineScript.remainder.sha256);
 assert.notEqual(a.source.sourceHash,b.source.sourceHash);assert.notEqual(a.inlineScript.span.sha256,b.inlineScript.span.sha256);
 assert.notEqual(a.inlineScript.payload.sha256,b.inlineScript.payload.sha256);
 // Equality only identifies bytes outside the span. This is not a safety or eligibility verdict.
 for(const d of [a,b])for(const key of ['benign','eligible','verified','contentMatch','publishable'])assert.equal(Object.hasOwn(d,key),false);
});

test('only the first eligible opaque tail is inspected and only one script span is excluded',()=>{
 const second='<script>window.other=2;</script>',d=D(doc,insert(script+second));
 assert.equal(d.inlineScript.remainder.sha256,hash(insert(second)));
 assert.equal(d.inlineScript.excludedSpans,1);
 assert.equal(D(doc,insert('<script src="remote.js"></script>'+script)).inlineScript.reason,'external-script');
 assert.equal(D(doc,insert('<noscript>100</noscript>'+script)).inlineScript.reason,'first-opaque-tail-is-not-script');
});

test('comment and raw-text lookalikes cannot become a script candidate',()=>{
 const before='<!--'+script+'--><title>'+script+'</title>',body='<html><head>'+before+'</head><body>100</body></html>',d=D(doc,body);
 assert.equal(d.firstOpaque.kind,'comment');assert.equal(d.firstOpaqueTail,null);assert.equal(d.inlineScript.status,'unavailable');
 assert.equal(d.inlineScript.reason,'no-opaque-tail');
});

test('ambiguous, external, nonclassic, self-closing or missing script boundaries have no remainder',()=>{
 const cases=[['<script><!--x--></script>','ambiguous-script-boundary'],['<script>if (a < b) x=1;</script>','ambiguous-script-boundary'],['<script><script>x</script></script>','ambiguous-script-boundary'],['<script>x</script bad>','ambiguous-script-boundary'],['<script>x</script/>','ambiguous-script-boundary'],['<script>x','missing-script-close'],['<script/>','self-closing-script'],['<script src="/secret"></script>','external-script'],['<script SRC="/secret"></script>','external-script'],['<script type="module">x=1;</script>','unsupported-script-type'],['<script type="application/ld+json">{}</script>','unsupported-script-type'],['<script type>x=1;</script>','unsupported-script-type']];
 for(const [value,reason]of cases){const d=D(doc,'<html><head>'+value);assert.equal(d.status,'available');assert.equal(d.inlineScript.status,'unavailable',value);assert.equal(d.inlineScript.reason,reason,value);assert.equal(d.inlineScript.remainder,undefined);}
});

test('script span size is bounded including opening attributes and closing tag',()=>{
 const wrap=value=>'<script>'+value+'</script>',exact=wrap('x'.repeat(MAX_INLINE_SCRIPT_BYTES-17));
 assert.equal(Buffer.byteLength(exact),MAX_INLINE_SCRIPT_BYTES);assert.equal(D(doc,insert(exact)).inlineScript.status,'available');
 for(const value of [wrap('x'.repeat(MAX_INLINE_SCRIPT_BYTES-16)),wrap('中'.repeat(400)),'<script nonce="'+'x'.repeat(MAX_INLINE_SCRIPT_BYTES)+'">x</script>']){
  const d=D(doc,insert(value));assert.equal(d.inlineScript.reason,'script-span-too-large');assert.equal(d.inlineScript.remainder,undefined);
 }
});

test('source/decoding/lexical uncertainty has no available diagnostic or partial candidate',()=>{
 for(const [value,reason]of [['<html><p a="1" A="2">x</p>'+script,'duplicate-attribute'],['<html><!--x','unterminated-opaque-markup'],['<html><textarea>x','unterminated-raw-text'],['<html>\uFFFD'+script,'unsupported-decoded-character'],['<html>\0'+script,'unsupported-decoded-character'],['<html>1 < 2'+script,'unsupported-markup'],['<script>x</script>','missing-html-element'],['x'.repeat(MAX_BYTES+1),'response-too-large']]){
  const d=D(doc,value);assert.equal(d.status,'unavailable');assert.equal(d.reason,reason);assert.equal(d.inlineScript,undefined);assert.equal(d.firstOpaqueTail,undefined);
 }
});

test('secret-marker redaction is unconditional: no excerpt or attribute value is ever emitted',()=>{
 const secrets=['session=private-session-123','cookie=private-cookie-123','token=private-token-123','nonce=private-nonce-123','password=private-password-123','Authorization: Bearer private-bearer-123','api_key=private-key-123','eyJhbGciOiJIUzI1NiJ9.private.payload','unmarkedPrivateValue123'];
 for(const secret of secrets){
  const body='<html><!--'+secret+'--><head><script nonce="'+secret+'">window.privateValue="'+secret+'";</script></head><body>Copyrighted full document sentinel</body></html>',d=D(doc,body),output=JSON.stringify(d);
  assert.equal(d.inlineScript.status,'available');assert.equal(d.excerpts.included,false);assert.equal(output.includes(secret),false);assert.equal(output.includes('Copyrighted full document sentinel'),false);assert.equal(output.includes('window.privateValue'),false);assert.equal(output.includes('<script'),false);
 }
});

test('large opaque components produce fixed-size hashes/metadata with no raw text',()=>{
 const protectedText='SYNTHETIC_PROTECTED_FULL_BODY_'.repeat(30000),body='<html><!--private-comment--><script src="/dynamic-token"></script>'+protectedText+'</html>',output=JSON.stringify(D(doc,body));
 assert.ok(output.length<4000);for(const marker of ['private-comment','dynamic-token','SYNTHETIC_PROTECTED_FULL_BODY_','<script'])assert.equal(output.includes(marker),false);
});

test('diagnostic scope exactly follows existing SEC research profile',()=>{
 for(const url of ['http://www.sec.gov/Archives/edgar/data/123/456/a.htm','https://www.sec.gov.example.com/Archives/edgar/data/123/456/a.htm','https://data.sec.gov/submissions/CIK1.json',doc.url+'?x=1',doc.url+'#section','https://user@www.sec.gov/Archives/edgar/data/123/456/a.htm'])assert.equal(D({...doc,url},insert(script)),undefined);
 assert.equal(D({...doc,kind:'official'},insert(script)),undefined);
});

test('collector freezes hashes-only diagnostic without saving source bodies or trusting supplied metadata',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gdr-component-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const body=insert('<script nonce="privateNonce123">document.cookie="privateSession123";</script>');
 const packet=await collect({required:[],usPools:{}},{documents:[{...doc,contentDiagnostics:{sourceHash:'forged'}}],rawDir:directory,fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>body})});
 const receipt=packet.documents[0];assert.equal(packet.complete,true);assert.equal(receipt.sourceHash,hash(body));assert.equal(receipt.bytes,Buffer.byteLength(body));assert.equal(packet.requests[0].sha256,hash(body));
 assert.deepEqual(receipt.contentDiagnostics,D(doc,body));assert.deepEqual(receipt.contentFingerprint,F(doc,body));assert.equal(receipt.contentDiagnostics.source.sourceHash,receipt.sourceHash);
 assert.deepEqual(fs.readdirSync(directory),[]);for(const marker of ['privateNonce123','privateSession123','document.cookie','Revenue 100'])assert.equal(JSON.stringify(packet).includes(marker),false);
});
