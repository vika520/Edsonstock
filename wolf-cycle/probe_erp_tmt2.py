#!/usr/bin/env python
"""第二轮：钉死中债10Y / 沪深300 PE-TTM / TMT 行业成交额的真实可用端点。"""
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
BASE = "https://datacenter.eastmoney.com/api/data/get"
TOKEN = "894050c76af8597a853f5b408b759f5d"
SINA = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"

C = [
    # 中债10Y（AKShare bond_zh_us_rate 同源）
    ("CN10Y-AKShare-https", BASE + "?type=RPTA_WEB_TREASURYYIELD&sty=ALL&st=SOLAR_DATE&sr=-1&token=" + TOKEN + "&p=1&ps=10&pageNo=1&pageNum=1"),
    ("CN10Y-AKShare-http", "http://datacenter.eastmoney.com/api/data/get?type=RPTA_WEB_TREASURYYIELD&sty=ALL&st=SOLAR_DATE&sr=-1&token=" + TOKEN + "&p=1&ps=10"),
    ("CN10Y-datacenterweb", "https://datacenter-web.eastmoney.com/api/data/get?type=RPTA_WEB_TREASURYYIELD&sty=ALL&st=SOLAR_DATE&sr=-1&token=" + TOKEN + "&p=1&ps=10"),
    ("CN10Y-东财v1报表", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_WEB_TREASURYYIELD&columns=ALL&pageNumber=1&pageSize=10"),

    # 沪深300 PE-TTM
    ("PE-legu-api1", "https://legulegu.com/api/stock-data/index-basic-pe?indexCode=000300"),
    ("PE-legu-api2", "https://legulegu.com/api/stockdata/index-basic-pe?indexCode=000300"),
    ("PE-legu-page", "https://legulegu.com/stockdata/index-basic-pe/000300"),
    ("PE-legu-market", "https://www.legulegu.com/stockdata/market_pe"),
    ("PE-legu-www", "https://www.legulegu.com/api/stock-data/index-basic-pe?indexCode=000300"),
    ("PE-东财f162", "https://push2.eastmoney.com/api/qt/stock/get?secid=1.000300&fltt=2&fields=f43,f57,f58,f162,f167,f116,f117"),
    ("PE-中证derived", "https://www.csindex.com.cn/csindex-home/indexInfo/index-derived/000300"),
    ("PE-中证basic", "https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000300"),
    ("PE-中证perf", "https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300"),
    ("PE-新浪指数页", "https://finance.sina.com.cn/realstock/company/sh000300/nc.shtml"),

    # TMT 行业：申万一级指数 / 中证行业指数
    ("SW-电子-新浪", SINA + "CN_MarketData.getKLineData?symbol=sh801080&scale=240&datalen=20"),
    ("SW-通信-新浪", SINA + "CN_MarketData.getKLineData?symbol=sh801770&scale=240&datalen=20"),
    ("SW-计算机-新浪", SINA + "CN_MarketData.getKLineData?symbol=sh801750&scale=240&datalen=20"),
    ("SW-传媒-新浪", SINA + "CN_MarketData.getKLineData?symbol=sh801760&scale=240&datalen=20"),
    ("SW-电子-腾讯", "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh801080,day,,,20,qfq"),
    ("中证TMT-新浪", SINA + "CN_MarketData.getKLineData?symbol=sh000998&scale=240&datalen=20"),

    # 新浪行业板块节点（含成分股）
    ("新浪-行业节点列表", "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hangye_ZI01"),
    ("新浪-板块成分", "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=5&sort=symbol&asc=1&node=new_dzxx"),
    ("东财板块-datacenter", "https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BOARD_HISTORY&columns=ALL&pageNumber=1&pageSize=5"),
]


def probe(item):
    name, url = item
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Referer": "https://data.eastmoney.com/",
            "Accept": "application/json,text/plain,*/*"})
        with urllib.request.urlopen(req, timeout=14) as r:
            raw = r.read(1500)
            return name, r.status, len(raw), raw.decode("utf-8", "replace").replace("\n", " ")[:260]
    except Exception as e:
        return name, "ERR", 0, str(e)[:130]


with ThreadPoolExecutor(max_workers=8) as ex:
    for name, status, size, body in ex.map(probe, C):
        print("%-24s %-5s %-6s %s" % (name, status, size, body))
