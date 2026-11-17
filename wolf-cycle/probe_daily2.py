import urllib.request, json, time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
def get(u,ref="https://finance.sina.com.cn/",t=15):
    r=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":ref})
    return urllib.request.urlopen(r,timeout=t).read()
B="https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page={}&num={}&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page"
for num in [100,500,1000]:
    try:
        b=get(B.format(1,num)); j=json.loads(b.decode('utf-8','ignore'))
        print("sina num=",num,"returned",len(j),"sample keys",list(j[0].keys())[:16])
        print("  sample:",{k:j[0][k] for k in list(j[0])[:12]})
    except Exception as e: print("sina num",num,"ERR",str(e)[:90])
# count pages needed
try:
    b=get("https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a")
    print("count api:",b[:200])
except Exception as e: print("count api ERR",str(e)[:80])
# eastmoney
for u in ["https://push2.eastmoney.com/api/qt/ulist.np/get?fields=f104,f105,f106,f6,f12,f14&secids=1.000001,0.399001",
          "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1&po=1&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f12,f14,f3"]:
    try:
        b=get(u,"https://quote.eastmoney.com/",10); print("EM:",b[:400])
    except Exception as e: print("EM ERR",str(e)[:90])
