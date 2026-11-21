/* ===== 工作台共享内核：数据、绘图工具、导航 ===== */
'use strict';
const D = JSON.parse(document.getElementById('DATA').textContent);
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const C = {up:'#e8453c',down:'#22a06b',accent:'#f0b429',blue:'#4b9fea',purple:'#9b7cf0',
  txt:'#d5d9e0',dim:'#8892a0',dim2:'#5b6470',line:'#222a35',line2:'#33404f',white:'#eef3fa'};
const CAT_COLOR = ['#e8453c','#f0b429','#4b9fea','#9b7cf0','#22a06b','#e07b39','#4fc3c7',
  '#d35fa8','#8fa84b','#6f8fd0','#c9a24c','#7e8fa5','#b45a5a','#52a89a'];

const f1 = v => (v==null||!isFinite(v)) ? '—' : Number(v).toFixed(1);
const f2 = v => (v==null||!isFinite(v)) ? '—' : Number(v).toFixed(2);
const f0 = v => (v==null||!isFinite(v)) ? '—' : Math.round(v).toLocaleString('en-US');
const sgn = v => (v==null||!isFinite(v)) ? '—' : (v>0?'+':'')+Number(v).toFixed(2);
const cls = v => v==null||!isFinite(v) ? '' : (v>0?'up':(v<0?'down':''));
const dateFmt = d => d ? d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8) : '—';
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

/* ---- canvas ---- */
function CV(id){
  const el = document.getElementById(id);
  if(!el) return null;
  const box = el.parentElement;
  const w = Math.max(60, box.clientWidth), h = Math.max(60, box.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  el.width = Math.round(w*dpr); el.height = Math.round(h*dpr);
  el.style.width = w+'px'; el.style.height = h+'px';
  const x = el.getContext('2d');
  x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,w,h);
  x.font = '10px "JetBrains Mono",Consolas,monospace';
  return {x,w,h,el};
}
function txt(x,s,px,py,color,align,size){
  x.fillStyle = color||C.dim;
  x.textAlign = align||'left';
  x.textBaseline = 'middle';
  if(size) x.font = size+'px "JetBrains Mono",Consolas,monospace';
  x.fillText(s,px,py);
  x.font = '10px "JetBrains Mono",Consolas,monospace';
}
function hline(x,x1,x2,y,col,dash){
  x.save(); x.strokeStyle=col||C.line; x.lineWidth=1;
  if(dash) x.setLineDash(dash);
  x.beginPath(); x.moveTo(x1,y+0.5); x.lineTo(x2,y+0.5); x.stroke(); x.restore();
}
function vline(x,y1,y2,px,col,dash){
  x.save(); x.strokeStyle=col||C.line; x.lineWidth=1;
  if(dash) x.setLineDash(dash);
  x.beginPath(); x.moveTo(px+0.5,y1); x.lineTo(px+0.5,y2); x.stroke(); x.restore();
}
function poly(x,pts,color,width,dash){
  if(pts.length<2) return;
  x.save(); x.strokeStyle=color; x.lineWidth=width||1.4; x.lineJoin='round';
  if(dash) x.setLineDash(dash);
  x.beginPath(); pts.forEach((p,i)=> i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])); x.stroke(); x.restore();
}
function rect(x,a,b,c,d,fill,stroke){
  x.fillStyle=fill; x.fillRect(a,b,c,d);
  if(stroke){x.strokeStyle=stroke;x.lineWidth=1;x.strokeRect(a+0.5,b+0.5,c-1,d-1);}
}
function frame(o,pad){
  const {x,w,h}=o, p=pad||{l:52,r:52,t:14,b:24};
  return {x,w,h,L:p.l,R:w-p.r,T:p.t,B:h-p.b,W:w-p.l-p.r,H:h-p.t-p.b,p};
}
function yTicks(x,g,lo,hi,n,fmt,side){
  const N=n||4;
  for(let i=0;i<=N;i++){
    const v=lo+(hi-lo)*i/N, y=g.B-(v-lo)/(hi-lo||1)*g.H;
    hline(x,g.L,g.L+g.W,y,i===0?C.line2:C.line);
    txt(x,(fmt||f1)(v),side==='right'?g.L+g.W+7:g.L-7,y,C.dim2,side==='right'?'left':'right');
  }
}
function xLabels(x,g,labels,idxFn){
  const n=labels.length; if(!n) return;
  const step=Math.max(1,Math.round(n/7));
  for(let i=0;i<n;i+=step){
    const px=idxFn(i); txt(x,labels[i],px,g.B+12,C.dim2,'center');
  }
}
function ma(arr,n,shift){
  const out=new Array(arr.length).fill(null);
  let s=0,c=0;
  for(let i=0;i<arr.length;i++){
    const k=i-(shift||0);
    if(k>=0 && arr[k]!=null){s+=arr[k];c++;}
    if(k-n>=0 && arr[k-n]!=null){s-=arr[k-n];c--;}
    if(c===n) out[i]=s/n;
  }
  return out;
}

