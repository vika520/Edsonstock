#!/usr/bin/env python
"""STH 成本基础模型 · A 股筹码衰减版（方案 A 修正版）。

模型
----
筹码衰减马尔可夫链（复刻 BTC STH Cost Basis 思路）：
  chips_t(p) = chips_{t-1}(p) × (1 − turnover_t) + new_t(p)
  new_t(p)：当日 [low, high] 三角分布，峰=收盘价（近似 VWAP，已披露）
  STH_t(N) = 最近 N 日新增筹码层的加权均价
  turnover_t = 成交量 / 自由流通股本（东财 RPT_VALUEANALYSIS_DET 日频，2018-06 起）

除权处理
--------
无公开复权因子可用 → 用股本跳变近似：流通股本单日变化 >10% 视为送转/除权，
旧筹码层价格按 FREE_SHARES_{t-1}/FREE_SHARES_t 整体缩放（宁德实测 3/3 命中）。
纯现金分红（不改股本）造成的缺口不缩放，股息率 1~3% 属可接受误差（已披露）。

数据源（全部免费公开，无 WAF 风险）
----------------------------------
  新浪日线 3000 根（2014-07 起）：OHLCV（未复权）
  东财 datacenter RPT_VALUEANALYSIS_DET 分页全史：日频收盘价 + 流通股本
  网易接口已死、腾讯 WAF 不稳定、东财 push2his 随机限流 → 全部弃用

标的（起步 3 个）
----------------
  300750 宁德时代 / 600519 贵州茅台（单股验证）
  hs300top：沪深300 篮子等权 30 只（代理口径，非官方成分加权）

通道与检验
----------
  spread = close − STH(80)；250/500 日滚动均值 ± [0.5,1,1.5,2]σ
  burn-in：衰减链前 500 交易日为记忆初始化期
  因果检验：spread ≤ mean−2σ 首次进入、其后 20/60 日 vs 全样本基准

用法
----
  python fetch_sth.py --full          # 全量重建
  python fetch_sth.py --incremental   # 每日盘后（先 --full 一次）
"""
import argparse
import datetime as dt
import json
import math
import os
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "sth.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BURN_IN = 500
HORIZONS = (60, 80, 100)
N_MAIN = 80
WINDOWS = (250, 500)
CHANNELS = (0.5, 1.0, 1.5, 2.0)
SPLIT_RATIO = 1.10  # 股本单日 +10% 视为送转除权
TARGETS = [("300750", "宁德时代"), ("600519", "贵州茅台"),
           ("hs300top", "沪深300篮子·等权30只（代理）")]
BASKET_HS300 = ["600519", "300750", "601318", "600036", "000858", "601888", "000333",
                "600900", "603288", "300760", "600276", "601012", "000568", "600030",
                "601166"]  # 前 15 只流动性样本；扩到 30 只需模拟耗时等比增长


def process_basket():
    """等权篮子：逐成员计算 STH80，按日期对齐取均值。"""
    per = {}
    for mc in BASKET_HS300:
        sina = sina_daily(mc)
        if len(sina) < BURN_IN + 150:
            log("  成员 %s 数据不足（%d），跳过" % (mc, len(sina)))
            continue
        em = em_shares_full(mc)
        if not em:
            log("  成员 %s 无股本报表，跳过" % mc)
            continue
        daily = build_daily(sina, em)
        if len(daily) < BURN_IN + 100:
            log("  成员 %s 对齐后不足（%d），跳过" % (mc, len(daily)))
            continue
        dates, close, sth, _ = simulate(daily)
        per[mc] = {"dates": dates, "sth80": sth[str(N_MAIN)], "close": close}
        log("  成员 %s 完成（%d 日）" % (mc, len(dates)))
        time.sleep(0.8)
    if not per:
        return None
    all_d = sorted({d for v in per.values() for d in v["dates"]})
    cnt, s80, sc = {}, {}, {}
    for mc, v in per.items():
        dm = dict(zip(v["dates"], v["sth80"]))
        cm = dict(zip(v["dates"], v["close"]))
        for d in all_d:
            if d in dm and dm[d] is not None:
                cnt[d] = cnt.get(d, 0) + 1
                s80[d] = s80.get(d, 0) + dm[d]
            if d in cm and cm[d] is not None:
                sc[d] = sc.get(d, 0) + cm[d]
    thr = max(3, int(len(per) * 0.7))
    dates_b = [d for d in all_d if cnt.get(d, 0) >= thr]
    sth_b = [s80[d] / cnt[d] if cnt.get(d) else None for d in dates_b]
    closes_b = [sc[d] / cnt[d] if cnt.get(d) else None for d in dates_b]
    # 篮子不做二次衰减模拟：成员已各自算过 STH，这里只对等权均值序列求通道与检验
    spread_b = [(closes_b[i] - sth_b[i]) if (closes_b[i] is not None and sth_b[i] is not None)
                else None for i in range(len(dates_b))]
    ch = {str(w): rolling_channel(spread_b, w) for w in WINDOWS}
    entries, prev = [], False
    lo2 = ch["250"]["p2"]
    for i in range(len(dates_b)):
        hit = spread_b[i] is not None and lo2[i] is not None and spread_b[i] <= lo2[i]
        if hit and not prev:
            entries.append(dates_b[i])
        prev = hit
    fwd = {}
    for h in (20, 60):
        rr = causal(entries, dates_b, closes_b, h)
        if rr:
            fwd[str(h)] = rr
    r = {"dates": dates_b, "close": closes_b,
         "sth": {"80": sth_b}, "spread": spread_b, "ch": ch,
         "entries": entries, "fwd": fwd, "splits": [], "startIdx": 0,
         "code": "hs300top",
         "name": "沪深300篮子·等权15只（代理）",
         "members": sorted(per.keys()), "nMembers": len(per)}
    log("篮子完成：%d 成员 / %d 日 / -2σ %d 次 / 60日 p=%s" %
        (len(per), len(r["dates"]), len(r["entries"]),
         (r["fwd"].get("60") or {}).get("p")))
    return r


