"""渲染双冰点情绪指标页，截图并检查交互与运行时错误。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股双冰点情绪指标.html"
CHROME = r"C:\Users\Admin\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1500, "height": 1000}, device_scale_factor=2)
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    page.on("console", lambda m: errs.append("console." + m.type + ": " + m.text) if m.type == "error" else None)
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(1000)
    page.screenshot(path=str(ROOT / "wolf-cycle" / "breadth_full.png"), full_page=True)
    page.locator("#chartbox").screenshot(path=str(ROOT / "A股双冰点情绪指标_图表.png"))
    print("PAGE ERRORS:", errs if errs else "none")
    print("TOP:", page.locator("#sym").inner_text(), page.locator("#last").inner_text(), page.locator("#chg").inner_text())
    print("METRICS:", page.locator("#metrics").inner_text().replace("\n", " | "))
    print("EV SUB:", page.locator("#evSub").inner_text())
    print("EV TABLE:")
    for row in page.locator("#evTable tbody tr").all():
        print("   ", " | ".join(row.locator("td").all_inner_texts()))
    print("EV LIST ROWS:", page.locator("#evList tbody tr").count())
    print("VERDICT:", page.locator("#verdict").inner_text()[:220])

    # 交互冒烟
    with page.expect_download() as dl:
        page.locator("#exportBtn").click()
    print("EXPORT:", dl.value.suggested_filename)
    page.locator('#modeBtns button[data-v="ratio"]').click()
    page.locator('#rangeBtns button[data-v="all"]').click()
    page.locator('#streakBtns button[data-v="3"]').click()
    page.wait_for_timeout(400)
    print("AFTER SWITCH:", page.locator("#evSub").inner_text())
    print("RATIO EV ROWS:", page.locator("#evList tbody tr").count())
    page.screenshot(path=str(ROOT / "wolf-cycle" / "breadth_ratio.png"), full_page=True)
    page.locator('#modeBtns button[data-v="abs"]').click()
    page.locator('#streakBtns button[data-v="2"]').click()
    page.locator('#rangeBtns button[data-v="3y"]').click()
    page.mouse.move(700, 260)
    page.wait_for_timeout(250)
    print("TIP VISIBLE:", page.locator("#tip").is_visible())
    print("ERRORS AFTER:", errs if errs else "none")
    b.close()