/* ---- tooltip ---- */
const TIP=$('#TIP');
function tipOn(e,html){
  TIP.innerHTML=html; TIP.style.display='block';
  const w=TIP.offsetWidth,h=TIP.offsetHeight;
  let px=e.clientX+14,py=e.clientY+14;
  if(px+w>innerWidth-10) px=e.clientX-w-14;
  if(py+h>innerHeight-10) py=e.clientY-h-14;
  TIP.style.left=px+'px'; TIP.style.top=py+'px';
}
function tipOff(){TIP.style.display='none';}
const _hoverHandlers={};
function bindHover(id,handler){
  const el=document.getElementById(id); if(!el) return;
  _hoverHandlers[id]=handler;                  // 重绘时只替换处理器，不重复叠加监听
  if(el.dataset.hoverBound) return;
  el.dataset.hoverBound='1';
  el.addEventListener('mousemove',e=>{
    const h=_hoverHandlers[id]; if(!h) return;
    const r=el.getBoundingClientRect();
    const rHtml=h(e.clientX-r.left,e.clientY-r.top);
    if(rHtml) tipOn(e,rHtml); else tipOff();
  });
  el.addEventListener('mouseleave',tipOff);
}

/* ---- 通用市场序列（只算一次，四个栏目共用） ---- */
const M = (()=>{
  const rows=D.market;
  const d=rows.map(r=>r[0]), a=rows.map(r=>r[1]/1e8);
  const dn=rows.map(r=>r[3]), up=rows.map(r=>r[4]), fl=rows.map(r=>r[5]), tt=rows.map(r=>r[6]);
  const px=d.map(k=>D.px[k]!=null?D.px[k]:null);
  const chg=px.map((v,i)=> (i>0&&v!=null&&px[i-1]!=null) ? (v/px[i-1]-1)*100 : null);
  const ma20=ma(a,20,1);                       // 不含当日，纯因果
  const ma60=ma(a,60,1);
  const vr=a.map((v,i)=> ma20[i]?v/ma20[i]:null);
  const net=up.map((u,i)=>{
    const den=Math.max(1,u+dn[i]+fl[i]);
    return (u-dn[i])/den*a[i];               // 广度加权方向代理（亿元）
  });
  const flow10=ma(net,10,0).map(v=>v==null?null:v*10);   // 10 日滚动累计（亿元·名义）
  return {d,a,dn,up,fl,tt,px,chg,ma20,ma60,vr,net,flow10,n:d.length,dateIdx:Object.fromEntries(d.map((k,i)=>[k,i]))};
})();
const fwdRet=(i,k)=> (M.px[i]!=null && M.px[i+k]!=null) ? (M.px[i+k]/M.px[i]-1)*100 : null;
const BASE=(()=>{
  const o={};
  [1,3,5,10,20].forEach(k=>{
    const v=[]; for(let i=0;i<M.n-k;i++){const r=fwdRet(i,k); if(r!=null)v.push(r);}
    o[k]={mean:v.reduce((s,z)=>s+z,0)/(v.length||1), win:v.filter(z=>z>0).length/(v.length||1)*100, n:v.length};
  });
  return o;
})();

