import urllib.request, time, json
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
def t(n,u,ref="https://gu.qq.com/"):
    for k in range(3):
        try:
            r=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":ref})
            b=urllib.request.urlopen(r,timeout=10).read()
            print(n,"OK",len(b),b[:90]); return
        except Exception as e:
            if k==2: print(n,"FAIL",type(e).__name__,str(e)[:70])
            time.sleep(0.4)
P="sh000001,day,,,12,"
for n,u in [
 ("tx-web","https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param="+P),
 ("tx-plain","https://ifzq.gtimg.cn/appstock/app/fqkline/get?param="+P),
 ("tx-web-noref","https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param="+P+"&r=0.123"),
 ("sina-idx","https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh000001&scale=240&datalen=12"),
]: t(n,u)
