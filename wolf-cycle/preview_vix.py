"""06 波动率与恐慌指数（EdsonVIX）栏目点检。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
PNG = ROOT / "A股市场结构工作台_恐慌指数.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
INK = """function __ink(id){var c=document.getElementById(id);if(!c)return -1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
var n=0;for(var i=3;i<d.length;i+=40)if(d[i]>0)n++;return n;}"""

EXPECT = {
    "wave": "01", "wyckoff": "02", "breadth": "03", "flow": "04", "sentiment": "05",
    "vix": "06", "volume": "07", "etf": "08", "daily": "09", "derivatives": "10",
    "leverage": "11", "rotate": "12", "erp": "13", "valuation": "14", "events": "15",
    "cross": "16", "review": "17",
}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#vix", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1500)
    pg.add_script_tag(content=INK)

    # 菜单：17 栏 + 编号连续 + review 末尾 17
    btns = pg.locator("#NAV button")
    n = btns.count()
    nos = [btns.nth(i).locator(".no").inner_text() for i in range(n)]
    vs = [btns.nth(i).get_attribute("data-v") for i in range(n)]
    print("NAV:", n, nos)
    assert n == 17 and nos == ["%02d" % i for i in range(1, 18)], "编号不连续"
    for v, no in zip(vs, nos):
        assert EXPECT[v] == no, "%s=%s 应为 %s" % (v, no, EXPECT[v])
    assert vs[-1] == "review" and nos[-1] == "17"
    print("17 栏连续编号: PASS")

    # VIX 栏内容
    assert pg.locator("#HD_EYEBROW").inner_text() == "VIEW 06"
    assert "恐慌指数" in pg.locator("#HD_TITLE").inner_text()
    kpi = pg.locator("#VX_KPI .kpi").count()
    print("VX KPI:", kpi)
    assert kpi == 8
    dec = pg.locator("#VX_DEC").inner_text()
    print("VX DEC:", dec[:160].replace("\n", " | "))
    for w in ("EdsonVIX", "分位", "Skew", "HO", "MO"):
        assert w in dec, "判读缺: " + w
    inks = {c: pg.evaluate("__ink('%s')" % c) for c in
            ("vx-main", "vx-pct", "vx-cmp", "vx-skew")}
    print("canvas ink:", inks)
    assert all(v > 50 for v in inks.values()), "有画布未绘制"
    rows = pg.locator("#vx-tab tbody tr").count()
    print("table rows:", rows)
    assert rows == 22
    cav = pg.locator("#VX_CAVEAT").inner_text()
    assert "自编" in cav and "CBOE" in cav and "不构成投资建议" in cav
    print("caveat chars:", len(cav))

    # 范围切换
    pg.locator('#vx-range button[data-r="60"]').click()
    pg.wait_for_timeout(300)
    assert pg.evaluate("__ink('vx-main')") > 50
    pg.locator('#vx-range button[data-r="0"]').click()
    pg.wait_for_timeout(300)

    # 折叠重绘
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(350)
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(350)
    assert pg.evaluate("__ink('vx-main')") > 50

    card = pg.locator("#V_vix")
    pg.locator('#NAV button[data-v="vix"]').click()
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(PNG), full_page=False)

    # 其他栏目 spot check：ERP 13、衍生品 10、复盘 17
    for v, want in (("erp", "VIEW 13"), ("derivatives", "VIEW 10"), ("review", "VIEW 17")):
        pg.locator('#NAV button[data-v="%s"]' % v).click()
        pg.wait_for_timeout(200)
        assert pg.locator("#HD_EYEBROW").inner_text() == want, v
    print("spot check erp13/deriv10/review17: PASS")

    real = [e for e in errs if "favicon" not in e.lower()]
    print("ERRORS:", real if real else "none")
    assert not real, real
    b.close()
print("VIX PREVIEW ALL PASS")