/* ---- ETF 统一对齐 ---- */
const E = (()=>{
  const codes=Object.keys(D.etfs);
  const all=new Set(); codes.forEach(c=>D.etfs[c].rows.forEach(r=>all.add(r[0])));
  const dates=Array.from(all).sort();
  const di=Object.fromEntries(dates.map((k,i)=>[k,i]));
  const list=[], by={};
  codes.forEach(c=>{
    const o=D.etfs[c], A=new Array(dates.length).fill(null), P=new Array(dates.length).fill(null);
    o.rows.forEach(r=>{const i=di[r[0]]; if(i!=null){A[i]=r[2]/1e8;P[i]=r[1];}});
    const e={code:c,name:o.name,cat:o.cat,core:!!o.core,exact:!!o.exactAmount,A,P};
    by[c]=e; list.push(e);
  });
  // 每只 ETF 的最新状态
  list.forEach(e=>{
    let last=null;
    for(let i=e.A.length-1;i>=0;i--) if(e.A[i]!=null){last=i;break;}
    e.last=last;
    if(last==null) return;
    const m20=ma(e.A,20,1), m5=ma(e.A,5,1);
    e.amt=e.A[last]; e.vr=m20[last]?e.A[last]/m20[last]:null;
    e.chg=(last>0&&e.P[last]!=null&&e.P[last-1]!=null)?(e.P[last]/e.P[last-1]-1)*100:null;
    e.r5=(last>=5&&e.P[last-5]!=null)?(e.P[last]/e.P[last-5]-1)*100:null;
    e.r20=(last>=20&&e.P[last-20]!=null)?(e.P[last]/e.P[last-20]-1)*100:null;
    let s=0,cnt=0;
    for(let i=Math.max(0,last-19);i<=last;i++) if(e.A[i]!=null){s+=e.A[i];cnt++;}
    e.amt20=cnt?s:null;
    s=0;cnt=0;
    for(let i=Math.max(0,last-59);i<=last;i++) if(e.A[i]!=null){s+=e.A[i];cnt++;}
    e.amt60=cnt?s:null;
    let s0=0,s1=0;
    for(let i=Math.max(0,last-39);i<=last-20;i++) if(e.A[i]!=null)s0+=e.A[i];
    for(let i=Math.max(0,last-19);i<=last;i++) if(e.A[i]!=null)s1+=e.A[i];
    e.trend=s0>0?(s1/s0-1)*100:null;
  });
  const core=list.filter(e=>e.core);
  const coreTotal=new Array(dates.length).fill(0);
  const coreMkt=new Array(dates.length).fill(0);
  dates.forEach((dt,i)=>{
    let s=0; core.forEach(e=>{if(e.A[i]!=null)s+=e.A[i];});
    coreTotal[i]=s; coreMkt[i]=M.a[M.dateIdx[dt]]||0;
  });
  const cvr=ma(coreTotal,20,1).map((v,i)=>v?coreTotal[i]/v:null);
  const ratio=coreTotal.map((v,i)=>coreMkt[i]?v/coreMkt[i]*100:null);
  const cats=Array.from(new Set(core.map(e=>e.cat)));
  const catAmt={};
  cats.forEach(cat=>{
    const arr=new Array(dates.length).fill(0);
    core.filter(e=>e.cat===cat).forEach(e=>e.A.forEach((v,i)=>{if(v!=null)arr[i]+=v;}));
    catAmt[cat]=arr;
  });
  return {dates,di,list,by,core,cats,catAmt,coreTotal,coreMkt,cvr,ratio};
})();
const ELAST=E.dates.length-1;
const ED_MKT=E.dates.map(dt=>M.dateIdx[dt]==null?null:M.dateIdx[dt]);
const E_PXCHG=E.dates.map((dt,i)=>{const j=ED_MKT[i];return j==null?null:M.chg[j];});
const guardScore=E.dates.map((dt,i)=>{
  const v=E.cvr[i], c=E_PXCHG[i];
  return (v!=null&&c!=null) ? v*Math.max(0,-c) : null;
});
const guardEvents=[];
E.dates.forEach((dt,i)=>{
  if(guardScore[i]!=null && E.cvr[i]>=1.30 && E_PXCHG[i]!=null && E_PXCHG[i]<=-0.30){
    const j=ED_MKT[i];
    guardEvents.push({i,dt,vr:E.cvr[i],chg:E_PXCHG[i],score:guardScore[i],
      f1:j==null?null:fwdRet(j,1),f5:j==null?null:fwdRet(j,5)});
  }
});

