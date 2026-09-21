# Global Daily Report

移动端全球市场情报 Dashboard。页面采用 **schema v3**：首屏用于 30 秒扫盘，向下保留完整分析，避免定时任务的深度内容被压缩成几句摘要。

## 页面结构

1. 核心资产快照
2. 本轮相对上一轮的关键变化
3. 核心分析 A-G
4. 资产状态
5. 宏观数据与政策事件（实际 / 预期 / 前值 / 修正）
6. 重要消息时间线（事件时间与发布时间分开）
7. BTC / 美股 / 黄金 / A股 / 原油 / 宏观完整详报
8. 最可能改变叙事的触发器
9. 未来 12–24 小时事件雷达
10. A/B 情景观察框架
11. 数据来源与本轮核对时间

## 文件

- `index.html`：移动端 UI
- `data/latest.json`：最新一轮结构化市场报告
- `history/YYYY-MM-DD/HHmm.json`：历史快照
- `.nojekyll`：禁用 Jekyll

## schema v3 关键字段

- `changes`：相对上一轮真正新增/改变的叙事
- `metrics`：资产快照，含 `asOf` 与 `sourceIds`
- `macroEvents`：实际、预期、前值、修正值与解读
- `news`：事件时间和发布时间
- `deepDive`：完整分资产分析
- `coreAnalysis`：主线、预期差、背离、行情性质、price-in、多空及证伪条件
- `narrativeTriggers`：最可能改变市场叙事的数据/价位/资金流
- `events`：未来 12–24 小时事件
- `watch`：A/B 情景重定价
- `sources`：一级来源、市场数据与媒体交叉验证

## 数据源

Federal Reserve、U.S. Treasury、CME FedWatch、CoinGlass、Farside Investors、SSE、SZSE、Reuters 等。

## 定时任务更新协议

每轮先读取当前 `data/latest.json` 作为上一轮快照，再搜索最新市场信息。完成分析后：

1. 覆盖 `data/latest.json`
2. 保存 `history/YYYY-MM-DD/HHmm.json`
3. 所有时间使用 UTC+8
4. 数据与消息尽量记录 `asOf` / `eventAt` / `publishedAt`
5. 宏观大数据优先填实际 / 预期 / 前值 / 修正值
6. 每个关键结论尽量附 `sourceIds`
7. 无重大新增时明确写“本轮无重大叙事变化”

## GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`


## 时间窗口与累计变化

夜间报告使用累计窗口，而不是只比较上一轮：

- 02:00：23:00 → 02:00
- 04:00：23:00 → 04:00
- 08:00：23:00 → 08:00，作为完整隔夜回顾
- 12:00 / 16:00 / 20:00 / 23:00：默认与上一主要时点比较，同时仍输出完整市场分析

JSON 可包含可选字段 `period`：

- `mode`: `overnight-cumulative` 或 `incremental`
- `title`: 页面变化区标题
- `label`: 展示的时间窗口
- `from` / `to`
- `baselineReportId`

所有 Dashboard 时间必须统一使用 UTC+8；不要在展示字段混入 ET / PT 等第二时区。


## schema v4：滚动 24 小时 + 最近增量

从 v4 起不再使用“夜间特殊累计 / 白天单轮差分”的两套逻辑，所有时点统一：

1. **当前完整分析**：`metrics / assets / coreAnalysis / deepDive`
2. **过去24小时累计变化**：`changes`
3. **过去24小时演化时间线**：`evolution24h`，必须串联期间的重要中间节点，不只比较起点和终点
4. **最近一轮新增**：`recentChanges`
5. **窗口元数据**：`period` 表示滚动24小时覆盖；`recentPeriod` 表示最近一轮区间

定时任务每次运行应寻找“当前时点往前24小时”范围内的历史快照，至少读取：
- 距当前约24小时前最近的基线快照
- 期间所有可用的定时快照（通常 02/04/08/12/16/20/23）
- 最近一次快照

如果历史不足24小时，必须设置 `period.isFull24h=false` 和实际 `coverageHours`，不得伪装成完整24小时。

这样用户无论漏掉多少次推送，打开任意一轮都能看到完整24小时演化 + 最近新增 + 当前市场分析。
