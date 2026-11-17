"""回测报告 Playwright 点检 + 整页截图。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "威科夫吸筹结构_近三年回测.html"
PNG = ROOT / "威科夫吸筹结构_近三年回测.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1280, "height": 1000}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(HTML.as_uri(), wait_until="load")
    pg.wait_for_timeout(500)
    text = pg.inner_text("body")
    need = ["没有未来函数", "66.7%", "25.0%", "未来函数自检",
            "等价性验证", "单因子参数敏感性", "2024-09-19", "免责声明"]
    missing = [w for w in need if w not in text]
    bad = [w for w in ("None", "nan", "undefined", "Infinity") if w in text]
    print("HTML:", HTML.name, round(HTML.stat().st_size / 1024, 1), "KB")
    print("tables:", pg.locator("table").count(), "| svg:", pg.locator("svg").count(),
          "| li:", pg.locator("li").count())
    print("missing key text:", missing or "none")
    print("bad placeholders:", bad or "none")
    print("ERRORS:", errs or "none")
    pg.screenshot(path=str(PNG), full_page=True)
    print("screenshot:", PNG.name, round(PNG.stat().st_size / 1024, 1), "KB")
    b.close()
    if errs or missing or bad:
        raise SystemExit(1)
