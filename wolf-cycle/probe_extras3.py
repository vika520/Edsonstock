"""第三轮收尾探测：行业 PE / ETF 份额 / 两融长历史 / 中金所持仓类型 / 期权字段。"""
import concurrent.futures
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "_probe_extras3_raw.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
E = "https://datacenter-web.eastmoney.com/api/data/v1/get"
P = "https://push2.eastmoney.com/api/qt"

P3 = {
    # 与 fetch_tmt.py 完全同构，只多带 PE 字段
    "行业PE_ulist_f9": (P + "/ulist.np/get?secids=90.BK1036,90.BK0447,90.BK0475&fltt=2&fields=f12,f14,f6,f3,f9,f20,f23", "https://quote.eastmoney.com/"),
    "行业PE_ulist_简": (P + "/ulist.np/get?secids=90.BK1036,90.BK0447,90.BK0475&fltt=2&fields=f12,f14,f6,f3,f9", "https://quote.eastmoney.com/"),
    "行业PE_clist_token": (P + "/clist/get?ut=bd1d9ddb04089700cf9c27f6f7426281&pn=1&pz=5&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f2,f3,f6,f9,f20", "https://quote.eastmoney.com/"),
    "行业PE_82域名": ("https://82.push2.eastmoney.com/api/qt/ulist.np/get?secids=90.BK1036,90.BK0447&fltt=2&fields=f12,f14,f6,f3,f9", "https://quote.eastmoney.com/"),
    # ETF 份额：扫字段
    "ETF_份额字段": (P + "/stock/get?secid=1.510300&fields=f57,f58,f43,f84,f85,f116,f117,f162,f163,f164,f167,f168", "https://quote.eastmoney.com/"),
    "ETF_ulist份额": (P + "/ulist.np/get?secids=1.510300,1.510050,0.159915&fltt=2&fields=f12,f14,f2,f3,f6,f84,f85,f116,f117", "https://quote.eastmoney.com/"),
    "ETF_F10_http": ("http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=gmbd&mode=0&code=510300&rt=0.1", "http://fundf10.eastmoney.com/"),
    "ETF_基金净值": ("https://api.fund.eastmoney.com/f10/lsjz?fundCode=510300&pageIndex=1&pageSize=5", "https://fundf10.eastmoney.com/"),
    # 两融长历史
    "两融_3年": (E + "?reportName=RPTA_RZRQ_LSHJ&columns=ALL&pageSize=800&sortColumns=DIM_DATE&sortTypes=-1&source=WEB&client=WEB", None),
    # 中金所持仓与历史
    "CFFEX_IF持仓": ("http://www.cffex.com.cn/sj/ccpm/202611/13/IF.xml", None),
    "CFFEX_IC持仓": ("http://www.cffex.com.cn/sj/ccpm/202611/13/IC.xml", None),
    "CFFEX_IM持仓": ("http://www.cffex.com.cn/sj/ccpm/202611/13/IM.xml", None),
    "CFFEX_IH持仓": ("http://www.cffex.com.cn/sj/ccpm/202611/13/IH.xml", None),
    "CFFEX_历史日行情1106": ("http://www.cffex.com.cn/sj/hqsj/rtj/202611/06/index.xml", None),
    # 事件与跨市场
    "解禁_近期": (E + "?reportName=RPT_LIFT_STAGE&columns=ALL&pageSize=5&sortColumns=FREE_DATE&sortTypes=1&filter=(FREE_DATE%3E%3D%272026-11-13%27)&source=WEB&client=WEB", None),
    "业绩预告_近期": (E + "?reportName=RPT_PUBLIC_OP_NEWPREDICT&columns=ALL&pageSize=5&sortColumns=NOTICE_DATE&sortTypes=-1&source=WEB&client=WEB", None),
    "龙虎榜_当日": (E + "?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&pageSize=5&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB", None),
    "外盘_扩展": (P + "/ulist.np/get?fltt=2&secids=100.HSI,100.NDX,100.DJIA,100.SPX,100.UDI,101.GC00Y,100.BTCUSD&fields=f1,f2,f3,f4,f12,f13,f14", "https://quote.eastmoney.com/"),
}


def fetch(item):
    name, (url, referer) = item
    cmd = ["curl", "-sS", "-m", "20", "--http1.1", "--compressed", "-A", UA,
           "-w", "\n__HTTP__%{http_code}", url]
    if referer:
        cmd[1:1] = ["-H", "Referer: " + referer]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=28)
        body = r.stdout or ""
        code = ""
        if "\n__HTTP__" in body:
            body, code = body.rsplit("\n__HTTP__", 1)
        body = body.strip()
        return name, {"http": code.strip(), "len": len(body), "head": body[:900]}
    except Exception as ex:
        return name, {"http": "ERR", "len": 0, "head": str(ex)[:200]}


def analyse(name, meta):
    """对结构性数据做一次轻量解析，避免把整份响应塞进摘要。"""
    b = meta["head"] + ""
    if meta["http"] != "200" or not b:
        return None
    info = {}
    if name.startswith("两融") or name.startswith("解禁") or name.startswith("业绩预告") or name.startswith("龙虎榜"):
        try:
            d = json.loads(b if "}" == b[-1] else "{}")
            res = (d.get("result") or {})
            info["pages"] = res.get("pages")
            info["count"] = len(res.get("data") or [])
            info["first"] = str((res.get("data") or [{}])[0])[:400]
        except Exception:
            pass
    return info or None


def main():
    out = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        for name, meta in pool.map(fetch, P3.items()):
            out[name] = meta
            print("%-24s http=%-4s len=%-8s %s" %
                  (name, meta["http"], meta["len"], meta["head"][:170].replace("\n", " ")))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # 中金所持仓 datatypeid 映射：把 4 个品种 XML 落盘，用日行情总量做对照
    print("\n--- CFFEX datatypeid 对照 ---")
    for prod in ("IF", "IC", "IM", "IH"):
        name = "CFFEX_%s持仓" % prod
        meta = out.get(name, {})
        if meta.get("http") != "200":
            continue
        u = P3[name][0]
        r = subprocess.run(["curl", "-sS", "-m", "20", "-A", UA, u],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        rows = re.findall(r"<data .*?</data>", r.stdout or "", re.S)
        agg = {}
        for row in rows:
            t = re.search(r"<datatypeid>(\d+)</datatypeid>", row)
            v = re.search(r"<volume>(-?\d+)</volume>", row)
            if t and v:
                agg.setdefault(t.group(1), []).append(int(v.group(1)))
        print(prod, {k: (len(v), sum(v)) for k, v in sorted(agg.items())})
    print("\nsaved:", OUT)


if __name__ == "__main__":
    main()
