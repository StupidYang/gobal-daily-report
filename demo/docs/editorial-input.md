# 原生任务分析输入契约（editorial-v1）

读取 runtime/results 中的本轮 packet 和 deadlineAt 后，才编写分析。首次提交 `runtime/submissions/<executionId>.json`；不要自己生成七份模块或修改任何原始记录。

## 必须一致的名称与结构

- `editorial.packetHash` 必须等于结果文件中的 packetHash；`analyzedAt` 是实际分析结束时点。
- `report.frameworkAnalysis` 每项使用 `framework`（框架名称）、`concept`、`observed`、`conclusion` 及适用性、机制、前提、反证、周期、改判条件和证据。历史同义字段 `name/principle/facts` 只做无损映射；缺结论不会被自动补出。
- 新闻只放 `editorial.newsItems`，每项必须包含 `eventId`、`title`、`regions`（CN/US/WORLD数组）、`kind`（general/market）、`summary`、`plainImpact`、`assessment`、`sourceUrls`。不能以摘要冒充影响和判断。每项保持实际来源时间与独立事件ID。sourceUrls应优先引用请求前发现并被本轮documents实际抓取的具体文章/公告；Yahoo/Coinbase等行情URL只能支持“行情观察”，不能据此宣称完成外部综合新闻。
- 六份 `report.deepDive` 分别覆盖A股、港股、美股、BTC、黄金、原油，包含独立analysis、mechanism、risk、invalidation、horizon和证据引用。旧样例只参考格式，不是本轮分析材料。
- `report.evolution24h` 每个节点应有实际 `at`（或真实事件时点）并引用 `evidenceFactIds` / `sourceUrls`；它表示离散快照的演化，不得用报告整点补造缺失时段。`changes/recentChanges` 的事实变化也应尽量引用证据。
- 外部引用使用已获取来源的 `sourceUrls`；报价事实编号使用 packet.rows 的 instrumentId。不要手写 sourceIds 或捏造来源。
- 全局任务输出全部七模块；区域任务由代码输出 **quotes + 本区域股票 + news + synthesis**，另三个输入引用已发布历史。这样本轮实采报价不会被旧指针替换。
- 区域任务没有新增新闻时 newsItems 可以为空。仍在窗口且字段完整的旧新闻保留原始时点；不完整历史新闻单独保留为“待复核历史新闻”。不可为填补历史缺字段而猜地区、类型、影响或判断。
- `editorial.newsCoverage`如实写status/note/regions/gaps。代码会再根据实际sourceIds派生active/general/market/externalVerified/marketDataOnly/regionCounts；如果正文声称complete但只有行情源、或CN/US/WORLD实际事件缺席，complete声明会被降级并由content-r3拒绝假完整。18–30条是滚动窗口目标，不是每小时新增配额。
- 公司研究默认会把已发布历史records计为已有覆盖，不再因为“本轮没重做”就把同一公司塞进pendingQueue。只有发现了新材料但本轮来不及研究时，才可提供可选的 `editorial.researchPendingQueue` 明确列出对象和原因；旧研究继续保留原analyzedAt。
- `editorial.researchChecks`只记录本轮实际完成的材料检查：每项至少有instrumentId、checkedAt、status/result和说明，`no-new-material`必须有本轮成功取得的SEC/交易所/IR材料依据；来源抓取失败应写失败/待检查，不得伪装成已确认无新增。深度复核优先轮换最多5家公司，普通小时可为空。pipeline会保留旧检查的原checkedAt，不把普通空轮次改成今天已检查。
- 宏观/资金允许提供可选 `macroFundingNotes` 与 `macroCoverage`。`editorial.events`承载未来12–24小时事件雷达，global-main每轮必须基于本轮实际抓取的官方日历证据填写；日历文档使用`kind=calendar`。精确时点未知时`at=null`并保留时间待定说明，禁止编整点。若核验后确实没有值得展示的事件，`events`可以为空，但`report.sectionGaps.events.reason`必须写清核验范围和空缺原因；否则新报告会进入`needs-revision`。宏观按facts/releases/radar/funding分别保留：某类没有新证据时可沿用24小时内上一份来源支持项目，并保留item/lane retention原始锚点；新日历不能清空合格资金事实，也不能续期旧数据。显式events=[]表示本轮已检查空雷达，会清除旧雷达；缺失雷达只可保留尚未过期的原事件。混合新旧输入不制造共同dataAsOf。超过24小时的旧证据不自动沿用。

