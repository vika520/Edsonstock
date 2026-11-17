#!/usr/bin/env python
"""ERP 达到 90 分位（低估线）的次数与达到后沪深300涨跌概率 · 双口径严谨统计。

口径 A（页面对齐 / 有未来函数）：阈值 = 全样本 90 分位 q90（erp.json.snapshot.thresholds[0]），
  统计 ERP >= q90 的连续区间数（应复现页面 eventCount=34），以及区间首次进入日后 N 日收益。
  注意：q90 用了整个样本（含未来），只能当描述，不能当可交易回测。

口径 B（严格因果 / 无未来函数）：阈值 = 每个交易日「截至当日」的扩展窗口 90 分位（expanding
  quantile，至少 WARM 个交易日预热），当日 ERP >= 该阈值且前一日 < 前一日阈值才算一次「首次达标」
  事件。所有信号判定只用当日及之前数据。

口径 C（严格因果 / 固定 1250 日滚动窗口，对齐页面通道）：阈值 = 过去 1250 交易日的 90 分位，
  样本量恒定、阈值漂移比 B 更平稳；同样只用当日及之前数据。

对未来收益：三个口径都按「首次达标日」去重（连续区间只取第一天），避免同一段重复计数；
再给出全样本同期基准胜率，并用单尾二项检验判断胜率是否显著高于基准。
收益用 erp.json 自带 series.close（沪深300收盘，与 ERP 同源），沪指不对齐。

输出 data/erp_q90_study.json；verbose 时打印摘要。
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SRC = os.path.join(DATA, "erp.json")
OUT = os.path.join(DATA, "erp_q90_study.json")
HORIZONS = (5, 10, 20, 60, 120, 250)
WARM = 500               # 扩展窗口预热：前 500 日不出信号，避免小样本分位抖动
EPS = 1e-12


def quantile(arr, q):
    a = sorted(arr)
    if not a:
        return None
    p = (len(a) - 1) * q
    lo, hi = int(math.floor(p)), int(math.ceil(p))
    if lo == hi:
        return a[lo]
    return a[lo] + (a[hi] - a[lo]) * (p - lo)


def binom_tail_ge(n, k, p):
    """P(X >= k), X~Bin(n,p)，log-space 避免大组合数溢出。"""
    if n <= 0:
        return 1.0
    if p <= 0:
        return 1.0 if k == 0 else 0.0
    if p >= 1:
        return 1.0 if k <= n else 0.0
    lp, lq = math.log(p), math.log1p(-p)
    tot = 0.0
    for i in range(k, n + 1):
        lc = math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1)
        tot += math.exp(lc + i * lp + (n - i) * lq)
    return min(1.0, max(0.0, tot))


def r4(x):
    return round(x, 4) if isinstance(x, (int, float)) and math.isfinite(x) else None


def stats_for(signal_idx, dates, close, h):
    """信号日后 h 个交易日沪深300收益统计，返回描述 + 单尾二项检验。"""
    valid = [t for t in signal_idx if t + h < len(close)]
    if not valid:
        return {"horizon": h, "samples": 0}
    rets = [close[t + h] / close[t] - 1 for t in valid]
    wins = sum(1 for r in rets if r > 0)
    # 全样本同期基准（同样本长度，排除尾部 h 日）
    base_all = [close[t + h] / close[t] - 1 for t in range(len(close) - h)]
    base_win = sum(1 for r in base_all if r > 0)
    base_rate = base_win / len(base_all) if base_all else 0.5
    wr = wins / len(valid)
    return {
        "horizon": h,
        "samples": len(valid),
        "wins": wins,
        "winRate": r4(wr * 100),
        "avgRet": r4(sum(rets) / len(rets) * 100),
        "medianRet": r4(quantile(rets, 0.5) * 100),
        "baselineWinRate": r4(base_rate * 100),
        "baselineSamples": len(base_all),
        "excess": r4((wr - base_rate) * 100),
        "pOneSided": r4(binom_tail_ge(len(valid), wins, base_rate)),
        "sig95": bool(binom_tail_ge(len(valid), wins, base_rate) < 0.05),
    }


def main():
    raw = json.load(open(SRC, encoding="utf-8"))
    rows = raw["series"]["rows"]
    dates = [r[0] for r in rows]
    erp = [float(r[1]) for r in rows]
    close = [float(r[4]) for r in rows]
    n = len(rows)
    assert n == len(dates) == len(erp) == len(close)
    assert all(c > 0 for c in close)

    # ---------- 口径 A：全样本固定 q90（页面对齐） ----------
    q90 = quantile(erp, 0.90)
    hit = [i for i, v in enumerate(erp) if v >= q90]
    # 连续区间 + 每个区间首次进入日
    spans = []
    cur = []
    for i, v in enumerate(erp):
        if v >= q90:
            cur.append(i)
        elif cur:
            spans.append(cur)
            cur = []
    if cur:
        spans.append(cur)
    a_entries = [s[0] for s in spans]

    # ---------- 口径 B：扩展窗口 q90，严格因果 ----------
    # 用排序维护的增量分位（n=5234，直接每次全排也可，这里为清晰用全排）
    b_entries = []
    prev_hit = False
    for t in range(WARM, n):
        q_t = quantile(erp[:t + 1], 0.90)
        hit_t = erp[t] >= q_t
        if hit_t and not prev_hit:
            b_entries.append(t)
        prev_hit = hit_t
    b_hit = sum(1 for t in range(WARM, n) if erp[t] >= quantile(erp[:t + 1], 0.90))

    # ---------- 口径 C：1250 日滚动窗口 q90，严格因果且样本量恒定 ----------
    ROLL = 1250
    c_entries, c_hit = [], 0
    prev_hit = False
    for t in range(ROLL, n):
        q_t = quantile(erp[t - ROLL:t], 0.90)   # 不含当日，纯历史窗口
        hit_t = erp[t] >= q_t
        if hit_t:
            c_hit += 1
        if hit_t and not prev_hit:
            c_entries.append(t)
        prev_hit = hit_t

    result = {
        "meta": {
            "asof": raw["asof"],
            "source": "data/erp.json → series（ERP 与沪深300收盘同源，日频 PE 为月末锚点重构）",
            "sampleDays": n,
            "from": dates[0], "to": dates[-1],
            "horizons": list(HORIZONS),
            "warmup": WARM,
            "lookahead": {
                "A": "全样本 90 分位阈值，用了未来数据，仅描述性，不可交易",
                "B": "扩展窗口分位，信号只用当日及之前数据，严格无未来函数",
                "C": "1250 日滚动窗口分位（不含当日），严格无未来函数，样本量恒定",
            },
            "caveat": [
                "ERP 低位不等于指数马上上涨，估值性价比不是择时信号。",
                "日频 PE 由月末官方锚点重构，跨季度盈利跳变被平滑。",
                "同一区间内每日样本高度重叠，按「区间首次进入日」去重后仍可能有跨区间重叠。",
                "单尾二项检验假设样本独立，重叠样本会使 p 值偏乐观（更显著），需保守解读。",
                "全样本 q90 阈值口径（A）含未来函数，仅用于复现页面 34 次与横截面描述。",
            ],
        },
        "A_fullSampleQ90": {
            "definition": "ERP ≥ 全样本 90 分位阈值的连续区间（页面口径）",
            "thresholdErp": r4(q90),
            "hitDays": len(hit),
            "hitRatio": r4(100.0 * len(hit) / n),
            "events": len(spans),
            "medianSpan": r4(quantile([len(s) for s in spans], 0.5)),
            "maxSpan": max((len(s) for s in spans), default=0),
            "currentInEvent": bool(erp[-1] >= q90),
            "currentErp": r4(erp[-1]),
            "gapToLine": r4(q90 - erp[-1]),
            "forward": {str(h): stats_for(a_entries, dates, close, h) for h in HORIZONS},
            "last6": [{"start": dates[s[0]], "end": dates[s[-1]], "days": len(s)} for s in spans[-6:]],
        },
        "B_expandingQ90": {
            "definition": "ERP ≥ 截至当日扩展窗口 90 分位，且前一日未达标（首次进入），预热 %d 日" % WARM,
            "evalFrom": dates[WARM],
            "hitDays": b_hit,
            "hitRatio": r4(100.0 * b_hit / (n - WARM)),
            "events": len(b_entries),
            "eventDates": [dates[t] for t in b_entries],
            "forward": {str(h): stats_for(b_entries, dates, close, h) for h in HORIZONS},
            "last6": [{"date": dates[t], "erp": r4(erp[t])} for t in b_entries[-6:]],
        },
        "C_rolling1250Q90": {
            "definition": "ERP ≥ 过去 %d 交易日 90 分位，且前一日未达标（首次进入），窗口不含当日" % ROLL,
            "window": ROLL,
            "evalFrom": dates[ROLL],
            "hitDays": c_hit,
            "hitRatio": r4(100.0 * c_hit / (n - ROLL)),
            "events": len(c_entries),
            "eventDates": [dates[t] for t in c_entries],
            "forward": {str(h): stats_for(c_entries, dates, close, h) for h in HORIZONS},
            "last6": [{"date": dates[t], "erp": r4(erp[t])} for t in c_entries[-6:]],
        },
    }
    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print("asof", raw["asof"], "| 样本", n, "日", dates[0], "~", dates[-1])
    print("A 全样本 q90 =", r4(q90), "| 达标日", len(hit), "| 连续区间(页面 eventCount)", len(spans),
          "| 当前 ERP", r4(erp[-1]), "| 距线", r4(q90 - erp[-1]))
    print("B 扩展窗口 q90 | 预热", WARM, "| 达标日", b_hit, "| 首次进入事件", len(b_entries))
    print("C 滚动1250 q90 | 达标日", c_hit, "| 首次进入事件", len(c_entries))
    for label, key in (("A", "A_fullSampleQ90"), ("B", "B_expandingQ90"),
                       ("C", "C_rolling1250Q90")):
        print("\n[%s] 首次达标后沪深300表现" % label)
        for h in HORIZONS:
            s = result[key]["forward"][str(h)]
            if s.get("samples"):
                print("  %3d日  n=%4d  胜率 %6.2f%%  基准 %6.2f%%  超额 %+6.2f%%  "
                      "均值 %+6.2f%%  中位 %+6.2f%%  p=%.4f %s" %
                      (h, s["samples"], s["winRate"], s["baselineWinRate"], s["excess"],
                       s["avgRet"], s["medianRet"], s["pOneSided"],
                       "显著" if s["sig95"] else ""))
    print("\nsaved:", OUT)


if __name__ == "__main__":
    main()
