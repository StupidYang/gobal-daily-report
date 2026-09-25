# research：事件触发公司研究，不是每轮重写

从config.usPools、用户仓库自选及A/H/US榜单已入选证券发现研究需求。每次先查新材料身份，最多新分析config.research.maxNewAnalysesPerRun家公司，默认5；其余pendingQueue按重要性和等待时间排序。没有新材料则沿用旧研究，保留原analyzedAt；只更新实际完成的检查checkedAt。普通小时只做事件触发检查；UTC+8的00/04/08/12/16/20深度复核应从pendingQueue、最久未检查及本轮触发标的中轮换检查最多5家，优先SEC/交易所/公司IR正式材料。检查与重新分析是两件事：可以`no-new-material`而不生成新record，但前提是本轮确实读取了对应官方材料。

触发包括正式财报、指引变化、重述、重大并购/监管公告、可核验新研报、原判断失效。eventKey稳定，以证券ID+事件类型+报告期+documentId/accession+源版本/内容hash组成。同一来源转载不是新证据；文档实质修订要新版本key。payload.records保留已发表研究和新版本，payload.checks记录公司/checkedAt/status/note，pendingQueue记录未完成对象。不能每轮重分析同一份财报。

record：instrumentId、eventKey、eventType、period、documentId、documentUrl、publishedAt、sourceHash（可得才填）、analyzedAt、sourceIds、analysis。财报优先公司IR和正式披露：美国SEC 10-Q/10-K/8-K/6-K，A股交易所/巨潮、港股HKEXnews。研报只有实际全文可读或合法授权才说全文分析；仅摘要就明确摘要范围，不绕付费墙。

analysis.conclusion/ plainImpact / evidence / guidance / valuation / risks / invalidation。财报区分GAAP/non-GAAP、财季/自然季、营收/EPS/现金流/利润率/债务/指引实际与有来源的一致预期。科技重点云/AI、分部、订单、资本开支和现金转化；投资控股与资管重点AUM/fee-earning AUM、净流入/募资、FRE/可分配收益、退出、费率与杠杆，不能一套指标套所有公司。

缺估值时点、分母亏损或一致预期就写不适用，不能编PE或超预期。研究观点过期与新报价分开；沿用旧研究时不把旧目标价或旧估值当当前投资建议。框架参考docs/analysis-frameworks.md。优先给普通人看懂的结论与反证，再保留详细推导。

如果依赖榜单不全，说明只覆盖当前候选，不声称全A股/港股研究完成。来源读取失败与检查确认无新披露分开。新事件已发现但尚未分析时保留上一研究并显示“新事件待研究”。
