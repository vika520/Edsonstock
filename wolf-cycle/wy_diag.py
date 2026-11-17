import pathlib, json
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
CHROME=r"C:/Users/Admin/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe"
with sync_playwright() as p:
    b=p.chromium.launch(headless=True,executable_path=CHROME,args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1600,"height":1000})
    pg.goto((ROOT/"A股市场结构工作台.html").as_uri(),wait_until="load")
    pg.wait_for_timeout(500)
    pg.locator('#NAV button[data-v="wyckoff"]').click();pg.wait_for_timeout(400)
    print("=== 判读卡 ===")
    print(pg.locator("#WY_INFO").inner_text())
    print("\n=== 事件明细（倒序） ===")
    for r in pg.locator("#wy-evtab tbody tr").all():
        print(" | ".join(r.locator("td").all_inner_texts()))
    wy=json.loads(pg.locator("#WYCK").text_content())
    rows=wy["bars"]["sh000001"]["240"]
    print("\n=== 日线最后 25 根 [日期, 开, 高, 低, 收] ===")
    for r in rows[-25:]: print(" ",r[0],r[1],r[2],r[3],r[4])
    print("\n总根数",len(rows),"首末",rows[0][0],rows[-1][0])
    b.close()
