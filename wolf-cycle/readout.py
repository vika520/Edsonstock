import pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
HERE=pathlib.Path(__file__).resolve().parent
CHROME=r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path=CHROME,args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1600,"height":1000},device_scale_factor=1)
    errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto((ROOT/"A股市场结构工作台.html").as_uri(),wait_until="load")
    pg.wait_for_timeout(600)
    for v in ["rotate","volume","etf","daily"]:
        pg.locator('#NAV button[data-v="%s"]'%v).click();pg.wait_for_timeout(350)
        pg.evaluate("""(v)=>{const e=document.getElementById('V_'+v);e.scrollTop=e.scrollHeight;}""",v)
        pg.wait_for_timeout(250)
        pg.screenshot(path=str(HERE/("wb_%s_bottom.png"%v)))
        print("==",v,"scrollHeight",pg.evaluate("(v)=>document.getElementById('V_'+v).scrollHeight",v))
    print("ROT DEC:")
    for d in pg.locator(".dec").all() if False else []: pass
    pg.locator('#NAV button[data-v="rotate"]').click();pg.wait_for_timeout(300)
    for i,c in enumerate(pg.locator("#ROT_DEC .dec").all()):
        print("  card",i+1,"|",c.inner_text().replace("\n"," / ")[:400])
    print("ROT table first 3:")
    for r in pg.locator("#rot-tab tbody tr").all()[:3]: print("  "," | ".join(r.locator("td").all_inner_texts()))
    pg.locator('#NAV button[data-v="volume"]').click();pg.wait_for_timeout(300)
    print("VOL KPI labels/values:",list(zip(pg.locator("#VOL_KPI .kpi .k").all_inner_texts(),pg.locator("#VOL_KPI .kpi .v").all_inner_texts())))
    print("VOL last event row:"," | ".join(pg.locator("#vol-tab tbody tr").first.locator("td").all_inner_texts()))
    pg.locator('#NAV button[data-v="etf"]').click();pg.wait_for_timeout(300)
    print("ETF verdict:",pg.locator("#ETF_VERDICT .card-b").inner_text().replace("\n"," / ")[:260])
    pg.locator('#NAV button[data-v="daily"]').click();pg.wait_for_timeout(300)
    print("DAY KPI:",list(zip(pg.locator("#DAY_KPI .kpi .k").all_inner_texts(),pg.locator("#DAY_KPI .kpi .v").all_inner_texts())))
    print("DAY last row:"," | ".join(pg.locator("#day-tab tbody tr").first.locator("td").all_inner_texts()))
    print("ERRORS:",errs or "none")
    b.close()
