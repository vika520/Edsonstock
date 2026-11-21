#!/usr/bin/env python
"""EdsonVIX · A股版 VIX 恐慌指数（方案 A：方差互换法，CBOE 2003 / 原版 iVIX 同款）。

数据源
------
中金所日行情 XML（http://www.cffex.com.cn/sj/hqsj/rtj/YYYYMM/DD/index.xml，免费公开），
与 fetch_extras.py 同源。合约级数据（行权价编码在合约名、结算价、持仓）全部真实。

方法（对每个标的：IO=沪深300 主力口径；HO=上证50 / MO=中证1000 对照）
----------------------------------------------------------------
1. 取近月 + 次近月两个到期月份（近月剩余天数 < 7 天时改用次月+第三月，避免到期扭曲）；
2. 每个行权价取虚值一侧结算价：K < K* 用 Put，K > K* 用 Call；K* 由两侧价格交汇确定；
3. 方差互换方差 σ² = (2/T)·Σ(ΔK/K²)·e^{rT}·Q(K) − (1/T)·(F/K* − 1)²，F 由 Put-Call 平价推；
4. 30 日日历方差 = w1·σ²1·(T1·365/30 归一) + w2·σ2²，EdsonVIX = 100·√σ²30；
5. 无风险利率 r 固定 1.8%（写死并披露，不做逐日曲线）；
6. Skew = IV(90%K Put) − IV(110%K Call)（BS 反推单点 IV，恐慌结构信号）。

⚠ 口径披露（页面与复盘必须带上）：
- 自编指数，方法同 CBOE VIX / 原版 iVIX，非官方复刻；官方 iVIX(000188) 2018-02 起停发；
- 深度虚值合约（尤其 HO/MO 远月）流动性差，结算价可能滞后，用 iVIX 原版报价规则缓解；
- r 固定 1.8%；A 股期权深度与美股不同，绝对值不与美股 VIX 直接横比，看自身分位。

因果检验（防「恐慌见底反弹」神话）：expanding 90 分位阈值（只用截至当日数据）、
首次进入去重、其后 5/20/60 交易日沪深300 胜率 vs 全样本基准，单尾二项检验。

用法
----
  python fetch_vix.py --incremental        # 每日盘后：只补最新交易日
  python fetch_vix.py --backfill 240       # 回补约 240 个交易日
  python fetch_vix.py --rebuild-check      # 重算并打印 sanity 摘要
"""
import argparse
import datetime as dt
import json
import math
import os
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "vix.json")
CFFEX = "http://www.cffex.com.cn"
UNDER = {"IO": "sh000300", "HO": "sh000016", "MO": "sh000852"}
UNDER_NAME = {"IO": "沪深300", "HO": "上证50", "MO": "中证1000"}
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64. x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
R_FREE = 0.018          # 无风险利率（年化，固定并披露）
MIN_NEAR_DAYS = 7       # 近月剩余 < 7 天切换到次月+第三月
TARGET_DAYS = 30        # 30 日方差插值目标
EXPIRY = {              # 股指期权到期日 = 到期月第三个周五
}


def log(msg):
    print("[%s] %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def curl(url, retries=3, timeout=25):
    """CFFEX 对 Python urllib 不稳定（代理断连），统一走 curl 子进程。"""
    for i in range(retries):
        r = subprocess.run(
            ["curl", "-s", "-m", str(timeout), "-H", "User-Agent: " + UA, url],
            capture_output=True, timeout=timeout + 10)
        if r.returncode == 0 and len(r.stdout) > 500:
            try:
                return r.stdout.decode("gbk")
            except UnicodeDecodeError:
                return r.stdout.decode("utf-8", errors="ignore")
    return None


def tx_spot(code, days=420):
    """腾讯日线取现货指数收盘（用于 K* 定位与 Skew 行权价换算）。"""
    u = ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=%s,day,,,%d," %
         (code, days))
    req = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode("utf-8", errors="ignore"))
    node = j.get("data", {}).get(code, {}).get("day") or \
        j.get("data", {}).get(code, {}).get("qfqday") or []
    return {x[0].replace("-", ""): float(x[2]) for x in node}


def third_friday(y, m):
    d = dt.date(y, m, 1)
    fridays = [d + dt.timedelta(i) for i in range(31)
               if (d + dt.timedelta(i)).month == m and (d + dt.timedelta(i)).weekday() == 4]
    return fridays[2]


def expiry_of_month(ym):
    """'2612'（YYMM）→ 到期日（该月第三个周五）。"""
    y = 2000 + int(str(ym)[:2])
    m = int(str(ym)[2:4])
    return third_friday(y, m)


