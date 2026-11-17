"""第 04 栏「市场宽度与拥挤度」Playwright 点检：渲染、读数、控件、无控制台错误。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
PNG = ROOT / "A股市场结构工作台_宽度与拥挤度.png"
READ_PNG = ROOT / "A股市场结构工作台_宽度当日读数.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
CANVAS = ["fl-adl", "fl-mcc", "fl-nhnl", "fl-trin", "fl-udvol", "fl-obvad", "fl-rs", "fl-crowd"]

PROBE = """
function __ink(id){
  var c=document.getElementById(id); if(!c) return -1;
  var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  var n=0; for(var i=3;i<d.length;i+=40) if(d[i]>0) n++; return n;
}
function __hash(id){
  var c=document.getElementById(id); if(!c) return '';
  var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  var h=0; for(var i=0;i<d.length;i+=997) h=(h*31+d[i])>>>0; return String(h);
}
"""


def ink(pg, cid):
    return pg.evaluate("__ink('" + cid + "')")


def hsh(pg, cid):
    return pg.evaluate("__hash('" + cid + "')")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#flow", wait_until="load", timeout=120000)
    pg.wait_for_timeout(1400)
    pg.add_script_tag(content=PROBE)

    print("HTML: %.2f MB" % (HTML.stat().st_size / 1024 / 1024))
    print("NAV buttons:", pg.locator("#NAV button").count())
    assert pg.locator("#NAV button").count() == 16, "菜单不是 16 栏"
    print("HEAD:", pg.locator("#HD_TITLE").inner_text(), "|", pg.locator("#HD_EYEBROW").inner_text())
    assert "宽度" in pg.locator("#HD_TITLE").inner_text()

    kpi = pg.locator("#FL_KPI .kpi")
    print("KPI count:", kpi.count(), "|", " / ".join(kpi.all_inner_texts()[:3]).replace("\n", " "))
    assert kpi.count() == 6
    dec = pg.locator("#FL_DEC").inner_text()
    print("DEC head:", dec.split("\n")[0:3])
    assert "当日结构判读" in dec and "分位" in dec

    inkmap = {c: ink(pg, c) for c in CANVAS}
    print("CANVAS ink:", inkmap)
    bad = [k for k, v in inkmap.items() if v is None or v < 50]
    assert not bad, "有画布未绘制: %s" % bad

    print("TABLE rows:", pg.locator("#fl-tab tbody tr").count())
    assert pg.locator("#fl-tab tbody tr").count() == 22
    cov = pg.locator("#fl-cover").inner_text()
    print("COVER:", cov)
    assert "家数序列" in cov and "逐股序列" in cov
    cav = pg.locator("#FL_CAVEAT").inner_text()
    print("CAVEAT chars:", len(cav), "| 未来函数:", "未来函数" in cav,
          "| TRIN 反直觉:", "TRIN 在极端普跌日" in cav,
          "| 幸存者偏差:", "幸存者偏差" in cav)
    assert "未来函数" in cav and "幸存者偏差" in cav

    # 控件切换：图形必须真实变化，且无异常
    h0 = hsh(pg, "fl-adl")
    pg.select_option("#fl-range", "0")
    pg.wait_for_timeout(500)
    h1 = hsh(pg, "fl-adl")
    print("range 250→全部 ADL hash:", h0, "→", h1, "| changed:", h0 != h1)
    assert h0 != h1, "切到全部区间后 ADL 未重绘"

    hn0 = hsh(pg, "fl-nhnl")
    pg.select_option("#fl-nh", "250")
    pg.wait_for_timeout(400)
    hn1 = hsh(pg, "fl-nhnl")
    print("NH 60→250 label:", pg.locator("#fl-nhlabel").inner_text(), "| changed:", hn0 != hn1)
    assert pg.locator("#fl-nhlabel").inner_text() == "250 日窗口"

    rs0 = hsh(pg, "fl-rs")
    pg.select_option("#fl-rsbase", "sh000300")
    pg.wait_for_timeout(400)
    rs1 = hsh(pg, "fl-rs")
    print("RS 上证→沪深300 changed:", rs0 != rs1)
    assert rs0 != rs1

    for r in ("120", "600", "250"):
        pg.select_option("#fl-range", r)
        pg.wait_for_timeout(250)
    print("range 120/600/250 OK")

    # tooltip 冒烟
    box = pg.locator("#fl-trin").bounding_box()
    pg.locator("#fl-trin").scroll_into_view_if_needed()
    box = pg.locator("#fl-trin").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.5)
    pg.wait_for_timeout(250)
    print("TOOLTIP:", pg.locator("#TIP").inner_text().replace("\n", " | ")[:130])

    # 折叠后重绘
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(400)
    print("collapsed side width:", pg.locator(".side").evaluate("e=>getComputedStyle(e).width"))
    assert ink(pg, "fl-crowd") > 50
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(400)

    pg.select_option("#fl-range", "250")
    pg.select_option("#fl-nh", "60")
    pg.select_option("#fl-rsbase", "sh000001")
    pg.wait_for_timeout(500)

    # 当日读数局部图（KPI + 判读卡）
    pg.evaluate("document.getElementById('V_flow').scrollTop=0")
    pg.wait_for_timeout(200)
    a = pg.locator("#FL_KPI").bounding_box()
    bb = pg.locator("#FL_DEC").bounding_box()
    pg.screenshot(path=str(READ_PNG), clip={
        "x": min(a["x"], bb["x"]) - 6, "y": a["y"] - 6,
        "width": max(a["width"], bb["width"]) + 12,
        "height": bb["y"] + bb["height"] - a["y"] + 12})
    print("PNG:", READ_PNG.name, "%.0f KB" % (READ_PNG.stat().st_size / 1024))

    # 完整长图：临时把 .view 从绝对定位改为流式，才能截到全部 8 张图
    pg.evaluate("""() => {
      const v=document.getElementById('V_flow');
      v.style.position='static'; v.style.overflow='visible'; v.style.height='auto';
      const mb=document.querySelector('.mbody'); mb.style.position='static'; mb.style.overflow='visible';
      const mn=document.querySelector('.main'); mn.style.height='auto';
      document.body.style.height='auto';
    }""")
    pg.evaluate("MODS.flow.draw()")
    pg.wait_for_timeout(700)
    pg.screenshot(path=str(PNG), full_page=True)
    print("PNG:", PNG.name, "%.0f KB" % (PNG.stat().st_size / 1024),
          "| page height", pg.evaluate("document.documentElement.scrollHeight"))

    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    b.close()
print("ALL PASS")
