# GDR 美股交易节点

任务标识：us-session

以America/New_York市场时间判断开盘/收盘和夏令时，先核对交易日历。更新us-equities并合成新报告，其他模块保留原始时点。盘前、盘中、盘后不可混用。

必须先读 automation/tasks/common.md。内部角色：us-equities, synthesis。依次按 automation/prompts/<role>.md 的内容职责执行；提交方式一律使用本版本整批协议。