/* ---- 板块派生 ---- */
const B=(()=>{
  const mom=D.boardMom||{};
  const totalAmt=M.a[M.n-1]*1e8;
  const list=D.boards.map(b=>({...b,mom:mom[b.leaderCode]||null}));
  const sortedA=[...list].sort((p,q)=>p.amount-q.amount);
  const sortedC=[...list].sort((p,q)=>p.chg-q.chg);
  const rankA=Object.fromEntries(sortedA.map((b,i)=>[b.code,i/(list.length-1)]));
  const rankC=Object.fromEntries(sortedC.map((b,i)=>[b.code,i/(list.length-1)]));
  list.forEach(b=>{
    b.amtPct=b.amount/totalAmt*100;
    b.aRank=rankA[b.code]; b.cRank=rankC[b.code];
    b.score=b.aRank*0.4+b.cRank*0.6;
    b.crowd=b.aRank;
    b.quad=(b.aRank>=0.5?'放量':'缩量')+(b.chg>=0?'上涨':'下跌');
    b.quadrant=b.chg>=0?(b.aRank>=0.5?'主线·放量领涨':'缩量上涨'):(b.aRank>=0.5?'退潮·放量下跌':'冷门·缩量下跌');
  });
  return {list,totalAmt};
})();

/* ---- 导航 ---- */
const MODS={};
const HEAD={
  wave:['VIEW 01','狼波周期指数',['<span class="tag real">指数日线真实</span>','<span class="tag proxy">公式为等价复刻</span>']],
  breadth:['VIEW 03','双冰点情绪',['<span class="tag real">涨跌家数真实</span>','<span class="tag proxy">阈值口径可切换</span>']],
  rotate:['VIEW 11','板块轮动',['<span class="tag real">板块快照真实</span>','<span class="tag proxy">周度动量为代理</span>']],
  volume:['VIEW 06','放量信号',['<span class="tag real">成交额真实</span>','<span class="tag proxy">事件研究含样本重叠</span>']],
  etf:['VIEW 07','ETF 日度申赎',['<span class="tag real">季度申赎真实</span>','<span class="tag proxy">日度份额为估计</span>','<span class="tag na">不做买方身份归因</span>']],
  daily:['VIEW 08','日度全景',['<span class="tag real">成交额真实</span>','<span class="tag proxy">净流入为代理</span>']],
  wyckoff:['VIEW 02','威科夫吸筹结构',['<span class="tag real">多周期 K 线真实</span>','<span class="tag proxy">事件为算法标注</span>']],
  flow:['VIEW 04','市场宽度与拥挤度',['<span class="tag real">逐股日线全市场</span>','<span class="tag real">TMT 行业成交额真实</span>','<span class="tag na">非真实资金流</span>']],
  erp:['VIEW 12','股债利差(ERP)区间',['<span class="tag blue">数值锁定只读</span>','<span class="tag real">PE / 国债 / 指数真实</span>','<span class="tag na">不构成投资建议</span>']],
  derivatives:['VIEW 09','衍生品 / 对冲压力',['<span class="tag real">中金所行情真实</span>','<span class="tag real">会员持仓真实</span>','<span class="tag na">IV / skew 未接入</span>']],
  leverage:['VIEW 10','杠杆与真实资金',['<span class="tag real">两融全历史真实</span>','<span class="tag real">ETF 季度申赎真实</span>','<span class="tag proxy">T+1 披露</span>']],
  sentiment:['VIEW 05','短线情绪与连板',['<span class="tag real">涨跌停池真实</span>','<span class="tag real">涨停/连板已回补 250 日</span>','<span class="tag na">炸板率历史不可得</span>']],
  vix:['VIEW 06','波动率与恐慌指数',['<span class="tag real">中金所结算价真实</span>','<span class="tag proxy">自编 EdsonVIX · 方法同 CBOE</span>','<span class="tag na">非官方复刻</span>']],
  valuation:['VIEW 13','行业估值与预期修正',['<span class="tag real">行业 PE 真实</span>','<span class="tag proxy">预期修正为业绩预告代理</span>']],
  events:['VIEW 14','筹码供给与事件',['<span class="tag real">解禁 / 龙虎榜真实</span>','<span class="tag na">无 Level-2 委托</span>']],
  cross:['VIEW 15','跨市场与宏观',['<span class="tag real">外盘 / 汇率 / 中债真实</span>','<span class="tag proxy">非盘中实时</span>']],
  review:['VIEW 16','每日复盘',['<span class="tag real">九栏数据同源</span>','<span class="tag proxy">固定规则生成</span>','<span class="tag na">非投资建议</span>']],
};
/* ---- 动态栏目顺序 ----------------------------------------------------
   VIEW_ORDER 由 build_workbench.py 从 views.json 注入。
   新增数据栏目只需写进 views.json 并插在 review 之前；NAV 编号、HEAD 编号、
   复盘页脚都按同一份配置自动重排，review 永远强制排最后。            */
