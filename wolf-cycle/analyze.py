"""双冰点事件的数据质量检查与事件研究统计（纯描述性，不做参数寻优）。"""
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(os.path.join(HERE, "data", "breadth.json"), encoding="utf-8"))["rows"]
I = json.load(open(os.path.join(HERE, "data", "indices.json"), encoding="utf-8"))
CLOSE = {r[0]: r[1] for r in I["indices"]["sh000001"]["rows"]}

print("=== 数据对齐 ===")
print("breadth", len(B), B[0][0], "~", B[-1][0])
matched = sum(1 for r in B if r[0] in CLOSE)
print("与上证指数交易日匹配:", matched, "/", len(B))

print("\n=== 恒等式残差 (total - down - up - flat) ===")
res = [(r[0], r[4] - r[1] - r[2] - r[3]) for r in B]
bad = [x for x in res if abs(x[1]) > 100]
print("残差 >100 的日期数:", len(bad), "示例:", bad[:6])
print("残差中位数:", st.median(x[1] for x in res))

print("\n=== 按年统计（分母变化） ===")
years = {}
for r in B:
    y = r[0][:4]
    years.setdefault(y, []).append(r)
for y in sorted(years):
    rs = years[y]
    tot = st.mean(x[4] for x in rs)
    ice = sum(1 for x in rs if x[1] >= 4000)
    boil = sum(1 for x in rs if x[2] >= 4000)
    ice80 = sum(1 for x in rs if x[1] / (x[1] + x[2] + x[3]) >= 0.80)
    print(f"{y}: {len(rs):3d}日 总品种均值 {tot:6.0f} | 下跌≥4000 {ice:3d}日 | 上涨≥4000 {boil:3d}日 | 下跌占比≥80% {ice80:3d}日")

print("\n=== 双冰点（连续2日 下跌≥4000） ===")
ev = []
for i in range(1, len(B)):
    if B[i][1] >= 4000 and B[i - 1][1] >= 4000:
        ev.append(i)
print("名义事件数（含连续段重叠）:", len(ev))
# 去重：逐根推进，只在 run 恰好等于 2 时记一次（与页面 JS 逻辑一致）
seg, run = [], 0
for i in range(len(B)):
    run = run + 1 if B[i][1] >= 4000 else 0
    if run == 2:
        seg.append(i)
print("去重后（每段首日确认）:", len(seg))
print("年份分布:", {y: sum(1 for i in seg if B[i][0][:4] == y) for y in sorted(set(B[i][0][:4] for i in seg))})

print("\n=== 事件研究：以信号日收盘为基准，后续 N 日上证收益 ===")
HORIZONS = [1, 3, 5, 10, 20]
def fwd_stats(sig_indices):
    out = {}
    for h in HORIZONS:
        vals = []
        for i in sig_indices:
            d0, d1 = B[i][0], None
            j = i + h
            if j < len(B):
                d1 = B[j][0]
            if d0 in CLOSE and d1 in CLOSE:
                vals.append((CLOSE[d1] / CLOSE[d0] - 1) * 100)
        if vals:
            out[h] = (len(vals), st.mean(vals), st.median(vals),
                      sum(1 for v in vals if v > 0) / len(vals) * 100)
    return out
evst = fwd_stats(seg)
allst = fwd_stats(range(len(B)))
for h in HORIZONS:
    e, a = evst.get(h), allst.get(h)
    if e and a:
        print(f"T+{h:2d}: 双冰点 n={e[0]:3d} 均值{e[1]:+6.2f}% 中位{e[2]:+6.2f}% 胜率{e[3]:5.1f}%  ||  全样本 均值{a[1]:+6.2f}% 胜率{a[3]:5.1f}%")

print("\n=== 相对口径对照（连续2日 下跌占比≥80%，分母=上涨+下跌+平盘） ===")
evr, run = [], 0
for i in range(len(B)):
    dn = B[i][1] / (B[i][1] + B[i][2] + B[i][3])
    run = run + 1 if dn >= .8 else 0
    if run == 2:
        evr.append(i)
print("去重事件数:", len(evr), "年份分布:",
      {y: sum(1 for i in evr if B[i][0][:4] == y) for y in sorted(set(B[i][0][:4] for i in evr))})
for h in HORIZONS:
    e = fwd_stats(evr).get(h)
    if e:
        print(f"T+{h:2d}: n={e[0]:3d} 均值{e[1]:+6.2f}% 中位{e[2]:+6.2f}% 胜率{e[3]:5.1f}%")

print("\n=== 最近 12 个双冰点事件 ===")
for i in seg[-12:]:
    r = B[i]
    print(r[0], "下跌", r[1], "/", r[4], f"({r[1]/r[4]*100:.1f}%)",
          "上证", CLOSE.get(r[0]), "前一日下跌", B[i - 1][1])
