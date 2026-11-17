import urllib.request, json, time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
def t(n,u):
    try:
        r=urllib.request.Request(u,headers={"User-Agent":UA,"Referer":"https://gu.qq.com/"})
        b=urllib.request.urlopen(r,timeout=12).read()
        try:
            j=json.loads(b.decode('utf-8','ignore'))
            node=(j.get('data') or {})
            k=list(node)[0] if isinstance(node,dict) and node else '?'
            inner=node.get(k,{}) if isinstance(node,dict) else {}
            keys=[z for z in inner if isinstance(inner[z],list)]
            print(n,"OK",len(b),"keys",keys[:6])
            for z in keys[:3]:
                print("   ",z,"len",len(inner[z]),"sample",inner[z][:1],"last",inner[z][-1:])
        except Exception as e: print(n,"OK-raw",b[:150])
    except Exception as e: print(n,"FAIL",type(e).__name__,str(e)[:80])
base="https://web.ifzq.gtimg.cn/appstock/app/kline/mkline?param={}"
for p in ["sh000001,m30,,320","sh000001,m60,,320","sh000001,m15,,320","sh000001,m5,,320","sh510300,m30,,320","sh510300,m60,,320"]:
    t(p,base.format(p))
t("week","https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,week,,,320,")
