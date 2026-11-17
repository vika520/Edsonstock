"""探测第 02 栏各周期能否拿到 3 年以上历史。

目标：确认日线/周线/60分/30分/15分各自真实可交付的覆盖区间，
不假设、不编造；分钟线若拿不到 3 年，页面上必须显著标注。
"""
import json
import time
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def get(url, ref="https://finance.sina.com.cn/", timeout=18):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref})
        return urllib.request.urlopen(req, timeout=timeout).read()
    except Exception as e:
        return ("ERR", str(e)[:120])


def brief(v, n=1):
    if isinstance(v, tuple):
        return v[1]
    return v[:n]


print("=== 新浪 CN_MarketData.getKLineData：datalen 上限 ===")
for scale in (240, 1200, 60, 30, 15):
    for dl in (320, 1000, 3000):
        u = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
             "CN_MarketData.getKLineData?symbol=sh000001&scale=%d&datalen=%d" % (scale, dl))
        b = get(u)
        if isinstance(b, tuple):
            print("  scale=%-4d datalen=%-4d ERR %s" % (scale, dl, b[1]))
            continue
        try:
            rows = json.loads(b.decode("utf-8", "ignore"))
        except Exception as e:
            print("  scale=%-4d datalen=%-4d JSONERR %s" % (scale, dl, str(e)[:60]))
            continue
        if isinstance(rows, list) and rows:
            print("  scale=%-4d datalen=%-4d -> %4d 根  %s ~ %s"
                  % (scale, dl, len(rows), rows[0].get("day"), rows[-1].get("day")))
        else:
            print("  scale=%-4d datalen=%-4d -> %s" % (scale, dl, brief(rows)))
        time.sleep(0.15)

print("\n=== 腾讯 fqkline 日线 / 周线长历史 ===")
for period, start in (("day", "2020-01-01"), ("week", "2015-01-01"), ("month", "2010-01-01")):
    u = ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
         "?param=sh000001,%s,%s,2026-11-14,2000,qfq" % (period, start))
    b = get(u, "https://gu.qq.com/")
    if isinstance(b, tuple):
        print("  %-6s ERR %s" % (period, b[1]))
        continue
    try:
        doc = json.loads(b.decode("utf-8", "ignore"))
        x = (doc.get("data") or {}).get("sh000001") or {}
        rows = x.get(period) or x.get("qfq" + period) or []
        print("  %-6s keys=%s -> %d 根 %s ~ %s"
              % (period, list(x.keys())[:6], len(rows),
                 rows[0][0] if rows else "-", rows[-1][0] if rows else "-"))
    except Exception as e:
        print("  %-6s PARSEERR %s" % (period, str(e)[:80]))

print("\n=== 腾讯 mkline 分钟线长历史 ===")
for host in ("web.ifzq.gtimg.cn", "ifzq.gtimg.cn"):
    for p in ("sh000001,m30,,320", "sh000001,m30,,1000",
              "sh000001,m30,2023-01-01,2026-11-14,1000",
              "sh000001,m60,,1000", "sh000001,m15,,1000"):
        u = "https://%s/appstock/app/kline/mkline?param=%s" % (host, p)
        b = get(u, "https://gu.qq.com/", timeout=12)
        if isinstance(b, tuple):
            print("  %-20s %-46s ERR %s" % (host, p, b[1]))
            continue
        try:
            doc = json.loads(b.decode("utf-8", "ignore"))
            x = (doc.get("data") or {}).get("sh000001") or {}
            keys = list(x.keys())
            arr = None
            for k in keys:
                if isinstance(x[k], list) and x[k] and isinstance(x[k][0], list):
                    arr = x[k]
                    break
            n = len(arr) if arr else 0
            print("  %-20s %-46s keys=%s -> %d 根 %s ~ %s"
                  % (host, p, keys[:5], n,
                     arr[0][0] if arr else "-", arr[-1][0] if arr else "-"))
        except Exception as e:
            print("  %-20s %-46s PARSEERR %s" % (host, p, str(e)[:60]))
        time.sleep(0.1)