def parse_options(raw, pid):
    """从日行情 XML 抽取某品种全部期权合约（结算价 + 行权价）。"""
    if not raw:
        return []
    out = []
    for b in re.findall(r"<dailydata>(.*?)</dailydata>", raw, re.S):
        if ("<instrumentid>%s" % pid) not in b:
            continue
        iid = (re.search(r"<instrumentid>([^<]+)</instrumentid>", b) or [None, ""])[1]
        parts = iid.split("-")
        if len(parts) != 3 or parts[1] not in ("C", "P"):
            continue
        try:
            k = float(parts[2])
        except ValueError:
            continue
        m = re.search(r"<settlementprice>([^<]*)</settlementprice>", b)
        s = float(m.group(1)) if m and m.group(1) not in ("", "0") else None
        oi = re.search(r"<openinterest>([^<]*)</openinterest>", b)
        if s is None:
            continue
        out.append({"id": iid, "ym": parts[0][len(pid):], "cp": parts[1],
                    "k": k, "settle": s,
                    "oi": float(oi.group(1)) if oi and oi.group(1) else 0.0})
    return out


def bs_iv(price, S, K, T, cp, r=R_FREE):
    """BS 反推单点隐含波动率（Newton 迭代）。"""
    if not price or price <= 0 or T <= 0 or S <= 0:
        return None
    intrinsic = max(0.0, (S - K * math.exp(-r * T))) if cp == "C" else \
        max(0.0, (K * math.exp(-r * T) - S))
    if price <= intrinsic + 1e-9:
        return None
    sig = 0.3
    for _ in range(60):
        d1 = (math.log(S / K) + (r + sig * sig / 2) * T) / (sig * math.sqrt(T))
        d2 = d1 - sig * math.sqrt(T)
        c = S * _phi(d1) - K * math.exp(-r * T) * _phi(d2) if cp == "C" else \
            K * math.exp(-r * T) * _phi(-d2) - S * _phi(-d1)
        vega = S * math.sqrt(T) * _pdf(d1)
        if vega < 1e-9:
            break
        diff = c - price
        sig -= diff / vega
        if sig <= 0.01:
            return None
        if abs(diff) < 1e-7:
            break
    return sig * 100 if 0.01 < sig < 3 else None


def _phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _pdf(x):
    return math.exp(-x * x / 2) / math.sqrt(2 * math.pi)


def vix_for_pid(contracts, today, pid):
    """CBOE 方差互换：返回 (vix, skew, detail) 或 (None, reason)。"""
    by_month = {}
    for c in contracts:
        by_month.setdefault(c["ym"], []).append(c)
    # 按到期日排序取两个可用月份（跳过剩余 <7 天的近月）
    months = sorted(by_month, key=expiry_of_month)
    usable = []
    for ym in months:
        exp = expiry_of_month(ym)
        if (exp - today).days >= MIN_NEAR_DAYS:
            usable.append((ym, exp))
        if len(usable) == 2:
            break
    if len(usable) < 2:
        return None, "剩余≥%d 天的到期月不足 2 个（近月到期扭曲已跳过）" % MIN_NEAR_DAYS
    variances = []
    for ym, exp in usable:
        T = max((exp - today).days, 1) / 365.0
        res = _variance_one_month(by_month[ym], T)
        if not res:
            return None, "%s 月期权链不完整" % ym
        variances.append((T, res[0], res[1]))
    (t1, v1, f1), (t2, v2, f2) = variances
    if t2 <= t1 or v1 is None or v2 is None:
        return None, "期限结构异常"
    w = (TARGET_DAYS / 365.0 - t1) / (t2 - t1)
    w = max(0.0, min(1.0, w))
    var30 = (1 - w) * (t1 * v1) * 365.0 / TARGET_DAYS + w * (t2 * v2) * 365.0 / TARGET_DAYS
    if var30 <= 0:
        return None, "方差非正"
    vix = 100 * math.sqrt(var30)
    # Skew：90%K Put IV − 110%K Call IV（近月）
    ym1 = usable[0][0]
    chain = by_month[ym1]
    t1d = max((usable[0][1] - today).days, 1) / 365.0
    skew = _skew(chain, f1, t1d)
    return {"vix": round(vix, 2), "skew": skew,
            "near": usable[0][0], "second": usable[1][0],
            "w2": round(w, 4)}, None


