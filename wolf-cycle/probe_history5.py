"""第五轮：回溯起点、美股带点代码、同花顺板块 K 线结构、ETF 份额/汇率历史。"""
import json
import os
from fetch_extras import curl

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "_probe_history5_raw.json")
res = {}


def brief(raw, n=200):
    return (raw or "")[:n].replace("\n", " ")


# ---------- 1. 同花顺涨停池 / 连板池回溯起点 ----------
print("[1] 同花顺回溯起点")
THS = "https://data.10jqka.com.cn/dataapi/limit_up/"
F = ("199112,10,9001,330323,330324,330325,9002,330329,133971,133970,"
     "1968584,3475914,9003,9004")
for d in ("20251103", "20251201", "20260105", "20260202", "20260302",
          "20260401", "20260601", "20260803", "20261009"):
    u = (THS + "limit_up_pool?page=1&limit=1&field=" + F +
         "&filter=HS,GEM2STAR&order_field=330324&order_type=0&date=" + d)
    raw = curl(u, "https://data.10jqka.com.cn/", retries=1)
    try:
        res["zt_" + d] = ((json.loads(raw).get("data") or {}).get("page") or {}).get("total")
    except Exception:
        res["zt_" + d] = brief(raw, 80)
    print("  zt %s -> %s" % (d, res["zt_" + d]))
for d in ("20251103", "20260105", "20260601", "20261112"):
    u = (THS + "continuous_limit_up?page=1&limit=1&field=" + F +
         "&filter=HS,GEM2STAR&order_field=330324&order_type=0&date=" + d)
    raw = curl(u, "https://data.10jqka.com.cn/", retries=1)
    res["lb_" + d] = brief(raw, 150)
    print("  lb %s -> %s" % (d, res["lb_" + d][:110]))
# 涨停池字段全貌（用于算连板/晋级率）
u = (THS + "limit_up_pool?page=1&limit=3&field=" + F +
     "&filter=HS,GEM2STAR&order_field=330324&order_type=0&date=20261112")
res["zt_fields"] = brief(curl(u, "https://data.10jqka.com.cn/", retries=1), 900)
print("  zt fields:", res["zt_fields"][:420])

# ---------- 2. 美股带点代码 ----------
print("[2] 美股带点代码")
QQ = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=%s,day,2024-01-01,2026-12-31,800,qfq"
for code in ("us.DJI", "us.NDX", "us.INX", "us.SPX", "us.IXIC", "us.UDI",
             "us.GC00Y", "hkHSI"):
    raw = curl(QQ % code, retries=1)
    try:
        node = ((json.loads(raw).get("data") or {}).get(code) or {})
        arr = node.get("day") or node.get("qfqday") or []
        res["qq_" + code] = {"n": len(arr), "first": arr[0] if arr else None,
                             "last": arr[-1] if arr else None}
    except Exception:
        res["qq_" + code] = {"raw": brief(raw, 100)}
    print("  %-10s %s" % (code, json.dumps(res["qq_" + code], ensure_ascii=False)[:200]))

# ---------- 3. 同花顺板块 K 线结构（是否含成交额） ----------
print("[3] 同花顺板块 K 线")
raw = curl("https://d.10jqka.com.cn/v6/line/48_881121/01/last.js",
           "https://q.10jqka.com.cn/", retries=2)
res["ths_board_raw"] = brief(raw, 1200)
print("  ", res["ths_board_raw"][:600])
try:
    s = raw[raw.index("(") + 1: raw.rindex(")")]
    j = json.loads(s)
    res["ths_board_keys"] = list(j.keys())
    for k in ("data", "price", "volumn", "amount", "sortYear", "year"):
        if k in j:
            v = j[k]
            res["ths_board_" + k] = brief(json.dumps(v, ensure_ascii=False), 400)
    print("  keys:", res["ths_board_keys"])
except Exception as e:
    res["ths_board_keys"] = ["parse err " + str(e)]
    print("  parse err", e)

# ---------- 4. ETF 份额历史报表 ----------
print("[4] ETF 份额历史")
DC = "https://datacenter-web.eastmoney.com/api/data/v1/get?"
for rn in ("RPT_FUND_ETF_SHARE", "RPT_FUND_ETFLIST", "RPT_FUND_SHARE_CHANGE",
           "RPT_ETF_DAILY_SHARE", "RPT_FUND_ETF_DAILY", "RPT_FUND_SCALE"):
    raw = curl(DC + "reportName=" + rn + "&columns=ALL&pageNumber=1&pageSize=3",
               "https://data.eastmoney.com/", retries=1)
    res["etf_rpt_" + rn] = brief(raw, 200)
    print("  %-26s %s" % (rn, res["etf_rpt_" + rn][:130]))
# 腾讯 ETF 实时 qt 字段
raw = curl("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
           "param=sh510300,day,2026-11-10,2026-11-13,10,qfq", retries=1)
res["qq_etf_qt"] = brief(raw, 900)
print("  qq etf qt:", res["qq_etf_qt"][:360])

# ---------- 5. 汇率历史 ----------
print("[5] 汇率历史")
for rn in ("RPT_EXCHANGE_RATE", "RPT_FOREX_DAILY", "RPT_RMB_EXCHANGE",
           "RPT_CURRENCY_DAILY", "RPT_EXCHANGERATE"):
    raw = curl(DC + "reportName=" + rn + "&columns=ALL&pageNumber=1&pageSize=3",
               "https://data.eastmoney.com/", retries=1)
    res["fx_rpt_" + rn] = brief(raw, 170)
    print("  %-22s %s" % (rn, res["fx_rpt_" + rn][:110]))
for sym in ("fx_susdcny", "usUSDCNY", "usUSDCNH", "USDCNYC"):
    raw = curl("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
               "param=" + sym + ",day,2025-01-01,2026-12-31,600,qfq", retries=1)
    res["qq_fx_" + sym] = brief(raw, 170)
    print("  qq fx %-10s %s" % (sym, res["qq_fx_" + sym][:110]))

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved:", OUT, os.path.getsize(OUT), "B")
