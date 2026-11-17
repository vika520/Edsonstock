"""用本地 Chromium 渲染单文件 HTML，截图并检查运行时错误。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股狼波周期指数走势图.html"
SHOT = ROOT / "wolf-cycle" / "preview.png"
CHROME = r"C:\Users\Admin\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1500, "height": 1000}, device_scale_factor=2)
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" else None)
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(1200)
    page.screenshot(path=str(SHOT), full_page=True)
    chart_png = ROOT / "A股狼波周期指数_图表.png"
    page.locator("#chartbox").screenshot(path=str(chart_png))
    print("CHART PNG:", chart_png)
    print("PAGE ERRORS:", errs if errs else "none")
    print("METRICS:", page.locator("#metrics").inner_text().replace("\n", " | "))
    print("TOP:", page.locator("#sym").inner_text(), page.locator("#last").inner_text(), page.locator("#chg").inner_text())
    print("STATUS:", page.locator("#statusInfo").inner_text())
    # hover 明细
    page.mouse.move(700, 300)
    page.wait_for_timeout(250)
    print("TIP VISIBLE:", page.locator("#tip").is_visible())
    with page.expect_download() as dl:
        page.locator("#exportBtn").click()
    print("EXPORT FILENAME:", dl.value.suggested_filename)
    page.screenshot(path=str(SHOT.parent / "preview_hover.png"), full_page=True)

    # 交互冒烟：切换指数 / 周期 / 模式 / 缩放
    page.locator('#idxBtns button[data-v="sh000001"]').click()
    page.locator('#tfBtns button[data-v="day"]').click()
    page.locator('#rangeBtns button[data-v="10y"]').click()
    page.locator('#modeBtns button[data-v="hindsight"]').click()
    page.mouse.move(20, 20)
    page.wait_for_timeout(500)
    print("AFTER SWITCH:", page.locator("#sym").inner_text(), "|", page.locator("#statusInfo").inner_text())
    print("ALERT VISIBLE:", page.locator("#alert").is_visible())
    page.screenshot(path=str(SHOT.parent / "preview_hindsight.png"), full_page=True)
    print("ERRORS AFTER SWITCH:", errs if errs else "none")
    b.close()
print("SHOT:", SHOT)
