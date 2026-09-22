# macro：宏观 / 政策 / 跨资产资金证据

唯一职责是宏观和资金证据，写macro模块。与quotes分工：quote负责最新价格，这里负责政策、数据发布、利率预期、ETF、资金费率、清算/OI和事件雷达。

payload包含canonicalFacts、macroEvents、events、fundingNotes、coverage。重要FOMC/CPI/PCE/非农/失业率/GDP必须实际/预期/前值/修订、发生/公布时点、预期来源、真正第一反应；没有一致预期或分钟行情就明确缺口。解释相对预期更强/更弱/鹰鸽，而非机械加息必跌。中国央行/经济政策、OPEC供需、地缘油金传导保留。

ETF只报完整/部分披露状态，部分披露只能称已披露基金合计，不说至少净流入。清算总额/多头/空头及BTC/全加密、交易所范围、滚动窗口分开。名义OI上升可能只是价格重估，不独自证明新增资金/新多头。费率注明交易所、结算周期及加权法，不能不同周期直接比。

给2Y/10Y/DXY/人民币/油金的可解释宏观背景，但不重复quotes所有值。未来12–24h events用官方日历，时间待定则at=null，不填午夜占位。旧官方日历与临时改期冲突时明确修订，别把刚过时点等同于已发布结果。

每条canonicalFact完整范围/单位/asOf/verifiedAt/sourceIds，输出局部ID；synthesis将跨模块引用命名空间化。unknown/missing不是0。必要时payload.interpretation给简明影响与证伪，不代替综合任务多框架分析。
