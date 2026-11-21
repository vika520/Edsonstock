#!/usr/bin/env python
"""每日复盘生成器：汇总 9 个栏目（01-08 + 10 ERP）当日读数 → 结构化文章 → data/reviews.json。

设计原则
--------
1. **完全数据驱动**：只读本地 data/*.json，不联网、不调用大模型，盘后定时任务可稳定复现。
2. **同源口径**：9 栏判读规则与各栏页面一致（放量 MA20 不含当日、护盘 1.30×/−0.30%、
   麦克莱伦 EMA19/39、拥挤度扩展窗口分位、威科夫复用 backtest_wyckoff.compute）。
   第 04 栏的 TMT 交易拥挤度单列一节；第 12 栏 ERP 只读 erp.json 锁定快照，不重算、不改口径。
3. **不回填历史**：板块数据只有当日横截面快照，用今天的板块去"复盘"过去会产生未来函数。
   因此只在每个交易日盘后追加当日一篇，历史报告不做回溯生成。
4. **建议只给条件与证伪**：不给个股、不给点位预测、不声称收益；所有建议附触发条件与证伪场景，
   并引用已有的双冰点 / 威科夫实证结论，明确标注"非投资建议"。
5. 幂等：按 date upsert，同一交易日重复执行覆盖，不产生重复文章。

用法
----
  python build_review.py                 # 用各数据源共同最新交易日生成/覆盖当日报告
  python build_review.py --date 20261113
  python build_review.py --show         # 打印当日报告纯文本，不写文件
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "reviews.json")
KEEP = 90  # 最多保留 90 篇（约 4 个月交易日）

# 栏目数由 views.json 统一驱动：新增栏目自动进复盘，复盘永远最后一栏
_VIEWS = json.load(open(os.path.join(HERE, "views.json"), encoding="utf-8"))
NCOL = len([v for v in _VIEWS["order"] if v != "review"])
REVNO = NCOL + 1

# 与 wb_rotate.js 一致：属性类板块不是可交易主线
ATTR = re.compile(
    r"重仓|融资融券|两融|次新|ST|预盈|预增|送转|破净|可转债|股权激励|解禁|减持|增持|回购|"
    r"MSCI|富时|标普|沪股通|深股通|陆股通|AH股|B股|高价股|低价股|基金|QFII|社保|机构|含H股|转融")
WEEK = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def jload(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def jdump(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def ma_shift1(a, n):
    """前 n 根均值，不含当日；与 wb_core.js 的 ma(arr,n,1) 一致。"""
    out = [None] * len(a)
    for i in range(n, len(a)):
        out[i] = sum(a[i - n:i]) / n
    return out


def pct(a, b):
    return None if (a is None or b in (None, 0)) else (a / b - 1) * 100


def pct_rank(arr, v):
    """v 在 arr（截至当前，含 v）中的分位 0~1，扩展窗口，无未来函数。"""
    w = [x for x in arr if x is not None]
    if not w:
        return None
    return sum(1 for x in w if x <= v) / len(w)


def fmt(v, n=2, suffix=""):
    return "—" if v is None else ("%." + str(n) + "f%s") % (v, suffix)


def sgn(v, n=2, suffix="%"):
    return "—" if v is None else ("+" if v > 0 else "") + ("%." + str(n) + "f%s") % (v, suffix)


def causal_pivots(c, rev=0.08):
    """栏 1 狼波周期指数的因果确认式 ZigZag（等价移植 template.html）。"""
    piv = []
    trend, hi, hi_i, lo, lo_i = 1, c[0], 0, c[0], 0
    for i in range(1, len(c)):
        p = c[i]
        if trend == 1:
            if p > hi:
                hi, hi_i = p, i
            elif p <= hi * (1 - rev):
                piv.append({"i": hi_i, "t": "H", "p": hi, "confirm": i})
                trend, lo, lo_i = -1, p, i
        else:
            if p < lo:
                lo, lo_i = p, i
            elif p >= lo * (1 + rev):
                piv.append({"i": lo_i, "t": "L", "p": lo, "confirm": i})
                trend, hi, hi_i = 1, p, i
    if piv:
        piv.insert(0, {"i": 0, "t": "L" if piv[0]["t"] == "H" else "H",
                       "p": c[0], "confirm": 0, "virtual": True})
    return piv, trend


# ---------------------------------------------------------------- 9 栏读数（含 TMT / ERP）
def read_wave(idx):
    """01 狼波周期指数：因果相位、最近确认极值与确认滞后。"""
    rows = idx["indices"]["sh000001"]["rows"]
    c = [r[1] for r in rows]
    piv, trend = causal_pivots(c, 0.08)
    last = piv[-1] if piv else None
    n = len(c)
    lag = (n - 1 - last["confirm"]) if last else None
    seg_hi, seg_lo = max(c[last["i"]:]) if last else c[-1], min(c[last["i"]:]) if last else c[-1]
    pos = (c[-1] - seg_lo) / (seg_hi - seg_lo) * 100 if seg_hi > seg_lo else 50
    phase = "上行确认段" if trend == 1 else "下行确认段"
    txt = ("因果 ZigZag（反转阈值 8%%）最近一次确认%s在 %.2f（%s），确认滞后 %d 根；"
           "当前处于%s，未确认段位于 %.0f%% 分位。" %
           ("高点" if last and last["t"] == "H" else "低点",
            last["p"] if last else c[-1], rows[last["i"]][0] if last else "—",
            lag or 0, phase, pos))
    return {"phase": phase, "pivot": last["p"] if last else None,
            "pivotType": last["t"] if last else None, "lag": lag, "segPos": pos,
            "text": txt, "kpis": [
                {"k": "因果相位", "v": phase},
                {"k": "最近确认极值", "v": fmt(last["p"] if last else None, 2)},
                {"k": "确认滞后", "v": "%d 根" % (lag or 0)}]}


def read_breadth(breadth, idx):
    """02 双冰点情绪：冰点/沸点、连续天数、历史次日胜率（现算，不硬编码）。"""
    rows = breadth["rows"]                       # [date, down, up, flat, total]
    d = [r[0] for r in rows]
    dn = [r[1] for r in rows]
    up = [r[2] for r in rows]
    px = {r[0]: r[1] for r in idx["indices"]["sh000001"]["rows"]}
    run = 0
    for i, v in enumerate(dn):
        run = run + 1 if v >= 4000 else 0
    today_ice = dn[-1] >= 4000
    today_hot = up[-1] >= 4000
    double = run >= 2
    # 历史双冰点信号：连续段首次满足日（与 analyze.py / next_day.py 同口径）
    sig, r = [], 0
    for i, v in enumerate(dn):
        r = r + 1 if v >= 4000 else 0
        if r == 2:
            sig.append(i)
    hit = tot = 0
    for i in sig:
        if i + 1 < len(d) and d[i + 1] in px and d[i] in px:
            tot += 1
            hit += 1 if px[d[i + 1]] > px[d[i]] else 0
    win = hit / tot * 100 if tot else None
    base_hit = base_tot = 0
    for i in range(len(d) - 1):
        if d[i + 1] in px and d[i] in px:
            base_tot += 1
            base_hit += 1 if px[d[i + 1]] > px[d[i]] else 0
    base = base_hit / base_tot * 100 if base_tot else None
    txt = ("今日下跌 %d 家%s，上涨 %d 家；连续冰点 %d 天，%s。"
           "历史双冰点 %d 次，次日上涨 %s（全样本基准 %s），差距不显著，"
           "不宜把「双冰点＝次日反弹」当作可交易规律。" %
           (dn[-1], "（触发冰点）" if today_ice else "", up[-1], run,
            "已构成双冰点" if double else "未构成双冰点", len(sig),
            fmt(win, 1, "%"), fmt(base, 1, "%")))
    return {"ice": today_ice, "hot": today_hot, "run": run, "double": double,
            "signals": len(sig), "nextWin": win, "baselineWin": base, "text": txt,
            "kpis": [{"k": "下跌家数", "v": "%d" % dn[-1]},
                     {"k": "连续冰点", "v": "%d 天" % run},
                     {"k": "历史双冰点", "v": "%d 次" % len(sig)},
                     {"k": "次日胜率 / 基准", "v": "%s / %s" % (fmt(win, 1, "%"), fmt(base, 1, "%"))}]}


def read_rotate(w, mom):
    """03 板块轮动：与 wb_rotate.js 同源的 score / quadrant / 拥挤度。"""
    total = w["market"][-1][1]
    pool = [b for b in w["boards"] if not ATTR.search(b["name"])]
    if not pool:
        pool = w["boards"]
    by_amt = sorted(pool, key=lambda b: b["amount"])
    by_chg = sorted(pool, key=lambda b: b["chg"])
    na, nc = max(1, len(pool) - 1), max(1, len(pool) - 1)
    rank_a = {b["code"]: i / na for i, b in enumerate(by_amt)}
    rank_c = {b["code"]: i / nc for i, b in enumerate(by_chg)}
    for b in pool:
        b["_score"] = rank_a[b["code"]] * 0.4 + rank_c[b["code"]] * 0.6
        b["_amtPct"] = b["amount"] / total * 100
        hot = rank_a[b["code"]] >= 0.5
        b["_quad"] = (("主线·放量领涨" if hot else "缩量上涨") if b["chg"] >= 0
                      else ("退潮·放量下跌" if hot else "冷门·缩量下跌"))
    main = sorted(pool, key=lambda b: -b["_score"])[:3]
    fade = sorted([b for b in pool if b["chg"] < 0], key=lambda b: -b["amount"])[:3]
    crowd = sorted(pool, key=lambda b: -b["amount"])[:3]
    upn = sum(1 for b in pool if b["chg"] > 0)
    txt = ("剔除属性类板块后 %d 个可交易板块，上涨 %d 个（%.1f%%）。"
           "主线前三：%s；放量下跌（退潮）前三：%s；成交额最拥挤：%s。"
           "「退潮」只是当日横截面判断，公开源没有板块指数日度历史，无法确认为趋势反转。" %
           (len(pool), upn, upn / len(pool) * 100,
            "、".join("%s(%s)" % (b["name"], sgn(b["chg"])) for b in main) or "无",
            "、".join(b["name"] for b in fade) or "无",
            "、".join("%s(%.2f%%)" % (b["name"], b["_amtPct"]) for b in crowd) or "无"))
    return {"count": len(pool), "up": upn,
            "main": [{"name": b["name"], "chg": b["chg"], "amtPct": b["_amtPct"]} for b in main],
            "fade": [{"name": b["name"], "chg": b["chg"], "amtPct": b["_amtPct"]} for b in fade],
            "crowd": [{"name": b["name"], "chg": b["chg"], "amtPct": b["_amtPct"]} for b in crowd],
            "text": txt,
            "kpis": [{"k": "板块上涨占比", "v": fmt(upn / len(pool) * 100, 1, "%")},
                     {"k": "首选主线", "v": main[0]["name"] if main else "—"},
                     {"k": "最拥挤", "v": crowd[0]["name"] if crowd else "—"}]}


def read_volume(w, idx):
    """04 放量信号：MA20 不含当日，阈值 1.20×（与 wb_volume.js 一致）。"""
    rows = w["market"]
    a = [r[1] / 1e8 for r in rows]
    m20 = ma_shift1(a, 20)
    vr = [a[i] / m20[i] if m20[i] else None for i in range(len(a))]
    last_ev = None
    for i in range(len(vr) - 1, -1, -1):
        if vr[i] is not None and vr[i] >= 1.20:
            last_ev = (rows[i][0], vr[i], a[i], len(rows) - 1 - i)
            break
    cnt = sum(1 for v in vr[-250:] if v is not None and v >= 1.20)
    txt = ("两市成交额 %.0f 亿，前 20 日均额 %.0f 亿，量比 %.2f×，%s当前 1.20× 阈值。"
           "最近一次放量在 %s（%.2f×，距今 %d 日）；近 250 日共 %d 个放量日。"
           "放量本身不含方向，既可能是增量入场也可能是恐慌换手。" %
           (a[-1], m20[-1] or 0, vr[-1] or 0,
            "已触发" if (vr[-1] or 0) >= 1.20 else "未触发",
            last_ev[0] if last_ev else "—", last_ev[1] if last_ev else 0,
            last_ev[3] if last_ev else 0, cnt))
    return {"amount": a[-1], "ma20": m20[-1], "vr": vr[-1], "fired": (vr[-1] or 0) >= 1.20,
            "lastEvent": last_ev[0] if last_ev else None, "lastAgo": last_ev[3] if last_ev else None,
            "count250": cnt, "text": txt,
            "kpis": [{"k": "成交额", "v": fmt(a[-1], 0, " 亿")},
                     {"k": "量比 / MA20", "v": fmt(vr[-1], 2, "×")},
                     {"k": "最近放量", "v": last_ev[0] if last_ev else "—"}]}


def read_etf(w, idx):
    """05 ETF 日度申赎：宽基量比（量价背景）+ 季度真实申赎 / 日度份额估计。"""
    dates = [r[0] for r in w["market"]]
    di = {d: i for i, d in enumerate(dates)}
    core = [e for e in w["etfs"].values() if e.get("core")]
    tot = [0.0] * len(dates)
    for e in core:
        for r in e["rows"]:
            i = di.get(r[0])
            if i is not None:
                tot[i] += r[2] / 1e8
    m20 = ma_shift1(tot, 20)
    cvr = tot[-1] / m20[-1] if m20[-1] else None
    px = [r[1] for r in idx["indices"]["sh000001"]["rows"]]
    pxd = {r[0]: r[1] for r in idx["indices"]["sh000001"]["rows"]}
    chg = pct(pxd.get(dates[-1]), pxd.get(dates[-2]))
    if chg is not None and chg <= -0.30 and cvr and cvr >= 1.30:
        level, tone = "跌时宽基放量", "up"
    elif cvr and cvr >= 1.30:
        level, tone = "宽基放量", "amber"
    elif chg is not None and chg <= -0.30:
        level, tone = "跌时未见宽基放量", "down"
    else:
        level, tone = "量能常态", "neutral"
    ev = 0
    for i in range(1, len(dates)):
        c = pct(pxd.get(dates[i]), pxd.get(dates[i - 1]))
        v = tot[i] / m20[i] if m20[i] else None
        if c is not None and c <= -0.30 and v and v >= 1.30:
            ev += 1
    exd = jload("extras.json")
    q = ((exd.get("etfFlow") or {}).get("quarterly") or {})
    qnet = 0.0
    for rows in q.values():
        if rows:
            z = rows[0]
            qnet += (z[1] or 0) - (z[2] or 0)
    daily = (exd.get("etfFlow") or {}).get("daily") or []
    txt = ("%d 只核心宽基 ETF 合计成交 %.0f 亿，为前 20 日均额的 %.2f×；上证 %s → %s。"
           "这只是二级市场量能背景，不是份额申赎。季度真实申赎（%d 只核心 ETF 最近一期）净额 %s；"
           "日度份额估计从入库首日起累积，当前 %d 个交易日，样本不足 2 日时不计算净申赎。"
           "本栏已撤销「国家队护盘」归因，成交额放量无法证明买方身份。" %
           (len(core), tot[-1], cvr or 0, sgn(chg), level, len(q),
            sgn(qnet, 2, " 亿份"), len(daily)))
    return {"coreCount": len(core), "coreAmt": tot[-1], "cvr": cvr, "chg": chg,
            "level": level, "tone": tone, "events": ev, "text": txt,
            "kpis": [{"k": "核心宽基成交", "v": fmt(tot[-1], 0, " 亿")},
                     {"k": "量比", "v": fmt(cvr, 2, "×")},
                     {"k": "判定", "v": level}]}


def read_daily(w):
    """06 日度全景：成交额结构、方向代理与 10 日累计（均为代理口径）。"""
    rows = w["market"]
    a = [r[1] / 1e8 for r in rows]
    net = []
    for r in rows:
        dn, up, fl, amt = r[3], r[4], r[5], r[1] / 1e8
        net.append((up - dn) / max(1, up + dn + fl) * amt)
    cum10 = sum(net[-10:])
    m20, m60 = ma_shift1(a, 20), ma_shift1(a, 60)
    txt = ("成交额 %.0f 亿（环比 %s），MA20 %.0f 亿 / MA60 %.0f 亿。"
           "方向代理 %s，10 日累计 %s。"
           "该代理＝(涨−跌)/总家数×成交额，是广度加权方向估计，不是真实资金净流入。" %
           (a[-1], sgn(pct(a[-1], a[-2])), m20[-1] or 0, m60[-1] or 0,
            sgn(net[-1], 1, " 亿"), sgn(cum10, 1, " 亿")))
    return {"amount": a[-1], "chg": pct(a[-1], a[-2]), "ma20": m20[-1], "ma60": m60[-1],
            "net": net[-1], "cum10": cum10, "text": txt,
            "kpis": [{"k": "成交额环比", "v": sgn(pct(a[-1], a[-2]), 1)},
                     {"k": "方向代理", "v": sgn(net[-1], 0, " 亿")},
                     {"k": "10 日累计", "v": sgn(cum10, 0, " 亿")}]}


def read_wyckoff(wy, bt):
    """07 威科夫吸筹：复用严格因果回测里的等价 compute（与页面末端判读一致）。"""
    from backtest_wyckoff import compute, DEFAULT
    raw = wy["bars"]["sh000001"]["240"]
    rows = [[r[0].replace("-", ""), r[1], r[2], r[3], r[4], r[5]] for r in raw]
    res = compute(rows, DEFAULT)
    ev = res.get("events") or []
    recent = []
    for e in ev[-4:]:
        i = e.get("i")
        recent.append({"code": e.get("code"),
                       "date": rows[i][0] if isinstance(i, int) and 0 <= i < len(rows) else "—",
                       "close": e.get("close")})
    rng = res.get("rng") or {}
    lo, hi = rng.get("lo"), rng.get("hi")
    pos = ((rows[-1][4] - lo) / (hi - lo) * 100) if (lo and hi and hi > lo) else None
    m = bt.get("main", {})
    txt = ("当前判读「%s」，识别 %d 个事件；最新收盘位于区间 %s 分位，%s。"
           "近三年严格因果回测：%d 次信号，20 日内结构兑现率 %s，方向胜率 %s vs 基准 %s，"
           "单尾二项 p=%.3f、bootstrap 差值 CI 跨 0 —— 不显著，不能据此下注。" %
           (res.get("label", "—"), len(ev), fmt(pos, 1, "%"),
            "SOS/BU 尚未确认" if res.get("code") == "C" else "以页面事件表为准",
            m.get("signal_count", 0), fmt((m.get("sos_rate") or 0) * 100, 1, "%"),
            fmt((m.get("win20") or 0) * 100, 1, "%"),
            fmt((m.get("baseline_win20") or 0) * 100, 1, "%"),
            m.get("binom_p_one_sided", 1)))
    return {"phase": res.get("label"), "code": res.get("code"), "events": len(ev),
            "recent": recent, "rangePos": pos, "text": txt,
            "kpis": [{"k": "当前判读", "v": res.get("label", "—")},
                     {"k": "事件数", "v": "%d" % len(ev)},
                     {"k": "区间分位", "v": fmt(pos, 1, "%")}]}


def read_flow(flow, w):
    """08 市场宽度与拥挤度：与 wb_flow.js 同公式（含扩展窗口分位）。"""
    fi = {k: i for i, k in enumerate(flow["fields"])}
    rows = flow["rows"]
    gv = lambda r, k: r[fi[k]]
    d = [r[0] for r in rows]
    up = [gv(r, "up") for r in rows]
    dn = [gv(r, "dn") for r in rows]
    fl = [gv(r, "fl") for r in rows]
    uv = [gv(r, "uv") for r in rows]
    dv = [gv(r, "dv") for r in rows]
    ew = [gv(r, "ew") for r in rows]
    trin = [(up[i] / dn[i]) / (uv[i] / dv[i]) if dn[i] and uv[i] and dv[i] else None
            for i in range(len(rows))]
    udr = [uv[i] / dv[i] if dv[i] else None for i in range(len(rows))]
    nhp = [gv(r, "nh60") / gv(r, "e60") * 100 if gv(r, "e60") else None for r in rows]
    # 长序列 ADL / RANA / OSC / SUM（2016 起）
    mkt = w["market"]
    adl, rana, osc, summ = [], [], [], []
    a = s = 0.0
    e19 = e39 = None
    for r in mkt:
        a += r[4] - r[3]
        adl.append(a)
        q = (r[4] - r[3]) / max(1, r[4] + r[3] + r[5]) * 100
        rana.append(q)
        e19 = q if e19 is None else e19 + (q - e19) * (2 / 20)
        e39 = q if e39 is None else e39 + (q - e39) * (2 / 40)
        osc.append(e19 - e39)
        s += e19 - e39
        summ.append(s)
    md = {r[0]: i for i, r in enumerate(mkt)}
    qsum = [summ[md[x]] if x in md else None for x in d]
    # 等权全 A / 沪深300 相对强度
    ewn, idxn = 1.0, 1.0
    ix = {}
    for r in flow["idx"]["sh000300"]:
        ix[r[0]] = r[1]
    rs = []
    base = ix.get(d[0])
    lastpx = None
    for i, x in enumerate(d):
        if ew[i] is not None:
            ewn *= 1 + ew[i] / 100
        if x in ix:
            lastpx = ix[x]
        rs.append(ewn / (lastpx / base) if (base and lastpx) else None)
    # 拥挤度：5 分项扩展窗口分位（minN=60）
    crowd, parts = [], []
    for i in range(len(rows)):
        ps = [pct_rank(udr[:i + 1], udr[i]) if udr[i] is not None else None,
              pct_rank(nhp[:i + 1], nhp[i]) if nhp[i] is not None else None,
              pct_rank(qsum[:i + 1], qsum[i]) if qsum[i] is not None else None,
              (1 - pct_rank(trin[:i + 1], trin[i])) if (trin[i] is not None and pct_rank(trin[:i + 1], trin[i]) is not None) else None,
              pct_rank(rs[:i + 1], rs[i]) if rs[i] is not None else None]
        # 前 60 根样本不足
        if i < 60:
            ps = [None] * 5
        parts.append(ps)
        crowd.append(sum(ps) / len(ps) * 100 if all(v is not None for v in ps) else None)
    i = len(rows) - 1
    cw = crowd[i]
    state = "样本不足" if cw is None else ("偏拥挤" if cw >= 75 else "偏冷清" if cw <= 25 else "中性")
    nhnl60 = gv(rows[i], "nh60") - gv(rows[i], "nl60")
    nhnl250 = gv(rows[i], "nh250") - gv(rows[i], "nl250")
    px = {r[0]: r[1] for r in json.load(open(os.path.join(DATA, "indices.json"), encoding="utf-8"))["indices"]["sh000001"]["rows"]}
    px20 = px.get(mkt[-21][0]) if len(mkt) > 21 else None
    diverge = (px20 and px.get(mkt[-1][0]) and px[mkt[-1][0]] > px20 and adl[-1] < adl[-21])
    txt = ("ADL 当日 %+d、20 日 %+d；OSC %.2f、SUM %.0f。TRIN %.2f（UV/DV %.2f），"
           "NH60−NL60 %+d、NH250−NL250 %+d，等权全 A %s%%；拥挤度 %s（%s）。%s" %
           (up[i] - dn[i], adl[-1] - adl[-21] if len(adl) > 21 else 0,
            osc[-1], summ[-1], trin[i] or 0, udr[i] or 0, nhnl60, nhnl250,
            fmt(ew[i], 2), fmt(cw, 1), state,
            "指数 20 日上涨但 ADL 走低，存在广度背离。" if diverge else "未见显著指数—广度背离。"))
    return {"adlDay": up[i] - dn[i], "adl20": adl[-1] - adl[-21] if len(adl) > 21 else None,
            "osc": osc[-1], "sum": summ[-1], "trin": trin[i], "udr": udr[i],
            "nhnl60": nhnl60, "nhnl250": nhnl250, "ew": ew[i], "crowd": cw,
            "crowdState": state, "diverge": bool(diverge), "parts": parts[i],
            "text": txt,
            "kpis": [{"k": "ADL 当日", "v": "%+d" % (up[i] - dn[i])},
                     {"k": "TRIN", "v": fmt(trin[i], 2)},
                     {"k": "NH−NL(250)", "v": "%+d" % nhnl250},
                     {"k": "拥挤度", "v": "%s · %s" % (fmt(cw, 1), state)}]}


def locked(v):
    """ERP 锁定数字原样输出：不格式化、不四舍五入、不改口径。"""
    return "—" if v is None else str(v)


def read_erp(erp):
    """10 股债利差(ERP)区间：只读 erp.json 的锁定快照，页面/复盘均不二次计算。"""
    s = erp["snapshot"]
    ev = s.get("event") or {}
    ad = s.get("advice") or {}
    th = s.get("thresholds") or []
    cp = s.get("condProb") or []
    th_txt = "；".join(
        "%s ERP %s → PE %s → %s 点（%s 点 / %s%%）" %
        (t["name"], locked(t.get("erp")), locked(t.get("pe")), locked(t.get("point")),
         locked(t.get("gapPoint")), locked(t.get("gapPct"))) for t in th)
    cp_txt = "；".join(
        "%s 日：样本 %s、胜率 %s%%、平均 %s%%、中位 %s%%" %
        (locked(c.get("horizon")), locked(c.get("samples")), locked(c.get("winRate")),
         locked(c.get("avgRet")), locked(c.get("medianRet"))) for c in cp)
    txt = (
        "固定口径 ERP = 100 / 沪深300 PE-TTM − 中债10Y，通道为 1250 交易日滚动均值 ±2σ，"
        "档位按全样本分位划分。当日 ERP %s（%s，历史分位 %s%%），PE-TTM %s、盈利收益率 %s%%、"
        "中债10Y %s%%，沪深300 收 %s 点；通道中枢 %s、σ %s、上轨 %s、下轨 %s，σ 偏离 %s。"
        "四档阈值点位换算（假设盈利与国债收益率不变）：%s。"
        "历史条件收益：%s。区间事件：%s，历史 %s 次、中位 %s 日、最长 %s 日，"
        "当前进度 %s%%，距进入还差 %s 个 ERP 百分点。"
        "建议立场「%s」：%s；证伪：%s。"
        "以上数字全部来自 erp.json 锁定快照，复盘不做任何重算或取整；"
        "日频 PE 由月末官方锚点重构，条件概率样本重叠、未做显著性检验，ERP 对短期方向无稳定预测力。" %
        (locked(s.get("erp")), locked(s.get("tier")), locked(s.get("historyPercentile")),
         locked(s.get("peTtm")), locked(s.get("earningsYield")), locked(s.get("y10")),
         locked(s.get("close")), locked(s.get("channelMid")), locked(s.get("channelSigma")),
         locked(s.get("channelUpper")), locked(s.get("channelLower")), locked(s.get("sigmaDev")),
         th_txt, cp_txt,
         "已进入 %s 日" % locked(ev.get("runDays")) if ev.get("inEvent") else "当前未进入区间",
         locked(ev.get("eventCount")), locked(ev.get("histMedianDays")), locked(ev.get("histMaxDays")),
         locked(ev.get("progressPct")), locked(ev.get("toEnterGap")),
         locked(ad.get("stance")), locked(ad.get("action")), locked(ad.get("falsify"))))
    return {"snapshot": s, "advice": ad, "event": ev, "thresholds": th, "condProb": cp,
            "text": txt,
            "kpis": [{"k": "ERP", "v": locked(s.get("erp"))},
                     {"k": "历史分位", "v": locked(s.get("historyPercentile")) + "%"},
                     {"k": "档位", "v": locked(s.get("tier"))},
                     {"k": "PE-TTM", "v": locked(s.get("peTtm"))},
                     {"k": "10Y", "v": locked(s.get("y10")) + "%"},
                     {"k": "中枢 / ±2σ", "v": "%s / %s~%s" % (locked(s.get("channelMid")),
                                                              locked(s.get("channelLower")),
                                                              locked(s.get("channelUpper")))},
                     {"k": "σ 偏离", "v": locked(s.get("sigmaDev"))},
                     {"k": "90分位点位", "v": locked(th[0].get("point")) if th else "—"}]}


def read_sth(sth):
    """03 STH 成本基础：只读 sth.json 快照与因果检验结论，不做二次计算。"""
    s = (sth.get("snapshot") or {}).get("hs300top") or \
        (sth.get("snapshot") or {}).get("300750") or {}
    tg = (sth.get("targets") or {}).get("hs300top") or \
         (sth.get("targets") or {}).get("300750") or {}
    z = s.get("z")
    tier = "—"
    if z is not None:
        # 与工作台 wb_sth.js 判读口径完全一致：±0.5 为中性界
        if z >= 2:
            tier = "极端过热（≥+2σ）"
        elif z >= 1:
            tier = "过热（+1σ 以上）"
        elif z >= 0.5:
            tier = "偏热（+0.5σ）"
        elif z <= -2:
            tier = "极端冷却（≤−2σ）"
        elif z <= -1:
            tier = "冷却（−1σ 以下）"
        elif z <= -0.5:
            tier = "偏冷（跌破成本）"
        else:
            tier = "中性"
    f20 = (tg.get("fwd") or {}).get("20")
    f60 = (tg.get("fwd") or {}).get("60")
    text = ("STH80 短持成本 %s vs 收盘 %s，价差 %s → z=%s（%s）。"
            "−2σ 触发 %s 次；其后 20 日胜率 %s（基准 %s，p=%s）、60 日 %s（p=%s），%s。"
            "筹码衰减模型（三角分布+自由流通换手），价位未复权、股本跳变检测除权；"
            "−2σ 为逆势信号，单边阴跌中连续触发连续失效，须与狼波/威科夫趋势合读。"
            "篮子为等权 15 只抽样股收益率合成口径（等仓持有损益，与市值加权指数在分化市可方向背离，非指数复刻）。" %
            (fmt(s.get("sth80"), 2), fmt(s.get("close"), 2), fmt(s.get("spread"), 2),
             fmt(z, 2), tier,
             fmt(f20.get("events"), 0) if f20 else "—",
             fmt(f20.get("winRate"), 1, "%") if f20 else "—",
             fmt(f20.get("baseline"), 1, "%") if f20 else "—",
             fmt(f20.get("p"), 3) if f20 else "—",
             fmt(f60.get("winRate"), 1, "%") if f60 else "—",
             fmt(f60.get("p"), 3) if f60 else "—",
             "60 日显著" if (f60 or {}).get("sig") else "均不显著"))
    return {
        "kpis": [{"k": "STH80 成本", "v": fmt(s.get("sth80"), 2)},
                 {"k": "收盘", "v": fmt(s.get("close"), 2)},
                 {"k": "价差", "v": fmt(s.get("spread"), 2)},
                 {"k": "z 值", "v": fmt(z, 2) + "σ"},
                 {"k": "档位", "v": tier}],
        "text": text,
    }


def read_vix(vix):
    """06 波动率与恐慌指数：只读 vix.json 锁定快照，不做二次计算。"""
    s = vix.get("snapshot") or {}
    rows = vix.get("rows") or []
    last = rows[-1] if rows else {}
    io = last.get("IO") or {}
    v = s.get("vix")
    pct = s.get("percentile")
    hv30 = last.get("hv30")
    prem = (v - hv30) if (v is not None and hv30 is not None) else None
    cau = (vix.get("causal") or {})
    f20 = (cau.get("fwd") or {}).get("20")
    tier = "—"
    if pct is not None:
        if pct >= 90:
            tier = "恐慌高温"
        elif pct >= 75:
            tier = "波动偏高"
        elif pct <= 25:
            tier = "波动低温（自满风险）"
        else:
            tier = "中性"
    text = ("EdsonVIX（IO 沪深300，近月+次月 30 日口径）%s，全样本分位 %s%%（%s）；"
            "HV30 已实现 %s，恐慌溢价 %s；Skew %s。"
            "对照 HO 上证50 %s / MO 中证1000 %s。自编指数，方法同 CBOE 方差互换、"
            "结算价与行权价来自中金所真实披露；官方 iVIX 2018-02 起停发。"
            "VIX 只标价波动不含方向；expanding 90 分位触发后 20 日胜率 %s（p=%s，%s），"
            "不构成「恐慌见底即反弹」的依据。" %
            (fmt(v, 2), fmt(pct, 1), tier, fmt(hv30, 2),
             sgn(prem, 2), fmt(io.get("skew"), 2),
             fmt((last.get("HO") or {}).get("vix"), 2),
             fmt((last.get("MO") or {}).get("vix"), 2),
             fmt(f20.get("winRate"), 1, "%") if f20 else "样本不足",
             fmt(f20.get("p"), 3) if f20 else "—",
             "显著" if (f20 or {}).get("sig") else "不显著"))
    return {
        "kpis": [{"k": "EdsonVIX", "v": fmt(v, 2)},
                 {"k": "全样本分位", "v": fmt(pct, 1, "%")},
                 {"k": "恐慌溢价 VIX−HV30", "v": sgn(prem, 2)},
                 {"k": "Skew", "v": fmt(io.get("skew"), 2)},
                 {"k": "HO / MO", "v": fmt((last.get("HO") or {}).get("vix"), 1) +
                   " / " + fmt((last.get("MO") or {}).get("vix"), 1)}],
        "text": text,
    }


def read_tmt(tmt, w):
    """08 扩展 TMT 交易拥挤度：只读 tmt.json，占比不做二次计算。"""
    s = tmt.get("snapshot") or {}
    g = tmt.get("groups") or {}
    hist = tmt.get("history") or []
    names = ["电子", "通信", "计算机", "传媒"]
    parts = "、".join("%s %s%%（%s 亿，%s%%）" %
                     (n, locked((g.get(n) or {}).get("share")),
                      locked((g.get(n) or {}).get("amount")),
                      locked((g.get(n) or {}).get("chg"))) for n in names)
    cnt = sum(int((g.get(n) or {}).get("boardCount") or 0) for n in names)
    note = ("历史样本 %d 日，不足 20 日，不输出历史分位，也不做时序拥挤度判断；"
            "仅作当日横截面描述。" % len(hist)) if len(hist) < 20 else \
           ("历史样本 %d 日，已可给出扩展窗口分位。" % len(hist))
    txt = ("TMT 交易拥挤度＝电子 / 通信 / 计算机 / 传媒四大行业成交额合计 ÷ 沪深两市成交额。"
           "当日 TMT %s 亿 / 两市 %s 亿 ＝ %s%%；分行业：%s，共 %d 个东财二级行业板块。"
           "%s按板块名称精确匹配归入申万口径，板块互斥不重复计入，概念板块不计入；"
           "成交占比只衡量交易集中度，不是资金净流入，行业行情接口不含逐笔主动买卖方向。" %
           (locked(s.get("tmtAmount")), locked(s.get("marketAmount")), locked(s.get("ratio")),
            parts, cnt, note))
    return {"ratio": s.get("ratio"), "tmtAmount": s.get("tmtAmount"),
            "marketAmount": s.get("marketAmount"), "historyDays": len(hist),
            "groups": g, "text": txt,
            "kpis": [{"k": "TMT 占比", "v": locked(s.get("ratio")) + "%"},
                     {"k": "TMT 成交额", "v": locked(s.get("tmtAmount")) + " 亿"},
                     {"k": "两市成交额", "v": locked(s.get("marketAmount")) + " 亿"},
                     {"k": "电子", "v": locked((g.get("电子") or {}).get("share")) + "%"},
                     {"k": "通信", "v": locked((g.get("通信") or {}).get("share")) + "%"},
                     {"k": "计算机", "v": locked((g.get("计算机") or {}).get("share")) + "%"},
                     {"k": "传媒", "v": locked((g.get("传媒") or {}).get("share")) + "%"},
                     {"k": "历史样本", "v": str(len(hist)) + " 日"}]}


# ---------------------------------------------------------------- 6 类补充栏目
def read_extras(ex):
    """把 extras.json 的 6 类真实/代理口径压成 6 个复盘小节。

    只读落盘数字，不联网、不重算；缺失值统一写「样本不足」，绝不用代理数补空。
    """
    d = ex.get("derivatives") or {}
    ff = d.get("futuresFields") or []
    of = d.get("optionsFields") or []
    fut = d.get("futures") or {}

    def fcol(prod, name):
        i = ff.index(name) if name in ff else -1
        r = fut.get(prod) or []
        return (r[-1][i] if r and i >= 0 else None)

    def pcr(prod, name):
        i = of.index(name) if name in of else -1
        r = (d.get("options") or {}).get(prod) or []
        return (r[-1][i] if r and i >= 0 else None)

    rank = (d.get("rank") or {}).get("IF") or {}
    ann2 = fcol("IF", "annSecond")
    basis = fcol("IF", "basis")
    total_oi = sum((fcol(p, "totalOI") or 0) for p in ("IF", "IH", "IC", "IM"))
    deriv = {
        "kpis": [{"k": "IF 当月基差", "v": fmt(basis, 1, " 点")},
                 {"k": "IF 次月年化", "v": fmt(ann2, 2, "%")},
                 {"k": "IO 成交量 PCR", "v": fmt(pcr("IO", "pcrVol"), 3)},
                 {"k": "四品种总持仓", "v": fmt(total_oi, 0, " 手")},
                 {"k": "IF 会员净多空", "v": fmt(rank.get("net"), 0, " 手")}],
        "text": ("中金所真实日行情：IF 当月基差 %s 点，次月年化贴水 %s%%（当月临近到期会放大年化，"
                 "以次月口径为准）；IO 成交量 PCR %s、持仓量 PCR %s；四品种总持仓 %s 手，"
                 "IF 前 20 席位净多空 %s 手（仅会员排名口径，不含全市场账户）。"
                 "XML 无隐含波动率字段，真实 IV / IV skew 未接入，本栏不推算冒充。" %
                 (fmt(basis, 1), fmt(ann2, 2), fmt(pcr("IO", "pcrVol"), 3),
                  fmt(pcr("IO", "pcrOI"), 3), fmt(total_oi, 0), fmt(rank.get("net"), 0))),
    }

    lv = (ex.get("leverage") or {}).get("rows") or []
    a, b = (lv[-1] if lv else []), (lv[-2] if len(lv) > 1 else [])
    bal = a[5] if len(a) > 5 else None
    prev = b[5] if len(b) > 5 else None
    dlt = (bal - prev) / 1e8 if (bal is not None and prev is not None) else None
    lev = {
        "kpis": [{"k": "两融余额", "v": fmt((bal or 0) / 1e12, 4, " 万亿")},
                 {"k": "日变动", "v": sgn(dlt, 0, " 亿")},
                 {"k": "融资买入", "v": fmt((a[2] or 0) / 1e8, 0, " 亿")},
                 {"k": "占流通市值", "v": fmt(a[6] if len(a) > 6 else None, 3, "%")},
                 {"k": "披露频率", "v": "T+1"}],
        "text": ("两融是少数真实可核验的杠杆资金：截至 %s（T+1 披露），余额 %s 万亿元，"
                 "日变动 %s，融资买入额 %s 亿元，占流通市值 %s%%。"
                 "属同步指标且滞后一日，不作领先信号。ETF 份额只采用基金定期报告的季度真实申赎，"
                 "交易所日度申赎份额无免费公开源；第 07 栏日度曲线是量价反推估计，"
                 "不做「国家队」买方归因。" %
                 (fmt_date(a[0] if a else ""), fmt((bal or 0) / 1e12, 4), sgn(dlt, 0, " 亿元"),
                  fmt((a[2] or 0) / 1e8, 0), fmt(a[6] if len(a) > 6 else None, 3))),
    }

    sf = (ex.get("sentiment") or {}).get("fields") or []
    sr = (ex.get("sentiment") or {}).get("rows") or []
    last = sr[-1] if sr else []

    def scol(name):
        i = sf.index(name) if name in sf else -1
        return (last[i] if i >= 0 and i < len(last) else None)

    sent = {
        "kpis": [{"k": "涨停", "v": fmt(scol("zt"), 0, " 家")},
                 {"k": "跌停", "v": fmt(scol("dt"), 0, " 家")},
                 {"k": "炸板", "v": fmt(scol("zb"), 0, " 家")},
                 {"k": "最高连板", "v": fmt(scol("maxLb"), 0, " 板")},
                 {"k": "炸板率", "v": fmt(scol("zbRate"), 2, "%")},
                 {"k": "晋级率", "v": fmt(scol("promotion"), 2, "%") if scol("promotion") is not None else "样本不足"}],
        "text": ("涨停池 / 跌停池 / 炸板池当日真实快照：涨停 %s、跌停 %s、炸板 %s 家，"
                 "最高 %s 板、连板 %s 家、炸板率 %s%%。晋级率 %s。"
                 "与双冰点形成两层：双冰点是收盘后广度极值，本栏是日内封板与接力结构。"
                 "涨停 / 连板 / 晋级率已用同花顺按日回补长历史；"
                 "炸板率与跌停家数实测无可用历史源，只有当日快照，不伪造回补。" %
                 (fmt(scol("zt"), 0), fmt(scol("dt"), 0), fmt(scol("zb"), 0),
                  fmt(scol("maxLb"), 0), fmt(scol("lb2"), 0), fmt(scol("zbRate"), 2),
                  fmt(scol("promotion"), 2, "%") if scol("promotion") is not None else "样本不足")),
    }

    va = ex.get("valuation") or {}
    st = va.get("stat") or {}
    fc = va.get("forecast") or {}
    valu = {
        "kpis": [{"k": "有效行业", "v": fmt(st.get("n"), 0, " 个")},
                 {"k": "PE 中位数", "v": fmt(st.get("median"), 2, " 倍")},
                 {"k": "P25 / P75", "v": fmt(st.get("p25"), 2) + " / " + fmt(st.get("p75"), 2)},
                 {"k": "业绩预增", "v": fmt(fc.get("up"), 0, " 条")},
                 {"k": "业绩预减", "v": fmt(fc.get("down"), 0, " 条")}],
        "text": ("当日 %s 个有效行业板块 PE-TTM 横截面：中位数 %s 倍、P25 %s / P75 %s。"
                 "最近 %s 条业绩预告中预增 %s 条、预减 %s 条（公告口径，不是分析师一致预期修正）。"
                 "中位数 / 四分位已用东财行业估值报表按日回补长历史（127 行业口径，"
                 "与当日 219 个板块横截面是两套口径，不横向比绝对值）；"
                 "与 ERP 分工是「结构维度」而非「股债总量性价比」。" %
                 (fmt(st.get("n"), 0), fmt(st.get("median"), 2), fmt(st.get("p25"), 2),
                  fmt(st.get("p75"), 2), fmt(fc.get("total"), 0),
                  fmt(fc.get("up"), 0), fmt(fc.get("down"), 0))),
    }

    ev = ex.get("events") or {}
    un = ev.get("unlock") or []
    bb = ev.get("billboard") or []
    cap = sum((x.get("cap") or 0) for x in un)
    evt = {
        "kpis": [{"k": "未来解禁", "v": fmt(len(un), 0, " 笔")},
                 {"k": "解禁市值", "v": fmt(cap / 1e4, 0, " 亿")},
                 {"k": "龙虎榜", "v": fmt(len(bb), 0, " 条")},
                 {"k": "上榜成交额", "v": fmt(sum((x.get("amt") or 0) for x in bb) / 1e8, 0, " 亿")},
                 {"k": "口径", "v": "公开披露"}],
        "text": ("未来 %s 笔限售解禁合计约 %s 亿元，当日龙虎榜 %s 条、上榜成交合计约 %s 亿元。"
                 "解禁是可流通股本增加，不等于实际减持；龙虎榜只说明达到交易所异动阈值，"
                 "不能识别买方身份。Level-2 逐笔委托 / 封单 / 主动买卖方向无免费源，未接入。"
                 "事件是「需要留意的条件」，不是因果结论。" %
                 (fmt(len(un), 0), fmt(cap / 1e4, 0), fmt(len(bb), 0),
                  fmt(sum((x.get("amt") or 0) for x in bb) / 1e8, 0))),
    }

    cr = ex.get("cross") or {}
    q = {x.get("code"): x for x in (cr.get("quotes") or [])}
    fx = cr.get("fx") or {}
    bond = cr.get("bond") or {}

    def qchg(c):
        return (q.get(c) or {}).get("chg")

    cross = {
        "kpis": [{"k": "恒生指数", "v": sgn(qchg("HSI"), 2, "%")},
                 {"k": "纳斯达克", "v": sgn(qchg("NDX"), 2, "%")},
                 {"k": "美元指数", "v": fmt((q.get("UDI") or {}).get("price"), 2)},
                 {"k": "USDCNY", "v": fmt(fx.get("usdcny"), 4)},
                 {"k": "中债 10Y", "v": fmt(bond.get("y10"), 4, "%")}],
        "text": ("恒指 %s、纳指 %s、标普 %s；美元指数 %s、COMEX 黄金 %s；在岸人民币 USDCNY %s，"
                 "中债 10 年期国债收益率 %s%%（与第 12 栏 ERP 固定口径同源）。"
                 "各市场收盘时点不同，不是同步快照，也不是盘中实时；仅作外部语境，"
                 "不作为 A 股次日方向的领先信号。" %
                 (sgn(qchg("HSI"), 2, "%"), sgn(qchg("NDX"), 2, "%"), sgn(qchg("SPX"), 2, "%"),
                  fmt((q.get("UDI") or {}).get("price"), 2), fmt((q.get("GC00Y") or {}).get("price"), 2),
                  fmt(fx.get("usdcny"), 4), fmt(bond.get("y10"), 4))),
    }
    return {"derivatives": deriv, "leverage": lev, "sentiment": sent,
            "valuation": valu, "events": evt, "cross": cross}


def fmt_date(d):
    return (d[:4] + "-" + d[4:6] + "-" + d[6:8]) if len(d) == 8 else (d or "—")


# ---------------------------------------------------------------- 组装报告
def build(asof):
    w = jload("workbench.json")
    breadth = jload("breadth.json")
    mom = jload("board_mom.json")
    idx = jload("indices.json")
    flow = jload("flow.json")
    wy = jload("wyckoff.json")
    bt = jload("wyckoff_backtest.json")
    erp = jload("erp.json")
    tmt = jload("tmt.json")
    ex = jload("extras.json")
    hist = jload("history.json")
    cov = (hist.get("meta") or {}).get("coverage") or {}
    unavail = (hist.get("meta") or {}).get("unavailable") or []
    HIST_NOTE = ("长历史实测回补：行业 PE 中位数/四分位 %s 日、涨停/连板/晋级率 %s 日、"
                 "外部环境 %s 日；另有 %d 项确认无免费历史源：%s。" %
                 (cov.get("valuationDays", "—"), cov.get("sentimentDays", "—"),
                  cov.get("crossDays", "—"), len(unavail),
                  "、".join(x.get("label", "") for x in unavail)))
    _etf0 = next(iter((w.get("etfs") or {}).values()), None)
    _etf_days = len(_etf0.get("rows") or []) if isinstance(_etf0, dict) else 0
    HIST_AVAIL = [
        {"item": "横截面中位数 / 四分位", "days": cov.get("valuationDays"),
         "source": "东财 RPT_VALUEINDUSTRY_DET 行业估值报表（127 行业 PE-TTM）按日回补"},
        {"item": "炸板率与晋级率（拆开看）", "days": cov.get("sentimentDays"),
         "source": "晋级率 / 涨停 / 连板用同花顺涨停池 + 连板池按 date 回补；"
                   "炸板率 / 跌停家数实测无历史源，仍只有当日快照"},
        {"item": "外部环境逐日累积", "days": cov.get("crossDays"),
         "source": "腾讯外盘指数日线（恒指 / 纳指 / 标普）+ 东财中债 10Y 按日回补"},
        {"item": "ETF 日度量价（第 07 栏主视觉）", "days": _etf_days,
         "source": "腾讯 ETF 日线成交额 / 量比 / 方向代理 / 宽基分类堆积，真实日线"},
    ]
    HIST_UNAVAIL = [{"item": x.get("label", ""), "reason": x.get("reason", ""),
                     "alternative": x.get("alternative", "")} for x in unavail]

    s = {
        "wave": read_wave(idx), "breadth": read_breadth(breadth, idx),
        "rotate": read_rotate(w, mom), "volume": read_volume(w, idx),
        "etf": read_etf(w, idx), "daily": read_daily(w),
        "wyckoff": read_wyckoff(wy, bt), "flow": read_flow(flow, w),
        "tmt": read_tmt(tmt, w), "erp": read_erp(erp),
        "vix": read_vix(jload("vix.json")),
        "sth": read_sth(jload("sth.json")),
    }
    s.update(read_extras(ex))

    mkt = w["market"]
    r = mkt[-1]
    prev = mkt[-2]
    px = {x[0]: x[1] for x in idx["indices"]["sh000001"]["rows"]}
    close, pclose = px.get(asof), px.get(prev[0])
    chg = pct(close, pclose)
    amount = r[1] / 1e8
    dn, up, fl, tt = r[3], r[4], r[5], r[6]
    hi = idx["indices"]["sh000001"]["rows"][-1][2]
    lo = idx["indices"]["sh000001"]["rows"][-1][3]
    spark = [x[1] for x in idx["indices"]["sh000001"]["rows"][-20:]]

    names = {"wave": "狼波周期指数", "breadth": "双冰点情绪", "rotate": "板块轮动",
             "volume": "放量信号", "etf": "ETF 日度申赎", "daily": "日度全景",
             "wyckoff": "威科夫吸筹", "sth": "STH 成本基础", "flow": "市场宽度与拥挤度",
             "tmt": "TMT 交易拥挤度（第 04 栏扩展）", "erp": "股债利差(ERP)区间",
             "derivatives": "衍生品 / 对冲压力", "leverage": "杠杆与真实资金",
             "sentiment": "短线情绪与连板", "vix": "波动率与恐慌指数",
             "valuation": "行业估值与预期修正",
             "events": "筹码供给与事件", "cross": "跨市场与宏观"}

    # 一句话标题：当日大盘 + 原有栏目各一个短语 + 新增 6 栏摘要（栏数由 views.json 驱动）
    amtchg = s["daily"]["chg"]
    vol_word = ("放量" if s["volume"]["fired"] else
                "环比缩量" if (amtchg is not None and amtchg < -5) else "量能持平")
    ice_word = ("触发双冰点" if s["breadth"]["double"] else
                "单日冰点" if s["breadth"]["ice"] else "情绪未极")
    wy_word = {"C": "Phase C 候选", "D": "Phase D→E", "B": "Phase B",
               "B0": "Phase B", "A": "Phase A"}.get(s["wyckoff"]["code"], "结构不明")
    main_word = s["rotate"]["main"][0]["name"] if s["rotate"]["main"] else "主线不明"
    etf_word = s["etf"]["level"].split("，")[0]
    summary_word = ("广度与量能双弱，结构仍在确认期"
                    if (dn > up and (s["flow"]["crowd"] or 50) < 50)
                    else "多空分歧，等待结构确认")
    # 新增 6 栏的一句话摘要挂到标题尾部，不改动原有九项短语的参数顺序
    _k = lambda sec, i: s[sec]["kpis"][i]["v"]
    _exsum = ("；新增六栏：次月年化 %s、涨停 %s / 跌停 %s、两融 %s、"
              "行业 PE 中位 %s、解禁 %s、USDCNY %s" %
              (_k("derivatives", 1), _k("sentiment", 0), _k("sentiment", 1),
               _k("leverage", 0), _k("valuation", 1), _k("events", 1),
               _k("cross", 3)))
    summary_word = summary_word + _exsum
    eps = s["erp"]["snapshot"]
    _vlast = (jload("vix.json").get("rows") or [{}])[-1]
    _vsnaps = jload("vix.json").get("snapshot") or {}
    _vio = _vlast.get("IO") or {}
    title = ("上证 %s 收 %s，%d/%d 家涨跌、成交 %s（环比 %s）；"
             "%d栏速览：狼波%s、%s、主线「%s」、量比 %.2f×（%s）、宽基 ETF %.2f×·%s、"
             "方向代理 %s、威科夫 %s、拥挤度 %s·%s、TMT 占比 %s%%、VIX %s（%s%% 分位）、"
             "ERP %s·%s（%s%% 分位） —— %s" %
             (sgn(chg), fmt(close, 2), up, dn, fmt(amount, 0, " 亿"), sgn(amtchg, 1),
              NCOL,
              s["wave"]["phase"], ice_word, main_word,
              s["volume"]["vr"] or 0, vol_word,
              s["etf"]["cvr"] or 0, etf_word,
              sgn(s["daily"]["net"], 0, " 亿"), wy_word,
              fmt(s["flow"]["crowd"], 1), s["flow"]["crowdState"],
              locked(s["tmt"]["ratio"]),
              fmt(_vsnaps.get("vix"), 1), fmt(_vsnaps.get("percentile"), 1),
              locked(eps.get("erp")), locked(eps.get("tier")),
              locked(eps.get("historyPercentile")), summary_word))

    digest = ("全市场 %d 只标的、成交 %.0f 亿、涨跌 %d/%d/%d。%d 个数据栏目一致指向：%s；"
              "第 12 栏 ERP 为 %s（历史分位 %s%%），属估值性价比而非择时信号；"
              "新增栏目中，两融 / 中金所行情 / 涨跌停池 / 行业 PE / 解禁 / 跨市场均为公开真实数据，"
              "其中三类长历史已按日回补；第 06 栏 EdsonVIX 用中金所期权结算价自编（方法同 CBOE），"
              "非官方 iVIX 复刻；ETF 日度份额仍是量价反推估计，"
              "另有 TMT 同口径占比历史、炸板率/跌停家数历史确认不可回补；"
              "本页多项信号经严格因果检验并不显著（双冰点次日、威科夫 Phase C、ERP 分位反弹、VIX 高位后 20 日），"
              "因此结论以「观察与条件」为主，不作为买卖依据。" %
              (tt, amount, up, dn, fl, NCOL,
               "广度急冻且量能收缩，趋势结构尚未获得确认" if dn > up else "广度修复，量能配合度需继续观察",
               locked(eps.get("tier")), locked(eps.get("historyPercentile"))))
    data_asof = {"workbench": w["meta"].get("asof"), "flow": flow.get("asof"),
                 "wyckoff": wy.get("asof"), "erp": erp.get("asof"), "tmt": tmt.get("asof")}
    degraded = any(v and v != asof for v in data_asof.values())
    if degraded:
        digest += ("【数据降级提示】部分数据源未更新到 %s（%s），"
                   "相关栏目读数沿用上一版，请谨慎使用。" %
                   (asof, " / ".join("%s %s" % (k, v) for k, v in data_asof.items())))

    sections = []
    for k in ["wave", "breadth", "rotate", "volume", "etf", "daily", "wyckoff", "sth",
              "flow", "tmt", "erp", "derivatives", "leverage", "sentiment", "vix",
              "valuation", "events", "cross"]:
        sections.append({"id": k, "name": names[k], "kpis": s[k]["kpis"],
                         "text": s[k]["text"],
                         "tone": ("down" if k in ("breadth", "daily", "flow") and dn > up else
                                  "up" if k in ("rotate", "volume") and up > dn else "neutral")})

    # ---- 短线（1~3 日）：条件化、可证伪 ----
    st_points = [
        "广度：%d 家下跌 / %d 家上涨，%s。历史双冰点次日上涨 %s 对基准 %s，差距不显著，"
        "不因「跌得多」就预期反弹。" %
        (dn, up, "连续冰点 %d 天" % s["breadth"]["run"],
         fmt(s["breadth"]["nextWin"], 1, "%"), fmt(s["breadth"]["baselineWin"], 1, "%")),
        "量价：成交额 %s、量比 %.2f×；TRIN %.2f 与 UV/DV %.2f 需合读——"
        "普跌日 TRIN<1 只说明少数抗跌股放量，不等于买盘转强。" %
        (fmt(amount, 0, " 亿"), s["volume"]["vr"] or 0, s["flow"]["trin"] or 0, s["flow"]["udr"] or 0),
        "结构：威科夫「%s」，%s；近三年 %d 次同类信号 20 日结构兑现率仅 %s，"
        "方向胜率差值 bootstrap CI 跨 0，不把 Phase C 当买点。" %
        (s["wyckoff"]["phase"], "SOS/BU 未确认" if s["wyckoff"]["code"] == "C" else "以事件表为准",
         bt.get("main", {}).get("signal_count", 0),
         fmt((bt.get("main", {}).get("sos_rate") or 0) * 100, 1, "%")),
        "交易集中度：TMT 四大行业成交占比 %s%%（%s 亿 / 两市 %s 亿）；历史样本仅 %d 日，"
        "不足 20 日不输出历史分位，短线只把它当作当日横截面，不推断「拥挤趋势」。" %
        (locked(s["tmt"]["ratio"]), locked(s["tmt"]["tmtAmount"]),
         locked(s["tmt"]["marketAmount"]), s["tmt"]["historyDays"]),
        "短线情绪两层：收盘广度看双冰点（连续两日 4000 家以上下跌），日内结构看涨停 %s / 跌停 %s / 炸板 %s、"
        "最高 %s、炸板率 %s；晋级率 %s。对冲压力看 IF 次月年化贴水 %s，"
        "但当月临近到期会放大年化，两者都只作为条件描述，不作方向依据。" %
        (s["sentiment"]["kpis"][0]["v"], s["sentiment"]["kpis"][1]["v"],
         s["sentiment"]["kpis"][2]["v"], s["sentiment"]["kpis"][3]["v"],
         s["sentiment"]["kpis"][4]["v"], s["sentiment"]["kpis"][5]["v"],
         s["derivatives"]["kpis"][1]["v"]),
    ]
    st_triggers = [
        "修复条件：次日上涨家数回升至 > 2500 且 UV/DV > 1、成交额不再低于 MA20 的 0.9×",
        "转弱条件：继续 > 4000 家下跌且 NH60/NL60 占比差继续扩大、TRIN 抬升",
        "结构确认：出现放量收盘站上区间上沿（SOS）并回踩不破（BU）才算升级",
    ]
    st_falsify = [
        "若出现「指数涨但 ADL 继续走低 / NH−NL 继续为负」，说明上涨由权重拉动，广度修复证伪",
        "已完成的严格因果检验显示双冰点（次日胜率 %s vs 基准 %s）与威科夫 Phase C（p=%.3f）均不显著，"
        "任何据此的短线择时都缺乏统计支撑" %
        (fmt(s["breadth"]["nextWin"], 1, "%"), fmt(s["breadth"]["baselineWin"], 1, "%"),
         bt.get("main", {}).get("binom_p_one_sided", 1)),
    ]

    # ---- 中长线（1~3 月）----
    lt_points = [
        "ADL 单日 %+d、20 日 %+d，麦克莱伦 SUM %.0f、OSC %.2f；%s" %
        (s["flow"]["adlDay"], s["flow"]["adl20"] or 0, s["flow"]["sum"], s["flow"]["osc"],
         "指数与广度背离，需等待宽度同步" if s["flow"]["diverge"] else "宽度与指数未明显背离"),
        "NH250−NL250 = %+d 家，创 250 日新低的个股显著多于创新高，"
        "中期广度尚未修复；等权全 A 当日 %s%% 反映个股整体弱于权重。" %
        (s["flow"]["nhnl250"], fmt(s["flow"]["ew"], 2)),
        "板块结构：%s；但板块指数无日度历史，只能看当日横截面，"
        "「主线」需连续多日成交额占比与涨幅同时居前才算成立。" %
        ("、".join(b["name"] for b in s["rotate"]["main"][:3]) or "无明确主线"),
        "ETF 日度申赎：核心宽基量比 %.2f×（%s）只是量价背景；季度真实申赎为唯一可核验份额口径，"
        "日度份额为量价反推估计且只从入库首日起累积。交易所日度申赎份额无免费公开源，"
        "本工作台不做「国家队」买方归因，也不据成交额放量推断中长期资金托底。" %
        (s["etf"]["cvr"] or 0, s["etf"]["level"]),
        "杠杆与估值结构：两融余额 %s（T+1）属同步指标，行业 PE 横截面中位数 %s、"
        "业绩预告预增 %s / 预减 %s 只说明公告口径的盈利预期方向；"
        "两者都不构成中期择时信号。" %
        (s["leverage"]["kpis"][0]["v"], s["valuation"]["kpis"][1]["v"],
         s["valuation"]["kpis"][3]["v"], s["valuation"]["kpis"][4]["v"]),
        "股债性价比：ERP %s（%s，全样本 %s%% 分位），1250 日中枢 %s、σ %s、"
        "±2σ 通道 [%s, %s]，σ 偏离 %s；90 分位低估线对应沪深300 %s 点（%s%%），当前 %s 点。" %
        (locked(eps.get("erp")), locked(eps.get("tier")), locked(eps.get("historyPercentile")),
         locked(eps.get("channelMid")), locked(eps.get("channelSigma")),
         locked(eps.get("channelLower")), locked(eps.get("channelUpper")),
         locked(eps.get("sigmaDev")),
         locked(s["erp"]["thresholds"][0].get("point")) if s["erp"]["thresholds"] else "—",
         locked(s["erp"]["thresholds"][0].get("gapPct")) if s["erp"]["thresholds"] else "—",
         locked(eps.get("close"))),
        "ERP 历史条件收益（样本重叠，仅作描述）：%s；当前建议立场「%s」，%s。" %
        ("；".join("%s 日胜率 %s%% / 平均 %s%%" %
                  (locked(c.get("horizon")), locked(c.get("winRate")), locked(c.get("avgRet")))
                  for c in s["erp"]["condProb"]),
         locked(s["erp"]["advice"].get("stance")), locked(s["erp"]["advice"].get("action"))),
    ]
    lt_triggers = [
        "中期转强：ADL 20 日变化转正 + NH250−NL250 连续 5 日收敛 + 麦克莱伦 SUM 上穿其 60 日均值",
        "结构升级：威科夫出现 SOS/BU，且伴随全市场放量（量比 > 1.2×）而非缩量突破",
        "风格确认：等权全 A / 沪深300 相对强度连续走高，说明上涨有广度而非仅权重",
        "估值确认：ERP 上穿全样本 90 分位（%s）并进入连续区间，才把「略偏权益」升级为分批加仓；"
        "仅凭当日 %s%% 分位不足以行动" %
        (locked(s["erp"]["event"].get("thresholdErp")), locked(eps.get("historyPercentile"))),
        "集中度确认：TMT 成交占比需连续多日与电子 / 通信 / 计算机 / 传媒同步抬升，"
        "且历史样本累积满 20 日后才给出分位判断",
    ]
    lt_falsify = [
        "若成交额持续低于 MA60 且 NH−NL 长期为负，任何「底部结构」判读都应降级为区间震荡",
        "板块与 ETF 数据存在横截面选择偏差与代理口径，不能当作真实资金流或申赎数据",
        "ERP 证伪：若国债收益率下行推动 ERP 被动抬升，或盈利大幅下修使 PE 跳升，"
        "「股更便宜」的判断即不成立；ERP 高位可以长期更高位，不等于见底",
        "TMT 成交占比不是资金净流入；行业板块行情接口无逐笔主动买卖方向，"
        "用占比反推「资金抱团」属于口径误用",
        "本报告由固定规则自动生成，未做参数寻优；若未来调参以贴合历史曲线，即构成过拟合",
    ]

    date_obj = dt.datetime.strptime(asof, "%Y%m%d").date()
    return {
        "date": asof,
        "createdAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "weekday": WEEK[date_obj.weekday()],
        "dateLabel": "%02d.%02d" % (date_obj.month, date_obj.day),
        "yearMonth": "%d.%02d" % (date_obj.year, date_obj.month),
        "dayNum": "%02d" % date_obj.day,
        "title": title,
        "digest": digest,
        "index": {"name": "上证指数", "close": close, "chg": chg, "high": hi, "low": lo,
                  "amount": amount, "up": up, "down": dn, "flat": fl, "total": tt,
                  "spark": spark},
        "tags": [names[k] for k in names],
        "sections": sections,
        "shortTerm": {"horizon": "1~3 个交易日", "stance": "观望 / 等确认",
                      "points": st_points, "triggers": st_triggers, "falsify": st_falsify},
        "longTerm": {"horizon": "1~3 个月", "stance": "等待广度与结构同步确认",
                     "points": lt_points, "triggers": lt_triggers, "falsify": lt_falsify},
        "meta": {"engine": "build_review.py · 固定规则 · 本地数据驱动（无大模型、无联网）",
                 "dataAsOf": data_asof, "degraded": degraded, "columns": NCOL,
                 "reviewViewNo": REVNO,
                 "history": {"note": HIST_NOTE, "available": HIST_AVAIL,
                             "unavailable": HIST_UNAVAIL},
                 "sources": ["workbench.json", "breadth.json", "board_mom.json", "indices.json",
                             "flow.json", "wyckoff.json", "wyckoff_backtest.json",
                             "erp.json（锁定）", "tmt.json", "extras.json", "history.json（长历史回补）"],
                 "caveat": [
                     "本报告是数据汇总结构化描述，不是投资建议，不构成任何证券买卖依据。",
                     "「净流入」「方向代理」「申赎结构」与「TMT 成交占比」均为量价代理；真实资金流需要逐笔成交方向数据。"
                     "第 07 栏已撤销「国家队护盘」归因，ETF 季度申赎为真实季报、日度份额为量价反推估计，两者不可混用。",
                     "新增 6 栏的公开源均为盘后 T / T+1 可得，不是盘中实时；两融 T+1、中金所行情收盘后公布、"
                     "外盘为各自最近收盘，跨时区不同步。",
                     "中金所 XML 无隐含波动率字段，真实 IV / IV skew 未接入；会员净多空只是前 20 席位排名口径，"
                     "不是全市场净头寸；当月合约临近到期会放大年化贴水，需以次月口径为主。",
                     "短线情绪已分源回补：涨停 / 连板 / 晋级率用同花顺按日回补 250 日，"
                     "与当日东财涨跌停池是两套口径、家数不混算；炸板率 / 跌停家数因东财三池 date 参数失效、"
                     "同花顺无对应历史池、逐股缓存无最高价，实测无法回补，只有当日快照，不伪造、不插值。",
                     "行业 PE 当日为 219 个东财二级行业板块 f9 横截面；中位数 / 四分位趋势用东财 "
                     "RPT_VALUEINDUSTRY_DET 报表（127 行业）按日回补 250 日，两套口径样本数不同，"
                     "趋势图只用于看方向，不与 KPI 数字直接比较。业绩预告是公告口径代理，"
                     "不是分析师一致预期修正。",
                     "板块快照为当日横截面、股票池为当前全 A 名单，存在选择与幸存者偏差。",
                     "报告不回填历史日期：用当日板块快照反推过去会产生未来函数。",
                     "第 12 栏 ERP 的全部数字来自 erp.json 锁定快照（fetch_erp.py 一次性计算），"
                     "复盘只读、不重算、不改口径、不做四舍五入；日频 PE 由月末官方锚点重构，"
                     "条件概率样本重叠且未做显著性检验，ERP 对短期指数方向无稳定预测力。",
                     "第 12 栏为工作台独立实现，与既有「每周股债利差(ERP)区间与操作建议」周报的主读数同源同公式，"
                     "但历史条件概率 / 区间事件 / 建议措辞的定义不同，两者胜率与区间进度不可直接比较，也不互相覆盖。",
                     "TMT 成交占比同口径历史需东财 push2his 11 个二级行业板块 K 线的每日成交额；"
                     "实测仅 4 个可取、7 个经 6 轮补齐仍为空，用残缺板块加总会严重低估占比，"
                     "因此不发布残缺历史，仍只保留当日锁定读数与逐日累积，样本不足 20 日不出分位。",
                     HIST_NOTE,
                     "所有阈值与判读规则为预设固定值，未做参数寻优；建议只给条件与证伪场景。",
                 ]},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="")
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()
    w = jload("workbench.json")
    asof = a.date or w["meta"]["asof"]
    rev = build(asof)
    if a.show:
        print(rev["title"]); print(); print(rev["digest"]); print()
        for s_ in rev["sections"]:
            print("[%s] %s" % (s_["name"], " / ".join("%s:%s" % (k["k"], k["v"]) for k in s_["kpis"])))
            print("   " + s_["text"])
        for key, label in (("shortTerm", "短线"), ("longTerm", "中长线")):
            b = rev[key]
            print("\n%s（%s）%s" % (label, b["horizon"], b["stance"]))
            for x in b["points"]:
                print("  · " + x)
            print("  触发：", "；".join(b["triggers"]))
            print("  证伪：", "；".join(b["falsify"]))
        return
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            old = {}
    revs = [x for x in old.get("reviews", []) if x.get("date") != asof]
    revs.append(rev)
    revs.sort(key=lambda x: x["date"], reverse=True)
    revs = revs[:KEEP]
    jdump(OUT, {"meta": {"engine": "build_review.py", "keep": KEEP,
                         "note": "每交易日盘后生成当日一篇；不回填历史，避免未来函数",
                         "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds")},
                "asof": revs[0]["date"], "reviews": revs})
    print("生成复盘 %s | 共 %d 篇 | %.1f KB" %
          (asof, len(revs), os.path.getsize(OUT) / 1024))
    print("标题:", rev["title"])


if __name__ == "__main__":
    main()
