/* Human display only. Never changes raw facts, source times, contracts or statistical bases. */
(function(root){
'use strict';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const text=x=>x==null?'':String(x);
const aliases={BTC:'Bitcoin',ETH:'Ethereum',SOL:'Solana',PEPE:'Pepe',HYPE:'Hyperliquid'};
const names={'INDEX:CN:SSE':'上证指数','INDEX:CN:SZSE':'深证成指','INDEX:CN:CHINEXT':'创业板指','INDEX:CN:STAR50':'科创50','INDEX:CN:CSI300':'沪深300','INDEX:CN:CSI500':'中证500','INDEX:HK:HSI':'恒生指数','INDEX:HK:HSTECH':'恒生科技','INDEX:HK:HSCEI':'恒生国企','INDEX:US:SP500':'标普500','INDEX:US:NASDAQ':'纳斯达克综合','INDEX:US:NDX':'纳斯达克100','INDEX:US:DOW':'道琼斯','INDEX:US:RUSSELL2000':'罗素2000','FX:DXY':'美元指数','FX:USDCNY':'在岸人民币','FX:USDCNH':'离岸人民币','RATE:US2Y':'美债2年期','RATE:US10Y':'美债10年期','ENERGY:WTI':'WTI原油','ENERGY:BRENT':'Brent原油','METAL:XAUUSD':'现货黄金','METAL:XAGUSD':'现货白银','VOL:VIX':'VIX'};
function identity(f){return text(f.instrumentId||(/^(INDEX|CRYPTO|ENERGY|RATE|FX|METAL):/.test(f.seriesKey||'')?f.seriesKey:null)||f.id).replace(/^quotes:/,'');}
function name(f){const id=identity(f);if(names[id])return names[id];const m=id.match(/^CRYPTO:(BTC|ETH|SOL|PEPE|HYPE):/);if(m)return m[1];const label=text(f.label||f.name||f.symbol);if(Object.values(aliases).includes(label))return Object.keys(aliases).find(k=>aliases[k]===label);return label||text(f.symbol)||'未命名资产';}
function unit(f){const u=text(f.unit||f.currency);return ({index:'点','%':'%',USD:'美元',CNY:'人民币',CNH:'离岸人民币','USD/oz':'美元/盎司','USD/bbl':'美元/桶','CNY/USD':'人民币/美元',bp:'基点',bps:'基点'})[u]||u;}
function value(f){return Object.hasOwn(f,'rawValue')?f.rawValue:f.price;}
function number(v,digits){return new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(v);}
function format(f){
 const n=value(f),raw=text(f.displayValue),u=text(f.unit||f.currency),id=identity(f);
 if(!finite(n))return raw||'暂无数据';
 // Thresholds/ranges and approximate quotes must retain their original meaning.
 if(/[<>≥≤]|超过|至少|至多|区间|约/.test(raw))return raw;
 if(u==='%')return number(n,3)+'%';
 if(id.startsWith('FX:USD')||u==='CNY/USD')return number(n,4);
 let digits=u==='index'?2:Math.abs(n)>0&&Math.abs(n)<.001?Math.min(12,Math.ceil(-Math.log10(Math.abs(n)))+3):Math.abs(n)>0&&Math.abs(n)<1?6:2;
 if(n!==0&&Math.abs(n)<1e-12)return n.toPrecision(4);
 const prefix=/^USD(?:\/|$)/.test(u)?'$':'';
 return prefix+number(n,digits);
}
const basisNames={'previous-official-close':'较前收','provider-regular-session-change':'较行情源常规前收','24h':'过去24小时','24h-range':'24小时区间','intraday':'盘中观测','coinbase-spot-snapshot':'现货快照','UTC daily open/previous close on source':'较来源日线基准'};
function basis(v){if(!v)return '涨跌基准未提供';return basisNames[v]||(/[a-z]{3}/i.test(v)?'来源特定基准（见依据）':v);}
const statuses={live:'即时快照',snapshot:'报价快照',complete:'已确认',closed:'最近收盘',delayed:'延迟报价',stale:'较旧数据',partial:'部分数据',missing:'暂无合格报价',error:'来源读取失败',previous:'沿用旧值','window-unclear':'统计窗口待核',unknown:'状态未确认',invalid:'记录待核',ok:'已更新','no-change':'已查无新增'};
function status(v){return statuses[v]||'状态未确认';}
function change(f){const n=f.changePct??(f.changeUnit==='%'?f.changeValue:null);if(finite(n))return (n>0?'+':'')+n.toFixed(2)+'%';const s=text(f.changeLabel);return /^[+-]?\d+(?:\.\d+)?\s*(%|bp|bps)$/.test(s)?s:'涨跌幅未提供';}
function group(f){const id=identity(f);if(id.startsWith('INDEX:CN:'))return 'CN';if(id.startsWith('INDEX:HK:'))return 'HK';if(id.startsWith('INDEX:US:'))return 'US';if(id.startsWith('CRYPTO:'))return 'CRYPTO';if(id.startsWith('ENERGY:'))return 'ENERGY';if(id.startsWith('RATE:'))return 'RATES';if(id.startsWith('FX:'))return 'FX';if(id.startsWith('METAL:'))return 'METALS';return null;}
function hasValue(f){return finite(value(f))&&!['missing','error','invalid','unknown','window-unclear'].includes(f.dataStatus||f.status)&&!/[<>≥≤]|超过|至少|至多|区间/.test(text(f.displayValue));}
function pointCaption(n){return n>=2?n+'次同口径观测':n===1?'仅1次观测，尚无走势':'暂无可比历史';}
const keys={revenue:'营收',eps:'每股收益',period:'报告期',actual:'实际值',expected:'预期值',previous:'前值',summary:'摘要',conclusion:'结论',risks:'风险',source:'来源',sourceIds:'来源编号',metric:'指标',value:'数值',unit:'单位',note:'说明',asOf:'数据时点',margin:'利润率',guidance:'指引',valuationAsOf:'估值时点'};
function prose(x){if(x==null)return '';if(Array.isArray(x))return x.map(prose).filter(Boolean).join('\n');if(typeof x==='object')return Object.entries(x).map(([k,v])=>(keys[k]||k)+'：'+prose(v)).join('\n');return String(x);}
const api={identity,name,unit,value,format,basis,status,change,group,hasValue,pointCaption,prose};root.GDRDisplay=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
