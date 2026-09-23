# r5：数值误判与最终验收修复记录

## 已定位的根因

原始美股验收候选 `20260922T164118-acceptance-us-equities` 的证券行中，量比、换手率和20日成交额是合法的 `null`；错误来自 `payload.rankingInputGaps` 的说明映射。旧校验器递归遍历整个对象，仅凭同名字段就把说明文字 `missing` 当作行情数字。

修复没有补价格、改时间或放过证券行的字符串数字。股票模块顶层 `rankingInputGaps` 使用独立的严格说明类型；真实报价／事实／证券行仍要求有限数字或 `null`。同名对象若嵌套进证券行，不享受说明例外。

推荐说明结构：

```json
{"missingFields":["volumeRatio20d","turnoverPct","avgDailyValue20d"],"heatRankingGenerated":false,"weakRankingGenerated":false,"note":"缺少量能与流动性比较基准，未生成热度排名"}
```

兼容已有顶层已知指标到 `missing/available/partial/not-applicable/unknown` 的映射。无效字段、无效状态、数字冒充状态、字符串冒充布尔标记均拒绝。错误附 JSON Pointer，例如 `/payload/groups/0/rows/0/turnoverPct`，便于角色按实际字段修订一次，而不是重新猜整份数据。

## 回执恢复

同一不可变run幂等处理现在返回其内容SHA256。回执恢复可复核原有run；如果正式指针已更新到更晚版本，旧候选仅为 `archived-older`，不能宣称刷新了模块。原始被拒候选、既有回执与历史正文不回写。

## 七个角色如何采用

七个常驻入口继续读取 `automation/prompts/common.md`，本次修复规则已统一写入该文件；角色调度、manifest、task-export和bindings不需要再创建一套。真正的数值缺失仍填 `null` 加原因。新闻扩容、白话影响、多框架、研究缓存、完整综合报告、候选发布门禁与单发布者规则均保留。

## 可复现检查

```bash
node --test tests/*.test.cjs
node scripts/check-runtime.cjs
node scripts/check-published.cjs
node scripts/check-acceptance.cjs acceptance-r5-20260922
```

浏览器安装Playwright后：

```bash
GDR_TEST_URL=https://stupidyang.github.io/gobal-daily-report/ GDR_EXPECT_BUILD=data/build.json node tests/ui-real-data.cjs
GDR_TEST_URL=https://stupidyang.github.io/gobal-daily-report/ GDR_EXPECT_BUILD=data/build.json node tests/ui-expanded.cjs
```

`ui-expanded` 额外验证中国／美国／全球过滤后的完整新闻条数、继续展开全部内容、搜索空结果恢复、分资产原分析不丢失、框架名称保留、证据链接能展开真实目标、全部详情展开后无对象序列化或横向溢出。比较 `buildId` 与完整文件清单，不能仅以报告编号相同冒充前端已更新。

最终工作流 `Seven-role native batch acceptance` 必须取得本批次七个成功回执，综合报告冻结本批次六份输入，再校验公开网页。缺任何角色会失败并保存诊断，不再以跳过浏览器后的绿色工作流冒充验收通过。

## 保证边界

流水线通过、页面交互通过、数据完整、来源真实、未来定时成功是五件不同的事。`partial` 仍表示实际数据缺口，完整行业热度榜仍需要真实成员、量比与流动性基准；本次不伪造这些字段。一次成功复跑不等于未来永不失败，也不证明所有新闻事实自动正确。最终结果以回执、不可变run、综合报告、构建hash、公开浏览器测试产物为准。
