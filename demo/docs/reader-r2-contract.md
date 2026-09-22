# GDR reader-r2 补充契约

与 `docs/report-contract.md` 一起读取。继续使用 `schemaVersion=5`；新报告填写 `reportMeta.contractVersion="reader-r2"`。本文件补充新闻、白话影响、首屏与框架字段，不删除基础契约中的市场覆盖、事实口径、历史与发布约束。

## 一、明确产品目的：首屏简洁，正文丰富

PC 首屏是结论页，不是缩小字号后的整篇日报。依次回答：当前结论是什么、主要影响谁、最近三件关键变化、下一个需要重新评估的节点。页面只展示最多六组核心指标，同类指数合并。

详报是资料库：白话影响、中国/美国/全球时事、24小时演化、观测曲线、多框架判断、原有A–G分析、分资产详报、宏观数据、事件雷达、来源与数据质量全部保留。默认折叠不等于删除，不得为了首屏清爽缩减 JSON 的正文、资产范围或新闻总量。

节点任务的通知可以简短，但写入 latest 的报告必须完整，不能以局部快讯覆盖主干。没有重大新增不等于删掉24小时内仍重要的内容；沿用内容保留原始时点并标明沿用。

## 二、白话影响与自己的结论

新报告增加 `plainLanguage` 对象：

- verdict：20–45个汉字左右，直接给当前综合判断，不用英文标签代替结论。
- bottomLine：一至两句话解释“所以怎样”，首屏建议80字以内；详细推导放后面。
- whyNow：本轮哪些证据最重要。
- horizon：判断的适用时段，例如未来12–24小时；短期行情与数周的社会/成本传导分开。
- confidence：low / medium / high，可用 medium-low / medium-high；不是经过统计校准的胜率。
- invalidation：最重要的改判条件，说明看什么周期或数据。
- evidenceFactIds、sourceIds：引用本报告真实证据。
- impacts：逐项覆盖A股、港股、美股、BTC、黄金、原油；有意义时补人民币、行业、企业、普通居民。

impacts 每项：asset、effect、reason、takeaway、horizon、counterRisk、invalidation、confidence、evidenceFactIds、sourceIds。effect 用“短线偏利好 / 偏利空 / 分化 / 中性 / 证据不足”等白话；不能只给箭头。takeaway 是明确标识为推断的“我的判断”，不是新增事实。

必须回答：对谁有影响、通过什么渠道、影响多久、为什么未必按这个方向走。上涨本身不证明利好成立；价格方向、基本面影响和买卖建议是不同概念。不输出个性化交易指令或收益承诺。

例如利率下降：对成长股估值可能是顺风，但如果原因是衰退预期，盈利下修可能抵消。黄金关注实际利率，不能拿名义10Y变化直接代替实际利率。

## 三、多框架交叉判断

新增 `frameworkAnalysis` 数组，通常选择3–6个与本轮证据真正有关的框架。数量是建议，不适用的框架注明不适用，不强凑。

每项至少：

id、framework、concept（用一句白话解释）、applicability、observed、mechanism、conclusion、assumptions、counterEvidence、horizon、invalidation、confidence、missingData、evidenceFactIds、sourceIds。

参考 `docs/analysis-frameworks.md`，可选：现金流折现/利率传导、预期差/事件研究、市场微观结构/融资流动性、供需/库存/风险溢价、证据更新/情景分析、政策传导/分配影响等。框架名必须真实；“方法”不要伪装成有权威背书的定律。

每个框架都要输出本轮结论及边界，而不是背定义。风险资产一起上涨只是一组观察，不自动证明完整因果链。不要给BTC套股票DCF；不要把美元OI增加直接当净资金流入；不要把同一来源重复当多条独立证据。

新增 `frameworkSynthesis`：verdict、agreement、disagreement、weighting、invalidation。要说明哪些框架支持、哪些反对、为什么更看重某些证据。禁止用“4个理论看多所以80%胜率”、任意打分或假贝叶斯概率。没有事前概率与可检验似然，只做定性证据更新。

原有 analysisTheses、judgmentRevisions、coreAnalysis、deepDive 保留；新框架不是替代它们。

## 四、新闻总量做加法，金融分析不减量

新增 `newsroom`，独立扩充中国、美国和全球综合时事。不是把原来的宏观新闻重新分三组，也不是通过减少财经内容提高时事占比。

以滚动24小时为窗口，通常争取收录18–30条有实质内容、能核验且不重复的事件；中国/美国/全球其他地区分别认真检索，可各约6–10条作为覆盖目标。重大新闻日允许更多。数量不是硬KPI：实际不足必须说明缺口，禁止用旧闻、重复稿、无信息价值的小事或虚构填数。

