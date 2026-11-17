#!/usr/bin/env python
"""第四轮：乐咕 PE 全量结构、东财板块行情路径变体、新浪行业节点体系。"""
import datetime
import hashlib
import http.cookiejar
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def fetch(url, headers=None, timeout=20, limit=None):
    h = {"User-Agent": UA, "Referer": "https://legulegu.com/",
         "Accept": "application/json,text/plain,*/*"}
    if headers:
        h.update(headers)
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
        return r.status, r.read(limit) if limit else r.read()


print("=== 乐咕乐股 沪深300 PE 全量结构 ===")
try:
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    base = "https://legulegu.com/stockdata/sz50-ttm-lyr"
    h = {"User-Agent": UA, "Referer": base}
    page = op.open(urllib.request.Request(base, headers=h), timeout=20).read().decode("utf-8", "ignore")
    m = re.search(r'name=["\']_csrf["\'][^>]*content=["\']([^"\']+)', page)
    csrf = m.group(1) if m else ""
    h.update({"X-CSRF-Token": csrf, "X-Requested-With": "XMLHttpRequest"})
    token = hashlib.md5(datetime.date.today().isoformat().encode()).hexdigest()
    url = "https://legulegu.com/api/stockdata/index-basic-pe?token=%s&indexCode=000300.SH" % token
    raw = op.open(urllib.request.Request(url, headers=h), timeout=30).read()
    d = json.loads(raw)
    rows = d.get("data") or []
    print("HTTP OK | bytes", len(raw), "| rows", len(rows))
    print("first:", json.dumps(rows[0], ensure_ascii=False) if rows else "-")
    print("last :", json.dumps(rows[-1], ensure_ascii=False) if rows else "-")
    print("间隔样例:", [r["date"] for r in rows[-8:]])
    with open("data/_probe_pe.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False)
    print("已暂存 data/_probe_pe.json")
except Exception as e:
    print("ERR", str(e)[:200])

C = [
    ("EM-板块单只get", "https://push2.eastmoney.com/api/qt/stock/get?secid=90.BK0447&fltt=2&fields=f43,f57,f58,f47,f48,f60"),
    ("EM-板块批量", "https://push2.eastmoney.com/api/qt/ulist.np/get?secids=90.BK0447,90.BK0736,90.BK0448,90.BK0486&fltt=2&fields=f12,f14,f6,f3"),
    ("EM-K线主域", "https://push2.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2&fields2=f51,f53,f57&klt=101&fqt=1&lmt=10"),
    ("EM-K线delay", "https://push2delay.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2&fields2=f51,f53,f57&klt=101&fqt=1&lmt=10"),
    ("EM-K线61", "https://61.push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2&fields2=f51,f53,f57&klt=101&fqt=1&lmt=10"),
    ("EM-板块列表datacenter", "https://datacenter.eastmoney.com/api/data/get?type=RPTA_WEB_BK&sty=ALL&p=1&ps=5"),
    ("新浪-hangye节点数", "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hangye_ZA01"),
    ("新浪-hangye成分", "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=3&sort=symbol&asc=1&node=hangye_ZA01"),
    ("新浪-申万节点", "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=sw2_801080"),
    ("新浪-概念分类文件", "https://vip.stock.finance.sina.com.cn/q/view/newFLJK.php?param=class"),
]


def probe(item):
    name, url = item
    try:
        st, raw = fetch(url, timeout=14, limit=900)
        return name, st, len(raw), raw.decode("utf-8", "replace").replace("\n", " ")[:220]
    except Exception as e:
        return name, "ERR", 0, str(e)[:120]


print("\n=== 东财板块 / 新浪节点体系 ===")
with ThreadPoolExecutor(max_workers=5) as ex:
    for name, st, size, body in ex.map(probe, C):
        print("%-24s %-5s %-6s %s" % (name, st, size, body))
