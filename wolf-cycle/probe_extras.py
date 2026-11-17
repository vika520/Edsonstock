"""一次性探测 6 类新增数据源的公开可得性（只探测、不写业务数据）。

结果写入 data/_probe_extras_raw.json（已被 .gitignore 排除），供设计栏目时判断
哪些是真数据、哪些只能做代理、哪些没有免费日度源。
"""
import concurrent.futures
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "_probe_extras_raw.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

E = "https://datacenter-web.eastmoney.com/api/data/v1/get"
P = "https://push2.eastmoney.com/api/qt"

PROBES = {
    "两融历史": (E + "?reportName=RPTA_WEB_RZRQ_LSHJ&columns=ALL&sortColumns=dim_date&sortTypes=-1&pageSize=5&pageNumber=1&source=WEB&client=WEB", None),
    "中金所日行情": ("http://www.cffex.com.cn/sj/hqsj/rtj/202611/13/index.xml", None),
    "中金所IF日行情": ("http://www.cffex.com.cn/sj/hqsj/rtj/202611/13/IF.xml", None),
    "中金所IF持仓排名": ("http://www.cffex.com.cn/sj/ccpm/202611/13/IF.xml", None),
    "ETF列表含份额字段": (P + "/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f14,f2,f3,f6,f8,f20,f21", None),
    "ETF单只明细": (P + "/stock/get?secid=1.510300&fields=f57,f58,f43,f60,f116,f117,f162,f168", None),
    "涨停池": ("https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=5&sort=fbt:asc&date=20261113", "https://quote.eastmoney.com/"),
    "跌停池": ("https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=5&sort=fund:asc&date=20261113", "https://quote.eastmoney.com/"),
    "炸板池": ("https://push2ex.eastmoney.com/getTopicZBPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=5&sort=fbt:asc&date=20261113", "https://quote.eastmoney.com/"),
    "行业板块含PE": (P + "/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f6,f9,f20,f104,f105", None),
    "限售解禁": (E + "?reportName=RPT_LIFT_STAGE&columns=ALL&pageSize=5&pageNumber=1&sortColumns=free_date&sortTypes=1&source=WEB&client=WEB", None),
    "股东减持": (E + "?reportName=RPT_SHARE_HOLDER_REDUCE&columns=ALL&pageSize=5&pageNumber=1&sortColumns=notice_date&sortTypes=-1&source=WEB&client=WEB", None),
    "股份回购": (E + "?reportName=RPT_SHARE_REPURCHASE&columns=ALL&pageSize=5&pageNumber=1&sortColumns=notice_date&sortTypes=-1&source=WEB&client=WEB", None),
    "业绩预告": (E + "?reportName=RPT_PUBLIC_OP_NEWPREDICT&columns=ALL&pageSize=5&pageNumber=1&sortColumns=notice_date&sortTypes=-1&source=WEB&client=WEB", None),
    "龙虎榜": (E + "?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&pageSize=5&pageNumber=1&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB", None),
    "外盘指数商品": (P + "/ulist.np/get?fltt=2&invt=2&secids=100.HSI,100.NDX,100.DJIA,100.SPX,100.UDI,101.GC00Y,101.CL00Y&fields=f1,f2,f3,f4,f12,f13,f14", None),
    "期指行情东财": (P + "/ulist.np/get?fltt=2&invt=2&secids=8.IF2611,8.IC2611,8.IM2611,8.IH2611&fields=f1,f2,f3,f4,f12,f13,f14", None),
    "期权列表": (P + "/clist/get?pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:10&fields=f12,f14,f2,f3,f6", None),
    "人民币汇率": ("https://hq.sinajs.cn/list=fx_susdcny,fx_susdcnh", "https://finance.sina.com.cn/"),
    "中债10Y": (E + "?reportName=RPTA_WEB_TREASURYYIELD&columns=ALL&pageSize=5&pageNumber=1&sortColumns=SOLAR_DATE&sortTypes=-1&source=WEB&client=WEB", None),
    "BTC": ("https://api.okx.com/api/v5/market/ticker?instId=BTC-USDT", None),
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
        meta = {"http": code.strip(), "len": len(body), "head": body[:420]}
        try:
            j = json.loads(body)
            meta["json"] = True
            meta["keys"] = list(j.keys())[:8] if isinstance(j, dict) else "list"
            d = j.get("data") if isinstance(j, dict) else None
            if isinstance(d, list):
                meta["rows"] = len(d)
                meta["first"] = str(d[0])[:260] if d else ""
            elif isinstance(d, dict):
                meta["rows"] = len(d.get("diff") or [])
                meta["dataKeys"] = list(d.keys())[:10]
                meta["first"] = str((d.get("diff") or [{}])[0])[:260]
            else:
                meta["rows"] = None
        except Exception:
            meta["json"] = False
        return name, meta
    except Exception as ex:
        return name, {"http": "ERR", "len": 0, "head": str(ex)[:200]}


def main():
    out = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for name, meta in pool.map(fetch, PROBES.items()):
            out[name] = meta
            print("%-18s http=%-4s len=%-7s json=%-5s rows=%-5s %s" %
                  (name, meta.get("http"), meta.get("len"), meta.get("json"),
                   meta.get("rows"), meta.get("head", "")[:110].replace("\n", " ")))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("\nsaved:", OUT)


if __name__ == "__main__":
    main()
