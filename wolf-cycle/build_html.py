"""把行情数据内嵌进模板，生成可离线打开的单文件 HTML。"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
data = open(os.path.join(HERE, "data", "indices.json"), encoding="utf-8").read()

assert "__DATA__" in tpl, "模板缺少数据占位符"
html = tpl.replace("__DATA__", data)
import brand
html = brand.apply(html)   # title / favicon 统一注入

out = os.path.join(ROOT, "A股狼波周期指数走势图.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("saved:", out)
print("size:", round(os.path.getsize(out) / 1024, 1), "KB")

# 顺便导出纯 JS 供语法检查
js = html.split("<script>\n")[1].split("</script>")[0]
with open(os.path.join(HERE, "chart.js"), "w", encoding="utf-8") as f:
    f.write(js)
