"""第四轮：TMT 板块历史成交额 / 美股指数历史 / ETF 份额历史 / 汇率历史 / 同花顺回溯范围。"""
import json
import os
from fetch_extras import curl

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "_probe_history4_raw.json")
res = {}


def brief(raw, n=200):
    return (raw or "")[:n].replace("\n", " ")


# ---------- 1. 同花顺涨停池 / 连板池回溯范围 ----------
print("[1] 同花顺历史回溯范围")
THS = "https://data.10jqka.com.cn/dataapi/limit_up/"
F = ("199112,10,9001,330323,330324,330325,9002,330329,133971,133970,"
     "1968584,3475914,9003,9004")
for d in ("20250102", "20250603", "20260105", "20261111", "20261112", "20261113"):
    u = (THS + "limit_up_pool?page=1&limit=1&field=%s&filter=HS,GEM2STAR"
         "&order_field=330324&order_type=0&date=%s" % (F, d))
    raw = curl(u, "https://data.10jqka.com.cn/", retries=1)
    try:
        j = json.loads(raw)
        res["zt_" + d] = ((j.get("data") or {}).get("page") or {}).get("total")
    except Exception:
        res["zt_" + d] = brief(raw, 100)
    print("  zt %s -> %s" % (d, res["zt_" + d]))
for d in ("20250603", "20261112"):
    u = (THS + "continuous_limit_up?page=1&limit=1&field=%s&filter=HS,GEM2STAR"
         "&order_field=330324&order_type=0&date=%s" % (F, d))
    raw = curl(u, "https://data.10jqka.com.cn/", retries=1)
    res["lb_" + d] = brief(raw, 260)
    print("  lb %s -> %s" % (d, res["lb_" + d][:160]))
# 更多池路径
for p in ("failed_limit_up", "open_limit_up_info", "limit_up_broken", "ztb",
          "limit_up_channel", "limit_up_reason", "limit_down_info", "dtpool"):
    raw = curl(THS + "%s?page=1&limit=1&date=20261112" % p,
               "https://data.10jqka.com.cn/", retries=1)
    res["path_" + p] = brief(raw, 120)
    print("  path %-20s %s" % (p, res["path_" + p][:100]))

# ---------- 2. TMT 板块历史成交额 ----------
print("[2] TMT 板块历史成交额")
DC = "https://datacenter-web.eastmoney.com/api/data/v1/get?"
for rn in ("RPT_BOARD_DAILY", "RPT_INDUSTRY_TRADE_DAILY", "RPT_BOARD_TRADE",
           "RPT_INDUSTRY_AMOUNT", "RPT_BOARD_HISTORY"):
    raw = curl(DC + "reportName=%s&columns=ALL&pageNumber=1&pageSize=3" % rn,
               "https://data.eastmoney.com/", retries=1)
    res["rpt_" + rn] = brief(raw, 180)
    print("  %-26s %s" % (rn, res["rpt_" + rn][:130]))
# 同花顺板块日线（含成交额？）
for code in ("881121", "48_881121", "bk1036"):
    raw = curl("https://d.10jqka.com.cn/v6/line/%s/01/last.js" % code,
               "https://q.10jqka.com.cn/", retries=1)
    res["ths_board_" + code] = brief(raw, 240)
    print("  ths board %-12s %s" % (code, res["ths_board_" + code][:160]))
# 东财 push2his 带 cb 回调
raw = curl("https://push2his.eastmoney.com/api/qt/stock/kline/get?"
           "cb=jQuery183&secid=90.BK1036&ut=fa5fd1943c7b386f172d6893dbfba10b"
           "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
           "&klt=101&fqt=1&beg=0&end=20500101&lmt=1000", retries=1)
res["em_board_cb"] = brief(raw, 220)
print("  em board cb:", res["em_board_cb"][:160])
# 腾讯板块 K 线
for code in ("bk1036", "BK1036", "sz399997"):
    raw = curl("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
               "param=%s,day,2025-01-01,2026-12-31,600,qfq" % code, retries=1)
    res["qq_board_" + code] = brief(raw, 200)
    print("  qq board %-10s %s" % (code, res["qq_board_" + code][:130]))

# ---------- 3. 美股 / 外盘指数历史 ----------
print("[3] 美股指数历史")
QQ = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=%s,day,2025-01-01,2026-12-31,600,qfq"
for code in ("usDJI", "usIXIC", "usINX", "usNDX", "usSPX", "us.DJI", "usAAPL",
             "hkHSI", "hkHSCEI"):
    raw = curl(QQ % code, retries=1)
    try:
        d = json.loads(raw)
        node = (d.get("data") or {}).get(code) or {}
        arr = node.get("day") or node.get("qfqday") or []
        res["qq_" + code] = {"n": len(arr), "last": arr[-1] if arr else None}
    except Exception:
        res["qq_" + code] = {"raw": brief(raw, 100)}
    print("  %-10s %s" % (code, json.dumps(res["qq_" + code], ensure_ascii=False)[:150]))
# 新浪美股本
for sym in (".IXIC", ".DJI", ".INX", "NDX"):
    raw = curl("https://stock.finance.sina.com.cn/usstock/api/jsonp.php/var%20_=/"
               "US_MinKService.getDailyK?symbol=%s&___qn=3" % sym,
               "https://finance.sina.com.cn/", retries=1)
    res["sina_us_" + sym] = brief(raw, 180)
    print("  sina %-8s %s" % (sym, res["sina_us_" + sym][:120]))

# ---------- 4. ETF 份额历史 ----------
print("[4] ETF 份额历史")
for rn in ("RPT_FUND_ETF_SHARE", "RPT_FUND_ETFLIST", "RPT_FUND_SHARE_CHANGE",
           "RPT_ETF_DAILY_SHARE", "RPT_FUND_ETF_DAILY"):
    raw = curl(DC + "reportName=%s&columns=ALL&pageNumber=1&pageSize=3" % rn,
               "https://data.eastmoney.com/", retries=1)
    res["etf_rpt_" + rn] = brief(raw, 180)
    print("  %-26s %s" % (rn, res["etf_rpt_" + rn][:120]))
# 腾讯 ETF qt 是否含换手率/份额
raw = curl("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
           "param=sh510300,day,2026-11-10,2026-11-13,10,qfq", retries=1)
res["qq_etf_qt"] = brief(raw, 600)
print("  qq etf qt:", res["qq_etf_qt"][:300])

# ---------- 5. 汇率历史 ----------
print("[5] 汇率历史")
for rn in ("RPT_EXCHANGE_RATE", "RPT_FOREX_DAILY", "RPT_RMB_EXCHANGE",
           "RPT_CURRENCY_DAILY"):
    raw = curl(DC + "reportName=%s&columns=ALL&pageNumber=1&pageSize=3" % rn,
               "https://data.eastmoney.com/", retries=1)
    res["fx_rpt_" + rn] = brief(raw, 160)
    print("  %-22s %s" % (rn, res["fx_rpt_" + rn][:110]))
for sym in ("fx_susdcny", "USDCNY", "usUSDCNY"):
    raw = curl("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?"
               "param=%s,day,2025-01-01,2026-12-31,600,qfq" % sym, retries=1)
    res["qq_fx_" + sym] = brief(raw, 180)
    print("  qq fx %-10s %s" % (sym, res["qq_fx_" + sym][:110]))

json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("saved:", OUT, os.path.getsize(OUT), "B")
