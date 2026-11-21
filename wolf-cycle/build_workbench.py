"""把全部栏目合成一个离线单文件工作台。

- 01/02：已交付的两个页面原样 base64 内嵌，切换时用 srcdoc 懒加载，保持像素级一致。
- 其余栏目：JS 模块拼接进同一 <script>；栏目顺序由 views.json 驱动，review 永远最后。
- ERP / TMT / EXTRAS 数字由 fetch_erp.py / fetch_tmt.py / fetch_extras.py 落盘，
  本脚本只做注入，不做任何计算。
"""
import base64
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "A股市场结构工作台.html")
TPL = os.path.join(HERE, "template_workbench.html")
MODULES = ["wb_core.js", "wb_extras.js", "wb_rotate.js", "wb_volume.js", "wb_etf.js",
           "wb_daily.js", "wb_wyckoff.js", "wb_flow.js", "wb_review.js", "wb_erp.js",
           "wb_derivatives.js", "wb_leverage.js", "wb_sentiment.js", "wb_vix.js",
           "wb_valuation.js", "wb_events.js", "wb_cross.js"]


def load(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def main():
    w = json.load(open(os.path.join(HERE, "data", "workbench.json"), encoding="utf-8"))
    idx = json.load(open(os.path.join(HERE, "data", "indices.json"), encoding="utf-8"))
    mom = json.load(open(os.path.join(HERE, "data", "board_mom.json"), encoding="utf-8"))

    px_all = {r[0]: r[1] for r in idx["indices"]["sh000001"]["rows"]}
    dates = [r[0] for r in w["market"]]
    px = {d: px_all[d] for d in dates if d in px_all}
    missing = [d for d in dates if d not in px_all]
    print("交易日:", len(dates), dates[0], "~", dates[-1], "| 指数收盘缺失:", len(missing))

    payload = {
        "meta": w["meta"],
        "asof": w["meta"]["asof"],
        "market": w["market"],       # [date, amount元, volume, down, up, flat, total]
        "px": px,
        "etfs": w["etfs"],           # code -> {name,cat,core,exactAmount,rows:[[date,close,amount]]}
        "boards": w["boards"],
        "boardMom": mom,
    }
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "</script" in data.lower():
        raise RuntimeError("数据中含 </script，需转义")

    views = json.load(open(os.path.join(HERE, "views.json"), encoding="utf-8"))
    order = [v for v in views["order"] if v != "review"] + ["review"]  # 复盘强制末尾
    # 分组只改变菜单显示顺序；固定编号表保证 01-16 与全站 VIEW 文案不随重排变化
    groups = views.get("groups") or []
    fixed = views.get("fixedNo") or {}
    gviews = [v for g in groups for v in (g.get("views") or [])]
    if groups:
        if sorted(gviews) != sorted(order):
            raise RuntimeError("views.json groups 与 order 不一致：groups=%s / order=%s"
                               % (gviews, order))
        if gviews[-1] != "review":
            raise RuntimeError("views.json groups 必须把 review 放在最后")
    # 编号必须按 groups 显示顺序连续 01~N，杜绝「01/07/02」这种跳号
    if fixed:
        seq = [fixed.get(v) for v in (gviews or order)]
        want = [str(i).zfill(2) for i in range(1, len(seq) + 1)]
        if seq != want:
            raise RuntimeError("views.json fixedNo 未按显示顺序连续编号：%s（应为 %s）"
                               % (seq, want))
    prefix = ("const VIEW_ORDER = %s;\nconst VIEW_GROUPS = %s;\nconst FIXED_NO = %s;\n"
              % (json.dumps(order, ensure_ascii=False),
                 json.dumps(groups, ensure_ascii=False),
                 json.dumps(fixed, ensure_ascii=False)))
    js = prefix + "\n".join("/* ==== %s ==== */\n%s" %
                            (m, load(os.path.join(HERE, m))) for m in MODULES)
    # 初始化兜底：rAF 在部分 headless / 后台标签场景会被节流，
    # 400ms 后对当前栏目再绘一次，保证直接以 #erp / #flow 等深链打开时不会留空白。
    js += ("\nconst _v0=(location.hash||'').slice(1);\nswitchView(HEAD[_v0]?_v0:'wave');\n"
           "setTimeout(()=>{const _v=location.hash.slice(1);if(MODS[_v])MODS[_v].draw();},400);\n")
    with open(os.path.join(HERE, "workbench.js"), "w", encoding="utf-8") as f:
        f.write("const PAGE_B64={wave:'',breadth:''};\n" + js)

    p1 = base64.b64encode(load(os.path.join(ROOT, "A股狼波周期指数走势图.html")).encode("utf-8")).decode("ascii")
    p2 = base64.b64encode(load(os.path.join(ROOT, "A股双冰点情绪指标.html")).encode("utf-8")).decode("ascii")

    wyck = open(os.path.join(HERE, "data", "wyckoff.json"), encoding="utf-8").read()
    if "</script" in wyck.lower():
        raise RuntimeError("威科夫数据中含 </script，需转义")
    flow = open(os.path.join(HERE, "data", "flow.json"), encoding="utf-8").read()
    if "</script" in flow.lower():
        raise RuntimeError("宽度与拥挤度数据中含 </script，需转义")
    reviews = open(os.path.join(HERE, "data", "reviews.json"), encoding="utf-8").read()
    if "</script" in reviews.lower():
        raise RuntimeError("复盘数据中含 </script，需转义")
    erp = open(os.path.join(HERE, "data", "erp.json"), encoding="utf-8").read()
    if "</script" in erp.lower():
        raise RuntimeError("ERP 数据中含 </script，需转义")
    tmt = open(os.path.join(HERE, "data", "tmt.json"), encoding="utf-8").read()
    if "</script" in tmt.lower():
        raise RuntimeError("TMT 数据中含 </script，需转义")
    vix = open(os.path.join(HERE, "data", "vix.json"), encoding="utf-8").read()
    if "</script" in vix.lower():
        raise RuntimeError("VIX 数据中含 </script，需转义")
    extras = open(os.path.join(HERE, "data", "extras.json"), encoding="utf-8").read()
    if "</script" in extras.lower():
        raise RuntimeError("补充数据中含 </script，需转义")
    hist = open(os.path.join(HERE, "data", "history.json"), encoding="utf-8").read()
    if "</script" in hist.lower():
        raise RuntimeError("历史回补数据中含 </script，需转义")

    html = load(TPL)
    html = html.replace("__DATA__", data)
    html = html.replace("__WYCK__", wyck)
    html = html.replace("__FLOW__", flow)
    html = html.replace("__REVIEWS__", reviews)
    html = html.replace("__ERP__", erp)
    html = html.replace("__TMT__", tmt)
    html = html.replace("__VIX__", vix)
    html = html.replace("__EXTRAS__", extras)
    html = html.replace("__HIST__", hist)
    html = html.replace("__PAGE1__", p1).replace("__PAGE2__", p2)
    html = html.replace("/*__JS__*/", js)
    import brand
    html = brand.apply(html)   # title / favicon / 侧栏 logo 统一注入
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("saved:", OUT, round(os.path.getsize(OUT) / 1024 / 1024, 2), "MB")
    print("  DATA", round(len(data) / 1024, 1), "KB | JS", round(len(js) / 1024, 1),
          "KB | page1", round(len(p1) / 1024, 1), "KB | page2", round(len(p2) / 1024, 1), "KB")
    print("  boards", len(w["boards"]), "| etfs", len(w["etfs"]), "| boardMom", len(mom),
          "| EXTRAS", round(len(extras) / 1024, 1), "KB | HIST", round(len(hist) / 1024, 1), "KB")
    print("  views", len(order), "· 末尾", order[-1])


if __name__ == "__main__":
    main()
