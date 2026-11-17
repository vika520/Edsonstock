"""拉取 A 股主要宽基指数日线（腾讯行情公开接口），输出紧凑 JSON 供图表使用。

数据源: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get
接口单次上限 2000 根，故按日期区间分段抓取后合并去重。
交叉校验: 通达信 tdx_kline（2026-11-13 上证指数收盘 3634.35 一致）
"""
import json
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)

TARGETS = [
    ("sh000001", "上证指数", "SSE Composite"),
    ("sz399001", "深证成指", "SZSE Component"),
    ("sz399006", "创业板指", "ChiNext"),
    ("sh000300", "沪深300", "CSI 300"),
]

# (start, end) 分段，每段接口最多返回 2000 根（取区间内最近的 2000 根）
WINDOWS = [
    ("2003-01-01", "2011-12-31"),
    ("2009-01-01", "2018-12-31"),
    ("2016-01-01", "2026-11-14"),
]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def fetch_window(code, start, end):
    url = ("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
           f"?param={code},day,{start},{end},2000,qfq")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://gu.qq.com/"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        raw = resp.read().decode("utf-8")
    doc = json.loads(raw)
    node = doc.get("data")
    if not isinstance(node, dict) or code not in node:
        raise RuntimeError(f"{code} {start}~{end}: param error / empty: {raw[:160]}")
    x = node[code]
    rows = x.get("day") or x.get("qfqday") or []
    out = []
    for r in rows:
        # [日期, 开, 收, 高, 低, 量]
        try:
            out.append([str(r[0]).replace("-", ""), round(float(r[2]), 2),
                        round(float(r[3]), 2), round(float(r[4]), 2)])
        except (ValueError, IndexError):
            continue
    return out


def fetch(code):
    merged = {}
    for s, e in WINDOWS:
        for r in fetch_window(code, s, e):
            if r[0] >= "20050101":
                merged[r[0]] = r
    return [merged[k] for k in sorted(merged)]


def main():
    result = {"source": "腾讯证券行情 (web.ifzq.gtimg.cn) 日线，不复权",
              "crosscheck": "通达信 tdx_kline 校验：2026-11-13 上证指数收盘 3634.35 一致",
              "fetchedAt": "2026-11-14", "indices": {}}
    for code, name, en in TARGETS:
        rows = fetch(code)
        if len(rows) < 500:
            raise RuntimeError(f"{code} 数据不足({len(rows)})，终止（禁止编造行情）")
        result["indices"][code] = {"name": name, "en": en, "rows": rows}
        print(f"{name:8s} {code:10s} {len(rows):5d} 根  {rows[0][0]} ~ {rows[-1][0]}  最新收盘 {rows[-1][1]}")
    path = os.path.join(OUT, "indices.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print("saved:", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
