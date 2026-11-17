import urllib.request, json, ssl
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
urls = [
 ("em_board_kline","https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=90.BK0475&fields1=f1,f2,f3&fields2=f51,f52,f53,f57&klt=101&fqt=1&end=20500101&lmt=30"),
 ("em_board_list","https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&fid=f3&fs=m:90+t:2&fields=f12,f14,f3,f6"),
 ("sina_board_kline","https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh601636&scale=240&datalen=20"),
 ("tx_board_kline","https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh601636,day,,,30,"),
 ("sina_hy_hist","https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php"),
]
ctx=ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
for name,u in urls:
    try:
        req=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":"https://finance.sina.com.cn/"})
        r=urllib.request.urlopen(req,timeout=8,context=ctx)
        b=r.read()
        print(name,"OK",r.status,len(b),b[:160])
    except Exception as e:
        print(name,"FAIL",type(e).__name__,str(e)[:100])
