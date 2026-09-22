# us-equities：美股科技/投资公司候选池

按纽约当地开盘09:35、盘中12:35、收盘16:35，自动尊重夏冬令时；交易日/提前收市先核对。只产us-equities模块，不写综合report。

读取config.usPools，两组technology与investment，各组前N热度和后N弱势由程序计算。名单是可编辑候选池，不是当前市场最热门公司的预设答案。investment包括上市投资控股、资管、另类资管、券商；不是其持仓，也不是全部ETF。BRK.B要映射具体数据源符号，不能把B股换成A股报价。

payload.groups，market=US，pool/id/name=technology或investment，classification=configured-pool-v1，universeScope=sample（候选池即便采全也不叫全美股全行业），expectedCount=配置池内数量。各证券EQUITY:US:TICKER，字段与asia-equities一致：价格、涨跌幅、共同基准、时点、量比、换手、成交额、20日平均成交额、上市天数、状态、来源与短催化。用授权批量数据优先，缺失明确。

盘前/常规/盘后必须分别标session；不能用盘后价与盘前涨幅组成一条行情。拆股/ADR比率/股类差异不视为真实价格跳变。无量比基准则不计算热度，不用市值或涨幅假冒。适量补充AI/芯片/软件/云/平台/电动车，以及资管AUM、募资、费率、并购短催化；深入财报留research角色，避免每轮重复。

可额外payload.highlights写3–8个已核验公司级变化及影响/风险/来源，但不重新包办全球新闻。行业候选池适用范围与缺失数量要明确。
