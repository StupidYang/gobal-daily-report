# 一次性全模块数据初始化 · 2026-09-22

## 授权与范围

用户要求先初始化全部模块数据，再依靠下午收盘与每4小时综合任务继续运行。这是一次性冷启动协调，不是第八个常驻业务角色，不改变七个生产角色的所有权。执行完结束，不创建、修改或递归触发其他任务。

仓库：StupidYang/gobal-daily-report。先读取automation/manifest.json、automation/prompts/common.md、docs/modules-contract.md、config/watchlist.json以及各阶段角色提示词。综合阶段还读取docs/report-contract.md、docs/reader-r2-contract.md、docs/analysis-frameworks.md。

## 必须真正执行，而不只是建立空文件

1. 读取当前时间（Asia/Singapore），列出各模块、对应不可变run、latest和history-index。初始化记录按实际开始/结束时间生成，不能补造12:00报告。
2. 依次执行quotes、news、macro、asia-equities、us-equities、research；最后以synthesis角色发布完整综合报告。可用工具允许时，独立的来源采集可以并行，但同一文件写入必须顺序进行。
3. 每个阶段先读对应automation/prompts/<role>.md，再实际联网采集。优先覆盖全部角色与必看资产，不要把全部时间耗在一个失败数据源或几千股票上。单一接口失败最多使用有限替代来源，不无限重试。
4. 每阶段采集后立即按moduleVersion=1验证并保存data/runs/<role>/<runId>.json和data/modules/<role>.json。runId和generatedAt使用实际UTC+8时间，不使用任务计划时间冒充行情时间。
5. 已有近期asia-equities或其他模块仍须检查新信息；重新核验失败时保留其原始数据与asOf/verifiedAt，在attemptedAt或note记录本次检查失败。不能用空白占位覆盖已有有效分析。确无旧数据时写missing/error与真实失败原因，不伪装ok。
6. quotes覆盖config.required全部标的，有精确数值和数据时间才填数值price。阈值文字保留displayValue，无法确认时间则null+说明。Google/CoinGecko等动态网页可能返回过期缓存；必须比对页面数据日期，不把抓取时间当行情时间。USD/USDT、现货/期货、人民币中间价/即期严格分开。
7. 股票榜没有行业成分、交易基准、流动性和量比证据时只保留已核验样本或明确缺口，不编全量热度榜。美股休市时使用真实最近常规收盘，不将盘前盘后混入同一排名。
8. news单独检查中国、美国和全球综合时事；金融分析不因此减量。覆盖18–30条是滚动窗口目标而不是硬凑数条件。事实、影响、推断和发布时间分开；真实不足就说明。
9. research初始化可访问的最近公司披露/事件研究缓存，不需要等待未来新财报才建立基线。每轮最多5家新分析；优先候选池中有明确新材料的重点公司。没读到财报全文不写成已完成全文分析；剩余公司明确pendingQueue。旧分析复用保留原analyzedAt。
10. 最后必须执行synthesis：读取各阶段实际保存的run，构建带moduleRefs的完整schemaVersion=5、reader-r2报告，发布本次实际时点的history与latest，并维护索引。不只把模块初始化好却让首页仍停在09:35。

## 发布保护

各阶段只写本角色ownedPaths。协调器额外允许写data/initialization/20260922-bootstrap.json作为状态清单（开始/结束时间、每个role的runId、status、dataAsOf、缺口和发布结果）；禁止修改任何前端、配置、提示词、凭据或旧历史。

写前重读当前指针SHA和时间，新报告或新模块已到达就不覆盖回旧版本。不可变run已存在但内容不同时换runId。冲突重读后最多重试一次。综合报告的source/fact引用必须命名空间化并存在；新闻和解释不能冒充实时证据。只有synthesis阶段可写全站latest/history/history-index。

有执行环境时运行仓库真实校验脚本；没有就按契约逐项核对，不伪称跑过脚本。每个模块均需回读确认，综合报告仍指本次时latest与history的blob SHA必须相同。若已被后续合法报告替代，记录该状态，不回滚。

遇到单模块采集失败要继续其他模块，最终综合报告标明部分初始化及旧资料时点。初始化完成≠数据全量齐备。财报历史是有意复用，不是行情缓存。价格时点旧就显示旧，不能为了让页面显得新而批量更新时间。

## 最终交付

输出七个角色逐项状态、真实写入数与缺口、综合报告reportId、latest/history校验结果，并附https://stupidyang.github.io/gobal-daily-report/。只有有实际工具结果才宣布完成。未完成的角色明确列出。

## 后续下午运行

- 15:35：A股15:00正式收盘 + 港股盘中。
- 16:00：每4小时综合任务启动，使用实际已完成模块；晚到模块明确标记。
- 16:35：港股收市竞价结束后的最终确认，不宣称16:00报告已包含后发生的信息。

以上是计划启动时间，不是保证发布完成时间。七个常驻任务及这一轮初始化均不保证外部来源、配额和GitHub网络永远可用。
