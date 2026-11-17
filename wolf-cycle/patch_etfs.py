"""通达信 MCP 配额耗尽后，用腾讯公开日线补齐 ETF，并用已抓到的 5 只真实成交额校验估算精度。

腾讯 fqkline 行格式 [日期, 开, 收, 高, 低, 成交量(手)]，无成交额字段。
成交额估算 = 成交量(手) × 100 × 收盘价；与 qt.gtimg.cn 实时成交额、通达信 Amount 交叉校验。
"""
import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "data", "workbench.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# (代码, 名称, 分类, 是否重点宽基)
ETF = [
    ("510300", "沪深300ETF", "沪深300", 1), ("159919", "300ETF(深)", "沪深300", 1),
    ("510310", "300ETF(易)", "沪深300", 1), ("510050", "上证50ETF", "上证50", 1),
    ("510500", "中证500ETF", "中证500", 1), ("159922", "500ETF(深)", "中证500", 1),
    ("512100", "中证1000ETF", "中证1000", 1), ("159845", "1000ETF(深)", "中证1000", 1),
    ("159915", "创业板ETF", "创业板", 1), ("159949", "创业板50ETF", "创业板", 1),
    ("588000", "科创50ETF", "科创板", 1), ("588080", "科创板50ETF", "科创板", 1),
    ("510180", "上证180ETF", "上证180", 1), ("159901", "深100ETF", "深证100", 1),
    ("512050", "中证A50ETF", "中证A50", 1), ("563300", "中证2000ETF", "中证2000", 1),
    ("159338", "中证A500ETF", "中证A500", 1), ("515800", "中证800ETF", "中证800", 1),
    ("159629", "1000ETF(广)", "中证1000", 1), ("510330", "300ETF(华)", "沪深300", 1),
    ("512880", "证券ETF", "券商", 0), ("512480", "半导体ETF", "半导体", 0),
    ("515790", "光伏ETF", "光伏", 0), ("515030", "新能源车ETF", "新能源车", 0),
    ("512690", "酒ETF", "白酒", 0), ("512170", "医疗ETF", "医疗", 0),
    ("512660", "军工ETF", "军工", 0), ("515880", "通信ETF", "通信", 0),
    ("512800", "银行ETF", "银行", 0), ("515220", "煤炭ETF", "煤炭", 0),
    ("512400", "有色ETF", "有色", 0), ("159928", "消费ETF", "消费", 0),
]


def tx_kline(code, want=700):
    sym = ("sh" if code[0] == "5" else "sz") + code
    url = ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
           f"?param={sym},day,,,{want},")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://gu.qq.com/"})
    doc = json.loads(urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "ignore"))
    node = (doc.get("data") or {}).get(sym) or {}
    return node.get("day") or node.get("qfqday") or []


def main():
    W = json.load(open(PATH, encoding="utf-8"))
    old = W["etfs"]
    # 估算精度校验：用通达信真实 Amount 对照
    print("=== 成交额估算精度校验（真实值来自通达信 Amount） ===")
    errs = []
    for code, meta in old.items():
        try:
            rows = tx_kline(code, 30)
        except Exception:
            continue
        real = {r[0]: r[2] for r in meta["rows"]}
        for r in rows:
            d = str(r[0]).replace("-", "")
            if d in real and real[d] > 0:
                est = float(r[5]) * 100 * float(r[2])
                errs.append(est / real[d] - 1)
    if errs:
        errs.sort()
        print(f" 样本 {len(errs)} 天  估算/真实 中位数 {errs[len(errs)//2]*100:+.2f}%  "
              f"5%分位 {errs[int(len(errs)*.05)]*100:+.2f}%  95%分位 {errs[int(len(errs)*.95)]*100:+.2f}%")
    else:
        print(" 无可比对样本")

    print("=== 补齐 ETF 日线（腾讯公开接口，不复权） ===")
    etfs, ok = {}, 0
    for code, name, cat, core in ETF:
        try:
            rows = tx_kline(code, 700)
        except Exception as e:
            print(f" {code} {name}: ERR {str(e)[:70]}")
            continue
        if len(rows) < 100:
            print(f" {code} {name}: 数据不足({len(rows)})，跳过")
            continue
        exact = code in old
        series = []
        real_map = {r[0]: r[2] for r in old[code]["rows"]} if exact else {}
        for r in rows:
            try:
                d = str(r[0]).replace("-", "")
                c = round(float(r[2]), 4)
                amt = real_map.get(d) or int(float(r[5]) * 100 * c)
                series.append([d, c, amt])
            except (ValueError, IndexError):
                continue
        etfs[code] = {"name": name, "cat": cat, "core": core,
                      "exactAmount": exact, "rows": series}
        ok += 1
        print(f" {code} {name:14s} {len(series):4d} 根 {series[0][0]}~{series[-1][0]}"
              f"  {'真实成交额' if exact else '估算成交额'}")
    W["etfs"] = etfs
    W["meta"]["etfSource"] = ("通达信 MCP 日线（5 只核心 ETF，含真实成交额）+ "
                              "腾讯行情公开日线（其余 ETF，成交额=成交量(手)×100×收盘价估算）")
    W["meta"]["etfCount"] = ok
    W["meta"]["quotaNote"] = "通达信 MCP 于 2026-11-14 达到调用配额，其余 ETF 改由腾讯公开接口补齐"
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(W, f, ensure_ascii=False, separators=(",", ":"))
    print("saved:", PATH, round(os.path.getsize(PATH) / 1024, 1), "KB", "ETF数", ok)


if __name__ == "__main__":
    main()
