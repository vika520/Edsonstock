#!/usr/bin/env python
"""ERP 达到 75 分位（偏便宜档下界）后是否反弹 · 三口径严谨统计。

复用 erp_q90_study.py 的 quantile / binom_tail_ge / r4 / stats_for，口径完全对齐：
  A 全样本 q75 阈值（页面 condProb 的阈值口径，含未来函数）
  B 扩展窗口 q75（严格因果）
  C 1250 日滚动窗口 q75（严格因果，样本量恒定）
  D 全样本 q75 下「每个达标日都算」（页面 condProb 的重叠口径，不可用于策略）

除常规胜率外，增加「明显反弹」定义：持有期末沪深300涨幅 > 5% 的占比；
同时给出下跌占比，便于直接回答「到了之后是涨还是跌」。

输出 data/erp_q75_study.json。
"""
import json
import math
import os

from erp_q90_study import quantile, binom_tail_ge, r4, stats_for

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SRC = os.path.join(DATA, "erp.json")
OUT = os.path.join(DATA, "erp_q75_study.json")
HORIZONS = (5, 10, 20, 60, 120, 250)
WARM = 500
ROLL = 1250


def bounce_stats(signal_idx, close, h):
    """在 stats_for 基础上补充明显反弹(>5%)与下跌占比，二项检验对基准。"""
    base = stats_for(signal_idx, [""] * len(close), close, h)
    valid = [t for t in signal_idx if t + h < len(close)]
    if not valid:
        base.update({"bounce5": None, "bounce5Base": None, "downRate": None})
        return base
    rets = [close[t + h] / close[t] - 1 for t in valid]
    base_all = [close[t + h] / close[t] - 1 for t in range(len(close) - h)]
    b5 = sum(1 for r in rets if r > 0.05)
    b5_base = sum(1 for r in base_all if r > 0.05)
    base.update({
        "bounce5": r4(100.0 * b5 / len(rets)),
        "bounce5Base": r4(100.0 * b5_base / len(base_all)),
        "bounce5P": binom_tail_ge(len(rets), b5, b5_base / len(base_all)),
        "downRate": r4(100.0 * sum(1 for r in rets if r < 0) / len(rets)),
    })
    base["bounce5PDisplay"] = ("<0.0001" if base["bounce5P"] < 0.0001
                               else "%.4f" % base["bounce5P"])
    base["pDisplay"] = ("<0.0001" if base["pOneSided"] < 0.0001
                        else "%.4f" % base["pOneSided"])
    return base


def all_stats(signal_idx, close, key):
    return {str(h): bounce_stats(signal_idx, close, h) for h in HORIZONS}


