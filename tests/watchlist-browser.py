"""Offline Chromium integration checks for the standalone module; all prices below are fixtures."""
import json, os, sys
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
CONFIG=json.loads((ROOT/'config/watchlist.json').read_text())
AT='2026-09-22T09:35:00+08:00'
def mod(role,payload):
    return dict(moduleVersion=1,module=role,runId='fixture-'+role,generatedAt=AT,dataAsOf=AT,status='partial',sources=[dict(id='s',url='https://example.org/fixture')],payload=payload)
q=dict(instrumentId='CRYPTO:BTC:USD',price=100,changePct=2,asOf=AT,currency='USD',status='snapshot',sourceIds=['s'])
def stock(i,ret):
    return dict(instrumentId=f'EQUITY:CN:60000{i}.SH',symbol=f'60000{i}',name=f'测试公司{i}',price=10,changePct=ret,asOf=AT,currency='CNY',tradingDate='2026-09-22',session='regular',comparisonBasis='previous-official-close',volumeRatio20d=i,volumeBaseline='20-session-same-elapsed',turnoverPct=i,valueTraded=i*50000000,avgDailyValue20d=60000000,listingDays=1000,isST=False,suspended=False,sourceIds=['s'])
g=dict(id='电子',name='电子',market='CN',classification='SW2021-L1',asOf=AT,tradingDate='2026-09-22',session='regular',currency='CNY',comparisonBasis='previous-official-close',universeScope='sample',expectedCount=None,rows=[stock(1,3),stock(2,-3),stock(3,1)])
mods={'quotes':mod('quotes',dict(items=[q,{**q,'instrumentId':'CRYPTO:PEPE:USD','price':.0000081234}])),'asia-equities':mod('asia-equities',dict(groups=[g])),'us-equities':mod('us-equities',dict(groups=[])),'research':mod('research',dict(records=[],checks=[])),'news':mod('news',dict(newsroom={'items':[]})),'macro':mod('macro',{})}
HTML='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.7 system-ui;background:#f8fafc;color:#172033;--ink:#172033;--muted:#64748b;--line:#e2e8f0;--accent:#2962ff;--surface:white;--raised:#f5f7fb}main{max-width:1240px;padding:16px;margin:auto}.library{min-width:0;background:white;border:1px solid #dde3ed;border-radius:10px;margin-top:16px}.library>summary{padding:16px;display:flex;gap:16px;flex-wrap:wrap;cursor:pointer}.library-title{font-weight:700}.library-caption{font-size:12px;color:#64748b}.library-body{padding:16px}.library-count{margin-left:auto}.directory{display:flex;gap:12px;flex-wrap:wrap}.directory a{color:#2962ff;text-decoration:none}.directory span{display:block;font-size:12px}button{border:1px solid #dde3ed;background:white;color:#172033;border-radius:6px;padding:6px 10px;cursor:pointer;font:inherit}h3,h4,p{margin:6px 0}.positive{color:#128269}.negative{color:#c84242}select{font:inherit;max-width:100%}
</style><link rel="stylesheet" href="/assets/watchlist.css"><script defer src="/assets/watchlist-core.js"></script><script defer src="/assets/watchlist.js"></script><main><h1>自选模块离线验收</h1><p>本页面全部行情是测试夹具，不是真实市场报价。</p><select id="historySelect"><option value="data/latest.json">最新报告</option><option value="history/2026-09-22/0800.json">旧版</option></select><div id="reportRoot"><div class="directory"><a href="#research">原有完整详报</a></div><div id="original">原有市场、时事、白话分析均保留</div></div><div id="watchlistRoot"></div></main></html>'''

def run():
    output=Path(os.environ.get('GDR_TEST_OUTPUT', str(ROOT/'test-results'/'watchlist-browser')));output.mkdir(parents=True,exist_ok=True)
    results=[]
    with sync_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
        for width in [320,390,768,1440]:
            context=browser.new_context(viewport={'width':width,'height':1000})
            # Corrupt-but-valid JSON storage must not stop rendering.
            context.add_init_script("localStorage.setItem('gdr:pins:v1', '{}');localStorage.setItem('gdr:custom:v1','{}');")
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            import re
            page.set_content(re.sub(r'<link[^>]+>|<script[^>]+></script>', '', HTML))
            page.add_style_tag(content=(ROOT/'assets/watchlist.css').read_text())
            page.evaluate("""({config,modules})=>{
              const memory={'gdr:pins:v1':'{}','gdr:custom:v1':'{}'};
              Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=v},configurable:true});
              window.fetch=async url=>{
                const path=new URL(url,'https://fixture.test/').pathname;
                let data;
                if(path==='/config/watchlist.json') data=config;
                else if(path.startsWith('/data/modules/')) data=modules[path.split('/').pop().split('.')[0]];
                else if(path.startsWith('/history/'))data={updatedAt:'2026-09-22 08:00',reportMeta:{}};
                return {ok:!!data,status:data?200:404,json:async()=>JSON.parse(JSON.stringify(data))};
              };
            }""", {'config':CONFIG,'modules':mods})
            page.add_script_tag(content=(ROOT/'assets/watchlist-core.js').read_text())
            page.add_script_tag(content=(ROOT/'assets/watchlist.js').read_text())
            page.wait_for_selector('#watchlist')
            assert page.locator('#watchlist').get_attribute('open') is None
            page.locator('a[data-watch-entry]').click();assert page.locator('#watchlist').get_attribute('open') is not None
            assert page.locator('.wl-table tbody tr').count()==31
            assert '0.0000081234' in page.locator('#watchlist').inner_text()
            page.get_by_role('button',name='加入自选 Bitcoin',exact=True).click()
            page.get_by_role('button',name='我的自选',exact=True).click();assert page.locator('.wl-table tbody tr').count()==1
            page.get_by_role('button',name='板块热 / 弱榜',exact=True).click()
            page.locator('[data-key="board-电子"] > summary').click();assert page.locator('.wl-rankrow').count()==6
            page.get_by_label('每组显示前N只').fill('1');page.get_by_label('每组显示前N只').dispatch_event('change');assert page.locator('.wl-rankrow').count()==2
            assert '样本榜' in page.locator('#watchlist').inner_text()
            page.get_by_label('榜单市场').select_option('HK');assert page.locator('[data-key^="missing-HK-"]').count()==12
            page.get_by_role('button',name='必看资产',exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
            before=page.locator('#original').text_content();page.get_by_role('button',name='检查模块更新',exact=True).click();page.wait_for_timeout(150);assert page.locator('#original').text_content()==before
            page.screenshot(path=str(output/f'watchlist-{width}.png'),full_page=False)
            page.locator('#historySelect').select_option('history/2026-09-22/0800.json');page.wait_for_timeout(200)
            assert '历史未冻结' in page.locator('#watchlist').inner_text()
            assert '100' not in page.locator('.wl-table tbody tr').filter(has_text='Bitcoin').locator('.wl-value').inner_text()
            assert not errors, errors
            results.append({'width':width,'layout':'pass','favorites':'pass','rank-N':'pass','historical-no-lookahead':'pass','main-report-preserved':'pass','pageErrors':errors})
            context.close()
        browser.close()
    (output/'browser-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False,indent=2))
if __name__=='__main__':run()
