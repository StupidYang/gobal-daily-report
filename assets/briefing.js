/* Compact overview, built from the selected report only; live modules never rewrite history. */
(function(root){
'use strict';
const C=root.GDR,D=root.GDRDisplay;
const E=(tag,cls,s)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(s!=null)e.textContent=String(s);return e;};
const labels={CN:'A股',HK:'港股',US:'美股',CRYPTO:'加密资产',ENERGY:'原油',RATES:'美债收益率',FX:'美元与人民币',METALS:'贵金属'};
const purposes={CN:'看成长与宽基是否同向',HK:'看科技与恒指的承接',US:'最近常规时段表现',CRYPTO:'现货报价；涨跌基准单独标注',ENERGY:'看能源成本，注意合约月份',RATES:'看利率对估值的约束',FX:'人民币报价上升表示走弱',METALS:'看避险与利率敏感度'};
function assetGroup(f){return D.group(f)||({BTC:'CRYPTO','10Y':'RATES',Brent:'ENERGY',Au:'METALS',DXY:'FX',CN:'CN',HK:'HK',US:'US'})[C.group(f)];}
function factLink(f){const a=E('a','metric-fact-link',D.name(f));a.href='#fact-'+encodeURIComponent(f.id);a.title='查看 '+D.name(f)+' 的来源和原始口径';return a;}

// Core mainland indices are navigation-critical, not optional editorial highlights.
const CN_INDICES=[
 ['INDEX:CN:SSE','000001.SH','上证指数'],['INDEX:CN:SZSE','399001.SZ','深证成指'],
 ['INDEX:CN:CHINEXT','399006.SZ','创业板指'],['INDEX:CN:STAR50','000688.SH','科创50'],
 ['INDEX:CN:CSI300','000300.CSI','沪深300'],['INDEX:CN:CSI500','000905.CSI','中证500']
];
function cutoff(r){return C.parseTime(r.reportMeta?.generatedAt)??C.reportTime(r);}
function cnIdentity(f){
 for(const v of [f.instrumentId,f.seriesKey,f.id])if(typeof v==='string'){
  const id=v.replace(/^(?:[a-zA-Z0-9_-]+:)*(?=INDEX:CN:)/,'');
  if(CN_INDICES.some(x=>x[0]===id))return id;
 }
 const label=String(f.label||f.name||'').replace(/指数$/,'指');
 return CN_INDICES.find(x=>f.symbol===x[1]||label===x[2].replace(/指数$/,'指'))?.[0]||null;
}
function safeSource(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function frozenQuotes(r,m){
 const ref=r.reportMeta?.moduleRefs?.quotes,at=cutoff(r);
 if(!ref||!/^data\/runs\/quotes\/[A-Za-z0-9_-]+\.json$/.test(ref.path||''))throw Error('本报告没有合法的冻结行情引用');
 if(!m||m.module!=='quotes'||m.runId!==ref.runId||ref.path!=='data/runs/quotes/'+m.runId+'.json')throw Error('冻结行情身份不匹配');
 const generated=C.parseTime(m.generatedAt);
 if(at===null||generated===null||generated>at)throw Error('冻结行情时点晚于报告或时点无效');
 if(ref.generatedAt!=null&&C.parseTime(ref.generatedAt)!==generated)throw Error('冻结行情生成时间不匹配');
 if(ref.dataAsOf!=null&&C.parseTime(ref.dataAsOf)!==C.parseTime(m.dataAsOf))throw Error('冻结行情数据时间不匹配');
 const synthetic=m.dataMode==='synthetic'||m.execution?.mode==='fixture';
 if(synthetic!==(r.reportMeta?.dataMode==='synthetic'))throw Error('测试与正式行情模式不匹配');
 if(!Array.isArray(m.payload?.items))throw Error('冻结行情缺少报价明细');
 return m;
}
function mainlandQuotes(r,module){
 const frozen=module?frozenQuotes(r,module):null,at=cutoff(r);
 return CN_INDICES.map(([id,symbol,name])=>{
  const candidates=[...C.facts(r).filter(f=>cnIdentity(f)===id).map(f=>({f,sources:r.sources,origin:'report'})),
   ...C.arr(frozen?.payload?.items).filter(f=>f&&f.instrumentId===id).map(f=>({f,sources:frozen.sources,origin:'frozen'}))];
  for(const {f,sources,origin}of candidates){
   const when=C.parseTime(f.asOf),unit=f.unit||f.currency;
   const proof=C.arr(sources).filter(x=>x&&C.arr(f.sourceIds).includes(x.id)&&safeSource(x.url));
   if(!D.hasValue(f)||D.value(f)<=0||!['index','points','点'].includes(unit)||when===null||at===null||when>at||!proof.length)continue;
   return {...f,instrumentId:id,symbol,name,unit:'index',origin,proof};
  }
  return {instrumentId:id,symbol,name,price:null,status:'missing',proof:[],origin:'missing'};
 });
}
function mainland(r){
 const panel=E('section','cn-indices');panel.id='mainlandIndices';panel.dataset.assetGroup='CN';
 panel.setAttribute('aria-label','A股主要指数');panel.dataset.reportId=r.reportId||r.updatedAt||'';
 const header=E('div','cn-indices-head'),grid=E('div','cn-indices-grid'),message=E('p','cn-indices-note');
 header.append(E('h2','','A股主要指数'),E('span','','宽基与成长 · 六项固定展示'));
 panel.append(header,grid,message);
 function paint(module,status,description){
  const quotes=mainlandQuotes(r,module);grid.replaceChildren();
  for(const q of quotes){
   const card=E('article','cn-index');card.dataset.instrumentId=q.instrumentId;card.dataset.origin=q.origin;
   card.append(E('h3','',q.name),E('span','cn-index-code',q.symbol));
   const valid=q.origin!=='missing';
   card.append(E('strong','cn-index-value',valid?D.format(q):'暂无合格报价'));
   const ch=valid?D.change(q):'涨跌幅待核';card.append(E('span','cn-index-change '+(ch.startsWith('-')?'negative':ch.startsWith('+')?'positive':'muted'),ch));
   if(valid){
    card.dataset.asOf=q.asOf;
    card.append(E('span','cn-index-time',C.stamp(q.asOf)+' UTC+8'),E('span','cn-index-status',D.status(q.dataStatus||q.status)));
    const proof=E('details','cn-index-proof');proof.append(E('summary','','口径与来源'));
    proof.append(E('p','',D.basis(q.comparisonBasis)),E('p','','原行情时点：'+q.asOf),E('p','',q.note||'报价和涨跌幅保留原始口径，不表示刚刚采集。'));
    for(const source of q.proof){const a=E('a','',source.title||source.name||'行情来源');a.href=safeSource(source.url);a.target='_blank';a.rel='noopener noreferrer';proof.append(a);}
    card.append(proof);
   }else card.append(E('span','cn-index-status','缺数据仍保留指数位置'));
   grid.append(card);
  }
  panel.dataset.loadStatus=status;
  const count=quotes.filter(q=>q.origin!=='missing').length;
  message.textContent=description+' · '+count+'/6 项有可核验报价。较旧或缺失数据不会伪装成实时行情。';
 }
 const ref=r.reportMeta?.moduleRefs?.quotes;
 paint(null,ref?'loading':'missing',ref?'正在读取本报告绑定的行情快照':'本报告未绑定行情快照，保留已有事实');
 if(ref){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  Promise.resolve().then(()=>{
   if(!/^data\/runs\/quotes\/[A-Za-z0-9_-]+\.json$/.test(ref.path||''))throw Error('冻结行情路径无效');
   return fetch('./'+ref.path,{cache:'no-store',signal:controller.signal});
  }).then(response=>{if(!response.ok)throw Error('HTTP '+response.status);return response.json();})
   .then(m=>{frozenQuotes(r,m);if(panel.isConnected)paint(m,'ready','读取本报告绑定的行情快照；各指数保留原始数据时点');})
   .catch(error=>{if(panel.isConnected)paint(null,'unavailable','冻结行情读取或校验失败：'+error.message+'；未用最新模块替换历史数据');})
   .finally(()=>clearTimeout(timer));
 }
 return panel;
}

function cards(r){
 const block=E('div','briefing-market'),box=E('div','metrics readable-metrics'),groups=new Map(),all=C.facts(r);
 all.forEach(f=>{const g=assetGroup(f);if(!g||!D.hasValue(f))return;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(f);});
 const at=C.reportTime(r),hour=new Date(at||0).getUTCHours(),asian=(hour+8)%24>=7&&(hour+8)%24<=18;
 const order=asian?['CN','HK','CRYPTO','ENERGY','RATES','FX','US','METALS']:['US','CRYPTO','RATES','ENERGY','FX','HK','CN','METALS'];
 const preferred={CN:['INDEX:CN:SSE','INDEX:CN:CHINEXT','INDEX:CN:STAR50'],CRYPTO:['CRYPTO:BTC:USD','CRYPTO:ETH:USD','CRYPTO:SOL:USD']};
 order.filter(g=>g!=='CN'&&groups.has(g)).slice(0,6).forEach(g=>{
  const facts=groups.get(g),ps=preferred[g]||[],sorted=facts.slice().sort((a,b)=>{const rank=f=>{const n=ps.indexOf(D.identity(f));return n<0?99:n;};return rank(a)-rank(b);}),shown=sorted.slice(0,3),card=E('article','metric');card.dataset.assetGroup=g;
  const head=E('div','metric-head');head.append(E('span','asset-mark',g==='CRYPTO'?'₿':g==='ENERGY'?'Oil':g==='RATES'?'10Y':g==='METALS'?'Au':g==='FX'?'FX':g),E('span','',labels[g]));card.append(head);
  const values=E('div','quote-stack');shown.forEach(f=>{const row=E('div','quote-line'),top=E('div','quote-line-top');top.append(factLink(f),E('strong','quote-number',D.format(f)));const bottom=E('div','quote-line-meta'),ch=D.change(f);bottom.append(E('span',ch.startsWith('-')?'negative':ch.startsWith('+')?'positive':'muted',ch),E('span','',C.parseTime(f.asOf)!==null?C.stamp(f.asOf):'时点待核'));row.append(top,bottom);if(f.contract)row.append(E('span','quote-contract','合约 '+f.contract));values.append(row);});card.append(values);
  card.append(E('p','metric-purpose',purposes[g]));
  const link=E('a','metric-more',(facts.length>shown.length?'另有'+(facts.length-shown.length)+'项 · ':'')+'全部行情与来源 →');link.href='#watchlist';card.append(link);box.append(card);
 });
 block.append(mainland(r),box);
 const missing=all.filter(f=>D.group(f)&&!D.hasValue(f));if(missing.length){const note=E('div','missing-inline');note.append(E('span','','待补报价：'+missing.map(D.name).join('、')+'。不占用核心行情位，也没有删去。'));const a=E('a','','查看缺口');a.href='#dataHealth';note.append(a);block.append(note);}
 return block;
}
root.GDRBriefing={cards,CN_INDICES,cnIdentity,mainlandQuotes,frozenQuotes};
if(typeof module!=='undefined')module.exports=root.GDRBriefing;
})(typeof globalThis!=='undefined'?globalThis:window);
