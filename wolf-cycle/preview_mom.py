"""08 散户反向指数栏目点检。"""
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
    pg = b.new_page(viewport={"width": 1600, "height": 1100})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#mom", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1500)
    pg.add_script_tag(content=INK)

    btns = pg.locator("#NAV button")
    n = btns.count()
    nos = [btns.nth(i).locator(".no").inner_text() for i in range(n)]
    vs = [btns.nth(i).get_attribute("data-v") for i in range(n)]
    print("NAV:", n, vs)
    assert n == 19 and nos == ["%02d" % i for i in range(1, 20)], "编号不连续"
    assert vs[7] == "mom" and nos[7] == "08", vs[:9]
    assert vs[-1] == "review" and nos[-1] == "19"
    print("19 栏连续编号 + mom=08: PASS")

    assert pg.locator("#HD_EYEBROW").inner_text() == "VIEW 08"
    kpi = pg.locator("#MO_KPI .kpi").count()
    assert kpi == 8, kpi
    print("MO KPI:", kpi)
    dec = pg.locator("#MO_DEC").inner_text()
    print("MO DEC:", dec[:170].replace("\n", " | "))
    for w in ("综合散户反向指数", "反向含义", "不是买卖指令"):
        assert w in dec, "判读缺: " + w
    inks = {c: pg.evaluate("__ink('%s')" % c) for c in
            ("mo-main", "mo-sectors", "mo-bs")}
    print("canvas ink:", inks)
    assert all(v > 50 for v in inks.values()), "画布未绘制"
    rec_n = pg.evaluate("(JSON.parse(document.getElementById('MOM').textContent).records||[]).length")
    if rec_n >= 5:
        for c in ("mo-main", "mo-sectors", "mo-bs"):
            px = pg.evaluate("((id)=>{const c=document.getElementById(id);const d=c.getContext('2d').getImageData(0,c.height-20,c.width,18).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>60)n++;return n;})('%s')" % c)
            assert px > 150, c + " 横轴无时间刻度"
        print("横轴时间刻度: PASS（样本 %d 日）" % rec_n)
    else:
        print("横轴时间刻度: 样本仅 %d 日，单刻度属正常（历史不可回补，逐日累积）" % rec_n)
    rows = pg.locator("#mo-tab tbody tr").count()
    assert rows >= 1, rows
    posts = pg.locator("#MO_POSTS").inner_text()
    assert "纳斯达克" in posts and "「" in posts
    print("表格行:", rows, "| 帖子样本字数:", len(posts))
    cav = pg.locator("#MO_CAVEAT").inner_text()
    assert "合成演示数据" in cav and "历史不可回补" in cav and "不构成投资建议" in cav
    print("caveat chars:", len(cav))

    # 范围切换
    pg.locator('#mo-range button[data-r="30"]').click()
    pg.wait_for_timeout(300)
    assert pg.evaluate("__ink('mo-main')") > 50
    pg.locator('#mo-range button[data-r="0"]').click()
    pg.wait_for_timeout(300)
    # 折叠重绘
    pg.locator("#collapseBtn").click(); pg.wait_for_timeout(300)
    pg.locator("#collapseBtn").click(); pg.wait_for_timeout(300)
    assert pg.evaluate("__ink('mo-main')") > 50

    for v, want in (("sth", "VIEW 03"), ("vix", "VIEW 07"),
                    ("erp", "VIEW 15"), ("review", "VIEW 19")):
        pg.locator('#NAV button[data-v="%s"]' % v).click()
        pg.wait_for_timeout(180)
        assert pg.locator("#HD_EYEBROW").inner_text() == want, (v, want)
    print("spot check sth03/mom08/vix07/erp15/review19: PASS")
    real = [e for e in errs if "favicon" not in e.lower()]
    print("ERRORS:", real if real else "none")
    assert not real, real
    pg.locator('#NAV button[data-v="mom"]').click()
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(ROOT / "A股市场结构工作台_散户反向指数.png"))
    b.close()
print("MOM PREVIEW ALL PASS")