def log(msg):
    print("[%s] %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def curl(url, retries=3, timeout=30, ref="https://finance.sina.com.cn/"):
    for i in range(retries):
        r = subprocess.run(["curl", "-s", "-m", str(timeout), "-A", UA,
                            "-H", "Referer: " + ref, url],
                           capture_output=True, timeout=timeout + 10)
        if r.returncode == 0 and r.stdout:
            return r.stdout.decode("utf-8", errors="ignore")
        time.sleep(0.8 * (i + 1))
    return None


def sina_daily(code, n=3000):
    """新浪日线（未复权）：[{d,o,h,l,c,v}]，v 单位股。"""
    sym = ("sh" + code) if code.startswith("6") else ("sz" + code)
    u = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
         "CN_MarketData.getKLineData?symbol=%s&scale=240&ma=no&datalen=%d" % (sym, n))
    raw = curl(u)
    import json as _j
    try:
        arr = _j.loads(raw) if raw else []
    except ValueError:
        arr = []
    if not isinstance(arr, list):
        arr = []
    out = []
    for x in arr:
        try:
            out.append({"d": x["day"].replace("-", ""), "o": float(x["open"]),
                        "h": float(x["high"]), "l": float(x["low"]),
                        "c": float(x["close"]), "v": float(x["volume"])})
        except (KeyError, ValueError):
            continue
    return out


def em_shares_full(code):
    """东财报表分页全史：[{d(yyyymmdd), close, shares}]，TRADE_DATE 升序。"""
    out, page = [], 1
    while True:
        u = ("https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET"
             "&columns=TRADE_DATE,CLOSE_PRICE,FREE_SHARES_A&pageSize=500&pageNumber=%d"
             "&filter=(SECURITY_CODE%%3D%%22%s%%22)&sortColumns=TRADE_DATE&sortTypes=1" % (page, code))
        raw = curl(u, ref="https://data.eastmoney.com/")
        if not raw:
            break
        try:
            d = json.loads(raw)
        except ValueError:
            break
        rows = (d.get("result") or {}).get("data") or []
        if not rows:
            break
        for x in rows:
            dd = (x.get("TRADE_DATE") or "")[:10].replace("-", "")
            fs, cp = x.get("FREE_SHARES_A"), x.get("CLOSE_PRICE")
            if dd and fs and cp:
                out.append({"d": dd, "close": float(cp), "shares": float(fs)})
        if len(rows) < 500:
            break
        page += 1
    return out


def build_daily(sina, em):
    """对齐新浪日线与东财股本：[date, o,h,l,c,v, shares]，shares 前向填充。"""
    em_map = {x["d"]: x for x in em}
    out, last_shares = [], None
    for b in sina:
        e = em_map.get(b["d"])
        if e:
            last_shares = e["shares"]
        if last_shares:
            out.append({**b, "shares": last_shares})
    return out


