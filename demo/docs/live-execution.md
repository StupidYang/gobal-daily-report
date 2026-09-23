# execution-lease-v1：真实采集、分析与发布

三个原生任务仍是唯一定时入口。GitHub的execution.yml只处理显式请求事件，没有cron。三个调度继续暂停，测试不能自动恢复生产。

## 阶段及边界

1. 原生任务读取main/automation/control.json。只有productionPaused=false且executionProtocol=lease-v1才继续；缺失或读取失败停止。
2. 生成真实时间的唯一executionId（不超过80个ASCII字母、数字、短横线或下划线）。在gdr-runtime分支创建runtime/requests/<executionId>.json：`{version:1,requestId,taskGroup,requestedAt,documents:[{id,url,title}]}`。documents最多12项，限execution-worker.cjs列出的公共来源域名。
3. 事件工作流从main检出执行代码。使用GitHub Contents API旧blob SHA比较交换，在gdr-runtime/runtime/leases/production.json取得三任务共用锁。失败者不采集。固定20分钟期限，不通过心跳续期。
4. 并发4，单请求8秒，整体采集90秒。429后停止该供应商后续请求。检查价格、标的、币种、合约与时间。两年美债按财政部日度日期展示，不伪造盘中时刻。保留响应哈希，受版权保护的新闻全文不复制到公开仓库。
5. 成功采集写runtime/results/<executionId>.json，锁转analyzing。先检查runtime/outcomes/<executionId>.json；忙碌或失败立即结束，不为不存在的结果空等。读取结果来源包和原始文章后分析，不能把抓取成功冒充读懂全文。
6. 仅创建runtime/submissions/<executionId>.json：`{execution:{executionId,generation},editorial:{packetHash,analyzedAt,report,newsItems,newsCoverage,macroFacts,macroEvents,events,researchRecords,researchChecks}}`。绑定原packetHash，analyzedAt必须是真实分析结束时间。
7. report需提供overview、rolling24hSummary、methodology、coreAnalysis九个字段、完整plainLanguage和六资产impacts、marketCoverage、assets、deepDive六类、frameworkAnalysis/frameworkSynthesis、watch、dataDefinitions、analysisTheses、judgmentRevisions、narrativeTriggers、changes/recentChanges/evolution24h。事实ID取来源包instrumentId或macroFacts.id。文献引用使用sourceUrls，代码只将已取得的URL转换为sourceIds。不得用“同上/见白话影响”代替正文。参考automation/editorial中的实采验收示例仅学习格式，不得复用旧判断冒充新分析。
8. 代码补齐身份、时点、31报价、冻结引用、来源目录，预检后锁转awaiting-publication并绑定整个候选哈希。只写一次main候选，并显式dispatch既有发布流程。已提交状态写outcomes；提交不等于发布。
9. 发布者CAS认领publishing，许可绑定批次哈希、代数、workflowRunId，git push前再次核验。过期、旧令牌、篡改候选、单模块绕行均被拒绝。
10. publishing不能靠超时强夺。必须核对原workflow终止，再按main真实回执恢复completed或failed。completed表示仓库回执已核对，公网部署与浏览器结果仍独立检查。

## 可观测性与限制

运行分支不参与Pages；锁、结果及outcomes变更不触发网页构建。状态保存阶段、截止时间、阶段耗时和原因。同任务同小时成功不再执行，失败最多一次修订。

20分钟是采集/分析输出准入期限，不是强杀原生模型对话。GitHub进程另有5分钟工作流和240秒子进程限制。不要把几秒的采集耗时说成包含模型研究的整轮耗时。

真实验收根目录需要.gdr-validation-root.json（purpose=isolated-real-data-validation，allowRealValidation=true），候选和报告validationOnly=true；假数据仍使用独立synthetic标记。真实验收不能写入生产根目录。/validation/只展示固定验收快照。

布伦特使用明确2026年11月合约BZX26.NYM，不声称永远为主力或自动滚动。到期前需复核并调整配置；不凭日期推算后假称已确认主力。日经等供应商未更新的旧观测仍标较旧。基本报价可用不意味着行业排名、全球新闻、公司财报研究已经齐全。

质量代码不能代替来源和推理审查，也不补造全行业成分、量比、换手率或资金流。恢复三个任务需要显式用户授权。

## 2026-09-23 交接修订规则

同义字段在校验之前规范化，不放松六资产内容与来源要求。区域任务同时发布quotes/news，使用本轮报价，旧新闻不再阻断新报告。字段完整的旧新闻在窗口内沿用；不完整历史记录单独保留，不伪造缺少的分析。

首次分析校验失败写needs-revision、issues和原deadlineAt，允许唯一`--r1`文件。修订不续期；二次失败释放锁。基础设施失败/超时也终结本次采集或分析持锁状态，旧执行不能关闭新代执行或发布中的锁。请求和提交读取触发事件固定commit，防止读取移动分支时混入其他内容。

`runtime/health.json`为只读页面状态投影，不是发布凭证；它的更新不触发Pages构建。页面分别展示三个任务的采集、分析、待修订、失败和待发布状态。
