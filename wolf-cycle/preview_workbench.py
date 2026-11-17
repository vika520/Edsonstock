"""六栏工作台：Playwright 渲染 / 交互冒烟 / 运行时错误检查 / 截图。"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HERE = pathlib.Path(__file__).resolve().parent
HTML = ROOT / "A股市场结构工作台.html"
CHROME = r"C:\Users\Admin\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
VIEWS = ["wave", "breadth", "rotate", "volume", "etf", "daily", "wyckoff"]

CANVAS_JS = """(id)=>{
  const c=document.getElementById(id); if(!c) return 'missing';
  const x=c.getContext('2d'), d=x.getImageData(0,0,c.width,c.height).data;
  let n=0; for(let i=3;i<d.length;i+=400){ if(d[i]>0) n++; }
  return n;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.5,
                      accept_downloads=True)
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    page.on("console", lambda m: errs.append("console." + m.type + ": " + m.text)
            if m.type == "error" else None)
    page.goto(HTML.as_uri(), wait_until="load")
    page.wait_for_timeout(900)

    def canvas_count(v):
        return page.evaluate("""(v)=>{
          const s=document.getElementById('V_'+v);
          return Array.from(s.querySelectorAll('canvas')).map(c=>{
            const x=c.getContext('2d');
            let n=0; const d=x.getImageData(0,0,c.width,c.height).data;
            for(let i=3;i<d.length;i+=400) if(d[i]>0) n++;
            return c.id+':'+n;
          });
        }""", v)

    for v in VIEWS:
        page.locator('#NAV button[data-v="%s"]' % v).click()
        page.wait_for_timeout(650 if v in ("wave", "breadth") else 350)
        shot = HERE / ("wb_%s.png" % v)
        page.screenshot(path=str(shot))
        title = page.locator("#HD_TITLE").inner_text()
        if v in ("wave", "breadth"):
            fr = page.frame_locator("#FRAME_%s" % v)
            inner = fr.locator("body").inner_text()[:70].replace("\n", " ")
            print("[%s] %s | iframe: %s" % (v, title, inner))
            assert fr.locator("canvas").count() > 0, v + " iframe canvas missing"
        else:
            cv = canvas_count(v)
            print("[%s] %s | %s" % (v, title, " ".join(cv)))
            assert cv and all(":0" not in s for s in cv), v + " blank canvas"
        print("   shot", shot.name)

    # ---- 03 板块轮动交互 ----
    page.locator('#NAV button[data-v="rotate"]').click(); page.wait_for_timeout(250)
    n0 = page.locator("#rot-tab tbody tr").count()
    page.locator('#rot-cat button[data-c="概念"]').click()
    n1 = page.locator("#rot-tab tbody tr").count()
    page.locator("#rot-sort").select_option("r5")
    page.locator("#rot-q").fill("电池")
    n2 = page.locator("#rot-tab tbody tr").count()
    print("ROT rows all/concept/search:", n0, n1, n2)
    print("ROT dec:", " | ".join(page.locator("#ROT_DEC .dec .h .t").all_inner_texts()))
    top_with = page.locator("#ROT_DEC .dec").first.locator(".row .nm").first.inner_text()
    page.locator("#rot-noattr").uncheck(); page.wait_for_timeout(120)
    top_without = page.locator("#ROT_DEC .dec").first.locator(".row .nm").first.inner_text()
    page.locator("#rot-noattr").check()
    print("ROT attr filter on/off top1:", top_with.strip(), "/", top_without.strip())
    page.locator("#rot-q").fill("")
    page.locator('#rot-cat button[data-c="全部"]').click()
    page.locator("#rot-scatter").hover(position={"x": 400, "y": 150})
    page.wait_for_timeout(150)
    print("ROT tooltip:", page.locator("#TIP").is_visible())

    # ---- 04 放量信号交互 ----
    page.locator('#NAV button[data-v="volume"]').click(); page.wait_for_timeout(250)
    print("VOL KPI:", " | ".join(page.locator("#VOL_KPI .kpi .v").all_inner_texts()))
    print("VOL rows@1.20:", page.locator("#vol-tab tbody tr").count())
    page.locator('#vol-thr button[data-t="1.50"]').click(); page.wait_for_timeout(200)
    print("VOL rows@1.50:", page.locator("#vol-tab tbody tr").count())
    page.locator('#vol-thr button[data-t="1.20"]').click()
    page.locator("#vol-first").check(); page.wait_for_timeout(200)
    print("VOL rows first-only:", page.locator("#vol-tab tbody tr").count())
    page.locator("#vol-first").uncheck()
    page.locator("#vol-tab tbody tr").nth(3).click(); page.wait_for_timeout(200)
    print("VOL window:", page.locator("#VOL_WINLABEL").inner_text())
    page.locator('#vol-range button[data-r="0"]').click(); page.wait_for_timeout(250)
    print("VOL after full-range canvas:", canvas_count("volume"))

    # ---- 05 国家队 ETF 交互 ----
    page.locator('#NAV button[data-v="etf"]').click(); page.wait_for_timeout(250)
    print("ETF KPI:", " | ".join(page.locator("#ETF_KPI .kpi .v").all_inner_texts()))
    print("ETF verdict:", page.locator("#ETF_VERDICT .card-b").inner_text()[:150].replace("\n", " "))
    print("ETF guard rows:", page.locator("#etf-gtab tbody tr").count(),
          "| all rows:", page.locator("#etf-atab tbody tr").count())
    page.locator('#etf-grp button[data-g="core"]').click()
    print("ETF core rows:", page.locator("#etf-atab tbody tr").count())
    page.locator('#etf-range button[data-r="500"]').click(); page.wait_for_timeout(250)
    print("ETF hist 500 canvas:", canvas_count("etf"))

    # ---- 06 日度全景交互 ----
    page.locator('#NAV button[data-v="daily"]').click(); page.wait_for_timeout(250)
    print("DAY KPI:", " | ".join(page.locator("#DAY_KPI .kpi .v").all_inner_texts()))
    print("DAY table rows:", page.locator("#day-tab tbody tr").count())
    page.locator('#day-range button[data-r="250"]').click(); page.wait_for_timeout(250)
    print("DAY 250 canvas:", canvas_count("daily"))

    # ---- 07 威科夫吸筹交互 ----
    page.locator('#NAV button[data-v="wyckoff"]').click(); page.wait_for_timeout(300)
    print("WY phase:", page.locator("#WY_INFO .card-b").inner_text()[:130].replace("\n", " / "))
    print("WY events:", page.locator("#wy-evcount").inner_text(),
          "| legend rows:", page.locator("#wy-legend tbody tr").count())
    for tf in ["30", "60", "15", "1200", "240"]:
        page.locator('#wy-tf button[data-t="%s"]' % tf).click(); page.wait_for_timeout(130)
        print("  tf", tf, "->", page.locator("#wy-evcount").inner_text(),
              "| canvas", canvas_count("wyckoff"))
    page.locator("#wy-sym").select_option("sh510300")
    page.locator("#wy-win").select_option("90")
    page.locator("#wy-rev").select_option("0.04")
    page.locator("#wy-volk").select_option("1.8")
    page.locator("#wy-labels").uncheck()
    page.wait_for_timeout(200)
    print("WY after ETF/params:", page.locator("#wy-evcount").inner_text(),
          "| phase:", page.locator("#WY_INFO .card-b").inner_text()[:60].replace("\n", " "),
          "| canvas", canvas_count("wyckoff"))
    page.locator("#wy-labels").check()
    page.locator("#wy-sym").select_option("sh000001")
    page.locator("#wy-win").select_option("60")
    page.locator("#wy-rev").select_option("0.025")
    page.locator("#wy-volk").select_option("1.4")
    page.wait_for_timeout(200)
    page.evaluate("""()=>{const e=document.getElementById('V_wyckoff');
                         e.scrollTop=e.scrollHeight;}""")
    page.wait_for_timeout(200)
    page.screenshot(path=str(HERE / "wb_wyckoff_bottom.png"))

    # ---- 侧栏折叠 ----
    side_w0 = page.locator(".side").evaluate("e=>e.getBoundingClientRect().width")
    page.locator("#collapseBtn").click(); page.wait_for_timeout(350)
    page.screenshot(path=str(HERE / "wb_collapsed.png"))
    side_w1 = page.locator(".side").evaluate("e=>e.getBoundingClientRect().width")
    ml1 = page.locator(".main").evaluate("e=>getComputedStyle(e).marginLeft")
    print("COLLAPSE: width %.0f -> %.0f, main margin %s, collapsed=%s"
          % (side_w0, side_w1, ml1, page.locator(".side").evaluate("e=>e.classList.contains('collapsed')")))
    print("  after collapse canvas:", canvas_count("wyckoff"))
    page.locator('#NAV button[data-v="volume"]').click(); page.wait_for_timeout(250)
    page.locator('#NAV button[data-v="wyckoff"]').click(); page.wait_for_timeout(250)
    page.locator("#collapseBtn").click(); page.wait_for_timeout(350)
    print("  expand -> width", page.locator(".side").evaluate("e=>e.getBoundingClientRect().width"))
    assert side_w1 < side_w0 - 100, "折叠未生效"

    # 最终交付图：7 个栏目各一张
    names = {"wave": "狼波周期指数", "breadth": "双冰点情绪", "rotate": "板块轮动",
             "volume": "放量信号", "etf": "ETF 日度申赎", "daily": "日度全景",
             "wyckoff": "威科夫吸筹"}
    for v, nm in names.items():
        page.locator('#NAV button[data-v="%s"]' % v).click()
        page.wait_for_timeout(600 if v in ("wave", "breadth") else 300)
        page.screenshot(path=str(ROOT / ("A股市场结构工作台_%s.png" % nm)))

    print("ERRORS:", errs if errs else "none")
    b.close()
