# 七角色复跑与发布验收 · acceptance-r5

配置一致、原生任务执行、仓库正式回执、数据完整度和公开浏览器验收必须分别报告。一次性同入口复跑不保证所有未来周期无故障；缺授权全行业成分/量能仍是数据限制。

AI只提交inbox。代码在隔离目录验证完整写集，再本地锁下应用，遇可捕获IO异常恢复原字节；一个Git提交让最终产物同时可见。这不是跨机器数据库事务。并发非快进推送从最新main重算最多5次，不强推。确切冻结依赖未到时waiting-dependencies有界重试。

测试入口：node --test tests/*.test.cjs；node scripts/check-runtime.cjs；node scripts/check-published.cjs；node scripts/stage-site.cjs .runtime/site；由HTTP服务staged目录后执行tests/ui-real-data.cjs。GDR_TEST_URL指公开站点时另验build.json版本与字节哈希。四档320/390/768/1440测试含筛选、搜索、收藏、板块N、研究、历史、网络失败、大字深色、溢出。GDR_OFFLINE_ROOT只证明真实文件的离线渲染，不可叫公网验收。

同一角色入口的一次性副本仅用来证明本轮原生执行，常驻调度不改。execution.batchId/mode/role、候选runId、回执、数据截止与缺口、最终报告与部署证据共同记录。不能只改generatedAt伪造新采集，研究复用保留原日期。

旧GitHub默认Pages工作流与本项目门禁是不同检查。需要仓库Settings/Pages选择GitHub Actions避免重复构建；没有对应管理权限不得声称已经切换。以公开build.json核对真正部署版本。CI通过不证明新闻真实性。
