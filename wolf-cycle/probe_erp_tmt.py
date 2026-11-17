#!/usr/bin/env python
"""探测 ERP 栏目（沪深300 PE-TTM / 中债10Y）与 TMT 成交占比所需数据源。

纯标准库；并发请求，输出 HTTP 状态与内容摘要，不落盘。
"""
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

CANDIDATES = [
    # ---- TMT 行业板块：实时列表 + 历史 K 线（含成交额 f57） ----
    ("TMT-实时-主域", "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m%3A90%2Bt%3A2&fields=f12%2Cf14%2Cf6"),
    ("TMT-实时-分片82", "https://82.push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m%3A90%2Bt%3A2&fields=f12%2Cf14%2Cf6"),
    ("TMT-实时-分片28", "https://28.push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m%3A90%2Bt%3A2&fields=f12%2Cf14%2Cf6"),
    ("TMT-实时-http", "http://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m%3A90%2Bt%3A2&fields=f12%2Cf14%2Cf6"),
    ("TMT-历史-主域", "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&beg=20240101&end=20500101&lmt=10"),
    ("TMT-历史-分片", "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&beg=20240101&end=20500101&lmt=10&ut=fa5fd1943c7b386f172d6893dbfba10b"),
    ("TMT-历史-备用域", "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2&fields2=f51,f53,f57&klt=101&fqt=1&lmt=10"),
    ("TMT-历史-63域", "https://63.push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0447&fields1=f1,f2&fields2=f51,f53,f57&klt=101&fqt=1&lmt=10"),

    # ---- 中债 10 年期国债收益率 ----
    ("CN10Y-东财中美收益率A", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BOND_US_CN_YIELD&columns=ALL&pageNumber=1&pageSize=5&sortColumns=TRADE_DATE&sortTypes=-1"),
    ("CN10Y-东财中美收益率B", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BOND_CNY_YIELD&columns=ALL&pageNumber=1&pageSize=5"),
    ("CN10Y-东财国债收益率", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BOND_ZGYJSYL&columns=ALL&pageNumber=1&pageSize=5"),
    ("CN10Y-中国货币网", "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-yld-curve/BondMarketYieldCurve?lang=CN"),
    ("CN10Y-东财push2", "https://push2.eastmoney.com/api/qt/stock/get?secid=100.CN10Y&fields=f43,f57,f58"),
    ("CN10Y-新浪债券", "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh019547&scale=240&datalen=10"),

    # ---- 沪深300 PE-TTM ----
    ("PE-中证官网指标", "https://www.csindex.com.cn/csindex-home/indexInfo/index-derived?indexCode=000300"),
    ("PE-中证估值文件", "https://www.csindex.com.cn/uploads/file/autofile/indicator/000300indicator.xls"),
    ("PE-东财指数估值", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEINDEX_DET&columns=ALL&pageNumber=1&pageSize=5&filter=(INDEX_CODE%3D%22000300%22)"),
    ("PE-东财指数PE", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_VALUEINDEX_HIS&columns=ALL&pageNumber=1&pageSize=5"),
    ("PE-乐咕首页", "https://legulegu.com/stockdata/index-basic-pe/000300"),
    ("PE-东财股票-get", "https://push2.eastmoney.com/api/qt/stock/get?secid=1.000300&fields=f43,f57,f58,f162,f167,f116,f117"),
]


def probe(item):
    name, url = item
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Referer": "https://data.eastmoney.com/",
            "Accept": "application/json,text/plain,*/*",
        })
        with urllib.request.urlopen(req, timeout=14) as r:
            raw = r.read(1200)
            txt = raw.decode("utf-8", "replace")
            return name, r.status, len(raw), txt.replace("\n", " ")[:230]
    except Exception as e:
        return name, "ERR", 0, str(e)[:150]


with ThreadPoolExecutor(max_workers=8) as ex:
    for name, status, size, body in ex.map(probe, CANDIDATES):
        print("%-24s %-5s %-6s %s" % (name, status, size, body))
