"""把 wyckoff_backtest.json 渲染成单文件 HTML 研报（浅色、离线可看）。"""
import json
import os
from html import escape as esc

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "data", "wyckoff_backtest.json")
OUT = os.path.join(ROOT, "威科夫吸筹结构_近三年回测.html")


def pct(x, d=1):
    return "—" if x is None else ("%." + str(d) + "f%%") % (x * 100)


def pp(x):
    return "—" if x is None else "%+.1fpp" % (x * 100)


def ci(x, d=1):
    if not x or x[0] is None:
        return "—"
    return "[%s, %s]" % (pct(x[0], d), pct(x[1], d))


def sgn_cls(x):
    if x is None:
        return ""
    return "up" if x > 0 else ("down" if x < 0 else "")


CSS = """
*{box-sizing:border-box}
body{margin:0;background:#f5f7fa;color:#1e2733;
 font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:32px 26px 70px}
header{border-bottom:2px solid #1e2733;padding-bottom:18px;margin-bottom:26px}
h1{font-size:26px;margin:0 0 8px;letter-spacing:-.4px}
.sub{color:#6b7686;font-size:13px}
.chips{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
.chip{background:#eef2f7;border:1px solid #dfe5ed;border-radius:20px;padding:3px 11px;font-size:12px;color:#475466}
h2{font-size:18px;margin:34px 0 14px;padding-left:11px;border-left:4px solid #2f6fd0}
h3{font-size:14px;margin:20px 0 10px;color:#334155}
p{margin:9px 0}
.verdict{background:#fff8ec;border:1px solid #f0d9a8;border-left:5px solid #d99000;
 border-radius:8px;padding:18px 20px;margin-bottom:20px}
.verdict .big{font-size:19px;font-weight:700;color:#8a5a00;margin-bottom:6px}
.verdict .desc{color:#6b5840;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0 8px}
.kpi{background:#fff;border:1px solid #e3e7ed;border-radius:9px;padding:16px 18px}
.kpi .lab{font-size:12px;color:#6b7686}
.kpi .val{font-size:27px;font-weight:700;margin:6px 0 2px;letter-spacing:-.5px}
.kpi .note{font-size:12px;color:#8590a0;line-height:1.5}
.red{color:#d93a34}.green{color:#17916b}.blue{color:#2f6fd0}.amber{color:#d99000}
.card{background:#fff;border:1px solid #e3e7ed;border-radius:9px;padding:18px 20px;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff}
th,td{border-bottom:1px solid #eceff4;padding:9px 10px;text-align:left;vertical-align:top}
th{background:#f0f3f8;color:#475466;font-weight:600;font-size:12px;white-space:nowrap}
tr:last-child td{border-bottom:none}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.up{color:#d93a34;font-weight:600}.down{color:#17916b;font-weight:600}
.tag{display:inline-block;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:600}
.tag.ok{background:#e6f4ee;color:#137a58}
.tag.warn{background:#fdf0e3;color:#a2650d}
.tag.bad{background:#fdeaea;color:#b52f2a}
.tag.mute{background:#eef2f7;color:#5b6779}
.pill{display:inline-block;background:#eef2f7;border:1px solid #dfe5ed;border-radius:4px;
 padding:0 5px;margin:1px 2px 1px 0;font-size:11px;font-family:Consolas,monospace;color:#3c4a5c}
ol,ul{margin:8px 0 8px 20px;padding:0}
li{margin:6px 0}
.svgbox{background:#fff;border:1px solid #e3e7ed;border-radius:9px;padding:14px;margin:14px 0;overflow-x:auto}
svg{display:block;max-width:100%;height:auto}
svg .ax{fill:#8590a0;font-size:10px;font-family:Consolas,monospace}
svg .lbl{fill:#475466;font-size:11px;font-family:Consolas,monospace}
svg .val{font-size:11px;font-weight:600;font-family:Consolas,monospace}
svg .nm{fill:#334155;font-size:12px}
.grid{stroke:#eceff4;stroke-width:1}
.zero{stroke:#9aa5b3;stroke-width:1.2}
pre{background:#1f2733;color:#dce4ee;border-radius:8px;padding:14px 16px;overflow-x:auto;
 font:12px/1.7 Consolas,monospace}
.note{font-size:12px;color:#6b7686;margin-top:8px}
.foot{margin-top:34px;padding-top:16px;border-top:1px solid #dfe5ed;color:#8590a0;font-size:12px}
@media(max-width:760px){.kpis{grid-template-columns:1fr}.wrap{padding:20px 14px 50px}}
@media print{body{background:#fff}.card,.kpi,.svgbox{break-inside:avoid}}
"""