## 一次可修正交接

代码返回 `needs-revision` 不是发布成功。立即读取 `issues` 和结构化 `validationIssues`，一次处理本轮已经列出的全部独立错误，并在**原 deadlineAt**之前创建 `<executionId>--r1.json`，仍使用原执行令牌与 packetHash。不得修改首次提交文件、续租、重采集或创建新调度任务。最多一份修订；修订仍不合格则返回终态 `editorial-rejected` 并释放执行锁，本轮未发布。修订不得为过门禁伪填字段、改造来源日期或删除原始证据；无法有依据地完成的内容必须如实说明。

当返回 `submitted-not-published`，只能说明候选已提交。只有正式回执为 published，并核对网页实际版本后，才能说发布成功。失败的原始输入留存，用于复现；不要删除它们来制造成功率。

## 精确输入结构与前置校验

此处给出原生交接直接需要的字段类型；无需根据旧报告或字段中文含义猜 JSON 形状。`对象[]` 表示数组内每项都是对象，不接受字符串数组或以市场名称为键的对象。字段为非空字符串时，不能用数组、对象、null 或空串代替。完整内容要求仍遵守 `report-contract`、`reader-r2`、`modules-v1` 和 `content-r3`；下表不会降低分析、来源或发布门禁。

最外层提交是 `{ "execution": { "executionId": "本轮原值", "generation": 1 }, "editorial": { ... } }` 的结构。示意中的文字和数字仅解释类型，实际值必须从本轮结果复制；revision 继续使用原令牌，不生成新 executionId。

### editorial 顶层

| 字段 | JSON 类型及规则 |
| --- | --- |
| `packetHash` | 本轮不可变 packet 的完整 SHA-256 字符串，必须与结果一致。 |
| `analyzedAt` | 实际分析结束时间字符串，带 `Z` 或 `±HH:MM`；不得早于本轮采集开始或晚于当前时间。 |
| `report` | 完整报告正文对象，详见下表。代码生成 reportId、updatedAt、reportMeta、窗口、sourceIds 与模块引用。 |
| `newsItems` | 新闻对象数组，可为空；每项包含 `eventId`、`regions`、`kind`、`title`、`summary`、`plainImpact`、`assessment`、`sourceUrls`。稳定ID历史别名 `id` 兼容。 |
| `newsItems[].regions` / `.kind` | regions 为 `CN/US/WORLD` 组成的非空字符串数组；kind 只允许 `general` 或 `market`。采集计划的 `official/research/calendar` 不能填在 news.kind。 |
| `newsItems[].publishedAt/eventAt` | 真实来源时间字符串或 null；保留 `sourceDateText`、`dateUncertainty`。缺少明确时区、过期或未来材料保留为背景，不计入24小时覆盖，不猜补时间。 |
| `newsCoverage` | 建议对象：status、note、regions、gaps；旧的说明字符串仍兼容。regions 可为地区说明对象或地区数组。代码独立计算实际覆盖。 |
| `macroFacts` | 事实对象数组；每项有唯一非空 `id`，引用实际来源。数值必须是有限数字或 null，`asOf` 为有效精确时点或 null。 |
| `macroEvents` / `events` | 对象数组。events 是已核验的未来事件雷达；未知具体时点写 `at: null` 并说明。global-main 空雷达须给 `report.sectionGaps.events.reason`。 |
| `macroFundingNotes` / `macroCoverage` | 前者为文本或对象组成的数组；后者为覆盖说明对象。 |
| `retainedMacroFactIds` | 可选非空字符串组成的数组；每个ID必须对应仍有效的上一宏观事实。仅由代码保留原事实与原来源。 |
| `researchRecords` / `researchChecks` / `researchPendingQueue` | 公司研究对象数组，分别见后文。无本轮新材料时可为空，历史研究由代码保留。 |

所有层级的 `sourceUrls` 必须是 http(s) URL 字符串数组。新引用必须在本轮 packet 中同时具有：成功的 HTTP 200 回执、有效哈希与取得时间，以及与 URL/哈希/时间全部匹配的已解析行情或 `contentRetrieved=true` 文档。只有 HTTP 200、历史来源目录、失败解析、搜索结果标题或未匹配回执都不构成可引用证据。前置检查会列出每个失败引用的具体路径，包括同一 URL 出现在多个段落的情况。

