"""通过 WorkBuddy 本地 MCP 代理直连通达信，批量拉取 880005「涨跌家数」历史并落盘。

数据源: 通达信 880005 指标日线（经当前会话已授权的 MCP 代理）
字段口径（经恒等式 Open+Close+Low≈High 验证）:
    Open = 下跌家数, Close = 上涨家数, Low = 平盘/停牌家数, High = 总品种数
"""
import json
import os
import urllib.request

CFG = json.loads(os.environ["CODEBUDDY_MCP_CONFIG"])["mcpServers"]["tdx-connector"]
URL = CFG["url"]
BASE_HEADERS = dict(CFG.get("headers") or {})
_session = {"id": None}


def rpc(method, params, notify=False):
    body = {"jsonrpc": "2.0", "method": method, "params": params}
    if not notify:
        body["id"] = 7
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **BASE_HEADERS,
    }
    if _session["id"]:
        headers["Mcp-Session-Id"] = _session["id"]
    req = urllib.request.Request(URL, data=json.dumps(body).encode("utf-8"), headers=headers)
    with urllib.request.urlopen(req, timeout=120) as r:
        sid = r.headers.get("Mcp-Session-Id")
        if sid:
            _session["id"] = sid
        raw = r.read().decode("utf-8", "ignore")
    if notify or not raw.strip():
        return None
    if raw.lstrip().startswith(("event:", "data:")) or "\ndata:" in raw:
        for line in raw.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        return None
    return json.loads(raw)


def init():
    r = rpc("initialize", {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "wolf-cycle", "version": "1.0"},
    })
    if r is None:
        return False
    if "error" in r:
        print("initialize error:", str(r["error"])[:200])
        return False
    print("initialize: ok")
    rpc("notifications/initialized", {}, notify=True)
    return True


def call_text(name, args):
    r = rpc("tools/call", {"name": name, "arguments": args})
    if not r:
        raise RuntimeError("empty rpc response")
    if "error" in r:
        raise RuntimeError(f"rpc error: {str(r['error'])[:300]}")
    return "\n".join(c.get("text", "") for c in r.get("result", {}).get("content", [])
                     if c.get("type") == "text")


def parse_rows(text):
    i = text.find("{")
    if i < 0:
        raise RuntimeError("no JSON in tool output: " + text[:200])
    doc, _ = json.JSONDecoder().raw_decode(text[i:])
    return doc.get("Rows", [])


def fetch_window(code, startxh, want=1000):
    txt = call_text("tdx_kline", {
        "code": code, "setcode": "1", "period": "4",
        "wantNum": str(want), "startxh": str(startxh), "tqFlag": "0",
    })
    rows = parse_rows(txt)
    out = []
    for r in rows:
        # [日期, 下跌, 上涨, 平盘, 总数]
        out.append([str(r["Data"]),
                    int(float(r["Open"])), int(float(r["Close"])),
                    int(float(r["Low"])), int(float(r["High"]))])
    return out


def main():
    if not init():
        raise RuntimeError("MCP initialize failed")
    merged = {}
    STEP = 700  # 服务端单页实际上限 700 根
    for code in ["880005"]:
        for start in range(0, 14000, STEP):
            try:
                rows = fetch_window(code, start, STEP)
            except Exception as e:
                print(f"{code} startxh={start} failed: {e}")
                break
            print(f"{code} startxh={start}: {len(rows)} rows",
                  rows[0][0] if rows else "", "~", rows[-1][0] if rows else "")
            if not rows:
                break
            for r in rows:
                merged[r[0]] = r
            if len(rows) < STEP:
                break
    data = [merged[k] for k in sorted(merged)]
    if len(data) < 200:
        raise RuntimeError(f"数据不足 ({len(data)})，终止，禁止编造行情")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "breadth.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({
            "source": "通达信 880005 涨跌家数指标日线（经 WorkBuddy MCP 代理）",
            "fields": ["date", "down", "up", "flat", "total"],
            "note": "Open=下跌家数, Close=上涨家数, Low=平盘/停牌, High=总品种数；由 Open+Close+Low≈High 校验",
            "rows": data,
        }, f, ensure_ascii=False, separators=(",", ":"))
    downs = [r[1] for r in data]
    ups = [r[2] for r in data]
    totals = [r[4] for r in data]
    print("TOTAL:", len(data), "根", data[0][0], "~", data[-1][0])
    print("总品种范围:", min(totals), "~", max(totals))
    print("下跌家数: min", min(downs), "max", max(downs), "  上涨家数: min", min(ups), "max", max(ups))
    print("下跌>=4000 天数:", sum(1 for d in downs if d >= 4000))
    print("恒等式残差范围:", min(t - d - u - f for _, d, u, f, t in data),
          "~", max(t - d - u - f for _, d, u, f, t in data))
    print("saved:", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
