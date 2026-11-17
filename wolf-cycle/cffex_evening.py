#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""CFFEX 衍生品日行情 · 傍晚补齐（17:20 定时任务专用，正常不传参数）。

背景
----
daily_update.py 16:00 跑盘后全流程时，中金所当日日行情 XML 常尚未发布，
于是 extras.json 出现「当日 CFFEX 日行情未取到，衍生品快照留空」警告，
第 09 栏与复盘里的基差/PCR 只能用上一交易日读数。本脚本在 17 点后单独
重取当日（及最近 5 个缺失交易日）的中金所日行情与会员持仓排名，幂等补进
data/extras.json 的 derivatives 段，然后重算当日复盘、重建工作台与单篇报告、
同步 NAS 并推送 GitHub。

严格边界（与盘后主任务一致）
----------------------------
1. 交易日判断同主任务：腾讯 sh000001 日线最新日期 == 今天；且 workbench.json
   末日 == 今天（确认 16:00 主任务已跑完），否则跳过，不写任何数据。
2. 只改 extras.json 的 derivatives 与 meta 里 CFFEX 相关的警告 / 时间 / cffexDays；
   leverage / etfFlow / sentiment / valuation / events / cross 六类当日快照、
   ERP / TMT 锁定数值、workbench / flow / wyckoff / history 一律不碰。
   复盘由 build_review.py 按同一日期 upsert 重算，只读锁定快照，不回填历史。
3. 当日日行情仍取不到：只记警告、正常退出，不重建、不部署、不提交，
   NAS 与 GitHub 保留 16:00 版本（允许的降级，不编造数据）。
4. 当日已补齐且快照非空：幂等跳过。
5. 任一后续步骤失败：非零退出、回滚 extras.json、不部署；status.json 仍由
   stage() 生成，不手工改写；不传 --force，不重跑 daily_update.py 全流程。

用法
----
  python cffex_evening.py              # 定时任务：判断 → 补齐 → 重建 → 部署 → 提交
  python cffex_evening.py --dry-run    # 只探测当日 CFFEX 是否可取，不写文件不部署
