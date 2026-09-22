# 迁移指南：clone、其他AI、自己的ChatGPT

## 1. 先区分三件事

clone只复制代码/数据/提示词，不会复制ChatGPT定时任务、账户套餐、模型额度、GitHub连接器授权或行情API密钥。GitHub Pages只是静态阅读，不会自己上网研究。新AI必须具备读写仓库或文件、联网检索/数据适配器和相应调度能力。

OpenAI当前帮助页说明Tasks有套餐/模型/功能限制，且不支持GPTs；因此“在自己的ChatGPT账户重建普通Tasks”和“做一个自定义GPT”不是一回事。不能承诺把知识文件上传自定义GPT后自动获得后台调度。具体可用模型、任务数量和授权以你自己的界面及官方文档为准：
https://help.openai.com/en/articles/10291617-tasks-in-chatgpt

## 2. clone后本地看页面

```bash
git clone https://github.com/StupidYang/gobal-daily-report.git
cd gobal-daily-report
node scripts/gdr.cjs check-config
node --test tests/*.test.cjs
node scripts/gdr.cjs serve 8080
```

浏览器打开http://127.0.0.1:8080。Node 22或更新版本，无需数据库。所有模块缺失时仍能读原报告；自选显示待采集而非报错整站白屏。

## 3. 在自己的ChatGPT账户重建

1. Fork到自己的GitHub，保留路径结构；检查Pages分支/目录，先手动打开。
2. 配置新的GitHub连接器，只授权你的仓库。新账号不会继承原作者授权。先做一次读，再由你确认后做可回退的小文件写入测试。
3. 修改automation/manifest.json.repository为新owner/repo。时区保留Asia/Singapore和America/New_York，不能硬把美股全年换成固定北京时间。
4. 运行以下命令导出七条入口和调度：

```bash
node scripts/gdr.cjs export-tasks > tasks-to-import.json
# 单独查看某条入口
node scripts/gdr.cjs prompt quotes --entry
# 无法从Git读取提示词时，使用完整编译版
node scripts/gdr.cjs prompt quotes > quotes-full.md
```

5. 在普通ChatGPT中逐条创建任务，使用导出的prompt与timezone/rrule。先确认平台支持任务数量；不足时不要静默丢角色，可将news+macro由外部cron执行，或按下述本地串行方式运行，不必永久改变模块协议。
6. 建好后记录新任务ID到automation/bindings.json；核对实际运行的prompt与导出内容，禁止复制旧ID误操作别人的任务。
7. 先手动跑一个quotes模块，检查run和pointer一致；再试榜单、研究缓存，最后启用唯一synthesis发布。不要让旧三条全量任务仍同时写latest。

任务入口从Git读取提示词，Git就是配置源；修改详细规则提交即可生效，但改变schedule仍需在平台同步。回退代码不自动回退平台schedule，RUNBOOK有清单。

## 4. 其他AI或本地CLI执行器

协议不绑定厂商。你的适配器是一个可执行命令：stdin收到JSON `{protocol, role, prompt, context}`，stdout只返回模块envelope JSON，诊断日志走stderr。适配器负责调用自己的AI/API与联网工具，保留成本和限流控制。

```bash
export GDR_AGENT_EXEC=/absolute/path/to/your-adapter
export GDR_AGENT_ARGS='[]'
export GDR_AGENT_TIMEOUT_MS=600000
node scripts/run-agent.cjs quotes
node scripts/run-agent.cjs asia-equities
node scripts/run-agent.cjs synthesis
```

这里**没有内置一个假装能调用所有AI的万能API**。你需要实现厂商适配器，或直接用Claude Code/Codex等读取编译prompt与context后输出JSON。不要把ChatGPT订阅当成API余额，不要在命令行源码/Git中写key。

没有适配器也能手动：

```bash
node scripts/gdr.cjs prompt research > research-instructions.md
node scripts/gdr.cjs context research > research-context.json
# 让具备联网的AI读取上述文件，产出 candidate.json
node scripts/gdr.cjs validate candidate.json
node scripts/gdr.cjs ingest candidate.json
# 综合报告从synthesis.payload.report提取为report.json后
node scripts/gdr.cjs publish report.json
```

runner的ingest/publish是真实本地写盘；不会替你commit/push。检查git diff和测试后再git add/commit/push，禁止自动git add .把密钥也提交。生产部署推荐每次先git pull --ff-only，提交明确data路径，再正常push；冲突重新拉取重放，不force。

## 5. cron / Windows / 容器

automation/manifest.json存cron与IANA时区。使用支持时区的cron、systemd或调度器；Windows计划任务可以分别按当地时区换算，但要维护纽约DST。推荐统一执行队列，或给每个角色互斥锁；本地发布器已防同时写盘，但不是分布式锁。

先生成每日/每时角色计划，执行producer，再synthesis。错峰只减少碰撞，不保证上游已完成：查看module时点再合成。平台配额不够时降低低优先级轮次、研究预算和抓取频率，不删除必需模块或让旧数据伪装最新。

## 6. GitHub Actions迁移注意

现有CI只跑测试和校验，不承担LLM采集。要在Actions里跑AI，需独立secret和受限权限、固定可审计脚本，不执行新闻页面附带命令。

GitHub官方说明：用GITHUB_TOKEN推送的commit不会触发分支式Pages构建。迁移时需在同一发布workflow显式upload/deploy Pages，或用经过你授权的合适触发机制；不能只看Git commit成功就认定网页更新。
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

并发控制可使用唯一publisher concurrency group，合并积压输入后处理；不同模块不能共享会互相取消的worker group。平台调度可能延迟，不能当秒级行情系统。
https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency

## 7. 行情与财报源

CoinGecko可按唯一ID批量获取币价和last_updated_at（key/配额按供应商当前规则）：https://docs.coingecko.com/reference/simple-price
Hyperliquid现货/永续身份不同，不能把HYPE永续mid当现货：https://hyperliquid.gitbook.io/Hyperliquid-docs/for-developers/api/info-endpoint
SEC API用于正式披露：https://www.sec.gov/search-filings/edgar-application-programming-interfaces
SEC要求有识别的User-Agent及公平访问限速，勿爆抓：https://www.sec.gov/about/developer-resources
HSICS行业分类：https://www.hsi.com.hk/eng/our-services/hsics

A股/港股全量行业排行需要可靠的成员集合、批量行情和相同比较基准。无授权源时只能样本榜，不可声称已经完成全市场实时排名。
