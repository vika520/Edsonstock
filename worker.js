// 根路径 "/" 直接返回完整工作台，与 NAS 站点 index.html=workbench.html 的行为一致。
// 直接读取 ASSETS 中的工作台对象并把正文作为响应返回，避免 307 改写地址栏 URL。
// 其余路径交给 ASSETS 静态服务（各报告页 / favicon / 数据 JSON）。
const HOME_KEY = "A股市场结构工作台.html";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      const asset = await env.ASSETS.fetch(new URL("/" + HOME_KEY, url).toString());
      if (asset.ok) {
        return new Response(asset.body, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-cache"
          }
        });
      }
      return asset;
    }
    return env.ASSETS.fetch(request);
  }
};
