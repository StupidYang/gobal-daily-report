'use strict';
const crypto=require('node:crypto');

// This is a source-syntax projection, NOT an HTML renderer or semantic text hash.
// Version 1 canonicalizes only attribute order, markup spacing and quote delimiters.
// Every text character, tag/name/value, comment and opaque payload remains covered.
const PROFILE='sec-archives-html-syntax-v1',MAX_BYTES=2*1024*1024;
const SPACE=/[\t\n\f\r ]/,NAME=/^[A-Za-z_:][A-Za-z0-9_.:-]*/;
const RAW_TEXT=new Set(['title','textarea','style','xmp','iframe','noembed','noframes']);
// These contexts have parsing/execution modes that a small lexer must not guess.
// Freeze the entire remaining suffix verbatim, including the opening tag.
const OPAQUE_TAIL=new Set(['script','noscript','plaintext','template','svg','math']);
class Unsupported extends Error {}
const reject=reason=>{throw new Unsupported(reason);};

function eligible(document){
 if(document?.kind!=='research')return false;
 try{const u=new URL(document.url);return u.protocol==='https:'&&u.hostname==='www.sec.gov'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/Archives\/edgar\/data\/\d+\/\d+\/[^/]+\.html?$/.test(u.pathname);}catch{return false;}
}

// Parse a single lexical tag without discarding any attributes. Duplicate
// attributes are ambiguous and make the projection unavailable, never a match.
function readTag(body,start){
 let p=start+1,closing=false;
 if(body[p]==='/'){closing=true;p++;}
 const match=body.slice(p).match(NAME);if(!match)reject('unsupported-markup');
 const name=match[0];p+=name.length;
 const attrs=[],seen=new Set();let selfClosing=false;
 while(p<body.length){
  const before=p;while(SPACE.test(body[p]||''))p++;
  if(body[p]==='>'){p++;break;}
  if(body[p]==='/'&&body[p+1]==='>'){selfClosing=true;p+=2;break;}
  if(closing||p===before)reject('unsupported-tag-syntax');
  const attr=body.slice(p).match(NAME);if(!attr)reject('unsupported-attribute-syntax');
  const key=attr[0],duplicateKey=key.toLowerCase();p+=key.length;
  if(seen.has(duplicateKey))reject('duplicate-attribute');seen.add(duplicateKey);
  let equals=p;while(SPACE.test(body[equals]||''))equals++;
  let value=null;
  if(body[equals]==='='){
   p=equals+1;while(SPACE.test(body[p]||''))p++;
   const quote=body[p];
   if(quote==='"'||quote==="'"){
    const end=body.indexOf(quote,p+1);if(end<0)reject('unterminated-attribute');
    value=body.slice(p+1,end);p=end+1;
   }else{
    const begin=p;while(p<body.length&&!SPACE.test(body[p])&&body[p]!=='>')p++;
    value=body.slice(begin,p);
    if(!value||/["'`=<>]/.test(value))reject('unsupported-attribute-value');
    // A trailing slash in an unquoted value is a value, not a self-closing tag.
   }
  }
  attrs.push([key,value]);
 }
 if(body[p-1]!=='>')reject('unterminated-tag');
 if(closing&&selfClosing)reject('unsupported-tag-syntax');
 attrs.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 return {name,closing,selfClosing,attrs,end:p};
}

function projection(body){
 const hash=crypto.createHash('sha256');let tokenCount=0,p=0,hasHtml=false;
 // JSON-array framing is unambiguous even if source text contains delimiters.
 const token=(...parts)=>{hash.update(JSON.stringify(parts)+'\n');tokenCount++;};
 token('profile',PROFILE);
 while(p<body.length){
  if(body[p]!=='<'){
   const next=body.indexOf('<',p),end=next<0?body.length:next;
   token('text',body.slice(p,end));p=end;continue;
  }
  let marker,end;
  if(body.startsWith('<!--',p))marker='-->';
  else if(body.startsWith('<![CDATA[',p))marker=']]>';
  else if(body.startsWith('<?',p))marker='?>';
  if(marker){
   end=body.indexOf(marker,p+(marker==='-->'?4:2));
   if(end<0)reject('unterminated-opaque-markup');
   end+=marker.length;token('opaque',body.slice(p,end));p=end;continue;
  }
  if(/^<!doctype\s/i.test(body.slice(p,p+11))){
   end=body.indexOf('>',p+2);if(end<0)reject('unterminated-doctype');
   const declaration=body.slice(p,end+1);
   // No entity declarations/internal subset or quoted greater-than guessing.
   if(!/^<!doctype\s+html\s*>$/i.test(declaration))reject('unsupported-doctype');
   token('opaque',declaration);p=end+1;continue;
  }
  const tag=readTag(body,p),lower=tag.name.toLowerCase();
  if(!tag.closing&&lower==='html')hasHtml=true;
  if(!tag.closing&&OPAQUE_TAIL.has(lower)){
   token('opaque-tail',body.slice(p));p=body.length;continue;
  }
  if(!tag.closing&&RAW_TEXT.has(lower)){
   const close=new RegExp('</'+lower+'[\\t\\n\\f\\r ]*>','ig');close.lastIndex=tag.end;
   const found=close.exec(body);if(!found)reject('unterminated-raw-text');
   end=found.index+found[0].length;
   token('opaque',body.slice(p,end));p=end;continue;
  }
  token('tag',tag.closing,tag.name,tag.attrs,tag.selfClosing);p=tag.end;
 }
 if(!hasHtml)reject('missing-html-element');
 return {sha256:hash.digest('hex'),tokenCount};
}

function researchContentFingerprint(document,body){
 if(!eligible(document))return undefined;
 const metadata={version:1,profile:PROFILE,algorithm:'sha256'};
 try{
  if(typeof body!=='string')reject('non-text-body');
  if(Buffer.byteLength(body)>MAX_BYTES)reject('response-too-large');
  // Decoding errors must not be normalized into a successful content match.
  if(body.includes('\uFFFD')||body.includes('\0'))reject('unsupported-decoded-character');
  return {...metadata,status:'available',...projection(body)};
 }catch(error){if(!(error instanceof Unsupported))throw error;return {...metadata,status:'unavailable',reason:error.message};}
}
module.exports={researchContentFingerprint,PROFILE,MAX_BYTES};
