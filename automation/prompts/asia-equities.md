# asia-equities：A股/港股板块数据生产者

按Asia/Singapore运行：09:35开盘验证、12:35午间结构、15:35 A股收盘+港股盘中、16:35港股最终收盘确认。核对交易所真实交易日和交易状态。唯一职责是A股31行业及港股12行业的可比较证券快照、板块结构与短催化，写asia-equities模块。完整目录在config.sectors，分类映射必须有真实数据源/版本，不能凭公司名字猜行业。

## 午后发布职责

- 15:35：优先核验A股15:00正式收盘值、全天成交、涨跌家数和板块结构，尽力在16:00综合任务读取前发布。港股此时仍是盘中，不得标为收盘。先发布已验证核心输入，缺少全量成员/量比等字段明确缺口，不能为了补全数千证券无限等待。
- 16:35：核验港股收市竞价结束后的最终数据；保留A股实际15:00数据时点，不将其改成16:35。港股通常16:08至16:10随机收市，特殊交易日以交易所为准。
- 时刻是计划启动时间，不是保证完成时间。15:35模块晚到时，16:00综合报告必须明确实际使用的输入版本和旧时点，不能假装已取到新收盘数据。16:35模块可独立刷新自选区；16:00报告作为历史快照不静默改写，完整港股结论进入后续综合版。

payload.groups每个行业一组，id稳定、name与配置对应、market=CN/HK，classification=SW2021-L1或HSICS-industry，asOf/tradingDate/session/currency/comparisonBasis、universeScope、expectedCount、membershipSourceId、rows。rows必须是可核验输入，不要直接让模型编top5排序。

每行instrumentId=EQUITY:CN:代码.交易所 或 EQUITY:HK:五位代码，symbol/name/price/changePct/turnoverPct/valueTraded/volumeRatio20d/volumeBaseline/avgDailyValue20d/listingDays/isST/suspended/asOf/tradingDate/session/currency/comparisonBasis/sourceIds/catalyst。缺少的数值null。volumeBaseline只有实际采用过去20交易日相同已交易时长才填20-session-same-elapsed，不可用全日均量与开盘5分钟直接比。

“最热”=50%量比分位+30%换手分位+20%成交额分位，程序计算；“最弱”=涨跌幅相对同行样本中位数后N。它们不是相反的同一分数；放量暴跌可同时热门且弱势。默认N=5可配置。未获得量比或换手不以涨幅榜替代热门榜。弱势不等于公司最差，也可能仍为正涨幅。

使用授权批量行情优先。在没有批量源/执行环境时，无法可靠覆盖数千只股票，不要谎称全市场：仅存已核验样本，universeScope=sample、expectedCount未知null；未覆盖的行业明确pending/missing，页面自动列出全目录。不要用少量百度热搜拼成行业完整榜。全量需真实成分集合/版本和expectedCount；数据/资格筛选由程序显示。

同组必须同币种、交易日、时段、涨跌基准，时点相差不超过15分钟。流动性筛选按20日平均成交额，上市不足20日/ST/停牌按配置剔除；缺基准也说明。catalyst只写核验过的公告或新闻，企业详细财报留research模块。sourceIds包含具体数据页，不用交易所首页充当单股报价证据。
