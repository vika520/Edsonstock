"""EdsonStock 品牌资源统一入口。

单文件离线 HTML 不能依赖外部静态资源，因此附件 logo PNG 与重绘的 favicon SVG
全部以 base64 data URI 注入；所有页面的 <title> 统一为 EdsonStock。

用法：各 build 脚本在写出 HTML 前调用 brand.apply(html)。
"""
import base64
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
ROOT = os.path.dirname(HERE)

TITLE = "EdsonStock"
LOGO_PNG = os.path.join(ASSETS, "edsonstock-logo.png")
MARK_SVG = os.path.join(ASSETS, "favicon.svg")


def _b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def logo_href():
    """附件 logo（透明底白色线稿）的 data URI，供侧栏品牌位使用。"""
    return "data:image/png;base64," + _b64(LOGO_PNG)


def mark_href():
    """用 logo 右侧「递增柱 + 上升箭头」重绘的 SVG 小图标 data URI。"""
    return "data:image/svg+xml;base64," + _b64(MARK_SVG)


def favicon_link():
    return '<link rel="icon" type="image/svg+xml" href="%s">' % mark_href()


def apply(html):
    """统一注入品牌：title、favicon、侧栏 logo 与折叠态小图标。

    - <title> 一律改为 EdsonStock；
    - 模板自带 __FAVICON__ 占位符则替换，否则在 </head> 前插入 SVG favicon；
    - __LOGO__ / __MARK__ 分别替换为 logo PNG / 图标 SVG 的 data URI。
    """
    html = re.sub(r"<title>.*?</title>", "<title>%s</title>" % TITLE,
                  html, count=1, flags=re.S)
    if "__FAVICON__" in html:
        html = html.replace("__FAVICON__", favicon_link())
    elif 'rel="icon"' not in html:
        html = html.replace("</head>", favicon_link() + "\n</head>", 1)
    html = html.replace("__LOGO__", logo_href())
    html = html.replace("__MARK__", mark_href())
    return html


if __name__ == "__main__":
    # 自检：资源齐全、注入结果符合预期
    assert os.path.isfile(LOGO_PNG), LOGO_PNG
    assert os.path.isfile(MARK_SVG), MARK_SVG
    demo = '<html><head><title>旧标题</title></head><body><img src="__LOGO__"></body></html>'
    out = apply(demo)
    assert "<title>EdsonStock</title>" in out
    assert 'rel="icon" type="image/svg+xml"' in out
    assert "data:image/png;base64," in out
    print("brand OK | title=%s | mark=%d B | logo=%d B" %
          (TITLE, os.path.getsize(MARK_SVG), os.path.getsize(LOGO_PNG)))
