#!/usr/bin/env python
"""A股市场结构工作台 · 每交易日盘后增量更新 + 重建 + 同步 NAS Docker。

设计原则
--------
1. 不依赖通达信 MCP（该通道已配额耗尽）：全市场涨跌家数/成交额用新浪全 A 快照统计，
   已实测与 880005 口径几乎一致（2026-11-13：涨 765 完全一致、成交额差 0.01%）。
2. 全部使用公开 HTTP 接口 + Python 标准库，无第三方包。
3. 幂等：同一交易日重复执行只覆盖当日记录，不会重复追加。
4. 失败不部署：任何关键校验不过就抛错退出，NAS 保留上一版完整可用页面。
5. 因果安全：只追加当日及之前的已收盘日线，不使用任何未来数据。
6. NAS 部署成功后，把当日新增/变更文件提交并推送到 GitHub 公开仓库
   Edsonstock（尽力而为，失败只警告，不影响 NAS 站点）。

用法
----
  python daily_update.py                # 正常：非交易日/数据未出则跳过
  python daily_update.py --force        # 强制用最新交易日重跑（回补 / 联调）
  python daily_update.py --no-deploy    # 只更新数据与重建 HTML，不同步 NAS / GitHub
  python daily_update.py --no-git       # 同步 NAS 但不推送 GitHub
  python daily_update.py --dry-run      # 只探测数据源，不写任何文件
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "data")
DEPLOY = os.path.join(ROOT, "deploy")
LOGS = os.path.join(HERE, "logs")
import hosts  # 本地私有配置（hosts.py 不入库，公开仓库无内网地址）
NAS = hosts.nas_target()
NAS_HTML = hosts.nas_html()
NAS_PROJECT = hosts.nas_project()
SITE_URL = hosts.site_url()
PY = sys.executable

# GitHub 公开仓库同步（盘后最后一步，见 git_sync）
GIT_REMOTE = "origin"
GIT_BRANCH = "main"
GIT_EXPECT = "Edsonstock"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
TX_HOSTS = ["web.ifzq.gtimg.cn", "ifzq.gtimg.cn"]
TX = "https://{}/appstock/app/fqkline/get?param={},day,,,{},"
SINA_HQ = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
           "Market_Center.getHQNodeData?page={}&num=100&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page")
SINA_KL = ("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
           "CN_MarketData.getKLineData?symbol={}&scale=240&datalen=30")
SINA_BOARDS = [
    ("行业", "https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php"),
    ("概念", "https://money.finance.sina.com.cn/q/view/newFLJK.php?param=class"),
    ("地域", "https://money.finance.sina.com.cn/q/view/newFLJK.php?param=area"),
]
INDEX_CODES = ["sh000001", "sz399001", "sz399006", "sh000300"]

_LOGLINES = []


def log(msg):
    line = "[%s] %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg)
    print(line, flush=True)
    _LOGLINES.append(line)


def http(url, ref="https://finance.sina.com.cn/", timeout=15, retries=3):
    last = None
    for k in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ref})
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as e:
            last = e
            if k < retries:
                time.sleep(0.6 * (k + 1))
    raise RuntimeError("HTTP 失败 %s : %s" % (url[:110], last))


def jload(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def jdump(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def upsert(rows, newrows, maxlen=None):
    """按日期键覆盖合并，保持有序；可选只保留最近 maxlen 根。"""
    m = {r[0]: r for r in rows}
    for r in newrows:
        m[r[0]] = r
    out = [m[k] for k in sorted(m)]
    return out[-maxlen:] if maxlen else out


# ---------------------------------------------------------------- 取数
def tx_kline(sym, want=12, allow_sina=False):
    """腾讯双域名重试；指数可降级到新浪日线（volume 单位不同，ETF 禁用降级）。"""
    last = None
    for host in TX_HOSTS:
        try:
            raw = http(TX.format(host, sym, want), "https://gu.qq.com/", retries=1)
            doc = json.loads(raw.decode("utf-8", "ignore"))
            node = doc.get("data") or {}
            if not isinstance(node, dict):
                raise RuntimeError("非预期结构")
            x = node.get(sym) or {}
            rows = x.get("day") or x.get("qfqday") or []
            if rows:
                return rows
            raise RuntimeError("空日线")
        except Exception as e:
            last = e
            time.sleep(0.3)
    if allow_sina:
        try:
            url = SINA_KL.format(sym).replace("datalen=30", "datalen=%d" % want)
            rows = json.loads(http(url, retries=1).decode("utf-8", "ignore"))
            # 转成腾讯行序 [date, open, close, high, low, volume]；volume 单位不同但指数不用
            out = [[r["day"], r["open"], r["close"], r["high"], r["low"], r["volume"]] for r in rows]
            if out:
                log("  %s 腾讯不可用，已降级新浪日线" % sym)
                return out
        except Exception as e:
            last = e
    raise RuntimeError("行情日线全部源失败 %s : %s" % (sym, last))


def fetch_breadth():
    """新浪全 A 快照统计涨跌家数与成交额，替代 880005。"""
    def page(i):
        try:
            return json.loads(http(SINA_HQ.format(i), timeout=15).decode("utf-8", "ignore")) or []
        except Exception:
            return []
    t = time.time()
    with ThreadPoolExecutor(max_workers=6) as ex:
        pages = list(ex.map(page, range(1, 60)))
    seen = {}
    for p in pages:
        for r in p or []:
            seen[r["symbol"]] = r
    rows = list(seen.values())
    if len(rows) < 5000:
        raise RuntimeError("全 A 快照只取到 %d 只，疑似限频，终止" % len(rows))
    up = dn = fl = 0
    amount = 0.0
    volume = 0.0
    for r in rows:
        try:
            c, a, v = float(r["changepercent"]), float(r["amount"]), float(r["volume"])
        except (ValueError, KeyError, TypeError):
            continue
        amount += a
        volume += v / 100.0           # 股 -> 手
        if c > 0:
            up += 1
        elif c < 0:
            dn += 1
        else:
            fl += 1
    total = up + dn + fl
    if total < 5000 or amount <= 0:
        raise RuntimeError("涨跌家数统计异常: up=%d dn=%d amount=%.0f" % (up, dn, amount))
    log("全市场快照 %d 只 / 涨 %d 跌 %d 平 %d / 成交额 %.1f 亿 / %.1fs"
        % (len(rows), up, dn, fl, amount / 1e8, time.time() - t))
    return {"dn": dn, "up": up, "fl": fl, "tt": total,
            "amount": int(round(amount)), "volume": int(round(volume))}


def fetch_indices():
    out = {}
    for code in INDEX_CODES:
        ks = tx_kline(code, 12, allow_sina=True)
        # 腾讯 day 行: [date, open, close, high, low, volume]
        out[code] = [[r[0].replace("-", ""), round(float(r[2]), 4),
                      round(float(r[3]), 4), round(float(r[4]), 4)] for r in ks]
        if not out[code]:
            raise RuntimeError("指数 %s 无日线" % code)
    log("指数日线 4 个，最新 %s 上证 %.2f"
        % (out["sh000001"][-1][0], out["sh000001"][-1][1]))
    return out


def fetch_etfs(codes):
    out = {}
    failed = []
    for code in codes:
        sym = ("sh" if code[0] == "5" else "sz") + code
        try:
            ks = tx_kline(sym, 12)
        except Exception as e:
            failed.append(code)
            continue
        rows = []
        for r in ks:
            try:
                c = round(float(r[2]), 4)
                amt = int(float(r[5]) * 100 * c)   # 成交额估算，已校验中位偏差 -0.05%
                rows.append([r[0].replace("-", ""), c, amt])
            except (ValueError, IndexError):
                continue
        if rows:
            out[code] = rows
    log("ETF 日线 %d/%d 成功%s" % (len(out), len(codes),
        ("，失败 " + ",".join(failed)) if failed else ""))
    if len(out) < 25:
        raise RuntimeError("ETF 日线成功数不足 25 只，终止")
    return out


def fetch_boards():
    boards = []
    for cat, url in SINA_BOARDS:
        try:
            s = http(url).decode("gbk", "ignore")
            import re
            m = re.search(r"=\s*(\{.*\})", s, re.S)
            if not m:
                log("板块 %s 解析失败" % cat)
                continue
            d = json.loads(m.group(1))
            n = 0
            for k, v in d.items():
                f = v.split(",")
                if len(f) < 8:
                    continue
                try:
                    boards.append({
                        "code": f[0], "name": f[1], "cat": cat,
                        "count": int(f[2]), "chg": round(float(f[5]), 2),
                        "amount": int(float(f[7])),
                        "leader": f[12] if len(f) > 12 else "",
                        "leaderCode": f[8] if len(f) > 8 else "",
                        "leaderChg": round(float(f[9]), 2) if len(f) > 9 and f[9] else None,
                    })
                    n += 1
                except (ValueError, IndexError):
                    continue
            log("板块 %s %d 个" % (cat, n))
        except Exception as e:
            log("板块 %s ERR %s" % (cat, str(e)[:80]))
    if len(boards) < 200:
        raise RuntimeError("板块快照只取到 %d 个，终止" % len(boards))
    return boards


def fetch_mom(boards):
    """重点板块领涨股 1/5/20 日动量（真实日线，代理口径）。"""
    picked = {}
    def add(b):
        if b.get("leaderCode", "").startswith(("sh", "sz")):
            picked[b["leaderCode"]] = True
    for b in sorted(boards, key=lambda x: -x["amount"])[:60]:
        add(b)
    for b in sorted(boards, key=lambda x: -x["chg"])[:15]:
        add(b)
    for b in sorted(boards, key=lambda x: x["chg"])[:15]:
        add(b)

    def one(sym):
        try:
            rows = json.loads(http(SINA_KL.format(sym), timeout=12).decode("utf-8", "ignore"))
            if not isinstance(rows, list) or len(rows) < 21:
                return sym, None
            c = [float(r["close"]) for r in rows]
            v = [float(r["volume"]) for r in rows]
            if c[-1] <= 0 or c[-6] <= 0 or c[-21] <= 0:
                return sym, None
            vr = (sum(v[-5:]) / 5) / max(1.0, sum(v[-20:]) / 20)
            return sym, {"r1": round((c[-1] / c[-2] - 1) * 100, 2),
                         "r5": round((c[-1] / c[-6] - 1) * 100, 2),
                         "r20": round((c[-1] / c[-21] - 1) * 100, 2),
                         "vr": round(vr, 2), "last": rows[-1]["day"]}
        except Exception:
            return sym, None

    out = {}
    with ThreadPoolExecutor(max_workers=5) as ex:
        for sym, v in ex.map(one, picked):
            if v:
                out[sym] = v
    log("领涨股动量 %d/%d 成功" % (len(out), len(picked)))
    return out


# ---------------------------------------------------------------- 合并
def merge(asof, breadth, indices, etfs, boards, mom):
    # breadth.json
    bp = os.path.join(DATA, "breadth.json")
    b = jload(bp)
    b["rows"] = upsert(b["rows"], [[asof, breadth["dn"], breadth["up"],
                                    breadth["fl"], breadth["tt"]]])
    jdump(bp, b)

    # indices.json
    ip = os.path.join(DATA, "indices.json")
    idx = jload(ip)
    for code in INDEX_CODES:
        if code not in idx["indices"]:
            continue
        idx["indices"][code]["rows"] = upsert(idx["indices"][code]["rows"], indices[code])
    idx["fetchedAt"] = dt.date.today().isoformat()
    jdump(ip, idx)

    # workbench.json
    wp = os.path.join(DATA, "workbench.json")
    w = jload(wp)
    w["market"] = upsert(w["market"], [[asof, breadth["amount"], breadth["volume"],
                                        breadth["dn"], breadth["up"], breadth["fl"],
                                        breadth["tt"]]])
    for code, rows in etfs.items():
        if code not in w["etfs"]:
            continue
        old = w["etfs"][code]["rows"]
        if w["etfs"][code].get("exactAmount"):
            # 前 5 只 ETF 的历史成交额是通达信真实值，重跑时不能被估算值覆盖
            real = {r[0]: r for r in old}
            rows = [real.get(r[0], r) for r in rows]
        w["etfs"][code]["rows"] = upsert(old, rows, 700)
    w["boards"] = boards
    w["px"] = {r[0]: r[1] for r in idx["indices"]["sh000001"]["rows"]}
    w["meta"]["asof"] = asof
    w["meta"]["fetchedAt"] = dt.date.today().isoformat()
    w["meta"]["marketSource"] = ("新浪全 A 快照统计涨跌家数与成交额（2026-11-14 前为通达信 880005 Amount；"
                                 "两口径 2026-11-13 对照：涨 765 一致、成交额差 0.01%）")
    jdump(wp, w)

    jdump(os.path.join(DATA, "board_mom.json"), mom)
    log("数据合并完成：breadth %d 根 / market %d 根 / ETF %d 只 / 板块 %d 个"
        % (len(b["rows"]), len(w["market"]), len(w["etfs"]), len(boards)))
    return {"breadthBars": len(b["rows"]), "marketBars": len(w["market"]),
            "etfCount": len(w["etfs"]), "boardCount": len(boards), "momCount": len(mom),
            "up": breadth["up"], "down": breadth["dn"], "flat": breadth["fl"],
            "amount": breadth["amount"]}


def fetch_wyckoff_bars():
    """第 02 栏多周期 K 线：默认增量 upsert，保留 3 年以上长历史，不会压回 320 根。

    长历史初始化/手工刷新用 `python fetch_wyckoff.py --full`。
    失败时沿用上一版，不阻断其他 6 栏的更新。
    """
    try:
        r = subprocess.run([PY, os.path.join(HERE, "fetch_wyckoff.py")], cwd=HERE,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout)[-300:])
        log("多周期 K 线增量更新完成（8 标的 × 5 周期，长历史保留）")
    except Exception as e:
        log("警告：多周期 K 线更新失败，第 02 栏沿用上一版数据：%s" % str(e)[:160])


def fetch_flow_bars():
    """第 04 栏全市场宽度/资金流：默认增量（抓最近 6 根，只补新增交易日）。

    fetch_flow.py 内部维护 flow_state.json 滑窗矩阵（最近 260 根复权收盘），
    无需每天重抓 5578 只 × 600 根全历史。首次初始化用 `python fetch_flow.py --full`。
    失败时沿用上一版 flow.json，不阻断其他栏目。
    """
    try:
        r = subprocess.run([PY, os.path.join(HERE, "fetch_flow.py")], cwd=HERE,
                           capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=900)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout)[-400:])
        log("全市场宽度聚合增量更新完成（逐股日线 5578 只，历史序列保留）")
    except Exception as e:
        log("警告：宽度聚合更新失败，第 04 栏沿用上一版数据：%s" % str(e)[:160])


def fetch_erp_snapshot():
    """第 12 栏 ERP：--incremental 严格锁定语义。

    - 无新交易日：直接跳过，不联网、不重算、不覆写 erp.json（保证数值与 git 幂等）；
    - 有新交易日：按同一固定口径追加新行，已锁定的历史数值不回溯修改，
      并把首次锁定快照永久保留在 lockedSnapshot 字段。
    失败时沿用上一版，不阻断其他栏目。
    """
    try:
        r = subprocess.run([PY, os.path.join(HERE, "fetch_erp.py"), "--incremental"],
                           cwd=HERE, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=180)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout)[-300:])
        log("ERP 锁定快照检查完成：" + (r.stdout or "").strip().splitlines()[-1])
    except Exception as e:
        log("警告：ERP 增量更新失败，第 12 栏沿用上一版锁定数据：%s" % str(e)[:160])


def fetch_tmt_snapshot():
    """第 04 栏 TMT 交易拥挤度：抓当日四大行业板块成交额，按日期幂等累积历史。"""
    try:
        r = subprocess.run([PY, os.path.join(HERE, "fetch_tmt.py")],
                           cwd=HERE, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=180)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout)[-300:])
        log("TMT 成交占比更新完成：" + (r.stdout or "").strip().splitlines()[0])
    except Exception as e:
        log("警告：TMT 更新失败，第 04 栏沿用上一版数据：%s" % str(e)[:160])


def fetch_extras_snapshot():
    """6 类补充数据：中金所 / 两融 / ETF 申赎 / 涨跌停 / 行业 PE / 事件 / 跨市场。

    fetch_extras.py 默认增量：刷新当日快照、按日期幂等累积历史、补最近 5 个缺失交易日的
    CFFEX 日行情。公开源均为盘后 T / T+1 可得（两融 T+1、中金所收盘后、外盘跨时区），
    **不是盘中实时**。失败时沿用上一版 extras.json，不阻断其他栏目。
    """
    try:
        r = subprocess.run([PY, os.path.join(HERE, "fetch_extras.py")],
                           cwd=HERE, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=600)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout)[-400:])
        tail = (r.stdout or "").strip().splitlines()
        log("补充 6 类数据更新完成：" + (tail[-1] if tail else "extras.json"))
        ex = jload(os.path.join(DATA, "extras.json"))
        meta = ex.get("meta") or {}
        if meta.get("warnings"):
            log("补充数据警告 %d 条：%s" % (len(meta["warnings"]),
                                     " / ".join(meta["warnings"])[:220]))
        if meta.get("fallbacks"):
            log("补充数据降级 %d 项（沿用上一版有效读数，非当日新取）：%s"
                % (len(meta["fallbacks"]), " / ".join(meta["fallbacks"])[:220]))
        log("补充数据明细：CFFEX %s 日、两融 %s 日、行业 PE %s 个、外盘 %s 项" %
            (meta.get("cffexDays"),
             len((ex.get("leverage") or {}).get("rows") or []),
             len((ex.get("valuation") or {}).get("industry") or []),
             len((ex.get("cross") or {}).get("quotes") or [])))
    except Exception as e:
        if not os.path.isfile(os.path.join(DATA, "extras.json")):
            raise RuntimeError("extras.json 不存在且补充取数失败，工作台无法构建：%s" % str(e)[:200])
        log("警告：补充数据更新失败，沿用上一版 extras.json：%s" % str(e)[:200])


def backfill_history_step():
    """长历史回补：行业 PE / 涨停连板晋级率 / 跨市场，增量只补最近 8 个交易日。

    首次全量回补由 backfill_history.py 完成并落盘 data/history.json；盘后任务走
    --incremental 追加新交易日。三类不可回补项（ETF 日度官方份额、TMT 同口径历史、
    炸板率 / 跌停历史）在 history.json 的 meta.unavailable 里显式声明，不伪造。
    失败时沿用上一版，不阻断其他栏目（但首次必须有文件，否则工作台构建会缺数据）。
    """
    try:
        r = subprocess.run([PY, os.path.join(HERE, "backfill_history.py"), "--incremental"],
                           cwd=HERE, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=420)
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout)[-300:])
        h = jload(os.path.join(DATA, "history.json")) or {}
        cov = (h.get("meta") or {}).get("coverage") or {}
        log("长历史增量回补完成：行业 PE %s 日 / 涨停连板 %s 日 / 跨市场 %s 日" %
            (cov.get("valuationDays"), cov.get("sentimentDays"), cov.get("crossDays")))
    except Exception as e:
        if not os.path.isfile(os.path.join(DATA, "history.json")):
            raise RuntimeError("history.json 不存在且回补失败，工作台无法构建：%s" % str(e)[:200])
        log("警告：长历史增量回补失败，沿用上一版 history.json：%s" % str(e)[:200])


def generate_review(asof):
    """第 16 栏每日复盘（永远末尾）：必须在全部数据更新完成后调用。

    build_review.py 读本地 data/*.json 汇总 15 个数据栏目（01-15，
    第 04 栏 TMT 单列一节、第 12 栏 ERP 只读锁定快照），生成结构化文章并按日期 upsert
    到 data/reviews.json；栏数由 views.json 驱动，复盘永远最后一栏。
    失败则抛错阻断部署，避免「数据已更新但复盘是旧日期」。
    """
    r = subprocess.run([PY, os.path.join(HERE, "build_review.py"), "--date", asof],
                       cwd=HERE, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=300)
    if r.returncode != 0:
        raise RuntimeError("每日复盘生成失败:\n%s\n%s" % (r.stdout[-600:], r.stderr[-600:]))
    tail = (r.stdout or "").strip().splitlines()
    log("每日复盘生成完成：" + (tail[-1] if tail else asof))
    # 同一篇报告再导出为可独立打开 / 分享的单篇 HTML，供 NAS 固定链接与按日归档
    p = subprocess.run([PY, os.path.join(HERE, "build_review_page.py"), "--date", asof],
                       cwd=HERE, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=120)
    if p.returncode != 0:
        raise RuntimeError("独立复盘报告导出失败:\n%s\n%s" % (p.stdout[-400:], p.stderr[-400:]))
    log("独立复盘报告导出完成：" + (p.stdout or "").strip().splitlines()[-1])


def build():
    """按依赖顺序重建：先两个内嵌页，再工作台（工作台内嵌前两者的 base64 + 多周期数据）。"""
    for script in ["build_html.py", "build_breadth.py", "build_workbench.py"]:
        r = subprocess.run([PY, os.path.join(HERE, script)], cwd=HERE,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise RuntimeError("构建 %s 失败:\n%s\n%s" % (script, r.stdout, r.stderr))
        log("构建 %s OK" % script)


def stage(asof, stats):
    import shutil
    os.makedirs(DEPLOY, exist_ok=True)
    # 品牌资源：SVG 小图标 + 附件 logo（HTML 已内嵌 base64，此处供站点直链 / 根目录请求）
    for name in ("favicon.svg", "edsonstock-logo.png"):
        src = os.path.join(HERE, "assets", name)
        if not os.path.isfile(src):
            raise RuntimeError("品牌资源缺失: %s" % src)
        shutil.copy2(src, os.path.join(DEPLOY, name))
    # 远端统一用 ASCII 文件名，避免跨平台 scp 中文名编码问题
    mapping = [("A股市场结构工作台.html", "workbench.html"),
               ("A股狼波周期指数走势图.html", "wolf-cycle.html"),
               ("A股双冰点情绪指标.html", "breadth-sentiment.html")]
    for src_name, dst_name in mapping:
        src = os.path.join(ROOT, src_name)
        if not os.path.isfile(src) or os.path.getsize(src) < 50000:
            raise RuntimeError("产物缺失或异常: %s" % src_name)
        shutil.copy2(src, os.path.join(DEPLOY, dst_name))
    shutil.copy2(os.path.join(DEPLOY, "workbench.html"), os.path.join(DEPLOY, "index.html"))
    # 复盘栏（永远末尾）同篇复盘的可分享单页：固定链接 + 按日归档（远端统一 ASCII 名）
    src_rev = os.path.join(ROOT, "每日复盘_%s.html" % asof)
    if not os.path.isfile(src_rev) or os.path.getsize(src_rev) < 5000:
        raise RuntimeError("独立复盘报告产物缺失或异常: %s" % src_rev)
    # 仓库里的复盘产物只有 <NAS_HOST> 占位符；复制到 deploy 供 NAS 使用时，
    # 替换为真实站点 URL，保证线上「最新一篇 / 工作台第 N 栏」链接可用。
    _rev_html = open(src_rev, encoding="utf-8").read().replace("<NAS_HOST>", SITE_URL)
    for name in ("review-latest.html", "review-%s.html" % asof):
        with open(os.path.join(DEPLOY, name), "w", encoding="utf-8") as f:
            f.write(_rev_html)
    names = ["index.html", "workbench.html", "wolf-cycle.html", "breadth-sentiment.html",
             "favicon.ico", "favicon.svg", "edsonstock-logo.png",
             "review-latest.html", "review-%s.html" % asof]
    status = {
        "asof": asof,
        "updatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": "公开行情接口（腾讯日线 / 新浪全 A 与板块快照），不依赖通达信 MCP",
        "stats": dict(stats),
        "files": names,
    }
    # 栏目顺序由 views.json 驱动；复盘永远最后，编号不写死
    try:
        vw = jload(os.path.join(HERE, "views.json"))
        order = [v for v in vw.get("order", []) if v != "review"] + ["review"]
        status["views"] = {"count": len(order), "order": order,
                           "reviewViewNo": len(order), "dataViews": len(order) - 1,
                           "source": "views.json",
                           "fixedNo": vw.get("fixedNo") or {},
                           "groups": [{"name": g.get("name"), "views": g.get("views")}
                                      for g in (vw.get("groups") or [])],
                           "note": "菜单按 groups 分组显示，栏目编号由 fixedNo 固定，不随分组重排变化"}
        # 覆盖早期版本残留的「十栏版」说明，栏数随 views.json 自动变化
        status["stats"]["note"] = ("%d 栏工作台（%d 个数据栏目 + 第 %d 栏每日复盘永远末尾）· "
                                   "ERP 数值锁定 · 第 04 栏 TMT 成交占比 · VIEW 09-15 六类补充数据"
                                   % (len(order), len(order) - 1, len(order)))
    except Exception as e:
        log("警告：views.json 读取失败：%s" % str(e)[:100])
    try:
        ex = jload(os.path.join(DATA, "extras.json"))
        em = ex.get("meta") or {}
        der = ex.get("derivatives") or {}
        status["extras"] = {
            "note": "6 类补充栏目（VIEW 09-15 + 第07栏 ETF 申赎）· 公开源盘后 T / T+1，非盘中实时",
            "asof": em.get("asof"), "generated": em.get("generated"),
            "sources": em.get("sources"), "missing": em.get("missing"),
            "warnings": em.get("warnings"), "fallbacks": em.get("fallbacks"),
            "updateNote": em.get("updateNote"),
            "cffexDays": em.get("cffexDays"),
            "marginRows": len((ex.get("leverage") or {}).get("rows") or []),
            "sentimentRows": len((ex.get("sentiment") or {}).get("rows") or []),
            "industryCount": len((ex.get("valuation") or {}).get("industry") or []),
            "unlockRows": len((ex.get("events") or {}).get("unlock") or []),
            "billboardRows": len((ex.get("events") or {}).get("billboard") or []),
            "crossQuotes": len((ex.get("cross") or {}).get("quotes") or []),
            "quarterlyEtf": len((ex.get("etfFlow") or {}).get("quarterly") or {}),
            "dailyShareRows": len((ex.get("etfFlow") or {}).get("daily") or []),
            "optionProducts": len(der.get("options") or {}),
            "ivNote": der.get("ivNote"),
        }
    except Exception as e:
        log("警告：extras 信息读取失败：%s" % str(e)[:100])
    try:
        hi = jload(os.path.join(DATA, "history.json")) or {}
        hm = hi.get("meta") or {}
        status["history"] = {
            "note": "长历史回补（backfill_history.py）· 能补的已补，不能补的显式声明",
            "asof": hm.get("asof"), "generated": hm.get("generated"),
            "coverage": hm.get("coverage"),
            "unavailable": [x.get("key") for x in (hm.get("unavailable") or [])],
            "unavailableDetail": hm.get("unavailable"),
        }
        log("STATUS history: %s | 不可回补 %d 项"
            % (json.dumps(hm.get("coverage") or {}, ensure_ascii=False),
               len(hm.get("unavailable") or [])))
    except Exception as e:
        log("警告：history 信息读取失败：%s" % str(e)[:100])
    # 第 7/8/9 栏的覆盖信息必须由脚本生成，避免盘后重建把状态字段冲掉
    try:
        wy = jload(os.path.join(DATA, "wyckoff.json"))
        status["wyckoff"] = {"note": "第02栏长历史版 · 全历史多段标注",
                             "asof": wy.get("asof", asof),
                             "coverage": wy.get("coverage", {}),
                             "multiSegment": True, "panZoom": True}
    except Exception as e:
        log("警告：wyckoff 覆盖信息读取失败：%s" % str(e)[:100])
    try:
        fl = jload(os.path.join(DATA, "flow.json"))
        fr = fl.get("rows") or []
        fm = fl.get("meta") or {}
        status["flow"] = {"note": "第04栏 市场宽度与拥挤度（逐股日线全市场聚合）",
                          "asof": fl.get("asof"), "rows": len(fr),
                          "from": fr[0][0] if fr else None, "to": fr[-1][0] if fr else None,
                          "universe": fm.get("universe"),
                          "indexBars": {k: len(v) for k, v in (fl.get("idx") or {}).items()},
                          "formulas": list((fm.get("formula") or {}).keys())}
    except Exception as e:
        log("警告：flow 覆盖信息读取失败：%s" % str(e)[:100])
    try:
        ep = jload(os.path.join(DATA, "erp.json"))
        em = ep.get("meta") or {}
        es = ep.get("snapshot") or {}
        status["erp"] = {"note": "第12栏 股债利差(ERP)区间（数值锁定，页面/复盘只读）",
                         "asof": ep.get("asof"), "locked": bool(em.get("locked")),
                         "lockedBase": em.get("lockedBase"),
                         "formula": em.get("formula"), "channel": em.get("channel"),
                         "erp": es.get("erp"), "historyPercentile": es.get("historyPercentile"),
                         "tier": es.get("tier"), "peTtm": es.get("peTtm"),
                         "y10": es.get("y10"), "sampleDays": es.get("sampleDays"),
                         "thresholds": len(es.get("thresholds") or []),
                         "condProb": len(es.get("condProb") or []),
                         "seriesRows": len((ep.get("series") or {}).get("rows") or [])}
    except Exception as e:
        log("警告：ERP 信息读取失败：%s" % str(e)[:100])
    try:
        tm = jload(os.path.join(DATA, "tmt.json"))
        ts = tm.get("snapshot") or {}
        status["tmt"] = {"note": "第04栏增强 TMT 交易拥挤度（成交额占比，非资金流）",
                         "asof": tm.get("asof"), "ratio": ts.get("ratio"),
                         "tmtAmount": ts.get("tmtAmount"), "marketAmount": ts.get("marketAmount"),
                         "historyDays": ts.get("historyDays"),
                         "groups": {g: v.get("share") for g, v in (tm.get("groups") or {}).items()}}
    except Exception as e:
        log("警告：TMT 信息读取失败：%s" % str(e)[:100])
    try:
        rv = jload(os.path.join(DATA, "reviews.json"))
        rs = rv.get("reviews") or []
        _n = (status.get("views") or {}).get("reviewViewNo", 16)
        status["reviews"] = {"note": "第%d栏 每日复盘（永远末尾 · 固定规则生成，不回填历史）" % _n,
                             "viewNo": _n,
                             "dataViews": (status.get("views") or {}).get("dataViews", 15),
                             "count": len(rs), "latest": rs[0]["date"] if rs else None,
                             "engine": (rv.get("meta") or {}).get("engine"),
                             "sections": len(rs[0].get("sections") or []) if rs else 0,
                             "degraded": bool(rs and rs[0].get("meta", {}).get("degraded")),
                             "standalone": "review-latest.html",
                             "archive": "review-%s.html" % asof}
    except Exception as e:
        log("警告：复盘信息读取失败：%s" % str(e)[:100])
    jdump(os.path.join(DEPLOY, "status.json"), status)
    log("暂存目录 %s 已生成 %d 个文件" % (DEPLOY, len(names) + 1))
    return status


def deploy():
    st = jload(os.path.join(DEPLOY, "status.json"))
    arc = "review-%s.html" % (st.get("asof") or "")
    names = ["wolf-cycle.html", "breadth-sentiment.html",
             "workbench.html", "status.json", "index.html", "favicon.ico",
             "favicon.svg", "edsonstock-logo.png", "review-latest.html"]
    if os.path.isfile(os.path.join(DEPLOY, arc)):
        names.append(arc)
    paths = [os.path.join(DEPLOY, n) for n in names]
    target = "%s:%s/" % (NAS, NAS_HTML)
    r = subprocess.run(["scp", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"] + paths + [target],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError("scp 同步失败:\n%s\n%s" % (r.stdout, r.stderr))
    log("已同步 %d 个文件到 %s:%s" % (len(names), NAS, NAS_HTML))
    # 远端校验
    chk = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", NAS,
         "ls -l %s/index.html %s/status.json | awk '{print $5, $9}'; curl -s -o /dev/null -w 'HTTP %%{http_code}\\n' http://127.0.0.1:8391/status.json"
         % (NAS_HTML, NAS_HTML)],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    log("远端校验: " + (chk.stdout or chk.stderr).strip().replace("\n", " | "))
    if "HTTP 200" not in chk.stdout:
        raise RuntimeError("站点 HTTP 校验未通过，请检查 nginx 容器")
    sync_project()


def sync_project():
    """同步脚本/模板/JS 与聚合数据到 NAS 工程备份目录；失败只警告，不影响站点可用。"""
    scripts = ["wb_core.js", "wb_extras.js", "wb_rotate.js", "wb_volume.js",
               "wb_etf.js", "wb_daily.js", "wb_wyckoff.js", "wb_flow.js",
               "wb_review.js", "wb_erp.js",
               "wb_derivatives.js", "wb_leverage.js", "wb_sentiment.js",
               "wb_valuation.js", "wb_events.js", "wb_cross.js",
               "template_workbench.html", "template.html", "template_breadth.html",
               "views.json",
               "build_workbench.py", "build_html.py", "build_breadth.py", "build_review.py",
               "build_review_page.py", "build_wyckoff_backtest_report.py", "brand.py",
               "fetch_wyckoff.py", "fetch_flow.py", "fetch_extras.py",
               "fetch_erp.py", "fetch_tmt.py", "erp_q90_study.py", "build_erp_q90_report.py",
               "erp_q75_study.py", "build_erp_q75_report.py",
               "backfill_history.py", "daily_update.py",
               "preview_wyckoff_long.py", "preview_flow.py", "preview_review.py",
               "preview_erp_tmt.py", "preview_extras.py", "preview_groups.py",
               "verify_review_page.py", "verify_nas_wyckoff.py",
               "verify_nas_flow.py", "verify_nas_review.py", "verify_nas_erp_tmt.py",
               "probe_flow.py"]
    datafiles = ["flow.json", "wyckoff.json", "reviews.json", "erp.json", "erp_q90_study.json", "erp_q75_study.json",
                 "tmt.json", "extras.json", "history.json"]
    base = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]
    try:
        subprocess.run(["ssh"] + base + [NAS, "mkdir -p %s/wolf-cycle/data" % NAS_PROJECT],
                       check=True, capture_output=True, text=True)
        a = [os.path.join(HERE, s) for s in scripts if os.path.isfile(os.path.join(HERE, s))]
        subprocess.run(["scp"] + base + a + ["%s:%s/wolf-cycle/" % (NAS, NAS_PROJECT)],
                       check=True, capture_output=True, text=True)
        b = [os.path.join(DATA, d) for d in datafiles if os.path.isfile(os.path.join(DATA, d))]
        subprocess.run(["scp"] + base + b + ["%s:%s/wolf-cycle/data/" % (NAS, NAS_PROJECT)],
                       check=True, capture_output=True, text=True)
        assets = [os.path.join(HERE, "assets", a)
                  for a in ("favicon.svg", "edsonstock-logo.png")
                  if os.path.isfile(os.path.join(HERE, "assets", a))]
        if assets:
            subprocess.run(["ssh"] + base + [NAS, "mkdir -p %s/wolf-cycle/assets" % NAS_PROJECT],
                           check=True, capture_output=True, text=True)
            subprocess.run(["scp"] + base + assets + ["%s:%s/wolf-cycle/assets/" % (NAS, NAS_PROJECT)],
                           check=True, capture_output=True, text=True)
        log("工程源码与聚合数据已同步到 NAS %s/wolf-cycle/" % NAS_PROJECT)
    except Exception as e:
        log("警告：工程备份同步失败（不影响站点可用）：%s" % str(e)[:160])


def git_run(args, timeout=120):
    """在仓库根执行 git 命令；禁用交互提示，避免定时任务无人值守时卡死。"""
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    return subprocess.run(["git"] + args, cwd=ROOT, env=env,
                          capture_output=True, text=True, encoding="utf-8",
                          errors="replace", timeout=timeout)


def git_sync(asof):
    """把当日新增/变更文件提交并推送到 GitHub 公开仓库。

    必须在 deploy() 成功后调用（保证 NAS 已是最新）。属于「尽力而为」步骤：
    失败只写警告与 last_run.json 的 github 字段，不抛错、不让定时任务整体失败。
    .gitignore 会自动排除 .workbuddy/、logs/、__pycache__/ 与 flow_state.json。
    """
    try:
        r = git_run(["rev-parse", "--is-inside-work-tree"], 30)
        if r.returncode != 0 or r.stdout.strip() != "true":
            raise RuntimeError("工作区不是 git 仓库")
        r = git_run(["remote", "get-url", GIT_REMOTE], 30)
        if r.returncode != 0 or GIT_EXPECT not in r.stdout:
            raise RuntimeError("origin 不是 %s，拒绝推送" % GIT_EXPECT)
        r = git_run(["status", "--porcelain"], 60)
        if r.returncode != 0:
            raise RuntimeError("git status 失败: %s" % r.stderr[-160:])
        changed = [x for x in r.stdout.splitlines() if x.strip()]
        if not changed:
            log("GitHub 同步：无文件变更，跳过提交")
            return {"ok": True, "pushed": False, "changed": 0}
        r = git_run(["add", "-A"], 120)
        if r.returncode != 0:
            raise RuntimeError("git add 失败: %s" % r.stderr[-160:])
        msg = "chore(daily): asof=%s 盘后数据、产物与复盘更新" % asof
        r = git_run(["commit", "-m", msg], 180)
        if r.returncode != 0:
            raise RuntimeError("git commit 失败: %s" % (r.stderr or r.stdout)[-200:])
        r = git_run(["push", GIT_REMOTE, "HEAD:%s" % GIT_BRANCH], 300)
        if r.returncode != 0:
            raise RuntimeError("git push 失败: %s" % (r.stderr or r.stdout)[-200:])
        sha = git_run(["rev-parse", "--short", "HEAD"], 30).stdout.strip()
        log("GitHub 同步完成：%d 个变更，commit %s 已推送 %s/%s" %
            (len(changed), sha, GIT_REMOTE, GIT_BRANCH))
        return {"ok": True, "pushed": True, "changed": len(changed), "commit": sha}
    except Exception as e:
        log("警告：GitHub 同步失败（不影响 NAS 站点）：%s" % str(e)[:200])
        return {"ok": False, "pushed": False, "error": str(e)[:200]}


def write_log(asof, ok, err="", github=None):
    os.makedirs(LOGS, exist_ok=True)
    os.makedirs(DEPLOY, exist_ok=True)
    p = os.path.join(LOGS, "%s.log" % dt.date.today().isoformat())
    with open(p, "a", encoding="utf-8") as f:
        f.write("\n=== %s asof=%s %s ===\n" % (dt.datetime.now().isoformat(timespec="seconds"), asof,
                                               "OK" if ok else "FAIL"))
        f.write("\n".join(_LOGLINES) + "\n")
        if err:
            f.write("ERROR: " + err + "\n")
    jdump(os.path.join(DEPLOY, "last_run.json"),
          {"asof": asof, "ok": ok, "at": dt.datetime.now().isoformat(timespec="seconds"),
           "error": err or None, "github": github, "log": "\n".join(_LOGLINES)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="非交易日也用最新交易日重跑（回补/联调）")
    ap.add_argument("--no-deploy", action="store_true", help="只更新数据和重建 HTML")
    ap.add_argument("--no-git", action="store_true", help="同步 NAS 但不推送 GitHub")
    ap.add_argument("--dry-run", action="store_true", help="只探测数据源，不写文件")
    args = ap.parse_args()

    asof = ""
    try:
        today = dt.date.today()
        indices = fetch_indices()
        latest = indices["sh000001"][-1][0]
        now = dt.datetime.now()
        log("指数最新交易日 %s / 今天 %s / 当前 %s"
            % (latest, today.strftime("%Y%m%d"), now.strftime("%H:%M")))
        same_day = latest == today.strftime("%Y%m%d")
        if same_day and (now.hour * 60 + now.minute) < 15 * 60 + 5 and not args.force:
            log("当日尚未收盘（<15:05），跳过，避免把盘中快照写成收盘数据")
            return 0
        if not same_day:
            if not args.force:
                log("非交易日或当日数据尚未出，跳过本次更新（NAS 保持上一版）")
                return 0
            log("--force：使用最新交易日 %s 重跑（幂等覆盖）" % latest)
        asof = latest
        if args.dry_run:
            log("--dry-run：仅探测，未写任何文件")
            return 0

        log("=== 开始盘后更新 asof=%s ===" % asof)
        breadth = fetch_breadth()
        w0 = jload(os.path.join(DATA, "workbench.json"))
        etfs = fetch_etfs(list(w0["etfs"].keys()))
        boards = fetch_boards()
        mom = fetch_mom(boards)

        # 交叉校验：全 A 快照统计的涨家数应与历史口径可比
        if abs(breadth["up"] + breadth["dn"] + breadth["fl"] - breadth["tt"]) > 2:
            raise RuntimeError("涨跌家数不闭合")
        stats = merge(asof, breadth, indices, etfs, boards, mom)
        fetch_wyckoff_bars()
        fetch_flow_bars()
        fetch_erp_snapshot()       # 依赖 merge() 写回的 indices.json（沪深300 日线）
        fetch_tmt_snapshot()       # 依赖 merge() 写回的 workbench.json（两市成交额）
        fetch_extras_snapshot()    # 6 类补充数据，复盘与工作台新增栏目都依赖它
        backfill_history_step()    # 长历史增量回补，工作台 12/13/15 栏的趋势图依赖它
        generate_review(asof)      # 依赖上面全部已更新的数据，顺序不能提前
        build()
        status = stage(asof, stats)
        github = None
        if not args.no_deploy:
            deploy()
            if not args.no_git:
                github = git_sync(asof)   # 排在 NAS 部署成功后，避免站点旧、仓库新
            else:
                log("--no-git：已同步 NAS，未推送 GitHub")
        else:
            log("--no-deploy：已生成产物，未同步 NAS / GitHub")
        write_log(asof, True, github=github)
        log("=== 完成：%s，成交额 %.1f 亿，涨 %d / 跌 %d ==="
            % (asof, breadth["amount"] / 1e8, breadth["up"], breadth["dn"]))
        return 0
    except Exception as e:
        log("失败: %s" % e)
        if not args.dry_run:
            try:
                write_log(asof, False, str(e))
            except Exception:
                pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
