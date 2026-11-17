/* ===== 08 市场宽度与拥挤度（资金流指标） =====
   全部指标由「逐只个股日线聚合 + 宽基指数 OHLCV」按公开公式计算，无比例分摊代理。
   见 fetch_flow.py 的 meta.formula；本文件只做展示，不修改原始数据口径。
*/
(function(){
const F = JSON.parse(document.getElementById('FLOW').textContent);
const T = JSON.parse(document.getElementById('TMT').textContent);
const S = {range:250, nhWin:60, rsBase:'sh000001'};
const RS_NAMES={sh000001:'上证指数',sz399001:'深证成指',sz399006:'创业板指',sh000300:'沪深300'};
const TMT_NAMES=['电子','通信','计算机','传媒'];
const TMT_COLORS=[C.up,C.accent,C.blue,C.purple];
/* TMT 当日锁定数字原样输出，不做二次取整 */
const traw = v => (v==null || !isFinite(v)) ? '—' : String(v);

/* ---------- 长序列：2016 起，全市场家数 + 指数 OHLCV ---------- */
const IX={};
Object.keys(F.idx||{}).forEach(c=>{
  const m={}; (F.idx[c]||[]).forEach(r=>{m[r[0]]=r;}); IX[c]=m;
});
const LDATE={}; M.d.forEach((d,i)=>LDATE[d]=i);
const L=(()=>{
  const n=M.n, d=M.d;
  const adl=new Array(n),rana=new Array(n),osc=new Array(n),sum=new Array(n),
        obv=new Array(n),ad=new Array(n),px=new Array(n),vol=new Array(n);
  const k19=2/20,k39=2/40;
  let a=0,sm=0,o=0,ads=0,e19=null,e39=null;
  for(let i=0;i<n;i++){
    const dt=d[i],u=M.up[i],dn=M.dn[i],fl=M.fl[i];
    a+=u-dn; adl[i]=a;
    rana[i]=(u-dn)/Math.max(1,u+dn+fl)*100;
    e19=e19==null?rana[i]:e19+(rana[i]-e19)*k19;
    e39=e39==null?rana[i]:e39+(rana[i]-e39)*k39;
    osc[i]=e19-e39; sm+=osc[i]; sum[i]=sm;
    const r=IX.sh000001[dt];
    px[i]=r?r[1]:(M.px[i]!=null?M.px[i]:null);
    vol[i]=r?r[4]:null;
    if(i>0&&px[i]!=null&&px[i-1]!=null&&vol[i]!=null) o+=Math.sign(px[i]-px[i-1])*vol[i];
    obv[i]=o;
    if(r){
      const c=r[1],h=r[2],l=r[3],v=r[4];
      ads+=(h>l?((2*c-h-l)/(h-l)):0)*v;
    }
    ad[i]=ads;
  }
  return {d,n,adl,rana,osc,sum,obv,ad,px,vol};
})();

/* ---------- 短序列：逐股聚合，约 600 交易日 ---------- */
const fi={}; F.fields.forEach((k,i)=>fi[k]=i);
const rows=F.rows||[];
const gv=(r,k)=>r[fi[k]];
const Q=(()=>{
  const d=rows.map(r=>r[0]),n=d.length;
  const up=rows.map(r=>gv(r,'up')),dn=rows.map(r=>gv(r,'dn')),fl=rows.map(r=>gv(r,'fl'));
  const uv=rows.map(r=>gv(r,'uv')),dv=rows.map(r=>gv(r,'dv'));
  const ew=rows.map(r=>gv(r,'ew'));
  const trin=rows.map(r=>(dn[0]!=null&&gv(r,'dn')>0&&gv(r,'uv')>0&&gv(r,'dv')>0)
    ?(gv(r,'up')/gv(r,'dn'))/(gv(r,'uv')/gv(r,'dv')):null);
  const udr=rows.map(r=>(gv(r,'dv')>0)?gv(r,'uv')/gv(r,'dv'):null);
  const trin10=ma(trin,10,0);
  const ewnav=[];let nav=1;
  for(let i=0;i<n;i++){if(ew[i]!=null)nav*=1+ew[i]/100;ewnav.push(nav);}
  const idxnav={};
  Object.keys(RS_NAMES).forEach(c=>{
    const m=IX[c]||{},base=m[d[0]]?m[d[0]][1]:null;
    let last=null;const arr=[];
    for(let i=0;i<n;i++){
      const r=m[d[i]];if(r)last=r[1];
      arr.push(base&&last?last/base:null);
    }
    idxnav[c]=arr;
  });
  return {d,n,up,dn,fl,uv,dv,ew,trin,trin10,udr,ewnav,idxnav,
    sum:d.map(dt=>LDATE[dt]==null?null:L.sum[LDATE[dt]]),
    adl:d.map(dt=>LDATE[dt]==null?null:L.adl[LDATE[dt]])};
})();

/* ---------- 因果历史分位（扩展窗口，只用 t 及之前，无未来函数） ---------- */
function pctExp(arr,minN){
  const out=new Array(arr.length).fill(null),win=[];
  for(let i=0;i<arr.length;i++){
    const v=arr[i];
    if(v==null||!isFinite(v))continue;
    win.push(v);
    if(win.length>=minN){let c=0;for(const z of win)if(z<=v)c++;out[i]=c/win.length;}
  }
  return out;
}
const nhPct=w=>rows.map(r=>{const e=gv(r,'e'+w);return e>0?gv(r,'nh'+w)/e*100:null;});
const nlPct=w=>rows.map(r=>{const e=gv(r,'e'+w);return e>0?gv(r,'nl'+w)/e*100:null;});
const COMPONENTS=(()=>{
  const pUD=pctExp(Q.udr,60),
        pNH=pctExp(nhPct(60),60),
        pSM=pctExp(Q.sum,60),
        pTR=(()=>{const p=pctExp(Q.trin,60);return p.map(v=>v==null?null:1-v);})(),
        pRS=pctExp(Q.ewnav.map((v,i)=>Q.idxnav.sh000300[i]?v/Q.idxnav.sh000300[i]:null),60);
  const crowd=new Array(Q.n).fill(null),parts=[];
  for(let i=0;i<Q.n;i++){
    const ps=[pUD[i],pNH[i],pSM[i],pTR[i],pRS[i]];
    parts.push(ps);
    if(ps.every(v=>v!=null)) crowd[i]=ps.reduce((a,b)=>a+b,0)/ps.length*100;
  }
  return {crowd,parts,pUD,pNH,pSM,pTR,pRS};
})();

/* ---------- 通用绘图引擎 ---------- */
function bounds(n){
  const len=S.range>0?Math.min(S.range,n):n;
  return [Math.max(0,n-len),n-1];
}
function autoY(arrs,padPct){
  let lo=Infinity,hi=-Infinity;
  arrs.forEach(a=>a.forEach(v=>{if(v!=null&&isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v;}}));
  if(!isFinite(lo))return {lo:-1,hi:1};
  if(lo===hi){lo-=1;hi+=1;}
  const p=(hi-lo)*(padPct||0.10);
  return {lo:lo-p,hi:hi+p};
}
function drawPanel(id,cfg){
  const o=CV(id);if(!o)return;
  const g=frame(o,{l:56,r:cfg.y2?54:14,t:16,b:26}),{x}=g;
  const s=cfg.s,e=cfg.e,n=Math.max(1,e-s+1);
  const X=i=>g.L+(n<=1?g.W/2:(i-s)/(e-s||1))*g.W;
  const yl=cfg.y,yr=cfg.y2||yl;
  const Y=(v,ax)=>{const q=ax==='right'?yr:yl;return g.B-(v-q.lo)/(q.hi-q.lo||1)*g.H;};
  yTicks(x,g,yl.lo,yl.hi,4,yl.fmt||f1);
  if(cfg.y2)for(let i=0;i<=4;i++){
    const v=yr.lo+(yr.hi-yr.lo)*i/4;
    txt(x,(yr.fmt||f1)(v),g.L+g.W+7,g.B-i/4*g.H,C.dim2,'left');
  }
  (cfg.bands||[]).forEach(b=>{
    const y1=Y(b.hi),y2=Y(b.lo);
    rect(x,g.L,y1,g.W,Math.max(1,y2-y1),b.color);
  });
  if(cfg.zero!==false)hline(x,g.L,g.L+g.W,Y(0),C.line2);
  (cfg.hlines||[]).forEach(h=>{
    hline(x,g.L,g.L+g.W,Y(h.v),h.color||C.line2,h.dash);
    if(h.label)txt(x,h.label,g.L+g.W-4,Y(h.v)-7,h.color||C.dim2,'right');
  });
  (cfg.bars||[]).forEach(b=>{
    const bw=Math.max(1,g.W/n*0.68);
    for(let i=s;i<=e;i++){
      const v=b.vals[i];if(v==null||!isFinite(v))continue;
      const y0=Y(0),y1=Y(v),top=Math.min(y0,y1),hh=Math.max(1,Math.abs(y1-y0));
      const col=typeof b.color==='function'?b.color(v,i):b.color;
      rect(x,X(i)-bw/2,top,bw,hh,col);
    }
  });
  (cfg.lines||[]).forEach(l=>{
    const pts=[];
    for(let i=s;i<=e;i++){
      const v=l.vals[i];if(v==null||!isFinite(v)){if(pts.length>1)poly(x,pts,l.color,l.width||1.5,l.dash);pts.length=0;continue;}
      pts.push([X(i),Y(v,l.axis)]);
    }
    if(pts.length>1)poly(x,pts,l.color,l.width||1.5,l.dash);
    if(l.fill&&pts.length>1){
      x.save();x.fillStyle=l.fill;x.globalAlpha=0.16;x.beginPath();
      x.moveTo(pts[0][0],Y(0,l.axis));
      pts.forEach(p=>x.lineTo(p[0],p[1]));
      x.lineTo(pts[pts.length-1][0],Y(0,l.axis));x.closePath();x.fill();x.restore();
    }
  });
  const step=Math.max(1,Math.round(n/7));
  for(let i=s;i<=e;i+=step)txt(x,dateFmt(cfg.dates[i]).slice(2),X(i),g.B+12,C.dim2,'center');
  let lx=g.L+6;
  (cfg.legend||[]).forEach(z=>{
    txt(x,'■ '+z[0],lx,g.T+9,z[1]);
    lx+=z[0].length*8+26;
  });
  if(cfg.hover)bindHover(id,(mx,my)=>{
    if(mx<g.L||mx>g.L+g.W)return null;
    const i=clamp(Math.round(s+(mx-g.L)/g.W*(e-s)),s,e);
    return cfg.hover(i,X(i));
  });
}
/* 相对「区间起点」归一化，以区间最大绝对波动为 100%。
   OBV / A-D / ADL 的起点可能为 0 或负数，不能用 v/base-1（会除零或翻转符号）。*/
function normDiff(arr,s,e){
  let base=null;
  for(let i=s;i<=e;i++) if(arr[i]!=null&&isFinite(arr[i])){base=arr[i];break;}
  if(base==null) return arr.map(()=>null);
  let scale=0;
  for(let i=s;i<=e;i++) if(arr[i]!=null&&isFinite(arr[i])) scale=Math.max(scale,Math.abs(arr[i]-base));
  if(scale<1e-9) scale=1;
  return arr.map(v=>(v==null||!isFinite(v))?null:(v-base)/scale*100);
}
function tipRow(k,v,col){return '<div>'+k+' <b'+(col?' style="color:'+col+'"':'')+'>'+v+'</b></div>';}

/* ---------- 当日 KPI / 判读 ---------- */
function drawKpi(){
  const i=Q.n-1,dt=Q.d[i],li=LDATE[dt];
  const trin=Q.trin[i],udr=Q.udr[i],cw=COMPONENTS.crowd[i];
  const n60=gv(rows[i],'nh60')-gv(rows[i],'nl60');
  const items=[
    ['ADL 当日增量',f0(Q.up[i]-Q.dn[i]),'涨 '+f0(Q.up[i])+' / 跌 '+f0(Q.dn[i]),cls(Q.up[i]-Q.dn[i])],
    ['麦克莱伦振荡',li!=null?f2(L.osc[li]):'—','RANA EMA19−EMA39',li!=null?cls(L.osc[li]):''],
    ['TRIN 阿姆斯',f2(trin),trin!=null?(trin<1?'<1 买盘占优':'>1 卖盘占优'):'—',trin!=null?(trin<1?'up':'down'):''],
    ['Up/Down 量比',f2(udr),'UV '+f2(Q.uv[i])+' / DV '+f2(Q.dv[i])+' 亿股',udr!=null?(udr>1?'up':'down'):''],
    ['NH−NL (60日)',f0(n60),'新高 '+f0(gv(rows[i],'nh60'))+' / 新低 '+f0(gv(rows[i],'nl60')),cls(n60)],
    ['拥挤度综合分',cw==null?'—':f1(cw),cw==null?'扩展窗口样本不足':(cw>=75?'偏拥挤':cw<=25?'偏冷清':'中性'),
      cw==null?'':(cw>=75?'up':cw<=25?'down':'amber')]
  ];
  $('#FL_KPI').innerHTML=items.map(z=>'<div class="kpi"><div class="k">'+z[0]+'</div>'+
    '<div class="v '+(z[3]||'')+'">'+z[1]+'</div><div class="s">'+z[2]+'</div></div>').join('');
}
function drawDec(){
  const i=Q.n-1,cw=COMPONENTS.crowd[i],ps=COMPONENTS.parts[i];
  const names=['Up/Down 量比','NH% (60日)','麦克莱伦合计','TRIN 反向','小盘相对强度'];
  const state=cw==null?'样本不足':(cw>=75?'偏拥挤 / 一致性过强':cw>=55?'温和偏热':cw>=45?'中性':cw>25?'温和偏冷':'偏冷清 / 广度低迷');
  const col=cw==null?C.dim:(cw>=75?C.up:cw<=25?C.down:C.accent);
  let h='<div class="card-h"><span class="t">当日结构判读 · '+dateFmt(Q.d[i])+'</span><span class="spacer"></span>'+
    '<span class="tag proxy">分位为扩展窗口（只用历史，无未来函数）</span></div><div class="card-b">';
  h+='<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px">'+
    '<span style="font:600 26px JetBrains Mono,monospace;color:'+col+'">'+(cw==null?'—':f1(cw))+'</span>'+
    '<span style="font-size:13px;color:'+col+'">'+state+'</span>'+
    '<span style="font-size:10.5px;color:var(--dim2)">0–100，5 个分项历史分位等权合成；≥75 偏拥挤，≤25 偏冷清</span></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">';
  names.forEach((nm,k)=>{
    const v=ps[k],w=v==null?0:v*100;
    h+='<div><div style="font-size:10px;color:var(--dim2);margin-bottom:5px">'+nm+'</div>'+
      '<div style="height:7px;background:#1b2431;border-radius:4px;overflow:hidden">'+
      '<div style="height:100%;width:'+f1(w)+'%;background:'+(v==null?C.dim2:(v>=0.75?C.up:v<=0.25?C.down:C.blue))+'"></div></div>'+
      '<div style="font:600 11px JetBrains Mono,monospace;margin-top:4px;color:var(--dim)">'+(v==null?'—':f0(w)+' 分位')+'</div></div>';
  });
  h+='</div>';
  // 背离提示
  const li=LDATE[Q.d[i]],dev=[];
  if(li!=null&&li>=20){
    const px20=L.px[li-20],pxNow=L.px[li];
    const adl20=L.adl[li-20],adlNow=L.adl[li];
    if(px20&&pxNow&&pxNow>px20&&adlNow<adl20)dev.push('指数 20 日上涨但 ADL 走低 → <b>广度背离</b>（上涨集中在大市值权重）');
    if(px20&&pxNow&&pxNow<px20&&adlNow>adl20)dev.push('指数 20 日下跌但 ADL 走高 → <b>广度正背离</b>（个股普遍抗跌）');
  }
  const trin=Q.trin[i];
  if(trin!=null&&trin>1.5)dev.push('TRIN &gt; 1.5：下跌股承接了不成比例的成交量，卖压偏重');
  if(trin!=null&&trin<0.7)dev.push('TRIN &lt; 0.7：上涨股放量明显，追涨一致性偏强');
  if(!dev.length)dev.push('未触发显著背离 / 极值条件');
  h+='<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:11.5px;line-height:1.9;color:var(--dim)">'+
    dev.map(z=>'· '+z).join('<br>')+'</div>';
  /* TMT 交易拥挤度：当日横截面摘要（历史分位需 ≥20 日样本，不提前给出） */
  const ts=T.snapshot||{},tg=T.groups||{},th=T.history||[];
  const tParts=TMT_NAMES.map(g=>g+' '+traw((tg[g]||{}).share)+'%').join(' / ');
  h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);font-size:11.5px;line-height:1.9;color:var(--dim)">'+
    '<b style="color:var(--accent)">TMT 交易拥挤度</b>：'+dateFmt(T.asof)+' 四大行业合计 '+
    traw(ts.tmtAmount)+' 亿 / 两市 '+traw(ts.marketAmount)+' 亿 ＝ <b style="color:var(--txt)">'+traw(ts.ratio)+'%</b>；'+
    tParts+'。历史样本仅 '+f0(th.length)+' 日'+
    (th.length<20?'，<b>不足 20 日，不输出历史分位，也不做「拥挤 / 冷清」的时序判断</b>':'，已可计算扩展窗口分位')+'。'+
    '<br>成交占比只衡量交易集中度，<b>不是资金净流入</b>；行业板块行情接口不含逐笔主动买卖方向。</div>';
  h+='</div>';
  $('#FL_DEC').innerHTML=h;
}

/* ---------- 8 张图 ---------- */
function drawAdl(){
  const [s,e]=bounds(L.n);
  const yy=autoY([L.adl.slice(s,e+1)],0.12);
  const py=autoY([L.px.slice(s,e+1)],0.12);
  drawPanel('fl-adl',{s,e,dates:L.d,y:yy,y2:Object.assign({},py,{fmt:v=>f0(v)}),
    zero:false,
    lines:[{vals:L.adl,color:C.accent,width:1.8},{vals:L.px,color:C.white,width:1.4,axis:'right'}],
    legend:[['ADL 腾落线',C.accent],['上证指数(右)',C.white]],
    hover:(i)=>'<b>'+dateFmt(L.d[i])+'</b>'+tipRow('ADL',f0(L.adl[i]))+
      tipRow('当日涨-跌',f0(M.up[i]-M.dn[i]),cls(M.up[i]-M.dn[i]))+
      tipRow('上证收盘',f2(L.px[i]))+tipRow('20日 ADL 变化',f0(L.adl[i]-L.adl[Math.max(0,i-20)]))});
}
function drawMcc(){
  const [s,e]=bounds(L.n);
  const yy=autoY([L.osc.slice(s,e+1)],0.15);
  let lo=Math.min(yy.lo,-Math.abs(yy.hi)),hi=Math.max(yy.hi,Math.abs(yy.lo));
  const sy=autoY([L.sum.slice(s,e+1)],0.12);
  drawPanel('fl-mcc',{s,e,dates:L.d,y:{lo,hi,fmt:v=>f1(v)},y2:Object.assign({},sy,{fmt:v=>f0(v)}),
    bands:[{lo:hi*0.55,hi:hi,color:'#e8453c0c'},{lo:lo,hi:lo*0.55,color:'#22a06b0c'}],
    bars:[{vals:L.osc,color:v=>v>=0?'#e8453c99':'#22a06b99'}],
    lines:[{vals:L.sum,color:C.blue,width:1.8,axis:'right'}],
    legend:[['OSC 柱(左)',C.accent],['SUM 合计(右)',C.blue]],
    hover:(i)=>'<b>'+dateFmt(L.d[i])+'</b>'+tipRow('RANA',f2(L.rana[i]))+
      tipRow('OSC',f2(L.osc[i]),cls(L.osc[i]))+tipRow('SUM',f0(L.sum[i]))+
      tipRow('涨/跌',f0(M.up[i])+' / '+f0(M.dn[i]))});
}
function drawNhnl(){
  const [s,e]=bounds(Q.n),w=S.nhWin;
  const nh=rows.map(r=>gv(r,'nh'+w)),nl=rows.map(r=>-gv(r,'nl'+w));
  const net=rows.map(r=>gv(r,'nh'+w)-gv(r,'nl'+w));
  const yy=autoY([nh.slice(s,e+1),nl.slice(s,e+1)],0.14);
  const py=autoY([net.slice(s,e+1)],0.2);
  const lb=$('#fl-nhlabel'); if(lb) lb.textContent=w+' 日窗口';
  drawPanel('fl-nhnl',{s,e,dates:Q.d,y:yy,y2:Object.assign({},py,{fmt:v=>f0(v)}),
    bars:[{vals:nh,color:'#e8453caa'},{vals:nl,color:'#22a06baa'}],
    lines:[{vals:net,color:C.accent,width:1.6,axis:'right'}],
    legend:[['NH'+w,C.up],['-NL'+w,C.down],['净额(右)',C.accent]],
    hover:(i)=>'<b>'+dateFmt(Q.d[i])+'</b>'+tipRow('新高 '+w+'日',f0(gv(rows[i],'nh'+w)),C.up)+
      tipRow('新低 '+w+'日',f0(gv(rows[i],'nl'+w)),C.down)+
      tipRow('有效样本',f0(gv(rows[i],'e'+w)))+
      tipRow('NH% / NL%',f2(nhPct(w)[i])+'% / '+f2(nlPct(w)[i])+'%')});
}
function drawTrin(){
  const [s,e]=bounds(Q.n);
  const yy=autoY([Q.trin.slice(s,e+1).map(v=>v==null?null:Math.min(v,3)),Q.trin10.slice(s,e+1)],0.1);
  const hi=Math.max(2.0,yy.hi);
  drawPanel('fl-trin',{s,e,dates:Q.d,y:{lo:Math.max(0,yy.lo),hi,fmt:v=>f2(v)},
    bands:[{lo:0,hi:0.8,color:'#e8453c0b'},{lo:1.2,hi:hi,color:'#22a06b0b'}],
    hlines:[{v:1,color:C.accent,dash:[4,4],label:'TRIN = 1'}],
    lines:[{vals:Q.trin,color:C.blue,width:1.3},{vals:Q.trin10,color:C.accent,width:1.8}],
    legend:[['TRIN',C.blue],['TRIN MA10',C.accent]],
    hover:(i)=>'<b>'+dateFmt(Q.d[i])+'</b>'+tipRow('TRIN',f2(Q.trin[i]),Q.trin[i]<1?C.up:C.down)+
      tipRow('MA10',f2(Q.trin10[i]))+tipRow('涨/跌家数',f0(Q.up[i])+' / '+f0(Q.dn[i]))+
      tipRow('UV/DV',f2(Q.uv[i])+' / '+f2(Q.dv[i])+' 亿股')});
}
function drawUdvol(){
  const [s,e]=bounds(Q.n);
  const uv=Q.uv,dv=Q.dv.map(v=>-v),net=Q.uv.map((v,i)=>v-Q.dv[i]);
  const yy=autoY([uv.slice(s,e+1),dv.slice(s,e+1)],0.12);
  let lo=Math.min(yy.lo,-Math.abs(yy.hi)),hi=Math.max(yy.hi,Math.abs(yy.lo));
  // UV/DV 在极端普涨日可达 10× 以上，画到边界并保留真实值在 tooltip 里
  const udrCap=Q.udr.map(v=>v==null?null:Math.min(v,4));
  const ry=autoY([udrCap.slice(s,e+1)],0.15);
  drawPanel('fl-udvol',{s,e,dates:Q.d,y:{lo,hi,fmt:v=>f1(v)},y2:Object.assign({},ry,{fmt:v=>f2(v)+'×'}),
    bars:[{vals:uv,color:'#e8453caa'},{vals:dv,color:'#22a06baa'}],
    lines:[{vals:udrCap,color:C.accent,width:1.8,axis:'right'}],
    legend:[['涨股量(亿股)',C.up],['跌股量(亿股)',C.down],['UV/DV(右)',C.accent]],
    hover:(i)=>'<b>'+dateFmt(Q.d[i])+'</b>'+tipRow('上涨股成交量',f2(Q.uv[i])+' 亿股',C.up)+
      tipRow('下跌股成交量',f2(Q.dv[i])+' 亿股',C.down)+
      tipRow('净量',f2(Q.uv[i]-Q.dv[i])+' 亿股',cls(Q.uv[i]-Q.dv[i]))+
      tipRow('UV/DV',f2(Q.udr[i])+'×')});
}
function drawObvAd(){
  const [s,e]=bounds(L.n);
  const ob=normDiff(L.obv,s,e),ad=normDiff(L.ad,s,e),px=normDiff(L.px,s,e);
  const yy=autoY([ob.slice(s,e+1),ad.slice(s,e+1)],0.12);
  const py=autoY([px.slice(s,e+1)],0.12);
  drawPanel('fl-obvad',{s,e,dates:L.d,y:Object.assign({},yy,{fmt:v=>f1(v)+'%'}),
    y2:Object.assign({},py,{fmt:v=>f1(v)+'%'}),
    lines:[{vals:ob,color:C.blue,width:1.8},{vals:ad,color:C.purple,width:1.8},
           {vals:px,color:C.white,width:1.2,axis:'right',dash:[4,3]}],
    legend:[['OBV',C.blue],['A-D 线',C.purple],['上证(右)',C.white]],
    hover:(i)=>'<b>'+dateFmt(L.d[i])+'</b>'+tipRow('OBV 相对起点',f2(ob[i])+'%')+
      tipRow('A-D 相对起点',f2(ad[i])+'%')+tipRow('上证相对起点',f2(px[i])+'%')+
      tipRow('当日成交量',f0(L.vol[i]/1e6)+' 百万手')+
      '<div style="color:var(--dim2);margin-top:4px">OBV/A-D 用上证真实 OHLCV；起点归一化为 0%</div>'});
}
function drawRs(){
  const [s,e]=bounds(Q.n),base=S.rsBase;
  const rs=Q.ewnav.map((v,i)=>Q.idxnav[base][i]?v/Q.idxnav[base][i]:null);
  const rsn=normDiff(rs,s,e);
  const badln=normDiff(Q.adl,s,e);
  const yy=autoY([rsn.slice(s,e+1),badln.slice(s,e+1)],0.12);
  drawPanel('fl-rs',{s,e,dates:Q.d,y:Object.assign({},yy,{fmt:v=>f1(v)+'%'}),
    hlines:[{v:0,color:C.line2}],
    lines:[{vals:rsn,color:C.accent,width:2},{vals:badln,color:C.blue,width:1.4,dash:[4,3]}],
    legend:[['等权全A / '+RS_NAMES[base],C.accent],['宽度 ADL 归一化',C.blue]],
    hover:(i)=>'<b>'+dateFmt(Q.d[i])+'</b>'+tipRow('等权全A / '+RS_NAMES[base],f2(rsn[i])+'%')+
      tipRow('ADL 相对起点',f2(badln[i])+'%')+
      tipRow('等权全A 当日',sgn(Q.ew[i])+'%',cls(Q.ew[i]))+
      tipRow('ADL 当日',f0(Q.adl[i]))});
}
function drawCrowd(){
  const [s,e]=bounds(Q.n);
  const yy={lo:0,hi:100,fmt:v=>f0(v)};
  drawPanel('fl-crowd',{s,e,dates:Q.d,y:yy,zero:false,
    bands:[{lo:75,hi:100,color:'#e8453c12'},{lo:0,hi:25,color:'#22a06b12'}],
    hlines:[{v:75,color:'#e8453c66',dash:[3,3],label:'75 偏拥挤'},
            {v:25,color:'#22a06b66',dash:[3,3],label:'25 偏冷清'}],
    lines:[{vals:COMPONENTS.crowd,color:C.accent,width:2,fill:C.accent}],
    legend:[['拥挤度综合分',C.accent]],
    hover:(i)=>'<b>'+dateFmt(Q.d[i])+'</b>'+tipRow('综合分',f1(COMPONENTS.crowd[i]))+
      COMPONENTS.parts[i].map((v,k)=>tipRow(['UV/DV','NH%','SUM','TRIN⁻¹','小盘RS'][k]+' 分位',v==null?'—':f0(v*100))).join('')});
}

/* ---------- 09/10 TMT 交易拥挤度 ---------- */
function drawTmt(){
  const H=T.history||[],n=H.length;
  const o=CV('fl-tmt'); if(!o)return;
  const ts=T.snapshot||{};
  if(n===0){
    const {x,w,h}=o;
    txt(x,'暂无 TMT 成交占比样本',w/2,h/2,C.dim2,'center',12);
    return;
  }
  /* history 行结构：[date, TMT成交额(亿), 两市成交额(亿), TMT占比(%)] —— 占比是第 4 列 */
  const dates=H.map(r=>r[0]),ratio=H.map(r=>+r[3]);
  if(n===1){
    /* 只有 1 天时不画折线，避免把单点伪装成趋势；给出诚实的大字读数 */
    const {x,w,h}=o;
    const cx=w/2,cy=h/2-8;
    hline(x,24,w-24,cy+34,C.line2);
    x.save();x.fillStyle=C.accent;x.globalAlpha=0.18;x.beginPath();x.arc(cx,cy,34,0,Math.PI*2);x.fill();x.restore();
    x.save();x.fillStyle=C.accent;x.beginPath();x.arc(cx,cy,8,0,Math.PI*2);x.fill();x.restore();
    txt(x,traw(ratio[0])+'%',cx,cy-54,C.white,'center',20);
    txt(x,dateFmt(dates[0])+' · TMT '+traw(+H[0][1])+' 亿 / 两市 '+traw(+H[0][2])+' 亿',cx,cy+52,C.dim,'center',10);
    txt(x,'历史样本 1 日 · 不足 20 日，不输出历史分位，也不做时序拥挤度判断',cx,cy+70,C.dim2,'center',9.5);
    txt(x,'右侧「四大行业当日分解」与下方板块明细表给出完整横截面',cx,cy+86,C.dim2,'center',9.5);
    bindHover('fl-tmt',()=>'<b>'+dateFmt(dates[0])+'</b>'+tipRow('TMT 成交占比',traw(ratio[0])+'%')+
      tipRow('TMT 成交额',traw(+H[0][1])+' 亿')+tipRow('两市成交额',traw(+H[0][2])+' 亿'));
    return;
  }
  const mean=ratio.reduce((a,b)=>a+b,0)/n;
  const hi=Math.max(60,Math.max.apply(null,ratio)*1.15,45*1.1);
  drawPanel('fl-tmt',{s:0,e:n-1,dates,y:{lo:0,hi,fmt:v=>f1(v)+'%'},zero:false,
    bands:[{lo:45,hi:hi,color:'#e8453c10'}],
    hlines:[{v:45,color:'#e8453c88',dash:[4,4],label:'45% 交易过热参考'},
            {v:mean,color:C.blue,dash:[3,3],label:'样本均值 '+f2(mean)+'%'}],
    lines:[{vals:ratio,color:C.accent,width:2,fill:C.accent},
           {vals:new Array(n).fill(mean),color:C.blue,width:1.2,dash:[4,4]}],
    legend:[['TMT 成交占比',C.accent],['已入库均值',C.blue]],
    hover:i=>'<b>'+dateFmt(dates[i])+'</b>'+tipRow('TMT 成交占比',traw(ratio[i])+'%')+
      tipRow('TMT 成交额',traw(+H[i][1])+' 亿')+tipRow('两市成交额',traw(+H[i][2])+' 亿')+
      (n>=20?tipRow('扩展窗口分位','见当日结构判读'):'<div style="color:var(--dim2);margin-top:4px">样本不足 20 日，暂无历史分位</div>')});
}
function drawTmtGroups(){
  const o=CV('fl-tmtg'); if(!o)return;
  const {x,w,h}=o;
  const g=T.groups||{},ts=T.snapshot||{};
  const shares=TMT_NAMES.map(nm=>+((g[nm]||{}).share||0));
  const total=+(ts.ratio||0);
  const scale=Math.max(1,Math.max.apply(null,shares),total)*1.18;
  /* 注意：局部量不能用 T / B —— 会遮蔽外层 TMT 数据常量 T 并触发 TDZ */
  const L=88,R=132,TOP=26,BOT=30,W=w-L-R,H=h-TOP-BOT;
  for(let i=0;i<=4;i++){
    const v=scale*i/4,px=L+W*i/4;
    vline(x,TOP,TOP+H,px,C.line);
    txt(x,f1(v)+'%',px,TOP+H+13,C.dim2,'center',9);
  }
  const rh=H/TMT_NAMES.length;
  TMT_NAMES.forEach((nm,k)=>{
    const cy=TOP+rh*k+rh/2,b=g[nm]||{},sh=+(b.share||0),chg=b.chg;
    const bw=Math.max(2,W*sh/scale);
    rect(x,L,cy-11,bw,22,TMT_COLORS[k]+'55',TMT_COLORS[k]+'aa');
    txt(x,nm,L-9,cy,C.dim,'right',11);
    txt(x,(b.boardCount||0)+' 个板块',L-9,cy+12,C.dim2,'right',9);
    txt(x,traw(sh)+'%',L+bw+7,cy,C.white,'left',10);
    /* 右侧两行错开，避免「成交额」与「涨跌幅」在同一基线上重叠 */
    txt(x,traw(b.amount)+' 亿',w-R+6,cy-7,C.dim,'left',9.5);
    txt(x,sgn(chg)+'%',w-8,cy+8,chg==null?C.dim2:(chg>0?C.up:chg<0?C.down:C.dim2),'right',10);
  });
  const tx=L+W*Math.min(total,scale)/scale;
  vline(x,TOP-6,TOP+H,tx,C.accent,[4,4]);
  txt(x,'四大行业合计 '+traw(total)+'%',tx-4,TOP-12,C.accent,'right',9.5);
  bindHover('fl-tmtg',(mx,my)=>{
    const k=clamp(Math.floor((my-TOP)/rh),0,TMT_NAMES.length-1),nm=TMT_NAMES[k],b=g[nm]||{};
    return '<b>'+nm+'</b>'+tipRow('成交额',traw(b.amount)+' 亿')+
      tipRow('占两市',traw(b.share)+'%')+tipRow('板块涨跌幅',sgn(b.chg)+'%',b.chg>0?C.up:C.down)+
      tipRow('板块数',f0(b.boardCount))+
      (b.boards||[]).map(z=>tipRow(z.name,f2(z.amount/1e8)+' 亿')).join('');
  });
}
function drawTmtTable(){
  const g=T.groups||{},ts=T.snapshot||{};
  const market=+(ts.marketAmount||0);
  let h='';
  TMT_NAMES.forEach(nm=>{
    const b=g[nm]||{},bs=b.boards||[];
    bs.forEach((z,k)=>{
      h+='<tr><td class="l">'+(k===0?nm:'')+'</td><td class="l">'+esc(z.name)+'</td>'+
        '<td>'+f2(z.amount/1e8)+'</td><td>'+f2(market?z.amount/market*100:null)+'</td>'+
        '<td class="'+cls(z.chg)+'">'+sgn(z.chg)+'</td></tr>';
    });
  });
  $('#fl-tmttab tbody').innerHTML=h;
  const cnt=TMT_NAMES.reduce((a,nm)=>a+((g[nm]||{}).boardCount||0),0);
  const now=$('#fl-tmtnow');
  if(now) now.textContent='当日成交占比 '+traw(ts.ratio)+'%（TMT '+traw(ts.tmtAmount)+
    ' 亿 / 两市 '+traw(ts.marketAmount)+' 亿，历史 '+traw((T.history||[]).length)+' 日）';
  $('#fl-tmtasof').textContent=dateFmt(T.asof)+' · 合计 '+traw(ts.ratio)+'%';
  $('#fl-tmtsum').textContent='TMT '+traw(ts.tmtAmount)+' 亿 / 两市 '+traw(ts.marketAmount)+' 亿 ＝ '+
    traw(ts.ratio)+'% · '+cnt+' 个东财二级行业板块 · 历史 '+f0((T.history||[]).length)+' 日';
}

/* ---------- 明细表 ---------- */
function drawTable(){
  const s=Math.max(0,Q.n-22);
  let h='';
  for(let i=Q.n-1;i>=s;i--){
    const n60=gv(rows[i],'nh60')-gv(rows[i],'nl60'),cw=COMPONENTS.crowd[i];
    h+='<tr><td class="l">'+dateFmt(Q.d[i])+'</td>'+
      '<td class="'+cls(Q.up[i]-Q.dn[i])+'">'+f0(Q.up[i]-Q.dn[i])+'</td>'+
      '<td>'+f2(Q.trin[i])+'</td><td class="'+cls(Q.uv[i]-Q.dv[i])+'">'+f2(Q.uv[i]-Q.dv[i])+'</td>'+
      '<td>'+f2(Q.udr[i])+'</td>'+
      '<td>'+f0(gv(rows[i],'nh60'))+'</td><td>'+f0(gv(rows[i],'nl60'))+'</td>'+
      '<td class="'+cls(n60)+'">'+f0(n60)+'</td>'+
      '<td class="'+cls(Q.ew[i])+'">'+sgn(Q.ew[i])+'</td>'+
      '<td>'+(cw==null?'—':f1(cw))+'</td></tr>';
  }
  $('#fl-tab tbody').innerHTML=h;
}
function drawCaveat(){
  const m=F.meta||{};
  let h='<b>口径与局限（务必先读）</b><ul>';
  (m.caveat||[]).forEach(z=>h+='<li>'+esc(z)+'</li>');
  h+='<li>公式全部写在 <span class="mono">fetch_flow.py → meta.formula</span>，页面只做可视化；'+
     'TRIN / Up-Down Volume / NH-NL 的分母随时间变化（新股、停牌、退市），因此同时提供占比与有效样本数 e_w。</li>';
  h+='<li>拥挤度与各分位采用<b>扩展窗口</b>（每个交易日只用当日及之前的数据计算分位），'+
     '不存在未来函数；因 NH-NL 还需 60 日窗口预热，序列前约 120 个交易日显示「—」。</li>';
  h+='<li><b>TRIN 在极端普跌日可能反而 &lt; 1</b>：它衡量的是「涨跌家数比」与「涨跌量比」的相对关系，'+
     '不是涨跌方向本身。例如 2026-11-13 涨 763 / 跌 4749，但上涨股平均成交量约为下跌股的 2 倍，'+
     '故 TRIN≈0.49，应读作「少数抗跌股放量、多数个股缩量阴跌」，不宜直接当成买盘信号。</li>';
  h+='<li>ADL / 麦克莱伦 / OBV / A-D 用 2016 年起 '+f0(L.n)+' 个交易日；'+
     'TRIN / NH-NL / Up-Down Volume / 拥挤度用逐股聚合的 '+f0(Q.n)+' 个交易日（'+dateFmt(Q.d[0])+' 起）。'+
     '切到「全部」时后者仍只显示其自身覆盖区间，不会补造历史。</li>';
  const tm=T.meta||{},th=T.history||[],bf=tm.historyBackfill||{};
  h+='<li><b>TMT 交易拥挤度口径</b>：'+esc(tm.classify||'')+'。分母为 workbench 最新两市成交额，'+
     '分子为四大行业成交额合计；'+esc(tm.historyNote||'')+'。当前入库 '+f0(th.length)+' 日'+
     (th.length<20?'，<b>样本不足 20 日，不输出历史分位</b>；单日占比只作横截面描述，不能外推为「趋势拥挤」':'')+'。</li>';
  h+='<li><b>同口径历史为何不给曲线</b>：回补状态 <span class="mono">'+esc(bf.status||'not-attempted')+'</span>，'+
     '11 个二级行业板块中仅 '+f0(bf.okBoards||0)+' 个可取到历史（'+
     (bf.okCodes&&bf.okCodes.length?esc(bf.okCodes.join('、')):'无')+'），'+
     '缺失 '+(bf.missingCodes&&bf.missingCodes.length?f0(bf.missingCodes.length):'全部')+' 个。'+
     '当日锁定占比是 11 个板块全量口径，用残缺板块加总会系统性低估，因此<b>宁可只给当日读数，也不画错误的历史曲线</b>。'+
     '可用历史另见 <span class="mono">history.json</span>：行业 PE 中位数 / 涨停连板 / 外部环境已分别回补 250 / 250 / 460 日。</li>';
  h+='<li><b>TMT 成交占比不是资金净流入</b>：行业板块行情接口只提供成交额与涨跌幅，'+
     '没有逐笔主动买卖方向，也无板块级申赎数据；「交易拥挤」指交易集中程度，不代表资金真实流向。</li>';
  h+='</ul><b>数据源</b>：'+esc(m.source||'')+'；TMT：'+esc(tm.source||'')+'。<br><b>样本</b>：'+
     esc(m.universe||'')+'，抓取时间 '+esc(m.fetchedAt||'')+'。';
  $('#FL_CAVEAT').innerHTML=h;
  $('#fl-cover').textContent='家数序列 '+f0(L.n)+' 日 · 逐股序列 '+f0(Q.n)+' 日（'+dateFmt(Q.d[0])+' ~ '+dateFmt(Q.d[Q.n-1])+'）';
}

/* ---------- 生命周期 ---------- */
function draw(){
  drawKpi();drawDec();drawAdl();drawMcc();drawNhnl();drawTrin();
  drawUdvol();drawObvAd();drawRs();drawCrowd();
  drawTmt();drawTmtGroups();drawTmtTable();drawTable();
}
function init(){
  $('#fl-range').addEventListener('change',e=>{S.range=+e.target.value;draw();});
  $('#fl-nh').addEventListener('change',e=>{S.nhWin=+e.target.value;draw();});
  $('#fl-rsbase').addEventListener('change',e=>{S.rsBase=e.target.value;draw();});
  drawCaveat();
  MODS.flow={draw};
}
init();
})();