def svg_returns(sigs):
    W, H, zero, scale = 900, 390, 230, 20
    p = ['<svg viewBox="0 0 %d %d" role="img" aria-label="12 次信号的 20 日收益分布">' % (W, H)]
    for v in (-5, 0, 5, 10, 15, 20):
        x = zero + v * scale
        p.append('<line x1="%.1f" y1="18" x2="%.1f" y2="%d" class="%s"/>'
                 % (x, x, H - 28, "zero" if v == 0 else "grid"))
        p.append('<text x="%.1f" y="%d" text-anchor="middle" class="ax">%+d%%</text>'
                 % (x, H - 10, v))
    for i, s in enumerate(sigs):
        y = 36 + i * 27
        v = (s["ret20"] or 0) * 100
        w = abs(v) * scale
        x = zero if v >= 0 else zero - w
        col = "#d93a34" if v >= 0 else "#17916b"
        op = "0.95" if abs(v) > 10 else "0.78"
        d = s["date"]
        p.append('<text x="10" y="%d" class="lbl">%s/%s/%s</text>'
                 % (y + 4, d[2:4], d[4:6], d[6:8]))
        p.append('<rect x="%.1f" y="%d" width="%.1f" height="16" rx="2" fill="%s" opacity="%s"/>'
                 % (x, y - 8, w, col, op))
        tx = x + w + 6 if v >= 0 else x - 6
        anc = "start" if v >= 0 else "end"
        p.append('<text x="%.1f" y="%d" text-anchor="%s" class="val" fill="%s">%+.2f%%</text>'
                 % (tx, y + 4, anc, col, v))
        if abs(v) > 15:
            p.append('<text x="%.1f" y="%d" text-anchor="start" class="ax" fill="%s">← 极端行情</text>'
                     % (min(W - 110, x + w + 82), y + 4, col))
    p.append("</svg>")
    return "".join(p)


