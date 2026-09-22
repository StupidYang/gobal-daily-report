# GDR 报告契约 · schemaVersion 5 / terminal-r1

适用于全天主干、亚洲开收盘、美股开收盘三类任务。调度不在本文修改。页面、任务和校验应共享这一契约；历史报告兼容展示，不为新 UI 伪造或补写旧数据。

## 产品目的

- 30 秒：知道当前主线、最重要的变化、下一个已确认事件。
- 3 分钟：恢复滚动 24 小时脉络，了解判断为什么修订。
- 深入阅读：查看完整分析、事实范围、时间、来源和替代解释。

每个指标/图表/统计必须回答明确问题。不得生成装饰性曲线、可靠性评分、模型自评胜率或确定性买卖信号。

## 三层内容必须同时保留

1. 当前完整状态与分析：不能要求用户看过前一轮。
2. 滚动 24 小时演化：读取期间各个可用历史快照，不能只比较首尾。
3. 最近增量：与最近一次实际发布快照比较，不能机械假定间隔正好四小时。

节点任务的聊天通知可以简短，但写入 latest 的 JSON 必须仍是一份完整报告。沿用的内容保留旧的数据时点和核验时间，并注明沿用；不得用一段增量覆盖掉完整详报。

## 字段兼容

继续使用 schemaVersion=5，不改现有字段类型。保留 reportId、updatedAt、reportMeta、marketState、overview、period、recentPeriod、rolling24hSummary、evolution24h、changes、recentChanges、canonicalFacts、metrics、marketCoverage、worldEvents、analysisTheses、judgmentRevisions、dataDefinitions、assets、coreAnalysis、macroEvents、news、deepDive、narrativeTriggers、events、watch、sources、methodology。

新增可选 brief：建议 20–40 个汉字的主线标题。brief 不能替代完整 overview。marketState 使用简明中文，不堆叠几个英文长句。

metrics 使用 factId 引用事实，可设置 primary；建议 4–6 个重点，不为凑数添加。页面会按资产类别合并，并硬性限制最多六组。白天偏 A/H 股，晚上偏美股；BTC、油金和全球宏观始终保留在完整报告中。

## canonicalFacts：单一事实源

每项至少含：

id、label、displayValue、rawValue、unit、scope、window、asOf、verifiedAt、dataStatus、marketState、direction、impactTone、sourceIds，以及必要的 disclosureNote/evidenceNote。

- rawValue 只能是有限 JSON 数字或 null。空白、未知不是 0；“超过 87,000”不是精确的 87,000。
- 报告生成时间 updatedAt，不等于数据时间 asOf，也不等于来源核验时间 verifiedAt。
- asOf 有明确时点时使用完整 ISO +08:00 或 YYYY-MM-DD HH:mm[:ss]。未知为 null；“附近”“纽约盘”等放进说明，不伪装成准确时刻。
- verifiedAt 只在本轮实际读取并核对该证据后更新。沿用旧记录不得批量盖上当前时间。
- direction 表示该数字相对所述基线的方向；impactTone 才是分析层影响。收益率下降不因利好科技而标成上涨。
- dataStatus 使用 live / complete / closed / delayed / stale / partial / missing / error / window-unclear / unknown。live 仍只是采集时快照，不表示网页实时订阅。
- 市场交易状态与数据质量分别描述。休市不等于读取失败；已检查无新增不等于缺少数据。

### 可比图表所需元数据

对确实可核验的数值补充可选字段：

- seriesKey：稳定的指标身份，例如 BTC-USD:spot、NASDAQ:composite、US-TREASURY:10Y。
- valueType：price / index / yield / return / flow / count / probability。
- contract：期货必须标明实际月份，例如 2026-11；不能只写“近月”。非期货可为 null。
- changeValue、changeUnit、comparisonBasis：有可核验变化基准时填写。百分比用 %，收益率变化用 bp，概率/占比差用 pp，三者不混用。
- tradingDate、sourceDataAt：有实际来源信息时填写，未知不猜测。

同一 seriesKey 的 valueType、unit、scope 不得漂移。指数点位 27122.09 和日涨幅 2.26% 必须使用不同指标身份，不能共享“收盘价”身份。不同月份原油合约分别存储。ETF 净流量属于 flow，不画成价格走势。

图表由前端按历史 JSON 计算；任务不负责填造走势图。缺失时点不插值、不补零、不假设旧收盘值每小时都被重新观测。当前前端会排除不兼容记录、去重相同时点，并在超过六小时的观测空档断线。

跨资产同基线图必须有共同的实际数据时点及每条序列至少两次有效观测。没有共同基线时显示数据不足，不能各自找不同时间归零后伪装成同一窗口。稀疏快照不能证明领先/滞后，更不能证明因果关系。

### 特别口径

