"""第三轮：用生产同款 curl() 复测腾讯/东财 K 线，并定位同花顺炸板与行业 PE 历史全量。"""
import json
import os
import urllib.request

from fetch_extras import curl, jget

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "_probe_history3_raw.json")
res = {}

# ---------- 1. 腾讯 K 线（生产同款 curl） ----------
print("[1] 腾讯 K 线")
qq = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=%s,day,2024-01-01,2026-12-31,800,qfq"
for label, code in (("ETF510300", "sh510300"), ("HSI", "hkHSI"),
                    ("NDX", "usNDX"), ("SPX", "usSPX"), ("DJI", "usDJI")):
    raw = curl(qq % code, retries=2)
    try:
        d = json.loads(raw)
        node = (d.get("data") or {}).get(code) or {}
        arr = node.get("day") or node.get("qfqday") or []
        res["qq_" + label] = {"n": len(arr), "first": arr[0] if arr else None,
                              "last": arr[-1] if arr else None,
                              "keys": list(node.keys())}
    except Exception:
        res["qq_" + label] = {"raw": raw[:180]}
    print(" ", label, json.dumps(res["qq_" + label], ensure_ascii=False)[:300])

# 腾讯 ETF 原始日线（非复权，字段更多？）
raw = curl("https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=sh510300,day,2024-01-01,2026-12-31,800",
           retries=2)
res["qq_etf_kline_raw"] = {"raw": raw[:320], "len": len(raw)}
print("  ETF raw kline:", res["qq_etf_kline_raw"]["raw"][:240])

# ---------- 2. 东财 push2his K 线（生产同款 curl） ----------
print("[2] 东财 K 线")
UT = "fa5fd1943c7b386f172d6893dbfba10b"
kl = ("https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=%s&ut=%s"
      "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
      "&klt=101&fqt=1&beg=0&end=20500101&lmt=1000")
for label, secid in (("ETF", "1.510300"), ("BOARD", "90.BK1036"), ("HSI", "100.HSI")):
    raw = curl(kl % (secid, UT), retries=2)
    try:
        d = (json.loads(raw).get("data") or {})
        arr = d.get("klines") or []
        res["em_kl_" + label] = {"n": len(arr), "first": arr[0] if arr else None,
                                 "last": arr[-1] if arr else None}
    except Exception:
        res["em_kl_" + label] = {"raw": raw[:180]}
    print(" ", label, json.dumps(res["em_kl_" + label], ensure_ascii=False)[:300])

# ---------- 3. 同花顺炸板 / 跌停 / 市场统计路径 ----------
print("[3] 同花顺历史池路径")
THS = "https://data.10jqka.com.cn/dataapi/limit_up/"
paths = ["open_limit_up", "open_limit_up_pool", "broken_limit_up", "broken_limit_up_pool",
         "limit_down", "limit_down_pool", "limit_up_data", "limit_up_statistic",
         "market_emotion", "continuous_limit_up", "limit_up_pool"]
for p in paths:
    u = (THS + "%s?page=1&limit=5&field=199112,10,9001,330323,330324,330325,9002,330329,"
         "133971,133970,1968584,3475914,9003,9004&filter=HS,GEM2STAR"
         "&order_field=330324&order_type=0&date=20261112" % p)
    raw = curl(u, "https://data.10jqka.com.cn/", retries=1)
    res["ths_path_" + p] = {"raw": raw[:260]}
    print("  %-24s %s" % (p, raw[:150].replace("\n", " ")))

# ---------- 4. 行业 PE 历史：按日期全量 ----------
print("[4] 行业 PE 按日全量")
DC = "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEINDUSTRY_DET"
for d in ("2026-11-13", "2026-11-12", "2024-05-20"):
    u = (DC + "&columns=ALL&pageNumber=1&pageSize=500&source=WEB&client=WEB"
         "&filter=(TRADE_DATE%3D%27" + d + "%27)")
    raw = curl(u, "https://data.eastmoney.com/", retries=2)
    try:
        j = json.loads(raw)
        arr = ((j.get("result") or {}).get("data") or [])
        pes = sorted(x["PE_TTM"] for x in arr if isinstance(x.get("PE_TTM"), (int, float)) and x["PE_TTM"] > 0)
        res["ind_" + d] = {"n": len(arr), "peN": len(pes),
                           "median": pes[len(pes) // 2] if pes else None,
                           "sample": arr[0] if arr else None}
    except Exception:
        res["ind_" + d] = {"raw": raw[:200]}
    print(" ", d, json.dumps(res["ind_" + d], ensure_ascii=False)[:240])
# 最早可得日期
u = (DC + "&columns=TRADE_DATE&pageNumber=1&pageSize=1&sortColumns=TRADE_DATE&sortTypes=1"
     "&source=WEB&client=WEB")
res["ind_earliest"] = {"raw": curl(u, "https://data.eastmoney.com/", retries=2)[:300]}
print("  earliest:", res["ind_earliest"]["raw"][:200])

# ---------- 5. erp.json 中债 10Y 序列 ----------
erp = json.load(open(os.path.join(DATA, "erp.json"), encoding="utf-8"))
se = erp.get("series") or {}
res["erp_series"] = {"fields": se.get("fields"), "n": len(se.get("rows") or []),
                     "first": (se.get("rows") or [None])[0],
                     "last": (se.get("rows") or [None])[-1]}
print("[5] erp series:", json.dumps(res["erp_series"], ensure_ascii=False)[:300])

# ---------- 6. flow_state 是否含最高价 ----------
fs = json.load(open(os.path.join(DATA, "flow_state.json"), encoding="utf-8"))
c0 = (fs.get("C") or [[]])[0]
res["flow_state"] = {"dates": len(fs.get("dates") or []),
                     "symbols": len(fs.get("symbols") or []),
                     "C0_len": len(c0), "C0_head": c0[:5],
                     "keys": list(fs.keys())}
print("[6] flow_state:", json.dumps(res["flow_state"], ensure_ascii=False)[:300])

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved:", OUT, os.path.getsize(OUT), "B")
