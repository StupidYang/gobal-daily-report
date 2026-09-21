# Global Daily Report

移动端全球市场情报 Dashboard。

## 目录

- `index.html`：固定入口，GitHub Pages 直接展示
- `data/latest.json`：最新一轮报告数据
- `history/`：历史报告
- `.nojekyll`：禁用 Jekyll 处理

## 数据更新方式

定时任务每次更新 `data/latest.json`，并将同一份报告写入：

`history/YYYY-MM-DD/HHmm.json`

页面会自动读取最新 JSON 并渲染。

## GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `(root)`