const NAV_META={};
$$('#NAV button').forEach(b=>{
  const nm=b.querySelector('.nm'), sb=b.querySelector('.sb');
  NAV_META[b.dataset.v]={nm:nm?nm.textContent:'',sb:sb?sb.textContent:''};
});
const VIEW_ORDER_ALL=(function(){
  const base=(typeof VIEW_ORDER!=='undefined'&&Array.isArray(VIEW_ORDER))?VIEW_ORDER.slice():[];
  const o=base.filter(v=>NAV_META[v]&&v!=='review');
  Object.keys(NAV_META).forEach(v=>{if(v!=='review'&&o.indexOf(v)<0)o.push(v);});
  o.push('review');                       // 强制末尾，配置写错也不会让复盘跑到中间
  return o;
})();
/* 编号优先取 views.json 的 fixedNo 固定表：菜单按语义分组重排后，
   01~16 的栏目编号、HEAD 的 VIEW 文案、复盘与验证脚本断言全部保持原值。 */
const VIEW_NO=v=>(typeof FIXED_NO!=='undefined'&&FIXED_NO[v])
  ? FIXED_NO[v] : String(VIEW_ORDER_ALL.indexOf(v)+1).padStart(2,'0');
const DATA_VIEW_COUNT=VIEW_ORDER_ALL.length-1;
/* 菜单显示顺序：groups 仅决定视觉分组与顺序，不参与编号计算。
   分组标题用 div.navgrp（不是 button），因此 #NAV button 计数恒为栏目数。 */
