/* Independent watchlist reader. Failed workers never replace the main research report. */
(() => {
'use strict';
const D=window.GDRDisplay,W=window.GDRWatch;if(!W||!D)return;
const root=document.getElementById('watchlistRoot');if(!root)return;
const state={config:null,modules:{},report:null,tab:'required',quoteGroup:'ALL',market:'CN',sector:'ALL',query:'',n:5,limit:40,seq:0,mode:'latest',loaded:false,failures:[],quarantine:[],signature:''};
const storage={get(k,f){try{return JSON.parse(localStorage.getItem((document.documentElement.dataset.mode==='synthetic'?'demo:':document.documentElement.dataset.mode==='validation'?'validation:':'')+k))||f;}catch{return f;}},set(k,v){try{localStorage.setItem((document.documentElement.dataset.mode==='synthetic'?'demo:':document.documentElement.dataset.mode==='validation'?'validation:':'')+k,JSON.stringify(v));}catch{}}};
let pins=new Set(W.arr(storage.get('gdr:pins:v1',[])).filter(x=>typeof x==='string')),custom=W.arr(storage.get('gdr:custom:v1',[])).filter(x=>x&&typeof x.instrumentId==='string');
const statusText=s=>({ok:'已更新',partial:'部分更新',delayed:'延迟报价',invalid:'数据异常',missing:'未采集',error:'读取失败','no-change':'已查无新增',stale:'较旧',unknown:'未知',snapshot:'行情快照',closed:'收盘快照',previous:'沿用旧值'})[s]||s||'未采集';
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
let rendering=false, queued=false;
function render(){if(rendering){if(!queued){queued=true;queueMicrotask(()=>{queued=false;render();});}return;}rendering=true;try{renderBody();}finally{rendering=false;}}
function renderBody(){
 if(!state.config)return;
 const focused=document.activeElement,searchFocused=focused?.getAttribute('aria-label')==='搜索自选模块',caret=searchFocused?focused.selectionStart:null;
 const open=keepOpen(),box=E('details','library wl-library');box.id='watchlist';box.dataset.key='watchlist';box.open=open.has('watchlist')||location.hash==='#watchlist';
 const sum=E('summary');add(sum,E('span','library-title','自选资产 · 板块数据 · 公司研究'),E('span','library-caption','必看行情、板块数据状态与可用排名、只在新事件后更新的研究'),E('span','library-count',state.config.required.length+'项必看'));box.append(sum);
 const body=E('div','library-body wl-body');
 add(body,note('这是独立的数据模块：报价更新、榜单更新和研究更新不是同一个时间。候选名单不代表当前热门；热度不等于看涨。'));
 if(state.mode!=='latest')body.append(note('历史模式：只读取该报告冻结的模块快照；缺少冻结引用时不展示今天的数据，避免穿越。'));
 if(state.failures.length)body.append(E('p','wl-warning',state.failures.join('；')));
 if(state.quarantine.length){const audit=E('div');state.quarantine.forEach(q=>audit.append(note(q.role+' · '+q.path+' · '+q.errors.join('；'))));body.append(details('quarantine','已隔离 '+state.quarantine.length+' 条异常记录；其余合格数据继续显示',audit));}
 const status=E('div','wl-statusline');Object.keys(labels).filter(k=>!['synthesis'].includes(k)).forEach(k=>{const m=state.modules[k];status.append(E('span','wl-status',labels[k]+' · '+statusText(W.freshness(m,state.config.moduleTtlHours[k]||8,state.mode==='history'?W.time(state.report?.updatedAt):Date.now()))+(m?' · '+W.stamp(m.generatedAt):'')));});body.append(details('worker-status','模块状态与更新时点',status));
 const tools=E('div','wl-tools'),tabs=E('div','wl-tabs');[['required','必看资产'],['favorites','我的自选'],['boards','板块数据 / 热弱榜'],['research','公司研究']].forEach(([id,name])=>{const b=button(name,()=>{state.tab=id;state.limit=40;render();});b.setAttribute('aria-pressed',String(state.tab===id));tabs.append(b);});tools.append(tabs);
 const search=E('input');search.type='search';search.placeholder='搜索名称 / 代码 / 板块';search.value=state.query;search.setAttribute('aria-label','搜索自选模块');search.oninput=()=>{if(state.query===search.value)return;state.query=search.value;state.limit=40;render();};tools.append(search,button('检查模块更新',()=>load(true)));body.append(tools);
 if(state.tab==='boards')body.append(boards());else if(state.tab==='research')body.append(researchLibrary());else body.append(quoteTable(state.tab==='favorites'));
 const provenance=E('div');Object.entries(state.modules).forEach(([k,m])=>add(provenance,E('h4','',labels[k]||k),note('运行 '+m.runId+'；生成 '+W.stamp(m.generatedAt)+'；数据截止 '+W.stamp(m.dataAsOf)),note(m.payload?.note||m.note||'')));
 body.append(details('module-health','模块时点与采集状态',provenance));box.append(body);root.replaceChildren(box);root.querySelectorAll('details').forEach(d=>{if(open.has(d.dataset.key))d.open=true;});directory();if(searchFocused){const input=root.querySelector('[aria-label="搜索自选模块"]');input?.focus();if(caret!==null)input?.setSelectionRange(caret,caret);}
}
function filtered(items){const q=state.query.toLowerCase();return items.filter(x=>!q||[x.name,x.symbol,x.instrumentId,x.group,x.sector,x.conclusion].filter(Boolean).join(' ').toLowerCase().includes(q));}
function allQuotes(){
 const base=W.combinedQuotes(state.config,state.modules),map=new Map(base.map(q=>[q.instrumentId,q]));
 for(const name of ['asia-equities','us-equities'])for(const t of W.arr(state.modules[name]?.payload?.observedThemes))for(const q of W.arr(t.rows)){const id=q.instrumentId||(q.symbol?'EQUITY:'+t.market+':'+q.symbol:null);if(id&&!map.has(id))map.set(id,{...q,instrumentId:id,market:t.market,group:t.theme,price:q.price??null,asOf:q.asOf||t.asOf,status:'snapshot',note:t.note,sourceModule:name,sourceIds:q.sourceIds||t.sourceIds});}
 for(const [pool,syms]of Object.entries(state.config.usPools))for(const symbol of syms){const id='EQUITY:US:'+symbol;if(!map.has(id))map.set(id,{instrumentId:id,symbol,name:symbol,market:'US',group:pool==='technology'?'科技候选池':'投资公司候选池',price:null,status:'missing'});}
 for(const x of custom)if(!map.has(x.instrumentId))map.set(x.instrumentId,{...x,price:null,status:'missing',group:'本机新增，尚未订阅采集'});
 return [...map.values()];
}
function quoteTable(favorites){
 const out=E('div'),all=allQuotes();let list=favorites?all.filter(q=>pins.has(q.instrumentId)):all.filter(q=>state.config.required.some(x=>x.id===q.instrumentId));list=filtered(list);
 const filter=E('select');filter.setAttribute('aria-label','资产类别');[['ALL','全部资产'],['指数','各市场指数'],['加密','加密资产'],['汇率','美元与人民币'],['商品','黄金白银与原油'],['利率','美债收益率']].forEach(([v,t])=>{const o=E('option','',t);o.value=v;filter.append(o);});filter.value=state.quoteGroup;filter.onchange=()=>{state.quoteGroup=filter.value;state.limit=40;render();};if(!favorites){out.append(filter);if(state.quoteGroup!=='ALL')list=list.filter(q=>q.group===state.quoteGroup);}
 if(!list.length)out.append(note(favorites?'尚无匹配的自选。可在下方添加代码，或从必看资产点击☆收藏。':'没有匹配的资产，修改搜索或类别即可。'));
 const wrap=E('div','wl-table-wrap'),table=E('table','wl-table'),head=E('tr');['自选','资产 / 代码','最近数据','变化 / 基准','数据时点 / 状态','分析'].forEach(x=>head.append(E('th','',x)));table.append(add(E('thead'),head));const tbody=E('tbody');
 list.slice(0,state.limit).forEach(q=>{const tr=E('tr'),star=button(pins.has(q.instrumentId)?'★':'☆',()=>{pins.has(q.instrumentId)?pins.delete(q.instrumentId):pins.add(q.instrumentId);storage.set('gdr:pins:v1',[...pins]);render();},'wl-star');star.setAttribute('aria-label',(pins.has(q.instrumentId)?'取消自选 ':'加入自选 ')+(q.name||q.symbol));star.setAttribute('aria-pressed',String(pins.has(q.instrumentId)));
  const value=E('td');add(value,E('strong','wl-value',D.format(q)),note(D.unit(q)),q.contract?note('合约 '+q.contract):null);
  const change=E('td',W.finite(q.changePct)?q.changePct>=0?'positive':'negative':'wl-muted',W.finite(q.changePct)?(q.changePct>0?'+':'')+q.changePct.toFixed(2)+'%':'—');change.append(note(D.basis(q.comparisonBasis)));
  const status=E('td');add(status,note(W.stamp(q.asOf)),note(q.retention?'历史沿用 · 未重新核验':statusText(q.status)));
  const analysis=E('td'),research=findResearch(q.instrumentId),proof=E('div');
  proof.append(note('数据截至：'+W.stamp(q.asOf)+'；'+D.status(q.status)),refs(q.sourceIds,state.modules[q.sourceModule||'quotes']));
  if(q.note)proof.append(note(q.note));if(q.retention)proof.append(note('历史沿用：'+q.retention.reason+'；原始运行 '+q.retention.fromRunId+'；不是本轮新采集。'));proof.append(note('原始涨跌基准：'+(q.comparisonBasis||'未提供')));
  if(research)proof.append(researchCard(research));analysis.append(details('quote-proof-'+q.instrumentId,research?'研究与来源':'数据依据',proof));analysis.append(refs(q.sourceIds,state.modules[q.sourceModule||'quotes']));
  add(tr,add(E('td'),star),add(E('td'),E('strong','',q.name||q.symbol||q.instrumentId),note((q.symbol||q.instrumentId)+' · '+(q.group||q.market||''))),value,change,status,analysis);tbody.append(tr);
 });table.append(tbody);wrap.append(table);out.append(wrap,note('展示 '+Math.min(state.limit,list.length)+' / '+list.length+'；空值是未采集，不是价格为零。'));
 if(list.length>state.limit)out.append(button('显示更多',()=>{state.limit+=40;render();}));
 if(favorites){out.append(note('本机收藏只改变显示。新增采集标的需导出后合并进仓库config/watchlist.json；不会假装浏览器能直接修改定时任务。'));
 const form=E('form','wl-tools'),market=E('select');['US','CN','HK'].forEach(v=>market.append(Object.assign(E('option','',v),{value:v})));market.setAttribute('aria-label','新增证券市场');
 const symbol=E('input');symbol.placeholder='代码，如 NVDA / 600519.SH / 00700';symbol.setAttribute('aria-label','新增证券代码');symbol.required=true;
 const save=E('button','','加入本机自选');save.type='submit';form.append(market,symbol,save);form.onsubmit=e=>{e.preventDefault();let s=symbol.value.trim().toUpperCase();if(market.value==='HK'&&/^\d{1,5}$/.test(s))s=s.padStart(5,'0');if(!/^[A-Z0-9][A-Z0-9.]{0,15}$/.test(s)||market.value==='CN'&&!/^\d{6}\.(SH|SZ|BJ)$/.test(s)||market.value==='HK'&&!/^\d{5}$/.test(s)){symbol.setCustomValidity('CN需六位代码.SH/.SZ/.BJ；HK需五位代码；US需证券代码');symbol.reportValidity();return;}symbol.setCustomValidity('');const id='EQUITY:'+market.value+':'+s;if(!custom.some(x=>x.instrumentId===id))custom.push({instrumentId:id,symbol:s,name:s,market:market.value});pins.add(id);storage.set('gdr:custom:v1',custom);storage.set('gdr:pins:v1',[...pins]);render();};symbol.oninput=()=>symbol.setCustomValidity('');out.append(form,button('导出自选配置',()=>{const blob=new Blob([JSON.stringify({version:1,pinned:[...pins],instruments:custom},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=E('a');a.href=url;a.download='gdr-user-watchlist.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
 const candidates=E('div','wl-pool');Object.entries(state.config.usPools).forEach(([k,syms])=>{candidates.append(E('h4','',k==='technology'?'科技公司候选池':'投资/资管/券商候选池'));syms.forEach(s=>candidates.append(button((pins.has('EQUITY:US:'+s)?'★ ':'☆ ')+s,()=>{pins.has('EQUITY:US:'+s)?pins.delete('EQUITY:US:'+s):pins.add('EQUITY:US:'+s);storage.set('gdr:pins:v1',[...pins]);render();})));});out.append(details('candidate-pools','从配置候选池加入自选（不是热门排名）',candidates));
 }return out;
}
function boards(){const out=E('div'),tools=E('div','wl-tools'),market=E('select');[['CN','A股'],['HK','港股'],['US','美股科技 / 投资']].forEach(([v,t])=>market.append(Object.assign(E('option','',t),{value:v})));market.value=state.market;market.setAttribute('aria-label','榜单市场');market.onchange=()=>{state.market=market.value;state.sector='ALL';render();};
 const n=E('input');n.type='number';n.min=1;n.max=state.config.maxN;n.value=state.n;n.setAttribute('aria-label','每组显示前N只');n.onchange=()=>{const next=W.nValue(n.value,state.config.maxN);if(next===state.n)return;state.n=next;render();};tools.append(market,E('label','','每组 N'),n);out.append(tools);
 out.append(note('热度 = 50%同板块量比分位 + 30%换手率分位 + 20%成交额分位；弱势 = 当日涨跌幅相对板块样本中位数。缺20日同时间量能基准不计算热度；样本不全不冒充全市场榜。'));
 const module=state.modules[state.market==='US'?'us-equities':'asia-equities'],groups=W.arr(module?.payload?.groups).filter(g=>g.market===state.market);
 const observedRows=groups.reduce((n,g)=>n+W.arr(g.rows).length,0),gap=module?.payload?.rankingInputGaps;
 if(!observedRows&&['CN','HK'].includes(state.market))out.append(E('p','wl-warning','当前只有行业目录，尚未取得行业成员与同口径量价输入，因此不生成热度/弱势榜；这不是0只股票。'));
 if(state.market==='US'&&observedRows&&gap&&(gap.heatRankingGenerated===false||gap.weakRankingGenerated===false)){const missing=['volumeRatio20d','turnoverPct','avgDailyValue20d'].filter(k=>gap[k]==='missing');out.append(E('p','wl-warning','美股候选池已有 '+observedRows+' 条基础报价，但排名输入仍不完整'+(missing.length?'：'+missing.join('、'):'')+'；不以涨幅代替热度。'));}
 out.append(marketSamples(module,state.market));const noData=E('div');let noDataCount=0;
 const expected=state.market==='US'?['technology','investment']:state.config.sectors[state.market].names;
 if(!groups.length)out.append(E('p','wl-warning','尚未采集有效板块快照。下面列出应覆盖的全部板块，不填造热股。'));
 for(const name of expected){const g=groups.find(x=>x.name===name||x.id===name||x.pool===name);if(!g){if(state.query&&!name.toLowerCase().includes(state.query.toLowerCase()))continue;noDataCount++;noData.append(details('missing-'+state.market+'-'+name,name+' · 待采集',note('尚无这个板块的合格数据、成员范围和同口径时点。')));continue;}
 const ranked=W.rankGroup(g,state.config,state.n);if(!ranked.observed){noDataCount++;noData.append(note(name+'：尚无合格成员行情。'));continue;}if(state.query&&!name.toLowerCase().includes(state.query.toLowerCase())&&!filtered(g.rows).length)continue;
 const body=E('div');body.append(note(ranked.note+' 已观测 '+ranked.observed+' / 应有 '+(ranked.expected??'未知')+'；可比较 '+ranked.eligible+'；可算热度 '+ranked.scorable+'。数据 '+W.stamp(g.asOf)));
 const split=E('div','wl-board-grid');for(const[type,title]of[['hot','交易热度前 '+state.n],['weak','相对弱势后 '+state.n]]){const column=E('div');column.append(E('h4','',title));if(!ranked[type].length)column.append(note('数据不足：不以涨幅榜代替热度，也不补零。'));ranked[type].forEach((q,i)=>{const row=E('article','wl-rankrow');add(row,E('strong','',(i+1)+'. '+(q.name||q.symbol||q.instrumentId)),E('span',q.changePct>=0?'positive':'negative',(q.changePct>0?'+':'')+q.changePct.toFixed(2)+'%'),note(type==='hot'?'热度 '+q.heatScore.toFixed(1)+' / 100（活动分位，不是胜率）':'相对中位数 '+q.relativePp.toFixed(2)+' 个百分点'),note(q.catalyst||'本轮未核验个股催化'),button(pins.has(q.instrumentId)?'已加入自选':'加入自选',()=>{pins.add(q.instrumentId);storage.set('gdr:pins:v1',[...pins]);render();}),refs(q.sourceIds,module));column.append(row);});split.append(column);}body.append(split);
 if(ranked.excluded.length)body.append(details('excluded-'+g.id,'查看剔除原因 · '+ranked.excluded.length,add(E('div'),...ranked.excluded.map(x=>note(x.instrumentId+'：'+x.reason)))));out.append(details('board-'+g.id,(g.name||g.id)+' · '+(ranked.scope==='sample'?'样本榜':'全量成员筛选榜'),body));
 }if(noDataCount)out.append(details('empty-sectors-'+state.market,'尚未形成榜单的板块 · '+noDataCount+'（完整目录保留）',noData));return out;}
function findResearch(id){return W.selectResearch(state.modules.research?.payload?.records).find(r=>r.instrumentId===id);}
function researchCard(r){const b=E('div');add(b,E('p','wl-conclusion',r.analysis?.conclusion||'结论未填写'),note('事件 '+r.eventType+' / '+(r.period||'')+'；分析于 '+W.stamp(r.analyzedAt)),link('查看原始披露 / 研报',r.documentUrl));
 for(const[k,label]of[['plainImpact','白话影响'],['evidence','关键数据'],['guidance','指引与预期差'],['valuation','估值与时点'],['risks','风险与反证'],['invalidation','改判条件']]){const v=r.analysis?.[k];if(v!==undefined)add(b,E('h4','',label),E('p','',D.prose(v)));}
 if((state.mode==='history'?W.time(state.report?.updatedAt):Date.now())-(W.time(r.analyzedAt)||0)>state.config.research.staleAfterDays*86400000)b.append(E('p','wl-warning','研究时间较久；保留历史论证，不当成最新估值。'));
 b.append(note('沿用分析 ≠ 重新核验财报，也不代表旧估值仍适用于现价。'));return b;}
function researchLibrary(){const out=E('div'),m=state.modules.research,records=W.selectResearch(m?.payload?.records),checks=W.arr(m?.payload?.checks);out.append(note('只有新财报、指引、重述、重大公告、可核验新研报或原判断失效时重做。没有新材料则沿用原分析时间；每次只检查不等于每次重新研究。'));
 if(!records.length)out.append(note('暂无公司研究。候选池已配置，不能把未读取的最新财报或付费研报写成已分析。'));
 filtered(records.map(r=>({...r,name:r.instrumentId,conclusion:r.analysis?.conclusion}))).forEach(r=>out.append(details('research-'+r.instrumentId,r.instrumentId+' · '+(r.eventType||'')+' · '+(r.period||''),researchCard(r))));
 const checkBody=E('div');if(checks.length)checks.forEach(c=>checkBody.append(note(c.instrumentId+' · '+c.status+' · 检查 '+W.stamp(c.checkedAt)+' · '+(c.note||''))));else checkBody.append(note('本轮没有公司材料检查记录；这不等于已经检查并确认“无新增”。已有研究仍保留原analyzedAt。'));out.append(details('research-checks','事件检查记录 · '+checks.length,checkBody));return out;}
async function fetchJSON(path){const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);try{const r=await fetch('./'+path+'?v='+Date.now(),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function load(force=false){const seq=++state.seq,selected=document.getElementById('historySelect')?.value||'data/latest.json',historical=selected!=='data/latest.json';state.mode=historical?'history':'latest';
 try{const config=state.config||await fetchJSON('config/watchlist.json');let report=null;if(!historical){try{report=await fetchJSON('data/latest.json');}catch{}}if(historical){if(!/^history\/\d{4}-\d{2}-\d{2}\/\d{4}(?:-[\w-]+)?\.json$/.test(selected))throw Error('无效历史路径');report=await fetchJSON(selected);}
 const modules={},failures=[],quarantine=[];await Promise.all(['quotes','asia-equities','us-equities','research','news','macro'].map(async role=>{let path='data/modules/'+role+'.json';if(historical){path=report?.reportMeta?.moduleRefs?.[role]?.path;if(!path||!new RegExp('^data/runs/'+role+'/[A-Za-z0-9_-]+\\.json$').test(path)){failures.push(labels[role]+'历史未冻结');return;}}
 try{const m=await fetchJSON(path);const projected=W.projectModule(m,role);if(!projected.module)throw Error('数据校验失败：'+projected.issues.join('；'));if(historical&&W.time(m.generatedAt)>W.time(report.updatedAt))throw Error('拒绝未来模块');modules[role]=projected.module;quarantine.push(...projected.quarantined.map(q=>({...q,role})));}catch(e){failures.push(labels[role]+'：'+e.message);if(!historical&&state.modules[role]&&state.report?.reportId===report?.reportId){modules[role]=state.modules[role];failures.push(labels[role]+'：沿用上次成功读取的数据及原时点');}}}));
 if(window.GDRContent?.projection&&report){const pr=await window.GDRContent.projection(report);if(pr)for(const [role,m]of Object.entries(pr.modules||{}))if(modules[role]?.runId===m.runId){const checked=W.projectModule(m,role);if(checked.module)modules[role]=checked.module;}}
 if(seq!==state.seq)return;const signature=JSON.stringify({selected,config,modules,failures,quarantine});state.config=config;state.n=state.loaded?state.n:config.defaultN;state.loaded=true;if(signature===state.signature&&!force)return;state.signature=signature;state.modules=modules;state.failures=failures;state.quarantine=quarantine;state.report=report;render();publicationLine();document.dispatchEvent(new CustomEvent('gdr:coverage',{detail:window.GDRContent.quoteCoverage(config,modules.quotes,historical?W.time(report.reportMeta?.generatedAt||report.updatedAt):Date.now())}));
 }catch(e){if(seq===state.seq){if(historical&&state.loaded){state.modules={};state.failures=['历史报告读取失败'];state.report=null;render();return;}if(!state.loaded)root.replaceChildren(note('自选模块暂不可用：'+e.message));else root.prepend(E('p','wl-warning','模块检查失败，保留上次显示；不是新数据。'));}}
}

function publicationLine(){document.getElementById('publicationLine')?.remove();}
function marketSamples(module,market){
 const out=E('div','wl-market-samples'),p=module?.payload||{},summary=p.marketSummary?.[market];
 if(summary){const b=E('div');b.append(note('数据截至 '+W.stamp(summary.asOf)+'；指数点位与成交范围分别保留。'));
  for(const x of W.arr(summary.indices))b.append(note(x.name+'：'+(W.finite(x.value)?x.value:'点位待核')+' / '+(W.finite(x.changePct)?(x.changePct>0?'+':'')+x.changePct+'%':'涨幅待核')));
  if(summary.structure)b.append(E('p','',summary.structure));
  if(summary.turnoverCny)b.append(note('成交额 '+(summary.turnoverCny/1e8).toFixed(0)+' 亿元 · '+(summary.turnoverScope||'范围见原来源')));
  if(summary.breadth)b.append(note('上涨 '+(summary.breadth.advancers??'未知')+' / 下跌 '+(summary.breadth.decliners??'未知')));
  b.append(refs(summary.sourceIds,module));out.append(section('市场概览 · 非排名',b));
 }
 const themes=W.arr(p.observedThemes).filter(x=>x.market===market);
 const poolSamples=[...W.arr(p.groups),...W.arr(p.retainedGroups)].filter(x=>x.market===market&&W.arr(x.rows).length).map(g=>({theme:g.name||g.id,rows:g.rows,asOf:g.asOf,sourceIds:g.sourceIds,note:g.retention?'历史候选样本 · '+g.retention.reason+' · 数据 '+W.stamp(g.asOf):'已核验候选样本；不是全池排名。'}));
 const sampleBody=E('div');
 for(const t of [...themes,...poolSamples]){const b=E('div');if(t.catalyst)b.append(E('p','',t.catalyst));
  for(const q of W.arr(t.rows)){const x=E('div','wl-sample-row'),id=q.instrumentId||(q.symbol?'EQUITY:'+market+':'+q.symbol:null);
   const val=W.finite(q.changePct)?(q.changePct>0?'+':'')+q.changePct+'%':q.displayChange||'变化待核';
   x.append(E('strong','',q.name||q.symbol||id),note((q.symbol||id||'')+' · '+val+(W.finite(q.price)?' · '+W.priceText(q):'')));
   x.append(note('数据 '+W.stamp(q.asOf||t.asOf)+(q.retention?' · 历史沿用':'')));if(q.catalyst)x.append(note(q.catalyst));
   if(id)x.append(button(pins.has(id)?'已在自选':'加入自选',()=>{pins.add(id);storage.set('gdr:pins:v1',[...pins]);render();}));
   x.append(refs(q.sourceIds||t.sourceIds,module));b.append(x);
  }
  b.append(note(t.note||'新闻主题样本不等同于行业成分，不参与全行业排名。'));
  sampleBody.append(details('samples-'+market+'-'+t.theme,t.theme+' · '+W.arr(t.rows).length+'只已核验样本',b));
 }
 if(themes.length||poolSamples.length)out.append(section('题材与候选样本 · 不冒充热度榜',sampleBody));
 return out;
}

function directory(){const d=document.querySelector('#reportRoot .directory');if(d&&!d.querySelector('[data-watch-entry]')){d.classList.add('with-watchlist');const a=E('a');a.dataset.watchEntry='1';a.href='#watchlist';add(a,E('strong','','自选 / 板块 / 财报'),E('span','','独立更新 · 完整资料'));d.append(a);}}
const mainRoot=document.getElementById('reportRoot');if(mainRoot)new MutationObserver(directory).observe(mainRoot,{childList:true,subtree:true});directory();
document.getElementById('historySelect')?.addEventListener('change',()=>load(true));
document.addEventListener('gdr:report-applied',()=>load(true));
document.addEventListener('click',e=>{if(e.target.closest('a[href="#watchlist"]')){const d=document.getElementById('watchlist');if(d)d.open=true;}});
load();setInterval(()=>{if(!document.hidden&&state.mode==='latest')load();},600000);
})();