def svg_winrate(m):
    W, H, x0, scale = 900, 158, 190, 6.0
    rows = [("Phase C 信号 · 20 日胜率", m["win20"], m["win20_ci"], "#d93a34"),
            ("全样本基准 · 20 日胜率", m["baseline_win20"], m["baseline_ci"], "#6b7686")]
    p = ['<svg viewBox="0 0 %d %d" role="img" aria-label="胜率与 Wilson 置信区间对比">' % (W, H)]
    for v in (0, 25, 50, 75, 100):
        x = x0 + v * scale
        p.append('<line x1="%.1f" y1="16" x2="%.1f" y2="%d" class="grid"/>' % (x, x, H - 24))
        p.append('<text x="%.1f" y="%d" text-anchor="middle" class="ax">%d%%</text>' % (x, H - 8, v))
    for i, (name, val, cci, col) in enumerate(rows):
        y = 42 + i * 54
        p.append('<text x="%d" y="%d" text-anchor="end" class="nm">%s</text>' % (x0 - 14, y + 5, esc(name)))
        w = val * 100 * scale
        p.append('<rect x="%d" y="%d" width="%.1f" height="20" rx="3" fill="%s" opacity="0.85"/>'
                 % (x0, y - 10, w, col))
        p.append('<text x="%.1f" y="%d" class="val" fill="%s">%s</text>'
                 % (x0 + w + 8, y + 5, col, pct(val)))
        if cci and cci[0] is not None:
            a, b = x0 + cci[0] * 100 * scale, x0 + cci[1] * 100 * scale
            p.append('<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="%s" stroke-width="1.6"/>'
                     % (a, y + 18, b, y + 18, col))
            p.append('<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="%s" stroke-width="1.6"/>'
                     % (a, y + 13, a, y + 23, col))
            p.append('<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="%s" stroke-width="1.6"/>'
                     % (b, y + 13, b, y + 23, col))
            p.append('<text x="%.1f" y="%d" class="ax">Wilson 95%% CI %s</text>'
                     % (b + 8, y + 22, ci(cci)))
    p.append("</svg>")
    return "".join(p)


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    m, meta, cfg, design = d["main"], d["meta"], d["config"], d["design"]
    leak, eq, sens, subs = d["leak_tests"], d["equivalence"], d["sensitivity"], d["subsamples"]

    not_sig = (m["binom_p_one_sided"] is not None and m["binom_p_one_sided"] > 0.05
               and m["bootstrap_diff_ci"][0] < 0 < m["bootstrap_diff_ci"][1])
    verdict = "没有未来函数，但也没有证据表明存在稳定的准确率优势" if not_sig else \
              "结果需进一步核查，暂不下结论"

    P = []
    P.append('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
             '<meta name="viewport" content="width=device-width,initial-scale=1">'
             '<title>%s</title><style>%s</style></head><body><div class="wrap">'
             % (esc(meta["title"]), CSS))

    # header
    P.append('<header><h1>%s</h1><div class="sub">%s · 评估期 %s ~ %s · 数据 %s 根（%s ~ %s）</div>'
             '<div class="chips">'
             % (esc(meta["title"]), esc(meta["symbol"]), meta["eval_from"], meta["eval_to"],
                meta["data_rows"], meta["data_from"], meta["data_to"]))
    for c in ["生成 %s" % meta["generatedAt"], "主周期 20 交易日",
              "随机种子 %d" % meta["seed"], "bootstrap %d 次 / block %d" % (meta["bootstrap"], meta["block"]),
              "数据源：腾讯日线 OHLCV"]:
        P.append('<span class="chip">%s</span>' % esc(c))
    P.append('</div></header>')

    # verdict
    P.append('<div class="verdict"><div class="big">%s</div>'
             '<div class="desc">12 次「首次进入 Phase C 候选」信号中，8 次 20 日后上涨（66.7%%），'
             '高于全样本基准 53.0%%，但单尾二项 p=%.4f、分块 bootstrap 差值 CI %s 跨 0，'
             '且只有 3/12 真正升级出 SOS。默认参数下看似占优，换横盘阈值或滚动窗口即翻负，'
             '不能作为有效策略证据。</div></div>'
             % (esc(verdict), m["binom_p_one_sided"],
                "[%s, %s]" % (pp(m["bootstrap_diff_ci"][0]), pp(m["bootstrap_diff_ci"][1]))))

    # KPI
    P.append('<div class="kpis">')
    P.append('<div class="kpi"><div class="lab">主指标 1 · 结构兑现率</div>'
             '<div class="val amber">%s</div><div class="note">%d/%d 次在 20 根内升级到 Phase D（出现 SOS）<br>Wilson 95%% CI %s</div></div>'
             % (pct(m["sos_rate"]), m["sos_realized"], m["complete_count"], ci(m["sos_ci"])))
    P.append('<div class="kpi"><div class="lab">主指标 2 · 20 日方向胜率</div>'
             '<div class="val red">%s</div><div class="note">基准 %s · 差 %s<br>单尾二项 p=%.4f（不显著）</div></div>'
             % (pct(m["win20"]), pct(m["baseline_win20"]), pp(m["diff"]), m["binom_p_one_sided"]))
    P.append('<div class="kpi"><div class="lab">收益质量 · 剔除最好一次</div>'
             '<div class="val blue">%s</div><div class="note">原平均 %s → 剔除 2024-09-19（+%.2f%%）后 %s<br>胜率仍 %s，但收益幅度几乎归零</div></div>'
             % (("%+.2f%%" % (m["excl_best_avg_ret20"] * 100)),
                ("%+.2f%%" % (m["avg_ret20"] * 100)), m["max_ret20"] * 100,
                ("%+.2f%%" % (m["excl_best_avg_ret20"] * 100)), pct(m["excl_best_win20"])))
    P.append('</div>')

    # 1 结论
    P.append('<h2>一、结论怎么读</h2><div class="card"><ol>'
             '<li><b>「准确率」有两个口径。</b>结构口径：Phase C 是否真的走向 SOS/Phase D → <b>%s</b>；'
             '交易口径：之后 20 日指数是否上涨 → <b>%s</b>。两者不一致，说明指数上涨并不等于威科夫吸筹成立。</li>'
             '<li><b>66.7%% 不构成统计证据。</b>只有 %d 个信号，Wilson 95%% CI %s 很宽；'
             '相对基准的单尾二项 p=%.4f，分块 bootstrap 差值 CI %s 跨 0。</li>'
             '<li><b>正收益高度依赖单次极端行情。</b>2024-09-19 信号后 20 日 +%.2f%%（政策驱动），'
             '剔除该次后平均收益从 %+.2f%% 降到 %+.2f%%，接近「小涨多次 + 一次暴涨」。</li>'
             '<li><b>参数敏感，结论不稳。</b>横盘阈值改到 0.075 → 胜率 %s（差 %s）；'
             '滚动窗口改到 80 → 胜率 %s（差 %s）。默认参数的 +%s 不能外推。</li>'
             '<li><b>没有未来函数，但仍有事后选择偏差。</b>区间是每个 t 用过去数据回看选出的，'
             '因果上合法但属结构描述；页面原式用全样本末端判读，本回测已把它改造成逐根截断版。</li>'
             '</ol></div>'
             % (pct(m["sos_rate"]), pct(m["win20"]), m["complete_count"], ci(m["win20_ci"]),
                m["binom_p_one_sided"],
                "[%s, %s]" % (pp(m["bootstrap_diff_ci"][0]), pp(m["bootstrap_diff_ci"][1])),
                m["max_ret20"] * 100, m["avg_ret20"] * 100, m["excl_best_avg_ret20"] * 100,
                pct(sens[1]["win20"]), pp(sens[1]["diff"]),
                pct(sens[4]["win20"]), pp(sens[4]["diff"]),
                ("%.1fpp" % (m["diff"] * 100))))

    # 2 设计
    P.append('<h2>二、回测设计：怎么排除未来函数与过拟合</h2>')
    P.append('<table><thead><tr><th style="width:22%">项目</th><th style="width:42%">做法</th><th>为什么</th></tr></thead><tbody>')
    rows = [
        ("因果重算", "在 t 时刻只把 <code>rows[:t+1]</code> 交给判定函数，物理截断未来 K 线", "任何 t+1 及以后数据都进不了判定"),
        ("事件确认", "Spring 需 T+1 次根不破新低；AR 需 ZigZag 反向确认；量能均线右移 1 根只含 t-20..t-1", "不使用尚未确认的峰谷与当期量能"),
        ("成交口径", design["entry"], "信号 t 收盘后才可知，最早 t+1 收盘建仓，不偷看信号日之后的价格"),
        ("信号去重", design["dedup"], "避免同一横盘区间被反复计成多个样本、夸大显著性"),
        ("预设指标", "主指标在跑数前写死：结构兑现率 + 20 日方向胜率；5/10 日仅探索性", "防止事后挑最好看的持有期"),
        ("参数固定", "win=%d / rev=%s / volK=%s / rthr=%s / minlen=%d，全部沿用页面默认值"
         % (cfg["win"], cfg["rev"], cfg["volK"], cfg["rthr"], cfg["minlen"]), "不搜索、不调参；敏感性只展示稳定性，不反选最优"),
        ("样本切分", "评估期 %s ~ %s，之前数据仅作预热；另做前半/后半稳定性"
         % (meta["eval_from"], meta["eval_to"]), "避免用未来数据参与规则形成"),
        ("统计口径", "Wilson CI + 单尾二项检验 + 循环分块 bootstrap（block=%d）" % meta["block"],
         "处理重叠窗口自相关与小样本，不做多重比较选优"),
        ("等价性", "先在页面同源 320 根数据上复现 JS 判读，通过后才回测", "保证回测的不是另一套算法"),
    ]
    for a, b, c in rows:
        P.append('<tr><td><b>%s</b></td><td>%s</td><td>%s</td></tr>' % (esc(a), b, esc(c)))
    P.append('</tbody></table>')
    P.append('<p class="note">注：页面 <code>wb_wyckoff.js</code> 的 caveat 原文写明「不能把这张图当作实时买卖信号或回测依据」。'
             '本回测是把它改造成逐根因果版本后的结果，<b>不等同于页面当前标签的预测能力</b>。</p>')

    # 3 自检
    P.append('<h2>三、未来函数自检（%d 个抽样时点）</h2>' % leak["checked_points"])
    P.append('<table><thead><tr><th style="width:26%">检查</th><th style="width:14%">结果</th><th>含义</th></tr></thead><tbody>')
    checks = [
        ("截断不变性", leak["truncation_invariant"], "ok",
         "evaluate_at(t, rows) 与 evaluate_at(t, rows[:t+1]) 状态完全一致"),
        ("未来篡改不变性", leak["future_poison_invariant"], "ok",
         "把 t+1 之后全部替换成极端行情，t 时刻状态仍不变"),
        ("负对照：故意偷看未来", leak["negative_control_changed"], "warn",
         "一个直接读取 t+1..t+20 最高价的 leaky 判据必须被篡改改变 → 证明检测器不是摆设"),
        ("页面原式对照", leak["page_fullsample_changed"], "bad",
         "全样本 compute() 的状态 %s → 篡改未来后 %s，确实会被未来数据改变；逐根版不会"
         % (leak["page_fullsample_state_original"], leak["page_fullsample_state_after_future_poison"])),
    ]
    for name, ok, kind, desc in checks:
        if kind == "ok":
            badge = ("通过", "ok") if ok else ("失败", "bad")
        elif kind == "warn":
            badge = ("已改变", "warn") if ok else ("检测器失效", "bad")
        else:
            badge = ("被改变", "bad") if ok else ("未改变", "mute")
        P.append('<tr><td><b>%s</b></td><td><span class="tag %s">%s</span></td><td>%s</td></tr>'
                 % (esc(name), badge[1], badge[0], esc(desc)))
    P.append('</tbody></table>')
    P.append('<p class="note">前两项为回测引擎必须成立；第三项验证检测器有效；第四项解释为什么页面原式不能直接用做回测。'
             '等价性验证另见第七节。</p>')

    # 4 核心结果
    P.append('<h2>四、核心结果</h2>')
    P.append('<div class="svgbox">%s</div>' % svg_winrate(m))
    P.append('<table><thead><tr><th>指标</th><th class="num">数值</th><th>区间 / 检验</th><th>解读</th></tr></thead><tbody>')
    core = [
        ("有效信号", "%d / %d" % (m["complete_count"], m["signal_count"]), "—", "12 个信号全部有完整 20 日前瞻"),
        ("结构兑现率", pct(m["sos_rate"]), "Wilson %s" % ci(m["sos_ci"]), "仅 3 次升级出 SOS，Phase C 多数没走成 Phase D"),
        ("20 日方向胜率", pct(m["win20"]), "Wilson %s" % ci(m["win20_ci"]), "8 涨 4 跌"),
        ("全样本基准", pct(m["baseline_win20"]), "Wilson %s · n=%d" % (ci(m["baseline_ci"]), m["baseline_sample"]), "同期所有交易日的 20 日上涨概率"),
        ("相对基准差", pp(m["diff"]), "单尾二项 p=%.4f" % m["binom_p_one_sided"], "p>0.05，不显著"),
        ("bootstrap 差值 CI", "[%s, %s]" % (pp(m["bootstrap_diff_ci"][0]), pp(m["bootstrap_diff_ci"][1])),
         "block=%d / %d 次" % (meta["block"], meta["bootstrap"]), "跨 0，不能拒绝「无优势」"),
        ("平均 / 中位 20 日收益", "%+.2f%% / %+.2f%%" % (m["avg_ret20"] * 100, m["median_ret20"] * 100),
         "最好 %+.2f%% / 最差 %+.2f%%" % (m["max_ret20"] * 100, m["min_ret20"] * 100), "被 2024-09 单次主导"),
        ("剔除最好一次", "平均 %+.2f%% · 胜率 %s" % (m["excl_best_avg_ret20"] * 100, pct(m["excl_best_win20"])),
         "纯描述性", "收益幅度几乎归零"),
        ("5 日 / 10 日胜率", "%s / %s" % (pct(m["ret5_win"]), pct(m["ret10_win"])), "探索性，未做多重比较校正", "不作为主结论"),
    ]
    for a, b, c, e in core:
        P.append('<tr><td><b>%s</b></td><td class="num">%s</td><td>%s</td><td>%s</td></tr>'
                 % (esc(a), esc(b), esc(c), esc(e)))
    P.append('</tbody></table>')
    P.append('<h3>12 次信号的 20 日收益（红涨 / 绿跌，A 股口径）</h3>')
    P.append('<div class="svgbox">%s</div>' % svg_returns(d["signals"]))

    # 5 明细
    P.append('<h2>五、12 次信号明细</h2>')
    P.append('<table><thead><tr><th>信号日</th><th class="num">收盘</th><th class="num">区间下沿 / 上沿</th>'
             '<th class="num">区间长度</th><th>识别事件</th><th class="num">20 日收益</th><th>20 日内 SOS</th></tr></thead><tbody>')
    for s in d["signals"]:
        ev = "".join('<span class="pill">%s</span>' % esc(e["code"]) for e in s["events"])
        r = s["ret20"]
        P.append('<tr><td>%s</td><td class="num">%.2f</td><td class="num">%.2f / %.2f</td>'
                 '<td class="num">%d</td><td>%s</td><td class="num %s">%s</td><td>%s</td></tr>'
                 % (s["date"], s["close"], s["range_lo"], s["range_hi"], s["range_len"], ev,
                    sgn_cls(r), ("%+.2f%%" % (r * 100)) if r is not None else "—",
                    ('<span class="tag ok">%s</span>' % s["sos_date"]) if s["sos_within20"]
                    else '<span class="tag mute">未升级</span>'))
    P.append('</tbody></table>')
    P.append('<p class="note">2025-07-21 那次区间长度 134 根、事件顺序出现 SC 在最后，'
             '属于区间重选后的边界抖动，其「次日 SOS」不宜当作干净的结构突破样本。</p>')

    # 6 稳健性
    P.append('<h2>六、稳健性：子样本与参数敏感性</h2><h3>6.1 时间子样本</h3>')
    P.append('<table><thead><tr><th>区间</th><th class="num">信号数</th><th class="num">20 日胜率</th>'
             '<th class="num">同期基准</th><th class="num">差值</th><th class="num">SOS 兑现率</th></tr></thead><tbody>')
    for s in subs:
        P.append('<tr><td>%s ~ %s</td><td class="num">%d</td><td class="num">%s</td>'
                 '<td class="num">%s</td><td class="num %s">%s</td><td class="num">%s</td></tr>'
                 % (s["from"], s["to"], s["n"], pct(s["win20"]), pct(s["baseline_win20"]),
                    sgn_cls(s["diff"]), pp(s["diff"]), pct(s["sos_rate"])))
    P.append('</tbody></table>')
    P.append('<p class="note">两段方向同为正，但后半段只有 4 个信号；样本太少，不能视为样本外验证。</p>')

    P.append('<h3>6.2 单因子参数敏感性（只展示，不用于选参）</h3>')
    P.append('<table><thead><tr><th>参数变动</th><th class="num">完整信号</th><th class="num">SOS 兑现率</th>'
             '<th class="num">20 日胜率</th><th class="num">相对基准</th><th class="num">平均收益</th></tr></thead><tbody>')
    for s in sens:
        P.append('<tr><td>%s</td><td class="num">%d / %d</td><td class="num">%s</td>'
                 '<td class="num">%s</td><td class="num %s">%s</td><td class="num">%s</td></tr>'
                 % (esc(s["label"]), s["complete_count"], s["signal_count"], pct(s["sos_rate"]),
                    pct(s["win20"]), sgn_cls(s["diff"]), pp(s["diff"]),
                    ("%+.2f%%" % (s["avg_ret20"] * 100)) if s["avg_ret20"] is not None else "—"))
    P.append('</tbody></table>')
    P.append('<p class="note">横盘阈值 0.075、滚动窗口 80 两组差值转负；'
             'ZigZag rev 与部分放量阈值对结果影响小。结论对区间参数敏感，默认参数的正差值不能外推。'
             '<b>本表不是参数优化结果，任何「换参数后更好」都不构成证据。</b></p>')

    # 7 等价性
    P.append('<h2>七、与页面规则的等价性验证</h2><div class="card">')
    P.append('<p><span class="tag %s">%s</span> 用页面同源的 <code>data/wyckoff.json</code>（320 根新浪日线）跑 Python 移植版，'
             '得到 <b>%s</b>，共 %d 个事件，与 <code>wy_diag.py</code> 从工作台读到的页面判读一致。</p>'
             % ("ok" if eq["passed"] else "bad", "PASS" if eq["passed"] else "FAIL",
                esc(eq["phase_label"]), eq["event_count"]))
    P.append('<p>')
    for e in eq["events"]:
        P.append('<span class="pill">%s %s · %.2f×</span>' % (esc(e["code"]), e["date"], e["vr"]))
    P.append('</p><p class="note">验证通过后，回测才切换到 1177 根腾讯长历史日线。'
             '两源收盘价舍入口径不同（新浪 3 位小数 / 腾讯 2 位），事件不会逐一对应，但规则一致。</p></div>')

    # 8 局限
    P.append('<h2>八、局限与免责声明</h2><div class="card"><ul>')
    for c in d["caveats"]:
        P.append('<li>%s</li>' % esc(c))
    P.append('</ul></div>')

    # 9 复现
    P.append('<h2>九、复现</h2><pre>cd wolf-cycle\n'
             'python fetch_wyckoff_history.py      # 抓 2022 年以来上证日线 OHLCV\n'
             'python backtest_wyckoff.py           # 因果回测 + 自检 + 敏感性\n'
             'python build_wyckoff_backtest_report.py   # 生成 HTML 研报\n'
             'python preview_wyckoff_backtest.py  # Playwright 点检 + 截图</pre>')
    P.append('<div class="foot">%s · 数据源：%s · 生成脚本 %s · 结构统计，不构成投资建议</div>'
             % (esc(meta["title"]), esc(meta["data_source"]), esc(meta["script"])))
    P.append('</div></body></html>')

    import brand
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(brand.apply("".join(P)))
    print("saved:", OUT, round(os.path.getsize(OUT) / 1024, 1), "KB")


if __name__ == "__main__":
    main()