const NAV_DISPLAY=(function(){
  const gs=(typeof VIEW_GROUPS!=='undefined'&&Array.isArray(VIEW_GROUPS))?VIEW_GROUPS:[];
  const flat=[]; gs.forEach(g=>(g.views||[]).forEach(v=>{if(NAV_META[v]&&flat.indexOf(v)<0)flat.push(v);}));
  VIEW_ORDER_ALL.forEach(v=>{if(flat.indexOf(v)<0)flat.push(v);});
  if(flat.indexOf('review')>=0){flat.splice(flat.indexOf('review'),1);flat.push('review');}
  return {groups:gs,flat:flat};
})();
(function(){
  let html='', gi=0;
  NAV_DISPLAY.flat.forEach(v=>{
    const g=NAV_DISPLAY.groups.find(x=>(x.views||[]).indexOf(v)>=0);
    if(g && (g.views||[])[0]===v){
      gi++;
      html+='<div class="navgrp" data-g="'+gi+'" title="'+esc(g.hint||g.name)+'">'+
            '<span class="gn">'+esc(g.name)+'</span></div>';
    }
    const m=NAV_META[v]||{nm:v,sb:''};
    html+='<button data-v="'+esc(v)+'"><span class="no">'+VIEW_NO(v)+'</span>'+
          '<span class="txt"><span class="nm">'+esc(m.nm)+'</span>'+
          '<span class="sb">'+esc(m.sb)+'</span></span></button>';
  });
  $('#NAV').innerHTML=html;
})();
VIEW_ORDER_ALL.forEach(v=>{if(HEAD[v])HEAD[v][0]='VIEW '+VIEW_NO(v);});
if(HEAD.review) HEAD.review[2]=HEAD.review[2].map(t=>t.replace('九栏数据同源',DATA_VIEW_COUNT+'栏数据同源'));
const NAVLABEL=$('#NAVLABEL');
if(NAVLABEL) NAVLABEL.textContent='栏目导航 / '+VIEW_ORDER_ALL.length+' VIEWS';
const RVN=$('#RV_NCOL'); if(RVN) RVN.textContent=DATA_VIEW_COUNT;
const RVT=$('#RV_TAG_NCOL'); if(RVT) RVT.textContent=DATA_VIEW_COUNT+'栏数据同源';

function b64Html(s){
  const bin=atob(s), u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(u);
}
const frameLoaded={};
function switchView(v){
  $$('#NAV button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  $$('.view').forEach(s=>s.classList.toggle('active',s.id==='V_'+v));
  const h=HEAD[v];
  $('#HD_EYEBROW').textContent=h[0]; $('#HD_TITLE').textContent=h[1];
  $('#HD_TAGS').innerHTML=h[2].join(' ');
  if(v==='wave'||v==='breadth'){
    if(!frameLoaded[v]){ $('#FRAME_'+v).srcdoc=b64Html(PAGE_B64[v]); frameLoaded[v]=1; }
  }else if(MODS[v]){
    requestAnimationFrame(()=>MODS[v].draw());
  }
  location.hash=v;
}
$$('#NAV button').forEach(b=>{
  b.title=(HEAD[b.dataset.v]||['',''])[1];
  b.addEventListener('click',()=>switchView(b.dataset.v));
});

/* ---- 左侧菜单折叠（状态持久化，展开/收起后重绘当前栏目 canvas） ---- */
const SIDE=$('.side'),CB=$('#collapseBtn');
let collapsed=false;
try{collapsed=localStorage.getItem('wb_side_collapsed')==='1';}catch(e){}
function applyCollapse(redraw){
  SIDE.classList.toggle('collapsed',collapsed);
  CB.textContent=collapsed?'»':'«';
  CB.title=collapsed?'展开菜单':'收起菜单';
  try{localStorage.setItem('wb_side_collapsed',collapsed?'1':'0');}catch(e){}
  if(redraw) setTimeout(()=>{
    const v=location.hash.slice(1);
    if(MODS[v]) MODS[v].draw();
  },240);
}
CB.addEventListener('click',()=>{collapsed=!collapsed;applyCollapse(true);});
applyCollapse(false);

$('#ASOF').textContent=dateFmt(D.asof);
$('#HD_DATE').textContent='数据截止 '+dateFmt(D.asof);
let rz;
window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{
  const v=location.hash.slice(1); if(MODS[v]) MODS[v].draw();
},180);});
