"""第二轮定向探测：突破东财 kline 域名、验证同花顺历史涨停池、行业 PE 历史全量、外盘历史。"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "_probe_history2_raw.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
UT = "fa5fd1943c7b386f172d6893dbfba10b"
F2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"


def get(url, referer="https://quote.eastmoney.com/", timeout=20):
    r = subprocess.run(
        ["curl", "-s", "--http1.1", "-L", "--max-time", str(timeout),
         "-A", UA, "-e", referer, url],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    return (r.stdout or "").strip()


def ksummary(raw):
    try:
        d = (json.loads(raw) or {}).get("data") or {}
    except Exception:
        return {"raw": (raw or "")[:150]}
    kl = d.get("klines") or []
    return {"name": d.get("name"), "n": len(kl),
            "first": kl[0] if kl else None, "last": kl[-1] if kl else None}


res = {}

# ---------- A. 东财 kline：多域名 / ut / 参数组合 ----------
print("[A] 东财 K 线域名突破")
hosts = ["https://push2his.eastmoney.com", "http://push2his.eastmoney.com",
         "https://push2.eastmoney.com", "https://33.push2his.eastmoney.com",
         "https://62.push2his.eastmoney.com", "https://push2his.azurewebsites.net"]
base = ("/api/qt/stock/kline/get?secid=1.510300&ut=%s"
        "&fields1=f1,f2,f3,f4,f5,f6&fields2=%s"
        "&klt=101&fqt=1&beg=0&end=20500101&lmt=1000" % (UT, F2))
for i, h in enumerate(hosts):
    raw = get(h + base, timeout=12)
    res["kline_host_%d" % i] = {"host": h, **ksummary(raw), "raw": raw[:120]}
    print(" ", h, json.dumps(res["kline_host_%d" % i], ensure_ascii=False)[:230])
# 腾讯 ETF 日线（备用源）
raw = get("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh510300,day,2024-01-01,2026-11-13,1000,qfq",
          "https://gu.qq.com/")
res["qq_etf_kline"] = {"raw": raw[:300], "len": len(raw)}
print("  QQ ETF:", res["qq_etf_kline"]["raw"][:200])
# 腾讯 ETF 是否给成交额/换手（原始日线）
raw = get("https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=sh510300,day,2024-01-01,2026-11-13,1000",
          "https://gu.qq.com/")
res["qq_etf_kline_raw"] = {"raw": raw[:300], "len": len(raw)}
print("  QQ ETF raw:", res["qq_etf_kline_raw"]["raw"][:200])

# ---------- B. 同花顺涨停池：date 是否真的生效 ----------
print("[B] 同花顺涨停/炸板/连板历史")
THS = "https://data.10jqka.com.cn/dataapi/limit_up/"
FIELD = ("199112,10,9001,330323,330324,330325,9002,330329,133971,133970,"
         "1968584,3475914,9003,9004")
for d in ("20261111", "20261112", "20261113"):
    u = (THS + "limit_up_pool?page=1&limit=5&field=%s&filter=HS,GEM2STAR"
         "&order_field=330324&order_type=0&date=%s" % (FIELD, d))
    raw = get(u, "https://data.10jqka.com.cn/datacenterph/limitup/limtupInfo.html")
    try:
        j = json.loads(raw)
        dd = (j.get("data") or {})
        page = dd.get("page") or {}
        info = dd.get("info") or []
        res["ths_zt_" + d] = {"total": page.get("total"), "count": page.get("count"),
                              "first": info[0] if info else None,
                              "raw": raw[:200]}
    except Exception:
        res["ths_zt_" + d] = {"raw": raw[:200]}
    print("  zt", d, json.dumps(res["ths_zt_" + d], ensure_ascii=False)[:300])
for name, path in (("zb", "open_limit_up_pool"), ("lb", "continuous_limit_up"),
                   ("dt", "limit_down_pool")):
    u = (THS + "%s?page=1&limit=5&field=%s&filter=HS,GEM2STAR"
         "&order_field=330324&order_type=0&date=20261112" % (path, FIELD))
    raw = get(u, "https://data.10jqka.com.cn/")
    res["ths_" + name] = {"raw": raw[:320]}
    print("  ", name, res["ths_" + name]["raw"][:220])

# ---------- C. 东财行业 PE 历史报表 ----------
print("[C] 行业 PE 历史全量")
DC = "https://datacenter-web.eastmoney.com/api/data/v1/get?"
u = (DC + "reportName=RPT_VALUEINDUSTRY_DET&columns=ALL&pageNumber=1&pageSize=500"
     "&sortColumns=TRADE_DATE&sortTypes=-1")
raw = get(u, "https://data.eastmoney.com/")
try:
    j = json.loads(raw)
    rr = j.get("result") or {}
    arr = rr.get("data") or []
    dates = sorted(set((x.get("TRADE_DATE") or "")[:10] for x in arr))
    res["industry_pe_all"] = {"success": j.get("success"), "pages": rr.get("pages"),
                              "n": len(arr), "dates": dates[:5], "datesLast": dates[-5:],
                              "sample": arr[0] if arr else None,
                              "keys": list(arr[0].keys()) if arr else []}
except Exception:
    res["industry_pe_all"] = {"raw": raw[:300]}
print("  ", json.dumps(res["industry_pe_all"], ensure_ascii=False)[:520])
# 早期日期是否可得
u2 = (DC + "reportName=RPT_VALUEINDUSTRY_DET&columns=ALL&pageNumber=1&pageSize=5"
      "&filter=(TRADE_DATE%3D%272024-05-20%27)")
raw2 = get(u2, "https://data.eastmoney.com/")
res["industry_pe_2024"] = {"raw": raw2[:400]}
print("  2024:", res["industry_pe_2024"]["raw"][:240])

# ---------- D. 外盘历史（腾讯 / 新浪 / 东财 datacenter） ----------
print("[D] 外盘历史")
QQ = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param="
for k, code in (("HSI", "hkHSI"), ("NDX", "usNDX"), ("SPX", "usSPX"),
                ("DJI", "usDJI"), ("UDI", "usUDI")):
    raw = get(QQ + "%s,day,2025-01-01,2026-11-13,600,qfq" % code, "https://gu.qq.com/")
    res["qq_cross_" + k] = {"raw": raw[:260], "len": len(raw)}
    print("  ", k, res["qq_cross_" + k]["raw"][:180])
# 新浪外盘日线
raw = get("https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_=/US_MinKService.getDailyK?"
          "symbol=NDX&___qn=3", "https://finance.sina.com.cn/")
res["sina_us_kline"] = {"raw": raw[:260]}
print("  sina us:", res["sina_us_kline"]["raw"][:180])
# 汇率历史：东财 datacenter 报表
raw = get(DC + "reportName=RPT_EXCHANGERATE_DAILY&columns=ALL&pageNumber=1&pageSize=5",
          "https://data.eastmoney.com/")
res["em_fx_report"] = {"raw": raw[:260]}
print("  em fx report:", res["em_fx_report"]["raw"][:180])

# ---------- E. erp.json 结构 ----------
try:
    erp = json.load(open(os.path.join(DATA, "erp.json"), encoding="utf-8"))
    res["erp_keys"] = list(erp.keys())
    for k, v in erp.items():
        if isinstance(v, list):
            res["erp_keys"] = res["erp_keys"] + ["%s:list:%d" % (k, len(v))]
        elif isinstance(v, dict):
            res["erp_keys"] = res["erp_keys"] + ["%s:dict:%s" % (k, list(v.keys())[:8])]
except Exception as e:
    res["erp_keys"] = ["ERR " + str(e)]
print("  erp keys:", json.dumps(res["erp_keys"], ensure_ascii=False)[:520])

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved:", OUT, os.path.getsize(OUT), "B")