在可核验新闻允许时，至少约一半为非纯金融市场新闻：公共政策与社会民生、外交与安全、法律与司法、科技与科学、教育、公共卫生、气候与灾害、基础设施与公共服务等。市场暂时没反应的重大社会事件也保留，不强行编成涨跌原因。

新闻更新按事件去重并保留过程。新一轮不是“新增30条”的任务；应保留窗口内的重要事件，更新最新进展，明确新增/进展/修正/背景，避免每轮重述。过期背景可另作说明，不当本轮新消息。

`newsroom`：

- windowStart、windowEnd：新闻观察窗口，完整UTC+8时点。
- coverage：分别说明CN/US/WORLD查了哪些类别、截至何时、实际缺什么。可为结构化对象。
- items：完整事件数组，不为首屏分页限制而裁掉正文。

每个 items 对象：

- id / eventId：稳定事件ID；同一跨国事件只有一条，regions允许多值。
- regions：["CN"] / ["US"] / ["WORLD"] 或组合。WORLD表示全球其他地区；不是所有新闻都机械打三个标签。
- kind：general / market。general用于非纯金融综合时事。
- category、priority、title。
- eventAt、publishedAt、updatedAt、firstSeenAt：分别记录发生、发布、最新进展与本站首次收录；不确定为null并说明，禁止编整点。
- updateType：new / developing / corrected / background。
- summary：事实是什么，直接清楚地解释。
- affectedGroups：直接受影响的人群、行业或地区。
- plainImpact：普通人能理解的影响，含短期和长期区别。
- assessment：我的综合判断，明确与事实分开。
- marketImpact：与市场有关才解释传导；没有明确证据就写“暂无直接市场影响证据”。
- counterRisk、nextWatch、horizon、confidence。
- sourceIds、必要时evidenceFactIds。

重要、争议或重大突发优先官方材料加可信独立报道交叉核验；确实只有单一来源时明确标注。来源应尽量定位具体文章/通告，不是只挂网站首页。

worldEvents 继续保留；同一事件在 worldEvents 与 newsroom.items 使用相同id，前端合并展示，不重复计算条数。原 `news` 财经时间线也保留，支持body/summary。

定时任务每轮重新查最新新闻，页面只读取已发布快照。不得自称分钟级实时新闻直播，也不增加后台隐形采集任务。

## 五、可比较曲线：不是等一轮就保证出现

维持基础契约的seriesKey/valueType/unit/scope/contract/asOf等规则。一个有效点能显示点，两个不同数据时点的同口径点才可能连线；超过六小时的观察空档断线。跨资产相对走势需要至少两个不同资产各有两次观测，并共享实际数据时点作为基线。

原始数值、涨幅百分比、收益率、资金流不能混连。“超过87000”不是精确87000。禁止把同一收盘报价在每份报告的生成时刻重复画成新点。没有精确数据时间就说明缺失，不改写历史让图好看。

前端显示样本诊断：缺数值、缺时点、状态不适用、单位或合约不明确、来源引用不存在、超出窗口。图表变化不等于实时价格变化。

## 六、发布前必须检查

保持 `docs/report-contract.md` 发布协议：写前读取最新SHA，旧报告不可覆盖新报告，历史先落盘，再latest，再读取索引合并；冲突最多重试一次。合法更新版本抢先发布时停止覆盖，不回滚。

r2新报告自检：

1. 基础字段与原有六类资产详报均在；schemaVersion仍为5，reportMeta.contractVersion为reader-r2。
2. plainLanguage结论、六类资产影响、frameworkAnalysis、frameworkSynthesis、newsroom.items与coverage类型正确；每个事实/来源引用存在。
3. 一条新闻是一件真实事件，多地区计数不等于多条新闻；分类、事实、影响、个人判断、发布/发生时间分开。
4. 没有为新闻目标降低财经深度，也没有为丰富内容捏造来源或数值。
5. ETF部分披露、清算多空与OI口径仍严格区分；沿用资料不虚假刷新verifiedAt。
6. index只做真实时间排序和去重；最新快照与对应历史内容在本轮仍为latest时一致。
7. 若可执行本地脚本，运行 `node scripts/validate-report.cjs data/latest.json`；工具环境不支持执行时逐项自检并说明，不能说“脚本通过”。

自动化只允许更新data/latest.json、history/YYYY-MM-DD/HHmm.json、data/history-index.json；不得改本文件、index.html、assets或手工解读补注。

## 七、推送结构

首先给白话结论、影响指向、最近变化、下一节点。随后给完整24小时演化、分地区时事（增加总量）、分资产详报、A–G、多框架综合判断、风险与情景观察。页面折叠解决长度问题，不靠删除内容解决。

不改变三个任务调度，不新增午间节点，不移除每四小时主干。主干负责全量重建，亚洲/美股节点负责重点验证与新增采集，但各次Dashboard仍完整。外部服务失败要如实报告；提示词不是已部署的事务锁，结构测试不证明新闻真实性。
