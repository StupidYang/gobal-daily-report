# GDR 连续运行恢复方案 · 2026-09-24

> 目标：恢复可持续的连续更新，而不是再做一次“能构建、能发布”的单次演示。本文不授权恢复生产；`productionPaused=true` 与三个原生任务禁用状态继续保持，直到 owner 明确授权。

## 1. 当前问题拆成两类验收

### A. 服务连续性

回答“系统能不能一轮接一轮正常跑”：

- 三个现有原生任务仍是唯一调度入口，不先增加第四个生产定时任务。
- 共享 execution lease 在采集、分析、候选、发布之间提供同一代 fencing。
- 上一轮未终结时下一轮只允许 busy/skip，不允许并发采集和双发布。
- 一轮失败只能留下明确失败状态；不能靠创建补跑任务掩盖失败。
- 某个内容来源失败时只降级该内容面，不允许把已有合格模块静默清空。
- repository published、Pages deployed、browser verified、content accepted 分开记录，任何一个绿色状态不能替代另一个。

### B. 内容能力

分别验收，不再用“综合报告有正文”替代：

1. **行情**：31项必看资产、美国配置池；坏项保留最后有效观测和原始 `asOf`，不补零、不换时间。
2. **综合新闻**：滚动24小时去重保留，普通小时只补新增/进展；行情URL不能冒充外部新闻。CN/US/WORLD和非财经覆盖由实际sourceIds派生。
3. **宏观/资金**：政策、数据、ETF、费率/OI/清算等按实际可得范围记录。空刷新不能覆盖上一份24小时内来源支持的模块；沿用必须保留旧时点并标 `no-change/retention`。
4. **行业排名**：缺全量成员、量比、换手或流动性基准就不生成假热度榜。A股31行业、港股12行业的真实成员/量价源仍需单独完成，不把空group当验收成功。
5. **公司研究**：历史研究按事件版本保留原 `analyzedAt`；本轮没有新材料不等于“待研究”。pending只表示从未覆盖或已发现新材料但尚未完成原文研究。

## 2. 一次 global-main 内部拆三条证据队列

不是增加三个 scheduler，而是同一个 execution 内部解耦：

- **Market lane**：代码化基础行情采集，失败项局部降级。
- **News/Macro lane**：原生任务在创建 request 前发现具体文章、公告和数据页，随后由代码在90秒总预算内并发取证。
- **Research lane**：只为新财报、指引、重大公告、证伪事件取原文；每轮最多按配置处理5家公司。

三个 lane 最后仍绑定同一个 `packetHash`，只允许一个 editorial、一个 atomic batch、一个 publication receipt。

## 3. 失败隔离规则

| 失败面 | 允许行为 | 禁止行为 |
|---|---|---|
| 单个报价源 | 保留旧有效值+旧时点，标previous/retention | 写0、改成当前时间 |
| 外部新闻不足 | 保留24小时内合格旧闻，coverage=partial并列gap | 用行情观察凑综合新闻 |
| 宏观本轮为空 | 24小时内保留上一来源支持模块，status=no-change | 新建空macro覆盖旧内容 |
| 研究无新材料 | 保留旧record/analyzedAt | 把已研究公司全部重新列pending |
| 行业排名输入不全 | 显示sample/missing和缺字段 | 用涨幅榜冒充热度榜 |
| 发布流程失败 | 保留上一公网报告，写明确failure/outcome | 构建绿就宣称发布成功 |
| Pages未核验 | repositoryPublished可单独为true | 把仓库回执当公网证明 |

## 4. 恢复顺序

### Phase 0：当前，生产冻结

- 只在 repair 分支和既有 pull-request CI 上修复。
- 不创建验收/补跑 scheduler，不写旧 history，不改运行中的三任务状态。
- 先解决“越更新越少”和“缺口伪装完整”的确定性问题。

### Phase 1：代码进入 main，仍冻结

条件：

- 最新 repair head 的既有隔离 CI 完整通过。
- 合并只包含代码/契约/测试；不修改旧报告历史。
- main 中 `productionPaused` 仍为 true，三个原生任务仍 disabled。
- 合并后的 Pages 若因 main 代码变化自动重建，只能称“代码版本部署”，不能称新市场报告成功。

### Phase 2：owner 明确授权后的 global-main canary

不创建临时补跑任务，只启用**现有 global-main**，区域任务继续关闭。

至少观察连续自然调度轮次，重点记录：

- 是否每小时只产生一个execution；
- 前一轮跨小时未完成时下一轮是否正确busy/skip；
- 是否出现空模块覆盖、历史时点刷新、重复批次或双Pages发布；
- 每份报告六资产正文是否完整；
- 新闻、macro、research、ranking coverage是否真实反映取得的证据；
- repository receipt与公网build identity是否逐轮匹配。

只有“连续原生运行”证据成立，才进入下一阶段。单轮成功不算。

### Phase 3：逐个恢复区域节点

1. 先启用 asia-session，验证与整点 global-main 相撞时共享锁和内容复用；
2. 再启用 us-session，验证纽约时区/DST与整点任务交叉；
3. 任一阶段出现内容退化或发布竞态，就只回退该阶段的任务开关，不修改历史。

## 5. 状态面板必须区分的状态

未来状态展示至少区分：

- scheduled / skipped-busy
- collecting
- ready-for-analysis
- needs-revision
- submitted-not-published
- repository-published
- deployment-pending / deployment-verified
- failed / timed-out
- content-partial / content-accepted

“deployed”只是基础设施状态；内容仍可为partial。反过来正文合格也不能证明Pages已经更新。

## 6. 尚未完成的真实能力

当前修复不会伪装完成以下事项：

- A股31行业与港股12行业的全量成员、量比、换手、流动性输入及真实排名；
- BTC/全加密统一窗口的OI、费率、清算，以及ETF完整披露；
- 稳定的CN/US/WORLD综合新闻发现与正文覆盖，需要连续轮次验证；
- 公司研究的新材料发现与检查覆盖，需要真实事件触发验证；
- 三个原生任务无人干预连续运行及互相碰撞的生产证据。

这些项分别验收。缺一项可以明确partial，但不能再因为某一项缺失把整个报告清空，也不能把partial叫full acceptance。
