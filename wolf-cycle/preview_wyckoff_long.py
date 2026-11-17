"""第 02 栏全历史多段 + 缩放平移点检。"""
import pathlib
import re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
PNG = ROOT / "A股市场结构工作台_威科夫全历史.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"


def shown(text):
    m = re.search(r"当前显示 ([\d,]+) 根", text)
    return int(m.group(1).replace(",", "")) if m else None


def visible(text):
    m = re.search(r"可视 (\S+) ~ (\S+)", text)
    return (m.group(1), m.group(2)) if m else (None, None)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(HTML.as_uri() + "#wyckoff", wait_until="load")
    pg.wait_for_timeout(1000)

    print("HTML: %.2f MB" % (HTML.stat().st_size / 1024 / 1024))
    cover = pg.locator("#wy-cover").inner_text()
    info = pg.locator("#WY_INFO").inner_text()
    evcount = pg.locator("#wy-evcount").inner_text()
    rows = pg.locator("#wy-evtab tbody tr").count()
    print("COVER:", cover)
    print("EVCOUNT:", evcount, "| table rows:", rows)
    print("seg in info:", "识别区间" in info, "| phase C:", "Phase C" in info)
    cur = pg.locator("#wy-evtab tbody tr").filter(has_text="当前").count()
    hist = pg.locator("#wy-evtab tbody tr").filter(has_text="历史").count()
    print("当前段事件:", cur, "| 历史段事件:", hist)
    assert "Phase C" in info, "当前判读漂移"
    assert cur == 6, "当前段事件数不是 6"
    assert hist > 0, "没有历史事件被标出"
    assert rows > 6, "事件表未列出全历史"

    pg.locator("#wy-chart").scroll_into_view_if_needed()
    pg.wait_for_timeout(250)
    box = pg.locator("#wy-chart").bounding_box()
    cx, cy = box["x"] + box["width"] * 0.55, box["y"] + box["height"] * 0.5
    print("canvas box y=%.0f, point=(%.0f,%.0f)" % (box["y"], cx, cy))
    pg.mouse.move(cx, cy)

    print("\n--- 滚轮缩放 ---")
    n0 = shown(pg.locator("#wy-cover").inner_text())
    pg.mouse.wheel(0, -400)
    pg.wait_for_timeout(300)
    n1 = shown(pg.locator("#wy-cover").inner_text())
    pg.mouse.wheel(0, 400)
    pg.wait_for_timeout(300)
    n2 = shown(pg.locator("#wy-cover").inner_text())
    print("  默认 %s -> 放大 %s -> 缩小 %s" % (n0, n1, n2))
    assert n1 < n0 and n2 > n1, "滚轮缩放未生效"

    print("\n--- 拖拽平移 ---")
    v0 = visible(pg.locator("#wy-cover").inner_text())
    pg.mouse.move(cx, cy)
    pg.mouse.down()
    pg.mouse.move(cx + 260, cy, steps=10)
    pg.mouse.up()
    pg.wait_for_timeout(350)
    v1 = visible(pg.locator("#wy-cover").inner_text())
    print("  拖拽前可视:", v0, "-> 拖拽后:", v1)
    assert v1[0] != v0[0], "拖拽平移未生效"

    print("\n--- 双击 / 重置 ---")
    pg.mouse.dblclick(cx, cy)
    pg.wait_for_timeout(300)
    v2 = visible(pg.locator("#wy-cover").inner_text())
    print("  双击后:", v2)
    pg.locator("#wy-reset").click()
    pg.wait_for_timeout(350)
    print("  重置后:", pg.locator("#wy-cover").inner_text())
    assert shown(pg.locator("#wy-cover").inner_text()) == 750, "重置未回到 750 根"

    print("\n--- 5 周期切换（全历史段数） ---")
    for t, name in (("1200", "周线"), ("240", "日线"), ("60", "60分钟"),
                    ("30", "30分钟"), ("15", "15分钟")):
        pg.locator('#wy-tf button[data-t="%s"]' % t).click()
        pg.wait_for_timeout(500)
        c = pg.locator("#wy-cover").inner_text()
        print("  %-6s %s | 事件 %s" % (name, c[:96], pg.locator("#wy-evcount").inner_text()))
    pg.locator('#wy-tf button[data-t="240"]').click()
    pg.wait_for_timeout(450)

    pg.screenshot(path=str(PNG), full_page=True)
    print("\nscreenshot:", PNG.name, round(PNG.stat().st_size / 1024, 1), "KB")
    print("ERRORS:", errs or "none")
    b.close()
    if errs:
        raise SystemExit(1)
