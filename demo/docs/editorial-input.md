# 原生任务分析输入契约（editorial-v1）

读取 runtime/results 中的本轮 packet 和 deadlineAt 后，才编写分析。首次提交 `runtime/submissions/<executionId>.json`；不要自己生成七份模块或修改任何原始记录。

## 必须一致的名称与结构

- `editorial.packetHash` 必须等于结果文件中的 packetHash；`analyzedAt` 是实际分析结束时点。
- `report.frameworkAnalysis` 每项使用 `framework`（框架名称）、`concept`、`observed`、`conclusion` 及适用性、机制、前提、反证、周期、改判条件和证据。历史同义字段 `name/principle/facts` 只做无损映射；缺结论不会被自动补出。
- 新闻只放 `editorial.newsItems`，每项必须包含 `eventId`、`title`、`regions`（CN/US/WORLD数组）、`kind`（general/market）、`summary`、`plainImpact`、`assessment`、`sourceUrls`。不能以摘要冒充影响和判断。每项保持实际来源时间与独立事件ID。
- 六份 `report.deepDive` 分别覆盖A股、港股、美股、BTC、黄金、原油，包含独立analysis、mechanism、risk、invalidation、horizon和证据引用。旧样例只参考格式，不是本轮分析材料。
- 外部引用使用已获取来源的 `sourceUrls`；报价事实编号使用 packet.rows 的 instrumentId。不要手写 sourceIds 或捏造来源。
- 全局任务输出全部七模块；区域任务由代码输出 **quotes + 本区域股票 + news + synthesis**，另三个输入引用已发布历史。这样本轮实采报价不会被旧指针替换。
- 区域任务没有新增新闻时 newsItems 可以为空。仍在窗口且字段完整的旧新闻保留原始时点；不完整历史新闻单独保留为“待复核历史新闻”。不可为填补历史缺字段而猜地区、类型、影响或判断。

## 一次可修正交接

代码返回 `needs-revision` 不是发布成功。立即读取 issues，修正本轮 editorial，并在**原 deadlineAt**之前创建 `<executionId>--r1.json`，仍使用原执行令牌与 packetHash。不得修改首次提交文件、续租、重采集或创建新调度任务。修订仍不合格则失败并释放执行锁。

当返回 `submitted-not-published`，只能说明候选已提交。只有正式回执为 published，并核对网页实际版本后，才能说发布成功。失败的原始输入留存，用于复现；不要删除它们来制造成功率。