def simulate(daily):
    """筹码衰减。返回 (dates, close, sth{N:[...]}, split_events)。"""
    n = len(daily)
    GRID = 200
    dates = [b["d"] for b in daily]
    close = [b["c"] for b in daily]
    sth = {str(k): [None] * n for k in HORIZONS}
    layers = []  # [(start_idx, plo, pstep, hist)]
    splits = []
    for i in range(n):
        b = daily[i]
        shares = b["shares"]
        # 除权缩放：股本跳变
        if i > 0 and daily[i - 1]["shares"]:
            ratio = shares / daily[i - 1]["shares"]
            if ratio >= SPLIT_RATIO:
                scale = 1.0 / ratio
                layers = [(s, plo * scale, pstep, hist)
                          for (s, plo, pstep, hist) in layers]
                splits.append({"date": dates[i], "ratio": round(ratio, 3)})
        turnover = min(0.95, b["v"] / shares) if shares > 0 else 0.0
        p_lo, p_hi = min(b["l"], b["h"]), max(b["l"], b["h"])
        if p_hi <= p_lo:
            p_hi = p_lo * 1.001 + 1e-9
        peak_frac = max(0.02, min(0.98, (b["c"] - p_lo) / (p_hi - p_lo)))
        step = (p_hi - p_lo) / (GRID - 1)
        new_grid = []
        for g in range(GRID):
            x = g / (GRID - 1)
            tri = (x / peak_frac) if x <= peak_frac else ((1 - x) / (1 - peak_frac))
            new_grid.append(max(0.0, tri))
        s_new = sum(new_grid) or 1.0
        new_grid = [g / s_new * turnover for g in new_grid]
        kept = []
        for (s0, plo, pstep, hist) in layers:
            h2 = [w * (1 - turnover) for w in hist]
            if sum(h2) > 1e-9:
                kept.append((s0, plo, pstep, h2))
        kept.append((i, p_lo, step, new_grid))
        layers = kept
        for N in HORIZONS:
            tw = tp = 0.0
            for (s0, plo, pstep, hist) in layers:
                if i - s0 >= N:
                    continue
                for g in range(GRID):
                    w = hist[g]
                    if w > 0:
                        tw += w
                        tp += w * (plo + g * pstep)
            sth[str(N)][i] = (tp / tw) if tw > 0 else None
    return dates, close, sth, splits


def rolling_channel(spread, win):
    n = len(spread)
    mean = [None] * n
    sd = [None] * n
    for i in range(win - 1, n):
        seg = [x for x in spread[i - win + 1:i + 1] if x is not None]
        if len(seg) < win * 0.8:
            continue
        m = sum(seg) / len(seg)
        v = sum((x - m) ** 2 for x in seg) / (len(seg) - 1)
        mean[i], sd[i] = m, math.sqrt(v)
    out = {"mean": mean, "sd": sd}
    for k in CHANNELS:
        out["m%g" % k] = [None if mean[i] is None else mean[i] + k * sd[i] for i in range(n)]
        out["p%g" % k] = [None if mean[i] is None else mean[i] - k * sd[i] for i in range(n)]
    return out


def binom_ge(nn, k, p):
    if nn <= 0 or p <= 0:
        return 1.0
    tot = 0.0
    for i in range(k, nn + 1):
        lc = math.lgamma(nn + 1) - math.lgamma(i + 1) - math.lgamma(nn - i + 1)
        tot += math.exp(lc + i * math.log(p) + (nn - i) * math.log1p(-p))
    return min(1.0, tot)


def causal(entries, dates, closes, horizon):
    idx_of = {d: i for i, d in enumerate(dates)}
    idxs = sorted(idx_of[d] for d in entries if d in idx_of)
    valid = [i for i in idxs if i + horizon < len(closes)]
    if not valid:
        return None
    rets = [(closes[i + horizon] / closes[i] - 1) * 100 for i in valid]
    wins = sum(1 for r in rets if r > 0)
    base = [(closes[i + horizon] / closes[i] - 1) * 100
            for i in range(len(closes) - horizon)]
    bw = sum(1 for r in base if r > 0)
    br = bw / len(base) if base else 0.5
    p = binom_ge(len(valid), wins, br)
    return {"events": len(valid), "winRate": round(100 * wins / len(valid), 2),
            "baseline": round(100 * br, 2), "avgRet": round(sum(rets) / len(rets), 2),
            "p": round(p, 4), "sig": p < 0.05}


