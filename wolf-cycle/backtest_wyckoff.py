"""威科夫吸筹结构 · 近三年严格因果回测（无未来函数 / 不调参）。

背景
----
页面 wb_wyckoff.js 的 compute() 是「全样本末端一次性判读」，其 caveat 明确写了
「不能把这张图当作实时买卖信号或回测依据」。本脚本把同一套事件规则改造成
**逐根截断的因果版本**：在 t 时刻只把 rows[:t+1] 交给判定函数，
物理上不可能读到 t+1 及以后任何一根 K 线。

预设（回测前写死，不参与优化）
------------------------------
- 主指标 1「结构兑现率」：首次进入 Phase C 候选后 20 根内是否升级到 Phase D（出现 SOS）
- 主指标 2「方向胜率」：同一批信号后 20 个交易日上证指数上涨比例
- 成交口径：信号在 t 收盘后确认，用 t+1 收盘建仓、t+21 收盘平仓（20 个交易日间隔）
- 去重：状态首次进入 C + 20 根冷却
- 参数：完全沿用页面默认值 win=60 / rev=0.025 / volK=1.4 / rthr=0.095 / minlen=18
- 不搜索参数；敏感性只做单因子稳健性展示，绝不反选最优参数

统计
----
- Wilson 95% CI
- 相对全样本基准的单尾二项检验（log-space，避免组合数溢出）
- 循环分块 bootstrap（block=20）给出胜率差 95% CI，处理重叠窗口自相关
- 前半 / 后半子样本稳定性

未来函数自检
------------
1) 截断不变性：evaluate_at(t, rows) == evaluate_at(t, rows[:t+1])
2) 未来篡改不变性：把 t+1 之后的行情全部替换，t 时刻状态不变
3) 负对照：故意偷看未来 20 日最高价的 leaky 判据必须被篡改改变
4) 页面原式对照：全样本 compute() 会被未来数据改变，逐根版不会

输出 data/wyckoff_backtest.json
"""
import json
import math
import os
import random
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
HIST = os.path.join(DATA, "wyckoff_history.json")
PAGE = os.path.join(DATA, "wyckoff.json")
OUT = os.path.join(DATA, "wyckoff_backtest.json")

EVAL_FROM = "20231114"          # 近三年（相对 asof 2026-11-13）
HORIZON = 20
SEED = 20261114
BOOT = 3000
BLOCK = 20

DEFAULT = {
    "win": 60, "rev": 0.025, "volK": 1.4,
    "rthr": 0.095, "minlen": 18,
    "cooldown": 20, "horizon": HORIZON,
}


# ---------------------------------------------------------------- 基础工具
def clamp(v, a, b):
    return max(a, min(b, v))


def quantile(a, q):
    s = sorted(a)
    return s[clamp(int(q * (len(s) - 1)), 0, len(s) - 1)]


def ma_shift1(a, n):
    """等价 wb_core.js 的 ma(arr,n,1)：out[i] = mean(a[i-n .. i-1])，不含当期。"""
    out = [None] * len(a)
    s, c = 0.0, 0
    for i in range(len(a)):
        k = i - 1
        if k >= 0 and a[k] is not None:
            s += a[k]
            c += 1
        if k - n >= 0 and a[k - n] is not None:
            s -= a[k - n]
            c -= 1
        if c == n:
            out[i] = s / n
    return out


def zigzag(rows, s, e, rev):
    """等价 wb_wyckoff.js 的因果 ZigZag；峰谷只有在后续反向 rev 才被确认。"""
    piv = []
    trend, ext, ext_i = 0, rows[s][4], s
    for i in range(s + 1, e):
        c = rows[i][4]
        if trend >= 0 and c > ext:
            ext, ext_i = c, i
        if trend <= 0 and c < ext:
            ext, ext_i = c, i
        if trend >= 0 and c < ext * (1 - rev):
            piv.append({"i": ext_i, "t": "H", "p": ext, "confirm": i})
            trend, ext, ext_i = -1, c, i
        elif trend <= 0 and c > ext * (1 + rev):
            piv.append({"i": ext_i, "t": "L", "p": ext, "confirm": i})
            trend, ext, ext_i = 1, c, i
    return piv


