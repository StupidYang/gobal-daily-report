# 运行与故障恢复手册

## 发布前

- `node scripts/gdr.cjs check-config`：必需资产不重复，只有synthesis拥有全站latest写权限，提示词文件存在。
- `node --test tests/*.test.cjs`：排序、缺失、时间、幂等、历史穿越、缓存等回归。
- `node scripts/gdr.cjs validate candidate.json`：模块结构、来源、身份和时点。
- `node scripts/gdr.cjs rank candidate.json 5`：确定性热/弱榜；查看sample标签和剔除原因，不能只看榜单漂亮。
- 对综合report继续运行原scripts/validate-report.cjs并使用gdr publish；旧r2字段不能因模块化被删。

## 任务配置漂移

prompt原文和任务入口都在Git。修改角色规则后生成`node scripts/gdr.cjs export-tasks > automation/task-export.json`并提交。改schedule还必须在平台改一次，回读工具结果记录bindings。任务ID不是可迁移主键，role才是。不要仅在聊天里改一段提示词，不落Git。

## 只部分模块完成

先核对各模块generatedAt和每条asOf。报告注明依赖旧/缺；不要自动把旧dataAsOf盖成当前。图表不够点就是不够点，不用插值补齐。“31行业已配置”不等于31行业已完成采集。

## SHA冲突或旧任务晚完成

模块只可写自己pointer。immutable run先保存，更新pointer前重读最新SHA，若新结果已存在则只保留run。综合报告也只能synthesis写。禁止force覆盖latest或index。正在运行的旧平台任务可能仍用旧提示词，迁移时必须等待/取消并检查；新的角色边界无法追溯取消已开始运行的任务。

## 本地锁残留

脚本正常结束自动删除.runtime/publish.lock。异常断电后先确认没有发布进程，再人工删除残留锁。不要按一个固定超时时间随意抢锁。多机器共享Git必须额外串行化publisher，本地锁不跨机器。

## 研究过期 / 事件重述

检查checks是no-new、error还是pending。相同eventKey不能修改原analyzedAt；新材料修订需要新的版本key和sourceHash/documentId，记录previous/newEvidence。别把“没有新财报”当成“旧假设永远有效”。旧估值与新价格必须分开。

## 数据源或额度不足

没有足够源，不编造热门榜、研报和财报数字。记录缺口；采集任务可只输出partial/error包。研究优先候选+持有自选/榜单新入选，最多5个新分析；其余排队。7角色触发数比旧版更多，不保证更省tokens，预算应记录每run耗时/模型/实际账单（可得时）。平台模型无选择字段时不冒充固定某模型。

## 发布链验证

1. 工具返回写入成功；2. 回读run与pointer；3. 综合报告history与latest一致；4. Pages实际部署状态；5. 浏览器显示。五步不是同一件事。CI成功只覆盖实现的测试，不证明事实源真实。

## 回滚

用正常Git revert回滚代码/配置。数据错误追加更正记录，不悄悄改旧历史。回滚角色数量/频率时还需同步平台任务；恢复旧三条writer前先停新的synthesis与对应生产者，防两个架构同时写同一个latest。bindings记录平台旧ID仅供审计，勿盲目复用。
