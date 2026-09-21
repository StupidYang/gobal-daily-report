# Global Daily Report

移动端全球市场情报 Dashboard，面向定时任务生成的市场快报。

## 设计目标

- 一个固定 GitHub Pages URL，手机直接打开
- 所有时间统一为 UTC+8
- 首页先看资产状态，再看“本轮变化”
- 重点展示主线、预期差、跨资产背离、行情性质与 price-in
- 每条资产分析尽量附数据/信息来源
- 事件雷达显示未来 12–24 小时关键节点
- 每 10 分钟自动重新读取 `data/latest.json`，也可手动刷新

## 目录

- `index.html`：固定入口与移动端 UI
- `data/latest.json`：最新一轮结构化市场报告
- `history/YYYY-MM-DD/HHmm.json`：历史快照
- `.nojekyll`：禁用 Jekyll

## 数据源

当前页面支持在 JSON 中配置来源并在卡片内引用，包括：

- Federal Reserve：FOMC / 政策声明
- U.S. Treasury：美债收益率
- CME FedWatch：利率预期
- CoinGlass：加密清算 / OI / 资金费率
- Farside Investors：BTC ETF 资金流
- SSE / SZSE：A 股官方市场数据
- Reuters：跨资产盘中与突发消息交叉验证

## 更新协议

定时任务更新 `data/latest.json` 时，建议同时：

1. 写入 `updatedAt`
2. 更新 `changes`（相对上一轮真正发生了什么变化）
3. 给 `metrics` / `assets` / `events` 填入 `sourceIds`
4. 同步保存历史快照
5. 没有实质变化时明确标注“本轮无重大叙事变化”

## GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`
