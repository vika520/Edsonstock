#!/usr/bin/env python
"""把 erp_q90_study.json 渲染为可离线打开的独立 HTML 研报。"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "data", "erp_q90_study.json")
OUT = os.path.join(ROOT, "ERP_90分位事件研究.html")
E = lambda s: html.escape(str(s if s is not None else "—"), quote=True)

CSS = """
:root{--ink:#1f2430;--dim:#5d6675;--line:#e3e7ed;--up:#c0392b;--down:#178a5a;--acc:#b7791f}
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:var(--ink);
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;
 font-size:14px;line-height:1.8;-webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:28px auto;background:#fff;padding:40px 46px 46px;
 border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 28px #1f24300d}
h1{font-size:21px;line-height:1.6;margin:10px 0 6px}h2{font-size:15px;margin:26px 0 10px;padding-left:9px;border-left:4px solid var(--acc)}
.sub{font-size:12px;color:var(--dim);border-bottom:2px solid var(--ink);padding-bottom:12px;margin-bottom:18px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
.kpi{background:#f8f9fb;border:1px solid var(--line);border-radius:7px;padding:10px 12px}
.kpi .k{font-size:10.5px;color:var(--dim)}.kpi .v{font:600 17px "JetBrains Mono",Consolas,monospace;margin-top:4px}
.kpi .v.up{color:var(--up)}.kpi .v.down{color:var(--down)}
table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 4px}
th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right}
th:first-child,td:first-child{text-align:left}
th{background:#f7f8fa;font-weight:600;color:var(--dim)}
tr.sig td{background:#fdf6ec}r{font-family:"JetBrains Mono",Consolas,monospace}
.note{background:#fdf9ee;border-left:4px solid var(--acc);padding:12px 15px;border-radius:0 6px 6px 0;
 font-size:12.5px;line-height:1.9;color:#4a463c;margin:12px 0}
.warn{background:#fbecea;border-left-color:var(--up);color:#5a3834}
ul{margin:6px 0;padding-left:20px}li{font-size:12px;line-height:1.9;color:#4a5260;margin:2px 0}
.foot{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);font-size:11px;color:var(--dim)}
@media(max-width:760px){.wrap{margin:0;padding:20px 16px;border:0;border-radius:0}
 .kpis{grid-template-columns:repeat(2,1fr)}h1{font-size:18px}table{font-size:11px}}
@media print{body{background:#fff}.wrap{box-shadow:none;border:0;margin:0;max-width:none}}
"""


def tbl(forward, note=""):
    h = ['<table><thead><tr><th>持有期</th><th>样本</th><th>胜率</th><th>基准</th>',
         '<th>超额</th><th>平均收益</th><th>中位收益</th><th>p 值</th></tr></thead><tbody>']
    for k in ["5", "10", "20", "60", "120", "250"]:
        s = forward.get(k) or {}
        if not s.get("samples"):
            continue
        sig = s.get("sig95")
        h.append('<tr%s><td>%s 日</td><td><r>%d</r></td><td><r>%s%%</r></td>'
                 '<td><r>%s%%</r></td><td><r>%+.2f%%</r></td><td><r>%+.2f%%</r></td>'
                 '<td><r>%+.2f%%</r></td><td><r>%s</r>%s</td></tr>' %
                 (' class="sig"' if sig else "", k, s["samples"], E(s["winRate"]),
                  E(s["baselineWinRate"]), s.get("excess") or 0, s.get("avgRet") or 0,
                  s.get("medianRet") or 0, E(s.get("pDisplay") or s.get("pOneSided")),
                  " <b>显著</b>" if sig else ""))
    h.append('</tbody></table>')
    if note:
        h.append('<div class="sub" style="border:0;padding:2px 0;margin:4px 0 0">%s</div>' % E(note))
    return "".join(h)


def render():
    d = json.load(open(SRC, encoding="utf-8"))
    m = d["meta"]
    a = d["A_fullSampleQ90"]
    b = d["B_expandingQ90"]
    c = d["C_rolling1250Q90"]
    dd = d["D_everyDayHit_fullQ90"]
    rb = d["robustness"]
    h = ['<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         '<title>ERP 90 分位事件研究 · EdsonStock</title><style>%s</style></head><body><div class="wrap">' % CSS]
    h.append('<div class="sub">EDSONSTOCK · ERP 90 分位（低估线）事件研究 · 数据截止 %s</div>' % E(m["asof"]))
    h.append('<h1>股债利差 ERP 达到 90 分位的历史次数与后续涨跌概率</h1>')
    h.append('<div class="sub">样本 %s 日（%s ~ %s）· 数据源：%s</div>' %
             (m["sampleDays"], E(m["from"]), E(m["to"]), E(m["source"])))

    h.append('<h2>一、直接结论</h2>')
    h.append('<div class="kpis">')
    for k, v, cls in [("页面 90 分位阈值", a["thresholdErp"], ""),
                      ("历史达标区间（页面口径）", "%d 次" % a["events"], ""),
                      ("严格因果 · 扩展窗口", "%d 次" % b["events"], ""),
                      ("严格因果 · 1250 日滚动", "%d 次" % c["events"], "")]:
        h.append('<div class="kpi"><div class="k">%s</div><div class="v %s">%s</div></div>' %
                 (E(k), cls, E(v)))
    h.append('</div>')
    h.append('<div class="note"><b>次数</b>：按页面完全相同的口径（全样本 90 分位阈值 %s，ERP ≥ 阈值的连续区间）'
             '共 <b>%d 次</b>，达标日 %d 天（占 %.1f%%）。为避免未来函数，另用两种严格因果口径重算：'
             '扩展窗口 <b>%d 次</b>、1250 日滚动窗口 <b>%d 次</b>。<br>'
             '<b>概率</b>：含未来函数的页面口径下，首次达标后 120 日胜率 %s%%、250 日 %s%% 且显著；'
             '但两种严格因果口径<b>全部不显著</b>（250 日分别 %s%% / %s%%）。'
             '「达到低估线后大概率上涨」这个结论在剔除未来信息后不成立。</div>' %
             (E(a["thresholdErp"]), a["events"], a["hitDays"], a["hitRatio"],
              b["events"], c["events"],
              E(a["forward"]["120"]["winRate"]), E(a["forward"]["250"]["winRate"]),
              E(b["forward"]["250"]["winRate"]), E(c["forward"]["250"]["winRate"])))

    h.append('<h2>二、口径 A：全样本 90 分位阈值（对齐页面，含未来函数）</h2>')
    h.append('<div class="note warn"><b>未来函数警告</b>：%s。这一口径能复现页面 eventCount=%d，'
             '但阈值由整个样本决定，等于「提前知道未来哪里算低估」，只能作描述，不能作交易回测。</div>' %
             (E(m["lookahead"]["A"]), a["events"]))
    h.append(tbl(a["forward"]))
    h.append('<div class="sub" style="border:0;padding:2px 0">最近 6 次区间：%s</div>' %
             E("；".join("%s~%s（%d 日）" % (x["start"], x["end"], x["days"]) for x in a["last6"])))

    h.append('<h2>三、口径 B：扩展窗口 90 分位（严格因果，无未来函数）</h2>')
    h.append('<div class="note">%s。信号从 %s 起，达标日 %d 天，首次进入事件 <b>%d 次</b>。</div>' %
             (E(m["lookahead"]["B"]), E(b["evalFrom"]), b["hitDays"], b["events"]))
    h.append(tbl(b["forward"]))

    h.append('<h2>四、口径 C：1250 日滚动窗口 90 分位（严格因果，对齐通道窗口）</h2>')
    h.append('<div class="note">%s。窗口不含当日；达标日 %d 天，首次进入事件 <b>%d 次</b>。'
             '各期限胜率均不显著，5–120 日甚至低于基准。</div>' %
             (E(m["lookahead"]["C"]), c["hitDays"], c["events"]))
    h.append(tbl(c["forward"]))

    h.append('<h2>五、为什么页面口径胜率那么高：样本重叠检验</h2>')
    h.append('<div class="note warn"><b>口径 D（不可用于策略）</b>：%s，共 %d 个达标日。</div>' %
             (E(dd["warning"]), dd["samples"]))
    h.append(tbl(dd["forward"], "同一段连续低估期里的每一天都被算作独立样本，250 日胜率被抬到 90% 以上；"
                              "这些收益高度重叠，p 值完全失真。"))

    h.append('<h2>六、稳健性：负对照</h2>')
    h.append('<ul>')
    h.append('<li>把 ERP 序列随机打乱后，滚动窗口达标率 <b>%s%%</b>（理论 10%%）；'
             '真实序列为 <b>%s%%</b>。差异来自 ERP 极强的自相关（lag1 = %s），'
             '说明滚动分位阈值本身被趋势带偏，而非代码错误。</li>' %
             (E(rb["shuffledRollingHitRate"]), E(rb["realRollingHitRate"]), E(rb["erpAutocorrLag1"])))
    h.append('<li>全样本固定阈值的达标率恰好 10%%，这是它看起来「合理」的原因；'
             '但「恰好 10%%」本身是用未来数据拟合出来的。</li>')
    h.append('<li>单尾二项检验假设样本独立；本研究的事件已按区间首次进入去重，'
             '但跨区间仍可能重叠，p 值偏乐观（更易显著），需保守解读。</li>')
    h.append('</ul>')

    h.append('<h2>七、边界与免责</h2><ul>')
    for x in m["caveat"]:
        h.append('<li>%s</li>' % E(x))
    h.append('<li>本报告由 erp_q90_study.py 基于 erp.json 锁定序列计算，'
             '不修改 ERP 任何锁定数字；ERP 不是择时信号，所有结论均为统计描述，不构成投资建议。</li>')
    h.append('</ul>')
    h.append('<div class="foot">EdsonStock · 生成脚本 erp_q90_study.py / build_erp_q90_report.py · '
             '可离线打开与打印 · 工作台第 12 栏「股债利差(ERP)区间」</div>')
    h.append('</div></body></html>')
    open(OUT, "w", encoding="utf-8").write("\n".join(h))
    print("saved:", OUT, round(os.path.getsize(OUT) / 1024, 1), "KB")


if __name__ == "__main__":
    render()
