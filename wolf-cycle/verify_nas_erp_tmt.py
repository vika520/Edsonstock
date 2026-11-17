"""远端 NAS 站点第 12 栏 ERP / 第 04 栏 TMT / 复盘同步点检（真实 HTTP）。

栏数 / 复盘编号 / 分节数由 status.json 的 views 字段驱动，不写死数字。
ERP 与 TMT 的锁定数字仍逐字校验（这两项是口径钉死的，不允许松动）。
"""
import json
import urllib.request
from playwright.sync_api import sync_playwright

import hosts
BASE = hosts.site_url() + "/"
STATUS = BASE + "status.json"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
INK = """function __ink(id){var c=document.getElementById(id);if(!c)return -1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
var n=0;for(var i=3;i<d.length;i+=40)if(d[i]>0)n++;return n;}"""


def head(url):
    try:
        with urllib.request.urlopen(url, timeout=15) as r:
            return r.status, len(r.read())
    except Exception as e:
        return "ERR", str(e)


st = json.loads(urllib.request.urlopen(STATUS, timeout=15).read().decode("utf-8"))
VIEWS = st.get("views") or {}
NAV_N = int(VIEWS.get("count") or 16)
SECS = int((st.get("reviews") or {}).get("sections") or 16)
print("STATUS asof:", st.get("asof"), "| VIEWS:", NAV_N,
      "| 末尾:", (VIEWS.get("order") or [])[-1:])
for k in ("erp", "tmt", "reviews", "flow", "wyckoff"):
    print("  %-8s %s" % (k, json.dumps(st.get(k, {}), ensure_ascii=False)[:250]))
assert (VIEWS.get("order") or [])[-1:] == ["review"], "复盘不在菜单末尾"
assert VIEWS.get("reviewViewNo") == NAV_N and VIEWS.get("dataViews") == NAV_N - 1
# ERP / TMT：锁定语义与口径完整性校验，具体数值随交易日由盘后任务按固定口径追加，
# 不再写死某一天的读数；lockedBase 必须存在，locked 必须为 True，series 非空。
assert st["erp"]["locked"] is True and st["erp"].get("lockedBase")
assert st["erp"].get("erp") and st["erp"].get("seriesRows", 0) > 0
assert st["tmt"].get("ratio") and st["tmt"].get("historyDays", 0) >= 1
assert st["reviews"]["sections"] >= 16 and st["reviews"]["count"] >= 1
assert st["reviews"]["viewNo"] == NAV_N, "复盘编号与 status.views 不一致"
assert st["flow"]["rows"] > 0 and st["wyckoff"]["multiSegment"]
_latest = (st.get("reviews") or {}).get("latest") or st.get("asof")
for n in ("index.html", "workbench.html", "review-latest.html", "review-%s.html" % _latest):
    code, size = head(BASE + n)
    print("HTTP %-26s %s %s" % (n, code, size))
    assert code == 200 and (not isinstance(size, int) or size > 5000)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs, notfound = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("response", lambda r: notfound.append((r.status, r.url)) if r.status >= 400 else None)
    pg.goto(BASE + "#erp", wait_until="load", timeout=180000)
    pg.wait_for_timeout(1800)
    pg.add_script_tag(content=INK)
    pg.evaluate("MODS.erp.draw()")
    pg.wait_for_timeout(300)

    print("NAV:", pg.locator("#NAV button").count(), "| HEAD:", pg.locator("#HD_TITLE").inner_text())
    assert pg.locator("#NAV button").count() == NAV_N, "菜单栏数与 status.views 不一致"
    assert pg.locator("#NAV button").last.get_attribute("data-v") == "review", "复盘不在菜单末尾"
    assert pg.locator("#EP_KPI .kpi").count() == 6
    alltxt = pg.locator("#V_erp").inner_text()
    _EP = st["erp"]
    # 核心锁定数字逐字取自 status.json（盘后按固定口径追加，不再写死某一天读数）
    for n in (str(_EP["erp"]), str(_EP["historyPercentile"]), str(_EP["peTtm"]),
              str(_EP["y10"]), _EP["tier"], "1250", "锁定"):
        assert n in alltxt, "锁定数字/口径缺失: " + n
    ink = {c: pg.evaluate("__ink('%s')" % c) for c in
           ("ep-main", "ep-px", "ep-point", "ep-prob")}
    print("ERP CANVAS ink:", ink)
    assert all(v > 50 for v in ink.values()), "ERP 有画布未绘制"
    assert pg.locator("#ep-thtab tbody tr").count() == 4
    assert pg.locator("#ep-probtab tbody tr").count() == 3
    assert pg.locator("#ep-tab tbody tr").count() == 22

    pg.locator('#NAV button[data-v="flow"]').click()
    pg.wait_for_timeout(750)
    tink = {c: pg.evaluate("__ink('%s')" % c) for c in ("fl-tmt", "fl-tmtg")}
    print("TMT CANVAS ink:", tink)
    assert all(v > 50 for v in tink.values()), "TMT 有画布未绘制"
    now = pg.locator("#fl-tmtnow").inner_text()
    print("TMT NOW:", now)
    assert "当日成交占比 %s%%" % st["tmt"]["ratio"] in now
    assert pg.locator("#fl-tmttab tbody tr").count() == 11

    pg.locator('#NAV button[data-v="review"]').click()
    pg.wait_for_timeout(600)
    t = pg.locator(".rv-h1").inner_text()
    print("REVIEW:", t[:110])
    assert "栏速览" in t and "ERP" in t and "TMT" in t
    assert pg.locator("#rv-detail .rv-sec").count() >= SECS
    assert pg.locator("#HD_EYEBROW").inner_text() == "VIEW %02d" % NAV_N

    real404 = [u for s_, u in notfound if "favicon" not in u.lower()]
    print("HTTP >=400:", notfound if notfound else "none")
    assert not real404, real404
    errs = [e for e in errs if not (e.startswith("console: Failed to load resource") and not real404)]
    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    b.close()
print("NAS ERP / TMT VERIFY PASS")
