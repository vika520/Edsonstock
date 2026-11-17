"""一次性探测：5 类「逐日累积」指标到底能不能回补历史。

输出 data/_probe_history_raw.json（被 .gitignore 排除），只探测、不改正式数据。
所有请求走 curl 子进程（本机 Python urllib 会被代理断连）。
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "_probe_history_raw.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
P = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
Q = "https://push2.eastmoney.com/api/qt"
F2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"


def get(url, referer="https://quote.eastmoney.com/", timeout=20):
    r = subprocess.run(
        ["curl", "-s", "--http1.1", "-L", "--max-time", str(timeout),
         "-A", UA, "-e", referer, url],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    return (r.stdout or "").strip()


def kline(secid, beg="20240101", end="20261113"):
    u = ("%s?secid=%s&klt=101&fqt=0&beg=%s&end=%s"
         "&fields1=f1,f2,f3,f4,f5,f6&fields2=%s" % (P, secid, beg, end, F2))
    return get(u)


def parse_kl(raw):
    try:
        d = json.loads(raw).get("data") or {}
    except Exception:
        return {"err": (raw or "")[:160]}
    kl = d.get("klines") or []
    return {"name": d.get("name"), "code": d.get("code"),
            "n": len(kl), "first": kl[0] if kl else None,
            "last": kl[-1] if kl else None,
            "sample3": kl[-3:] if kl else []}


res = {}

# ---------- A. ETF 日度份额：换手率反推（kline 含成交量 f56 + 换手率 f61） ----------
print("[A] ETF 历史 K 线 / 换手率")
res["etf_kline_510300"] = parse_kl(kline("1.510300"))
res["etf_kline_159915"] = parse_kl(kline("0.159915"))
res["etf_kline_588000"] = parse_kl(kline("1.588000"))
for k in ("etf_kline_510300", "etf_kline_159915", "etf_kline_588000"):
    print(" ", k, json.dumps(res[k], ensure_ascii=False)[:420])
# 当日 f116 总市值，用来和换手率反推份额交叉校验
res["etf_f116_today"] = get(Q + "/stock/get?secid=1.510300&fields=f57,f58,f43,f116,f117,f168,f170")
print("  f116 today:", res["etf_f116_today"][:260])

# ---------- B. TMT 板块历史成交额 ----------
print("[B] 行业板块历史 K 线成交额")
for code in ("BK1036", "BK0448", "BK0737", "BK0486"):
    res["board_" + code] = parse_kl(kline("90." + code, "20250101"))
    print(" ", code, json.dumps(res["board_" + code], ensure_ascii=False)[:320])

# ---------- C. 涨停 / 跌停 / 炸板池历史 ----------
print("[C] 涨跌停池历史 date 参数")
UT = "7eea3edcaed734bea9cbfc24409ed989"
c_urls = {
    "em_zt_1112": ("https://push2ex.eastmoney.com/getTopicZTPool?ut=%s&dpt=wz.ztzt"
                   "&Pageindex=0&pagesize=10&sort=fbt%%3Aasc&date=20261112" % UT),
    "em_zt_1112_dash": ("https://push2ex.eastmoney.com/getTopicZTPool?ut=%s&dpt=wz.ztzt"
                        "&Pageindex=0&pagesize=10&sort=fbt%%3Aasc&date=2026-11-12" % UT),
    "em_zb_1112": ("https://push2ex.eastmoney.com/getTopicZBPool?ut=%s&dpt=wz.ztzt"
                   "&Pageindex=0&pagesize=10&sort=fbt%%3Aasc&date=20261112" % UT),
    "em_dt_1112": ("https://push2ex.eastmoney.com/getTopicDTPool?ut=%s&dpt=wz.ztzt"
                   "&Pageindex=0&pagesize=10&sort=fund%%3Aasc&date=20261112" % UT),
    "ths_zt_1112": ("https://data.10jqka.com.cn/dataapi/limit_up/limit_up_pool?page=1&limit=10"
                    "&field=199112,10,9001,330323,330324,330325,9002,330329,133971,133970,1968584,3475914,9003,9004"
                    "&filter=HS,GEM2STAR&order_field=330324&order_type=0&date=20261112"),
}
for k, u in c_urls.items():
    raw = get(u, "https://quote.eastmoney.com/ztb/detail" if k.startswith("em_") else "https://data.10jqka.com.cn/")
    try:
        d = json.loads(raw)
        info = {"ok": True}
        dd = d.get("data") or {}
        if isinstance(dd, dict):
            info.update({"qdate": dd.get("qdate"), "tc": dd.get("tc"),
                         "pool_n": len(dd.get("pool") or [])})
        elif isinstance(dd, list):
            info.update({"list_n": len(dd)})
        info["raw"] = raw[:220]
    except Exception:
        info = {"ok": False, "raw": raw[:220]}
    res[k] = info
    print(" ", k, json.dumps(info, ensure_ascii=False)[:300])

# ---------- D. 行业 PE 历史横截面 ----------
print("[D] 行业 PE 历史")
d_urls = {
    "em_industry_pe_hist": ("https://datacenter-web.eastmoney.com/api/data/v1/get?"
                            "reportName=RPT_VALUEINDUSTRY_DET&columns=ALL&pageNumber=1&pageSize=5"
                            "&filter=(TRADE_DATE%3D%272026-11-12%27)"),
    "em_industry_pe_hist2": ("https://datacenter-web.eastmoney.com/api/data/v1/get?"
                             "reportName=RPT_INDUSTRY_PE&columns=ALL&pageNumber=1&pageSize=5"),
    "legulegu_industry_pe": "https://legulegu.com/api/stock-data/industry-pe-list",
}
for k, u in d_urls.items():
    raw = get(u, "https://data.eastmoney.com/")
    res[k] = {"raw": raw[:420], "len": len(raw)}
    print(" ", k, res[k]["raw"][:220])

# ---------- E. 外盘 / 汇率 / 中债历史 ----------
print("[E] 跨市场历史")
for k, secid in (("HSI", "100.HSI"), ("NDX", "100.NDX"), ("SPX", "100.SPX"),
                 ("UDI", "100.UDI"), ("GC", "101.GC00Y"),
                 ("USDCNYC", "133.USDCNYC")):
    res["cross_" + k] = parse_kl(kline(secid, "20250101"))
    print(" ", k, json.dumps(res["cross_" + k], ensure_ascii=False)[:260])
res["sina_fx_day"] = get(
    "https://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/var%20_fx_susdcny=/NewService.getDayKLine?symbol=fx_susdcny",
    "https://finance.sina.com.cn/")
print("  sina fx:", res["sina_fx_day"][:260])

# 中债 10Y 历史已在 erp.json，确认可用长度
try:
    erp = json.load(open(os.path.join(DATA, "erp.json"), encoding="utf-8"))
    rows = erp.get("series") or erp.get("rows") or []
    res["erp_series"] = {"keys": list(erp.keys()), "n": len(rows),
                         "last": rows[-1] if rows else None}
except Exception as e:
    res["erp_series"] = {"err": str(e)}
print("  erp series:", json.dumps(res["erp_series"], ensure_ascii=False)[:260])

# 逐股缓存结构（判断能否自算涨停/炸板）
try:
    fs = json.load(open(os.path.join(DATA, "flow_state.json"), encoding="utf-8"))
    res["flow_state"] = {
        "dates": len(fs.get("dates") or []),
        "symbols": len(fs.get("symbols") or []),
        "C_type": type(fs.get("C")).__name__,
        "V_type": type(fs.get("V")).__name__,
        "C_len": len(fs.get("C") or {}),
        "V_len": len(fs.get("V") or {}),
        "firstDate": (fs.get("dates") or [None])[0],
        "lastDate": (fs.get("dates") or [None])[-1],
        "C_sample": json.dumps(fs.get("C"), ensure_ascii=False)[:220],
        "V_sample": json.dumps(fs.get("V"), ensure_ascii=False)[:220],
        "rawLast_sample": json.dumps(fs.get("rawLast"), ensure_ascii=False)[:220],
    }
except Exception as e:
    res["flow_state"] = {"err": str(e)}
print("  flow_state:", json.dumps(res["flow_state"], ensure_ascii=False)[:420])

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved:", OUT, os.path.getsize(OUT), "B")