def precompute_flat(rows, cfg):
    """flat[i] 只依赖 rows[i-win:i]，与未来无关，可整段预计算后逐根复用。"""
    n = len(rows)
    win = min(cfg["win"], n // 3)
    flat = [0] * n
    for i in range(win, n):
        hs = [rows[k][2] for k in range(i - win, i)]
        ls = [rows[k][3] for k in range(i - win, i)]
        hi, lo = quantile(hs, 0.92), quantile(ls, 0.08)
        flat[i] = 1 if (hi - lo) / lo < cfg["rthr"] else 0
    return flat, win


# ---------------------------------------------------------------- 事件判定
def compute(hist, cfg, flat_pre=None, win_pre=None):
    """只用 hist 内部数据；调用方必须保证 hist 不含未来 K 线。"""
    n = len(hist)
    res = {"code": "N", "label": "数据不足", "rng": None, "events": [], "vr": []}
    if n < 80:
        return res

    if flat_pre is not None and win_pre is not None and min(cfg["win"], n // 3) == win_pre:
        flat, win = flat_pre[:n], win_pre
    else:
        flat, win = precompute_flat(hist, cfg)

    last = -1
    for i in range(n - 1, win - 1, -1):
        if flat[i]:
            last = i
            break
    if last < 0:
        res["label"] = "最近窗口未识别到横盘吸筹区间（可放宽窗口或换周期）"
        return res
    start = last
    while start > win and flat[start - 1]:
        start -= 1
    if last - start < cfg["minlen"]:
        res["label"] = "横盘区间过短，不足以判读"
        return res

    hs = [hist[i][2] for i in range(start, last + 1)]
    ls = [hist[i][3] for i in range(start, last + 1)]
    hi, lo = quantile(hs, 0.92), quantile(ls, 0.08)
    rng = {"start": start, "end": last, "hi": hi, "lo": lo, "w": (hi - lo) / lo}
    res["rng"] = rng

    vol = [r[5] for r in hist]
    vma = ma_shift1(vol, 20)
    vr = [vol[i] / vma[i] if vma[i] else 1.0 for i in range(n)]
    res["vr"] = vr

    events = []

    def add(i, code, note, lag=0):
        if i is None or i < 0 or i >= n:
            return
        if any(e["i"] == i and e["code"] == code for e in events):
            return
        events.append({"i": i, "code": code, "note": note, "lag": lag,
                       "px": hist[i][4], "vr": vr[i], "t": hist[i][0]})

    add(start, "PS", "区间起点，跌势放缓")

    sc, sc_score = -1, -1e9
    sc_end = start + int((last - start) * 0.6)
    for i in range(start, sc_end + 1):
        depth = (hi - hist[i][3]) / (hi - lo or 1)
        score = depth * 2 + min(vr[i], 3) * 0.35
        if score > sc_score:
            sc_score, sc = score, i
    if sc >= 0:
        add(sc, "SC", "量能同步放大" if vr[sc] >= cfg["volK"] * 0.85
            else "量能未显著放大，SC 偏弱")

    piv = zigzag(hist, max(start, sc + 1), n, cfg["rev"])
    ar = next((p for p in piv if p["t"] == "H" and p["i"] > sc
               and p["p"] > lo + 0.45 * (hi - lo)), None)
    if ar:
        lag = ar["confirm"] - ar["i"]
        add(ar["i"], "AR", "于第 %d 根确认（滞后 %d 根）" % (lag, lag), lag)

    if ar:
        for i in range(ar["i"] + 2, min(n - 1, last + win // 2) + 1):
            if hist[i][3] <= lo + 0.28 * (hi - lo) and vr[i] < 1.05:
                add(i, "ST", "缩量回踩 SC 区域")
                break

    spring, spring_low = -1, None
    for i in range(start + 5, n - 1):
        if (hist[i][3] < lo * 0.997 and hist[i][4] > lo
                and hist[i + 1][3] >= hist[i][3] * 0.998):
            spring, spring_low = i, hist[i][3]
    if spring >= 0:
        add(spring, "SPRING", "次根未破新低，于 T+1 确认", 1)

    if spring >= 0:
        for i in range(spring + 2, n):
            if (hist[i][3] <= spring_low * 1.012 and hist[i][4] > lo
                    and vr[i] < 1.15):
                add(i, "TEST", "缩量不破 Spring 低点")
                break

    lps = 0
    for i in range(start + 3, last + 1):
        if lps >= 2:
            break
        if any(abs(e["i"] - i) < 3 for e in events):
            continue
        if (hist[i][3] <= lo + 0.22 * (hi - lo)
                and hist[i][4] > lo + 0.06 * (hi - lo) and vr[i] < 1.0):
            add(i, "LPS", "缩量回踩支撑，位置逐步抬高")
            lps += 1

    sos = -1
    for i in range(max(last - 5, start + 10), n):
        if hist[i][4] > hi and vr[i] >= cfg["volK"]:
            sos = i
    if sos >= 0:
        add(sos, "SOS", "收盘站上上沿且量比 %.2f×" % vr[sos])

    if sos >= 0:
        for i in range(sos + 1, n):
            if hist[i][3] <= hi * 1.012 and hist[i][4] > lo + 0.4 * (hi - lo):
                add(i, "BU", "回踩 Creek 不破")
                break

    events.sort(key=lambda e: e["i"])
    res["events"] = events
    has = lambda c: any(e["code"] == c for e in events)
    if has("SOS"):
        res["code"] = "D"
        res["label"] = "Phase D→E：强势出现，趋势展开（SOS/BU 已确认）"
    elif has("SPRING"):
        res["code"] = "C"
        res["label"] = "Phase C：弹簧与测试（吸筹末段）"
    elif has("ST") or has("LPS"):
        res["code"] = "B"
        res["label"] = "Phase B：区间反复吸筹"
    elif has("SC"):
        res["code"] = "A"
        res["label"] = "Phase A：停止下跌（SC/AR/ST 构筑区间）"
    else:
        res["code"] = "B0"
        res["label"] = "Phase B：区间震荡，事件尚不充分"
    return res


def evaluate_at(t, rows, cfg):
    """因果判定：无论 rows 含多少未来数据，这里都物理截断到 t。"""
    return compute(rows[:t + 1], cfg)


# ---------------------------------------------------------------- 统计工具
def wilson(k, n, z=1.96):
    if n == 0:
        return [None, None]
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [max(0.0, c - h), min(1.0, c + h)]


def binom_tail(n, k, p):
    """P(X >= k), X ~ Bin(n,p)，log-space 避免 math.comb 溢出。"""
    if n == 0:
        return 1.0
    if p <= 0:
        return 1.0 if k == 0 else 0.0
    if p >= 1:
        return 1.0
    lp, lq = math.log(p), math.log1p(-p)
    tot = 0.0
    for i in range(k, n + 1):
        lc = math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1)
        tot += math.exp(lc + i * lp + (n - i) * lq)
    return min(1.0, tot)


def block_sample(arr, size, rng, block=BLOCK):
    n = len(arr)
    out = []
    while len(out) < size:
        s = rng.randrange(n)
        for k in range(block):
            out.append(arr[(s + k) % n])
    return out[:size]


def bootstrap_diff_ci(sig_rets, base_rets, rng, boot=BOOT):
    if not sig_rets or not base_rets:
        return [None, None]
    diffs = []
    m = len(sig_rets)
    for _ in range(boot):
        a = block_sample(sig_rets, m, rng)
        b = block_sample(base_rets, m, rng)
        pa = sum(1 for x in a if x > 0) / len(a)
        pb = sum(1 for x in b if x > 0) / len(b)
        diffs.append(pa - pb)
    diffs.sort()
    return [diffs[int(0.025 * boot)], diffs[int(0.975 * boot) - 1]]


def fwd_ret(rows, t, h):
    if t + 1 + h >= len(rows):
        return None
    return rows[t + 1 + h][4] / rows[t + 1][4] - 1


# ---------------------------------------------------------------- 回测主体
def build_states(rows, cfg, state_from):
    flat, win_pre = precompute_flat(rows, cfg)
    states = {}
    for t in range(state_from, len(rows)):
        r = compute(rows[:t + 1], cfg, flat, win_pre)
        states[t] = r
    return states


def extract_signals(states, state_from, eval_from_i, cooldown):
    signals, last = [], -10 ** 9
    prev = None
    for t in range(state_from, len(states) + state_from):
        st = states[t]
        if st["code"] == "C" and prev != "C" and t - last >= cooldown and t >= eval_from_i:
            signals.append(t)
            last = t
        prev = st["code"]
    return signals


def describe(rows, t, states, h=HORIZON):
    st = states[t]
    rng = st["rng"] or {}
    ev = [{"code": e["code"], "date": e["t"], "px": round(e["px"], 2),
           "vr": round(e["vr"], 2), "note": e["note"]} for e in st["events"]]
    sos_date = None
    for u in range(t + 1, min(t + 1 + h, len(rows))):
        if states.get(u, {}).get("code") == "D":
            sos_date = rows[u][0]
            break
    return {
        "date": rows[t][0], "t": t, "close": round(rows[t][4], 2),
        "range_lo": round(rng.get("lo", 0), 2), "range_hi": round(rng.get("hi", 0), 2),
        "range_len": (rng.get("end", 0) - rng.get("start", 0) + 1) if rng else 0,
        "events": ev, "sos_within20": sos_date is not None, "sos_date": sos_date,
        "ret5": fwd_ret(rows, t, 5), "ret10": fwd_ret(rows, t, 10),
        "ret20": fwd_ret(rows, t, 20),
    }


def subset_stats(sigs, baseline_ts, rows, states):
    rets = [sigs[i]["ret20"] for i in range(len(sigs)) if sigs[i]["ret20"] is not None]
    base = [fwd_ret(rows, t, 20) for t in baseline_ts]
    base = [x for x in base if x is not None]
    k = sum(1 for x in rets if x > 0)
    pb = sum(1 for x in base if x > 0) / len(base) if base else None
    return {
        "n": len(rets),
        "win20": k / len(rets) if rets else None,
        "baseline_win20": pb,
        "diff": (k / len(rets) - pb) if rets and pb is not None else None,
        "sos_rate": sum(1 for s in sigs if s["sos_within20"]) / len(sigs) if sigs else None,
        "avg_ret20": statistics.mean(rets) if rets else None,
    }


def run_pipeline(rows, eval_i, cfg, baseline_win, verbose=False):
    state_from = max(80, eval_i - 60)
    states = build_states(rows, cfg, state_from)
    signals = extract_signals(states, state_from, eval_i, cfg["cooldown"])
    complete = [t for t in signals if t + 1 + HORIZON < len(rows)]
    sigs = [describe(rows, t, states) for t in complete]
    rets20 = [s["ret20"] for s in sigs if s["ret20"] is not None]
    k = sum(1 for x in rets20 if x > 0)
    n = len(rets20)
    win = k / n if n else None
    sos_k = sum(1 for s in sigs if s["sos_within20"])
    # 异常值影响：剔除最好的一次，纯描述性，不参与参数选择
    trim = sorted(rets20)[:-1] if len(rets20) > 1 else []
    return {
        "max_ret20": max(rets20) if rets20 else None,
        "min_ret20": min(rets20) if rets20 else None,
        "excl_best_avg_ret20": statistics.mean(trim) if trim else None,
        "excl_best_win20": (sum(1 for x in trim if x > 0) / len(trim)) if trim else None,
        "signal_count": len(signals), "complete_count": n,
        "signals": sigs, "states": states, "state_from": state_from,
        "rets20": rets20,
        "win20": win, "win20_ci": wilson(k, n),
        "baseline_win20": baseline_win,
        "diff": (win - baseline_win) if win is not None else None,
        "binom_p_one_sided": binom_tail(n, k, baseline_win) if n else None,
        "sos_rate": sos_k / n if n else None,
        "sos_ci": wilson(sos_k, n),
        "avg_ret20": statistics.mean(rets20) if rets20 else None,
        "median_ret20": statistics.median(rets20) if rets20 else None,
        "ret5_win": (sum(1 for s in sigs if s["ret5"] is not None and s["ret5"] > 0) /
                     max(1, sum(1 for s in sigs if s["ret5"] is not None))),
        "ret10_win": (sum(1 for s in sigs if s["ret10"] is not None and s["ret10"] > 0) /
                      max(1, sum(1 for s in sigs if s["ret10"] is not None))),
    }


# ---------------------------------------------------------------- 自检
def mutate(r):
    return [r[0], r[4] * 0.55, r[4] * 0.56, r[4] * 0.54, r[4] * 0.55, 1.0]


def leak_tests(rows, cfg, eval_i):
    pts = list(range(eval_i, len(rows) - HORIZON - 2, 37))[:24]
    base = [evaluate_at(t, rows, cfg)["code"] for t in pts]
    trunc = [evaluate_at(t, rows[:t + 1], cfg)["code"] for t in pts]
    poison = []
    for t in pts:
        p = rows[:t + 1] + [mutate(r) for r in rows[t + 1:]]
        poison.append(evaluate_at(t, p, cfg)["code"])

    def leaky(t, rr):
        fut = rr[t + 1:t + 21]
        return 1 if fut and max(x[4] for x in fut) > rr[t][4] * 1.02 else 0

    ctrl0 = [leaky(t, rows) for t in pts]
    ctrl1 = []
    for t in pts:
        p = rows[:t + 1] + [mutate(r) for r in rows[t + 1:]]
        ctrl1.append(leaky(t, p))

    t0 = pts[0]
    page_orig = compute(rows, cfg)["code"]
    page_poison = compute(rows[:t0 + 1] + [mutate(r) for r in rows[t0 + 1:]], cfg)["code"]
    return {
        "checked_points": len(pts),
        "truncation_invariant": base == trunc,
        "future_poison_invariant": base == poison,
        "negative_control_changed": ctrl0 != ctrl1,
        "page_fullsample_state_original": page_orig,
        "page_fullsample_state_after_future_poison": page_poison,
        "page_fullsample_changed": page_orig != page_poison,
        "note": "前两项为回测引擎必须成立；第3项证明检测器能抓到未来函数；第4项展示页面原式为何不能当回测依据。",
    }


def verify_equivalence(cfg):
    """用页面同源的 320 根新浪日线，验证 Python 移植与 JS 规则一致。"""
    w = json.load(open(PAGE, encoding="utf-8"))
    rows = [[r[0].replace("-", ""), r[1], r[2], r[3], r[4], r[5]]
            for r in w["bars"]["sh000001"]["240"]]
    r = compute(rows, cfg)
    ev = {e["code"]: e["t"] for e in r["events"]}
    return {
        "source": "data/wyckoff.json（与页面同源，320 根）",
        "phase_code": r["code"], "phase_label": r["label"],
        "event_count": len(r["events"]),
        "events": [{"code": e["code"], "date": e["t"], "vr": round(e["vr"], 2)}
                   for e in r["events"]],
        "expected": {"phase_code": "C", "event_count": 6,
                     "SPRING": "20261103", "TEST": "20261106"},
        "passed": (r["code"] == "C" and len(r["events"]) == 6
                   and ev.get("SPRING") == "20261103" and ev.get("TEST") == "20261106"),
    }


# ---------------------------------------------------------------- 主流程
def main():
    h = json.load(open(HIST, encoding="utf-8"))
    rows = h["rows"]
    n = len(rows)
    eval_i = next(i for i, r in enumerate(rows) if r[0] >= EVAL_FROM)
    baseline_ts = list(range(eval_i, n - HORIZON - 1))
    base_rets = [fwd_ret(rows, t, HORIZON) for t in baseline_ts]
    base_rets = [x for x in base_rets if x is not None]
    baseline_win = sum(1 for x in base_rets if x > 0) / len(base_rets)
    baseline_ci = wilson(sum(1 for x in base_rets if x > 0), len(base_rets))

    print("数据 %d 根 %s ~ %s | 评估起点 %s (idx=%d) | 基准样本 %d"
          % (n, rows[0][0], rows[-1][0], rows[eval_i][0], eval_i, len(base_rets)))

    eq = verify_equivalence(DEFAULT)
    print("等价性验证:", "PASS" if eq["passed"] else "FAIL", eq["phase_label"],
          eq["event_count"], "个事件")
    if not eq["passed"]:
        raise RuntimeError("Python 移植与页面 JS 规则不一致，终止回测")

    main_r = run_pipeline(rows, eval_i, DEFAULT, baseline_win)
    rng = random.Random(SEED)
    boot_ci = bootstrap_diff_ci(main_r["rets20"], base_rets, rng)

    # 子样本：按评估期时间中位切分，仅用于稳定性描述，不参与参数选择
    mid = (eval_i + n) // 2
    first = [s for s in main_r["signals"] if s["t"] < mid]
    second = [s for s in main_r["signals"] if s["t"] >= mid]
    subs = [
        {"name": "前半段", "from": rows[eval_i][0], "to": rows[mid][0],
         **subset_stats(first, [t for t in baseline_ts if t < mid], rows, main_r["states"])},
        {"name": "后半段", "from": rows[mid][0], "to": rows[-1][0],
         **subset_stats(second, [t for t in baseline_ts if t >= mid], rows, main_r["states"])},
    ]

    # 单因子敏感性：只展示结论稳定性，绝不用于反选参数
    variants = [
        ("默认（页面原参数）", {}),
        ("横盘阈值 0.075", {"rthr": 0.075}),
        ("横盘阈值 0.115", {"rthr": 0.115}),
        ("滚动窗口 45", {"win": 45}),
        ("滚动窗口 80", {"win": 80}),
        ("ZigZag rev 0.020", {"rev": 0.020}),
        ("ZigZag rev 0.030", {"rev": 0.030}),
        ("放量阈值 volK 1.2", {"volK": 1.2}),
        ("放量阈值 volK 1.6", {"volK": 1.6}),
        ("冷却期 10", {"cooldown": 10}),
        ("冷却期 40", {"cooldown": 40}),
    ]
    sens = []
    for label, delta in variants:
        c = dict(DEFAULT)
        c.update(delta)
        r = run_pipeline(rows, eval_i, c, baseline_win)
        sens.append({
            "label": label, "signal_count": r["signal_count"],
            "complete_count": r["complete_count"],
            "sos_rate": r["sos_rate"], "win20": r["win20"],
            "diff": r["diff"], "avg_ret20": r["avg_ret20"],
        })
        print("  %-22s 信号 %2d/%2d | SOS兑现 %s | 20日胜率 %s | 差 %s"
              % (label, r["complete_count"], r["signal_count"],
                 ("%.1f%%" % (100 * r["sos_rate"])) if r["sos_rate"] is not None else "—",
                 ("%.1f%%" % (100 * r["win20"])) if r["win20"] is not None else "—",
                 ("%+.1fpp" % (100 * r["diff"])) if r["diff"] is not None else "—"))

    leak = leak_tests(rows, DEFAULT, eval_i)

    out = {
        "meta": {
            "title": "威科夫吸筹结构 · 近三年严格因果回测",
            "generatedAt": "2026-11-14",
            "asof": rows[-1][0],
            "eval_from": rows[eval_i][0], "eval_to": rows[-1][0],
            "symbol": "sh000001 上证指数 / 日线",
            "data_source": h["meta"]["source"],
            "data_rows": n, "data_from": rows[0][0], "data_to": rows[-1][0],
            "horizon": HORIZON, "seed": SEED, "bootstrap": BOOT, "block": BLOCK,
            "script": "wolf-cycle/backtest_wyckoff.py",
        },
        "config": DEFAULT,
        "design": {
            "primary_metric_1": "结构兑现率：首次进入 Phase C 候选后 20 根内是否升级到 Phase D（出现 SOS）",
            "primary_metric_2": "方向胜率：同一批信号后 20 个交易日上证指数上涨比例",
            "entry": "信号 t 收盘后确认；t+1 收盘建仓；t+21 收盘平仓（20 个交易日间隔）",
            "dedup": "状态首次进入 C + 20 根冷却期；同一区间不重复计数",
            "baseline": "评估期内所有可计算 20 日收益的交易日",
            "causal": "evaluate_at(t) 物理截断 rows[:t+1]；Spring 需 T+1 确认；AR 有 ZigZag 确认滞后；量能均线右移 1 根只含 t-20..t-1",
            "anti_overfit": "参数在回测前固定为页面默认值，不搜索、不调参；敏感性仅作稳健性展示且不反选；主指标预先写死；5/10 日收益仅探索性",
            "tradability": "指数不可直接交易，未计成本/滑点；结论为结构统计，不是策略收益",
        },
        "equivalence": eq,
        "main": {
            "signal_count": main_r["signal_count"],
            "complete_count": main_r["complete_count"],
            "sos_realized": sum(1 for s in main_r["signals"] if s["sos_within20"]),
            "sos_rate": main_r["sos_rate"], "sos_ci": main_r["sos_ci"],
            "win20": main_r["win20"], "win20_ci": main_r["win20_ci"],
            "baseline_win20": baseline_win, "baseline_ci": baseline_ci,
            "diff": main_r["diff"], "bootstrap_diff_ci": boot_ci,
            "binom_p_one_sided": main_r["binom_p_one_sided"],
            "avg_ret20": main_r["avg_ret20"], "median_ret20": main_r["median_ret20"],
            "max_ret20": main_r["max_ret20"], "min_ret20": main_r["min_ret20"],
            "excl_best_avg_ret20": main_r["excl_best_avg_ret20"],
            "excl_best_win20": main_r["excl_best_win20"],
            "ret5_win": main_r["ret5_win"], "ret10_win": main_r["ret10_win"],
            "baseline_sample": len(base_rets),
        },
        "signals": main_r["signals"],
        "subsamples": subs,
        "sensitivity": sens,
        "leak_tests": leak,
        "caveats": [
            "页面 wb_wyckoff.js 的 compute() 是全样本末端一次性判读，其自带 caveat 明确写了「不能当作回测依据」。本回测是把它改造成逐根因果版本后的结果，不等同于页面当前标签的预测能力。",
            "威科夫方法是主观判读体系，没有唯一标准答案；这里的「事件」是固定规则产物，不是专家判读。",
            "「最近一段横盘区间」在每个 t 都用过去数据回看选出，因果上合法，但仍是事后描述，存在选择偏差；区间边界会随新 K 线重绘。",
            "近三年只有一个标的、一个市场状态，事件样本少，Wilson 区间会很宽；不能据此推断长期有效性。",
            "参数敏感性只用于观察结论是否稳定，没有用于挑选最优参数；任何换参数后变好的结果都不构成证据。",
            "指数不可交易，未计交易成本、滑点、冲击成本；若映射到 ETF 需另行回测。",
            "5 / 10 日胜率为探索性描述，主结论以预先设定的 20 日口径为准，未做多重比较校正的选优。",
            "样本内 2024-09-19 信号后 20 日 +20.57%，属政策驱动的极端行情；剔除该次后平均收益大幅下降，说明正收益高度依赖单次事件，不是稳定重复出现的优势。",
        ],
    }
    os.makedirs(DATA, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    m = out["main"]
    print("\n=== 主结果 ===")
    print("信号 %d 个，完整可评估 %d 个" % (m["signal_count"], m["complete_count"]))
    print("结构兑现率 %.1f%% (Wilson %s)" % (100 * m["sos_rate"], m["sos_ci"]))
    print("20日胜率 %.1f%% (Wilson %s) vs 基准 %.1f%%, 差 %+.1fpp"
          % (100 * m["win20"], [round(x * 100, 1) for x in m["win20_ci"]],
             100 * m["baseline_win20"], 100 * m["diff"]))
    print("单尾二项 p=%.4f | bootstrap 差值 CI %s"
          % (m["binom_p_one_sided"], [round(x * 100, 1) for x in boot_ci]))
    print("未来函数自检:", leak)
    print("saved:", OUT, round(os.path.getsize(OUT) / 1024, 1), "KB")


if __name__ == "__main__":
    main()
