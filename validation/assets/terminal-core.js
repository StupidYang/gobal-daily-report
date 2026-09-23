/* GDR terminal core: pure, dependency-free, shared with node regression tests. */
(function (root) {
  'use strict';
  const arr = v => Array.isArray(v) ? v : [];
  const text = (v, fallback = '') => typeof v === 'string' || typeof v === 'number' ? String(v) : fallback;
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const statuses = {live:'即时快照',complete:'完整披露',closed:'收盘快照',delayed:'延迟',stale:'较旧',partial:'部分披露',missing:'缺失',error:'读取失败','window-unclear':'窗口待核',unknown:'未知'};
  function parseTime(value) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value !== 'string') return null;
    let s = value.trim().replace(/ UTC\+8$/, '+08:00').replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+08:00';
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/);
    if (!m) return null;
    const [y, mo, day, h, mi, se] = m.slice(1,7).map(x => Number(x || 0));
    const maxDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (mo < 1 || mo > 12 || day < 1 || day > maxDay || h > 23 || mi > 59 || se > 59) return null;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }
  function age(value, now = Date.now()) {
    const ms = parseTime(value); if (ms === null) return '时点未知';
    const delta = now - ms, n = Math.floor(Math.abs(delta) / 60000);
    if (delta < -1000) return '未来时点 · 请核验';
    return n < 1 ? '刚刚' : n < 60 ? `${n} 分钟前` : n < 1440 ? `${Math.floor(n / 60)} 小时前` : `${Math.floor(n / 1440)} 天前`;
  }
  function stamp(value) {
    const ms = parseTime(value); if (ms === null) return text(value, '时点未知') || '时点未知';
    return new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Singapore',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(ms).replaceAll('/', '-');
  }
  function reportTime(r) { return parseTime(r?.updatedAt); }
  function facts(r) {
    if (arr(r?.canonicalFacts).length) return arr(r.canonicalFacts).filter(f => f && typeof f === 'object');
    return arr(r?.metrics).map((m,i) => ({id:`legacy-${i}`,label:m.name,displayValue:text(m.value,'—'),changeLabel:m.changeLabel || m.changeText || (finite(m.change) ? `${m.change > 0 ? '+' : ''}${m.change}%` : ''),dataStatus:'unknown',asOf:m.asOf || null,sourceIds:arr(m.sourceIds),legacy:true}));
  }
  function health(fs) {
    const counts = Object.fromEntries(Object.keys(statuses).map(k => [k,0]));
    arr(fs).forEach(f => counts[Object.hasOwn(counts,f.dataStatus) ? f.dataStatus : 'unknown']++);
    return {total:arr(fs).length,counts};
  }
  function ledger(rows) {
    const unique = new Map();
    arr(rows).forEach((r,i) => {
      const key = r.id || r.topic || `row-${i}`, old = unique.get(key);
      if (!old || (parseTime(r.updatedAt) || 0) >= (parseTime(old.updatedAt) || 0)) unique.set(key,r);
    });
    const counts = {'得到支持':0,'受到削弱':0,'已被证伪':0,'待验证':0,'其他':0};
    unique.forEach(r => counts[Object.hasOwn(counts,r.status) ? r.status : '其他']++);
    return {total:unique.size,counts,rows:[...unique.values()]};
  }
  function coverage(period) {
    if (!period || !finite(period.coverageHours)) return {label:'窗口覆盖未知',ratio:0};
    const h = Math.max(0,Math.min(24,period.coverageHours));
    return {label:`${h.toFixed(1)} / 24 小时${period.isFull24h === true ? ' · 时间跨度完整' : ' · 覆盖不足或待核'}`,ratio:h/24};
  }
  function safePath(path) { return typeof path === 'string' && /^history\/\d{4}-\d{2}-\d{2}\/\d{4}(?:-[\w-]+)?\.json$/.test(path) ? path : null; }
  function group(f) {
    const s = `${text(f.seriesKey)} ${text(f.id)} ${text(f.label)} ${text(f.scope)}`.toLowerCase();
    if (/etf/.test(s) && /btc|bitcoin|比特/.test(s)) return 'ETF';
    if (/hstech|hsi|恒生|港股/.test(s)) return 'HK';
    if (/sse|szse|chinext|star50|上证|深证|创业板|科创/.test(s)) return 'CN';
    if (/nasdaq|sp500|s&p|dow|纳斯达克|道琼|标普/.test(s)) return 'US';
    if (/us10y|10y|10年|十年/.test(s)) return '10Y';
    if (/brent|布伦特/.test(s)) return 'Brent';
    if (/gold|黄金/.test(s)) return 'Au';
    if (/dxy|美元指数/.test(s)) return 'DXY';
    if (/btc|bitcoin|比特/.test(s) && !/funding|liquid|清算|资金费|敞口|\boi\b|_oi/.test(s)) return 'BTC';
    return 'OTHER';
  }
  function seriesIdentity(f) {
    if (!finite(f.rawValue) || f.rawValue <= 0 || parseTime(f.asOf) === null) return null;
    if (['missing','error','unknown','window-unclear','stale','partial'].includes(f.dataStatus)) return null;
    if (f.valueType && !['price','index','yield'].includes(f.valueType)) return null;
    let kind = f.valueType, key = text(f.seriesKey), unit = text(f.unit), g = group(f);
    if (!key) {
      if (g === 'BTC' && unit === 'USD' && /BTC\/USD/i.test(text(f.scope))) {key='BTC-USD:spot';kind='price';}
      else if (g === 'US' && unit === 'index' && /Nasdaq Composite/i.test(text(f.scope))) {key='NASDAQ:composite';kind='index';}
      else if (['CN','HK'].includes(g) && unit === 'index' && text(f.scope)) {key='INDEX:'+f.scope;kind='index';}
      else if (g === 'Au' && unit === 'USD/oz') {key='XAU-USD:spot';kind='price';}
      else return null; // Never infer a futures contract, return percentage or ambiguous yield.
    }
    if (!kind || !unit) return null;
    if (kind === 'index' && !['index','points','点'].includes(unit)) return null;
    if (kind === 'price' && unit.includes('%')) return null;
    if (!arr(f.sourceIds).length) return null;
    if (/brent|wti|future/i.test(key+' '+text(f.scope)) && !f.contract) return null;
    return [key,kind,unit,text(f.contract)].join('|');
  }
  function collectSeries(reports, end) {
    const limit = parseTime(end); if (limit === null) return [];
    const all = new Map();
    arr(reports).forEach(r => {
      if (reportTime(r) === null || reportTime(r) > limit) return;
      facts(r).forEach(f => {
        const key = seriesIdentity(f), at = parseTime(f.asOf);
        if (!key || at > limit || at < limit - 86400000) return;
        if (!all.has(key)) all.set(key,{key,label:f.label,group:group(f),kind:f.valueType || key.split('|')[1],unit:f.unit,points:new Map()});
        // Repeated closed values are one observation, not an invented flat intraday path.
        const previous = all.get(key).points.get(at);
        if (!previous || reportTime(r) >= parseTime(previous.recordedAt)) all.get(key).points.set(at,{at,value:f.rawValue,reportId:r.reportId || r.updatedAt,factId:f.id,sourceIds:arr(f.sourceIds),recordedAt:r.updatedAt});
      });
    });
    return [...all.values()].map(s => ({...s,points:[...s.points.values()].sort((a,b)=>a.at-b.at)}));
  }
  function comparable(series) {
    const useful = arr(series).filter(s => ['price','index'].includes(s.kind) && s.points.length >= 2).slice(0,4);
    if (useful.length < 2) return {series:[],reason:'至少需要两个资产各有两条同口径观测；当前样本不足。'};
    const common = useful[0].points.map(p=>p.at).filter(at=>useful.every(s=>s.points.some(p=>p.at===at)));
    const base = common.find(at=>useful.every(s=>s.points.some(p=>p.at>at)));
    if (base === undefined) return {series:[],reason:'未找到同一数据时点的共同基线；不把异步报价强行归零比较。'};
    return {base,series:useful.map(s=>{const b=s.points.find(p=>p.at===base).value;return {...s,points:s.points.filter(p=>p.at>=base).map(p=>({...p,value:(p.value/b-1)*100}))};}),reason:''};
  }
  function returnPct(f) {
    if (finite(f.changeValue) && f.changeUnit === '%') return f.changeValue;
    const m = text(f.changeLabel).match(/^([+-]?\d+(?:\.\d+)?)%$/); return m ? Number(m[1]) : null;
  }
  function issues(r) {
    const errors=[], fs=facts(r), ids=new Set(), ss=new Set(arr(r.sources).map(s=>s.id));
    fs.forEach(f=>{if(!f.id || ids.has(f.id))errors.push('事实ID缺失或重复');ids.add(f.id);if(f.rawValue!==null && f.rawValue!==undefined && !finite(f.rawValue))errors.push(`非数值 rawValue: ${f.id}`);});
    function scan(v) {if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(scan);return;}for(const [k,val] of Object.entries(v)){if(k==='factId' && val && !ids.has(val))errors.push(`未解析事实: ${val}`);if(['factIds','evidenceFactIds'].includes(k))arr(val).forEach(id=>{if(!ids.has(id))errors.push(`未解析事实: ${id}`);});if(k==='sourceIds')arr(val).forEach(id=>{if(!ss.has(id))errors.push(`未解析来源: ${id}`);});scan(val);}}
    scan(r); return [...new Set(errors)];
  }
  const api={arr,text,finite,statuses,parseTime,age,stamp,reportTime,facts,health,ledger,coverage,safePath,group,seriesIdentity,collectSeries,comparable,returnPct,issues};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  root.GDR=api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