`factIds` / `evidenceFactIds` 为非空字符串组成的数组，`factId` 为字符串或 null；行情引用使用实际 instrumentId。代码会继续核对报告最终实际绑定的事实目录，不能以原始包里一条未绑定的区域行情替代冻结模块。外部作者使用 sourceUrls，不手写旧 sourceIds。

### report 正文

| 字段 | JSON 类型及规则 |
| --- | --- |
| `overview` / `rolling24hSummary` / `methodology` | 各为非空字符串。 |
| `coreAnalysis` | 对象，包含九个非空字符串：`mainTheme`、`expectationGap`、`divergence`、`regime`、`priceIn`、`bullCase`、`bullInvalidation`、`bearCase`、`bearInvalidation`。 |
| `plainLanguage` | 对象，包含非空 `verdict/bottomLine/whyNow/horizon/confidence/invalidation`，以及 `impacts` 对象数组。 |
| `plainLanguage.impacts[]` | `asset` 覆盖 A股、港股、美股、BTC、黄金、原油；每项非空 `effect/reason/takeaway/horizon`，并保留反证、风险与证据。 |
| `marketCoverage` | **对象数组**，每项 `market` 为市场名称，六类资产全部出现；其余字段写该市场实际覆盖与缺口。不能写成 `{ "A股": "说明" }`。 |
| `assets` | 对象数组，保留六类资产概览及各自时点、状态、判断和证据。 |
| `deepDive` | 六份独立资产对象数组，通过 `asset/name/market/title` 标明资产；每份有非占位 `analysis/mechanism/risk/invalidation/horizon`，以及实际事实或来源引用。沿用时 `retention` 对象须有原 `reportId/analyzedAt/reason`。 |
| `frameworkAnalysis` | 非空对象数组。每项有 `framework/concept/observed/conclusion`，按 reader-r2 保留适用性、机制、假设、反证、周期、改判条件和证据。已有 `name/principle/facts` 分别兼容前三个字段，不能补造 conclusion。 |
| `frameworkSynthesis` | **固定五字段对象**：`verdict/agreement/disagreement/weighting/invalidation`，各为非空字符串。`conclusion/supporting/tensions/decisionRule` 等名称不等同这五个字段。 |
| `recentChanges` / `changes` / `evolution24h` | **对象数组**，每项有 `title` 与 `detail`。已有 `summary/body/change/name` 按既有规则无损映射。不能使用字符串数组。演化节点保留实际时点及证据。 |
| `watch` | **对象数组**，每项有 `point` 与 `detail`；兼容 point 的 `name/item/title`，detail 的 `why/summary`，或原有 `a/b` 条件。无可核验观察条件时给 `sectionGaps.watch.reason`。 |
| `dataDefinitions` | **对象数组**，每项有 `term` 与 `definition`；兼容 `name/title` 及 `detail/text/explanation`。不能写成术语到解释的对象。为空时给 `sectionGaps.dataDefinitions.reason`。 |
| `narrativeTriggers` | 对象数组，使用 `title/effect`；已有 `trigger/name/summary/detail` 和 `why/text` 等别名按既有规则保留。 |
| `worldEvents` / `analysisTheses` / `judgmentRevisions` / `metrics` | 对象数组；实际没有条目时可为空，不得用文本代替。 |
| `sectionGaps` | **对象**，键是缺口栏目名，每项为含非空 `reason` 的对象，例如 `{ "events": { "reason": "实际核验范围及未纳入原因" } }`。不能使用字符串数组。 |

代码派生的 `canonicalFacts/sources/news/events/macroEvents/reportMeta/period/recentPeriod` 不能拿来覆盖源材料或伪造新时点。最终报告仍执行完整 report/reader-r2/content-r3 校验，前置通过不等于已经发布。

### 公司研究 records、checks 与待办

`researchRecords[]` 必须对应真实公司披露或研究原文。必填：

| 字段 | 类型和含义 |
| --- | --- |
| `instrumentId` | 真实证券身份字符串，例如格式 `EQUITY:US/CN/HK:证券标识`，不能给宏观活动补造证券。 |
| `eventKey` / `eventType` | 非空字符串，标识具体公司事件及事件类型；材料版本变化使用新 eventKey。 |
| `documentId` / `documentUrl` | 非空原文身份与真实 http(s) URL；documentUrl 必须在本轮已取得证据中，并包含在本项 sourceUrls。 |
| `period` | 真实报告期字符串；不适用时显式 null，不猜报告期。 |
| `publishedAt` | 原文发布日期文本；未知时显式 null，不以分析时间代替。 |
| `analyzedAt` | 该次原文分析的真实完整时点，带明确时区。 |
| `sourceUrls` / `sourceHash` | sourceUrls 为非空数组。sourceHash 如提供，只能是真实 SHA-256 或 null；非空哈希必须与该原文本轮回执一致。 |
| `analysis` | **对象**，至少包含非空 `conclusion`；summary 字段或一段字符串不能代替 analysis.conclusion。按实际阅读范围保留证据、指引、估值口径、风险和证伪条件。 |

