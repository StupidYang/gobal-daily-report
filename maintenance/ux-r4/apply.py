from pathlib import Path
root=Path(__file__).resolve().parents[2]
import hashlib,json
marker=root/'maintenance/ux-r4/applied.json'
if marker.exists():
 print('UX r4 already applied');raise SystemExit(0)
BASES={'assets/reader.js': '96d3be9f7976d0b41547d402e9350f79726c39fa7fabdbe3f90adddd38822a28', 'assets/watchlist.js': 'fdb47c6db406429c6365d842b3d6bd8e49903ca3fb6d839343480867b8fa3bf5', 'index.html': 'b4cd8b8428f08bd80b0f4a9cc7339f30c70e7c426c61d4cb5b31ba5a4da9bc02'}
for name,digest in BASES.items():
 if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest: raise RuntimeError('Base changed; refusing to overwrite '+name)
def replace(s,a,b):
 assert a in s, a[:120]
 return s.replace(a,b,1)
p=root/'assets/reader.js';s=p.read_text()
s=replace(s,"const C=window.GDR, R=window.GDREditorial, A=C.arr", "const D=window.GDRDisplay, C=window.GDR, R=window.GDREditorial, A=C.arr")
a=s.index('function cards(r)');b=s.index('function directory(r)',a);s=s[:a]+"function cards(r){return window.GDRBriefing.cards(r);}\n"+s[b:]
s=replace(s,'add(b,headline(r),quickBoard(r),cards(r),systemLine(r)', 'add(b,headline(r),cards(r),quickBoard(r),systemLine(r)')
s=replace(s,"if(data.length){box.append(plot(data));", "if(data.length&&data.some(s=>s.points.length>=2)){box.append(plot(data));")
s=replace(s,"else box.append(el('div','chart-empty',message));", "else box.append(el('div','chart-empty',data.length?D.pointCaption(data[0].points.length)+'。下方可查看这次记录；没有伪造连线。':message));")
s=replace(s,"if(s){n.append(plot([s],true));", "if(s&&s.points.length>=2){n.append(plot([s],true));")
s=replace(s,"document.createTextNode('样本不足 · 口径未齐')", "document.createTextNode(D.pointCaption(s?.points.length||0))")
s=replace(s,"T(f.displayValue,'—')),el('p','fact-meta'", "D.format(f)),el('p','fact-meta'")
s=replace(s,"el('p','small muted',T(f.concept))", "el('p','small muted',T(f.concept||f.principle||f.plainMechanism))")
s=replace(s,"['事实输入',f.observed]", "['事实输入',D.prose(f.observed||f.inputs)]")
# Expose report changes only after they were actually applied, not on selection intent.
s=replace(s,"if(location.hash)openAnchor(location.hash,false);}", "if(location.hash)openAnchor(location.hash,false);document.dispatchEvent(new CustomEvent('gdr:report-applied',{detail:{path,reportId:r.reportId}}));}")
p.write_text(s)
p=root/'assets/watchlist.js';s=p.read_text()
s=replace(s,"const W=window.GDRWatch;if(!W)return;", "const D=window.GDRDisplay,W=window.GDRWatch;if(!W||!D)return;")
s=replace(s,"tab:'required',market:'CN'", "tab:'required',quoteGroup:'ALL',market:'CN'")
s=replace(s,"const open=keepOpen(),box=", "const focused=document.activeElement,searchFocused=focused?.getAttribute('aria-label')==='搜索自选模块',caret=searchFocused?focused.selectionStart:null;\n const open=keepOpen(),box=")
s=replace(s,"body.append(status);", "body.append(details('worker-status','模块状态与更新时点',status));")
s=replace(s,"search.onchange=()=>", "search.oninput=()=>")
s=replace(s,"directory();\n}", "directory();if(searchFocused){const input=root.querySelector('[aria-label=\"搜索自选模块\"]');input?.focus();if(caret!==null)input?.setSelectionRange(caret,caret);}\n}")
s=replace(s,"list=filtered(list);\n const wrap=", """list=filtered(list);
 const filter=E('select');filter.setAttribute('aria-label','资产类别');[['ALL','全部资产'],['指数','各市场指数'],['加密','加密资产'],['汇率','美元与人民币'],['商品','黄金白银与原油'],['利率','美债收益率']].forEach(([v,t])=>{const o=E('option','',t);o.value=v;filter.append(o);});filter.value=state.quoteGroup;filter.onchange=()=>{state.quoteGroup=filter.value;state.limit=40;render();};if(!favorites){out.append(filter);if(state.quoteGroup!=='ALL')list=list.filter(q=>q.group===state.quoteGroup);}
 if(!list.length)out.append(note(favorites?'尚无匹配的自选。可在下方添加代码，或从必看资产点击☆收藏。':'没有匹配的资产，修改搜索或类别即可。'));
 const wrap=""")
s=replace(s,"W.priceText(q)", "D.format(q)")
s=replace(s,"(q.currency||q.unit)==='index'?'点位':q.currency||q.unit||''", "D.unit(q)")
s=replace(s,"q.comparisonBasis||'基准待确认'", "D.basis(q.comparisonBasis)")
s=replace(s,"const analysis=E('td'),research=findResearch(q.instrumentId);if(research)analysis.append(details('qr-'+q.instrumentId,'查看事件研究',researchCard(research)));else analysis.append(note(q.note||'尚无已发布研究'));", """const analysis=E('td'),research=findResearch(q.instrumentId),proof=E('div');
  proof.append(note('数据截至：'+W.stamp(q.asOf)+'；'+D.status(q.status)),refs(q.sourceIds,state.modules[q.sourceModule||'quotes']));
  if(q.note)proof.append(note(q.note));proof.append(note('原始涨跌基准：'+(q.comparisonBasis||'未提供')));
  if(research)proof.append(researchCard(research));analysis.append(details('quote-proof-'+q.instrumentId,research?'研究与来源':'数据依据',proof));""")
s=replace(s,"typeof v==='string'?v:JSON.stringify(v)", "D.prose(v)")
# Raw publication diagnostics remain in module health instead of taking over the opening screen.
a=s.index('function publicationLine()');b=s.index('function ',a+len('function publicationLine()'))
s=s[:a]+"function publicationLine(){document.getElementById('publicationLine')?.remove();}\n"+s[b:]
s=replace(s,"document.getElementById('historySelect')?.addEventListener('change',()=>load(true));", "document.getElementById('historySelect')?.addEventListener('change',()=>load(true));\ndocument.addEventListener('gdr:report-applied',()=>load(true));")
p.write_text(s)
p=root/'index.html';s=p.read_text();s=s.replace('20260922-r2','20260922-ux-r4').replace('20260922-recovery-r3','20260922-ux-r4');s=s.replace('<script defer src="./assets/reader.js', '<script defer src="./assets/display-core.js?v=20260922-ux-r4"></script>\n<script defer src="./assets/briefing.js?v=20260922-ux-r4"></script>\n<script defer src="./assets/reader.js');s=s.replace('</head>', '<link rel="stylesheet" href="./assets/readable.css?v=20260922-ux-r4">\n</head>');s=s.replace('<a href="#research">详报</a>','<a href="#research">详报</a><a href="#watchlist">自选</a>');p.write_text(s)
marker.write_text(json.dumps({'version':'ux-r4','note':'Display-only patch. No report, source data, task schedule or prompt changed.','baseSha256':BASES},ensure_ascii=False,indent=2)+'\n')
