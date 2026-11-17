"""菜单分组标签点检：编号固定、按钮数不变、分组标题、折叠态、VIEW 文案、无错误。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
PNG = ROOT / "A股市场结构工作台_分组菜单.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"

EXPECT_NO = {
    "wave": "01", "wyckoff": "02", "breadth": "03", "flow": "04", "sentiment": "05",
    "volume": "06", "etf": "07", "daily": "08", "derivatives": "09", "leverage": "10",
    "rotate": "11", "erp": "12", "valuation": "13", "events": "14", "cross": "15",
    "review": "16",
}
GROUPS = ["趋势与结构", "情绪与广度", "资金与杠杆", "估值与宏观", "每日复盘"]
# 分组后的菜单显示顺序
DISPLAY = ["wave", "wyckoff", "breadth", "flow", "sentiment",
           "volume", "etf", "daily", "derivatives", "leverage",
           "rotate", "erp", "valuation", "events", "cross", "review"]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#wave", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1400)

    btns = pg.locator("#NAV button")
    n = btns.count()
    print("NAV button count:", n)
    assert n == 16, "按钮数不是 16（分组标题误用了 button）"

    vs = [btns.nth(i).get_attribute("data-v") for i in range(n)]
    nos = [btns.nth(i).locator(".no").inner_text() for i in range(n)]
    print("显示顺序:", vs)
    print("显示编号:", nos)
    assert vs == DISPLAY, "菜单分组显示顺序不符: %s" % vs
    for v, no in zip(vs, nos):
        assert no == EXPECT_NO[v], "%s 编号变成 %s，应为 %s" % (v, no, EXPECT_NO[v])
    # 核心：菜单从上到下编号必须连续 01~16，不能有跳号
    want_seq = [str(i).zfill(2) for i in range(1, 17)]
    assert nos == want_seq, "菜单编号不连续: %s（应为 %s）" % (nos, want_seq)
    print("菜单编号连续 01-16: PASS")
    assert btns.last.get_attribute("data-v") == "review", "复盘不在末尾"
    assert btns.last.locator(".no").inner_text() == "16", "复盘编号不是 16"
    print("固定编号 01-16: ALL PASS")

    grps = pg.locator("#NAV .navgrp")
    gn = [grps.nth(i).locator(".gn").inner_text() for i in range(grps.count())]
    print("分组标题:", gn)
    assert gn == GROUPS, "分组标题不符: %s" % gn
    assert grps.count() == 5
    print("分组标题 5 组: PASS")

    # 每个分组标题后面紧跟该组第一个按钮：用 DOM 顺序核对
    seq = pg.evaluate("""() => Array.from(document.querySelectorAll('#NAV > *'))
        .map(e => e.tagName === 'BUTTON' ? 'B:' + e.dataset.v : 'G:' + e.querySelector('.gn').textContent)""")
    print("DOM 序列:", seq[:12], "...")

    # 深链 + VIEW 文案：分组重排不应改变任何栏目编号
    for v, want in [("erp", "VIEW 12"), ("flow", "VIEW 04"), ("wyckoff", "VIEW 02"),
                    ("derivatives", "VIEW 09"), ("review", "VIEW 16")]:
        pg.locator('#NAV button[data-v="%s"]' % v).click()
        pg.wait_for_timeout(200)
        eyebrow = pg.locator("#HD_EYEBROW").inner_text()
        assert eyebrow == want, "%s 的 eyebrow=%s，应为 %s" % (v, eyebrow, want)
    print("VIEW 编号文案: ALL PASS")

    # 各栏 canvas 仍可绘制（分组 DOM 变化不应影响 MODS 绑定）
    pg.locator('#NAV button[data-v="erp"]').click()
    pg.wait_for_timeout(300)
    pg.evaluate("MODS.erp && MODS.erp.draw()")
    pg.locator('#NAV button[data-v="flow"]').click()
    pg.wait_for_timeout(300)
    pg.evaluate("MODS.flow && MODS.flow.draw()")

    # 折叠态：分组标题文字隐藏，只剩细线；按钮仍 16
    pg.locator('#NAV button[data-v="wave"]').click()
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(PNG), full_page=False)
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(350)
    assert pg.locator(".side.collapsed").count() == 1
    assert pg.locator("#NAV button").count() == 16
    vis = pg.locator("#NAV .navgrp .gn").first.is_visible()
    h = pg.locator("#NAV .navgrp").first.bounding_box()
    print("折叠态分组文字可见:", vis, "| 细线高度:", round(h["height"], 1) if h else None)
    assert not vis, "折叠态分组文字未隐藏"
    assert h and h["height"] <= 3, "折叠态分组标题未收成细线"
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(300)

    real = [e for e in errs if "favicon" not in e.lower()]
    print("ERRORS:", real if real else "none")
    assert not real, real
    b.close()
print("PNG:", PNG.name, round(PNG.stat().st_size / 1024), "KB")
print("GROUPS PREVIEW ALL PASS")
