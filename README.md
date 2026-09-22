# GDR · 市场与全球情报台

**首屏少而准，正文多而全；保存事实，也保存判断如何改变。**

阅读界面仍是浅色 `reader-r2`，完整报告兼容 `schemaVersion=5`；新增独立 `modules-v1` 生产流水线和自选资产库。原有全球时事、白话影响、A–G、多框架、24小时演化、全部分资产详报和证据不删减。

- 页面：[市场与全球情报](https://stupidyang.github.io/gobal-daily-report/)
- 新模块：[自选 / 板块 / 财报](https://stupidyang.github.io/gobal-daily-report/#watchlist)
- **这是定时研究快照，不是实时交易软件，不保证行情齐全、判断正确或投资收益。**

## 现在可以看什么

### 简明首屏与完整资料库

PC首屏只放结论、影响、最近三项变化、下一节点和最多六组关键指标；其余按兴趣展开。白色/浅灰、蓝色淡色点缀；支持深色和大字。新闻按中国/美国/全球筛选和搜索，增加非财经总量，不挤压财经深度。每轮完整状态、滚动24小时过程、最近增量同时保留。

### 新增自选资产库

四个入口：**必看资产 / 我的自选 / 板块热弱榜 / 公司研究**。独立更新时间，不因一次榜单采集失败让整站白屏。

配置包含31项必看资产：A股、港股、美股及部分全球宽基；BTC、ETH、SOL、PEPE、HYPE；DXY、USD/CNY、USD/CNH；现货黄金白银；WTI/Brent；美债2Y/10Y与VIX。HYPE是Hyperliquid现货；PEPE保留小数精度；指数显示点位，不伪装成货币价格；原油必须注明实际合约月份。

可收藏、取消收藏、搜索、加入自定义代码并导出配置。**本机收藏只改变显示，不会自动把浏览器配置上传Git或增加任务采集订阅。** 新标的导出后合并进 `config/watchlist.json` 才进入共享采集。

### 板块排名不是模型拍脑袋

A股保留31个申万一级行业目录，港股保留12个HSICS行业目录；真实成分映射由合法数据源提供。美股使用可编辑的25家科技候选池、16家投资控股/资管/另类资管/券商候选池，不声称它们就是当前最热公司。

默认 `N=5`，页面可调1–20：

- **热门**：同组量比分位50% + 换手率分位30% + 成交额分位20%。这是可解释的活动排序，不是看涨概率。
- **相对弱势**：涨跌幅减同行样本中位数，取后N。全部上涨时最弱也可能上涨，不代表公司质量最差。
- 一只股可同时热门且弱势。缺量比或同时间基准不伪造热门榜，不用涨幅榜偷换概念。
- 同币种、交易日、时段、基准和近似数据时点才可比较；停牌/ST/上市天数、流动性及缺失按配置过滤并显示原因。
- 缺全量数据时明确“样本榜”，显示已观测/应覆盖/可比较/可打分数量，不假称全行业覆盖。

**重要边界：本次交付了配置、显示、排序、验证和任务分工，没有附带专有全市场行情与成分接口。** 新模块未完成首次真实采集时显示“待采集”。全A/H行业排名需要授权批量数据；仅靠少量网页搜索只能给样本榜。未取得的行情、排名和研报不会用演示数字充数。

### 财报与研报按事件复用

检查新材料身份 → 相同事件沿用旧研究 → 新财报/指引/重述/公告/研报或证伪事件进入待办 → 每轮最多5家新研究 → 保留版本与原 `analyzedAt`。

财报优先公司IR和正式披露；研报只有实际全文可读/授权才标全文，否则注明摘要。研究同时说明白话影响、关键数据、预期差、估值时点、风险和改判条件。新股价不自动刷新旧财报判断，旧估值也不自动适用于新现价。

## 七个职责，只有一个综合报告发布者

| 角色 | 输出 | 运行时点 |
|---|---|---|
| quotes | 必看基础行情 | UTC+8 03/07/11/15/19/23:40 |
| asia-equities | A股/港股板块输入与催化 | UTC+8 09:35 / 12:35 / 16:35 |
| us-equities | 科技/投资公司候选池 | 纽约09:35 / 12:35 / 16:35，跟随DST |
| news | 中国/美国/全球综合时事 | UTC+8 03/07/11/15/19/23:25 |
| macro | 央行/经济发布/ETF/清算等 | 同上小时的:30 |
| research | 新事件检查和公司研究 | 同上小时的:45 |
| synthesis | 完整综合报告与唯一发布 | UTC+8 00 / 04 / 08 / 12 / 16 / 20:00 |

旧3条任务复用为亚洲、美股、综合；另加4条专业生产者。生产者只写自己的模块，不争抢 `data/latest.json`。实际任务入口、调度和角色绑定已备份到Git。

**共36次计划触发/天，不保证比旧版更省Token。** 研究“检查”不等于每次全量重做，预算、事件去重、只读角色依赖用于控制成本。错峰是尽力调度，不是严格DAG：上游晚到时合成报告显示旧时点/缺口，下一版吸收新结果。不要承诺一条任务必定等到所有上游完成。

## Git是系统配置源

```text
index.html / assets/reader*       原浅色阅读层，保持完整内容
assets/watchlist*                独立自选UI + 纯算法与验证
config/watchlist.json            资产、行业、候选池、N、过滤与研究预算
automation/manifest.json         角色/调度/读写边界/UI映射
automation/prompts/common.md     共用执行底线
automation/prompts/*.md          每角色完整提示词
automation/task-export.json      可恢复的运行入口与schedule
automation/bindings.json         当前账户任务ID与入口hash；迁移需换ID
data/modules/<role>.json         模块最近结果（真实任务首次写入后出现）
data/runs/<role>/<runId>.json     模块不可变版本
data/latest.json                唯一综合报告
history/ + data/history-index.json 综合报告历史
lib/pipeline.cjs                 本地锁、幂等、不可变run、发布与研究缓存
scripts/gdr.cjs                  编译prompt/导出任务/校验/发布/本地查看
scripts/run-agent.cjs            任意AI stdin/stdout适配接口
tests/*.test.cjs                 全部算法/协议/发布回归
tests/watchlist-browser.py       离线Chromium模块交互测试
```

没有浏览器端API key、外部字体或遥测。`.env`、runtime锁、测试产物被gitignore排除。历史视图只读取报告冻结的模块run，缺引用则明确缺失，不把今天的数据塞进昨天的报告。

## Clone后启动

需Node22或更新，无数据库：

```bash
git clone https://github.com/StupidYang/gobal-daily-report.git
cd gobal-daily-report
node scripts/gdr.cjs check-config
node --test tests/*.test.cjs
node scripts/gdr.cjs serve 8080
```

打开 `http://127.0.0.1:8080`。静态页面会先显示已有报告；未配置外部AI/数据源时不会自动生成新数据。

```bash
# 恢复任务入口和schedule
node scripts/gdr.cjs export-tasks > tasks-to-import.json
# 编译某模块的完整可移植提示词
node scripts/gdr.cjs prompt quotes > quotes-prompt.md
node scripts/gdr.cjs context quotes > quotes-context.json
# 外部AI生成candidate.json后
node scripts/gdr.cjs validate candidate.json
node scripts/gdr.cjs ingest candidate.json
```

另有 `scripts/run-agent.cjs ROLE`，通过你配置的 `GDR_AGENT_EXEC` 调用自己的AI适配器；stdin输入prompt/context，stdout输出模块JSON。**仓库不包含假装适配所有厂商的万能API。** 具体AI、联网工具、数据授权和密钥由使用者配置；本地脚本不会擅自commit/push。

## 文档入口

- [架构设计](docs/ARCHITECTURE.md)：数据流、所有权、时间与容错。
- [其他AI / 自己的ChatGPT / clone迁移](docs/MIGRATION.md)：步骤、命令、权限、普通Tasks与GPTs区别。
- [运行与故障恢复](docs/RUNBOOK.md)：任务漂移、锁、额度、数据缺口和回滚。
- [模块契约](docs/modules-contract.md)：包络、报价、板块输入、研究缓存与发布。
- [基础报告契约](docs/report-contract.md) / [reader-r2内容契约](docs/reader-r2-contract.md) / [分析框架](docs/analysis-frameworks.md)。旧报告内容协议保留，任务所有权以modules契约/manifest为准。
- [任务清单](automation/manifest.json) / [可恢复入口](automation/task-export.json) / [当前平台绑定](automation/bindings.json)。

## 检查与发布边界

新模块测试覆盖价格身份、阈值/空值、合约、热度/弱势、样本范围、时点、事件缓存、旧source保留、不可变档案、幂等、锁和旧结果防覆盖。原reader/terminal回归继续运行。CI还检查导出的任务入口和绑定hash/时区是否与Git配置一致；**这不是直接查询平台实时配置的漂移检测器**。

离线浏览器测试使用明确标注的测试夹具，覆盖320/390/768/1440、收藏、调N、缺失行业、历史隔离、损坏本地存储及不破坏原报告；不是公网/手机真机验收。

```bash
pip install playwright
python -m playwright install chromium
python tests/watchlist-browser.py
```

本地发布有进程互斥与原子rename，但不是分布式数据库事务。连接器任务需重新读SHA、防旧覆盖、回读校验；外部API/额度/权限故障仍可发生。CI只验证已实现的结构与逻辑，不认证每条新闻真假。

GitHub提交、CI成功、Pages部署、浏览器显示分别核对。任务不能修改前端。若改为GitHub Actions自动推送，注意GITHUB_TOKEN推送与Pages触发的区别，详见迁移指南。
