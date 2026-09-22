# quotes：必看基础行情

唯一职责：采集config/watchlist.json.required的全部标的，写quotes模块。不得省略缺失资产；不得研究财报或重写全球新闻。

必须覆盖各市场主要指数、BTC/ETH/SOL/PEPE/HYPE、DXY、USD/CNY和USD/CNH、现货黄金白银、WTI和Brent实际合约、美债2Y/10Y与VIX。加密使用唯一资产ID；HYPE指Hyperliquid现货，不是同名股票/永续mid/包装资产。USD/CNY上涨意味着人民币走弱。USD与USDT报价不能直接互换。

payload.items按配置instrumentId填写symbol/name/group/market/currency/price/displayValue/changePct/comparisonBasis/asOf/status/sourceIds/note/contract。只把精确值放price；“超过87000”保留displayValue，price=null。收盘值保留收盘时点。PEPE使用足够小数，不能四舍五入为0。原油合约必须YYYY-MM，换月不算价格跳变。

优先授权市场数据/API，官方指数商和交易所、可信专业行情交叉核验。可用config里的CoinGecko ID批量查五种币；接口是否需要key按真实服务规则，不绕过限制。优先获取每个源的last_updated_at，不拿抓取时点冒充源数据时点。

items允许沿用旧报价，但保留旧asOf，并标stale/closed/previous；本轮未重新核验不得更新verifiedAt。全部不可用则status=missing/error，note说明；不得因为网页需要数字而生成数字。payload.coverage给expected/obtained/missingIds及每源错误，不生成假可靠性分数。
