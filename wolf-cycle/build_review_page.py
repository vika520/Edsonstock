#!/usr/bin/env python
"""把 data/reviews.json 的最新一篇导出为可独立打开 / 分享的单篇 HTML 研报。

用法：python build_review_page.py [--date 20261113]
"""
import argparse
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "data", "reviews.json")
# 栏数由 views.json 统一驱动；复盘永远最后一栏，编号不写死
_VIEWS = json.load(open(os.path.join(HERE, "views.json"), encoding="utf-8"))
NCOL = len([v for v in _VIEWS["order"] if v != "review"])
REVNO = NCOL + 1

E = lambda s: html.escape(str(s if s is not None else "—"), quote=True)
CSS = """
:root{--ink:#1f2430;--dim:#5d6675;--line:#e3e7ed;--up:#c0392b;--down:#178a5a;--acc:#b7791f}
*{box-sizing:border-box}
body{margin:0;background:#f4f5f7;color:var(--ink);
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;
 font-size:14px;line-height:1.8;-webkit-font-smoothing:antialiased}
.wrap{max-width:920px;margin:28px auto;background:#fff;padding:40px 46px 46px;
 border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 28px #1f24300d}
.eyebrow{font:600 11px "JetBrains Mono",Consolas,monospace;color:var(--acc);letter-spacing:2px}
h1{font-size:22px;line-height:1.65;margin:12px 0 8px;font-weight:700;letter-spacing:.2px}
.meta{font-size:12px;color:var(--dim);border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:22px}
.tags span{display:inline-block;font-size:10.5px;color:var(--dim);border:1px solid var(--line);
 border-radius:4px;padding:2px 7px;margin:0 5px 5px 0}
h2{font-size:15px;margin:26px 0 12px;padding-left:10px;border-left:4px solid var(--acc)}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 20px}
.kpi{background:#f8f9fb;border:1px solid var(--line);border-radius:7px;padding:10px 12px}
.kpi .k{font-size:10.5px;color:var(--dim)}
.kpi .v{font:600 17px "JetBrains Mono",Consolas,monospace;margin-top:4px}
.kpi .v.up{color:var(--up)}.kpi .v.down{color:var(--down)}
.sum{background:#fdf9ee;border-left:4px solid var(--acc);padding:13px 16px;border-radius:0 6px 6px 0;
 font-size:13px;line-height:1.95;color:#4a463c;margin-bottom:8px}
.sec{border:1px solid var(--line);border-radius:7px;margin:10px 0;overflow:hidden}
.sec .h{display:flex;align-items:center;gap:9px;padding:9px 13px;background:#f7f8fa;border-bottom:1px solid var(--line)}
.sec .h .n{font:700 10px "JetBrains Mono",Consolas,monospace;color:var(--acc);
 border:1px solid #e0c98f;border-radius:3px;padding:1px 5px;background:#fff}
.sec .h .t{font-size:13px;font-weight:700}
.sec .h .q{margin-left:auto;font-size:10.5px;color:var(--dim)}
.sec .b{padding:11px 13px}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}
.chip{background:#f2f4f7;border-radius:4px;padding:3px 8px;font-size:11px;color:var(--dim)}
.chip b{color:var(--ink);font-family:"JetBrains Mono",Consolas,monospace;margin-left:5px}
.sec p{margin:0;font-size:12.5px;line-height:1.95;color:#4a5260}
.adv{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.adv .box{border:1px solid var(--line);border-radius:7px;padding:14px;background:#fbfcfd}
.adv .box h3{font-size:13.5px;margin:0 0 4px}
.adv .box .st{font-size:11px;color:var(--acc);margin-bottom:8px}
.adv .lbl{font-size:10.5px;color:var(--acc);letter-spacing:.6px;margin:10px 0 3px;font-weight:600}
.adv ul{margin:0;padding-left:17px}
.adv li{font-size:11.5px;line-height:1.85;color:#4a5260;margin:3px 0}
.note{background:#f7f8fa;border:1px solid var(--line);border-radius:7px;padding:13px 16px;
 font-size:11.5px;line-height:1.9;color:var(--dim)}
.note ul{margin:6px 0 0;padding-left:18px}
.hist-intro{background:#fdf9ee;border-left:4px solid var(--acc);padding:10px 14px;border-radius:0 6px 6px 0;
 font-size:11.5px;line-height:1.9;color:#4a463c;margin-bottom:10px}
.hist{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.hist .col{border:1px solid var(--line);border-radius:7px;overflow:hidden}
.hist .ch{padding:9px 13px;font-size:12.5px;font-weight:700;border-bottom:1px solid var(--line)}
.hist .ok .ch{background:#e9f6ef;color:#178a5a}
.hist .no .ch{background:#fbecea;color:#c0392b}
.hist .row{padding:9px 13px;border-bottom:1px dashed var(--line);font-size:11.5px;line-height:1.75;color:#4a5260}
.hist .row:last-child{border-bottom:0}
.hist .row b{color:var(--ink)}
.hist .row .d{font:600 11px "JetBrains Mono",Consolas,monospace;color:var(--acc)}
.hist .row .s{display:block;color:var(--dim);font-size:11px;margin-top:2px}
.foot{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);font-size:11px;color:var(--dim)}
@media(max-width:760px){.wrap{margin:0;padding:22px 18px;border:0;border-radius:0}
 .kpis,.adv{grid-template-columns:1fr}h1{font-size:18px}}
@media print{body{background:#fff}.wrap{box-shadow:none;border:0;margin:0;max-width:none}}
"""


