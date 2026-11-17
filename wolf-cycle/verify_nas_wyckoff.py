"""远端 NAS 站点第 02 栏长历史版点检（真实 HTTP，不是本地 file://）。"""
from playwright.sync_api import sync_playwright

import hosts
URL = hosts.site_url() + "/#wyckoff"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL, wait_until="load", timeout=90000)
    pg.wait_for_timeout(1200)
    print("URL:", URL)
    print("COVER:", pg.locator("#wy-cover").inner_text())
    info = pg.locator("#WY_INFO").inner_text()
    total = pg.locator("#wy-evtab tbody tr").count()
    cur = pg.locator("#wy-evtab tbody tr").filter(has_text="当前").count()
    print("Phase C:", "Phase C" in info,
          "| 当前段 6 事件:", cur == 6, "| 全历史事件:", total)
    print("VIEW:", pg.locator("#wy-view").input_value())
    print("CAVEAT 5001:", "5001" in pg.locator("#WY_CAVEAT").inner_text())
    print("EVCOUNT:", pg.locator("#wy-evcount").inner_text())
    print("HIST SEGMENTS:", "段结构" in pg.locator("#wy-cover").inner_text(),
          "| RESET BTN:", pg.locator("#wy-reset").count() == 1)
    c0 = pg.locator("#wy-cover").inner_text()
    pg.locator("#wy-chart").dispatch_event(
        "wheel", {"deltaY": -400, "clientX": 900, "clientY": 800,
                  "bubbles": True, "cancelable": True})
    pg.wait_for_timeout(400)
    c1 = pg.locator("#wy-cover").inner_text()
    print("WHEEL ZOOM:", "当前显示 600 根" in c1, "|", c1[-46:])
    assert c0 != c1, "远端滚轮缩放未生效"
    pg.locator('#wy-tf button[data-t="30"]').click()
    pg.wait_for_timeout(500)
    print("30min COVER:", pg.locator("#wy-cover").inner_text())
    pg.locator('#wy-tf button[data-t="240"]').click()
    pg.wait_for_timeout(400)
    print("ERRORS:", errs or "none")
    b.close()
    if errs:
        raise SystemExit(1)
