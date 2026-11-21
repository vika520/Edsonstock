"""第 16 栏「每日复盘」（永远末尾）Playwright 点检：文章列表、缩略图、正文、建议、无错误。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "A股市场结构工作台.html"
PNG = ROOT / "A股市场结构工作台_每日复盘.png"
LIST_PNG = ROOT / "A股市场结构工作台_复盘文章列表.png"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.goto(HTML.as_uri() + "#review", wait_until="load", timeout=120000)
    pg.wait_for_timeout(1400)

    print("HTML: %.2f MB" % (HTML.stat().st_size / 1024 / 1024))
    print("NAV:", pg.locator("#NAV button").count(), "| HEAD:", pg.locator("#HD_TITLE").inner_text())
    assert pg.locator("#NAV button").count() == 17, "菜单不是 17 栏"
    assert "复盘" in pg.locator("#HD_TITLE").inner_text()

    items = pg.locator("#rv-list .rv-item")
    print("ARTICLES:", items.count(), "|", pg.locator("#rv-count").inner_text())
    assert items.count() >= 1, "文章列表为空"
    print("THUMB:", pg.locator("#rv-list .rv-thumb").count(),
          "| spark svg:", pg.locator("#rv-list .rv-thumb svg").count(),
          "| day:", pg.locator("#rv-list .rv-thumb .dd").first.inner_text())
    assert pg.locator("#rv-list .rv-thumb svg").count() >= 1, "缩略图缺日期走势"
    print("TITLE:", pg.locator(".rv-h1").inner_text()[:150])
    t = pg.locator(".rv-h1").inner_text()
    assert "上证" in t and "栏速览" in t and "ERP" in t, "标题未汇总大盘、全栏与 ERP"
    print("SNAPSHOT KPI:", pg.locator(".rv-kpis .kpi").count())
    assert pg.locator(".rv-kpis .kpi").count() == 6
    secs = pg.locator("#rv-detail .rv-sec")
    print("SECTIONS:", secs.count(), "| names:",
          [x.strip() for x in secs.locator("> .h > .t").all_inner_texts()][:8])
    assert secs.count() >= 17, "16栏汇总 + TMT 单列 + 生成机制不足"
    detail = pg.locator("#rv-detail").inner_text()
    for key in ["一、16栏数据汇总", "二、操作参考", "短线", "中长线", "触发条件", "证伪场景", "不是投资建议"]:
        assert key in detail, "正文缺失: " + key
    print("ADVICE boxes:", pg.locator(".rv-adv .box").count(),
          "| bullets:", pg.locator(".rv-adv li").count())
    assert pg.locator(".rv-adv .box").count() == 2
    cav = pg.locator("#RV_CAVEAT").inner_text()
    print("CAVEAT:", len(cav), "chars | 未来函数:", "未来函数" in cav,
          "| 不显著:", "不显著" in cav)
    assert "未来函数" in cav and "不是投资建议" in cav

    # 点击文章（即使只有 1 篇也要能重绘）
    items.first.click()
    pg.wait_for_timeout(300)
    assert pg.locator("#rv-list .rv-item.on").count() == 1
    print("CLICK OK | meta:", pg.locator("#rv-meta").inner_text())

    # 其它栏目未被破坏
    for view, probe in (("flow", "#FL_KPI .kpi"), ("wyckoff", "#WY_INFO")):
        pg.locator('#NAV button[data-v="%s"]' % view).click()
        pg.wait_for_timeout(600)
        print("VIEW", view, "probe:", pg.locator(probe).count())
        assert pg.locator(probe).count() >= 1
    pg.locator('#NAV button[data-v="review"]').click()
    pg.wait_for_timeout(500)

    # 折叠后重绘
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(400)
    assert pg.locator(".rv-h1").count() == 1
    pg.locator("#collapseBtn").click()
    pg.wait_for_timeout(400)

    # 截图：文章列表局部 + 完整长图
    pg.locator(".rv-wrap").screenshot(path=str(LIST_PNG))
    print("PNG:", LIST_PNG.name, "%.0f KB" % (LIST_PNG.stat().st_size / 1024))
    pg.evaluate("""() => {
      const v=document.getElementById('V_review');
      v.style.position='static'; v.style.overflow='visible'; v.style.height='auto';
      const mb=document.querySelector('.mbody'); mb.style.position='static'; mb.style.overflow='visible';
      const mn=document.querySelector('.main'); mn.style.height='auto';
      document.body.style.height='auto';
    }""")
    pg.evaluate("MODS.review.draw()")
    pg.wait_for_timeout(500)
    pg.screenshot(path=str(PNG), full_page=True)
    print("PNG:", PNG.name, "%.0f KB" % (PNG.stat().st_size / 1024),
          "| height", pg.evaluate("document.documentElement.scrollHeight"))
    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    b.close()
print("ALL PASS")