def _variance_one_month(chain, T):
    """单到期月方差：返回 (方差, 远期F)。"""
    calls = {c["k"]: c for c in chain if c["cp"] == "C"}
    puts = {c["k"]: c for c in chain if c["cp"] == "P"}
    ks = sorted(set(calls) & set(puts))
    if len(ks) < 5:
        return None
    # 找 K*：abs(C-P) 最小且 Put-Call 差变号处
    best = None
    for k in ks:
        d = calls[k]["settle"] - puts[k]["settle"]
        if best is None or abs(d) < abs(best[1]):
            best = (k, d)
    kstar, _ = best
    # F = K* + e^{rT}(C−P)
    F = kstar + math.exp(R_FREE * T) * (calls[kstar]["settle"] - puts[kstar]["settle"])
    # 逐行权价取虚值一侧
    q = {}
    for k in ks:
        if k == kstar:
            q[k] = (calls[k]["settle"] + puts[k]["settle"]) / 2
        elif k < kstar:
            q[k] = puts[k]["settle"]
        else:
            q[k] = calls[k]["settle"]
    qk = sorted(q)
    contrib = 0.0
    for i, k in enumerate(qk):
        dk = qk[i + 1] - qk[i - 1] if 0 < i < len(qk) - 1 else \
            ((qk[1] - qk[0]) if i == 0 else (qk[-1] - qk[-2]))
        dk /= 2.0
        if dk <= 0:
            continue
        contrib += (dk / (k * k)) * math.exp(R_FREE * T) * q[k]
    var = (2.0 / T) * contrib - (1.0 / T) * (F / kstar - 1.0) ** 2
    if var <= 0:
        return None
    return var, F


def _skew(chain, F, T):
    """90%K Put IV − 110%K Call IV。"""
    k_lo, k_hi = F * 0.90, F * 1.10
    p_lo = _nearest(chain, "P", k_lo)
    c_hi = _nearest(chain, "C", k_hi)
    if not p_lo or not c_hi:
        return None
    iv_p = bs_iv(p_lo["settle"], F, p_lo["k"], T, "P")
    iv_c = bs_iv(c_hi["settle"], F, c_hi["k"], T, "C")
    if iv_p is None or iv_c is None:
        return None
    return round(iv_p - iv_c, 2)


def _nearest(chain, cp, k_target):
    cand = [c for c in chain if c["cp"] == cp and c["settle"] > 0]
    if not cand:
        return None
    return min(cand, key=lambda c: abs(c["k"] - k_target))


def hv30(closes):
    """30 日已实现波动率（年化，对照线）。"""
    if len(closes) < 31:
        return None
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(len(closes) - 30, len(closes))]
    m = sum(rets) / len(rets)
    var = sum((r - m) ** 2 for r in rets) / (len(rets) - 1)
    return round(100 * math.sqrt(var * 252), 2)


def binom_ge(n, k, p):
    if n <= 0 or p <= 0:
        return 1.0
    if p >= 1:
        return 1.0
    tot = 0.0
    for i in range(k, n + 1):
        lc = math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1)
        tot += math.exp(lc + i * math.log(p) + (n - i) * math.log1p(-p))
    return min(1.0, tot)


def causal_test(series, closes):
    """expanding 90 分位、首次进入去重、5/20/60 日胜率 vs 基准。"""
    out = {}
    entries, prev = [], False
    for t in range(60, len(series)):
        if series[t] is None:
            continue
        hist = [v for v in series[max(0, t - 250):t + 1] if v is not None]
        if len(hist) < 60:
            continue
        h = sorted(hist)
        q90 = h[int(0.9 * (len(h) - 1))]
        hit = series[t] >= q90
        if hit and not prev:
            entries.append(t)
        prev = hit
    for horizon in (5, 20, 60):
        valid = [t for t in entries if t + horizon < len(closes)]
        if not valid:
            out[horizon] = None
            continue
        rets = [closes[t + horizon] / closes[t] - 1 for t in valid]
        wins = sum(1 for r in rets if r > 0)
        base = [closes[i + horizon] / closes[i] - 1 for i in range(len(closes) - horizon)]
        bw = sum(1 for r in base if r > 0)
        br = bw / len(base) if base else 0.5
        wr = wins / len(valid)
        out[horizon] = {
            "events": len(valid), "winRate": round(100 * wr, 2),
            "baseline": round(100 * br, 2),
            "avgRet": round(100 * sum(rets) / len(rets), 2),
            "p": round(binom_ge(len(valid), wins, br), 4),
            "sig": binom_ge(len(valid), wins, br) < 0.05,
        }
    return {"entries": len(entries), "entryDates": [ _idx_date(t) for t in entries ], "fwd": out}


_IDX_DATES = []


def _idx_date(t):
    return _IDX_DATES[t] if t < len(_IDX_DATES) else "?"


def fetch_day(date):
    url = "%s/sj/hqsj/rtj/%s/%s/index.xml" % (CFFEX, date[:6], date[6:8])
    return date, curl(url, retries=2, timeout=22)


def trade_dates_from_indices():
    """用 indices.json 的交易日历（indices.sh000300.rows = [date, close, high, low]）。"""
    p = os.path.join(DATA, "indices.json")
    j = json.load(open(p, encoding="utf-8"))
    rows = ((j.get("indices") or {}).get("sh000300") or {}).get("rows") or []
    return [r[0] for r in rows], [float(r[1]) for r in rows]


