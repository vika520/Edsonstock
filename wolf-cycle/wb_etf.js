/* ===== 05 ETF 日度申赎（季度真实申赎 + 日度份额估计 + 量价背景） ===== */
(function(){
const W={range:120,grp:'all'};
const LAST=ELAST;
const todayVr=E.cvr[LAST], todayChg=E_PXCHG[LAST];
const todayAmt=E.coreTotal[LAST], todayRatio=E.ratio[LAST];
const Q=XE.quarterly||{}, DAILY=(XE.daily||[]);
const lastDay=DAILY[DAILY.length-1]||[null,{}], prevDay=DAILY.length>1?DAILY[DAILY.length-2]:null;
const sharesNow=lastDay[1]||{}, sharesPrev=prevDay?prevDay[1]:null;
const sumShares=o=>Object.values(o||{}).reduce((s,v)=>s+(xnum(v)||0),0);
const okN=Object.values(sharesNow).filter(v=>v!=null).length;
const common=sharesPrev?Object.keys(sharesNow).filter(k=>sharesPrev[k]!=null&&sharesNow[k]!=null):[];
const netEst=common.length?common.reduce((s,k)=>s+(sharesNow[k]-sharesPrev[k]),0):null;
const qNet=[];
Object.keys(Q).forEach(c=>(Q[c]||[]).slice(0,1).forEach(z=>{
  qNet.push({code:c,name:(E.by[c]||{}).name||c,buy:xnum(z[1]),sell:xnum(z[2]),
             shares:xnum(z[3]),period:z[0],net:(xnum(z[1])||0)-(xnum(z[2])||0)});
}));
const qTotalNet=qNet.reduce((s,x)=>s+x.net,0);
/* 逐日方向代理：Σ sign(当日涨跌) × 当日成交额，只用真实日线，可回看全历史 */
const N=E.dates.length;
const DIR=new Array(N).fill(null);
for(let i=1;i<N;i++){
  let s0=0,ok=false;
  E.core.forEach(e=>{
    if(e.A[i]!=null&&e.P[i]!=null&&e.P[i-1]!=null){s0+=Math.sign(e.P[i]-e.P[i-1])*e.A[i];ok=true;}
  });
  if(ok)DIR[i]=s0;
}
const MA20=new Array(N).fill(null);
for(let i=0;i<N;i++){
  let t=0,c=0;
  for(let j=Math.max(0,i-19);j<=i;j++){if(E.coreTotal[j]!=null){t+=E.coreTotal[j];c++;}}
  if(c)MA20[i]=t/c;
}
const dayDir=DIR[LAST]==null?null:DIR[LAST];
const dayMa=MA20[LAST];

function verdict(){
  const level = todayVr==null ? '日度量能：样本不足' :
    (todayVr>=1.30?'日度量能：显著放量':(todayVr>=1.10?'日度量能：温和放量':
     (todayVr<=0.75?'日度量能：明显缩量':'日度量能：常态')));
  const tone = todayVr==null ? C.dim : (todayVr>=1.30?C.accent:(todayVr<=0.75?C.down:C.dim));
  const desc=
    '<b>先看每天（真实可得，本栏主视觉）：</b>'+dateFmt(E.dates[LAST])+' 核心 20 只宽基 ETF 成交 <b>'+f1(todayAmt)+
    ' 亿</b>、20 日均额 '+f1(dayMa)+' 亿，量比 <b style="color:'+tone+'">'+f2(todayVr)+'×</b>，'+
    '占两市成交额 '+f2(todayRatio)+'%，方向代理 '+(dayDir==null?'—':sgn(dayDir)+' 亿')+'，上证 '+sgn(todayChg)+
    '%。这类日度数据有 <b>'+N+' 个交易日</b>的完整历史，上方 ①~⑦ 全部由真实日线驱动，'+
    '可回看每天「哪类宽基在放量、量比是否异常、占全市场比是否抬升」。<br>'+
    '<b>再看份额（低频核验）：</b>最近一期 '+esc(qNet[0]?dateFmt(qNet[0].period):'—')+'，'+
    qNet.length+' 只核心 ETF 季度申购 '+xf(qNet.reduce((s,x)=>s+(x.buy||0),0),2)+' 亿份、赎回 '+
    xf(qNet.reduce((s,x)=>s+(x.sell||0),0),2)+' 亿份，净额 <b style="color:'+(qTotalNet>=0?C.up:C.down)+'">'+
    xsgn(qTotalNet)+' 亿份</b>，是基金定期报告披露的<b>唯一可核验份额口径</b>；日度份额估计 '+dateFmt(lastDay[0]||'')+
    ' 取到 '+okN+' 只、合计 '+xf(sumShares(sharesNow),2)+' 亿份，'+
    (netEst==null?'仅 1 个交易日快照，<b>净申赎估计不可得</b>。':'日差分 '+xsgn(netEst)+' 亿份（反推估计）。')+'<br>'+
    '<b>为什么日度份额没有历史（已实测）：</b>交易所日度申赎份额无免费公开源；东财 <span class="mono">f116</span> 只有当日快照、无历史接口；'+
    '腾讯 ETF 日线 693 根含 OHLCV 但不含份额或换手率；东财 <span class="mono">RPT_FUND_ETFLIST</span> 的 DEC_TOTALSHARE 也只是当前快照。'+
    '因此只能从 2026-11-13 起逐日累积，<b>不插值、不伪造回补</b>。<br>'+
    '<span style="color:#8892a0">成交额 ≠ 申购，量价代理 ≠ 真实资金流。原「国家队护盘」归因已撤销，本栏不识别买方身份。</span>';
  $('#ETF_VERDICT').innerHTML='<div class="card-h"><span class="t">今日判定 · 日度资金强度 · '+dateFmt(E.dates[LAST])+'</span>'+
    '<span class="spacer"></span><span class="tag real">日度量价 '+N+' 日真实</span>'+
    '<span class="tag real">季度申赎真实</span><span class="tag proxy">日度份额为估计</span>'+
    '<span class="tag na">日度官方份额历史不可得</span></div>'+
    '<div class="card-b" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">'+
    '<div style="flex:0 0 200px"><div class="k" style="font-size:10px;color:#5b6470">判定结论</div>'+
    '<div style="font-size:16px;font-weight:700;color:'+tone+';margin-top:7px;line-height:1.45">'+level+'</div>'+
    '<div class="mono" style="font-size:11px;color:#8892a0;margin-top:9px">量比 '+f2(todayVr)+'× · 占比 '+f2(todayRatio)+'% · 季度净额 '+xsgn(qTotalNet)+' 亿份</div></div>'+
    '<div style="flex:1;min-width:320px;font-size:12px;line-height:1.9;color:#c3cbd6">'+desc+'</div></div>';
}
function drawKpi(){
  XKPI('ETF_KPI',[
    ['核心 20 ETF 成交额',f1(todayAmt)+' 亿','当日 · 二级市场成交口径'],
    ['核心宽基量比',f2(todayVr)+'×','相对前 20 日均额',todayVr>=1.3?'amber':''],
    ['占全市场成交额',f2(todayRatio)+'%','核心 20 / 两市'],
    ['20 日均额',f1(dayMa)+' 亿','日度量能基准'],
    ['日度方向代理',dayDir==null?'—':sgn(dayDir)+' 亿','Σ 涨跌方向 × 成交额',dayDir==null?'':(dayDir>0?'up':'down')],
    ['日度历史长度',xf0(N)+' 日','32 只 ETF 真实日线','amber'],
    ['季度净申赎',xsgn(qTotalNet)+' 亿份',qNet.length+' 只核心 ETF · 低频核验',qTotalNet>=0?'up':'down'],
    ['日度份额估计',xf(sumShares(sharesNow),2)+' 亿份',okN+' 只 · 仅当日，历史不可回补']
  ]);
}
function drawQuarter(){
  const rows=qNet.slice().sort((a,b)=>Math.abs(b.net)-Math.abs(a.net));
  XBAR('etf-quarter',rows.map(x=>({label:(x.name||x.code).slice(0,10),value:x.net,
        color:x.net>=0?C.up:C.down,right:dateFmt(x.period)})),
    {centered:true,fmt:f1,unit:' 亿份',pad:{l:118,r:80,t:14,b:22},empty:'季度申赎未取到'});
}
function drawShare(){
  const d=DAILY.map(z=>z[0]), vals=DAILY.map(z=>sumShares(z[1]));
  XTS('etf-share',d,[{name:'份额估计(亿份)',data:vals,color:C.blue,dot:true}],
    {fmt:f0,empty:'份额估计自 2026-11-13 入库首日起累积，当前 '+DAILY.length+' 日'});
}
function drawToday(){
  const o=CV('etf-today');if(!o)return;
  const g=frame(o,{l:112,r:56,t:14,b:22}),{x}=g;
  const rows=E.list.filter(e=>e.vr!=null&&e.last!=null).sort((a,b)=>b.vr-a.vr).slice(0,15);
  if(!rows.length)return;
  const vmax=Math.max(...rows.map(e=>e.vr))*1.08;
  const X=v=>g.L+v/vmax*g.W, bh=g.H/rows.length;
  [0,0.5,1].forEach(k=>{
    const v=vmax*k;vline(x,g.T,g.B,X(v),k===0?C.line2:C.line);
    txt(x,f2(v)+'×',X(v),g.B+12,C.dim2,'center');
  });
  vline(x,g.T,g.B,X(1),C.accent,[3,3]);
  rows.forEach((e,i)=>{
    const y=g.T+i*bh+bh*0.2,h=bh*0.6;
    rect(x,g.L,y,Math.max(1,X(e.vr)-g.L),h,(e.chg>=0?'#e8453c':'#22a06b')+'bb');
    txt(x,e.name,g.L-7,y+h/2,e.core?C.txt:C.dim,'right');
    txt(x,f2(e.vr)+'×',X(e.vr)+5,y+h/2,C.txt,'left');
    txt(x,f1(e.amt)+'亿',g.L+g.W+6,y+h/2,C.dim2,'right');
  });
  txt(x,'常态线 1.00×',X(1)+4,g.T+8,C.accent,'left');
}
function drawDir(){
  const o=CV('etf-dir');if(!o)return;
  const g=frame(o,{l:96,r:56,t:14,b:22}),{x}=g;
  const m={};
  E.list.forEach(e=>{
    if(e.chg==null||e.amt==null)return;
    if(!m[e.cat])m[e.cat]={v:0,n:0,amt:0};
    m[e.cat].v+=Math.sign(e.chg)*e.amt;m[e.cat].n++;m[e.cat].amt+=e.amt;
  });
  let rows=Object.entries(m).map(([k,v])=>({cat:k,...v}));
  rows=rows.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,14).sort((a,b)=>b.v-a.v);
  const lim=Math.max(...rows.map(r=>Math.abs(r.v)))*1.15;
  const X=v=>g.L+(v+lim)/(2*lim)*g.W;
  const bh=g.H/rows.length;
  [0.25,0.5,0.75].forEach(k=>vline(x,g.T,g.B,g.L+g.W*k,C.line));
  vline(x,g.T,g.B,X(0),C.line2);
  txt(x,'卖方向',g.L+4,g.B+12,C.down,'left');
  txt(x,'买方向',g.L+g.W-4,g.B+12,C.up,'right');
  rows.forEach((r,i)=>{
    const y=g.T+i*bh+bh*0.2,h=bh*0.6;
    const a=Math.min(X(0),X(r.v)),b=Math.max(X(0),X(r.v));
    rect(x,a,y,Math.max(1,b-a),h,(r.v>=0?C.up:C.down)+'bb');
    txt(x,r.cat,g.L-7,y+h/2,C.txt,'right');
    txt(x,sgn(r.v),r.v>=0?b+5:a-5,y+h/2,r.v>=0?C.up:C.down,r.v>=0?'left':'right');
  });
  txt(x,'Σ 方向 × 成交额（亿）',g.L+g.W+4,g.T+8,C.dim2,'right');
}
function drawHist(){
  const o=CV('etf-hist');if(!o)return;
  const g=frame(o,{l:48,r:48,t:14,b:24}),{x}=g;
  const N=E.dates.length,s=Math.max(0,N-W.range),n=N-s;
  const vrs=E.cvr.slice(s).map(v=>v||0);
  const p98=a=>{const t=a.filter(v=>isFinite(v)&&v>0).sort((p,q)=>p-q);
    return t.length?t[Math.min(t.length-1,Math.floor(t.length*0.98))]:0;};
  const vmax=Math.max(1.8,p98(vrs)*1.15);
  const X=i=>g.L+(i-s+0.5)/n*g.W;
  const YV=v=>g.B-Math.min(v,vmax)/vmax*g.H;
  for(let k=0;k<=3;k++){
    hline(x,g.L,g.L+g.W,YV(vmax*k/3),k===0?C.line2:C.line);
    txt(x,f1(vmax*k/3)+'×',g.L-7,YV(vmax*k/3),C.dim2,'right');
  }
  const vp=[];for(let i=s;i<N;i++)vp.push([X(i),YV(vrs[i-s])]);
  poly(x,vp,C.white,1.2);
  hline(x,g.L,g.L+g.W,YV(1.30),C.accent,[2,4]);
  xLabels(x,g,E.dates.slice(s).map(dateFmt),i=>X(s+i));
  txt(x,'白线＝核心宽基 ETF 合计量比；纵轴按 98 分位截断；虚线＝1.30× 放量参考',g.L+6,g.T+9,C.dim2,'left');
}
/* ===== 日度主视觉：逐日成交额 / 分类堆积 / 占比 / 明细表 ===== */
function win(){const s=Math.max(0,N-W.range);return {s:s,dates:E.dates.slice(s),n:N-s};}
function drawAmt(){
  const {s,dates}=win();
  XTS('etf-amt',dates,[
    {name:'核心宽基成交额(亿)',data:E.coreTotal.slice(s),color:C.blue,type:'bar'},
    {name:'20日均额',data:MA20.slice(s),color:C.white,dot:true}
  ],{zero:true,fmt:f0,empty:'日度成交额未取到',
     note:'近 '+dates.length+' 日 · 二级市场成交口径，不是申赎'});
}
function drawStack(){
  const o=CV('etf-stack');if(!o)return;
  const {s,n,dates}=win();
  const tot=c=>(E.catAmt[c]||[]).reduce((p,q)=>p+(q||0),0);
  const cats=E.cats.slice().sort((a,b)=>tot(b)-tot(a)).slice(0,6);
  const cols=['#4b9fea','#f0b429','#e8453c','#22a06b','#a78bfa','#6b7785'];
  const g=frame(o,{l:58,r:18,t:14,b:24}),{x}=g;
  let vmax=0;
  for(let i=s;i<N;i++){let a=0;cats.forEach(c=>a+=E.catAmt[c][i]||0);if(a>vmax)vmax=a;}
  vmax=vmax*1.08||1;
  const X=i=>g.L+(i-s+0.5)/n*g.W, Y=v=>g.B-v/vmax*g.H, bw=Math.max(1,g.W/n*0.82);
  for(let k=0;k<=3;k++){
    hline(x,g.L,g.L+g.W,Y(vmax*k/3),k===0?C.line2:C.line);
    txt(x,f0(vmax*k/3),g.L-7,Y(vmax*k/3),C.dim2,'right');
  }
  for(let i=s;i<N;i++){
    let acc=0;
    cats.forEach((c,k2)=>{
      const v=E.catAmt[c][i]||0;
      if(v>0)rect(x,X(i)-bw/2,Y(acc+v),bw,Math.max(1,Y(acc)-Y(acc+v)),cols[k2]+'cc');
      acc+=v;
    });
  }
  xLabels(x,g,dates.map(dateFmt),i=>X(s+i));
  cats.forEach((c,k2)=>txt(x,'■ '+c.slice(0,6),g.L+6+k2*90,g.T+9,cols[k2],'left'));
  const el=$('#etf-stacksub');if(el)el.textContent=cats.length+' 个宽基分类 · 近 '+n+' 日 · 亿元';
}
function drawRatio(){
  const {s,dates}=win();
  XTS('etf-ratio',dates,[{name:'占两市成交额(%)',data:E.ratio.slice(s),color:C.accent,dot:true}],
    {zero:true,fmt:v=>Number(v).toFixed(2),empty:'日度占比未取到',note:'近 '+dates.length+' 日'});
}
function drawDayTab(){
  const rows=[];
  for(let i=N-1;i>=Math.max(0,N-22);i--){
    rows.push('<tr><td class="l mono">'+esc(dateFmt(E.dates[i]))+'</td>'+
      '<td>'+f1(E.coreTotal[i])+'</td>'+
      '<td class="'+(E.cvr[i]>=1.3?'amber':'')+'">'+(E.cvr[i]==null?'—':f2(E.cvr[i])+'×')+'</td>'+
      '<td>'+(E.ratio[i]==null?'—':f2(E.ratio[i])+'%')+'</td>'+
      '<td class="'+cls(E_PXCHG[i])+'">'+sgn(E_PXCHG[i])+'</td>'+
      '<td class="'+cls(DIR[i])+'">'+(DIR[i]==null?'—':sgn(DIR[i]))+'</td>'+
      '<td>'+(MA20[i]==null?'—':f1(MA20[i]))+'</td></tr>');
  }
  XTAB('etf-dtab',rows);
  const el=$('#etf-dsub');if(el)el.textContent='最近 '+rows.length+' 个交易日 · 共 '+N+' 日历史';
}
function drawQuarterTable(){
  const rows=[];
  Object.keys(Q).forEach(c=>(Q[c]||[]).slice(0,4).forEach(z=>{
    const b=xnum(z[1]),s=xnum(z[2]);
    rows.push({d:z[0],c:c,name:(E.by[c]||{}).name||c,b:b,s:s,
               net:(b||0)-(s||0),sh:xnum(z[3])});
  }));
  rows.sort((a,b)=>b.d.localeCompare(a.d)||Math.abs(b.net)-Math.abs(a.net));
  $('#etf-gcount').textContent='共 '+rows.length+' 条季度记录（8 只 × 最近 4 期）';
  XTAB('etf-gtab',rows.map(r=>'<tr><td class="l">'+dateFmt(r.d)+'</td>'+
    '<td class="l">'+esc(r.name.slice(0,12))+'</td><td>'+xf(r.b,2)+'</td><td>'+xf(r.s,2)+'</td>'+
    '<td class="'+xcls(r.net)+'">'+xsgn(r.net)+'</td><td>'+xf(r.sh,2)+'</td></tr>'));
}
function drawAll(){
  let rows=E.list.filter(e=>e.last!=null);
  if(W.grp==='core')rows=rows.filter(e=>e.core);
  if(W.grp==='theme')rows=rows.filter(e=>!e.core);
  rows.sort((a,b)=>(b.amt||0)-(a.amt||0));
  XTAB('etf-atab',rows.map(e=>
    '<tr><td class="l">'+esc(e.name)+(e.core?' <span class="pill" style="background:#4b9fea22;color:#4b9fea">宽基</span>':'')+
      (e.exact?'':' <span class="pill" style="background:#f0b42922;color:#f0b429" title="成交额为估算">估</span>')+'</td>'+
    '<td>'+esc(e.cat)+'</td><td>'+f2(e.P[e.last])+'</td>'+
    '<td class="'+cls(e.chg)+'">'+sgn(e.chg)+'</td><td>'+f1(e.amt)+'</td>'+
    '<td class="'+(e.vr>=1.3?'amber':'')+'">'+(e.vr==null?'—':f2(e.vr)+'×')+'</td>'+
    '<td class="'+cls(e.r5)+'">'+sgn(e.r5)+'</td><td class="'+cls(e.r20)+'">'+sgn(e.r20)+'</td></tr>'));
}
function caveat(){
  XCAV('ETF_CAVEAT','口径与边界（本页最重要）',[
    '<b>日度主视觉用的是真实可得数据，不是申赎。</b>本栏 ①~⑦ 的逐日成交额、量比、占全市场比、宽基分类堆积、方向代理与明细表，全部来自 32 只 ETF 的真实日线（约 '+N+' 个交易日），因此「每天」这一层是完整的。它们回答「哪天放量、哪类宽基在动」，<b>不能回答份额进出</b>。',
    '<b>日度份额历史已实测确认不可回补。</b>交易所公布的日度申赎份额没有免费公开源；东财 f116（总市值）只有当日快照且无历史接口；腾讯 ETF 日线 693 根含开高低收量但不含份额或换手率；东财 RPT_FUND_ETFLIST 的 DEC_TOTALSHARE 也只是当前快照而非时间序列。曾用「成交量 ÷ 换手率」反推份额的思路，因本机 push2his 域名不可达无法取得历史换手率而放弃。因此第 ⑨ 图只有 2026-11-13 起的逐日累积，不插值、不伪造。',
    '<b>已撤销「国家队」归因。</b>中央汇金、国新等机构持仓只在基金季报 / 年报按季度披露，没有任何公开日度数据能证明某一天 ETF 买单来自谁。旧版把「指数下跌 + 宽基 ETF 放量」称作护盘嫌疑，属于量价特征巧合，容易被误读为资金归属；本版不再使用该结论。',
    '<b>季度申赎是真实份额，日度份额是估计。</b>东财基金 F10「规模变动」按季披露期间申购 / 期间赎回 / 期末总份额，是可核验的官方口径。日度曲线由当日总市值 f116 ÷ 收盘价反推份额，再取日差分得到净申赎估计，含 ETF 折溢价、计价口径与价格时点误差；交易所公布的日度申赎份额<b>没有免费公开源</b>。',
    '<b>只从入库首日起累积。</b>日度份额估计从 2026-11-13 开始逐日追加，不回补历史；不足 2 个交易日时净申赎估计留空，不插值、不用成交额代替。',
    '<b>成交额 ≠ 申购。</b>本栏保留的量比排行、方向代理与量能时间序列都是二级市场成交口径，只说明换手与价格方向，不能推断一级市场份额变化。真实主动净买入还需要逐笔成交买卖方向标记。',
    '<b>成交额精度。</b>前 5 只 ETF 用通达信真实 Amount；其余 27 只用腾讯日线「成交量(手)×100×收盘价」估算，150 天对照样本中位偏差 −0.05%，5% / 95% 分位 −0.92% / +1.28%。带「估」标记的行即为此类。',
    '<b>不构成投资建议。</b>份额变化与指数方向之间没有在本工作台做过样本外因果检验；申赎数据是结构描述，不是择时信号。'
  ]);
}
$$('#etf-range button').forEach(b=>b.addEventListener('click',()=>{
  $$('#etf-range button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.range=+b.dataset.r;drawAmt();drawStack();drawHist();drawRatio();
}));
$$('#etf-grp button').forEach(b=>b.addEventListener('click',()=>{
  $$('#etf-grp button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.grp=b.dataset.g;drawAll();
}));
function draw(){verdict();drawKpi();drawAmt();drawStack();drawToday();drawDir();drawHist();drawRatio();
  drawDayTab();drawQuarter();drawShare();drawQuarterTable();drawAll();}
caveat();
MODS.etf={draw};
})();
