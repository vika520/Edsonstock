"""远端 NAS 站点复盘栏点检（真实 HTTP）。

栏数 / 复盘编号 / 分节数全部由 status.json 的 views 字段驱动，不写死数字，
这样以后新增数据栏目、复盘自动后移时本脚本仍然有效。
"""
import json
import urllib.request
from playwright.sync_api import sync_playwright

import hosts
_SITE = hosts.site_url()
STATUS = _SITE + "/status.json"
URL = _SITE + "/#review"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"

st = json.loads(urllib.request.urlopen(STATUS, timeout=15).read().decode("utf-8"))
print("STATUS asof:", st.get("asof"), "| reviews:", json.dumps(st.get("reviews", {}), ensure_ascii=False))
VIEWS = st.get("views") or {}
NAV_N = int(VIEWS.get("count") or 16)
SECS = int((st.get("reviews") or {}).get("sections") or 16)
print("VIEWS count:", NAV_N, "| 末尾:", (VIEWS.get("order") or [])[-1:],
      "| reviewViewNo:", VIEWS.get("reviewViewNo"), "| sections:", SECS)
# 「每日复盘永远在菜单末尾」是硬约束：新增栏目时编号由 views.json 自动后移
assert (VIEWS.get("order") or [])[-1:] == ["review"], "复盘不在菜单末尾"
assert VIEWS.get("reviewViewNo") == NAV_N, "复盘编号不等于栏目总数"
assert VIEWS.get("dataViews") == NAV_N - 1, "数据栏目数不等于总数-1"
assert st.get("reviews", {}).get("count", 0) >= 1, "复盘篇数异常"
assert st.get("reviews", {}).get("latest") == st.get("asof")
assert st.get("reviews", {}).get("sections") >= 19, "复盘分节数异常"
assert st.get("reviews", {}).get("viewNo") == NAV_N, "复盘编号与 status.views 不一致"
assert st.get("erp", {}).get("locked") is True
assert st.get("tmt", {}).get("ratio") is not None
assert st.get("flow", {}).get("rows", 0) > 0
assert st.get("wyckoff", {}).get("multiSegment")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs, notfound = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("response", lambda r: notfound.append((r.status, r.url)) if r.status >= 400 else None)
    pg.goto(URL, wait_until="load", timeout=180000)
    pg.wait_for_timeout(1800)
    print("URL:", URL)
    print("NAV:", pg.locator("#NAV button").count(), "| HEAD:", pg.locator("#HD_TITLE").inner_text())
    assert pg.locator("#NAV button").count() == NAV_N, "菜单栏数与 status.views 不一致"
    assert pg.locator("#NAV button").last.get_attribute("data-v") == "review", "复盘不在菜单末尾"
    assert pg.locator("#HD_EYEBROW").inner_text() == "VIEW %02d" % NAV_N
    print("ARTICLES:", pg.locator("#rv-list .rv-item").count(),
          "| NEXT:", pg.locator(".rv-next").count(),
          "| thumb svg:", pg.locator("#rv-list .rv-thumb svg").count())
    assert pg.locator("#rv-list .rv-item").count() == st["reviews"]["count"]
    assert pg.locator(".rv-next").count() == 1
    t = pg.locator(".rv-h1").inner_text()
    print("TITLE:", t[:110])
    assert "上证" in t and "栏速览" in t and "ERP" in t
    print("SEC:", pg.locator("#rv-detail .rv-sec").count(),
          "| ADVICE:", pg.locator(".rv-adv .box").count(),
          "| KPI:", pg.locator(".rv-kpis .kpi").count())
    assert pg.locator("#rv-detail .rv-sec").count() >= SECS
    assert pg.locator(".rv-adv .box").count() == 2
    for view, probe in (("flow", "#FL_KPI .kpi"), ("wyckoff", "#WY_INFO"),
                        ("erp", "#EP_KPI .kpi")):
        pg.locator('#NAV button[data-v="%s"]' % view).click()
        pg.wait_for_timeout(600)
        ok = pg.locator(probe).count() >= 1
        print("VIEW", view, ok)
        assert ok
    print("TMT 表 / 图:", pg.locator("#fl-tmttab tbody tr").count(),
          "|", pg.locator("#fl-tmtsum").inner_text())
    assert pg.locator("#fl-tmttab tbody tr").count() >= 10
    print("HTTP >=400:", notfound if notfound else "none")
    # 浏览器内部 favicon 请求不经过 page response 事件，属于无害噪声
    errs = [e for e in errs if "Failed to load resource" not in e or notfound]
    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    assert not [u for s, u in notfound if "favicon" not in u.lower()], notfound
    b.close()
print("NAS REVIEW VERIFY PASS")
