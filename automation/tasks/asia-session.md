# GDR A股港股交易节点

任务标识：asia-session

先核对A股/港股交易日历与真实交易状态；收盘节点与开盘节点分别标记，休市不重复发布空白结果。更新asia-equities并合成新报告，其他模块保留原始时点。

必须先读 automation/tasks/common.md。内部角色：asia-equities, synthesis。依次按 automation/prompts/<role>.md 的内容职责执行；提交方式一律使用本版本整批协议。