"""
import argparse
import datetime as dt
import json
import os
import subprocess

import daily_update as du
import fetch_extras as fe

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
EXTRAS = os.path.join(DATA, "extras.json")
WORKBENCH = os.path.join(DATA, "workbench.json")
STATUS = os.path.join(du.DEPLOY, "status.json")
LOGS = os.path.join(HERE, "logs")

# 与 fetch_extras.py 的 futuresFields / optionsFields 完全一致，避免列错位
FUT_FIELDS = ("close", "spot", "basis", "ann", "oi", "vol", "totalOI", "farClose",
              "spread", "days", "near", "secondClose", "ann2", "days2", "second")
OPT_FIELDS = ("cv", "pv", "co", "po", "pcrV", "pcrOI", "nC", "nP")

_LINES = []


def log(msg):
    line = "[%s] %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg)
    print(line, flush=True)
    _LINES.append(line)


def write_log(asof, ok, err="", github=None):
    os.makedirs(LOGS, exist_ok=True)
    p = os.path.join(LOGS, "cffex_%s.log" % (asof or dt.date.today().isoformat()))
    lines = _LINES + [x for x in du._LOGLINES if x not in _LINES]
    with open(p, "a", encoding="utf-8") as f:
        f.write("\n=== %s asof=%s %s ===\n" %
                (dt.datetime.now().isoformat(timespec="seconds"), asof, "OK" if ok else "FAIL"))
        f.write("\n".join(lines) + "\n")
        if github is not None:
            f.write("GITHUB: " + json.dumps(github, ensure_ascii=False) + "\n")
        if err:
            f.write("ERROR: " + err + "\n")
    # logs/ 已在 .gitignore 中排除，不入库


def resolve_asof():
    """交易日 + 主任务已完成，双重判断；失败一律跳过而不是写脏数据。"""
    try:
        idx = du.fetch_indices()
    except Exception as e:
        log("交易日判断失败（跳过，不写任何数据）：%s" % str(e)[:160])
        return ""
    latest = idx["sh000001"][-1][0]
    today = dt.date.today().strftime("%Y%m%d")
    log("指数最新交易日 %s / 今天 %s / 当前 %s" %
        (latest, today, dt.datetime.now().strftime("%H:%M")))
    if latest != today:
        log("非交易日或当日指数尚未出，跳过（NAS 保留 16:00 版本）")
        return ""
    try:
        rows = (du.jload(WORKBENCH) or {}).get("market") or []
    except Exception as e:
        log("workbench.json 读取失败（跳过）：%s" % str(e)[:120])
        return ""
    if not rows or rows[-1][0] != today:
        log("主盘后任务尚未写入 %s，跳过（避免半成品数据）" % today)
        return ""
    return today


def fetch_spot(asof):
    """现货指数收盘价：复用主任务 tx_kline（腾讯双域名 + 新浪日线降级）。

    fetch_extras.py 自带的 fetch_spot 用固定日期区间 + qfq 参数，实测 2026-11-16
    返回 0 根，会导致 parse_cffex_day 算不出基差 / 年化。这里改用与主任务
    同源同口径的日线通道，4 个现货指数各取最近 260 根。
    """
    spot = {}
    for code in fe.SPOT_CODES:
        try:
            rows = du.tx_kline(code, 260, allow_sina=True)
        except Exception as e:
            log("  现货 %s 日线失败：%s" % (code, str(e)[:100]))
            rows = []
        for r in rows:
            try:
                spot.setdefault(r[0].replace("-", ""), {})[code] = float(r[2])
            except (ValueError, IndexError, TypeError):
                continue
        log("  现货 %s %d 根" % (code, len(rows)))
    today_spot = spot.get(asof, {})
    if not today_spot:
        raise RuntimeError("当日 4 个现货指数收盘价全部缺失，基差无法计算；本次不写数据、不部署")
    log("  当日现货收盘：%s" % json.dumps(today_spot, ensure_ascii=False))
    return spot


def refresh(asof, dry_run=False):
    """只补 CFFEX 段。返回 filled / skip / unavailable / dry。"""
    old = fe.jload(EXTRAS, {})
    if not old:
        raise RuntimeError("extras.json 缺失或损坏")
    der = old.get("derivatives") or {}
    dates = fe.trade_dates(200)
    if not dates or dates[-1] != asof:
        raise RuntimeError("交易日历末日与 asof 不一致：%s / %s" %
                           (dates[-1] if dates else "空", asof))
    have = set(der.get("dates") or [])
    want = dates[-5:]
    todo = [d for d in want if d not in have]
    snap_empty = not (der.get("snapshot") or {})
    log("CFFEX 已有 %d 日（末日 %s）| 待补 %s | 当日快照 %s" %
        (len(have), max(have) if have else "-", ",".join(todo) or "无",
         "空" if snap_empty else "已有"))
    if not todo and not snap_empty:
        log("当日 CFFEX 日行情已补齐且快照非空，跳过（幂等）")
        return "skip"

    spot = fetch_spot(asof)
    raw_by_date = fe.fetch_cffex_history(todo) if todo else {}
    # 当日单独再取一次：todo 可能不含当日（dates 已有但快照为空的情形）
    raw_today = raw_by_date.get(asof) or fe.curl(fe.cffex_daily_url(asof), retries=3, timeout=25)
    today_parsed = fe.parse_cffex_day(raw_today, asof, spot)

    if dry_run:
        if today_parsed:
            fr, op, _ = today_parsed
            rec = fr.get("IF") or {}
            log("--dry-run：当日 XML 可取，期货 %d 品种 / 期权 %d 品种；"
                "IF 基差 %s 点 / 次月年化 %s%%；未写任何文件" %
                (len(fr), len(op), rec.get("basis"), rec.get("ann2")))
        else:
            log("--dry-run：当日 XML 仍不可取（未发布或接口失败）；未写任何文件")
        return "dry"

    if not today_parsed:
        log("警告：17 点后中金所当日日行情仍未发布或未取到；"
            "本次不写数据、不重建、不部署，NAS 保留 16:00 版本")
        return "unavailable"

    missing = [d for d in todo if "<dailydata>" not in (raw_by_date.get(d) or "")]
    fseries = {p: list(v) for p, v in (der.get("futures") or {}).items()}
    oseries = {p: list(v) for p, v in (der.get("options") or {}).items()}
    for p in fe.FUT_SPOT:
        fseries.setdefault(p, [])
    for p in fe.OPT_UNDER:
        oseries.setdefault(p, [])
    dlist = list(der.get("dates") or [])
    before_days = len(dlist)
    filled = []
    for d in todo:
        parsed = fe.parse_cffex_day(raw_by_date.get(d, ""), d, spot)
        if not parsed:
            continue
        fr, op, _ = parsed
        if d not in dlist:
            dlist.append(d)
        filled.append(d)
        # 按日期覆盖，保证同一交易日重跑只留一行，不重复追加
        for p in fe.FUT_SPOT:
            fseries[p] = [r for r in fseries[p] if r[0] != d]
            fseries[p].append([d] + [(fr.get(p) or {}).get(k) for k in FUT_FIELDS])
        for p in fe.OPT_UNDER:
            o = op.get(p, {}) or {}
            oseries[p] = [r for r in oseries[p] if r[0] != d]
            oseries[p].append([d] + [o.get(k) for k in OPT_FIELDS])
    dlist = sorted(set(dlist))
    for p in fseries:
        fseries[p].sort(key=lambda r: r[0])
    for p in oseries:
        oseries[p].sort(key=lambda r: r[0])

    rank_new = fe.fetch_cffex_rank(asof)
    rank_ok = bool(rank_new) and any((v.get("buy") or v.get("sell")) for v in rank_new.values())
    rank = rank_new if rank_ok else (der.get("rank") or {})

    fr, op, delta = today_parsed
    contracts = {p: {"spot": fe.FUT_SPOT[p],
                     "rows": (fr.get(p) or {}).get("contracts", []),
                     **{k: v for k, v in (fr.get(p) or {}).items() if k != "contracts"}}
                 for p in fe.FUT_SPOT if p in fr}
    optsnap = {p: dict(v, underlying=fe.OPT_UNDER[p]) for p, v in op.items()}

    meta = old.get("meta") or {}
    # 只清理与 CFFEX 相关的旧警告，其它 6 类补充数据的警告原样保留
    keep = [w for w in (meta.get("warnings") or [])
            if not any(k in w for k in ("CFFEX", "中金所", "衍生品快照"))]
    warns = list(keep)
    if missing:
        warns.append("CFFEX 日行情仍缺 %d 个交易日（%s），图中留空不插值" %
                     (len(missing), ",".join(missing)))
    if not rank_ok:
        warns.append("中金所会员持仓排名本次未取到，沿用上一版前 20 席位排名")
    meta["warnings"] = warns
    meta["generated"] = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    meta["cffexDays"] = len(dlist)

    new_der = dict(der)
    new_der.update({"dates": dlist, "futures": fseries, "options": oseries,
                    "snapshot": contracts, "optionSnapshot": optsnap,
                    "delta": delta, "rank": rank})
    old["derivatives"] = new_der
    old["meta"] = meta
    du.jdump(EXTRAS, old)          # daily_update.jdump 自带 tmp + os.replace 原子写
    log("extras.json 已幂等补齐：写入 %d 日（%s），cffexDays %d → %d；"
        "其余 6 类补充数据与 ERP/TMT 锁定值未改动" %
        (len(filled), ",".join(filled) or "-", before_days, len(dlist)))
    return "filled"


def sync_self():
    """把本脚本加入 NAS 工程备份（sync_project 的清单是主任务硬编码的，不含新脚本）。"""
    try:
        subprocess.run(["scp", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10",
                        os.path.join(HERE, "cffex_evening.py"),
                        "%s:%s/wolf-cycle/" % (du.NAS, du.NAS_PROJECT)],
                       check=True, capture_output=True, text=True, timeout=60)
        log("cffex_evening.py 已同步到 NAS 工程备份")
    except Exception as e:
        log("警告：脚本自身备份同步失败（不影响站点）：%s" % str(e)[:120])


def rebuild_and_deploy(asof):
    """复盘 → 单篇 → 三页重建 → stage → NAS 部署 → GitHub，顺序与主任务一致。"""
    du.generate_review(asof)       # 按同日 upsert 重算，只读 ERP/TMT 锁定快照
    du.build()                     # build_html → build_breadth → build_workbench
    st = du.jload(STATUS)
    if st.get("asof") != asof or not st.get("stats"):
        raise RuntimeError("status.json 非本交易日或缺少 stats，拒绝部署（避免覆盖 16:00 统计）")
    du.stage(asof, st["stats"])    # stats 沿用 16:00 当日全市场统计，本任务不重新统计
    du.deploy()                    # scp 10 文件 + HTTP 200 校验 + 工程/数据同步
    sync_self()
    return du.git_sync(asof)       # 尽力而为：失败只警告，不影响 NAS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="只探测当日 CFFEX 是否可取，不写文件、不重建、不部署")
    args = ap.parse_args()
    asof = ""
    backup = None
    try:
        asof = resolve_asof()
        if not asof:
            write_log("", True)
            return 0
        log("=== CFFEX 傍晚补齐 asof=%s ===" % asof)
        if args.dry_run:
            refresh(asof, dry_run=True)
            write_log(asof, True)
            return 0
        with open(EXTRAS, encoding="utf-8") as f:
            backup = f.read()
        result = refresh(asof)
        if result in ("skip", "unavailable"):
            write_log(asof, True)
            return 0
        github = rebuild_and_deploy(asof)
        log("=== 完成：%s 中金所日行情已补齐，复盘/单篇/工作台已重建并同步 NAS + GitHub ===" % asof)
        write_log(asof, True, github=github)
        return 0
    except Exception as e:
        log("失败：%s" % e)
        if backup is not None:
            try:
                with open(EXTRAS, "w", encoding="utf-8") as f:
                    f.write(backup)
                log("已回滚 extras.json 到本次运行前版本（NAS 未部署，保持 16:00 版本）")
            except Exception as e2:
                log("警告：回滚失败，请人工检查 extras.json：%s" % str(e2)[:120])
        write_log(asof, False, str(e))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
