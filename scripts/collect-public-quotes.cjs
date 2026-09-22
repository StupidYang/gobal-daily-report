'use strict';
// Optional public-provider probe. Never bypass authentication/rate limits or publish raw output.
const fs=require('node:fs'),path=require('node:path');
const config=JSON.parse(fs.readFileSync('config/watchlist.json','utf8'));
const output=process.argv[2]||'/tmp/gdr-quotes-evidence.json';
const tickers={'INDEX:CN:SSE':'000001.SS','INDEX:CN:SZSE':'399001.SZ','INDEX:CN:CHINEXT':'399006.SZ','INDEX:CN:STAR50':'000688.SS','INDEX:CN:CSI300':'000300.SS','INDEX:CN:CSI500':'000905.SS','INDEX:HK:HSI':'^HSI','INDEX:HK:HSTECH':'HSTECH.HK','INDEX:HK:HSCEI':'^HSCE','INDEX:US:SP500':'^GSPC','INDEX:US:NASDAQ':'^IXIC','INDEX:US:NDX':'^NDX','INDEX:US:DOW':'^DJI','INDEX:US:RUSSELL2000':'^RUT','INDEX:JP:NIKKEI225':'^N225','INDEX:EU:STOXX50':'^STOXX50E','FX:DXY':'DX-Y.NYB','FX:USDCNY':'CNY=X','FX:USDCNH':'CNH=X','METAL:XAUUSD':'XAUUSD=X','METAL:XAGUSD':'XAGUSD=X','ENERGY:WTI':'CL=F','ENERGY:BRENT':'BZ=F','RATE:US2Y':'^UST2Y','RATE:US10Y':'^TNX','VOL:VIX':'^VIX'};
const finite=x=>typeof x==='number'&&Number.isFinite(x),offset=t=>new Date(t).toLocaleString('sv-SE',{timeZone:'Asia/Singapore'}).replace(' ','T')+'+08:00';
const observed={capturedAt:offset(Date.now()),rows:[],errors:[]};let stopped=new Set();
async function get(url){const host=new URL(url).host;if(stopped.has(host))throw Error('provider rate limited; no further requests');const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'GDR-personal-research/1.0'}});if(r.status===429){stopped.add(host);throw Error('HTTP429; respected provider limit');}if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
async function collect(i){let url;try{
 if(i.market==='CRYPTO'){
  url='https://api.exchange.coinbase.com/products/'+i.symbol+'-USD/ticker';const x=await get(url),t=Date.parse(x.time),price=Number(x.price);
  if(!Number.isFinite(t)||!finite(price)||price<=0||t>Date.now()+60000)throw Error('invalid ticker or source timestamp');
  observed.rows.push({instrumentId:i.id,symbol:i.symbol,name:i.name,price,changePct:null,currency:'USD',asOf:offset(t),comparisonBasis:'no-24h-baseline',status:'snapshot',sourceUrl:url,provider:'Coinbase Exchange',retrievedAt:offset(Date.now()),note:'Venue-specific USD last trade; not a consolidated market price.',raw:x});return;
 }
 const symbol=tickers[i.id]||(i.id.startsWith('EQUITY:US:')?i.symbol.replace('.','-'):null);if(!symbol)throw Error('no configured provider symbol');
 url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1d&interval=1m';const x=await get(url),m=x.chart?.result?.[0]?.meta;if(!m)throw Error(x.chart?.error?.description||'no chart metadata');
 if(!finite(m.regularMarketPrice)||!finite(m.regularMarketTime))throw Error('missing exact source price/time');
 const as=m.regularMarketTime*1000;if(as>Date.now()+60000)throw Error('future source timestamp');
 let contract=null;if(i.id.startsWith('ENERGY:')){const months={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};const match=(m.shortName||'').match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2}|\d{4})\b/);if(!match)throw Error('front month has no explicit contract; rejected');contract=(match[2].length===2?'20':'')+match[2]+'-'+months[match[1]];}
 const prev=m.chartPreviousClose??m.previousClose,change=finite(prev)&&prev!==0?(m.regularMarketPrice/prev-1)*100:null;
 observed.rows.push({instrumentId:i.id,symbol:i.symbol,name:i.name,price:m.regularMarketPrice,changePct:change,currency:i.currency,providerCurrency:m.currency,asOf:offset(as),comparisonBasis:'provider-previous-close',contract,status:Date.now()-as>3600000?'previous':'delayed',sourceUrl:url,provider:'Yahoo Finance public chart',retrievedAt:offset(Date.now()),note:'Public delayed feed; currency/session/contract must be checked before publication.',raw:m});
 }catch(e){observed.errors.push({instrumentId:i.id,sourceUrl:url||null,error:e.message,checkedAt:offset(Date.now())});}}
(async()=>{const items=[...config.required,...[...new Set(Object.values(config.usPools).flat())].map(symbol=>({id:'EQUITY:US:'+symbol,symbol,name:symbol,market:'US',currency:'USD'}))];let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<items.length){await collect(items[cursor++]);await new Promise(r=>setTimeout(r,500));}}));observed.completedAt=offset(Date.now());fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(observed,null,2));console.log(JSON.stringify({file:output,rows:observed.rows.length,errors:observed.errors.length,completedAt:observed.completedAt}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
