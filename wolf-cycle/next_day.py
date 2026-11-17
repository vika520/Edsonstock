"""双冰点信号后「次日上涨」概率：精确计数、显著性、稳健性与口径对照。

定义（与页面一致）：
  冰点 = 下跌家数 >= thr（绝对口径）或 下跌占比 >= ratio（相对口径，分母=上涨+下跌+平盘）
  双冰点 = 连续 streak 天冰点；信号日 = 连续段中首次满足日，每段只记一次（避免重叠计数）
  次日上涨 = 信号日收盘 → 下一个交易日收盘 上证指数收涨（ret > 0）
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
B = json.load(open(os.path.join(HERE, "data", "breadth.json"), encoding="utf-8"))["rows"]
I = json.load(open(os.path.join(HERE, "data", "indices.json"), encoding="utf-8"))
PX = {r[0]: r[1] for r in I["indices"]["sh000001"]["rows"]}
N = len(B)
denom = lambda i: max(1, B[i][1] + B[i][2] + B[i][3])

def events(thr=4000, streak=2, ratio=None):
    ice = [(B[i][1] >= thr) if ratio is None
           else (B[i][1] / denom(i) >= ratio) for i in range(N)]
    run, out = 0, []
    for i in range(N):
        run = run + 1 if ice[i] else 0
        if run == streak:
            out.append(i)
    return out, ice

def ret1(k):
    if k + 1 >= N:
        return None
    return (PX[B[k + 1][0]] / PX[B[k][0]] - 1) * 100

def binom_tail(n, k, p):
    # log-space 累加，避免大 n 时 math.comb 溢出
    lp, lq = math.log(p), math.log1p(-p)
    tot = 0.0
    for i in range(k, n + 1):
        lc = math.lgamma(n + 1) - math.lgamma(i + 1) - math.lgamma(n - i + 1)
        tot += math.exp(lc + i * lp + (n - i) * lq)
    return min(1.0, tot)

def wilson(k, n, z=1.96):
    if n == 0:
        return (0, 0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)

def describe(idxs, label):
    r = [ret1(k) for k in idxs]
    r = [x for x in r if x is not None]
    n = len(r)
    up = sum(1 for x in r if x > 0)
    flat = sum(1 for x in r if x == 0)
    p = up / n if n else 0
    lo, hi = wilson(up, n)
    pv50 = binom_tail(n, up, .5)
    return dict(label=label, n=n, up=up, down=n - up - flat, flat=flat, p=p * 100,
                mean=sum(r) / n if n else 0,
                med=sorted(r)[n // 2] if n else 0,
                mx=max(r) if n else 0, mn=min(r) if n else 0,
                ci=(lo * 100, hi * 100), pv50=pv50, rets=r)

def show(d):
    print(f"{d['label']:<28s} n={d['n']:4d}  涨{d['up']:3d}/跌{d['down']:3d}/平{d['flat']:2d}"
          f"  胜率 {d['p']:5.1f}%  Wilson95%[{d['ci'][0]:.1f}, {d['ci'][1]:.1f}]"
          f"  均值{d['mean']:+6.2f}% 中位{d['med']:+6.2f}%  p(≥观察到|p=0.5)={d['pv50']:.3f}")

# ---------- 基准 ----------
allr = [ret1(i) for i in range(N - 1)]
allr = [x for x in allr if x is not None]
base_up = sum(1 for x in allr if x > 0)
base_p = base_up / len(allr)
base = describe(range(N - 1), "全样本基准（所有交易日）")
print("=== 基准 ===")
show(base)
print(f"基准次日上涨概率 = {base_p*100:.2f}%  ({base_up}/{len(allr)})")

# ---------- 主口径 ----------
ev, _ = events()
main = describe(ev, "双冰点 绝对4000 / 连续2天")
print("\n=== 主口径 ===")
show(main)
pv_base = binom_tail(main['n'], main['up'], base_p)
print(f"相对基准 {base_p*100:.2f}% 的单尾二项 p = {pv_base:.3f}"
      f"   → {'显著' if pv_base < .05 else '不显著（无法拒绝「与基准无差别」）'}")
print(f"最大单日涨 {main['mx']:+.2f}% / 最大单日跌 {main['mn']:+.2f}%")
U = [x for x in main['rets'] if x > 0]
DN = [x for x in main['rets'] if x < 0]
avg_u, avg_d = sum(U) / len(U), sum(DN) / len(DN)
print(f"平均盈利 {avg_u:+.2f}% / 平均亏损 {avg_d:+.2f}%  盈亏比 {avg_u/abs(avg_d):.2f}"
      f"  期望值 {main['p']/100*avg_u + (1-main['p']/100)*avg_d:+.3f}%")
# 相对口径「看起来显著」的多重比较校正
r80, _ = events(ratio=.80)
d80 = describe(r80, "下跌占比≥80%")
pv80 = binom_tail(d80['n'], d80['up'], base_p)
print(f"相对80%口径: {d80['up']}/{d80['n']}={d80['p']:.1f}% 相对基准 p={pv80:.4f}"
      f"  Bonferroni(试5档阈值) 校正后 p≈{min(1,pv80*5):.3f}")

# 收益分布
bins = [(-99, -2), (-2, -1), (-1, 0), (0, 1), (1, 2), (2, 99)]
print("次日收益分布:", [(f"{a}~{b}%", sum(1 for x in main['rets'] if a <= x < b))
                    for a, b in bins])

# ---------- 稳健性：阈值 ----------
print("\n=== 稳健性 A：绝对口径不同阈值（连续2天） ===")
for t in [3000, 3500, 4000, 4200, 4500, 4800, 5000]:
    e, _ = events(thr=t)
    show(describe(e, f"下跌≥{t}家"))

print("\n=== 稳健性 B：相对占比口径（连续2天） ===")
for r in [.70, .75, .80, .85, .90]:
    e, _ = events(ratio=r)
    show(describe(e, f"下跌占比≥{r*100:.0f}%"))

print("\n=== 稳健性 C：连续天数（绝对4000） ===")
for s in [2, 3, 4]:
    e, _ = events(streak=s)
    show(describe(e, f"连续{s}天冰点"))

# ---------- 对照：所有冰点日 / 所有双冰点名义日（含重叠） ----------
_, ice = events()
all_ice = [i for i in range(N - 1) if ice[i]]
nominal = [i for i in range(1, N - 1) if ice[i] and ice[i - 1]]
print("\n=== 口径对照 ===")
show(describe(all_ice, "所有单日冰点的次日"))
show(describe(nominal, "名义双冰点日(含重叠)"))

# ---------- 「情绪修复」口径 ----------
print("\n=== 如果把「上涨」理解为市场情绪修复 ===")
def emo(evs, label):
    ok = tot = 0
    up_over_down = boil = 0
    for k in evs:
        if k + 1 >= N:
            continue
        j = k + 1
        tot += 1
        if B[j][2] > B[j][1]:
            up_over_down += 1
        if B[j][1] < B[k][1]:
            ok += 1
        if B[j][2] >= 4000:
            boil += 1
    print(f"{label:<28s} n={tot:3d}  下跌家数比信号日减少 {ok:3d} ({ok/tot*100:.1f}%)  "
          f"次日上涨家数>下跌家数 {up_over_down:3d} ({up_over_down/tot*100:.1f}%)  "
          f"次日普涨≥4000家 {boil:2d} ({boil/tot*100:.1f}%)")
emo(ev, "双冰点 绝对4000/连续2天")
emo(range(N - 1), "全样本基准")

# ---------- 分年份 ----------
print("\n=== 分年份（主口径） ===")
for y in sorted({B[k][0][:4] for k in ev}):
    ks = [k for k in ev if B[k][0][:4] == y]
    show(describe(ks, y))

# ---------- 逐事件明细 ----------
print("\n=== 逐事件：信号日 → 次日 ===")
for k in ev:
    r = ret1(k)
    print(f"{B[k][0]}  信号日下跌 {B[k][1]:4d}  上证 {PX[B[k][0]]:8.2f}  "
          f"次日 {B[k+1][0] if k+1<N else '—'}  {('%+.2f%%' % r) if r is not None else '无数据':>8s}"
          f"  {'涨' if r is not None and r>0 else ('跌' if r is not None and r<0 else '—')}"
          f"  次日下跌家数 {B[k+1][1] if k+1<N else '—'}")
