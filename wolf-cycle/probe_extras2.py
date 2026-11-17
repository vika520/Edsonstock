"""第二轮探测：解决两融、行业 PE、ETF 份额、中金所 datatypeid、历史回补能力。"""
import concurrent.futures
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "_probe_extras2_raw.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
E = "https://datacenter-web.eastmoney.com/api/data/v1/get"
P = "https://push2.eastmoney.com/api/qt"

P2 = {
    "两融_RPT_RZRQ_LSHJ": (E + "?reportName=RPT_RZRQ_LSHJ&columns=ALL&pageSize=3&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB", None),
    "两融_RPTA_RZRQ": (E + "?reportName=RPTA_RZRQ_LSHJ&columns=ALL&pageSize=3&source=WEB&client=WEB", None),
    "两融_MARGIN_DAILY": (E + "?reportName=RPT_MARGIN_DAILY&columns=ALL&pageSize=3&source=WEB&client=WEB", None),
    "两融_RZRQ_LSHJ_TOTAL": (E + "?reportName=RPTA_WEB_RZRQ_LSHJ_TOTAL&columns=ALL&pageSize=3&source=WEB&client=WEB", None),
    "上交所两融汇总": ("http://query.sse.com.cn/commonQuery.do?sqlId=COMMON_SSE_MARGIN_MARGINRATE_SEARCH&isPagination=true&tabType=mxtype&detailsDate=20261113&pageHelp.pageSize=5&pageHelp.pageNo=1", "http://www.sse.com.cn/"),
    "深交所两融": ("http://www.szse.cn/api/report/ShowReport/data?SHOWTYPE=JSON&CATALOGID=1837_xxpl&TABKEY=tab1&txtQueryDate=2026-11-13", "http://www.szse.cn/"),
    "行业PE_ulist": (P + "/ulist.np/get?fltt=2&invt=2&secids=90.BK0475,90.BK0447,90.BK1036&fields=f1,f2,f3,f4,f6,f9,f12,f13,f14,f20", None),
    "行业PE_clist编码": (P + "/clist/get?pn=1&pz=3&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m%3A90%2Bt%3A2&fields=f12,f14,f2,f3,f6,f9,f20", None),
    "行业PE_clist简版": (P + "/clist/get?pn=1&pz=3&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m%3A90%2Bt%3A2&fields=f12,f14,f2,f3", None),
    "ETF列表编码": (P + "/clist/get?pn=1&pz=3&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b%3AMK0021%2Cb%3AMK0022%2Cb%3AMK0023%2Cb%3AMK0024&fields=f12,f14,f2,f3,f6,f20,f21", None),
    "ETF明细全字段": (P + "/stock/get?secid=1.510300&fields=f57,f58,f43,f44,f45,f46,f47,f48,f60,f116,f117,f162,f168,f169,f170,f171", None),
    "ETF份额F10": ("https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=gmbd&mode=0&code=510300&rt=0.1", "https://fundf10.eastmoney.com/"),
    "中金所历史日行情": ("http://www.cffex.com.cn/sj/hqsj/rtj/202611/12/index.xml", None),
    "中金所历史持仓IM": ("http://www.cffex.com.cn/sj/ccpm/202611/12/IM.xml", None),
    "涨停池历史": ("https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=3&sort=fbt:asc&date=20261112", "https://quote.eastmoney.com/"),
    "炸板池历史": ("https://push2ex.eastmoney.com/getTopicZBPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=3&sort=fbt:asc&date=20261112", "https://quote.eastmoney.com/"),
    "中证500日线": ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000905,day,2026-11-01,2026-11-14,20,qfq", None),
    "中证1000日线": ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000852,day,2026-11-01,2026-11-14,20,qfq", None),
    "上证50日线": ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000016,day,2026-11-01,2026-11-14,20,qfq", None),
    "沪深300指数": ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000300,day,2026-11-01,2026-11-14,20,qfq", None),
}


def fetch(item):
    name, (url, referer) = item
    cmd = ["curl", "-sS", "-m", "18", "--compressed", "-A", UA,
           "-w", "\n__HTTP__%{http_code}", url]
    if referer:
        cmd[1:1] = ["-H", "Referer: " + referer]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=25)
        body = r.stdout or ""
        code = ""
        if "\n__HTTP__" in body:
            body, code = body.rsplit("\n__HTTP__", 1)
        body = body.strip()
        return name, {"http": code.strip(), "len": len(body), "head": body[:700]}
    except Exception as ex:
        return name, {"http": "ERR", "len": 0, "head": str(ex)[:200]}


def main():
    out = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for name, meta in pool.map(fetch, P2.items()):
            out[name] = meta
            print("%-22s http=%-4s len=%-7s %s" %
                  (name, meta["http"], meta["len"], meta["head"][:150].replace("\n", " ")))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("\nsaved:", OUT)


if __name__ == "__main__":
    main()
