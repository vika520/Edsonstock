import urllib.request, json, ssl
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
base="https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={}&scale=240&datalen=25"
syms=["new_blhy","bk0475","sh000001","sh601636","gn_rgzn","new_dqhy"]
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
for s in syms:
    try:
        req=urllib.request.Request(base.format(s),headers={"User-Agent":UA,"Referer":"https://finance.sina.com.cn/"})
        b=urllib.request.urlopen(req,timeout=8,context=ctx).read()
        try:
            j=json.loads(b.decode('utf-8','ignore')); print(s,"OK",type(j).__name__,len(j), (j[0] if isinstance(j,list) and j else str(j)[:80]))
        except Exception: print(s,"OK-raw",b[:100])
    except Exception as e: print(s,"FAIL",type(e).__name__,str(e)[:80])
