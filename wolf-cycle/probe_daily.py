import urllib.request, json, ssl, time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
def get(u,ref="https://finance.sina.com.cn/",t=10):
    try:
        r=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":ref})
        b=urllib.request.urlopen(r,timeout=t).read()
        return b
    except Exception as e: return b"ERR:"+str(e).encode()
tests=[
 ("tx_index_kline","https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,,,5,","https://gu.qq.com/"),
 ("tx_etf_kline","https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh510300,day,,,5,","https://gu.qq.com/"),
 ("tx_realtime","https://qt.gtimg.cn/q=sh000001,sh510300","https://gu.qq.com/"),
 ("sina_board_hy","https://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php","https://finance.sina.com.cn/"),
 ("sina_board_gn","https://money.finance.sina.com.cn/q/view/newFLJK.php?param=class","https://finance.sina.com.cn/"),
 ("sina_hq_all","https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=500&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page","https://finance.sina.com.cn/"),
 ("em_ulist","https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f104,f105,f106,f6&secids=1.000001","https://quote.eastmoney.com/"),
 ("sina_stock_kline","https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh601636&scale=240&datalen=25","https://finance.sina.com.cn/"),
]
for n,u,ref in tests:
    t=time.time(); b=get(u,ref)
    print(n,"len",len(b),"ms",int((time.time()-t)*1000),"|",b[:130])
