"""03 STH 成本基础栏目点检。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
INK = """function __ink(id){var c=document.getElementById(id);if(!c)return -1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
var n=0;for(var i=3;i<d.length;i+=40)if(d[i]>0)n++;return n;}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#sth", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1500)
    pg.add_script_tag(content=INK)

    btns = pg.locator("#NAV button")
    n = btns.count()
    nos = [btns.nth(i).locator(".no").inner_text() for i in range(n)]
    vs = [btns.nth(i).get_attribute("data-v") for i in range(n)]
    print("NAV:", n, vs)
    assert n == 18 and nos == ["%02d" % i for i in range(1, 19)], "编号不连续"
    assert vs[0] == "wave" and vs[1] == "wyckoff" and vs[2] == "sth", vs[:4]
    assert vs[-1] == "review"
    print("18 栏连续编号 + sth=03: PASS")

    assert pg.locator("#HD_EYEBROW").inner_text() == "VIEW 03"
    kpi = pg.locator("#SX_KPI .kpi").count()
    print("ST KPI:", kpi)
    assert kpi == 8
    dec = pg.locator("#SX_DEC").inner_text()
    print("ST DEC:", dec[:170].replace("\n", " | "))
    for w in ("STH80", "z=", "逆势"):
        assert w in dec, "判读缺: " + w
    inks = {c: pg.evaluate("__ink('%s')" % c) for c in ("sx-main", "sx-n", "sx-z")}
    print("canvas ink:", inks)
    assert all(v > 50 for v in inks.values()), "画布未绘制"
    # 横轴时间像素
    for c in ("sx-main", "sx-n", "sx-z"):
        px = pg.evaluate("((id)=>{const c=document.getElementById(id);const d=c.getContext('2d').getImageData(0,c.height-20,c.width,18).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>60)n++;return n;})('%s')" % c)
        assert px > 300, c + " 横轴无时间刻度"
    print("横轴时间刻度: PASS")
    rows = pg.locator("#sx-tab tbody tr").count()
    assert rows == 20, rows
    cav = pg.locator("#SX_CAVEAT").inner_text()
    assert "三角分布" in cav and "逆势信号" in cav and "不构成投资建议" in cav
    # 切换双创篮子
    for tt in ('cybtop','kcbtop'):
        pg.locator('#sx-target button[data-t="%s"]' % tt).click()
        pg.wait_for_timeout(400)
        dec_t = pg.locator("#SX_DEC").inner_text()
        print("切换 %s 判读: %s" % (tt, dec_t[:60].replace("\n"," ")))
        assert pg.evaluate("__ink('sx-main')") > 50, tt + " 主图未绘制"
    # 切换单股
    pg.locator('#sx-target button[data-t="300750"]').click()
    pg.wait_for_timeout(400)
    assert pg.evaluate("__ink('sx-main')") > 50
    dec2 = pg.locator("#SX_DEC").inner_text()
    print("切换宁德判读:", dec2[:80].replace("\n", " "))
    # 折叠重绘
    pg.locator("#collapseBtn").click(); pg.wait_for_timeout(300)
    pg.locator("#collapseBtn").click(); pg.wait_for_timeout(300)
    assert pg.evaluate("__ink('sx-main')") > 50

    # 编号 spot check
    for v, want in (("erp", "VIEW 14"), ("vix", "VIEW 07"), ("wyckoff", "VIEW 02"),
                    ("sentiment", "VIEW 06"), ("review", "VIEW 18")):
        pg.locator('#NAV button[data-v="%s"]' % v).click()
        pg.wait_for_timeout(180)
        assert pg.locator("#HD_EYEBROW").inner_text() == want, (v, want)
    print("spot check wyckoff02/sth03/vix06/erp13/review17: PASS")
    real = [e for e in errs if "favicon" not in e.lower()]
    print("ERRORS:", real if real else "none")
    assert not real, real
    b.close()
print("STH PREVIEW ALL PASS")
