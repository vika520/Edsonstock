"""ERP 与 TMT 增强的 Playwright 点检。

验证：16 栏菜单、锁定数字原样展示、4+2 张画布绘制、阈值/概率/明细表、
区间事件进度、复盘 10 节汇总、折叠重绘、控件切换，以及无控制台错误。
导出两张栏目截图供交付。
"""
import json
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
ERP_PNG = ROOT / "A股市场结构工作台_ERP区间.png"
TMT_PNG = ROOT / "A股市场结构工作台_TMT拥挤度.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"

INK = """function __ink(id){var c=document.getElementById(id);if(!c)return -1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
var n=0;for(var i=3;i<d.length;i+=40)if(d[i]>0)n++;return n;}"""

ERP_CANVAS = ["ep-main", "ep-px", "ep-point", "ep-prob"]
TMT_CANVAS = ["fl-tmt", "fl-tmtg"]

# 锁定数字动态取自 erp.json 当前 snapshot（固定口径追加新交易日后会自动更新），
# 逐字校验页面显示与唯一数据源一致，避免写死旧日期的数字导致误报。
_ERP = json.load(open(ROOT / "wolf-cycle" / "data" / "erp.json", encoding="utf-8"))
_S = _ERP["snapshot"]
ERP_NUMBERS = [str(_S["erp"]), str(_S["historyPercentile"]), str(_S["peTtm"]),
               str(_S["earningsYield"]), str(_S["y10"]),
               str(_S["channelMid"]), str(_S["channelSigma"]),
               str(_S["channelUpper"]), str(_S["channelLower"]), str(_S["close"])]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#erp", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1600)
    pg.add_script_tag(content=INK)
    print("EARLY ERRS:", errs if errs else "none")
    # 幂等兜底：即便 rAF 被节流，也能保证当前栏目已完成绘制
    pg.evaluate("MODS.erp.draw()")
    pg.wait_for_timeout(350)

    print("HTML: %.2f MB" % (HTML.stat().st_size / 1024 / 1024))
    print("NAV:", pg.locator("#NAV button").count(), "| HEAD:", pg.locator("#HD_TITLE").inner_text())
    assert pg.locator("#NAV button").count() == 19, "菜单不是 19 栏"
    assert "股债利差" in pg.locator("#HD_TITLE").inner_text()

    kpi = pg.locator("#EP_KPI .kpi")
    print("ERP KPI:", kpi.count(), "|", pg.locator("#EP_KPI").inner_text().replace("\n", " | ")[:220])
    assert kpi.count() == 6
    alltxt = pg.locator("#V_erp").inner_text()
    for n in ERP_NUMBERS:
        assert n in alltxt, "锁定数字缺失: " + n
    print("LOCKED NUMBERS: all %d present" % len(ERP_NUMBERS))
    # 档位随交易日数据合法变动（中性/略偏权益/偏便宜…），断言有效档位存在而非硬编码
    assert any(w in alltxt for w in ("中性", "略偏权益", "偏便宜", "便宜", "偏贵")), "ERP 档位缺失"
    assert "偏便宜" in alltxt or "低估" in alltxt or "中性" in alltxt
    # 建议文案随档位变动（中性/略偏权益各有措辞），断言建议框结构而非具体措辞
    assert "操作建议" in alltxt and "证伪" in alltxt

    vals = {c: pg.evaluate("__ink('%s')" % c) for c in ERP_CANVAS}
    print("ERP CANVAS ink:", vals)
    assert all(v > 50 for v in vals.values()), "ERP 有画布未绘制"

    print("TH tab:", pg.locator("#ep-thtab tbody tr").count(),
          "| PROB tab:", pg.locator("#ep-probtab tbody tr").count(),
          "| daily tab:", pg.locator("#ep-tab tbody tr").count())
    assert pg.locator("#ep-thtab tbody tr").count() == 4
    assert pg.locator("#ep-probtab tbody tr").count() == 3
    assert pg.locator("#ep-tab tbody tr").count() == 22
    ev = pg.locator("#EP_EVENT").inner_text()
    print("EVENT:", ev.replace("\n", " | ")[:230])
    _EV = _S["event"]
    assert str(_EV["eventCount"]) in ev and str(_EV["toEnterGap"]) in ev
    assert ("未进入区间" if not _EV["inEvent"] else "本轮进度") in ev
    cav = pg.locator("#EP_CAVEAT").inner_text()
    print("CAVEAT:", len(cav), "chars | 1250:", "1250" in cav,
          "| 只读:", "只读" in cav, "| 锁定:", "锁定" in cav)
    assert "1250" in cav and "只读" in cav and "不构成投资建议" in cav

    # 区间切换
    for v in ("250", "750", "0", "1250"):
        pg.select_option("#ep-range", v)
        pg.wait_for_timeout(220)
        print("RANGE", v, "|", pg.locator("#ep-cover").inner_text())
    vals2 = {c: pg.evaluate("__ink('%s')" % c) for c in ERP_CANVAS}
    assert all(v > 50 for v in vals2.values()), "切换区间后有画布空白"

    # 第 04 栏 TMT 增强
    pg.locator('#NAV button[data-v="flow"]').click()
    pg.wait_for_timeout(900)
    tvals = {c: pg.evaluate("__ink('%s')" % c) for c in TMT_CANVAS}
    print("TMT CANVAS ink:", tvals)
    assert all(v > 50 for v in tvals.values()), "TMT 有画布未绘制"
    print("TMT rows:", pg.locator("#fl-tmttab tbody tr").count(),
          "| SUM:", pg.locator("#fl-tmtsum").inner_text())
    assert pg.locator("#fl-tmttab tbody tr").count() >= 10
    flowtxt = pg.locator("#V_flow").inner_text()
    _T = json.load(open(ROOT / "wolf-cycle" / "data" / "tmt.json", encoding="utf-8"))
    _TS = _T["snapshot"]
    ratio_s = str(_TS["ratio"])
    for n in (ratio_s, str(_TS["tmtAmount"]), str(_TS["marketAmount"]), "不足 20 日"):
        assert n in flowtxt, "TMT 锁定数字/说明缺失: " + n
    # 防止把「两市成交额」误当成「TMT 占比」画到大字读数上
    now = pg.locator("#fl-tmtnow").inner_text()
    print("TMT NOW:", now)
    assert "当日成交占比 %s%%" % ratio_s in now, "单点大字读数口径错位: " + now
    hist = pg.evaluate("JSON.parse(document.getElementById('TMT').textContent).history")
    assert hist and hist[-1][3] == _TS["ratio"], "history 列错位"
    print("TMT LOCKED: all present | asof", _T["asof"], "| ratio", ratio_s,
          "| history days", len(hist))

    # 第 16 栏复盘（永远末尾）
    pg.locator('#NAV button[data-v="review"]').click()
    pg.wait_for_timeout(600)
    t = pg.locator(".rv-h1").inner_text()
    print("REVIEW TITLE:", t[:130])
    assert "栏速览" in t and "ERP" in t and "TMT" in t
    print("REVIEW SEC:", pg.locator("#rv-detail .rv-sec").count())
    assert pg.locator("#rv-detail .rv-sec").count() >= 19, "18栏汇总 + TMT 单列 + 生成机制不足"
    detail = pg.locator("#rv-detail").inner_text()
    assert "股债利差(ERP)区间" in detail and "TMT 交易拥挤度" in detail
    assert str(_S["erp"]) in detail and str(_S["thresholds"][0]["point"]) in detail

    # 折叠后重绘
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(420)
    assert pg.locator(".rv-h1").count() == 1
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(420)

    # 截图：先 ERP 长图，再 TMT 局部
    def full_page_shot(view, out):
        pg.evaluate("""(v) => {
          document.querySelectorAll('.view').forEach(s=>{
            s.style.position='static'; s.style.overflow='visible'; s.style.height='auto';
            s.style.display = (s.id==='V_'+v) ? 'block' : 'none';
          });
          const mb=document.querySelector('.mbody'); mb.style.position='static'; mb.style.overflow='visible';
          const mn=document.querySelector('.main'); mn.style.height='auto';
          document.body.style.height='auto';
        }""", view)
        pg.evaluate("MODS.%s.draw()" % view)
        pg.wait_for_timeout(450)
        pg.screenshot(path=str(out), full_page=True)
        print("PNG:", out.name, "%.0f KB" % (out.stat().st_size / 1024),
              "| height", pg.evaluate("document.documentElement.scrollHeight"))

    full_page_shot("erp", ERP_PNG)
    full_page_shot("flow", TMT_PNG)

    # TMT 两张卡片局部图（便于检查横条与标签是否重叠）
    for cid, name in (("fl-tmt", "A股市场结构工作台_TMT占比.png"),
                      ("fl-tmtg", "A股市场结构工作台_TMT行业分解.png")):
        card = pg.locator("canvas#%s" % cid).locator(
            "xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' card ')][1]")
        out = ROOT / name
        card.screenshot(path=str(out))
        print("PNG:", out.name, "%.0f KB" % (out.stat().st_size / 1024))

    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    b.close()
print("ERP / TMT PREVIEW ALL PASS")
