"""验证：新浪全 A 列表能否复现 880005 的涨跌家数与成交额口径。"""
import urllib.request, json, time
from concurrent.futures import ThreadPoolExecutor
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
B="https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page={}&num=100&sort=symbol&asc=1&node=hs_a&symbol=&_s_r_a=page"
def get(u,t=15):
    r=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":"https://finance.sina.com.cn/"})
    return urllib.request.urlopen(r,timeout=t).read()
def page(i):
    for _ in range(2):
        try:
            return json.loads(get(B.format(i)).decode('utf-8','ignore'))
        except Exception: time.sleep(0.4)
    return []
t=time.time()
with ThreadPoolExecutor(max_workers=6) as ex:
    pages=list(ex.map(page,range(1,58)))
allrows=[r for p in pages for r in (p or [])]
# 去重
seen={}
for r in allrows: seen[r['symbol']]=r
rows=list(seen.values())
up=dn=fl=0; amt=0.0; nonum=0
for r in rows:
    try:
        c=float(r['changepercent']); a=float(r['amount'])
    except Exception: nonum+=1; continue
    amt+=a
    if c>0: up+=1
    elif c<0: dn+=1
    else: fl+=1
print("rows",len(rows),"pages",len(pages),"nonnum",nonum,"sec",round(time.time()-t,1))
print("sina  : up",up,"down",dn,"flat",fl,"total",up+dn+fl,"amount(亿)",round(amt/1e8,1))
print("880005: up 765 down 4748 flat 58 total 5579 amount(亿)",round(1667073572864/1e8,1))
