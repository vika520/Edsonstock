#!/usr/bin/env python
"""把 erp_q75_study.json 渲染为可离线打开的独立 HTML 研报。"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "data", "erp_q75_study.json")
OUT = os.path.join(ROOT, "ERP_75分位反弹研究.html")
E = lambda s: html.escape(str(s if s is not None else "—"), quote=True)

CSS = """
:root{--ink:#1f2430;--dim:#5d6675;--line:#e3e7ed;--up:#c0392b;--down:#178a5a;--acc:#b7791f}
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:var(--ink);
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;
 font-size:14px;line-height:1.8;-webkit-font-smoothing:antialiased}
.wrap{max-width:1000px;margin:28px auto;background:#fff;padding:40px 46px 46px;
 border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 28px #1f24300d}
h1{font-size:21px;line-height:1.6;margin:10px 0 6px}h2{font-size:15px;margin:26px 0 10px;padding-left:9px;border-left:4px solid var(--acc)}
.sub{font-size:12px;color:var(--dim);border-bottom:2px solid var(--ink);padding-bottom:12px;margin-bottom:18px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
.kpi{background:#f8f9fb;border:1px solid var(--line);border-radius:7px;padding:10px 12px}
.kpi .k{font-size:10.5px;color:var(--dim)}.kpi .v{font:600 17px "JetBrains Mono",Consolas,monospace;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:11.5px;margin:8px 0 4px}
th,td{padding:6px 6px;border-bottom:1px solid var(--line);text-align:right}
th:first-child,td:first-child{text-align:left}
th{background:#f7f8fa;font-weight:600;color:var(--dim);line-height:1.4}
tr.sig td{background:#fdf6ec}r{font-family:"JetBrains Mono",Consolas,monospace}
.note{background:#fdf9ee;border-left:4px solid var(--acc);padding:12px 15px;border-radius:0 6px 6px 0;
 font-size:12.5px;line-height:1.9;color:#4a463c;margin:12px 0}
.warn{background:#fbecea;border-left-color:var(--up);color:#5a3834}
.good{background:#eaf5ef;border-left-color:var(--down);color:#28503d}
ul{margin:6px 0;padding-left:20px}li{font-size:12px;line-height:1.9;color:#4a5260;margin:2px 0}
.foot{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);font-size:11px;color:var(--dim)}
@media(max-width:760px){.wrap{margin:0;padding:20px 16px;border:0;border-radius:0}
 .kpis{grid-template-columns:repeat(2,1fr)}h1{font-size:18px}table{font-size:10px}}
@media print{body{background:#fff}.wrap{box-shadow:none;border:0;margin:0;max-width:none}}
"""


def tbl(forward):
    h = ['<table><thead><tr><th>持有期</th><th>样本</th><th>上涨<br>占比</th><th>下跌<br>占比</th>',
         '<th>明显反弹<br>&gt;5%</th><th>基准上涨<br>占比</th><th>平均<br>收益</th><th>p 值</th></tr></thead><tbody>']
    for k in ["5", "10", "20", "60", "120", "250"]:
        s = forward.get(k) or {}
        if not s.get("samples"):
            continue
        p = s.get("pDisplay") or s.get("pOneSided")
        h.append('<tr%s><td>%s 日</td><td><r>%d</r></td><td><r>%s%%</r></td><td><r>%s%%</r></td>'
                 '<td><r>%s%%</r></td><td><r>%s%%</r></td><td><r>%+.2f%%</r></td><td><r>%s</r>%s</td></tr>' %
                 (' class="sig"' if s.get("sig95") else "", k, s["samples"],
                  E(s["winRate"]), E(s["downRate"]), E(s["bounce5"]),
                  E(s["baselineWinRate"]), s.get("avgRet") or 0, E(p),
                  " <b>显著</b>" if s.get("sig95") else ""))
    h.append('</tbody></table>')
    return "".join(h)


def render():
    d = json.load(open(SRC, encoding="utf-8"))
    m = d["meta"]
    a, b, c, dd = (d["A_fullSampleQ75"], d["B_expandingQ75"],
                   d["C_rolling1250Q75"], d["D_everyDayHit_fullQ75"])
    rb = d["robustness"]
    h = ['<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         '<title>ERP 75 分位反弹研究 · EdsonStock</title><style>%s</style></head><body><div class="wrap">' % CSS]
    h.append('<div class="sub">EDSONSTOCK · ERP 75 分位（偏便宜档下界）反弹研究 · 数据截止 %s</div>' % E(m["asof"]))
    h.append('<h1>ERP 达到 75 分位后，沪深300 真的反弹了吗</h1>')
    h.append('<div class="sub">样本 %s 日（%s ~ %s）· %s</div>' %
             (m["sampleDays"], E(m["from"]), E(m["to"]), E(m["source"])))

    h.append('<h2>一、直接回答</h2>')
    h.append('<div class="kpis">')
    for k, v in [("75 分位阈值", a["thresholdErp"]),
                 ("历史达标区间", "%d 次" % a["events"]),
                 ("严格因果 · 扩展窗口", "%d 次" % b["events"]),
                 ("严格因果 · 1250 日滚动", "%d 次" % c["events"])]:
        h.append('<div class="kpi"><div class="k">%s</div><div class="v">%s</div></div>' %
                 (E(k), E(v)))
    h.append('</div>')
    h.append('<div class="note good"><b>当前状态（%s）</b>：ERP %s <b>已在 75 分位之上</b>'
             '（阈值 %s，高出 %s），即处于「偏便宜」达标区间。<br>'
             '<b>短期（5–20 日）：没有稳定反弹优势。</b>B 口径 20 日上涨 %s%%、基准 %s%%，p=%s；'
             'C 口径 20 日上涨仅 %s%%，反而低于基准。<br>'
             '<b>中长期（120–250 日）：有正收益倾向，但不稳健。</b>B 口径 120 日 %s%%（p=%s）、'
             '250 日 %s%%（p=%s）；C 口径 120 日 %s%%（p=%s）、250 日 %s%%（p=%s）不显著。'
             '差异主要来自 2008/2009 等少数历史大底。</div>' %
             (E(m["asof"]), E(a["currentErp"]), E(a["thresholdErp"]),
              E(round(a["currentErp"] - a["thresholdErp"], 4)),
              E(b["forward"]["20"]["winRate"]), E(b["forward"]["20"]["baselineWinRate"]),
              E(b["forward"]["20"]["pOneSided"]),
              E(c["forward"]["20"]["winRate"]),
              E(b["forward"]["120"]["winRate"]), E(b["forward"]["120"]["pOneSided"]),
              E(b["forward"]["250"]["winRate"]), E(b["forward"]["250"]["pOneSided"]),
              E(c["forward"]["120"]["winRate"]), E(c["forward"]["120"]["pOneSided"]),
              E(c["forward"]["250"]["winRate"]), E(c["forward"]["250"]["pOneSided"])))

    h.append('<h2>二、口径 A：全样本 75 分位（含未来函数，仅描述）</h2>')
    h.append('<div class="note warn"><b>未来函数警告</b>：%s。阈值 q75=%s，'
             '按「区间首次进入」去重后 %d 次事件，达标日 %d 天（%.1f%%）。</div>' %
             (E(m["lookahead"]["A"]), E(a["thresholdErp"]), a["events"],
              a["hitDays"], a["hitRatio"]))
    h.append(tbl(a["forward"]))

    h.append('<h2>三、口径 B：扩展窗口 75 分位（严格因果）</h2>')
    h.append('<div class="note">%s。达标日 %d 天，首次进入 <b>%d 次</b>。'
             '120/250 日显著，但见第六节样本起点检验。</div>' %
             (E(m["lookahead"]["B"]), b["hitDays"], b["events"]))
    h.append(tbl(b["forward"]))

    h.append('<h2>四、口径 C：1250 日滚动 75 分位（严格因果）</h2>')
    h.append('<div class="note">%s。达标日 %d 天，首次进入 <b>%d 次</b>。'
             '各期限均不显著，20 日上涨占比低于基准。</div>' %
             (E(m["lookahead"]["C"]), c["hitDays"], c["events"]))
    h.append(tbl(c["forward"]))

    h.append('<h2>五、页面数字为什么是 67.4%：样本重叠口径</h2>')
    h.append('<div class="note warn"><b>口径 D</b>：%s。%d 个达标日全部计入，'
             '120 日上涨 %s%% —— 与工作台页面 condProb 的 67.4%% 一致，实现复现无误。'
             '但同一段连续低估期被重复计数，p 值完全失真，不可作策略证据。</div>' %
             (E(dd["warning"]), dd["samples"], E(dd["forward"]["120"]["winRate"])))
    h.append(tbl(dd["forward"]))

    h.append('<h2>六、稳健性：样本起点敏感性</h2>')
    h.append('<div class="note warn">%s</div>' % E(rb["note"]))
    h.append('<table><thead><tr><th>扩展窗口起点</th><th>事件数</th><th>120 日胜率</th>'
             '<th>120 日 p</th><th>250 日胜率</th><th>250 日 p</th></tr></thead><tbody>')
    for start in ["500", "800", "1250", "1500", "2000"]:
        s = rb["expandingStartSensitivity"][start]
        a120, a250 = s["120"], s["250"]
        h.append('<tr><td>%s</td><td><r>%d</r></td><td><r>%s%%</r></td><td><r>%s</r></td>'
                 '<td><r>%s%%</r></td><td><r>%s</r></td></tr>' %
                 (start, a120["events"], E(a120["winRate"]), E(a120["pOneSided"]),
                  E(a250["winRate"]), E(a250["pOneSided"])))
    h.append('</tbody></table>')
    h.append('<div class="sub" style="border:0;padding:2px 0">C 滚动口径事件年份：%s</div>' %
             E("、".join("%s(%d)" % (k, v) for k, v in sorted(rb["rollingYears"].items()))))

    h.append('<h2>七、边界与免责</h2><ul>')
    for x in m["caveat"]:
        h.append('<li>%s</li>' % E(x))
    h.append('<li>本报告由 erp_q75_study.py 基于 erp.json 锁定序列计算，'
             '未修改任何 ERP 锁定数字；ERP 衡量股债性价比，不是择时信号，'
             '所有结论为统计描述，不构成投资建议。</li>')
    h.append('</ul>')
    h.append('<div class="foot">EdsonStock · 生成脚本 erp_q75_study.py / build_erp_q75_report.py · '
             '可离线打开与打印 · 工作台第 12 栏「股债利差(ERP)区间」</div>')
    h.append('</div></body></html>')
    open(OUT, "w", encoding="utf-8").write("\n".join(h))
    print("saved:", OUT, round(os.path.getsize(OUT) / 1024, 1), "KB")


if __name__ == "__main__":
    render()
