# 模块契约 · modules-v1

本契约优先约束新7角色。旧report-contract与reader-r2-contract继续规定综合报告内容；其中“三个任务都写latest”的旧描述已被本模块所有权表取代。schemaVersion=5不变，独立数据模块moduleVersion=1。

## 所有权与时间

automation/manifest.json是唯一角色/调度/提示词路径清单。AI只向本角色data/inbox提交候选；代码发布器按角色ownedPaths更新modules/runs，只有完整synthesis候选可更新报告。角色划分不意味着所有任务严格按顺序完成；时点错开只是降低碰撞，综合报告必须能使用带日期的旧模块或明确缺口。

包络示例（结构示例，不是实时数据）：

```json
{
  "moduleVersion": 1,
  "module": "quotes",
  "runId": "20260922T124012-quotes",
  "generatedAt": "2026-09-22T12:40:12+08:00",
  "dataAsOf": null,
  "status": "missing",
  "inputVersions": {},
  "sources": [],
  "payload": {"items": [], "note": "尚未接入数据；这不是价格为零"}
}
```

status允许ok/partial/missing/error/no-change。generatedAt是生成时间；dataAsOf不是所有项目同步新鲜的承诺。每个数值仍有asOf、sourceIds和范围。sources为本包局部命名空间，至少id、真实http(s) URL、实际verifiedAt；关键新闻需原文。综合任务重命名引用时使用`<module>:<sourceId>`和`<module>:<factId>`，不能只改数组不改引用。synthesis.payload.report拥有独立sources目录。

## 报价 items

instrumentId必须与config.required一致。price有限数字或null；displayValue保留“超过”等文字；changePct为百分比数值（1.5表示1.5%，非0.015），comparisonBasis说明24h/官方前收等，currency、asOf、status、sourceIds、contract、note必须明确。原油contract为YYYY-MM，不能用front/近月；不同合约不拼接。单位、ticker、股类和交易所是身份的一部分。

required是展示与采集清单，不是数据供应承诺。没有授权或网络不可用时显示待采集。USD/CNY与USD/CNH、美元指数与美元货币并非一个指标；币种和方向不混淆。HYPE为Hyperliquid现货，PEPE要保留足够精度。

## 板块 groups

```json
{
 "id":"电子","name":"电子","market":"CN","classification":"SW2021-L1",
 "asOf":"2026-09-22T12:00:00+08:00","tradingDate":"2026-09-22","session":"regular",
 "currency":"CNY","comparisonBasis":"previous-official-close",
 "universeScope":"sample","expectedCount":null,"membershipSourceId":null,
 "rows":[]
}
```

每证券instrumentId、symbol/name、price/changePct、currency、asOf、tradingDate/session/comparisonBasis、volumeRatio20d/turnoverPct/valueTraded、volumeBaseline、avgDailyValue20d、listingDays/isST/suspended、sourceIds、catalyst。

- 热度：同组可打分样本内量比分位50% + 换手率分位30% + 成交额分位20%。这是透明的产品排序启发式，不是学界标准或预测准确率。并列用平均分位，ticker确定展示顺序。
- 弱势：同组涨跌幅减样本中位数，升序取N。全部上涨时弱势可能仍涨，不能写成跌幅榜。
- 同一股票可同时热和弱。关注度大不等于看涨。
- N默认5，可在配置与UI调整1–20。不是从样本首尾随意截取。
- 排名检查同币种、交易日、盘前/常规/盘后、前收基准，数据时点差不超过15分钟。
- ST/停牌、上市不足20日、流动性不达标或基准未知按配置剔除。流动性用20日平均成交额，不拿开盘5分钟累计金额与全天比。
- volumeBaseline只有真实过去20交易日相同已交易时长才能填`20-session-same-elapsed`。缺量比/换手不生成热度，不能换成涨幅排序。
- 只有声明full-sector、真实expectedCount与输入唯一成员数量一致且有membershipSourceId才显示“全量成员筛选榜”。这仍不是代码独立验证成分来源真实性。
- 数据源仅有少量已查股票时必须sample；程序会显示observed/expected/eligible/scorable/排除原因。不能把候选池完整称为全市场完整。

A股默认31个SW2021-L1行业标签；港股默认12个HSICS大行业。实际成分及分类版本由有权限的数据源提供，仓库不附未经授权的全量成分库。US的technology/investment为可编辑候选池，不声称行业完整覆盖。

## 公司研究 records 与 checks

record包含instrumentId/eventKey/eventType/period/documentId/documentUrl/publishedAt/sourceHash/analyzedAt/sourceIds/analysis。analysis至少conclusion，可含plainImpact/evidence/guidance/valuation/risks/invalidation。财报差异比较只用有来源的一致预期，GAAP/non-GAAP分开。券商研报只读摘要就标摘要，不伪装全文。

eventKey对应具体材料身份和版本；同key复用原分析及日期。新财报、指引、重述、重大公告、新研报、证伪事件产生新key。发现事件但没分析，checks写pending而不是假称已完成。checks不重写analyzedAt。旧估值必须保留valuationAsOf，不能随着新报价自动变成有效现价分析。

研究预算默认每轮最多5家新分析；pendingQueue明确尚未处理的公司。默认120天提示旧研究，但原文保留。这个阈值不是自动重做财报的触发器。复用旧records同时必须保留它们的sources；同一sourceId不得悄悄改成其他URL。

## news、macro 与 synthesis

news.payload.newsroom保持reader-r2结构和非财经扩容目标，财经资料不因此减少。macro.payload包含canonicalFacts/macroEvents/events/fundingNotes/coverage。synthesis.payload.report必须是完整schema5+reader-r2报告，不能只输出合并后的空标题；报告引用实际模块run path和时点。

历史浏览时，只有reportMeta.moduleRefs提供合法`data/runs/<role>/<runId>.json`且generatedAt不晚于报告时点才可展示；缺引用宁可提示缺失，不能读取今天的模块给昨天报告。

## 本地与GitHub的不同保证

`node scripts/gdr.cjs ingest candidate.json`提供本地互斥、不可变run、幂等、旧结果不回退指针；`publish report.json`提供本地历史先写、latest提交标记、回读校验。它不是跨机器数据库事务锁。

ChatGPT GitHub连接器没有自动执行Node的保证，须按同一契约先validate再写；无执行环境则按规则检查，不能冒充已跑脚本。CI是写入后结构回归，不保证所有新闻真实，也不是预发布拦截。远程部署继续依赖连接器的实际写权限、GitHub/Pages和平台配额。
