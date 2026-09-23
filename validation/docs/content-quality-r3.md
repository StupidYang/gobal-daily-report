# 内容质量与保留契约 r3

此约束适用于新提交；历史报告不得为了通过检查而重写。发布、内容质量、来源真实性是三个不同结果。

## 一份可以独立阅读的报告

保留 schemaVersion=5、reader-r2 和整批提交协议。新增质量门禁 content-r3；A–G 总论、六类资产详报和小时增量必须分别保留，不能互相代替。

`deepDive` 必须各有一项 `name` 为 A股、港股、美股、BTC、黄金、原油。每项包含 `analysis`（本资产结论与依据的完整叙述）、`mechanism`（传导机制）、`risk`（反向证据与风险）、`invalidation`（可观察的改判条件）、`horizon`（观察周期），及真实存在的 `factIds`、`evidenceFactIds` 或 `sourceIds`。不设凑字数门槛；不同资产不得复制同一段占位分析，不能用“见白话影响”代替正文。

数据不足时必须具体说明哪个证据缺失、限制什么结论，不虚构数字补齐。对未变化的分析，可原文沿用并提供 `retention:{reportId,analyzedAt,reason}`；重新核验时间不能覆盖原分析时间。当前仅 A–G 的旧报告不算完整六资产分析，不能凭复制变成新合格报告。

`recentChanges/changes/evolution24h` 统一有 `title` 和 `detail`；兼容旧 `summary/body/change`，但不删除原文。`watch` 使用 `point` 和 `detail`；有真实两种条件才写 `a/b`。`dataDefinitions` 使用 `term/definition`。`narrativeTriggers` 使用 `title/effect`。来源保留 `verifiedAt`，页面兼容显示不代表重新验证。

空观察条件、空术语和空框架须在 `sectionGaps.<section>.reason` 写具体缺口；“没找到数据”不能冒充“已检查无变化”。新闻数量不足如实披露，不强凑条数。写入前运行 `node scripts/preflight-batch.cjs <candidate.json>`；输出 preflight-passed 仍不是 published。

## 行情与证券样本

已有合格观测不会被 null、空 groups 或空 rows 擦除。整条观测保留价格、单位、合约、asOf、基准与原来源，新增 retention 和 latestAttempt 记录本轮失败。来源 ID 冲突通过确定性命名空间区分，不让新来源时间替换旧来源时间。

同一资产的倒退观测保留较新旧值；同一观测时间的数值/币种/合约冲突拒绝而不是猜测。已有原油旧合约只能标历史参考，不能称当前主力。股票原报价样本不依赖热度输入是否齐备；保留的历史样本不参加当前榜单，不把不同时点拼成一组排名。

## 历史展示恢复

`data/reader-projections/<reportId>.json` 是可重建的只读投影，匹配原报告哈希，仅使用该报告冻结输入之前的已存档记录。它不修改 latest/history/run，不证明旧行情真实或新鲜，也不作为采集来源。保留原始历史供审计。

页面区分近期数值、较旧数值、历史沿用、仅文字、缺失。正文 canonicalFacts 的计数明确只覆盖正文，不能代表全站健康。

## 调度边界

只保留三个既有任务，不复制验收/初始化任务。修复期间三个任务和生产开关保持暂停。工程测试通过后仍需真实新采集、完整新报告和公网回读验收；不得自动恢复或假报已通过。
