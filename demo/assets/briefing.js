/* Compact overview, built from the selected report only; live modules never rewrite history. */
(function(root){
'use strict';
const C=root.GDR,D=root.GDRDisplay;
const E=(tag,cls,s)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(s!=null)e.textContent=String(s);return e;};
const labels={CN:'A股',HK:'港股',US:'美股',CRYPTO:'加密资产',ENERGY:'原油',RATES:'美债收益率',FX:'美元与人民币',METALS:'贵金属'};
const purposes={CN:'看成长与宽基是否同向',HK:'看科技与恒指的承接',US:'最近常规时段表现',CRYPTO:'现货报价；涨跌基准单独标注',ENERGY:'看能源成本，注意合约月份',RATES:'看利率对估值的约束',FX:'人民币报价上升表示走弱',METALS:'看避险与利率敏感度'};
function assetGroup(f){return D.group(f)||({BTC:'CRYPTO','10Y':'RATES',Brent:'ENERGY',Au:'METALS',DXY:'FX',CN:'CN',HK:'HK',US:'US'})[C.group(f)];}
function factLink(f){const a=E('a','metric-fact-link',D.name(f));a.href='#fact-'+encodeURIComponent(f.id);a.title='查看 '+D.name(f)+' 的来源和原始口径';return a;}
function cards(r){
 const block=E('div','briefing-market'),box=E('div','metrics readable-metrics'),groups=new Map(),all=C.facts(r);
 all.forEach(f=>{const g=assetGroup(f);if(!g||!D.hasValue(f))return;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(f);});
 const at=C.reportTime(r),hour=new Date(at||0).getUTCHours(),asian=(hour+8)%24>=7&&(hour+8)%24<=18;
 const order=asian?['CN','HK','CRYPTO','ENERGY','RATES','FX','US','METALS']:['US','CRYPTO','RATES','ENERGY','FX','HK','CN','METALS'];
 const preferred={CN:['INDEX:CN:SSE','INDEX:CN:CHINEXT','INDEX:CN:STAR50'],CRYPTO:['CRYPTO:BTC:USD','CRYPTO:ETH:USD','CRYPTO:SOL:USD']};
 order.filter(g=>groups.has(g)).slice(0,6).forEach(g=>{
  const facts=groups.get(g),ps=preferred[g]||[],sorted=facts.slice().sort((a,b)=>{const rank=f=>{const n=ps.indexOf(D.identity(f));return n<0?99:n;};return rank(a)-rank(b);}),shown=sorted.slice(0,3),card=E('article','metric');card.dataset.assetGroup=g;
  const head=E('div','metric-head');head.append(E('span','asset-mark',g==='CRYPTO'?'₿':g==='ENERGY'?'Oil':g==='RATES'?'10Y':g==='METALS'?'Au':g==='FX'?'FX':g),E('span','',labels[g]));card.append(head);
  const values=E('div','quote-stack');shown.forEach(f=>{const row=E('div','quote-line'),top=E('div','quote-line-top');top.append(factLink(f),E('strong','quote-number',D.format(f)));const bottom=E('div','quote-line-meta'),ch=D.change(f);bottom.append(E('span',ch.startsWith('-')?'negative':ch.startsWith('+')?'positive':'muted',ch),E('span','',C.parseTime(f.asOf)!==null?C.stamp(f.asOf):'时点待核'));row.append(top,bottom);if(f.contract)row.append(E('span','quote-contract','合约 '+f.contract));values.append(row);});card.append(values);
  card.append(E('p','metric-purpose',purposes[g]));
  const link=E('a','metric-more',(facts.length>shown.length?'另有'+(facts.length-shown.length)+'项 · ':'')+'全部行情与来源 →');link.href='#watchlist';card.append(link);box.append(card);
 });
 block.append(box);
 const missing=all.filter(f=>D.group(f)&&!D.hasValue(f));if(missing.length){const note=E('div','missing-inline');note.append(E('span','','待补报价：'+missing.map(D.name).join('、')+'。不占用核心行情位，也没有删去。'));const a=E('a','','查看缺口');a.href='#dataHealth';note.append(a);block.append(note);}
 return block;
}
root.GDRBriefing={cards};
})(window);