ETF：部分披露只写“已披露基金净流量合计为 X；部分基金尚未披露，最终全市场净流量待确认”。未报基金可能为负，禁止“至少净流入 X”。完整初值与后续修订应明确区分。

清算：总额、多头、空头分别存储，明确是 BTC 单币还是全加密市场、滚动窗口起止或精确截止时间。窗口不明用 window-unclear。总额不能与空头额互换。

OI：BTC OI 与全市场 OI 不混用；美元名义 OI 增加可能包含价格重估，不能单独证明净资金流入或多头增加。

## 时间线、未读与判断账本

- eventAt：实际事件时点；不确定时为空，并说明时间精度。
- firstSeenAt / recordedAt：本站首次收录或本轮记载的时间；不要把它充当事件发生时间。
- evolution24h 旧版 at 可以继续保留，但不得回填猜测的事件时间。
- events 中“时间待定”必须保持待定，不填午夜零点制造确定性倒计时。
- judgmentRevisions 使用稳定 id/topic；保留 previous/newEvidence/revised/unresolved/status/firstSeenAt/updatedAt/evidenceFactIds。
- 支持、削弱、证伪、待验证是判断状态，不是交易盈亏。统计只对本报告收录主题去重计数，不声称覆盖所有历史或具有预测胜率。
- 未读由用户明确标记。新报告不能在后台被自动算作已读。

## 分析与证据

analysisTheses 分别填写 observed、interpretation、alternatives、validation、confidence、evidenceFactIds、sourceIds。共同发生只支持候选解释，不自动构成因果证明。缺数据时降低解释强度，而不是加强语气。

coreAnalysis 保留 mainTheme、expectationGap、divergence、regime、priceIn、bullCase、bullInvalidation、bearCase、bearInvalidation。priceIn 区分已发生事实、市场隐含预期、仍不确定结果；未公布不等于未定价。

验证条件应有周期/基准。“站稳”注明小时/日线收盘；“放量”说明比较基准；“广度”提供上涨下跌家数或其他明确统计。没有证据就不使用这些定性结论。

sources 尽量指向具体材料，包含真实来源数据日期、核验时间和短证据说明。旧报告仅是本站过去的记录，不是独立事实来源；发现历史口径错误要保留修订记录，不把旧错误滚动复述成新事实。

全球时事 worldEvents 独立保留中国、美国及其他地区重要事件，summary 与 marketImpact 分开。新闻未造成价格变化也可以重要；不能把每条新闻强行塞进同一个涨跌故事。

## 最低覆盖

marketCoverage 始终保留 A股、港股、美股、BTC、黄金、原油。A股需主要宽基、成交、广度、板块与政策；港股需恒指/恒生科技、成交、主要板块/科技股、南向最近可用数据与时点；美股需指数/期货、行业/广度、VIX；BTC需价格、OI、费率、清算、ETF披露；宏观包含美元、人民币、美债2Y/10Y和央行政策。拿不到的项明确缺失，不静默删除。

重大宏观发布优先实际/预期/前值/修正值、发生与公布时间、首轮市场反应；无法确认一致预期或分钟级反应时直接说明缺口。未来12–24小时列事件与A/B重定价情景，不提供个性化买卖指令。

## 发布协议与边界

自动任务只写 data/latest.json、history/YYYY-MM-DD/HHmm.json、data/history-index.json。禁止修改 index.html、assets、CSS、JS、测试及文档。

1. 写前重新读取 latest 与 history-index 及最新 blob SHA。比较报告数据截止时间；旧任务不能覆盖更晚报告。
2. 历史先写，latest 后写，再用重新读取的索引做合并、去重、按时间排序；保留最近至少60份索引。
3. SHA冲突时重新读取并判断新旧，最多重试一次；不盲目覆盖。即使旧任务被跳过，索引不能把旧条目排在更新版本之前。
4. 结构验证：JSON可解析、引用存在、关键字段完整、deepDive.analysis非空、数据类型/单位不漂移、ETF/清算措辞正确、首屏不堆砌、港股未缺席。
5. 写后读取历史和latest核对。当latest仍指向本轮时，两者内容SHA必须一致；若已被合法更新报告替代，应报告“本轮历史已保存，首页已有更新版本”，而不是回滚或误报内容损坏。
6. 文件写入结果、GitHub Pages发布状态、浏览器显示是不同阶段。没有工具成功结果不能声称写入成功；仓库提交成功也不能冒充线上已验收。

这是任务应执行的写入协议，不是数据库事务或已部署的锁服务。验证脚本和测试只校验已实现的结构/展示规则，不保证新闻真实性或外部服务永不失败。

## 本次迁移原则

仅上线阅读层与图表/统计逻辑。旧快照缺少可比较元数据时正常降级，不修改历史数字或伪造先前不存在的采样。未来任务逐轮采集真实元数据后，图表会自然具备更多可用观测。
