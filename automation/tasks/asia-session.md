# GDR A股港股交易节点

任务标识：asia-session

先核对A股/港股交易日历与真实交易状态；收盘节点与开盘节点分别标记，休市不重复发布空白结果。更新asia-equities并合成新报告，其他模块保留原始时点。

必须先读 automation/tasks/common.md。内部角色：asia-equities, synthesis。依次按 automation/prompts/<role>.md 的内容职责执行；提交方式一律使用本版本整批协议。


## 当前执行协议（替代上文旧提交方式）

以 docs/live-execution.md 为准：原生任务只在gdr-runtime新建请求与editorial，代码组装并发布。先检查runtime/outcomes忙碌和失败回执，不空等；共享锁与代数先于采集，固定截止前提交，不能直接手工写main批次。此前的频率、内容深度和诚实来源规则继续保留。
