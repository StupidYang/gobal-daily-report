'use strict';
// about:blank used by network-isolated tests is not a secure origin. Emulate only
// WebCrypto SHA-256 with Node's native implementation; live HTTPS uses native browser crypto.
const crypto=require('node:crypto');
module.exports=async function(page){
 if(!page.__gdrDigest){await page.exposeFunction('__gdrTestSha256',bytes=>[...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()]);page.__gdrDigest=true;}
 await page.evaluate(()=>{if(!globalThis.crypto.subtle)Object.defineProperty(globalThis.crypto,'subtle',{value:{digest:async(algorithm,bytes)=>{if(algorithm!=='SHA-256')throw Error('Test digest supports only SHA-256');return new Uint8Array(await window.__gdrTestSha256([...new Uint8Array(bytes)])).buffer;}}});});
};
