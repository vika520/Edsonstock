#!/usr/bin/env python
"""第三轮：确认乐咕乐股 PE-TTM 鉴权方式、中债10Y 字段映射、新浪行业板块清单。"""
import datetime
import hashlib
import http.cookiejar
import json
import re
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def legu(token, index_code, use_csrf):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    base = "https://legulegu.com/stockdata/sz50-ttm-lyr"
    h = {"User-Agent": UA, "Referer": base, "Accept": "application/json,text/plain,*/*"}
    csrf = ""
    if use_csrf:
        try:
            page = op.open(urllib.request.Request(base, headers=h), timeout=15).read().decode("utf-8", "ignore")
            m = re.search(r'name=["\']_csrf["\'][^>]*content=["\']([^"\']+)', page)
            if not m:
                m = re.search(r'content=["\']([^"\']+)["\'][^>]*name=["\']_csrf["\']', page)
            csrf = m.group(1) if m else ""
            h["X-CSRF-Token"] = csrf
            h["X-Requested-With"] = "XMLHttpRequest"
        except Exception as e:
            return "page ERR " + str(e)[:80]
    url = "https://legulegu.com/api/stockdata/index-basic-pe?token=%s&indexCode=%s" % (token, index_code)
    try:
        with op.open(urllib.request.Request(url, headers=h), timeout=15) as r:
            body = r.read(600).decode("utf-8", "replace")
            return "HTTP %s csrf=%s | %s" % (r.status, csrf[:12], body[:320])
    except Exception as e:
        return "ERR csrf=%s %s" % (csrf[:12], str(e)[:120])


today = datetime.date.today().isoformat()
tokens = [("public", False), (hashlib.md5(today.encode()).hexdigest(), False),
          (hashlib.md5(today.encode()).hexdigest(), True), ("public", True)]
print("=== 乐咕乐股 PE-TTM ===")
for t, csrf in tokens:
    print("token=%-34s csrf=%-5s -> %s" % (t, csrf, legu(t, "000300.SH", csrf)))
print("--- indexCode 变体 ---")
for code in ["000300", "000300.XSHG", "000300.SH"]:
    print("%-14s -> %s" % (code, legu("public", code, True)[:220]))

print("\n=== 中债10Y 完整字段 ===")
u = ("https://datacenter.eastmoney.com/api/data/get?type=RPTA_WEB_TREASURYYIELD&sty=ALL"
     "&st=SOLAR_DATE&sr=-1&token=894050c76af8597a853f5b408b759f5d&p=1&ps=2")
try:
    req = urllib.request.Request(u, headers={"User-Agent": UA, "Referer": "https://data.eastmoney.com/"})
    d = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
    rows = d["result"]["data"]
    print("pages:", d["result"]["pages"])
    for r in rows:
        print(json.dumps(r, ensure_ascii=False))
except Exception as e:
    print("ERR", e)

print("\n=== 新浪行业板块清单（newSinaHy.php） ===")
u2 = "https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php"
try:
    req = urllib.request.Request(u2, headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"})
    s = urllib.request.urlopen(req, timeout=20).read().decode("gbk", "ignore")
    m = re.search(r"=\s*(\{.*\})", s, re.S)
    d = json.loads(m.group(1))
    names = []
    for k, v in d.items():
        f = v.split(",")
        if len(f) >= 8:
            names.append((f[0], f[1], int(float(f[7]))))
    print("行业板块数:", len(names))
    for code, name, amt in names:
        print("  %-12s %-10s %12d" % (code, name, amt))
except Exception as e:
    print("ERR", e)
