"""16 栏工作台点检：动态菜单、6 个新增栏目、第 07 栏改造、复盘末尾、折叠、无错误。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
INK = """function __ink(id){var c=document.getElementById(id);if(!c)return -1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
var n=0;for(var i=3;i<d.length;i+=40)if(d[i]>0)n++;return n;}"""

VIEWS = {
    "etf":         ["etf-amt", "etf-stack", "etf-today", "etf-dir", "etf-hist",
                    "etf-ratio", "etf-quarter", "etf-share"],
    "derivatives": ["dv-basis", "dv-ann", "dv-pcr", "dv-oi", "dv-rank"],
    "leverage":    ["lv-bal", "lv-net", "lv-ratio", "lv-etf"],
    "sentiment":   ["st-count", "st-rate", "st-hist", "st-promo", "st-ladder"],
    "valuation":   ["va-dist", "va-rank", "va-trend", "va-fc"],
    "events":      ["ev-unlock", "ev-board"],
    "cross":       ["cr-quotes", "cr-macro", "cr-daily"],
}
KPI = {"etf": "ETF_KPI", "derivatives": "DV_KPI", "leverage": "LV_KPI",
       "sentiment": "ST_KPI", "valuation": "VA_KPI", "events": "EV_KPI", "cross": "CR_KPI"}
CAV = {"etf": "ETF_CAVEAT", "derivatives": "DV_CAVEAT", "leverage": "LV_CAVEAT",
       "sentiment": "ST_CAVEAT", "valuation": "VA_CAVEAT", "events": "EV_CAVEAT", "cross": "CR_CAVEAT"}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#etf", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1600)
    pg.add_script_tag(content=INK)

    print("HTML %.2f MB" % (HTML.stat().st_size / 1024 / 1024))
    nav = pg.locator("#NAV button")
    print("NAV count:", nav.count(), "| label:", pg.locator("#NAVLABEL").inner_text())
    assert nav.count() == 16, "菜单不是 16 栏"
    assert pg.locator("#NAV button").last.get_attribute("data-v") == "review", "复盘不在末尾"
    assert pg.locator("#NAV button").last.locator(".no").inner_text() == "16", "复盘编号不是 16"
    assert "16 VIEWS" in pg.locator("#NAVLABEL").inner_text()
    print("REVIEW lead n:", pg.locator("#RV_NCOL").inner_text(),
          "| tag:", pg.locator("#RV_TAG_NCOL").inner_text())
    assert pg.locator("#RV_NCOL").inner_text() == "15"

    alltxt = pg.locator("#V_etf").inner_text()
    print("ETF head:", pg.locator("#HD_TITLE").inner_text())
    assert "ETF 日度申赎" in pg.locator("#HD_TITLE").inner_text(), "第 07 栏标题未改"
    for w in ("季度申赎真实", "份额估计", "撤销", "没有任何公开日度数据", "没有免费公开源"):
        assert w in alltxt, "第 07 栏缺关键文案: " + w
    print("ETF KPI:", pg.locator("#ETF_KPI .kpi").count(),
          "|", pg.locator("#ETF_KPI").inner_text().replace("\n", " | ")[:200])
    assert pg.locator("#ETF_KPI .kpi").count() == 8
    print("ETF quarterly rows:", pg.locator("#etf-gtab tbody tr").count())
    assert pg.locator("#etf-gtab tbody tr").count() >= 20

    for v, cvs in VIEWS.items():
        pg.locator('#NAV button[data-v="%s"]' % v).click()
        pg.wait_for_timeout(520)
        pg.evaluate("MODS.%s.draw()" % v)
        pg.wait_for_timeout(240)
        inks = {c: pg.evaluate("__ink('%s')" % c) for c in cvs}
        bad = [c for c, n in inks.items() if n <= 20]
        print("[%-11s] title=%-16s kpi=%d cav=%d canvas=%s%s" %
              (v, pg.locator("#HD_TITLE").inner_text()[:16],
               pg.locator("#%s .kpi" % KPI[v]).count(),
               len(pg.locator("#%s" % CAV[v]).inner_text()),
               inks, "  BAD=" + str(bad) if bad else ""))
        assert not bad, "%s 有画布空白: %s" % (v, bad)
        assert pg.locator("#%s .kpi" % KPI[v]).count() >= 6
        assert len(pg.locator("#%s" % CAV[v]).inner_text()) > 200

    # 关键真实数字与显式缺口
    checks = {
        "derivatives": ["IV", "次月年化", "会员净多空"],
        "leverage": ["两融", "T+1", "季度"],
        "sentiment": ["炸板率", "晋级率", "不伪造回补", "250 日历史回补", "两套口径"],
        "valuation": ["横截面", "业绩预告", "不是分析师一致预期", "250 日按日回补"],
        "events": ["解禁", "龙虎榜", "Level-2"],
        "cross": ["中债 10Y", "USDCNY", "非盘中实时", "460 日历史回补"],
    }
    for v, words in checks.items():
        pg.locator('#NAV button[data-v="%s"]' % v).click()
        pg.wait_for_timeout(260)
        t = pg.locator("#V_" + v).inner_text()
        for w in words:
            assert w in t, "%s 缺关键文案: %s" % (v, w)
    print("CAVEAT / 关键文案: ALL PASS")

    # 控件切换
    pg.locator('#NAV button[data-v="derivatives"]').click()
    pg.wait_for_timeout(300)
    for prod in ("IH", "IC", "IM", "IF"):
        pg.locator('#dv-prod button[data-p="%s"]' % prod).click()
        pg.wait_for_timeout(180)
    for opt in ("HO", "MO", "IO"):
        pg.locator('#dv-opt button[data-o="%s"]' % opt).click()
        pg.wait_for_timeout(180)
    pg.locator('#NAV button[data-v="valuation"]').click()
    pg.wait_for_timeout(250)
    for s in ("chg", "amt", "pe"):
        pg.locator('#va-sort button[data-s="%s"]' % s).click()
        pg.wait_for_timeout(150)
    pg.locator('#NAV button[data-v="leverage"]').click()
    pg.wait_for_timeout(250)
    for r in ("120", "750", "0", "250"):
        pg.locator('#lv-range button[data-r="%s"]' % r).click()
        pg.wait_for_timeout(150)
    print("CONTROL SWITCH: PASS")

    # 折叠 / 展开
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(400)
    assert pg.locator(".side.collapsed").count() == 1
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(400)
    print("COLLAPSE: PASS")

    # 复盘仍是最后一栏，且正文可用
    pg.locator('#NAV button[data-v="review"]').click()
    pg.wait_for_timeout(620)
    print("REVIEW:", pg.locator("#HD_EYEBROW").inner_text(),
          "| sections:", pg.locator("#rv-detail .rv-sec").count())
    assert pg.locator("#HD_EYEBROW").inner_text() == "VIEW 16"

    # 截图：衍生品 / 短线情绪 / ETF 申赎
    def shot(v, name):
        pg.evaluate("""(v)=>{
          document.querySelectorAll('.view').forEach(s=>{
            s.style.position='static';s.style.overflow='visible';s.style.height='auto';
            s.style.display=(s.id==='V_'+v)?'block':'none';});
          const mb=document.querySelector('.mbody');mb.style.position='static';mb.style.overflow='visible';
          document.querySelector('.main').style.height='auto';document.body.style.height='auto';
        }""", v)
        pg.evaluate("MODS.%s.draw()" % v)
        pg.wait_for_timeout(420)
        out = ROOT / name
        pg.screenshot(path=str(out), full_page=True)
        print("PNG:", name, "%.0f KB" % (out.stat().st_size / 1024))
        pg.reload(wait_until="load")
        pg.wait_for_timeout(900)
        pg.add_script_tag(content=INK)

    shot("derivatives", "A股市场结构工作台_衍生品对冲压力.png")
    shot("etf", "A股市场结构工作台_ETF日度申赎.png")
    shot("sentiment", "A股市场结构工作台_短线情绪.png")

    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    b.close()
print("EXTRAS PREVIEW ALL PASS")
