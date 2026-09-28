# GDR 停更事故：请求创建前阻断与状态修复

## 本轮核对的实际状态

- 最后正式报告：`2026-09-25-0313`，生成时间为 2026-09-25 03:13:03 UTC+8。
- 最后正式执行：`20260925T030122-global-main`，共享锁 generation=16 已 completed。
- 当前仓库的生产开关仍允许 global-main；这是运行许可，不是外部调度器正在运行的证明。
- 2026-09-28 本次任务工具读取：global-main disabled，last_run_time 为 2026-09-27 12:06:25 UTC+8，状态最后变更为 12:07:30 UTC+8。两个区域任务同样未启用。
- 运行对话检索中，2026-09-25 05:03 与 2026-09-27 12:05 的任务回答均报告：创建 GitHub request 的写入被运行环境安全层拦截，未进入仓库执行。这是任务回答记录，不是安全系统的底层决策日志；具体规则与决策原因尚不可见。
- GitHub App 的当前权限读取为 Allow all actions。这不等于计划任务执行上下文必然允许外部写入，不能据此判断拦截已解除。

## 直接断点与不能混淆的结果

调度器运行 -> 请求前发现 -> **创建 request 被阻断** -> 无新 GitHub execution -> 无新报告。

重设 DTSTART 或 is_enabled 不会修复一个被拒绝的外部动作。不得通过换工具、换 API 路径、代理、放宽安全规则或新建重复任务重试同一个已被阻断动作。需要在失败任务的实际动作/授权上下文中审核；无可审批动作或保持拦截时，提交平台支持排查。不得把一次交互式仓库维护成功当作无人值守写入许可已经通过。

## 已复现的仓库缺陷及此次修复

1. **代码部署刷新旧任务健康时间。** publication finish 允许后来的代码部署核验旧报告，并将旧 execution 的 outcomes/health.at 改为当前时间。现在代码部署复核写独立不可变 `runtime/deployment-verifications/<workflowRunId>.json`，明确 `newExecution=false`，不覆盖旧任务回执、健康记录或锁。
2. **区域任务许可仅写在配置中。** 生产总开关打开后，worker 没有强制执行 canary 的 enabledTaskGroups/pausedTaskGroups。现在采集前、提交前、发布认领与推送验证时都检查任务组准入；不授权的组不取锁、不采集、不提交。
3. **全局停更被其他状态更新时间干扰。** 新鲜度使用 global-main 自身执行时点，不再把其他区域更新的全局 health.updatedAt 当作全球任务活跃证明。
4. **调度器实际状态没有可追溯展示。** control 中增加本次工具读取的点时记录。它不是实时接口，不授予恢复权限；超过两小时显示当前状态未核验。比记录更新的真正 executionStartedAt 可优先于旧观察。

## 验证边界

冻结基线来自既有 CI `36292656224` 的 `gdr-regression-proof`（artifact `10923265828`，SHA256 `87016a72448a1effdde361bde9854bedcb5328cd2ab12587380341378050548e`）。基线的 .github、assets、automation、config、docs、lib、scripts、tests、validation、history 子树与 main `bdd860a17fe22b28e77fd09e20a0d5d07b485d16` 对应子树一致；generated data/demo 不是本次代码上传来源。

新增反例在未修复基线失败，修复后通过。全套回归不等于平台安全阻断解除，不等于生产有新数据，不等于连续运行通过。

不更改旧 history/data/runs，不补报告或伪造回执，不新建/补跑/重启任务，不降低 content-r3，不变更 app 权限。此次代码只修复可验证的运行边界和状态失真。
