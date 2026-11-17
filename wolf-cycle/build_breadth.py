"""把涨跌家数 + 上证收盘对齐，内嵌进模板生成单文件 HTML。"""
import datetime
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

B = json.load(open(os.path.join(HERE, "data", "breadth.json"), encoding="utf-8"))
I = json.load(open(os.path.join(HERE, "data", "indices.json"), encoding="utf-8"))
px = {r[0]: r[1] for r in I["indices"]["sh000001"]["rows"]}

rows = B["rows"]
missing = [r[0] for r in rows if r[0] not in px]
assert not missing, f"指数收盘缺日期: {missing[:5]}"

payload = {
    "d": [r[0] for r in rows],
    "dn": [r[1] for r in rows],
    "up": [r[2] for r in rows],
    "fl": [r[3] for r in rows],
    "tt": [r[4] for r in rows],
    "px": [px[r[0]] for r in rows],
    "meta": {
        "breadthSource": B["source"],
        "indexSource": I["source"],
        "crosscheck": I["crosscheck"],
        "start": rows[0][0], "end": rows[-1][0], "bars": len(rows),
        "fetchedAt": datetime.date.today().isoformat(),
    },
}
data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

tpl = open(os.path.join(HERE, "template_breadth.html"), encoding="utf-8").read()
assert "__DATA__" in tpl
html = tpl.replace("__DATA__", data_json)
import brand
html = brand.apply(html)   # title / favicon 统一注入
out = os.path.join(ROOT, "A股双冰点情绪指标.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("saved:", out, round(os.path.getsize(out) / 1024, 1), "KB")

js = html.split("<script>\n")[1].split("</script>")[0]
with open(os.path.join(HERE, "breadth.js"), "w", encoding="utf-8") as f:
    f.write(js)
print("bars:", len(rows), rows[0][0], "~", rows[-1][0])
