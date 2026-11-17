import urllib.request, json, time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
def t(n,u,ref="https://finance.sina.com.cn/"):
    try:
        r=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":ref})
        b=urllib.request.urlopen(r,timeout=12).read()
        try:
            j=json.loads(b.decode('utf-8','ignore'))
            if isinstance(j,list):
                print(n,"OK list",len(j),"first",j[0] if j else None,"last",j[-1] if j else None)
            else: print(n,"OK",str(j)[:180])
        except Exception: print(n,"OK-raw",b[:160])
    except Exception as e: print(n,"FAIL",type(e).__name__,str(e)[:80])
S="https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={}&scale={}&datalen={}"
for s in ["5","15","30","60","240","1200"]:
    t("sina sh000001 scale="+s,S.format("sh000001",s,320))
t("sina etf 30m",S.format("sh510300","30",320))
t("sina etf 60m",S.format("sh510300","60",320))
t("sina sz399006 30m",S.format("sz399006","30",320))
# 腾讯备用域名 / 其它分钟线路径
for n,u in [
 ("tx-mkline-plain","https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=sh000001,m30,,320"),
 ("tx-mkline-4comma","https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param=sh000001,m30,,,320"),
 ("em-klt30","https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000001&fields1=f1,f2&fields2=f51,f52,f53,f54,f55,f56&klt=30&fqt=1&lmt=100"),
]:
    t(n,u,"https://gu.qq.com/")
