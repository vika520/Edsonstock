#!/usr/bin/env python
"""散户反向指数（宝妈指数 / Mom Index）· A 股工作台版。

参考 https://github.com/mihang123/mom-index 的 v0.1 公开框架（MIT）：
  四板块独立计算，指数 = 小白占比×40% + 小白强度×25% + 情绪极端度×20% + 信号纯度×15%
  另有买入/卖出子指数与买卖比。

⚠ 数据源差异（必须披露）
------------------------
参考仓库 data/ 是「脱敏合成演示数据」（最新 2026-01-15、7 条），**不可作为数据源**。
本实现复刻其词库与权重，但用**东财股吧公开帖子标题**（guba.eastmoney.com，4 个
主题 ETF 吧）真实采集，逐日累积。帖子列表只有最新几页 → **历史不可回补**，
从首次运行日起累积，绝不伪造回填。小红书口径本仓库无稳定公开源，未接入。

口径
----
  板块：纳斯达克(of159941) / 黄金(of518880) / CPO通信(of515880) / 半导体(of512480)
  帖子：抓第 1~2 页，按发帖时间过滤「当天」；只存标题（不存作者/用户ID，符合数据安全）
  垃圾帖过滤：签到/打卡/金条/广告
  反向含义：指数越高 = 小白讨论越集中、情绪越极端 = 市场越危险（擦鞋童时刻）
  ⚠ 研究性观察指标，非交易指令；关键词规则 v0.1 为可读基线，未经充分实证验证

用法
----
  python fetch_mom.py --incremental   # 每日盘后（幂等按日期覆盖）
  python fetch_mom.py --backfill 10   # 无历史源，仅用于从当前页多抓几页（不伪造历史日期）
"""
import argparse
import datetime as dt
import html as html_mod
import json
import os
import re
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT = os.path.join(DATA, "mom.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

SECTORS = {
    "nasdaq": {"name": "纳斯达克", "code": "of159941", "etf": "513100"},
    "gold": {"name": "黄金", "code": "of518880", "etf": "518880"},
    "cpo": {"name": "CPO通信", "code": "of515880", "etf": "515880"},
    "semiconductor": {"name": "半导体", "code": "of512480", "etf": "512480"},
}

# ---- 信号词库（复刻 mom-index v0.1 analyzer/llm_analyzer.py）----
NEWBIE_SIGNALS = [
    ("身份自述", 8, ["小白", "新手", "新人", "刚入", "第一次", "菜鸟", "萌新", "宝妈", "全职妈妈", "学生党"]),
    ("知识求助", 6, ["不懂", "请教", "各位大哥", "大佬", "请问", "有没有人", "谁知道", "求助", "怎么买", "在哪看", "什么意思"]),
    ("决策依赖", 7, ["该不该", "要不要", "能不能", "可以吗", "行不行", "靠谱吗", "还能上车吗", "现在入手", "还会涨吗", "还会跌吗"]),
    ("情绪恐慌", 5, ["好慌", "救命", "完了", "哭了", "怕了", "吓死", "心态崩", "太惨", "亏死了", "割肉", "后悔", "早知道"]),
    ("跟风行为", 6, ["跟着买的", "别人推荐", "博主说", "听说", "朋友说", "同事买", "群里说", "都在买"]),
    ("过度乐观", 4, ["冲", "梭哈", "稳赚", "必涨", "躺赚", "满仓干", "起飞", "暴富"]),
    ("短期思维", 3, ["明天涨", "今天跌", "后天走势", "今天买"]),
]
PRO_SIGNALS = [
    ("专业术语", -5, ["PE", "PB", "ROE", "溢价率", "折价", "估值", "基本面", "技术面", "MACD", "KDJ", "ETF", "联接", "LOF"]),
    ("策略思维", -4, ["定投", "仓位", "分散", "对冲", "止损", "止盈", "网格", "轮动", "资产配置"]),
    ("数据引用", -4, ["季报", "年报", "GDP", "CPI", "非农", "美联储", "加息", "降息", "收益率", "年化"]),
    ("风险意识", -3, ["仅供参考", "不构成建议", "个人观点", "理性投资", "风险自担", "谨慎"]),
    ("长期视角", -3, ["长期持有", "定投计划", "年度", "养老", "十年"]),
    ("冷静表达", -2, ["分析", "观点", "看法", "逻辑", "原因在于"]),
]
BUY_KEYWORDS = [
    "上车", "冲", "梭哈", "all in", "满仓", "抄底", "加仓", "买入", "买了", "入手", "已入",
    "追", "杀入", "建仓", "补仓", "定投", "已上车", "还能买吗", "还能上车吗", "可以买吗",
    "能不能买", "要不要入", "想买", "想入", "心动", "看着眼馋", "忍不住", "后悔没买",
    "错过", "买少了", "早知道就买了", "再不买",
]
SELL_KEYWORDS = [
    "割肉", "止损", "清仓", "减仓", "出货", "卖了", "出了", "跑了", "走人", "不玩了",
    "离场", "下车", "赎回", "要不要割", "要不要走", "该不该卖", "还能留吗", "要不要清",
    "想卖", "想走", "想割", "想跑", "亏了", "亏麻了", "亏惨了", "深套", "套牢",
    "后悔买了", "被套", "跌麻了", "跌惨了", "血亏", "亏死", "跌死", "跌崩",
]
GREED_WORDS = ["冲", "梭哈", "稳赚", "必涨", "躺赚", "满仓", "抄底", "起飞", "暴涨", "翻倍", "赚了", "盈利"]
FEAR_WORDS = ["割肉", "止损", "亏", "跌惨", "暴跌", "崩盘", "完了", "套牢", "深套", "亏了", "赔了", "大跌"]
SPAM_PATTERNS = ["我是冲着金条来的", "金条来的，你呢", "领金条", "签到", "打卡", "广告"]


def log(msg):
    print("[%s] %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def curl(url, retries=3, timeout=22):
    for i in range(retries):
        r = subprocess.run(["curl", "-s", "-m", str(timeout), "-A", UA,
                            "-H", "Referer: https://guba.eastmoney.com/", url],
                           capture_output=True, timeout=timeout + 10)
        if r.returncode == 0 and r.stdout:
            return r.stdout.decode("utf-8", errors="ignore")
        time.sleep(0.5 * (i + 1))
    return None


def fetch_board(code, pages=2):
    """采集股吧帖子：返回 [{title, date}]，只保留标题与发帖时间（不含作者/ID）。"""
    out, seen = [], set()
    for pg in range(1, pages + 1):
        url = ("https://guba.eastmoney.com/list,%s.html" % code) if pg == 1 else \
              ("https://guba.eastmoney.com/list,%s_%d.html" % (code, pg))
        s = curl(url)
        if not s:
            continue
        # 标题 + 时间，按 articleh 块切分保证对齐
        blocks = re.findall(r'<div class="articleh normal_post">(.*?)</div>', s, re.S)
        if not blocks:
            blocks = re.findall(r'<div class="articleh[^"]*">(.*?)</div>', s, re.S)
        for blk in blocks:
            m_t = re.search(r'href="(/news,[^"]*)"[^>]*title="([^"]*)"', blk)
            m_d = re.search(r'<span class="l5">(.*?)</span>', blk, re.S)
            if not m_t:
                continue
            title = html_mod.unescape(m_t.group(2)).strip()
            if not title or title in ("点击开始搜索", "最后更新"):
                continue
            dstr = re.sub(r"<[^>]+>", "", m_d.group(1)).strip() if m_d else ""
            key = title
            if key in seen:
                continue
            seen.add(key)
            out.append({"title": title[:80], "date": dstr})
        time.sleep(0.4)
    return out


def analyze_post(title):
    """复刻 llm_analyzer.analyze_post：返回 (newbie_score, sentiment, intent, level, signals)。"""
    text = title
    if any(w in text for w in SPAM_PATTERNS):
        return {"spam": True, "score": 0, "sentiment": 0, "intent": "neutral",
                "level": "垃圾帖", "signals": []}
    matched_n, matched_p = [], []
    for name, w, kws in NEWBIE_SIGNALS:
        hit = [k for k in kws if k.lower() in text.lower()]
        if hit:
            matched_n.append((name, w, hit))
    for name, w, kws in PRO_SIGNALS:
        hit = [k for k in kws if k.lower() in text.lower()]
        if hit:
            matched_p.append((name, w, hit))
    extra = 0
    if len(title) < 12 and any(k in title for k in ("涨", "跌", "买", "卖")):
        extra += 3
    if title.endswith(("吗", "呢", "？")):
        extra += 2
    total_n = sum(w for _, w, _ in matched_n) + extra
    total_p = abs(sum(w for _, w, _ in matched_p))
    score = max(0, min(100, (total_n - total_p * 0.8) * 4 + 10))
    if score >= 50:
        level = "纯小白"
    elif score >= 35:
        level = "偏小白"
    elif score >= 20:
        level = "中间派"
    elif score >= 10:
        level = "偏专业"
    else:
        level = "专业投资者"
    greed = sum(1 for w in GREED_WORDS if w in text)
    fear = sum(1 for w in FEAR_WORDS if w in text)
    sentiment = round((greed - fear) / (greed + fear), 2) if (greed + fear) else 0.0
    bc = sum(1 for k in BUY_KEYWORDS if k in text)
    sc = sum(1 for k in SELL_KEYWORDS if k in text)
    if bc > sc:
        intent = "buy"
    elif sc > bc:
        intent = "sell"
    else:
        intent = "neutral"
    strength = min(1.0, max(bc, sc) / 5)
    signals = [n for n, _, _ in matched_n[:3]] + [n for n, _, _ in matched_p[:2]]
    return {"spam": False, "score": score, "sentiment": sentiment,
            "intent": intent, "strength": strength, "level": level,
            "signals": signals}


def compute_sector(posts):
    """复刻 index_calculator.compute_sector_index（0-100 综合 + 买卖子指数）。"""
    analyzed = [(p, analyze_post(p["title"])) for p in posts]
    valid = [(p, a) for p, a in analyzed if not a["spam"]]
    spam = len(analyzed) - len(valid)
    newbie = [(p, a) for p, a in valid if a["score"] >= 20]
    pure = [(p, a) for p, a in newbie if a["score"] >= 50]
    n_new, n_valid = len(newbie), len(valid)
    ratio = 100 * n_new / n_valid if n_valid else 0
    avg_score = sum(a["score"] for _, a in newbie) / max(n_new, 1)
    avg_sent = 100 * sum(abs(a["sentiment"]) for _, a in newbie) / max(n_new, 1)
    purity = 100 * len(pure) / max(n_new, 1) if n_new else 0
    activity = min(100, n_valid / 80 * 100)
    index = round(min(100, ratio * 0.40 + avg_score * 0.25 + avg_sent * 0.20 + purity * 0.15), 1)
    nb = [(p, a) for p, a in newbie if a["intent"] == "buy"]
    ns = [(p, a) for p, a in newbie if a["intent"] == "sell"]
    br = len(nb) / max(n_new, 1)
    sr = len(ns) / max(n_new, 1)
    bi = sum(a["strength"] for _, a in nb) / max(len(nb), 1)
    si = sum(a["strength"] for _, a in ns) / max(len(ns), 1)
    buy_idx = round(min(100, br * 100 * .5 + (avg_score / 100) * br * 30 * .3 + bi * 100 * .2), 1)
    sell_idx = round(min(100, sr * 100 * .5 + (avg_score / 100) * sr * 30 * .3 + si * 100 * .2), 1)
    top = sorted(newbie, key=lambda x: -x[1]["score"])[:5]
    return {
        "index": index,
        "interpretation": interpret(index),
        "details": {
            "totalPosts": len(analyzed), "validPosts": n_valid, "spamPosts": spam,
            "newbiePosts": n_new, "pureNewbie": len(pure),
            "newbieRatio": round(ratio, 1), "avgNewbieScore": round(avg_score, 1),
            "avgSentiment": round(avg_sent, 1), "puritySignal": round(purity, 1),
            "activity": round(activity, 1),
            "momBuyIndex": buy_idx, "momSellIndex": sell_idx,
            "buySellRatio": round(len(nb) / max(len(ns), 1), 2),
            "buyCount": len(nb), "sellCount": len(ns),
        },
        "topPosts": [{"title": p["title"], "score": round(a["score"], 1),
                      "level": a["level"], "intent": a["intent"],
                      "signals": a["signals"][:2]} for p, a in top],
    }


def interpret(v):
    if v >= 75:
        return "极度狂热：小白情绪爆表，擦鞋童时刻"
    if v >= 60:
        return "高度警惕：小白大量涌入，情绪过热"
    if v >= 40:
        return "开始升温：小白活跃度上升"
    if v >= 20:
        return "正常区间：小白参与度适中"
    return "极度冷清：小白沉默，可能接近底部"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--incremental", action="store_true")
    ap.add_argument("--backfill", type=int, default=0,
                    help="仅多抓几页（不伪造历史日期）；帖子列表无历史归档，不可回补")
    a = ap.parse_args()

    today = dt.date.today().strftime("%Y%m%d")
    date_h = dt.date.today().strftime("%Y-%m-%d")
    log("散户反向指数采集 %s（东财股吧真实帖子，词库/权重参考 mom-index v0.1）" % date_h)

    sectors = {}
    for key, cfg in SECTORS.items():
        posts = fetch_board(cfg["code"], pages=(2 if a.backfill <= 1 else min(4, a.backfill)))
        # 只保留当天帖子（发帖时间形如 11-23 21:15）；无时间标记的保留
        md = "%02d-%02d" % (dt.date.today().month, dt.date.today().day)
        todays = [p for p in posts if (not p["date"] or p["date"].startswith(md))]
        if len(todays) < 15:
            todays = posts[:80]  # 兜底：帖子时间字段缺失比例高时取最新一页
        r = compute_sector(todays)
        r["name"] = cfg["name"]
        r["etf"] = cfg["etf"]
        r["postsUsed"] = len(todays)
        sectors[key] = r
        log("  %s：%d 条帖子 → 指数 %s（%s）" %
            (cfg["name"], len(todays), r["index"], r["interpretation"]))
        time.sleep(0.6)

    vals = [r["index"] for r in sectors.values()]
    overall = round(sum(vals) / len(vals), 1) if vals else 0
    buy_avg = round(sum(r["details"]["momBuyIndex"] for r in sectors.values()) / len(vals), 1) if vals else 0
    sell_avg = round(sum(r["details"]["momSellIndex"] for r in sectors.values()) / len(vals), 1) if vals else 0

    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            pass
    records = [r for r in (old.get("records") or []) if r.get("date") != date_h]
    records.append({"date": date_h, "asof": today, "overall": overall,
                    "buyAvg": buy_avg, "sellAvg": sell_avg, "sectors": sectors})
    records.sort(key=lambda r: r["date"])

    # 历史曲线（per sector + 综合）
    history = {k: [{"date": r["date"], "index": (r["sectors"].get(k) or {}).get("index")}
                   for r in records] for k in SECTORS}
    history["overall"] = [{"date": r["date"], "index": r["overall"]} for r in records]
    # 分位（样本 <20 日不出，披露）
    overall_hist = [r["overall"] for r in records]
    percentile = round(100 * sum(1 for v in overall_hist if v <= overall) / len(overall_hist), 1) \
        if len(overall_hist) >= 20 else None

    out = {
        "meta": {
            "method": ("参考 github.com/mihang123/mom-index v0.1 公开框架（MIT）："
                       "指数=小白占比×40%+小白强度×25%+情绪极端度×20%+信号纯度×15%；"
                       "10 类小白/6 类专业信号词库 + 买入卖出意图词库"),
            "source": "东方财富股吧公开帖子标题（4 个主题 ETF 吧，当日真实帖子）",
            "sectors": {k: v["name"] for k, v in SECTORS.items()},
            "disclosure": [
                "参考仓库 data/ 为脱敏合成演示数据（2026-01-15 停更），本栏未使用；全部为真实采集",
                "股吧帖子列表只有最新几页，历史不可回补，自首次运行日起逐日累积（当前样本见 recordCount）",
                "小红书口径无稳定公开源，未接入；采集范围仅东财股吧",
                "指数越高=小白讨论越集中/情绪越极端=市场越危险（反向含义），非交易指令",
                "关键词规则为 v0.1 可读基线，未经充分实证与回测；仅存标题不存作者/用户ID",
                "样本 <20 日不输出历史分位，避免小样本误导",
            ],
            "license": "MIT (mihang123/mom-index)",
            "lockedBase": old.get("meta", {}).get("lockedBase") or date_h,
            "recordCount": len(records),
        },
        "records": records,
        "history": history,
        "latest": records[-1],
        "snapshot": {"asof": today, "date": date_h, "overall": overall,
                     "interpretation": interpret(overall), "percentile": percentile,
                     "buyAvg": buy_avg, "sellAvg": sell_avg,
                     "recordCount": len(records)},
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("saved %.1f KB · 综合指数 %s（%s）· 样本 %d 日" %
        (os.path.getsize(OUT) / 1024, overall, interpret(overall), len(records)))


if __name__ == "__main__":
    main()
