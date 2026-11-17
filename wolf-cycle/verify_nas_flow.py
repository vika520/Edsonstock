"""远端 NAS 站点第 04 栏点检（真实 HTTP，不是本地 file://）。"""
import json
import urllib.request
from playwright.sync_api import sync_playwright

import hosts
_SITE = hosts.site_url()
URL = _SITE + "/#flow"
STATUS = _SITE + "/status.json"
CHROME = r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
CANVAS = ["fl-adl", "fl-mcc", "fl-nhnl", "fl-trin", "fl-udvol", "fl-obvad", "fl-rs", "fl-crowd",
          "fl-tmt", "fl-tmtg"]
ERP_CANVAS = ["ep-main", "ep-px", "ep-point", "ep-prob"]
PROBE = """function __ink(id){var c=document.getElementById(id);if(!c)return -1;
var d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
var n=0;for(var i=3;i<d.length;i+=40)if(d[i]>0)n++;return n;}"""

st = json.loads(urllib.request.urlopen(STATUS, timeout=15).read().decode("utf-8"))
print("STATUS asof:", st.get("asof"), "| updatedAt:", st.get("updatedAt"))
print("  flow:", json.dumps(st.get("flow", {}), ensure_ascii=False)[:240])
print("  wyckoff:", st.get("wyckoff", {}).get("multiSegment"),
      st.get("wyckoff", {}).get("panZoom"))
assert st.get("flow", {}).get("rows", 0) > 0, "status.flow 缺失或行数异常"
assert st.get("wyckoff", {}).get("multiSegment"), "wyckoff 状态字段被冲掉"
print("  erp:", json.dumps(st.get("erp", {}), ensure_ascii=False)[:220])
print("  tmt:", json.dumps(st.get("tmt", {}), ensure_ascii=False)[:220])
assert st.get("erp", {}).get("locked") is True, "status.erp 缺失或未锁定"
assert st.get("tmt", {}).get("ratio") is not None, "status.tmt 缺失"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    notfound = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("response", lambda r: notfound.append((r.status, r.url)) if r.status >= 400 else None)
    pg.goto(URL, wait_until="load", timeout=180000)
    pg.wait_for_timeout(1800)
    pg.add_script_tag(content=PROBE)
    print("URL:", URL)
    print("NAV:", pg.locator("#NAV button").count(), "| HEAD:", pg.locator("#HD_TITLE").inner_text())
    assert pg.locator("#NAV button").count() == int((st.get("views") or {}).get("count") or 16), "菜单栏数与 status.views 不一致"
    assert "宽度" in pg.locator("#HD_TITLE").inner_text()
    print("KPI:", pg.locator("#FL_KPI .kpi").count(),
          "| DEC:", pg.locator("#FL_DEC").inner_text().split("\n")[0])
    assert pg.locator("#FL_KPI .kpi").count() == 6
    vals = {c: pg.evaluate("__ink('%s')" % c) for c in CANVAS}
    print("CANVAS ink:", vals)
    assert all(v > 50 for v in vals.values()), "有画布未绘制"
    print("TABLE rows:", pg.locator("#fl-tab tbody tr").count())
    assert pg.locator("#fl-tab tbody tr").count() == 22
    print("COVER:", pg.locator("#fl-cover").inner_text())
    pg.select_option("#fl-nh", "250")
    pg.wait_for_timeout(350)
    print("NH label:", pg.locator("#fl-nhlabel").inner_text())
    assert pg.locator("#fl-nhlabel").inner_text() == "250 日窗口"
    pg.select_option("#fl-rsbase", "sh000300")
    pg.wait_for_timeout(350)
    print("RS base:", pg.locator("#fl-rsbase").input_value(),
          "| TRIN tooltip element:", pg.locator("#fl-trin").count())
    print("TMT 明细行:", pg.locator("#fl-tmttab tbody tr").count(),
          "| 汇总:", pg.locator("#fl-tmtsum").inner_text())
    assert pg.locator("#fl-tmttab tbody tr").count() >= 10
    # 切到第 12 栏，确认 ERP 锁定数字与 4 张图都在
    pg.locator('#NAV button[data-v="erp"]').click()
    pg.wait_for_timeout(900)
    print("VIEW 12 ERP:", pg.locator("#EP_KPI").inner_text().replace("\n", " | ")[:180])
    ervals = {c: pg.evaluate("__ink('%s')" % c) for c in ERP_CANVAS}
    print("ERP CANVAS ink:", ervals)
    assert all(v > 50 for v in ervals.values()), "ERP 有画布未绘制"
    assert str(st["erp"]["erp"]) in pg.locator("#EP_DEC").inner_text()
    assert pg.locator("#ep-thtab tbody tr").count() == 4
    assert pg.locator("#ep-probtab tbody tr").count() == 3
    # 切回第 02 栏，确认没有把既有栏目弄坏
    pg.locator('#NAV button[data-v="wyckoff"]').click()
    pg.wait_for_timeout(800)
    print("VIEW 02:", "Phase C" in pg.locator("#WY_INFO").inner_text(),
          "| events:", pg.locator("#wy-evtab tbody tr").count())
    assert "Phase C" in pg.locator("#WY_INFO").inner_text()
    print("HTTP >=400:", notfound if notfound else "none")
    real404 = [u for s, u in notfound if "favicon" not in u.lower()]
    assert not real404, "真实资源 404: %s" % real404
    errs = [e for e in errs if not (e.startswith("console: Failed to load resource") and not real404)]
    print("ERRORS:", errs if errs else "none")
    assert not errs, errs
    b.close()
print("NAS VERIFY PASS")
