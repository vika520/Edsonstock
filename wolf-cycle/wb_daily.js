/* ===== 06 日度全景 ===== */
(function(){
const W={range:120};
const M2E=new Array(M.n).fill(null);
E.dates.forEach((dt,i)=>{const j=M.dateIdx[dt];if(j!=null)M2E[j]=i;});
const coreMA20=ma(E.coreTotal,20,0), coreMA60=ma(E.coreTotal,60,0);
function drawKpi(){
  const i=M.n-1, prev=M.a[i-1];
  const chgA=(M.a[i]/prev-1)*100;
  const items=[
    ['两市成交额',f1(M.a[i])+' 亿',dateFmt(M.d[i])],
    ['较前一日','+'===String(sgn(chgA))[0]?'+'+f1(chgA)+'%':f1(chgA)+'%','环比',cls(chgA)],
    ['20 日均额',f1(M.ma20[i])+' 亿','不含当日'],
    ['涨 / 跌家数',f0(M.up[i])+' / '+f0(M.dn[i]),'平盘 '+f0(M.fl[i]),''],
    ['方向代理',sgn(M.net[i])+' 亿','广度加权名义额，非资金流',cls(M.net[i])],
    ['核心 20 ETF 占全市场',f2(E.ratio[ELAST])+'%','合计 '+f1(todayCore())+' 亿']
  ];
  function todayCore(){const j=M2E[i];return j==null?0:E.coreTotal[j];}
  $('#DAY_KPI').innerHTML=items.map(z=>'<div class="kpi"><div class="k">'+z[0]+'</div>'+
    '<div class="v '+(z[3]||'')+'">'+z[1]+'</div><div class="s">'+z[2]+'</div></div>').join('');
}
function rangeIdx(){
  const s=Math.max(0,M.n-W.range);
  return {s,n:M.n-s,X:i=>0};
}
function drawAmt(){
  const o=CV('day-amt');if(!o)return;
  const g=frame(o,{l:50,r:14,t:14,b:24}),{x}=g;
  const {s}=rangeIdx(),n=M.n-s;
  const amax=Math.max(...M.a.slice(s))*1.1;
  const X=i=>g.L+(i-s+0.5)/n*g.W, Y=v=>g.B-v/amax*g.H;
  for(let k=0;k<=4;k++){
    const v=amax*k/4;hline(x,g.L,g.L+g.W,Y(v),k===0?C.line2:C.line);
    txt(x,f0(v),g.L-7,Y(v),C.dim2,'right');
  }
  const bw=Math.max(1,g.W/n*0.72);
  for(let i=s;i<M.n;i++){
    rect(x,X(i)-bw/2,Y(M.a[i]),bw,g.B-Y(M.a[i]),
      M.chg[i]!=null&&M.chg[i]>=0?'#e8453c88':'#22a06b88');
  }
  [[M.ma20,C.accent],[M.ma60,C.blue]].forEach(([arr,col])=>{
    const p=[];for(let i=s;i<M.n;i++)if(arr[i]!=null)p.push([X(i),Y(arr[i])]);
    poly(x,p,col,1.5);
  });
  xLabels(x,g,M.d.slice(s).map(dateFmt),i=>X(s+i));
  txt(x,'MA20',g.L+6,g.T+9,C.accent);txt(x,'MA60',g.L+46,g.T+9,C.blue);
}
function drawFlow(){
  const o=CV('day-flow');if(!o)return;
  const g=frame(o,{l:52,r:50,t:14,b:24}),{x}=g;
  const {s}=rangeIdx(),n=M.n-s;
  const vals=M.net.slice(s), lim=Math.max(...vals.map(Math.abs))*1.12;
  const cum=M.flow10;
  const cumVals=cum.slice(s).filter(v=>v!=null);
  const cl=Math.min(...cumVals),ch=Math.max(...cumVals);
  const cr=Math.max(Math.abs(cl),Math.abs(ch))*1.1||1;
  const X=i=>g.L+(i-s+0.5)/n*g.W;
  const Y=v=>g.B/2+g.T/2-v/lim*(g.H/2);
  for(let k=-2;k<=2;k++){
    const v=lim*k/2;hline(x,g.L,g.L+g.W,Y(v),k===0?C.line2:C.line);
    txt(x,f0(v),g.L-7,Y(v),C.dim2,'right');
    txt(x,f0(cr*k/2),g.L+g.W+7,Y(v),C.dim2,'left');
  }
  const bw=Math.max(1,g.W/n*0.72);
  for(let i=s;i<M.n;i++){
    const v=M.net[i],y0=Y(0),y1=Y(v);
    rect(x,X(i)-bw/2,Math.min(y0,y1),bw,Math.max(1,Math.abs(y1-y0)),
      v>=0?C.up+'aa':C.down+'aa');
  }
  const cp=[];for(let i=s;i<M.n;i++)if(cum[i]!=null)cp.push([X(i),g.B/2+g.T/2-(cum[i]/cr)*(g.H/2)]);
  poly(x,cp,C.white,1.4);
  xLabels(x,g,M.d.slice(s).map(dateFmt),i=>X(s+i));
  txt(x,'10 日累计（右轴）',g.L+6,g.T+9,C.white);
}
function drawStack(){
  const o=CV('day-stack');if(!o)return;
  const g=frame(o,{l:50,r:14,t:14,b:44}),{x}=g;
  const N=E.dates.length,s=Math.max(0,N-60),n=N-s;
  const cats=E.cats.slice().sort((a,b)=>{
    const sa=E.catAmt[a].slice(s).reduce((p,q)=>p+q,0);
    const sb=E.catAmt[b].slice(s).reduce((p,q)=>p+q,0);
    return sb-sa;
  });
  const totals=[];for(let i=s;i<N;i++)totals.push(cats.reduce((p,c)=>p+E.catAmt[c][i],0));
  const tmax=Math.max(...totals,1)*1.1;
  const X=i=>g.L+(i-s+0.5)/n*g.W, Y=v=>g.B-v/tmax*g.H;
  for(let k=0;k<=4;k++){
    const v=tmax*k/4;hline(x,g.L,g.L+g.W,Y(v),k===0?C.line2:C.line);
    txt(x,f0(v),g.L-7,Y(v),C.dim2,'right');
  }
  const bw=Math.max(1,g.W/n*0.8);
  for(let i=s;i<N;i++){
    let acc=0;
    cats.forEach((c,j)=>{
      const v=E.catAmt[c][i];if(v<=0)return;
      const y1=Y(acc),y2=Y(acc+v);
      rect(x,X(i)-bw/2,y2,bw,Math.max(0.6,y1-y2),CAT_COLOR[j%CAT_COLOR.length]+'cc');
      acc+=v;
    });
  }
  xLabels(x,g,E.dates.slice(s).map(dateFmt),i=>X(s+i));
  let lx=g.L,ly=g.B+26;
  cats.slice(0,10).forEach((c,j)=>{
    rect(x,lx,ly-4,8,8,CAT_COLOR[j%CAT_COLOR.length]+'cc');
    txt(x,c,lx+11,ly,C.dim,'left',9);
    lx+=Math.max(62,c.length*11+20);
    if(lx>g.L+g.W-70){lx=g.L;ly+=13;}
  });
}
function drawTrend(){
  const o=CV('day-trend');if(!o)return;
  const g=frame(o,{l:50,r:48,t:14,b:24}),{x}=g;
  const N=E.dates.length,s=Math.max(0,N-250),n=N-s;
  const v20=coreMA20.slice(s).map(v=>v||0),v60=coreMA60.slice(s).map(v=>v||0);
  const vmax=Math.max(...v20,...v60,1)*1.12;
  const rr=E.ratio.slice(s).map(v=>v||0),rmax=Math.max(...rr,1)*1.2;
  const X=i=>g.L+(i-s+0.5)/n*g.W;
  const Y=v=>g.B-v/vmax*g.H, YR=v=>g.B-v/rmax*g.H;
  for(let k=0;k<=4;k++){
    const v=vmax*k/4;hline(x,g.L,g.L+g.W,Y(v),k===0?C.line2:C.line);
    txt(x,f0(v),g.L-7,Y(v),C.dim2,'right');
    txt(x,f1(rmax*k/4)+'%',g.L+g.W+7,Y(v),C.dim2,'left');
  }
  [[v20,C.white,1.6],[v60,C.accent,1.5]].forEach(([arr,col,lw])=>{
    poly(x,arr.map((v,i)=>[X(s+i),Y(v)]),col,lw);
  });
  const rp=[];for(let i=s;i<N;i++)rp.push([X(i),YR(rr[i-s])]);
  poly(x,rp,C.blue,1.2,[4,3]);
  xLabels(x,g,E.dates.slice(s).map(dateFmt),i=>X(s+i));
  txt(x,'20 日均',g.L+6,g.T+9,C.white);txt(x,'60 日均',g.L+68,g.T+9,C.accent);
  txt(x,'占比',g.L+128,g.T+9,C.blue);
}
function drawEtfBar(){
  const o=CV('day-etfbar');if(!o)return;
  const g=frame(o,{l:120,r:56,t:14,b:22}),{x}=g;
  const rows=E.core.filter(e=>e.amt60!=null).sort((a,b)=>b.amt60-a.amt60);
  const vmax=Math.max(...rows.map(e=>e.amt60))*1.08;
  const X=v=>g.L+v/vmax*g.W,bh=g.H/rows.length;
  rows.forEach((e,i)=>{
    const y=g.T+i*bh+bh*0.2,h=bh*0.6;
    rect(x,g.L,y,Math.max(1,X(e.amt60)-g.L),h,((e.trend||0)>=0?'#e8453c':'#22a06b')+'aa');
    txt(x,e.name,g.L-7,y+h/2,C.txt,'right');
    txt(x,f0(e.amt60)+'亿',X(e.amt60)+5,y+h/2,C.dim,'left');
  });
  txt(x,'红＝近 20 日较前 20 日升温 / 绿＝降温',g.L+g.W,g.T+8,C.dim2,'right');
}
function drawTable(){
  const rows=[];
  for(let i=M.n-1;i>=Math.max(0,M.n-22);i--){
    const j=M2E[i];
    rows.push('<tr><td class="l">'+dateFmt(M.d[i])+'</td>'+
      '<td>'+f1(M.a[i])+'</td>'+
      '<td class="'+cls(i>0?M.a[i]/M.a[i-1]-1:null)+'">'+sgn(i>0?(M.a[i]/M.a[i-1]-1)*100:null)+'</td>'+
      '<td class="'+cls(M.chg[i])+'">'+sgn(M.chg[i])+'</td>'+
      '<td>'+f0(M.up[i])+' / '+f0(M.dn[i])+' / '+f0(M.fl[i])+'</td>'+
      '<td class="'+cls(M.net[i])+'">'+sgn(M.net[i])+'</td>'+
      '<td>'+(j==null?'—':f1(E.coreTotal[j]))+'</td>'+
      '<td>'+(j==null?'—':f2(E.ratio[j])+'%')+'</td>'+
      '<td class="'+(M.vr[i]>=1.2?'amber':'')+'">'+(M.vr[i]==null?'—':f2(M.vr[i])+'×')+'</td></tr>');
  }
  $('#day-tab tbody').innerHTML=rows.join('');
}
function caveat(){
  $('#DAY_CAVEAT').innerHTML='<b>口径与边界（务必先读）</b><ul>'+
    '<li><b>真实数据：</b>两市成交额与涨跌家数来自通达信 880005 指标日线（'+dateFmt(M.d[0])+' 起 '+f0(M.n)+' 个交易日），上证指数来自腾讯行情日线，32 只 ETF 来自通达信 / 腾讯日线。</li>'+
    '<li><b>「净流入方向代理」不是真实资金净流入。</b>定义为 (上涨家数−下跌家数)/(涨+跌+平) × 当日成交额，本质是广度加权的方向估计。真实资金流需要逐笔成交方向、席位或托管数据，公开免费源没有。</li>'+
    '<li><b>「宽基分类堆积」不是申赎结构。</b>它按 20 只重点宽基 ETF 的标的分类堆叠<b>二级市场成交额</b>。ETF 份额申赎需要基金公司日度份额数据，本页不可得；把成交额读作申赎会得出完全错误的结论。</li>'+
    '<li><b>成交额估算：</b>27 只 ETF 的成交额由成交量与收盘价估算（中位偏差 −0.05%）；ETF 上市时间不同（中证 A50 / A500 样本较短），早期堆积值会天然偏低，跨期比较需留意样本变化。</li>'+
    '<li>20 只重点 ETF 存在同标的多只产品（如 4 只沪深300ETF），分类内加总会重复计算同一指数的交投热度，仅用于结构观察。</li></ul>';
}
$$('#day-range button').forEach(b=>b.addEventListener('click',()=>{
  $$('#day-range button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.range=+b.dataset.r;drawAmt();drawFlow();
}));
function draw(){drawKpi();drawAmt();drawFlow();drawStack();drawTrend();drawEtfBar();drawTable();}
caveat();
MODS.daily={draw};
})();
