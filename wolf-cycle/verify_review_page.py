"""独立单篇复盘报告点检：本地离线文件 + NAS 固定链接。

校验标题、大盘 KPI、全栏汇总分节（含 TMT 单列）、短线/中长线建议、免责与渲染错误，
并导出本地报告的整页长图。
"""
import json
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 动态取最新复盘日期，避免写死某一天导致盘后更新后点检失效
_RV = json.load(open(ROOT / "wolf-cycle" / "data" / "reviews.json", encoding="utf-8"))
_LATEST = max((r.get("date") or "") for r in (_RV.get("reviews") or [{}]))
LOCAL = ROOT / ("每日复盘_%s.html" % _LATEST)
import hosts
REMOTE = hosts.site_url() + "/review-latest.html"
PNG = ROOT / ("每日复盘_%s_独立报告.png" % _LATEST)
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"


def check(pg, label, errs):
    h1 = pg.locator("h1").inner_text()
    kpi = pg.locator(".kpi").count()
    sec = pg.locator(".sec").count()
    box = pg.locator(".adv .box").count()
    li = pg.locator(".adv li").count()
    note = pg.locator(".note").inner_text()
    print("[%s] H1 %d 字：%s ..." % (label, len(h1), h1[:64]))
    print("[%s] KPI %d | 分节 %d | 建议框 %d | 建议条目 %d | 免责 %d 字" %
          (label, kpi, sec, box, li, len(note)))
    assert kpi == 6, "大盘 KPI 不是 6 个"
    assert sec == 18, "17栏汇总 + TMT 单列不是 18 节"
    assert box == 2 and li >= 12, "短线/中长线建议缺失"
    assert "上证" in h1 and "栏速览" in h1 and "ERP" in h1, "标题未汇总大盘、全栏与 ERP"
    assert "证伪场景" in pg.content(), "缺少证伪场景"
    assert "不构成" in pg.content() or "投资建议" in note, "缺少免责"
    # 长历史可得性清单：能补的与拿不到的都要显式列出
    hist = pg.locator(".hist")
    assert hist.count() == 1, "缺少长历史可得性清单"
    assert hist.locator(".col.ok .row").count() >= 3, "已回补项不足"
    assert hist.locator(".col.no .row").count() >= 3, "不可回补项不足"
    body = pg.content()
    for w in ("TMT 交易拥挤度", "炸板率", "ETF 日度份额"):
        assert w in body, "清单缺关键项: " + w
    print("[%s] 历史清单: 可回补 %d 项 / 不可回补 %d 项" %
          (label, hist.locator(".col.ok .row").count(), hist.locator(".col.no .row").count()))
    real = [e for e in errs if "favicon" not in e.lower()]
    print("[%s] ERRORS: %s" % (label, real if real else "none"))
    assert not real, real


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1100, "height": 1000}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)

    pg.goto(LOCAL.as_uri(), wait_until="load", timeout=60000)
    pg.wait_for_timeout(500)
    check(pg, "LOCAL", errs)
    pg.screenshot(path=str(PNG), full_page=True)
    print("PNG:", PNG.name, "%.0f KB" % (PNG.stat().st_size / 1024),
          "| 页面高", pg.evaluate("document.body.scrollHeight"), "px")

    errs.clear()
    pg.goto(REMOTE, wait_until="load", timeout=60000)
    pg.wait_for_timeout(600)
    check(pg, "NAS", errs)
    print("REMOTE URL:", pg.url)
    b.close()
print("ALL PASS")