仅抓到 IMF/央行/宏观会议的日历或活动介绍，不构成已完成公司原文研究。填写 `status: "source-read-event-page"` 也不能绕过 records 必填结构；应如实按日历或待核材料解释实际阅读范围，不补造分析结论、证券身份、事件版本或时间。研究内容不能为通过校验而被自动填充或删除。

`researchChecks[]` 每项有真实公司 `instrumentId`、带明确时区的 `checkedAt`、非空 `status`（历史别名 `result`）和说明 `note`（兼容 `reason/explanation`）。`no-new-material` 必须引用本轮成功取得的材料；未取得来源可以如实填 `source-unavailable/pending` 并写原因，不能写成已确认无新披露。宏观活动页检查不能充当公司披露检查。checks 的身份和时间不可缺失，否则记录合并时可能互相覆盖。

`researchPendingQueue[]` 每项为真实公司 `instrumentId` 与非空 `reason`。已有历史记录、检查时点和来源保持不变；同轮重复公司事件或检查身份会被前置拒绝。

### 校验错误与系统故障

纯接口 `validateEditorialInput(editorial, { packet, now, taskGroup })` 返回所有可独立判定的输入问题，不修改输入。每条为 `{ path, code, message }`，例如 `editorial.newsItems[0].kind`、`editorial.researchRecords[1].analysis.conclusion`、`editorial.report.marketCoverage`。`assertEditorialInput` 在存在问题时抛出 `EditorialValidationError`，固定 code 为 `EDITORIAL_VALIDATION_FAILED`，issues 保存结构化原项。初稿能够同时看见新闻分类、研究缺项、来源错误与报告结构错误，不会只因第一个错误耗尽唯一修订。

文件系统、内部 TypeError、冻结依赖、租约、原子写入和未知异常仍按系统失败处理，不根据消息中出现“rejected”就归类为编辑稿问题。程序只对明确的校验结果列表使用该错误类型。聚合输入校验之后，完整模块、内容和原子发布门禁继续严格执行。

## 2026-10-03 恢复质量边界

新提交新闻必须保留真实来源发布时间或事件时间。无精确时区时间、未来或24小时窗口外材料隔离为历史背景，不计入本轮新闻覆盖，不改写原日期。calendar证据不计外部新闻。报价同一时点的数值冲突保留已发表完整观测；新数值、哈希和来源在latestAttempt中隔离待核，模块标partial，不能当作新行情；币种/合约冲突仍拒绝。

当本轮只更新部分宏观事实而旧事实仍有效时，可用editorial.retainedMacroFactIds明确选择上一宏观模块的事实ID。代码复制完整原记录与原来源，不允许手写旧sourceIds；按原保留锚点限24小时，未知、无有效锚点或过期ID拒绝。当前新事实同ID优先；混合新旧事实不产生共同dataAsOf。


## 来源使用边界（2026-10-03复核）

HKEX网站及其关联网站的用途条款第5节要求程序化访问、公开再分发等用途取得相应书面许可。当前没有此许可的证据，故采集器不再接受其网站域名的自动化文档请求。不要改用同站其他路径、代理或镜像重取同一受限数据，也不要凭历史采集记录声称已有持续使用许可。新报告应明确相应数据缺口；既有冻结历史和原来源记录保持不变，不能删除历史来掩盖当时的采集事实。恢复此类源须先核验合法的数据授权和允许的访问方式。

## 事实 ID 命名空间（2026-10-19 强制）

事实 ID 不是自由文本，前缀决定它被哪套校验接管。写错前缀会让整轮以系统失败结束，而不是可修订的稿件问题。

**冻结行情前缀：只能引用，不能自造。**

`EQUITY:CN:` / `EQUITY:HK:` / `EQUITY:US:` 开头的任何 `factId`、`factIds`、`evidenceFactIds`，只要不出现在本轮 31 项必看报价中，代码就会到 asia-equities / us-equities 的冻结模块里按 `instrumentId` 查找；找不到即抛出 `Referenced equity fact unavailable in frozen modules: <id>`，本轮以 failed 终止，不产生 needs-revision，也没有 `--r1` 机会。

