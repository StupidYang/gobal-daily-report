/* Independent watchlist reader. Failed workers never replace the main research report. */
(() => {
'use strict';
const W=window.GDRWatch;if(!W)return;
const root=document.getElementById('watchlistRoot');if(!root)return;
const state={config:null,modules:{},report:null,tab:'required',market:'CN',sector:'ALL',query:'',n:5,limit:40,seq:0,mode:'latest',loaded:false,failures:[],signature:''};
const storage={get(k,f){try{return JSON.parse(localStorage.getItem(k))||f;}catch{return f;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
let pins=new Set(W.arr(storage.get('gdr:pins:v1',[])).filter(x=>typeof x==='string')),custom=W.arr(storage.get('gdr:custom:v1',[])).filter(x=>x&&typeof x.instrumentId==='string');
const labels={quotes:'基础行情','asia-equities':'A/H板块','us-equities':'美股候选池',research:'公司研究',news:'综合时事',macro:'宏观',synthesis:'综合分析'};
const E=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=String(x);return n;};
const add=(p,...a)=>{a.filter(Boolean).forEach(n=>p.append(n));return p;};
function link(label,url){const u=W.safeUrl(url);if(!u)return E('span','wl-muted',label);const a=E('a','',label);a.href=u;a.target='_blank';a.rel='noopener noreferrer';return a;}
function button(label,fn,cls=''){const b=E('button',cls,label);b.type='button';b.onclick=fn;return b;}
function section(title,body){return add(E('section','wl-box'),E('h3','',title),body);}
function details(key,title,body){const d=E('details','wl-detail');d.dataset.key=key;return add(d,E('summary','',title),body);}
function note(text){return E('p','wl-muted',text);}
function refs(ids,module){const p=E('div','wl-sources'),s=new Map(W.arr(module?.sources).map(x=>[x.id,x]));[...new Set(W.arr(ids))].forEach(id=>{if(s.has(id))p.append(link(s.get(id).title||s.get(id).name||id,s.get(id).url));});return p;}
function keepOpen(){return new Set([...root.querySelectorAll('details[open]')].map(x=>x.dataset.key));}
function render(){
 if(!state.config)return;
 const open=keepOpen(),box=E('details','library wl-library');box.id='watchlist';box.dataset.key='watchlist';box.open=open.has('watchlist')||location.hash==='#watchlist';
 const sum=E('summary');add(sum,E('span','library-title','自选资产 · 板块榜 · 公司研究'),E('span','library-caption','必看行情、各板块热度与相对弱势、只在新事件后更新的研究'),E('span','library-count',state.config.required.length+'项必看'));box.append(sum);
 const body=E('div','library-body wl-body');
 add(body,note('这是独立的数据模块：报价更新、榜单更新和研究更新不是同一个时间。候选名单不代表当前热门；热度不等于看涨。'));
 if(state.mode!=='latest')body.append(note('历史模式：只读取该报告冻结的模块快照；缺少冻结引用时不展示今天的数据，避免穿越。'));
 if(state.failures.length)body.append(E('p','wl-warning','待采集或读取失败：'+state.failures.join('、')+'。保留主报告，不填造数据。'));
 const status=E('div','wl-statusline');Object.keys(labels).filter(k=>!['synthesis'].includes(k)).forEach(k=>{const m=state.modules[k];status.append(E('span','wl-status',labels[k]+' · '+W.freshness(m,state.config.moduleTtlHours[k]||8,state.mode==='history'?W.time(state.report?.updatedAt):Date.now())));});body.append(status);
 const tools=E('div','wl-tools'),tabs=E('div','wl-tabs');[['required','必看资产'],['favorites','我的自选'],['boards','板块热 / 弱榜'],['research','公司研究']].forEach(([id,name])=>{const b=button(name,()=>{state.tab=id;state.limit=40;render();});b.setAttribute('aria-pressed',String(state.tab===id));tabs.append(b);});tools.append(tabs);
 const search=E('input');search.type='search';search.placeholder='搜索名称 / 代码 / 板块';search.value=state.query;search.setAttribute('aria-label','搜索自选模块');search.onchange=()=>{state.query=search.value;state.limit=40;render();};tools.append(search,button('检查模块更新',()=>load(true)));body.append(tools);
 if(state.tab==='boards')body.append(boards());else if(state.tab==='research')body.append(researchLibrary());else body.append(quoteTable(state.tab==='favorites'));
 const provenance=E('div');Object.entries(state.modules).forEach(([k,m])=>add(provenance,E('h4','',labels[k]||k),note('运行 '+m.runId+'；生成 '+W.stamp(m.generatedAt)+'；数据截止 '+W.stamp(m.dataAsOf)),note(m.payload?.note||m.note||'')));
 body.append(details('module-health','模块时点与采集状态',provenance));box.append(body);root.replaceChildren(box);root.querySelectorAll('details').forEach(d=>{if(open.has(d.dataset.key))d.open=true;});directory();
}
function filtered(items){const q=state.query.toLowerCase();return items.filter(x=>!q||[x.name,x.symbol,x.instrumentId,x.group,x.sector,x.conclusion].filter(Boolean).join(' ').toLowerCase().includes(q));}
function allQuotes(){
 const base=W.quoteRows(state.config,state.modules.quotes),map=new Map(base.map(q=>[q.instrumentId,q]));
 for(const name of ['asia-equities','us-equities'])for(const g of W.arr(state.modules[name]?.payload?.groups))for(const q of W.arr(g.rows))map.set(q.instrumentId,{...q,group:q.group||g.name,market:g.market,status:q.status||'snapshot',sourceModule:name});
 for(const [pool,syms]of Object.entries(state.config.usPools))for(const symbol of syms){const id='EQUITY:US:'+symbol;if(!map.has(id))map.set(id,{instrumentId:id,symbol,name:symbol,market:'US',group:pool==='technology'?'科技候选池':'投资公司候选池',price:null,status:'missing'});}
 for(const x of custom)if(!map.has(x.instrumentId))map.set(x.instrumentId,{...x,price:null,status:'missing',group:'本机新增，尚未订阅采集'});
 return [...map.values()];
}
function quoteTable(favorites){
 const out=E('div'),all=allQuotes();let list=favorites?all.filter(q=>pins.has(q.instrumentId)):all.filter(q=>state.config.required.some(x=>x.id===q.instrumentId));list=filtered(list);
 const wrap=E('div','wl-table-wrap'),table=E('table','wl-table'),head=E('tr');['自选','资产 / 代码','最近数据','变化 / 基准','数据时点 / 状态','分析'].forEach(x=>head.append(E('th','',x)));table.append(add(E('thead'),head));const tbody=E('tbody');
 list.slice(0,state.limit).forEach(q=>{const tr=E('tr'),star=button(pins.has(q.instrumentId)?'★':'☆',()=>{pins.has(q.instrumentId)?pins.delete(q.instrumentId):pins.add(q.instrumentId);storage.set('gdr:pins:v1',[...pins]);render();},'wl-star');star.setAttribute('aria-label',(pins.has(q.instrumentId)?'取消自选 ':'加入自选 ')+(q.name||q.symbol));star.setAttribute('aria-pressed',String(pins.has(q.instrumentId)));
  const value=E('td');add(value,E('strong','wl-value',W.priceText(q)),note(q.currency||q.unit||''),q.contract?note('合约 '+q.contract):null);
  const change=E('td',W.finite(q.changePct)?q.changePct>=0?'positive':'negative':'wl-muted',W.finite(q.changePct)?(q.changePct>0?'+':'')+q.changePct.toFixed(2)+'%':'—');change.append(note(q.comparisonBasis||'基准待确认'));
  const status=E('td');add(status,note(W.stamp(q.asOf)),note(q.status||'missing'));
  const analysis=E('td'),research=findResearch(q.instrumentId);if(research)analysis.append(details('qr-'+q.instrumentId,'查看事件研究',researchCard(research)));else analysis.append(note(q.note||'尚无已发布研究'));
  add(tr,add(E('td'),star),add(E('td'),E('strong','',q.name||q.symbol||q.instrumentId),note((q.symbol||q.instrumentId)+' · '+(q.group||q.market||''))),value,change,status,analysis);tbody.append(tr);
 });table.append(tbody);wrap.append(table);out.append(wrap,note('展示 '+Math.min(state.limit,list.length)+' / '+list.length+'；空值是未采集，不是价格为零。'));
 if(list.length>state.limit)out.append(button('显示更多',()=>{state.limit+=40;render();}));
 if(favorites){out.append(note('本机收藏只改变显示。新增采集标的需导出后合并进仓库config/watchlist.json；不会假装浏览器能直接修改定时任务。'));
 const form=E('form','wl-tools'),market=E('select');['US','CN','HK'].forEach(v=>market.append(Object.assign(E('option','',v),{value:v})));market.setAttribute('aria-label','新增证券市场');
 const symbol=E('input');symbol.placeholder='代码，如 NVDA / 600519.SH / 00700';symbol.setAttribute('aria-label','新增证券代码');symbol.required=true;
 const save=E('button','','加入本机自选');save.type='submit';form.append(market,symbol,save);form.onsubmit=e=>{e.preventDefault();let s=symbol.value.trim().toUpperCase();if(market.value==='HK'&&/^\d{1,5}$/.test(s))s=s.padStart(5,'0');if(!/^[A-Z0-9][A-Z0-9.]{0,15}$/.test(s)||market.value==='CN'&&!/^\d{6}\.(SH|SZ|BJ)$/.test(s)||market.value==='HK'&&!/^\d{5}$/.test(s)){symbol.setCustomValidity('CN需六位代码.SH/.SZ/.BJ；HK需五位代码；US需证券代码');symbol.reportValidity();return;}symbol.setCustomValidity('');const id='EQUITY:'+market.value+':'+s;if(!custom.some(x=>x.instrumentId===id))custom.push({instrumentId:id,symbol:s,name:s,market:market.value});pins.add(id);storage.set('gdr:custom:v1',custom);storage.set('gdr:pins:v1',[...pins]);render();};symbol.oninput=()=>symbol.setCustomValidity('');out.append(form,button('导出自选配置',()=>{const blob=new Blob([JSON.stringify({version:1,pinned:[...pins],instruments:custom},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=E('a');a.href=url;a.download='gdr-user-watchlist.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
 const candidates=E('div','wl-pool');Object.entries(state.config.usPools).forEach(([k,syms])=>{candidates.append(E('h4','',k==='technology'?'科技公司候选池':'投资/资管/券商候选池'));syms.forEach(s=>candidates.append(button((pins.has('EQUITY:US:'+s)?'★ ':'☆ ')+s,()=>{pins.add('EQUITY:US:'+s);storage.set('gdr:pins:v1',[...pins]);render();})));});out.append(details('candidate-pools','从配置候选池加入自选（不是热门排名）',candidates));
 }return out;
}
function boards(){const out=E('div'),tools=E('div','wl-tools'),market=E('select');[['CN','A股'],['HK','港股'],['US','美股科技 / 投资']].forEach(([v,t])=>market.append(Object.assign(E('option','',t),{value:v})));market.value=state.market;market.setAttribute('aria-label','榜单市场');market.onchange=()=>{state.market=market.value;state.sector='ALL';render();};
 const n=E('input');n.type='number';n.min=1;n.max=state.config.maxN;n.value=state.n;n.setAttribute('aria-label','每组显示前N只');n.onchange=()=>{state.n=W.nValue(n.value,state.config.maxN);render();};tools.append(market,E('label','','每组 N'),n);out.append(tools);
 out.append(note('热度 = 50%同板块量比分位 + 30%换手率分位 + 20%成交额分位；弱势 = 当日涨跌幅相对板块样本中位数。缺20日同时间量能基准不计算热度；样本不全不冒充全市场榜。'));
 const module=state.modules[state.market==='US'?'us-equities':'asia-equities'],groups=W.arr(module?.payload?.groups).filter(g=>g.market===state.market);
 const expected=state.market==='US'?['technology','investment']:state.config.sectors[state.market].names;
 if(!groups.length)out.append(E('p','wl-warning','尚未采集有效板块快照。下面列出应覆盖的全部板块，不填造热股。'));
 for(const name of expected){const g=groups.find(x=>x.name===name||x.id===name||x.pool===name);if(!g){out.append(details('missing-'+state.market+'-'+name,name+' · 待采集',note('尚无这个板块的合格数据、成员范围和同口径时点。')));continue;}
 const ranked=W.rankGroup(g,state.config,state.n);if(state.query&&!name.toLowerCase().includes(state.query.toLowerCase())&&!filtered(g.rows).length)continue;
 const body=E('div');body.append(note(ranked.note+' 已观测 '+ranked.observed+' / 应有 '+(ranked.expected??'未知')+'；可比较 '+ranked.eligible+'；可算热度 '+ranked.scorable+'。数据 '+W.stamp(g.asOf)));
 const split=E('div','wl-board-grid');for(const[type,title]of[['hot','交易热度前 '+state.n],['weak','相对弱势后 '+state.n]]){const column=E('div');column.append(E('h4','',title));if(!ranked[type].length)column.append(note('数据不足：不以涨幅榜代替热度，也不补零。'));ranked[type].forEach((q,i)=>{const row=E('article','wl-rankrow');add(row,E('strong','',(i+1)+'. '+(q.name||q.symbol||q.instrumentId)),E('span',q.changePct>=0?'positive':'negative',(q.changePct>0?'+':'')+q.changePct.toFixed(2)+'%'),note(type==='hot'?'热度 '+q.heatScore.toFixed(1)+' / 100（活动分位，不是胜率）':'相对中位数 '+q.relativePp.toFixed(2)+' 个百分点'),note(q.catalyst||'本轮未核验个股催化'),button(pins.has(q.instrumentId)?'已加入自选':'加入自选',()=>{pins.add(q.instrumentId);storage.set('gdr:pins:v1',[...pins]);render();}),refs(q.sourceIds,module));column.append(row);});split.append(column);}body.append(split);
 if(ranked.excluded.length)body.append(details('excluded-'+g.id,'查看剔除原因 · '+ranked.excluded.length,add(E('div'),...ranked.excluded.map(x=>note(x.instrumentId+'：'+x.reason)))));out.append(details('board-'+g.id,(g.name||g.id)+' · '+(ranked.scope==='sample'?'样本榜':'全量成员筛选榜'),body));
 }return out;}
function findResearch(id){return W.selectResearch(state.modules.research?.payload?.records).find(r=>r.instrumentId===id);}
function researchCard(r){const b=E('div');add(b,E('p','wl-conclusion',r.analysis?.conclusion||'结论未填写'),note('事件 '+r.eventType+' / '+(r.period||'')+'；分析于 '+W.stamp(r.analyzedAt)),link('查看原始披露 / 研报',r.documentUrl));
 for(const[k,label]of[['plainImpact','白话影响'],['evidence','关键数据'],['guidance','指引与预期差'],['valuation','估值与时点'],['risks','风险与反证'],['invalidation','改判条件']]){const v=r.analysis?.[k];if(v!==undefined)add(b,E('h4','',label),E('p','',typeof v==='string'?v:JSON.stringify(v)));}
 if((state.mode==='history'?W.time(state.report?.updatedAt):Date.now())-(W.time(r.analyzedAt)||0)>state.config.research.staleAfterDays*86400000)b.append(E('p','wl-warning','研究时间较久；保留历史论证，不当成最新估值。'));
 b.append(note('沿用分析 ≠ 重新核验财报，也不代表旧估值仍适用于现价。'));return b;}
function researchLibrary(){const out=E('div'),m=state.modules.research,records=W.selectResearch(m?.payload?.records),checks=W.arr(m?.payload?.checks);out.append(note('只有新财报、指引、重述、重大公告、可核验新研报或原判断失效时重做。没有新材料则沿用原分析时间；每次只检查不等于每次重新研究。'));
 if(!records.length)out.append(note('暂无公司研究。候选池已配置，不能把未读取的最新财报或付费研报写成已分析。'));
 filtered(records.map(r=>({...r,name:r.instrumentId,conclusion:r.analysis?.conclusion}))).forEach(r=>out.append(details('research-'+r.instrumentId,r.instrumentId+' · '+(r.eventType||'')+' · '+(r.period||''),researchCard(r))));
 out.append(details('research-checks','事件检查记录 · '+checks.length,add(E('div'),...checks.map(c=>note(c.instrumentId+' · '+c.status+' · 检查 '+W.stamp(c.checkedAt)+' · '+(c.note||''))))));return out;}
async function fetchJSON(path){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch('./'+path+'?v='+Date.now(),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function load(force=false){const seq=++state.seq,selected=document.getElementById('historySelect')?.value||'data/latest.json',historical=selected!=='data/latest.json';state.mode=historical?'history':'latest';
 try{const config=state.config||await fetchJSON('config/watchlist.json');let report=null;if(historical){if(!/^history\/\d{4}-\d{2}-\d{2}\/\d{4}(?:-[\w-]+)?\.json$/.test(selected))throw Error('无效历史路径');report=await fetchJSON(selected);}
 const modules={},failures=[];await Promise.all(['quotes','asia-equities','us-equities','research','news','macro'].map(async role=>{let path='data/modules/'+role+'.json';if(historical){path=report?.reportMeta?.moduleRefs?.[role]?.path;if(!path||!new RegExp('^data/runs/'+role+'/[A-Za-z0-9_-]+\\.json$').test(path)){failures.push(labels[role]+'历史未冻结');return;}}
 try{const m=await fetchJSON(path);const e=W.validate(m,role);if(e.length)throw Error(e[0]);if(historical&&W.time(m.generatedAt)>W.time(report.updatedAt))throw Error('拒绝未来模块');modules[role]=m;}catch{failures.push(labels[role]);}}));
 if(seq!==state.seq)return;const signature=JSON.stringify({selected,config,modules,failures});state.config=config;state.n=state.loaded?state.n:config.defaultN;state.loaded=true;if(signature===state.signature&&!force)return;state.signature=signature;state.modules=modules;state.failures=failures;state.report=report;render();
 }catch(e){if(seq===state.seq){if(!state.loaded)root.replaceChildren(note('自选模块暂不可用：'+e.message));else root.prepend(E('p','wl-warning','模块检查失败，保留上次显示；不是新数据。'));}}
}
function directory(){const d=document.querySelector('#reportRoot .directory');if(d&&!d.querySelector('[data-watch-entry]')){const a=E('a');a.dataset.watchEntry='1';a.href='#watchlist';add(a,E('strong','','自选 / 板块 / 财报'),E('span','','独立更新 · 完整资料'));d.append(a);}}
const mainRoot=document.getElementById('reportRoot');if(mainRoot)new MutationObserver(directory).observe(mainRoot,{childList:true,subtree:true});directory();
document.getElementById('historySelect')?.addEventListener('change',()=>load(true));
document.addEventListener('click',e=>{if(e.target.closest('a[href="#watchlist"]')){const d=document.getElementById('watchlist');if(d)d.open=true;}});
load();setInterval(()=>{if(!document.hidden&&state.mode==='latest')load();},600000);
})();