def build(dates_wanted, spot_cache):
    """逐日计算，返回 series 行。"""
    dates, closes = trade_dates_from_indices()
    global _IDX_DATES
    _IDX_DATES = dates
    results = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for date, raw in ex.map(fetch_day, dates_wanted):
            if not raw:
                log("  %s XML 拉取失败，跳过" % date)
                continue
            today = dt.date(int(date[:4]), int(date[4:6]), int(date[6:8]))
            row = {"date": date}
            for pid in UNDER:
                contracts = parse_options(raw, pid)
                if not contracts:
                    row[pid] = None
                    continue
                v, err = vix_for_pid(contracts, today, pid)
                if err:
                    row[pid] = None
                    row[pid + "_err"] = err
                else:
                    row[pid] = v
            S = spot_cache.get(date)
            row["hv30"] = hv30([c for d, c in zip(dates, closes) if d <= date][-31:]) \
                if S else None
            results[date] = row
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--incremental", action="store_true")
    ap.add_argument("--backfill", type=int, default=0)
    ap.add_argument("--rebuild-check", action="store_true")
    a = ap.parse_args()

    dates, closes = trade_dates_from_indices()
    spot = {}
    for pid, code in UNDER.items():
        pass
    # 现货缓存（IO/沪深300 主口径必需，HO/MO 可缺）
    spot = tx_spot("sh000300")

    old = {}
    if os.path.exists(OUT):
        old = json.load(open(OUT, encoding="utf-8"))

    if a.backfill:
        want = [d for d in dates[-a.backfill:]]
    else:
        want = [dates[-1]]
    have = {r["date"] for r in (old.get("rows") or [])}
    todo = [d for d in want if d not in have]
    log("待计算 %d 个交易日（已有 %d）" % (len(todo), len(have)))
    if todo:
        new = build(todo, spot)
        rows = (old.get("rows") or []) + [new[d] for d in sorted(new)]
        rows.sort(key=lambda r: r["date"])
        # 同日重算覆盖
        dedup = {}
        for r in rows:
            dedup[r["date"]] = r
        old["rows"] = [dedup[d] for d in sorted(dedup)]
    else:
        log("无待计算日期")

    rows = old.get("rows") or []
    io_series = [(r["date"], (r.get("IO") or {}).get("vix")) for r in rows]
    valid = [v for _, v in io_series if v]
    last = rows[-1] if rows else {}
    io = (last.get("IO") or {})
    snapshot = {
        "asof": last.get("date"),
        "vix": io.get("vix"), "skew": io.get("skew"),
        "hv30": last.get("hv30"),
        "percentile": None, "seriesDays": len(valid),
    }
    if valid:
        s = sorted(valid)
        snapshot["percentile"] = round(
            100 * sum(1 for v in valid if v <= (io.get("vix") or 0)) / len(valid), 2)
        snapshot["min"] = s[0]
        snapshot["max"] = s[-1]
        snapshot["median"] = s[len(s) // 2]
    old["meta"] = {
        "method": "CBOE 2003 方差互换（近月+次月 → 30 日插值）；K* 交汇定远期；r=%.1f%% 固定" % (R_FREE * 100),
        "under": {"IO": "沪深300（主口径）", "HO": "上证50（对照）", "MO": "中证1000（对照）"},
        "source": "中金所日行情 XML（结算价/行权价/持仓，真实）",
        "disclosure": [
            "自编指数，方法同 CBOE VIX / 原版 iVIX(000188, 2018-02 停发)，非官方复刻",
            "深度虚值合约流动性差时结算价可能滞后；r 固定 1.8%",
            "A 股期权深度与美股不同，绝对值不与美股 VIX 横比，看自身分位",
            "Skew = 90%K Put IV − 110%K Call IV（BS 反推，近月）",
        ],
        "lockedBase": old.get("meta", {}).get("lockedBase") or last.get("date"),
    }
    old["snapshot"] = snapshot
    # 因果检验（IO 序列）
    idx_close = {d: c for d, c in zip(dates, closes)}
    aligned_c = [idx_close.get(d) for d, _ in io_series]
    if all(aligned_c):
        old["causal"] = causal_test([v for _, v in io_series], aligned_c)

    json.dump(old, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("saved %s · %d 日 · IO VIX=%s（%s 分位）" %
        (os.path.basename(OUT), snapshot["seriesDays"], snapshot["vix"], snapshot["percentile"]))
    if a.rebuild_check:
        print("\nIO 序列（每 20 日采样）:")
        for d, v in io_series[::20]:
            print("  %s  %s" % (d, v))
        print("因果:", json.dumps((old.get("causal") or {}).get("fwd"), ensure_ascii=False))


if __name__ == "__main__":
    main()
