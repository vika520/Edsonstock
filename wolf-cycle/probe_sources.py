"""探测 4 个新栏目所需的公开数据源可用性。"""
import json
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def get(url, ref="https://gu.qq.com/", timeout=12):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", "ignore")[:420]
    except Exception as e:
        return "ERR " + repr(e)[:130]


TESTS = [
    ("腾讯 ETF 日线 sh510300", "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh510300,day,,,20,qfq"),
    ("腾讯 ETF 实时 sh510300", "https://qt.gtimg.cn/q=sh510300"),
    ("腾讯 板块指数 sh880564", "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh880564,day,,,10,qfq"),
    ("腾讯 板块排行 getRank", "https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hs&sort_type=price&direct=down&offset=0&count=10"),
    ("腾讯 板块列表 getBoardRankList", "https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList?board_type=hy&sort_type=zdf&direct=down&offset=0&count=10"),
    ("腾讯 概念板块 rank", "https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=gn&sort_type=zdf&direct=down&offset=0&count=10"),
    ("新浪 行业板块", "https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php", "https://finance.sina.com.cn"),
    ("新浪 概念板块", "https://money.finance.sina.com.cn/q/view/newFLJK.php?param=class", "https://finance.sina.com.cn"),
    ("东财 板块 clist", "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=10&po=1&fid=f3&fs=m:90+t:2&fields=f12,f14,f3,f6", "https://quote.eastmoney.com/"),
    ("东财 datacenter", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_ETF_LIST&columns=ALL&pageSize=3", "https://data.eastmoney.com/"),
    ("同花顺 板块", "https://q.10jqka.com.cn/thshy/", "https://q.10jqka.com.cn/"),
]

for t in TESTS:
    label, url = t[0], t[1]
    ref = t[2] if len(t) > 2 else "https://gu.qq.com/"
    body = get(url, ref)
    print(f"\n=== {label} ===\n{body[:300]}")
