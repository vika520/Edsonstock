"""探测：全 A 个股日线批量可得性（为第 04 栏宽度/资金流指标）。

目标：确认能否用公开接口一次性构建「每日全市场 upVol/downVol / NH-NL / TRIN」的
真实历史序列，而不是用涨跌家数比例分摊的代理值。
"""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
HQ = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
      "Market_Center.getHQNodeData?page={}&num=100&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page")
KL = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
      "CN_MarketData.getKLineData?symbol={}&scale=240&datalen={}")


def get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://finance.sina.com.cn/"})
    return urllib.request.urlopen(req, timeout=timeout).read()


def page(i):
    try:
        return json.loads(get(HQ.format(i)).decode("utf-8", "ignore")) or []
    except Exception:
        return []


def kl(args):
    sym, n = args
    try:
        raw = get(KL.format(sym, n), timeout=20)
        return sym, json.loads(raw.decode("utf-8", "ignore")), len(raw)
    except Exception as e:
        return sym, None, str(e)


def main():
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=8) as ex:
        pages = list(ex.map(page, range(1, 60)))
    seen = {}
    for p in pages:
        for r in p or []:
            seen[r["symbol"]] = r
    rows = list(seen.values())
    print("快照: %d 只 / %d 页 / %.1fs" % (len(rows), len(pages), time.time() - t0))
    if not rows:
        return
    print("字段:", sorted(rows[0].keys()))
    print("样例:", json.dumps(rows[0], ensure_ascii=False)[:500])

    syms = [r["symbol"] for r in rows[:40]]
    for n in (250, 600):
        t = time.time()
        with ThreadPoolExecutor(max_workers=12) as ex:
            res = list(ex.map(kl, [(s, n) for s in syms]))
        ok = [r for r in res if r[1]]
        sizes = [r[2] for r in ok if isinstance(r[2], int)]
        lens = [len(r[1]) for r in ok]
        print("\ndatalen=%d : %d/%d 成功 / %.1fs / 平均 %.0f 行 / 平均 %.1f KB / 合计 %.2f MB"
              % (n, len(ok), len(syms), time.time() - t,
                 sum(lens) / max(1, len(lens)), sum(sizes) / max(1, len(sizes)) / 1024,
                 sum(sizes) / 1024 / 1024))
        if ok:
            print("  首行:", ok[0][1][0], " 末行:", ok[0][1][-1])
            print("  首日:", ok[0][1][0]["day"], " 末日:", ok[0][1][-1]["day"])
        bad = [r for r in res if not r[1]][:3]
        if bad:
            print("  失败样例:", [(b[0], str(b[2])[:80]) for b in bad])
    # 估算全量
    print("\n估算全量 %d 只：" % len(rows))
    for n, mb in ((250, 0.115), (600, 0.27)):
        print("  datalen=%d → 约 %.0f MB 下载" % (n, len(rows) * mb / 1024))


if __name__ == "__main__":
    main()
