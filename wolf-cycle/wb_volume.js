/* ===== 04 放量信号（事件驱动） ===== */
(function(){
const W={thr:1.20,range:250,firstOnly:false,sel:null,events:[],ov:null};
const FWD=[1,3,5,10,20];
function buildEvents(){
  const ev=[];
  for(let i=0;i<M.n;i++){
    if(M.vr[i]==null||M.vr[i]<W.thr) continue;
    const prev=ev.length&&ev[ev.length-1].i===i-1;
    const o={i,date:M.d[i],amt:M.a[i],ma:M.ma20[i],vr:M.vr[i],chg:M.chg[i],
      up:M.up[i],dn:M.dn[i],first:!prev,fwd:{}};
    FWD.forEach(k=>o.fwd[k]=fwdRet(i,k));
    ev.push(o);
  }
  W.events=ev;
  const visible=W.firstOnly?ev.filter(e=>e.first):ev;
  if(!visible.length){W.sel=null;return;}
  if(!W.sel||!visible.some(e=>e.i===W.sel.i)) W.sel=visible[visible.length-1];
}
function drawKpi(){
  const e=W.sel;
  const age=e?M.n-1-e.i:null;
  const items=[
    ['最近一次放量',e?dateFmt(e.date):'—','当前阈值 '+f2(W.thr)+'× · 已选中事件'],
    ['当日成交额',e?f1(e.amt):'—','亿元 · 两市合计'],
    ['放量倍数',e?f2(e.vr)+'×':'—','相对前 20 日均额 '+f1(e?e.ma:0)+' 亿'],
    ['当日上证',e?sgn(e.chg)+'%':'—','收盘对收盘',cls(e?e.chg:null)],
    ['距今',age!=null?age+' 日':'—','交易日'],
    ['历史放量次数',f0(W.events.length),W.firstOnly?'仅每段首日 '+f0(W.events.filter(z=>z.first).length):'含连续放量日']
  ];
  $('#VOL_KPI').innerHTML=items.map(z=>'<div class="kpi"><div class="k">'+z[0]+'</div>'+
    '<div class="v '+(z[3]||'')+'">'+z[1]+'</div><div class="s">'+z[2]+'</div></div>').join('');
}
function drawWindow(){
  const o=CV('vol-window'); if(!o) return;
  const g=frame(o,{l:50,r:50,t:16,b:28}),{x}=g;
  const e=W.sel;
  if(!e){txt(x,'当前阈值下无放量事件',g.L+g.W/2,g.T+g.H/2,C.dim,'center',12);return;}
  const s=Math.max(0,e.i-12), t=Math.min(M.n-1,e.i+12), n=t-s+1;
  const vals=[];for(let i=s;i<=t;i++)vals.push(M.a[i]);
  const amax=Math.max(...vals)*1.12;
  const pmin=Math.min(...M.px.slice(s,t+1).filter(v=>v!=null))*0.99;
  const pmax=Math.max(...M.px.slice(s,t+1).filter(v=>v!=null))*1.01;
  const bw=g.W/n;
  const X=i=>g.L+(i-s+0.5)*bw;
  const YA=v=>g.B-v/amax*g.H;
  const YP=v=>g.B-(v-pmin)/(pmax-pmin)*g.H;
  for(let k=0;k<=4;k++){
    const v=amax*k/4,y=YA(v);hline(x,g.L,g.L+g.W,y,k===0?C.line2:C.line);
    txt(x,f0(v),g.L-7,y,C.dim2,'right');
    txt(x,f0(pmin+(pmax-pmin)*k/4),g.L+g.W+7,y,C.dim2,'left');
  }
  // event band
  rect(x,X(e.i)-bw/2,g.T,bw,g.H,'#f0b42914');
  vline(x,g.T,g.B,X(e.i),'#f0b42999',[3,3]);
  for(let i=s;i<=t;i++){
    const bx=X(i)-bw*0.34, by=YA(M.a[i]), bh=g.B-by;
    const col=i===e.i?C.accent:(M.chg[i]!=null&&M.chg[i]>=0?'#e8453c99':'#22a06b99');
    rect(x,bx,by,Math.max(1,bw*0.68),bh,col);
  }
  const maPts=[];for(let i=s;i<=t;i++) if(M.ma20[i]!=null)maPts.push([X(i),YA(M.ma20[i])]);
  poly(x,maPts,C.accent,1.6);
  const pxPts=[];for(let i=s;i<=t;i++) if(M.px[i]!=null)pxPts.push([X(i),YP(M.px[i])]);
  poly(x,pxPts,C.white,1.5);
  xLabels(x,g,M.d.slice(s,t+1).map(dateFmt),i=>X(s+i));
  txt(x,'MA20',g.L+6,g.T+9,C.accent);
  txt(x,'上证',g.L+g.W-6,g.T+9,C.white,'right');
  $('#VOL_WINLABEL').textContent=dateFmt(e.date)+' · '+f1(e.amt)+' 亿 · '+f2(e.vr)+'×';
}
function drawFwd(){
  const o=CV('vol-fwd'); if(!o) return;
  const g=frame(o,{l:50,r:14,t:16,b:34}),{x}=g;
  const ev=(W.firstOnly?W.events.filter(e=>e.first):W.events);
  const means=FWD.map(k=>{
    const v=ev.map(e=>e.fwd[k]).filter(z=>z!=null);
    return {k,m:v.length?v.reduce((s,z)=>s+z,0)/v.length:null,n:v.length,
      win:v.length?v.filter(z=>z>0).length/v.length*100:null};
  });
  const all=means.map(z=>z.m).concat(FWD.map(k=>BASE[k].mean)).filter(v=>v!=null);
  let lo=Math.min(...all,0),hi=Math.max(...all,0);
  const pad=Math.max(0.15,(hi-lo)*0.2);lo-=pad;hi+=pad;
  const Y=v=>g.B-(v-lo)/(hi-lo)*g.H;
  yTicks(x,g,lo,hi,4,v=>f2(v)+'%');
  hline(x,g.L,g.L+g.W,Y(0),C.line2);
  const gw=g.W/means.length;
  means.forEach((z,i)=>{
    const cx=g.L+gw*(i+0.5);
    const bars=[[z.m,C.accent],[BASE[z.k].mean,C.blue]];
    bars.forEach((b,j)=>{
      if(b[0]==null)return;
      const bx=cx-gw*0.27+j*gw*0.28, bw=gw*0.24;
      const y0=Y(0),y1=Y(b[0]);
      rect(x,bx,Math.min(y0,y1),bw,Math.max(1,Math.abs(y1-y0)),b[1]+'cc');
    });
    txt(x,'T+'+z.k,cx,g.B+11,C.txt,'center');
    txt(x,'n='+z.n,cx,g.B+23,C.dim2,'center',9);
    if(z.win!=null) txt(x,f0(z.win)+'%',cx,Y(z.m)-9,C.dim,'center',9);
  });
  rect(x,g.L+6,g.T+6,9,9,C.accent+'cc');txt(x,'放量事件均值',g.L+19,g.T+10,C.dim,'left');
  rect(x,g.L+116,g.T+6,9,9,C.blue+'cc');txt(x,'全样本基准',g.L+129,g.T+10,C.dim,'left');
  txt(x,'柱上数字＝事件胜率',g.L+g.W-6,g.T+10,C.dim2,'right');
}
function drawOverview(){
  const o=CV('vol-overview'); if(!o) return;
  const g=frame(o,{l:50,r:14,t:12,b:24}),{x}=g;
  const N=M.n, s=W.range?Math.max(0,N-W.range):0, n=N-s;
  const vals=M.a.slice(s), amax=Math.max(...vals)*1.1;
  const X=i=>g.L+(i-s+0.5)/n*g.W;
  const YA=v=>g.B-v/amax*g.H;
  for(let k=0;k<=3;k++){
    const v=amax*k/3;hline(x,g.L,g.L+g.W,YA(v),k===0?C.line2:C.line);
    txt(x,f0(v),g.L-7,YA(v),C.dim2,'right');
  }
  const step=Math.max(1,Math.ceil(n/900));
  const bw=Math.max(0.7,g.W/n*0.8);
  for(let i=s;i<N;i+=step){
    const y=YA(M.a[i]);
    rect(x,X(i)-bw/2,y,bw,g.B-y,'#3c4b5e');
  }
  const mp=[];for(let i=s;i<N;i+=step) if(M.ma20[i]!=null)mp.push([X(i),YA(M.ma20[i])]);
  poly(x,mp,C.accent,1.2);
  const ev=(W.firstOnly?W.events.filter(e=>e.first):W.events).filter(e=>e.i>=s);
  ev.forEach(e=>{
    x.beginPath();x.arc(X(e.i),YA(e.amt),W.sel&&W.sel.i===e.i?4:2,0,Math.PI*2);
    x.fillStyle=W.sel&&W.sel.i===e.i?'#fff':C.accent;x.fill();
  });
  xLabels(x,g,M.d.slice(s).map(dateFmt),i=>X(s+i));
  W.ov={s,n,X,YA,ev};
}
function drawTable(){
  const ev=(W.firstOnly?W.events.filter(e=>e.first):W.events).slice().reverse();
  $('#vol-count').textContent=ev.length+' 次';
  $('#vol-tab tbody').innerHTML=ev.map(e=>
    '<tr data-i="'+e.i+'" class="click'+(W.sel&&W.sel.i===e.i?' sel':'')+'">'+
    '<td class="l">'+dateFmt(e.date)+(e.first?' <span class="pill" style="background:#f0b42922;color:#f0b429">段首</span>':'')+'</td>'+
    '<td>'+f1(e.amt)+'</td><td>'+f1(e.ma)+'</td><td class="amber">'+f2(e.vr)+'×</td>'+
    '<td class="'+cls(e.chg)+'">'+sgn(e.chg)+'</td>'+
    '<td>'+f0(e.up)+' / '+f0(e.dn)+'</td>'+
    FWD.map(k=>'<td class="'+cls(e.fwd[k])+'">'+sgn(e.fwd[k])+'</td>').join('')+'</tr>').join('');
  $$('#vol-tab tbody tr').forEach(tr=>tr.addEventListener('click',()=>{
    const i=+tr.dataset.i;W.sel=W.events.find(e=>e.i===i);refresh();
  }));
}
function refresh(){drawKpi();drawWindow();drawFwd();drawOverview();drawTable();}
function caveat(){
  $('#VOL_CAVEAT').innerHTML='<b>口径与边界（务必先读）</b><ul>'+
    '<li><b>真实数据：</b>全市场成交额取通达信 880005 指标的 Amount 字段，'+dateFmt(M.d[0])+' ~ '+dateFmt(M.d[M.n-1])+' 共 '+f0(M.n)+' 个交易日；上证收盘来自腾讯行情日线，与广度数据按交易日严格对齐。</li>'+
    '<li><b>无未来函数：</b>放量倍数＝当日成交额 ÷ <b>不含当日</b>的前 20 日均额，收盘即可判定；未使用任何 T+1 信息来产生信号。T+N 收益仅用于事后评估。</li>'+
    '<li><b>样本重叠：</b>连续放量日会被分别计入事件，彼此不独立；「仅每段首日」可缓解但不消除重叠。事件收益的置信区间因此被系统性高估，且未做多重比较校正。</li>'+
    '<li>放量本身不含方向：既可能是增量资金入场，也可能是恐慌换手。本页的 T+N 统计是描述性的，<b>不是策略回测</b>，未计交易成本、滑点与可执行性。</li></ul>';
}
$$('#vol-thr button').forEach(b=>b.addEventListener('click',()=>{
  $$('#vol-thr button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.thr=+b.dataset.t;W.sel=null;buildEvents();refresh();
}));
$$('#vol-range button').forEach(b=>b.addEventListener('click',()=>{
  $$('#vol-range button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.range=+b.dataset.r;drawOverview();
}));
$('#vol-first').addEventListener('change',e=>{W.firstOnly=e.target.checked;W.sel=null;buildEvents();refresh();});
document.getElementById('vol-overview').addEventListener('click',e=>{
  if(!W.ov)return;
  const r=e.target.getBoundingClientRect(),mx=e.clientX-r.left;
  let best=null,bd=1e9;
  W.ov.ev.forEach(z=>{const d=Math.abs(W.ov.X(z.i)-mx);if(d<bd){bd=d;best=z;}});
  if(best){W.sel=best;refresh();}
});
caveat();buildEvents();
MODS.volume={draw:refresh};
})();
