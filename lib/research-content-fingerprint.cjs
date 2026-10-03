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
// The diagnostic is a separate, additive protocol. None of its component hashes
// participate in PROFILE above or authorize a content/publication match.
const DIAGNOSTIC_PROFILE='sec-archives-source-components-v1',MAX_INLINE_SCRIPT_BYTES=1024;
function researchContentDiagnostics(document,body){
 if(!eligible(document))return undefined;
 const metadata={version:1,profile:DIAGNOSTIC_PROFILE,algorithm:'sha256',
  offsets:'zero-based UTF-8 bytes of decoded body; half-open ranges',
  limits:{maxBodyBytes:MAX_BYTES,maxExcludedScriptBytes:MAX_INLINE_SCRIPT_BYTES,maxExcludedSpans:1},
  excerpts:{included:false,reason:'source-text-and-attribute-values-never-emitted'}};
 try{
  if(typeof body!=='string')reject('non-text-body');
  if(Buffer.byteLength(body)>MAX_BYTES)reject('response-too-large');
  if(body.includes('\uFFFD')||body.includes('\0'))reject('unsupported-decoded-character');
  const raw=Buffer.from(body,'utf8'),digest=value=>crypto.createHash('sha256').update(value).digest('hex');
  const byteAt=offset=>Buffer.byteLength(body.slice(0,offset));
  const component=(start,end)=>{
   const startByte=byteAt(start),endByte=byteAt(end);
   return {startByte,endByte,bytes:endByte-startByte,sha256:digest(raw.subarray(startByte,endByte))};
  };
  const source={url:document.url,sourceHash:digest(raw),bytes:raw.length};
  let p=0,hasHtml=false,firstOpaque=null,firstOpaqueTail=null,candidate=null;
  const opaque=(kind,tag,start,end)=>{if(!firstOpaque)firstOpaque={kind,tag,...component(start,end)};};
  // Walk precisely the same supported lexical contexts as the fingerprint, but
  // produce only fixed enums, lengths/offsets and hashes. Never return source text.
  while(p<body.length){
   if(body[p]!=='<'){const next=body.indexOf('<',p);p=next<0?body.length:next;continue;}
   let marker,kind,end;
   if(body.startsWith('<!--',p)){marker='-->';kind='comment';}
   else if(body.startsWith('<![CDATA[',p)){marker=']]>';kind='cdata';}
   else if(body.startsWith('<?',p)){marker='?>';kind='processing-instruction';}
   if(marker){
    end=body.indexOf(marker,p+(marker==='-->'?4:2));if(end<0)reject('unterminated-opaque-markup');
    end+=marker.length;opaque(kind,null,p,end);p=end;continue;
   }
   if(/^<!doctype\s/i.test(body.slice(p,p+11))){
    end=body.indexOf('>',p+2);if(end<0)reject('unterminated-doctype');
    if(!/^<!doctype\s+html\s*>$/i.test(body.slice(p,end+1)))reject('unsupported-doctype');
    opaque('doctype',null,p,end+1);p=end+1;continue;
   }
   const tag=readTag(body,p),lower=tag.name.toLowerCase();
   if(!tag.closing&&lower==='html')hasHtml=true;
   if(!tag.closing&&OPAQUE_TAIL.has(lower)){
    opaque('opaque-tail',lower,p,body.length);
    firstOpaqueTail={kind:'opaque-tail',tag:lower,opening:component(p,tag.end),tail:component(p,body.length),prefix:component(0,p)};
    candidate={tag,start:p};p=body.length;continue;
   }
   if(!tag.closing&&RAW_TEXT.has(lower)){
    const close=new RegExp('</'+lower+'[\\t\\n\\f\\r ]*>','ig');close.lastIndex=tag.end;
    const found=close.exec(body);if(!found)reject('unterminated-raw-text');
    end=found.index+found[0].length;opaque('raw-text',lower,p,end);p=end;continue;
   }
   p=tag.end;
  }
  if(!hasHtml)reject('missing-html-element');
  let inlineScript={status:'unavailable',reason:'no-opaque-tail'};
  if(candidate){
   const {tag,start}=candidate,attributes=new Map(tag.attrs.map(([key,value])=>[key.toLowerCase(),value]));
   let reason=null,end,closeStart;
   if(tag.name.toLowerCase()!=='script')reason='first-opaque-tail-is-not-script';
   else if(tag.selfClosing)reason='self-closing-script';
   else if(attributes.has('src'))reason='external-script';
   else if(attributes.has('type')&&!['text/javascript','application/javascript'].includes(attributes.get('type')))reason='unsupported-script-type';
   else if(byteAt(tag.end)-byteAt(start)>MAX_INLINE_SCRIPT_BYTES)reason='script-span-too-large';
   else{
    // No JavaScript is parsed or executed. For this *lexical* diagnostic the
    // first '<' after the opener must be a simple closing tag. This rejects
    // HTML comments, escaped/double-escaped script modes and nested markup.
    closeStart=body.indexOf('<',tag.end);
    if(closeStart<0)reason='missing-script-close';
    else{
     const close=body.slice(closeStart).match(/^<\/script[\t\n\f\r ]*>/i);
     if(!close)reason='ambiguous-script-boundary';
     else{end=closeStart+close[0].length;if(byteAt(end)-byteAt(start)>MAX_INLINE_SCRIPT_BYTES)reason='script-span-too-large';}
    }
   }
   if(reason)inlineScript={status:'unavailable',reason};
   else{
    const span=component(start,end),prefix=component(0,start),suffix=component(end,body.length);
    const remainderHash=crypto.createHash('sha256').update(raw.subarray(0,span.startByte)).update(raw.subarray(span.endByte)).digest('hex');
    inlineScript={status:'available',kind:'first-short-inline-script-lexical-span',excludedSpans:1,
     span,opening:component(start,tag.end),payload:component(tag.end,closeStart),closing:component(closeStart,end),prefix,suffix,
     remainder:{bytes:raw.length-span.bytes,sha256:remainderHash,construction:'decoded-body prefix || suffix, without separators or normalization'}};
   }
  }
  return {...metadata,status:'available',source,firstOpaque,firstOpaqueTail,inlineScript};
 }catch(error){if(!(error instanceof Unsupported))throw error;return {...metadata,status:'unavailable',reason:error.message};}
}
module.exports={researchContentFingerprint,researchContentDiagnostics,PROFILE,DIAGNOSTIC_PROFILE,MAX_BYTES,MAX_INLINE_SCRIPT_BYTES};