def render(r):
    ix = r.get("index") or {}
    chg = ix.get("chg")
    cls = "up" if (chg or 0) >= 0 else "down"
    snap = [("上证收盘", "%.2f" % ix.get("close", 0), ""),
            ("涨跌幅", ("+" if (chg or 0) > 0 else "") + "%.2f%%" % (chg or 0), cls),
            ("两市成交额", "{:,.0f} 亿".format(ix.get("amount") or 0), ""),
            ("涨 / 跌 / 平", "%s / %s / %s" % (ix.get("up"), ix.get("down"), ix.get("flat")), ""),
            ("最高 / 最低", "%.2f / %.2f" % (ix.get("high") or 0, ix.get("low") or 0), ""),
            ("全市场标的", "{:,}".format(ix.get("total") or 0), "")]
    h = ['<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
         '<meta name="viewport" content="width=device-width,initial-scale=1">',
         '<title>%s · 每日复盘</title><style>%s</style></head><body><div class="wrap">' % (E(r["date"]), CSS)]
    h.append('<div class="eyebrow">A 股市场结构工作台 · 每日复盘 / DAILY REVIEW</div>')
    h.append('<h1>%s</h1>' % E(r["title"]))
    h.append('<div class="meta">%s（%s）盘后 · 生成于 %s · 数据截止 %s · %s</div>' %
             (E(r["date"]), E(r["weekday"]), E(r["createdAt"][:16].replace("T", " ")),
              E(r["date"]), E((r.get("meta") or {}).get("engine", ""))))
    h.append('<div class="tags">%s</div>' % "".join("<span>%s</span>" % E(t) for t in r.get("tags", [])))
    h.append('<h2>大盘快照</h2><div class="kpis">')
    for k, v, c in snap:
        h.append('<div class="kpi"><div class="k">%s</div><div class="v %s">%s</div></div>' % (E(k), c, E(v)))
    h.append('</div><div class="sum">%s</div>' % E(r["digest"]))
    _ncol = (r.get("meta") or {}).get("columns", NCOL)
    h.append('<h2>一、%d栏数据汇总（第 04 栏 TMT 交易拥挤度单列一节）</h2>' % _ncol)
    for i, s in enumerate(r.get("sections") or [], 1):
        h.append('<div class="sec"><div class="h"><span class="n">%02d</span><span class="t">%s</span>'
                 '<span class="q">%s</span></div><div class="b"><div class="chips">' %
                 (i, E(s["name"]), E({"up": "偏强", "down": "偏弱"}.get(s.get("tone"), "中性"))))
        for k in s.get("kpis") or []:
            h.append('<span class="chip">%s<b>%s</b></span>' % (E(k["k"]), E(k["v"])))
        h.append('</div><p>%s</p></div></div>' % E(s["text"]))
    h.append('<h2>二、操作参考（条件化，不构成建议）</h2><div class="adv">')
    for key, name in (("shortTerm", "短线"), ("longTerm", "中长线")):
        b = r.get(key) or {}
        h.append('<div class="box"><h3>%s · %s</h3><div class="st">立场：%s</div>' %
                 (E(name), E(b.get("horizon")), E(b.get("stance"))))
        for label, arr in (("观察要点", b.get("points")), ("触发条件", b.get("triggers")),
                           ("证伪场景", b.get("falsify"))):
            h.append('<div class="lbl">%s</div><ul>' % label)
            h.extend("<li>%s</li>" % E(x) for x in (arr or []))
            h.append('</ul>')
        h.append('</div>')
    h.append('</div>')
    m = r.get("meta") or {}
    histm = m.get("history") or {}
    if histm.get("available") or histm.get("unavailable"):
        h.append('<h2>三、长历史数据可得性清单（实测结论）</h2>')
        h.append('<div class="hist-intro">%s</div>' % E(histm.get("note", "")))
        h.append('<div class="hist">')
        h.append('<div class="col ok"><div class="ch">已按日回补 · 现在就有历史</div>')
        for x in histm.get("available") or []:
            h.append('<div class="row"><b>%s</b> <span class="d">%s 日</span>' %
                     (E(x.get("item")), E(x.get("days"))) +
                     '<span class="s">%s</span></div>' % E(x.get("source")))
        h.append('</div>')
        h.append('<div class="col no"><div class="ch">确认拿不到历史 · 只有当日 / 逐日累积</div>')
        for x in histm.get("unavailable") or []:
            h.append('<div class="row"><b>%s</b><span class="s">%s</span>' %
                     (E(x.get("item")), E(x.get("reason"))) +
                     '<span class="s" style="color:#178a5a">替代：%s</span></div>' % E(x.get("alternative")))
        h.append('</div></div>')
    h.append('<h2>四、生成机制与免责</h2><div class="note">')
    h.append('<div>数据源：%s</div>' % E("、".join(m.get("sources") or [])))
    if m.get("degraded"):
        h.append('<div style="color:#b7791f">注意：数据降级，各源截止日期 %s</div>' %
                 E(json.dumps(m.get("dataAsOf") or {}, ensure_ascii=False)))
    h.append('<ul>')
    h.extend('<li>%s</li>' % E(x) for x in (m.get("caveat") or []))
    h.append('</ul></div>')
    import hosts  # 本地私有配置（不入库）
    # 产物中的链接写成占位符：公开仓库不含内网地址；本地部署时由 stage() 替换为真实站点 URL
    _site = "<NAS_HOST>"
    h.append('<div class="foot">本文件由 build_review.py / build_review_page.py 自动生成，可离线打开 / 打印。'
             '局域网在线版：<a href="%s/review-latest.html" '
             'style="color:var(--acc)">最新一篇</a> · '
             '<a href="%s/#review" style="color:var(--acc)">工作台第 %d 栏</a></div>'
             % (_site, _site, (r.get("meta") or {}).get("reviewViewNo", REVNO)))
    h.append('</div></body></html>')
    import brand
    return brand.apply("\n".join(h))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default="")
    a = ap.parse_args()
    d = json.load(open(SRC, encoding="utf-8"))
    revs = d.get("reviews") or []
    r = next((x for x in revs if x["date"] == a.date), revs[0] if revs else None)
    if not r:
        raise RuntimeError("reviews.json 中没有可导出的报告")
    out = os.path.join(ROOT, "每日复盘_%s.html" % r["date"])
    with open(out, "w", encoding="utf-8") as f:
        f.write(render(r))
    print("saved:", out, round(os.path.getsize(out) / 1024, 1), "KB |", r["date"])


if __name__ == "__main__":
    main()