所以这三类前缀下**不得**构造任何衍生事实：

- 反例 `EQUITY:CN:TURNOVER:2026-10-19`（成交额）、`EQUITY:CN:BREADTH:2026-10-19`（涨跌家数）、`EQUITY:US:SECTOR:AI`（板块）
- 反例：给政策、宏观或研究结论套 `EQUITY:CN:` 前缀

其余行情前缀（`INDEX:`、`CRYPTO:`、`FX:`、`METAL:`、`ENERGY:`、`RATE:`、`VOL:`）当前不经过这条冻结模块校验，但它们仍只应引用 packet 中真实存在的 `instrumentId`，不得借来承载非行情内容。

**非行情事实统一使用业务前缀，且全篇唯一非空：**

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `PROP:` | 政策、官员表态、监管动作 | `PROP:PBOC:2026-10-19-FRAMEWORK` |
| `FLOW:` | 成交额、资金流、涨跌家数、市场宽度 | `FLOW:CN:TURNOVER:2026-10-19` |
| `RESEARCH:` | 研究结论、公司事件判断 | `RESEARCH:CN:2026-10-19-REFORM` |
| `MACRO:` | 非行情的宏观数据点 | `MACRO:CN:GDP-2026Q3` |

同一事实在 `facts`、`evidenceFactIds`、`evolution24h`、`deepDive` 之间必须复用完全相同的 ID，不能一处写 `FLOW:CN:TURNOVER:2026-10-19`、另一处写 `CN-TURNOVER-1019`。

**提交前自检**：通读 editorial 里所有 `EQUITY:` 字符串，逐个确认都能在 packet 的 31 项必看报价中找到完全一致的 `instrumentId`；凡属自行拼出的，立即改成上表的业务前缀。

## 事实引用闭合规则（2026-10-20 强制）

编译期 `scan()` 会遍历整份 report，任何出现在 `factId`、`factIds`、`evidenceFactIds` 里的字符串，只要不在**本轮最终 canonicalFacts** 里，就报 `未知事实 <id>`，整轮 `failed / UNCLASSIFIED_ERROR`，**不给 needs-revision，也没有 r1 机会**。

### 每个引用的 ID 必须落进以下三处之一

1. 本轮 `editorial.macroFacts` 里自己定义（新事实）；
2. 列入 `editorial.retainedMacroFactIds`（沿用上一版仍有效的宏观事实，代码会复制原记录与原来源）；
3. 是 packet 里 31 项必看报价的真实 `instrumentId`（`EQUITY:`/`INDEX:`/`CRYPTO:`/`FX:`/`METAL:`/`ENERGY:`/`RATE:`/`VOL:`）。

第 2 条只接受**上一版 canonicalFacts 中确实存在、且保留锚点在 24 小时内**的 ID；拼错或过期会以 `Selected retained macro fact is unknown or ambiguous` 失败。

### 最容易踩的坑：复制上一版段落

写“相比上一版的变化”时，若从 `data/latest.json` 搬运 `plainLanguage.impacts`、`assets`、`deepDive`、`frameworkAnalysis`、`watch`、`evolution24h`、`analysisTheses` 等段落的 `evidenceFactIds`，那些 ID 属于上一版。本轮 `macroFacts` 一旦提供新事实，canonicalFacts 就是**整条替换**而不是合并，旧 ID 会立刻悬空。

两种处理方式，二选一：

- 去掉旧段落的 `evidenceFactIds`，改用本轮 `sourceUrls` 支撑；或
- 把这些旧 ID **原样列进 `retainedMacroFactIds`**（含 `PROP:`、`FLOW:`、`RESEARCH:`、`MACRO:` 前缀的都要列）。

注意 `macroEvents`、`news` 这两条 lane 由代码合并保留旧条目，它们自带的 `evidenceFactIds` 同样可能悬空——沿用旧 lane 内容时一并核对。

### 提交前自检（必须做）

把 editorial 里所有 `factId`/`factIds`/`evidenceFactIds` 抽成一个集合，减去「本轮 macroFacts 的 id ∪ retainedMacroFactIds ∪ 31 项报价 instrumentId」，**差集必须为空**。非空就说明这一轮会以 `未知事实` 死掉。