def main():
    raw = json.load(open(SRC, encoding="utf-8"))
    rows = raw["series"]["rows"]
    dates = [r[0] for r in rows]
    erp = [float(r[1]) for r in rows]
    close = [float(r[4]) for r in rows]
    n = len(rows)
    assert n == len(dates) == len(erp) == len(close) and all(c > 0 for c in close)

    q75 = quantile(erp, 0.75)

    # A 全样本固定阈值
    spans, cur = [], []
    for i, v in enumerate(erp):
        if v >= q75:
            cur.append(i)
        elif cur:
            spans.append(cur); cur = []
    if cur:
        spans.append(cur)
    a_first = [s[0] for s in spans]
    a_every = [i for i, v in enumerate(erp) if v >= q75]

    # B 扩展窗口
    b_first, b_hit, prev = [], 0, False
    for t in range(WARM, n):
        hit = erp[t] >= quantile(erp[:t + 1], 0.75)
        if hit:
            b_hit += 1
        if hit and not prev:
            b_first.append(t)
        prev = hit

    # C 1250 日滚动
    c_first, c_hit, prev = [], 0, False
    for t in range(ROLL, n):
        hit = erp[t] >= quantile(erp[t - ROLL:t], 0.75)
        if hit:
            c_hit += 1
        if hit and not prev:
            c_first.append(t)
        prev = hit

    result = {
        "meta": {
            "asof": raw["asof"],
            "quantile": 75,
            "source": "data/erp.json → series（ERP 与沪深300收盘同源）",
            "sampleDays": n, "from": dates[0], "to": dates[-1],
            "horizons": list(HORIZONS), "warmup": WARM, "roll": ROLL,
            "bounceDef": "反弹＝持有期末沪深300收盘 > 期初；明显反弹＝涨幅 > 5%",
            "lookahead": {
                "A": "全样本 75 分位阈值，含未来数据，仅描述",
                "B": "扩展窗口 75 分位，严格因果",
                "C": "1250 日滚动 75 分位，严格因果，样本量恒定",
                "D": "全样本阈值 + 每个达标日重复计数，样本高度重叠，不可用于策略",
            },
            "caveat": [
                "ERP 高位是估值性价比，不是指数上涨的择时信号。",
                "日频 PE 由月末官方锚点重构，非官方日频发布值。",
                "事件按区间首次进入去重，但跨区间仍可能重叠，二项检验 p 值偏乐观。",
                "75 分位达标日约占全样本 25%，样本重叠比 90 分位更严重。",
            ],
        },
        "A_fullSampleQ75": {
            "thresholdErp": r4(q75), "hitDays": len(a_every),
            "hitRatio": r4(100.0 * len(a_every) / n),
            "events": len(spans),
            "medianSpan": r4(quantile([len(s) for s in spans], 0.5)),
            "maxSpan": max((len(s) for s in spans), default=0),
            "currentInEvent": bool(erp[-1] >= q75), "currentErp": r4(erp[-1]),
            "gapToLine": r4(q75 - erp[-1]),
            "forward": all_stats(a_first, close, "A"),
            "last6": [{"start": dates[s[0]], "end": dates[s[-1]], "days": len(s)}
                      for s in spans[-6:]],
        },
        "B_expandingQ75": {
            "evalFrom": dates[WARM], "hitDays": b_hit,
            "hitRatio": r4(100.0 * b_hit / (n - WARM)), "events": len(b_first),
            "forward": all_stats(b_first, close, "B"),
            "last6": [{"date": dates[t], "erp": r4(erp[t])} for t in b_first[-6:]],
        },
        "C_rolling1250Q75": {
            "evalFrom": dates[ROLL], "hitDays": c_hit,
            "hitRatio": r4(100.0 * c_hit / (n - ROLL)), "events": len(c_first),
            "forward": all_stats(c_first, close, "C"),
            "last6": [{"date": dates[t], "erp": r4(erp[t])} for t in c_first[-6:]],
        },
        "D_everyDayHit_fullQ75": {
            "samples": len(a_every),
            "forward": all_stats(a_every, close, "D"),
            "warning": "每个达标日都算样本，连续区间高度重叠；这是页面 condProb 的采样方式，不可作为策略证据",
        },
    }
    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print("asof", raw["asof"], "| 样本", n, "日")
    print("q75 =", r4(q75), "| 达标日", len(a_every), "(%.1f%%)" % (100 * len(a_every) / n),
          "| 连续区间", len(spans), "| 当前 ERP", r4(erp[-1]),
          "| 距线", r4(q75 - erp[-1]))
    print("B 扩展窗口 达标日", b_hit, "首次进入", len(b_first))
    print("C 滚动1250 达标日", c_hit, "首次进入", len(c_first))
    for label, key in (("A", "A_fullSampleQ75"), ("B", "B_expandingQ75"),
                       ("C", "C_rolling1250Q75"), ("D", "D_everyDayHit_fullQ75")):
        print("\n[%s] 达标后沪深300" % label)
        for h in HORIZONS:
            s = result[key]["forward"][str(h)]
            print("  %3d日 n=%4d 上涨%6.2f%% 下跌%6.2f%% 明显反弹(>5%%)%6.2f%% "
                  "基准上涨%6.2f%% 均值%+6.2f%% p=%s" %
                  (h, s["samples"], s["winRate"], s["downRate"], s["bounce5"],
                   s["baselineWinRate"], s["avgRet"], s["pDisplay"]))
    print("\nsaved:", OUT)


if __name__ == "__main__":
    main()