def assemble(daily, splits):
    dates, close, sth, _ = simulate(daily)
    main = sth[str(N_MAIN)]
    spread = [(close[i] - main[i]) if main[i] is not None else None
              for i in range(len(dates))]
    ch = {str(w): rolling_channel(spread, w) for w in WINDOWS}
    entries, prev = [], False
    lo2 = ch["250"]["p2"]
    for i in range(len(dates)):
        hit = spread[i] is not None and lo2[i] is not None and spread[i] <= lo2[i]
        if hit and not prev:
            entries.append(dates[i])
        prev = hit
    fwd = {}
    for h in (20, 60):
        r = causal(entries, dates, close, h)
        if r:
            fwd[str(h)] = r
    start_idx = next((i for i, v in enumerate(main) if v is not None), len(dates))
    return {"dates": dates, "close": close, "sth": sth, "spread": spread,
            "ch": ch, "entries": entries, "fwd": fwd, "splits": splits,
            "startIdx": start_idx}


def process_one(code, name):
    sina = sina_daily(code)
    if len(sina) < BURN_IN + 150:
        log("  %s %s 新浪数据不足（%d）跳过" % (code, name, len(sina)))
        return None
    em = em_shares_full(code)
    if not em:
        log("  %s 东财股本报表为空，跳过" % code)
        return None
    daily = build_daily(sina, em)
    if len(daily) < BURN_IN + 150:
        log("  %s 对齐后不足（%d），跳过" % (code, len(daily)))
        return None
    r = assemble(daily, [])
    r.update({"code": code, "name": name})
    log("  %s %s：%d 日（%s~%s），-2σ 触发 %d 次，20日 p=%s" %
        (code, name, len(r["dates"]), r["dates"][0], r["dates"][-1],
         len(r["entries"]), (r["fwd"].get("20") or {}).get("p")))
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--incremental", action="store_true",
                    help="每日盘后：只更新单股标的（跳过 15 只篮子，篮子需 --full 约 20 分钟，建议周频）")
    a = ap.parse_args()
    log("STH 成本基础模型 · burn-in=%d N=%s 窗口=%s" % (BURN_IN, HORIZONS, WINDOWS))
    out = {"meta": {
        "method": ("筹码衰减马尔可夫链 chips_t=chips_(t-1)×(1−turnover)+new；"
                   "new=当日[low,high]三角分布峰=收盘；turnover=新浪未复权量÷东财日频流通股本"),
        "targets": {c: n for c, n in TARGETS},
        "disclosure": [
            "价位轴为未复权价；除权缩放用流通股本跳变检测（>10% 视为送转），"
            "纯现金分红缺口不缩放（股息率 1~3% 误差可接受）",
            "VWAP 用收盘价近似（新浪日线无成交额字段）",
            "有效数据自东财报表起点 2018-06 起；burn-in %d 日为初始化期" % BURN_IN,
            "篮子为等权 30 只流动性样本，非官方指数成分加权",
            "因果检验：spread≤mean−2σ 首次进入、其后 20/60 日 vs 全样本基准",
        ],
        "N": list(HORIZONS), "windows": list(WINDOWS), "channels": list(CHANNELS),
    }, "targets": {}}
    old_targets = {}
    if os.path.exists(OUT):
        try:
            old_targets = json.load(open(OUT, encoding="utf-8")).get("targets") or {}
        except Exception:
            pass
    for code, name in TARGETS:
        if code == "hs300top":
            if a.incremental:
                # 增量模式：沿用上一版篮子数据
                prev = (old_targets or {}).get("hs300top")
                if prev:
                    out["targets"][code] = prev
                    log("篮子沿用上一版（%d 日），--full 可全量重算" % len(prev.get("dates") or []))
                continue
            log("计算 hs300top 篮子（等权 %d 只）..." % len(BASKET_HS300))
            r = process_basket()
            if r:
                out["targets"][code] = r
            continue
        log("计算 %s %s ..." % (code, name))
        r = process_one(code, name)
        if r:
            out["targets"][code] = r
    snap = {}
    for k, t in out["targets"].items():
        i = len(t["dates"]) - 1
        sp, m, sd = t["spread"][i], t["ch"]["250"]["mean"][i], t["ch"]["250"]["sd"][i]
        snap[k] = {"asof": t["dates"][i], "close": t["close"][i],
                   "sth80": t["sth"]["80"][i], "spread": sp, "mean": m, "sd": sd,
                   "z": (round((sp - m) / sd, 3) if (sp is not None and m is not None and sd) else None),
                   "entries": len(t["entries"]),
                   "fwd20": t["fwd"].get("20")}
    out["snapshot"] = snap
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            pass
    out["meta"]["lockedBase"] = old.get("meta", {}).get("lockedBase") or \
        (out["targets"].get("300750", {}).get("dates") or ["?"])[0]
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("saved %.1f KB · z 值: %s" % (os.path.getsize(OUT) / 1024,
                                     {k: v.get("z") for k, v in snap.items()}))


if __name__ == "__main__":
    main()
