const PAGE_B64={wave:'',breadth:''};
const VIEW_ORDER = ["wave", "breadth", "rotate", "volume", "etf", "daily", "wyckoff", "flow", "erp", "derivatives", "leverage", "sentiment", "vix", "valuation", "events", "cross", "review"];
const VIEW_GROUPS = [{"name": "趋势与结构", "hint": "相位判读 · 吸筹结构", "views": ["wave", "wyckoff"]}, {"name": "情绪与广度", "hint": "广度极值 · 宽度 · 封板 · 恐慌指数", "views": ["breadth", "flow", "sentiment", "vix"]}, {"name": "资金与杠杆", "hint": "量能 · ETF · 两融 · 对冲", "views": ["volume", "etf", "daily", "derivatives", "leverage"]}, {"name": "估值与宏观", "hint": "轮动 · 股债 · 事件 · 外盘", "views": ["rotate", "erp", "valuation", "events", "cross"]}, {"name": "每日复盘", "hint": "全栏汇总 · 永远末尾", "views": ["review"]}];
const FIXED_NO = {"wave": "01", "wyckoff": "02", "breadth": "03", "flow": "04", "sentiment": "05", "vix": "06", "volume": "07", "etf": "08", "daily": "09", "derivatives": "10", "leverage": "11", "rotate": "12", "erp": "13", "valuation": "14", "events": "15", "cross": "16", "review": "17"};
/* ==== wb_core.js ==== */
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

/* ==== wb_extras.js ==== */
/* ===== 6 类补充栏目共享内核：数据、通用 KPI / 判读 / 时序图 / 横条图 ===== */
'use strict';
const X  = JSON.parse(document.getElementById('EXTRAS').textContent);
/* HIST：一次性回补的长历史（行业 PE 250 日 / 涨停连板 250 日 / 跨市场 460 日）。
   与 EXTRAS 的「当日快照 + 逐日累积」分开存放，避免盘后更新覆盖已回补的历史。 */
const H  = JSON.parse((document.getElementById('HIST')||{textContent:'{}'}).textContent);
const HV = H.valuation || {}, HS = H.sentiment || {}, HC = H.cross || {};
const XM = X.meta || {};
const XD = X.derivatives || {}, XL = X.leverage || {}, XE = X.etfFlow || {},
      XS = X.sentiment || {}, XV = X.valuation || {}, XEV = X.events || {},
      XC = X.cross || {};

const xnum = v => (v == null || !isFinite(v)) ? null : +v;
const xf = (v, n) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(n == null ? 2 : n);
const xf0 = v => (v == null || !isFinite(v)) ? '—' : Math.round(v).toLocaleString('en-US');
const xsgn = v => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(2);
const xcls = v => (v == null || !isFinite(v)) ? '' : (v > 0 ? 'up' : (v < 0 ? 'down' : ''));

function XKPI(id, items) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = items.map(z =>
    '<div class="kpi"><div class="k">' + z[0] + '</div>' +
    '<div class="v ' + (z[3] || '') + '">' + z[1] + '</div>' +
    '<div class="s">' + z[2] + '</div></div>').join('');
}
function XDEC(id, title, level, tone, body, tags) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML =
    '<div class="card-h"><span class="t">' + title + '</span><span class="spacer"></span>' +
    (tags || []).join(' ') + '</div>' +
    '<div class="card-b" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">' +
    '<div style="flex:0 0 200px"><div class="k" style="font-size:10px;color:#5b6470">结构判读</div>' +
    '<div style="font-size:16px;font-weight:700;color:' + (tone || C.txt) +
    ';margin-top:7px;line-height:1.45">' + level + '</div></div>' +
    '<div style="flex:1;min-width:320px;font-size:12px;line-height:1.9;color:#c3cbd6">' + body +
    '</div></div>';
}
function XCAV(id, title, list) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = '<b>' + title + '</b><ul>' + list.map(v => '<li>' + v + '</li>').join('') + '</ul>';
}
function XEMPTY(id, msg) {
  const o = CV(id); if (!o) return;
  txt(o.x, msg || '数据不足', o.w / 2, o.h / 2, C.dim2, 'center', 11);
}

/* 通用横条图：rows = [{label, value, color, right}] */
function XBAR(id, rows, opts) {
  opts = opts || {};
  const o = CV(id); if (!o) return;
  if (!rows || !rows.length) { XEMPTY(id, opts.empty || '暂无数据'); return; }
  const g = frame(o, opts.pad || {l: 112, r: 74, t: 14, b: 22}), x = o.x;
  const vals = rows.map(r => xnum(r.value)).filter(v => v != null);
  if (!vals.length) { XEMPTY(id, '暂无有效数值'); return; }
  const centered = !!opts.centered;
  let lo = centered ? -Math.max(...vals.map(Math.abs)) * 1.12 : Math.min(0, Math.min(...vals));
  let hi = centered ? Math.max(...vals.map(Math.abs)) * 1.12 : Math.max(...vals) * 1.12;
  if (hi === lo) hi = lo + 1;
  const X = v => g.L + (v - lo) / (hi - lo) * g.W;
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * k / 3;
    hline(x, g.L, g.L + g.W, g.B - k / 3 * g.H, k === 0 ? C.line2 : C.line);
    txt(x, (opts.fmt || f1)(v), g.L - 7, g.B - k / 3 * g.H, C.dim2, 'right');
  }
  if (centered) vline(x, g.T, g.B, X(0), C.line2);
  const bh = g.H / rows.length;
  rows.forEach((r, i) => {
    const y = g.T + i * bh + bh * 0.18, h = bh * 0.64, v = xnum(r.value);
    if (v == null) return;
    const a = Math.min(X(0), X(v)), b = Math.max(X(0), X(v));
    rect(x, centered ? a : g.L, y, centered ? Math.max(1, b - a) : Math.max(1, X(v) - g.L), h,
         (r.color || (v >= 0 ? C.up : C.down)) + 'bb');
    txt(x, r.label, g.L - 7, y + h / 2, C.txt, 'right');
    txt(x, (opts.labelFmt || f1)(v) + (opts.unit || ''),
        (centered ? (v >= 0 ? b : a) : X(v)) + 5, y + h / 2, C.txt, 'left');
    if (r.right) txt(x, r.right, g.L + g.W + 6, y + h / 2, C.dim2, 'right');
  });
}

/* 通用时序图：series = [{name,data,color,type:'line'|'bar',axis:'left'|'right',width}] */
function XTS(id, dates, series, opts) {
  opts = opts || {};
  const o = CV(id); if (!o) return;
  if (!dates || !dates.length) { XEMPTY(id, opts.empty || '历史序列自入库首日起累积，当前样本不足'); return; }
  const g = frame(o, opts.pad || {l: 54, r: 54, t: 16, b: 24}), x = o.x;
  const L = series.filter(s => s.axis !== 'right'), R = series.filter(s => s.axis === 'right');
  const flat = a => a.reduce((acc, s) => acc.concat((s.data || []).filter(v => v != null && isFinite(v))), []);
  let lv = flat(L), rv = flat(R);
  if (!lv.length && !rv.length) { XEMPTY(id, '暂无有效数值'); return; }
  let lo = Math.min.apply(null, lv.length ? lv : [0]), hi = Math.max.apply(null, lv.length ? lv : [1]);
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  let p = (hi - lo) * 0.12 || Math.max(1, Math.abs(hi) * 0.1); lo -= p; hi += p;
  let rlo = rv.length ? Math.min.apply(null, rv) : 0, rhi = rv.length ? Math.max.apply(null, rv) : 1;
  let rp = (rhi - rlo) * 0.15 || 1; rlo -= rp; rhi += rp;
  const n = dates.length;
  const X = i => g.L + (i + 0.5) / n * g.W;
  const Y = (v, right) => {
    const a = right ? rlo : lo, b = right ? rhi : hi;
    return g.B - (v - a) / (b - a || 1) * g.H;
  };
  for (let k = 0; k <= 4; k++) {
    const y = g.B - k / 4 * g.H, v = lo + (hi - lo) * k / 4, vr = rlo + (rhi - rlo) * k / 4;
    hline(x, g.L, g.L + g.W, y, k === 0 ? C.line2 : C.line);
    txt(x, (opts.fmt || f1)(v), g.L - 7, y, C.dim2, 'right');
    if (R.length) txt(x, (opts.fmt2 || f1)(vr), g.L + g.W + 7, y, C.dim2, 'left');
  }
  if (opts.zero && lo < 0 && hi > 0) hline(x, g.L, g.L + g.W, Y(0, false), C.line2, [3, 3]);
  const bars = series.filter(s => s.type === 'bar');
  const bw = Math.max(1, Math.min(18, g.W / n * 0.7 / Math.max(1, bars.length)));
  series.forEach((s, si) => {
    const right = s.axis === 'right';
    if (s.type === 'bar') {
      const bi = bars.indexOf(s);
      (s.data || []).forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        const y0 = Y(0, right), y1 = Y(v, right);
        const px = X(i) - bw * bars.length / 2 + bi * bw;
        rect(x, px, Math.min(y0, y1), bw * 0.88, Math.max(1, Math.abs(y1 - y0)),
             (s.color || C.blue) + 'bb');
      });
    } else {
      const pts = [];
      (s.data || []).forEach((v, i) => { if (v != null && isFinite(v)) pts.push([X(i), Y(v, right)]); });
      poly(x, pts, s.color || C.white, s.width || 1.4, s.dash);
      if (s.dot) pts.forEach(q => { x.beginPath(); x.arc(q[0], q[1], 2.2, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); });
    }
    if (s.guide != null) hline(x, g.L, g.L + g.W, Y(s.guide, right), s.color || C.accent, [3, 3]);
    void si;
  });
  const step = Math.max(1, Math.round(n / 7));
  for (let i = 0; i < n; i += step) txt(x, dateFmt(dates[i]), X(i), g.B + 12, C.dim2, 'center');
  if (opts.note) txt(x, opts.note, g.L + 5, g.T + 8, C.dim2, 'left');
  const legend = series.filter(s => s.name).map((s, i) =>
    [s.name, s.color || CAT_COLOR[i % CAT_COLOR.length]]);
  legend.forEach((z, i) => {
    const px = g.L + 6 + i * 118;
    rect(x, px, g.T - 2, 9, 3, z[1]);
    txt(x, z[0], px + 13, g.T - 1, C.dim, 'left');
  });
  if (opts.hover !== false) bindHover(id, (mx) => {
    const i = clamp(Math.floor((mx - g.L) / g.W * n), 0, n - 1);
    if (mx < g.L || mx > g.L + g.W) return '';
    let h = '<b>' + dateFmt(dates[i]) + '</b>';
    series.forEach(s => {
      const v = (s.data || [])[i];
      h += '<br>' + s.name + '：<b>' + (v == null || !isFinite(v) ? '—' : (opts.fmt || f2)(v)) + '</b>';
    });
    return h;
  });
}

/* 表格快捷填充 */
function XTAB(id, rows) {
  const el = document.getElementById(id); if (!el) return;
  const body = el.querySelector('tbody');
  if (body) body.innerHTML = rows.join('');
}

/* ==== wb_rotate.js ==== */
/* ===== 03 板块轮动 ===== */
(function(){
const W={cat:'全部',sort:'chg',q:'',sel:null,scatter:null,mom:null,noattr:true};
const BTC={'行业':C.blue,'概念':C.purple,'地域':C.dim2};
// 属性类板块：统计口径 / 持仓标签 / 指数纳入，不是可交易的题材主线
const ATTR=/重仓|融资融券|两融|次新|ST|预盈|预增|送转|破净|可转债|股权激励|解禁|减持|增持|回购|MSCI|富时|标普|沪股通|深股通|陆股通|AH股|B股|高价股|低价股|基金|QFII|社保|机构|含H股|转融/;
const isAttr=name=>ATTR.test(name);
const uniqLeader=a=>{const seen=new Set();return a.filter(b=>{if(seen.has(b.leaderCode))return false;seen.add(b.leaderCode);return true;});};
const ranked=(key)=>{
  let a=B.list.filter(b=> W.cat==='全部'||b.cat===W.cat);
  if(W.q) a=a.filter(b=>(b.name+b.leader+b.code).toLowerCase().includes(W.q.toLowerCase()));
  const val=b=>{
    switch(key){
      case 'chg':return b.chg; case 'amount':return b.amount;
      case 'r5':return b.mom?b.mom.r5:-999; case 'r20':return b.mom?b.mom.r20:-999;
      case 'crowd':return b.crowd; case 'score':return b.score;
    } return 0;
  };
  return a.sort((p,q)=>val(q)-val(p));
};
function rowHtml(b,rk){
  const m=b.mom;
  const qc=b.quadrant.indexOf('主线')>=0?'#e8453c':b.quadrant.indexOf('退潮')>=0?'#22a06b':b.quadrant.indexOf('缩量上涨')>=0?'#c9a24c':'#6b7787';
  return '<tr data-code="'+esc(b.code)+'" class="click'+(W.sel===b.code?' sel':'')+'">'+
    '<td class="l"><span style="color:#5b6470;font-size:10px">'+String(rk).padStart(2,'0')+'</span>&nbsp; '+esc(b.name)+'</td>'+
    '<td><span class="pill" style="background:'+BTC[b.cat]+'22;color:'+BTC[b.cat]+'">'+esc(b.cat)+'</span></td>'+
    '<td class="'+cls(b.chg)+'">'+sgn(b.chg)+'</td>'+
    '<td>'+f1(b.amount/1e8)+'</td>'+
    '<td>'+f2(b.amtPct)+'%</td>'+
    '<td>'+f0(b.count)+'</td>'+
    '<td class="l">'+esc(b.leader)+(b.leaderChg!=null?' <span class="'+cls(b.leaderChg)+'">'+sgn(b.leaderChg)+'</span>':'')+'</td>'+
    '<td class="'+(m?cls(m.r5):'')+'">'+(m?sgn(m.r5):'—')+'</td>'+
    '<td class="'+(m?cls(m.r20):'')+'">'+(m?sgn(m.r20):'—')+'</td>'+
    '<td>'+(m?f2(m.vr):'—')+'</td>'+
    '<td class="l"><span class="pill" style="background:'+qc+'22;color:'+qc+'">'+esc(b.quadrant)+'</span></td>'+
    '</tr>';
}
function decCard(no,title,q,rows,metric,footer){
  let body='';
  if(!rows.length) body='<div class="empty">当前筛选下无可用数据</div>';
  rows.forEach((b,i)=>{
    const v=metric(b);
    body+='<div class="row"><span class="rk">'+(i+1)+'</span>'+
      '<span class="nm">'+esc(b.name)+' <span class="tag" style="padding:0 4px">'+esc(b.cat)+'</span></span>'+
      '<span class="meta">'+esc(b.leader||'')+'</span>'+
      '<span class="v '+v.cls+'">'+v.t+'</span></div>';
  });
  return '<div class="dec" style="display:flex;flex-direction:column"><div class="h"><span class="n">'+no+'</span><span class="t">'+title+'</span><span class="q">'+q+'</span></div>'+
    '<div class="b" style="flex:1">'+body+'</div>'+
    (footer?'<div style="padding:9px 13px;border-top:1px solid #1c2430;font-size:10px;color:#5b6470;line-height:1.7">'+footer+'</div>':'')+'</div>';
}
function drawDec(){
  const all=B.list;
  const pool=W.noattr?all.filter(b=>!isAttr(b.name)):all;
  const today=[...pool].sort((a,b)=>b.score-a.score).slice(0,3);
  const withMom=all.filter(b=>b.mom);
  const week=uniqLeader([...(W.noattr?pool.filter(b=>b.mom):withMom)]
    .sort((a,b)=>b.mom.r5-a.mom.r5)).slice(0,3);
  const ebb=[...pool].filter(b=>b.chg<0).sort((a,b)=>b.amount-a.amount).slice(0,3);
  const crowd=[...pool].sort((a,b)=>b.amount-a.amount).slice(0,3);
  const h1=decCard('Q1','今天该看哪条主线','当日涨幅 × 成交额分位',today,
    b=>({t:sgn(b.chg)+'%',cls:cls(b.chg)}),
    '强度分 = 0.6×当日涨幅分位 + 0.4×成交额分位，全量 '+B.list.length+' 个板块'+(W.noattr?'（决策卡已剔除属性类）':'')+'。<b>单日横截面，不代表持续性</b>；当日全市场 '+f1(B.totalAmt/1e8)+' 亿成交额，上涨板块仅 '+all.filter(z=>z.chg>0).length+' 个。');
  const h2=decCard('Q2','本周哪条在延续','领涨股 5 日动量（代理）',week,
    b=>({t:sgn(b.mom.r5)+'%',cls:cls(b.mom.r5)}),
    '来自 '+Object.keys(D.boardMom).length+' 只领涨股的真实日线（被 '+withMom.length+' 个板块重复引用，榜单已按股票去重）。领涨股由当日快照选出，其历史收益<b>不等于板块指数</b>，存在选择偏差；20 日动量可对照看是否在延续。');
  const h3='<div class="dec"><div class="h"><span class="n">Q3</span><span class="t">哪里在退潮 / 哪里拥挤</span><span class="q">当日横截面</span></div><div class="b">'+
    '<div style="font-size:10px;color:#22a06b;padding:6px 0 2px;letter-spacing:1px">退潮 · 放量下跌</div>'+
    ebb.map((b,i)=>'<div class="row"><span class="rk">'+(i+1)+'</span><span class="nm">'+esc(b.name)+'</span>'+
      '<span class="meta">'+f1(b.amount/1e8)+' 亿</span><span class="v down">'+sgn(b.chg)+'%</span></div>').join('')+
    '<div style="font-size:10px;color:#f0b429;padding:10px 0 2px;letter-spacing:1px">拥挤 · 成交额最大</div>'+
    crowd.map((b,i)=>'<div class="row"><span class="rk">'+(i+1)+'</span><span class="nm">'+esc(b.name)+'</span>'+
      '<span class="meta">占全市场 '+f2(b.amtPct)+'%</span><span class="v amber">'+f1(b.amount/1e8)+'亿</span></div>').join('')+
    '</div></div>';
  $('#ROT_DEC').innerHTML=h1+h2+h3;
}
function drawScatter(){
  const o=CV('rot-scatter'); if(!o) return;
  const g=frame(o,{l:48,r:14,t:16,b:30}),{x}=g;
  const pts=B.list;
  const xs=pts.map(b=>Math.log10(Math.max(0.0001,b.amtPct)));
  const xmin=Math.min(...xs)-0.1, xmax=Math.max(...xs)+0.1;
  const ys=pts.map(b=>b.chg), ymin=Math.min(...ys,-1), ymax=Math.max(...ys,1);
  const X=v=>g.L+(v-xmin)/(xmax-xmin)*g.W;
  const Y=v=>g.B-(v-ymin)/(ymax-ymin)*g.H;
  const med=[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  // quadrant shade
  rect(x,X(med),g.T,g.L+g.W-X(med),Y(0)-g.T,'#e8453c08');
  rect(x,X(med),Y(0),g.L+g.W-X(med),g.B-Y(0),'#22a06b08');
  yTicks(x,g,ymin,ymax,4,v=>f1(v)+'%');
  [xmin,(xmin+med)/2,med,(med+xmax)/2,xmax].forEach(v=>{
    vline(x,g.T,g.B,X(v),C.line,[2,4]);
    txt(x,Math.pow(10,v).toFixed(2)+'%',X(v),g.B+12,C.dim2,'center');
  });
  hline(x,g.L,g.L+g.W,Y(0),C.line2);
  vline(x,g.T,g.B,X(med),'#5b6470',[3,4]);
  txt(x,'放量领涨 · 主线',X(med)+8,g.T+12,'#e8453c88');
  txt(x,'放量下跌 · 退潮',X(med)+8,g.B-12,'#22a06b88');
  txt(x,'缩量上涨',g.L+8,g.T+12,'#5b6470');
  txt(x,'冷门 · 缩量下跌',g.L+8,g.B-12,'#5b6470');
  txt(x,'拥挤 →',g.L+g.W-6,g.T+12,C.accent,'right');
  const geo=[];
  pts.forEach((b,i)=>{
    const px=X(xs[i]),py=Y(b.chg);
    const r=2.6+Math.sqrt(b.amtPct)*1.6;
    x.beginPath();x.arc(px,py,r,0,Math.PI*2);
    x.fillStyle=(BTC[b.cat]||C.dim)+'cc';x.fill();
    if(W.sel===b.code){x.strokeStyle='#fff';x.lineWidth=1.6;x.stroke();}
    geo.push({px,py,r,b});
  });
  W.scatter=geo;
}
function drawMom(){
  const o=CV('rot-mom'); if(!o) return;
  const g=frame(o,{l:96,r:52,t:14,b:22}),{x}=g;
  const withMom=B.list.filter(b=>b.mom).sort((a,b)=>b.mom.r5-a.mom.r5);
  const sel=withMom.slice(0,10).concat(withMom.slice(-10));
  const vs=sel.map(b=>b.mom.r5), lo=Math.min(...vs,-2),hi=Math.max(...vs,2);
  const pad=(hi-lo)*0.08, L=lo-pad, H=hi+pad;
  const X=v=>g.L+(v-L)/(H-L)*g.W;
  const bh=g.H/sel.length;
  vline(x,g.T,g.B,X(0),C.line2);
  [L,(L+H)/2,H].forEach(v=>{vline(x,g.T,g.B,X(v),C.line);});
  sel.forEach((b,i)=>{
    const y=g.T+i*bh+bh*0.16, h=bh*0.68, v=b.mom.r5;
    const x0=Math.min(X(0),X(v)), x1=Math.max(X(0),X(v));
    rect(x,x0,y,Math.max(1,x1-x0),h,(v>=0?C.up:C.down)+'bb');
    txt(x,b.name,g.L-7,y+h/2,C.txt,'right');
    txt(x,sgn(v)+'%',v>=0?x1+5:x0-5,y+h/2,v>=0?C.up:C.down,v>=0?'left':'right');
  });
  txt(x,'5 日动量（% , 领涨股代理）',g.L,g.B+12,C.dim2,'left');
  W.mom=null;
}
function drawTable(){
  const rows=ranked(W.sort);
  $('#rot-count').textContent=rows.length+' / '+B.list.length+' 个板块';
  $('#rot-tab tbody').innerHTML=rows.map((b,i)=>rowHtml(b,i+1)).join('');
  $$('#rot-tab tbody tr').forEach(tr=>tr.addEventListener('click',()=>{
    W.sel=tr.dataset.code; drawScatter(); drawTable();
  }));
}
function caveat(){
  $('#ROT_CAVEAT').innerHTML='<b>口径与边界（务必先读）</b><ul>'+
    '<li><b>真实数据：</b>新浪财经行业 49 / 概念 172 / 地域 31 共 '+B.list.length+' 个板块的 '+dateFmt(D.asof)+' 收盘横截面，含涨跌幅、成交额、成分数、领涨股。</li>'+
    '<li><b>代理数据：</b>「本周主线」与动量榜使用 '+Object.keys(D.boardMom).length+' 只重点板块<b>领涨股</b>的真实日线（5 / 20 日收益、5 日量能比），被 '+B.list.filter(b=>b.mom).length+' 个板块引用；同一只股票常同时领涨多个概念，决策卡已按股票去重。领涨股是当日快照选出的，其历史收益只代表该股自身，<b>不代表板块指数</b>，且存在明显选择偏差。</li>'+
    '<li><b>属性类板块：</b>「基金重仓 / 保险重仓 / 融资融券 / 次新股」等是统计口径或持仓标签，不是可交易的题材主线；决策卡默认剔除，可在上方开关还原，全量榜单始终保留全部板块。</li>'+
    '<li><b>不可得：</b>公开免费源没有板块指数的日度历史序列，所以「退潮」在本页只能表现为<b>当日放量下跌</b>的横截面判断，而非严格意义上的「由强转弱」趋势反转；「拥挤」用成交额占比分位度量，不含估值分位、融资余额或真实资金流。</li>'+
    '<li>板块归属存在重叠（同一只股票可同时属于多个概念），成交额在板块之间<b>不可加总</b>，占全市场比例仅用于横向比较。</li>'+
    '<li>本页是观察与决策辅助，不含任何买卖建议；单日横截面不能外推为持续性。</li></ul>';
}
function draw(){drawDec();drawScatter();drawMom();drawTable();}
$$('#rot-cat button').forEach(b=>b.addEventListener('click',()=>{
  $$('#rot-cat button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.cat=b.dataset.c;drawTable();
}));
$('#rot-sort').addEventListener('change',e=>{W.sort=e.target.value;drawTable();});
$('#rot-q').addEventListener('input',e=>{W.q=e.target.value.trim();drawTable();});
$('#rot-noattr').addEventListener('change',e=>{W.noattr=e.target.checked;drawDec();});
bindHover('rot-scatter',(mx,my)=>{
  if(!W.scatter) return null;
  let best=null,bd=1e9;
  W.scatter.forEach(p=>{const d=(p.px-mx)**2+(p.py-my)**2;if(d<bd){bd=d;best=p;}});
  if(!best||bd>(best.r+7)**2) return null;
  const b=best.b,m=b.mom;
  return '<b>'+esc(b.name)+'</b> <span style="color:#8892a0">'+esc(b.cat)+'</span><br>'+
    '当日 <span style="color:'+(b.chg>=0?C.up:C.down)+'">'+sgn(b.chg)+'%</span> · 成交额 '+f1(b.amount/1e8)+' 亿<br>'+
    '占全市场 '+f2(b.amtPct)+'%（分位 '+f0(b.aRank*100)+'）<br>'+
    '领涨股 '+esc(b.leader)+' <span class="'+cls(b.leaderChg)+'">'+sgn(b.leaderChg)+'%</span><br>'+
    '领涨股 5日 '+(m?sgn(m.r5)+'%':'—')+' · 20日 '+(m?sgn(m.r20)+'%':'—')+' · 量能比 '+(m?f2(m.vr):'—')+'<br>'+
    '<span style="color:#f0b429">'+esc(b.quadrant)+'</span>';
});
document.getElementById('rot-scatter').addEventListener('click',e=>{
  if(!W.scatter) return;
  const r=e.target.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  let best=null,bd=1e9;
  W.scatter.forEach(p=>{const d=(p.px-mx)**2+(p.py-my)**2;if(d<bd){bd=d;best=p;}});
  if(best&&bd<(best.r+8)**2){W.sel=best.b.code;drawScatter();drawTable();}
});
caveat();
MODS.rotate={draw};
})();

/* ==== wb_volume.js ==== */
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

/* ==== wb_etf.js ==== */
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

/* ==== wb_daily.js ==== */
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

/* ==== wb_wyckoff.js ==== */
/* ===== 07 威科夫吸筹结构：经典原理图 + 真实多周期因果标注 ===== */
(function(){
const WK = JSON.parse(document.getElementById('WYCK').textContent);
const S={sym:'sh000001',tf:'240',win:60,rev:0.025,volK:1.4,labels:true,viewN:750,
         rows:[],ev:[],rng:null,phase:'',geo:null,schGeo:null};
const NAME={};
WK.symbols.forEach(s=>NAME[s.code]=s);
const DEFREV={'1200':0.05,'240':0.025,'60':0.015,'30':0.012,'15':0.008};
// 区间宽度阈值按周期自适应：周期越大，正常波动越宽
const RTHR={'1200':0.24,'240':0.095,'60':0.055,'30':0.042,'15':0.032};
const MINLEN={'1200':10,'240':18,'60':22,'30':25,'15':25};
const EVDEF=[
  ['PS','初步支撑 / Preliminary Support','下跌途中首次出现明显买盘承接，跌势开始放缓，尚不能确认底部。','#8892a0'],
  ['SC','抛售高潮 / Selling Climax','恐慌性抛压集中释放，常伴巨量与长下影，是吸筹区间的下沿参照。','#e8453c'],
  ['AR','自动反弹 / Automatic Rally','SC 后空头回补与主力买入推动的第一波反弹，界定区间上沿（Creek）。','#f0b429'],
  ['ST','二次测试 / Secondary Test','回踩 SC 低点附近，若量能萎缩说明抛压减弱。','#4b9fea'],
  ['LPS','最后支撑点 / Last Point of Support','区间内较高位置的缩量回踩，浮筹被逐步吸收。','#9b7cf0'],
  ['SPRING','弹簧 / Spring','刻意跌破区间下沿后迅速收回，用于清洗止损盘；需次根不破新低才确认。','#e8453c'],
  ['TEST','测试 / Test','Spring 后再次回踩不破前低且缩量，是吸筹接近完成的信号。','#22a06b'],
  ['SOS','强势信号 / Sign of Strength','放量收盘站上 Creek，需求压倒供给。','#e8453c'],
  ['BU','回踩确认 / Back-Up / JAC','突破后回踩上沿不破，确认突破有效（Jump Across the Creek）。','#4b9fea'],
];
const EVC={}; EVDEF.forEach(e=>EVC[e[0]]=e[3]);
const EVDESC={}; EVDEF.forEach(e=>EVDESC[e[0]]={nm:e[1],ds:e[2]});
function covOf(tf){return (WK.coverage||{})[tf]||null;}
function covText(tf){
  const c=covOf(tf);
  if(!c) return '覆盖区间不可用';
  return c.from.slice(0,10)+' ~ '+c.to.slice(0,10)+' · '+f0(c.bars)+' 根 · '+
    f1(c.years)+' 年'+(c.meets3y?'（≥3 年）':'（不足 3 年·接口上限）');
}

function tlabel(t,tf){
  if(!t) return '';
  if(t.length>10) return t.slice(5,10)+' '+t.slice(11,16);
  return t.slice(2,4)+'/'+t.slice(5,7)+'/'+t.slice(8,10);
}
function quantile(a,q){
  if(!a.length) return null;
  const s=a.slice().sort((x,y)=>x-y);
  return s[clamp(Math.floor(q*(s.length-1)),0,s.length-1)];
}
function zigzag(rows,s,e,rev){
  const piv=[]; let trend=0,ext=rows[s][4],extI=s;
  for(let i=s+1;i<e;i++){
    const c=rows[i][4];
    if(trend>=0 && c>ext){ext=c;extI=i;}
    if(trend<=0 && c<ext){ext=c;extI=i;}
    if(trend>=0 && c<ext*(1-rev)){piv.push({i:extI,t:'H',p:ext,confirm:i});trend=-1;ext=c;extI=i;}
    else if(trend<=0 && c>ext*(1+rev)){piv.push({i:extI,t:'L',p:ext,confirm:i});trend=1;ext=c;extI=i;}
  }
  return piv;
}

/* ---------- 因果事件识别 ---------- */
function compute(){
  const rows=WK.bars[S.sym][S.tf]||[];
  S.rows=rows; S.ev=[]; S.rng=null; S.phase=''; S.segs=[];
  const n=rows.length;
  if(n<80) return;
  if(S._rowsRef!==rows){S._rowsRef=rows;S.viewEnd=n-1;}
  if(S.viewEnd==null||S.viewEnd>n-1) S.viewEnd=n-1;
  const win=Math.min(S.win,Math.floor(n/3));
  const rt=RTHR[S.tf]||0.095, minL=MINLEN[S.tf]||18;
  const flat=new Uint8Array(n);
  for(let i=win;i<n;i++){
    const hs=[],ls=[];
    for(let k=i-win;k<i;k++){hs.push(rows[k][2]);ls.push(rows[k][3]);}
    const hi=quantile(hs,0.92), lo=quantile(ls,0.08);
    flat[i]=((hi-lo)/lo<rt)?1:0;
  }
  // 全历史扫描：所有连续横盘段，而不是只取最后一段
  const segs=[];
  let p=win;
  while(p<n){
    if(!flat[p]){p++;continue;}
    const st=p;
    while(p<n&&flat[p])p++;
    const en=p-1;
    if(en-st>=minL){
      const hs=[],ls=[];
      for(let k=st;k<=en;k++){hs.push(rows[k][2]);ls.push(rows[k][3]);}
      const hi=quantile(hs,0.92), lo=quantile(ls,0.08);
      segs.push({id:segs.length+1,start:st,end:en,hi,lo,w:(hi-lo)/lo,cur:false});
    }
  }
  if(!segs.length){S.phase='未识别到横盘吸筹区间（可放宽窗口或换周期）';return;}
  segs[segs.length-1].cur=true;
  S.segs=segs; S.rng=segs[segs.length-1];

  const vol=rows.map(r=>r[5]);
  const vma=ma(vol,20,1);
  const vr=vol.map((v,i)=>vma[i]?v/vma[i]:1);

  // 每段独立识别 9 类事件；历史段的后续事件窗口截止到下一段开始前，
  // 最后一段仍到数据末端（保持原「当前判读」口径不变）。
  function segEvents(sg){
    const E=sg.E;
    const local=[];
    const add=(i,code,note,lag)=>{
      if(i==null||i<0||i>=n||i>E) return;
      if(local.some(e=>e.i===i&&e.code===code)) return;
      local.push({i,code,note:note||'',lag:lag||0,px:rows[i][4],vr:vr[i],t:rows[i][0],
                  seg:sg.id,cur:sg.cur});
    };
    const start=sg.start, last=sg.end, hi=sg.hi, lo=sg.lo;
    add(start,'PS','区间起点，跌势放缓');
    let sc=-1,scScore=-1e9;
    const scEnd=start+Math.floor((last-start)*0.6);
    for(let i=start;i<=scEnd;i++){
      const depth=(hi-rows[i][3])/(hi-lo||1);
      const score=depth*2+Math.min(vr[i],3)*0.35;
      if(score>scScore){scScore=score;sc=i;}
    }
    if(sc>=0) add(sc,'SC',vr[sc]>=S.volK*0.85?'量能同步放大':'量能未显著放大，SC 偏弱');
    const piv=zigzag(rows,Math.max(start,sc+1),E+1,S.rev);
    const ar=piv.find(q=>q.t==='H'&&q.i>sc&&q.p>lo+0.45*(hi-lo));
    if(ar){const lag=ar.confirm-ar.i;
      add(ar.i,'AR','于第 '+lag+' 根确认（滞后 '+lag+' 根）',lag);}
    if(ar){
      for(let i=ar.i+2;i<=Math.min(E,last+Math.floor(win/2));i++){
        if(rows[i][3]<=lo+0.28*(hi-lo)&&vr[i]<1.05){add(i,'ST','缩量回踩 SC 区域');break;}
      }
    }
    let spring=-1,springLow=null;
    for(let i=start+5;i<E;i++){
      if(rows[i][3]<lo*0.997&&rows[i][4]>lo&&rows[i+1][3]>=rows[i][3]*0.998){
        spring=i;springLow=rows[i][3];
      }
    }
    if(spring>=0) add(spring,'SPRING','次根未破新低，于 T+1 确认',1);
    if(spring>=0){
      for(let i=spring+2;i<=E;i++){
        if(rows[i][3]<=springLow*1.012&&rows[i][4]>lo&&vr[i]<1.15){add(i,'TEST','缩量不破 Spring 低点');break;}
      }
    }
    let lps=0;
    for(let i=start+3;i<=last&&lps<2;i++){
      if(local.some(e=>Math.abs(e.i-i)<3)) continue;
      if(rows[i][3]<=lo+0.22*(hi-lo)&&rows[i][4]>lo+0.06*(hi-lo)&&vr[i]<1.0){
        add(i,'LPS','缩量回踩支撑，位置逐步抬高');lps++;
      }
    }
    let sos=-1;
    for(let i=Math.max(last-5,start+10);i<=E;i++){
      if(rows[i][4]>hi&&vr[i]>=S.volK){sos=i;}
    }
    if(sos>=0) add(sos,'SOS','收盘站上上沿且量比 '+f2(vr[sos])+'×');
    if(sos>=0){
      for(let i=sos+1;i<=E;i++){
        if(rows[i][3]<=hi*1.012&&rows[i][4]>lo+0.4*(hi-lo)){add(i,'BU','回踩 Creek 不破');break;}
      }
    }
    return local;
  }

  const seen=new Set();
  segs.forEach((sg,k)=>{
    sg.E = sg.cur ? n-1 : Math.min(segs[k+1].start-1, sg.end+Math.max(win,40));
    segEvents(sg).forEach(e=>{
      const key=e.i+'|'+e.code;
      if(seen.has(key)) return;
      seen.add(key); S.ev.push(e);
    });
  });
  S.ev.sort((a,b)=>a.i-b.i);

  // 阶段判定只用「当前段」事件，历史段不参与，避免长历史把当前判读带偏
  const curEv=S.ev.filter(e=>e.cur);
  const has=c=>curEv.some(e=>e.code===c);
  if(has('SOS')) S.phase='Phase D→E：强势出现，趋势展开（SOS/BU 已确认）';
  else if(has('SPRING')) S.phase='Phase C：弹簧与测试（吸筹末段）';
  else if(has('ST')||has('LPS')) S.phase='Phase B：区间反复吸筹';
  else if(has('SC')) S.phase='Phase A：停止下跌（SC/AR/ST 构筑区间）';
  else S.phase='Phase B：区间震荡，事件尚不充分';
  S.vr=vr;
}

/* ---------- 经典吸筹结构原理图 ---------- */
const ANCHOR=[
  [0.00,0.10],[0.05,0.20],[0.10,0.38],[0.155,0.58],
  [0.205,0.90],                              // SC
  [0.245,0.62],[0.275,0.42],                // AR
  [0.315,0.66],[0.335,0.80],                // ST
  [0.385,0.52],[0.425,0.76],[0.470,0.50],[0.515,0.77],[0.560,0.51],[0.605,0.74],
  [0.650,0.965],                            // SPRING
  [0.685,0.79],                             // TEST
  [0.735,0.66],                             // LPS
  [0.790,0.50],[0.825,0.33],                // SOS
  [0.865,0.44],                             // BU
  [0.920,0.24],[1.000,0.08],
];
const SCH_EV=[
  [0.155,'PS','初步支撑'],[0.205,'SC','抛售高潮'],[0.275,'AR','自动反弹'],
  [0.335,'ST','二次测试'],[0.650,'SPRING','弹簧'],[0.685,'TEST','测试'],
  [0.735,'LPS','最后支撑'],[0.825,'SOS','强势信号'],[0.865,'BU','回踩确认'],
];
const PHASES=[
  [0.145,0.345,'A','停止下跌','#e8453c'],
  [0.345,0.620,'B','反复吸筹','#4b9fea'],
  [0.620,0.715,'C','弹簧 / 测试','#f0b429'],
  [0.715,0.895,'D','需求占优','#9b7cf0'],
  [0.895,1.000,'E','趋势展开','#22a06b'],
];
function schematicPath(n){
  const pts=[];
  for(let k=0;k<n;k++){
    const x=k/(n-1);
    let j=0;while(j<ANCHOR.length-2&&ANCHOR[j+1][0]<x)j++;
    const a=ANCHOR[j],b=ANCHOR[j+1];
    const u=(x-a[0])/(b[0]-a[0]||1);
    const sm=u*u*(3-2*u);
    const y=a[1]+(b[1]-a[1])*sm+Math.sin(k*1.7)*0.006;
    pts.push([x,y]);
  }
  return pts;
}
function drawSchematic(){
  const o=CV('wy-schematic');if(!o)return;
  const g=frame(o,{l:16,r:16,t:30,b:52}),{x}=g;
  const X=u=>g.L+u*g.W, Y=v=>g.T+v*(g.H-46);
  // phase bands
  PHASES.forEach(([a,b,nm,label,col])=>{
    rect(x,X(a),g.T,X(b)-X(a),g.H-46,col+'12');
    vline(x,g.T,g.B,X(a),'#2b3542');
    txt(x,'Phase '+nm,X(a)+5,g.T-14,col,'left',10);
    txt(x,label,X(a)+5,g.T-2,C.dim2,'left',9);
  });
  // support / creek
  const creekY=Y(0.45),supY=Y(0.80);
  hline(x,g.L,g.L+g.W,creekY,'#f0b42988',[5,4]);
  hline(x,g.L,g.L+g.W,supY,'#4b9fea88',[5,4]);
  txt(x,'CREEK 上沿阻力（供给）',g.L+g.W-6,creekY-8,'#f0b429','right',9);
  txt(x,'SUPPORT 下沿支撑（需求）',g.L+g.W-6,supY+9,'#4b9fea','right',9);
  // price path
  const pts=schematicPath(230).map(p=>[X(p[0]),Y(p[1])]);
  poly(x,pts,'#e6ecf5',2.1);
  // volume bars
  const vTop=g.H-40,vBot=g.H-2;
  for(let k=0;k<80;k++){
    const u=(k+0.5)/80;
    let h=0.16+0.10*Math.abs(Math.sin(k*1.1));
    if(u>0.18&&u<0.24)h=0.85;
    if(u>0.245&&u<0.30)h=0.66;
    if(u>0.63&&u<0.68)h=0.58;
    if(u>0.79&&u<0.85)h=0.92;
    if(u>0.90)h=0.55;
    const col=h>0.55?'#e8453c99':'#3d4b5e';
    rect(x,X(u)-2,vBot-h*(vBot-vTop),4,h*(vBot-vTop),col);
  }
  hline(x,g.L,g.L+g.W,vBot,'#33404f');
  txt(x,'VOLUME（示意）',g.L+5,vTop-6,C.dim2,'left',9);
  // events
  S.schGeo=[];
  SCH_EV.forEach(([u,code,cn],idx)=>{
    let py=null;
    const p=ANCHOR.find(a=>Math.abs(a[0]-u)<0.001);
    py=p?p[1]:0.5;
    const px=X(u),yy=Y(py),col=EVC[code]||C.accent;
    x.beginPath();x.arc(px,yy,4,0,Math.PI*2);x.fillStyle=col;x.fill();
    x.strokeStyle='#0b0e11';x.lineWidth=1.4;x.stroke();
    // 三档垂直错开，避免 Spring / TEST / LPS / SOS / BU 密集区标签互相覆盖
    const dy=[-15,15,29][idx%3];
    txt(x,code+(S.labels?' '+cn:''),px,yy+dy,col,'center',9);
    S.schGeo.push({px,yy,code,cn});
  });
  txt(x,'← 下跌趋势',g.L+4,g.B+12,C.dim2,'left',9);
  txt(x,'吸筹交易区间 TR →',X(0.5),g.B+12,C.dim,'center',9);
  txt(x,'Markup 上涨 →',g.L+g.W-4,g.B+12,'#22a06b','right',9);
  txt(x,'合成示意路径 · 非真实行情',g.L+4,g.T-14,C.dim2,'left',9);
}

/* ---------- 真实 K 线 + 事件标注 ---------- */
function updateCover(){
  const ce=$('#wy-cover'); if(!ce) return;
  const rows=S.rows, n=rows.length, g=S.geo;
  let extra='';
  if(g&&rows.length){
    extra=' · 可视 '+rows[g.s][0].slice(0,10)+' ~ '+rows[Math.min(n-1,g.end)][0].slice(0,10);
  }
  ce.textContent=covText(S.tf)+' · '+f0((S.segs||[]).length)+' 段结构 · 当前显示 '+
    f0(g?g.viewN:Math.min(S.viewN>0?S.viewN:n,n))+' 根'+extra;
}
function pill(x,cx,cy,w,h,fill,stroke){
  const a=cx-w/2,b=cy-h/2,r=Math.min(4,h/2);
  x.beginPath();x.moveTo(a+r,b);
  x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);
  x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();
  x.fillStyle=fill;x.fill();
  if(stroke){x.strokeStyle=stroke;x.lineWidth=1;x.stroke();}
}
function drawChart(){
  const o=CV('wy-chart');if(!o)return;
  const rows=S.rows;
  if(!rows.length){txt(o.x,'无数据',o.w/2,o.h/2,C.dim,'center');return;}
  const n=rows.length;
  const viewN=Math.min(S.viewN>0?S.viewN:n,n);
  const end=clamp(S.viewEnd==null?n-1:S.viewEnd,viewN-1,n-1);
  const s=end-viewN+1;
  S.viewEnd=end;
  /* 拖近（viewN 小）→ 字号变大、事件轨道行数变多；时间轴刻度同步加密 */
  const evSize  = viewN<=120?12:(viewN<=300?11:10);
  const axSize  = viewN<=120?11:(viewN<=300?10.5:10);
  const segSize = viewN<=300?10:9;
  const laneRows= viewN<=120?4:3;
  const laneH   = S.labels ? (44+(laneRows-1)*15) : 10;
  const g=frame(o,{l:58,r:14,t:laneH+12,b:34}),{x}=g;
  const vH=g.H*0.20, pH=g.H-vH-10, priceBottom=g.T+pH;
  const X=i=>g.L+(i-s+0.5)/viewN*g.W;
  const visSegs=(S.segs||[]).filter(sg=>sg.end>=s&&sg.start<=end);
  let pmin=Infinity,pmax=-Infinity;
  for(let i=s;i<=end;i++){pmin=Math.min(pmin,rows[i][3]);pmax=Math.max(pmax,rows[i][2]);}
  visSegs.forEach(sg=>{pmin=Math.min(pmin,sg.lo*0.985);pmax=Math.max(pmax,sg.hi*1.015);});
  const pad=(pmax-pmin)*0.06||1;pmin-=pad;pmax+=pad;
  const Y=v=>priceBottom-(v-pmin)/(pmax-pmin)*pH;
  let vmax=0;for(let i=s;i<=end;i++)vmax=Math.max(vmax,rows[i][5]);
  const VY=v=>g.B-v/(vmax||1)*vH;
  for(let k=0;k<=4;k++){
    const v=pmin+(pmax-pmin)*k/4,y=Y(v);
    hline(x,g.L,g.L+g.W,y,k===0?C.line2:C.line);
    txt(x,f2(v),g.L-7,y,C.dim2,'right',axSize);
  }
  // 全历史所有可见区间：淡带 + 上下沿；当前段加粗并标注 CREEK / SUPPORT
  visSegs.forEach(sg=>{
    const a=Math.max(s,sg.start),b=Math.min(end,sg.end);
    if(b<a)return;
    const x1=X(a),x2=X(b),xr=sg.cur?g.L+g.W:x2;
    rect(x,x1,g.T,Math.max(2,x2-x1),pH,sg.cur?'#4b9fea0e':'#4b9fea07');
    hline(x,x1,xr,Y(sg.hi),sg.cur?'#f0b42999':'#f0b42940',[5,4]);
    hline(x,x1,xr,Y(sg.lo),sg.cur?'#4b9fea99':'#4b9fea40',[5,4]);
    if(sg.cur){
      // 加底色，避免区间上/下沿文字压在 K 线上看不清
      const cw=segSize*10+16, cx0=g.L+g.W-5;
      pill(x,cx0-cw/2,Y(sg.hi)-9,cw,14,'#11171fe8','#f0b42955');
      txt(x,'CREEK '+f2(sg.hi),cx0-5,Y(sg.hi)-9,'#f0b429','right',segSize);
      pill(x,cx0-cw/2,Y(sg.lo)+10,cw,14,'#11171fe8','#4b9fea55');
      txt(x,'SUPPORT '+f2(sg.lo),cx0-5,Y(sg.lo)+10,'#4b9fea','right',segSize);
    }else if(viewN<=300){
      txt(x,'#'+sg.id,x1+3,g.T+10,C.dim2,'left',segSize-1);
    }
  });
  const bw=Math.max(1.2,g.W/viewN*0.62);
  for(let i=s;i<=end;i++){
    const [t,op,hi,lo,cl,v]=rows[i];
    const up=cl>=op, col=up?C.up:C.down;
    const px=X(i);
    vline(x,Y(hi),Y(lo),px,col+'aa');
    const y0=Y(Math.max(op,cl)),y1=Y(Math.min(op,cl));
    rect(x,px-bw/2,y0,bw,Math.max(1,y1-y0),col+'dd');
    rect(x,px-bw/2,VY(v),bw,g.B-VY(v),col+'55');
  }
  hline(x,g.L,g.L+g.W,g.B-vH,'#2b3542');
  // 时间轴：刻度密度按可用宽度自适应，附淡竖线；字号随缩放放大
  const labelW = viewN<=300?96:66;
  const maxTicks= clamp(Math.floor(g.W/labelW),3,10);
  const step=Math.max(1,Math.ceil(viewN/maxTicks));
  for(let i=s;i<=end;i+=step){
    const lab=viewN>400 ? rows[i][0].slice(2,7) : tlabel(rows[i][0],S.tf);
    vline(x,g.T,g.B-vH,X(i),'#1b2530',[3,5]);
    vline(x,g.B,g.B+4,X(i),C.line2);
    txt(x,lab,X(i),g.B+15,C.dim,'center',axSize);
  }
  txt(x,'VOL',g.L+5,g.B-vH+9,C.dim2,'left',axSize);

  // 事件点（仍在 K 线上方），geo 供 tooltip 命中
  const visible=S.ev.filter(e=>e.i>=s&&e.i<=end).map(e=>({
    e,px:X(e.i),py:Y(rows[e.i][3])-8,col:EVC[e.code]||C.accent
  }));
  visible.forEach(p=>{
    x.beginPath();x.arc(p.px,p.py,p.e.cur?4.2:2.8,0,Math.PI*2);
    x.fillStyle=p.e.cur?p.col:p.col+'99';x.fill();
    x.strokeStyle='#0b0e11';x.lineWidth=1.2;x.stroke();
    if(p.e.cur){x.beginPath();x.arc(p.px,p.py,7.5,0,Math.PI*2);
      x.strokeStyle=p.col+'66';x.lineWidth=1;x.stroke();}
  });
  /* 顶部独立事件轨道：标签不压 K 线，按横向占用自动分排，细引线连回事件点 */
  if(S.labels){
    txt(x,'EVENTS · 事件轨道',g.L+2,11,C.dim2,'left',9);
    txt(x,'滚轮缩放 · 拖拽平移 · 双击重置',g.L+g.W-2,11,C.dim2,'right',9);
    /* 按 x 从右到左放置，每行记录「已占用的最左端」：
       同一 x 簇的多个标签会沿水平方向依次往左展开成阶梯，而不是逐行竖堆。*/
    const laneLeft=new Array(laneRows).fill(g.L+g.W+40);
    const placed=[]; let omitted=0;
    const sorted=visible.slice().sort((a,b)=>(b.e.cur-a.e.cur)||(b.px-a.px));
    sorted.forEach(p=>{
      const lab=p.e.code==='SPRING'?'SPR':p.e.code;
      const wLab=lab.length*evSize*0.62+12;
      let cx=clamp(p.px,g.L+wLab/2,g.L+g.W-wLab/2), row=-1;
      for(let k=0;k<10&&row<0;k++){
        const c=clamp(cx-k*(wLab+10),g.L+wLab/2,g.L+g.W-wLab/2);
        row=laneLeft.findIndex(ll=>c+wLab/2 < ll-7);
        if(row>=0) cx=c;
      }
      if(row<0){omitted++;return;}        // 排不下则保留点、省略标签，绝不叠字
      laneLeft[row]=cx-wLab/2;
      const cy=28+row*15;
      placed.push({p,lab,cx,cy,wLab});
    });
    if(omitted) txt(x,'+'+omitted+' 个事件 · 放大可见',g.L+g.W-2,11+15,C.dim2,'right',9);
    placed.forEach(q=>{
      const {p,lab,cx,cy,wLab}=q;
      // 引线：从事件点垂直上行到轨道，再斜连到标签底部（错开时斜线指明归属）
      poly(x,[[p.px,p.py-6],[p.px,cy+9],[cx,cy+9]],p.col+'66',1,[3,3]);
      pill(x,cx,cy,wLab,13,p.e.cur?'#1b2431':'#141a22',p.e.cur?p.col+'aa':p.col+'55');
      txt(x,lab,cx,cy+0.5,p.e.cur?p.col:C.txt,'center',evSize);
    });
  }
  S.geo={s,end,n,viewN,X,Y,rows,geo:visible.map(p=>({px:p.px,py:p.py,e:p.e,cur:p.e.cur})),
         L:g.L,W:g.W,T:g.T,B:g.B};
  updateCover();
}
function drawInfo(){
  const r=S.rng, rows=S.rows, last=rows[rows.length-1];
  if(!last){
    $('#WY_INFO').innerHTML='<div class="card-h"><span class="t">当前判读</span></div>'+
      '<div class="card-b" style="color:#8892a0">该标的 / 周期无可用 K 线数据。</div>';
    $('#wy-evtab tbody').innerHTML='';$('#wy-evcount').textContent='0 个事件';return;
  }
  const pos=r?((last[4]-r.lo)/(r.hi-r.lo||1)*100):null;
  const nm=NAME[S.sym]?NAME[S.sym].name:S.sym;
  const pn=(WK.periods.find(p=>p.k===S.tf)||{}).n||S.tf;
  const cv=covOf(S.tf);
  const curN=S.ev.filter(e=>e.cur).length;
  $('#WY_INFO').innerHTML=
    '<div class="card-h"><span class="t">当前判读 · '+esc(nm)+' / '+esc(pn)+'</span><span class="spacer"></span>'+
    '<span class="tag proxy">结构解读，非交易信号</span></div>'+
    '<div class="card-b"><div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">'+
    '<div style="flex:1;min-width:280px"><div style="font-size:10px;color:#5b6470">阶段判定</div>'+
    '<div style="font-size:16px;font-weight:700;color:'+(S.phase.indexOf('D')>=0?C.up:C.accent)+';margin-top:6px">'+esc(S.phase)+'</div>'+
    '<div style="font-size:11px;color:#8892a0;margin-top:8px">最新收盘 <b style="color:#eef2f7">'+f2(last[4])+'</b>'+
    (pos!=null?' · 位于区间 <b>'+f1(pos)+'%</b> 分位（0%=支撑 / 100%=上沿）':'')+'</div></div>'+
    '<div style="flex:0 0 210px;font-size:11px;line-height:1.9;color:#8892a0">'+
    '区间内宽度 <b style="color:#eef2f7">'+(r?f2(r.w*100)+'%':'—')+'</b><br>'+
    '横盘判定阈值 <b style="color:#eef2f7">'+f2((RTHR[S.tf]||0.095)*100)+'%</b>（滚动 '+f0(S.win)+' 根）<br>'+
    '当前段长度 <b style="color:#eef2f7">'+(r?f0(r.end-r.start+1)+' 根':'—')+'</b><br>'+
    '识别区间 <b style="color:#eef2f7">'+f0((S.segs||[]).length)+' 段</b><br>'+
    '全历史事件 <b style="color:#eef2f7">'+f0(S.ev.length)+' 个</b>（当前段 '+f0(curN)+'）<br>'+
    '数据范围 <b style="color:#eef2f7">'+f0(rows.length)+' 根</b><br>'+
    (cv?'覆盖 <b style="color:#eef2f7">'+cv.from.slice(0,10)+' ~ '+cv.to.slice(0,10)+'</b><br>'+
      '<span style="color:'+(cv.meets3y?C.up:C.accent)+'">'+f1(cv.years)+' 年 · '+
      (cv.meets3y?'≥3 年':'不足 3 年（接口上限）')+'</span>':'')+
    '</div></div></div>';
  const evRows=S.ev.slice().reverse().map(e=>{
    const d=EVDESC[e.code]||{nm:'',ds:''};
    const segTag=e.cur?'<span class="pill" style="background:#f0b42922;color:#f0b429">#'+e.seg+' 当前</span>'
                      :'<span class="pill">#'+e.seg+' 历史</span>';
    return '<tr><td class="l">'+esc(tlabel(e.t,S.tf))+'</td>'+
      '<td class="l">'+segTag+'</td>'+
      '<td class="l"><span class="pill" style="background:'+(EVC[e.code]||'#888')+'22;color:'+(EVC[e.code]||'#888')+'">'+esc(e.code)+'</span></td>'+
      '<td class="l" style="font-family:inherit">'+esc(d.nm)+'</td>'+
      '<td>'+f2(e.px)+'</td><td>'+f2(e.vr)+'×</td>'+
      '<td>'+(e.lag?'T+'+e.lag:'收盘')+'</td>'+
      '<td class="l" style="font-family:inherit;color:#8892a0">'+esc(e.note)+'</td></tr>';
  }).join('');
  $('#wy-evtab tbody').innerHTML=evRows||'<tr><td colspan="8" class="l" style="color:#8892a0">当前参数下未识别到事件</td></tr>';
  $('#wy-evcount').textContent=S.ev.length+' 个事件 / '+(S.segs||[]).length+' 段';
}
function drawLegend(){
  $('#wy-legend').innerHTML=EVDEF.map(e=>
    '<tr><td class="l"><span class="pill" style="background:'+e[3]+'22;color:'+e[3]+'">'+esc(e[0])+'</span></td>'+
    '<td class="l" style="font-family:inherit;color:#8892a0">'+esc(e[1])+'</td>'+
    '<td class="l" style="font-family:inherit">'+esc(e[2])+'</td></tr>').join('');
}
function caveat(){
  const cv=WK.coverage||{};
  const covLines=Object.keys(cv).map(k=>{
    const c=cv[k], nm=(WK.periods.find(p=>p.k===k)||{}).n||k;
    return nm+' '+f0(c.bars)+' 根 / '+f1(c.years)+' 年'+(c.meets3y?'（≥3 年）':'（不足 3 年）');
  }).join('；');
  const short=(cv['30']&&cv['15'])?('30 分钟 '+f1(cv['30'].years)+' 年、15 分钟 '+f1(cv['15'].years)+' 年'):'短周期';
  $('#WY_CAVEAT').innerHTML='<b>口径与边界（务必先读）</b><ul>'+
    '<li><b>原理图是合成示意路径</b>，不是任何真实标的的历史行情，仅用于解释 Phase A→E 与 PS/SC/AR/ST/Spring/Test/LPS/SOS/BU 的相对位置关系。威科夫方法本身是<b>主观判读体系</b>，没有唯一标准答案。</li>'+
    '<li><b>真实标注是算法等价复刻，不是专家判读。</b>事件由固定规则产生：区间＝全历史中所有连续「过去 '+f0(S.win)+' 根高低点 8%/92% 分位宽度 &lt;'+f2((RTHR[S.tf]||0.095)*100)+'%（当前周期）」的横盘段（长度 ≥'+f0(MINLEN[S.tf]||18)+' 根）；SC 取前段最低点；AR 取因果 ZigZag 确认峰；Spring 要求收盘收回下沿且次根不破新低；SOS 要求放量收盘站上上沿。判读卡里的「区间内宽度」统计的是当前段自身的高低分位，与滚动窗口的判定阈值不是同一对象。参数敏感，换窗口/阈值结论会变。</li>'+
    '<li><b>全历史多段标注。</b>页面上<b>不再只标最近一段</b>：所有历史横盘段都画出淡蓝区间带与 CREEK / SUPPORT 虚线，并标注该段的 9 类事件；<b>最后一段</b>用高亮点与完整标签，仍作为「当前判读」的唯一依据（历史事件不参与 Phase 判定）。历史段的后续事件窗口截止到<b>下一段开始前</b>，避免把几年后的突破错记到早期区间。事件表按时间倒序列出全部段，用「#N 当前 / #N 历史」区分。密集视图下历史事件只画小点；缩放至 ≤200 根才显示历史标签，避免糊成一片。</li>'+
    '<li><b>存在事后视角。</b>每段横盘区间都是回看选出的，属于<b>结构描述</b>；事件点本身逐根因果确认（AR 有确认滞后、Spring 与部分突破为 T+1 确认），但区间边界会随新数据重绘。<b>不能把这张图当作实时买卖信号或回测依据</b>，未计交易成本、滑点与可执行性。</li>'+
    '<li><b>数据覆盖（2026-11-14 已拉长）：</b>'+esc(covLines)+'。日线 / 周线 / 60 分钟均 ≥3 年；<b>'+esc(short)+'受新浪接口 5001 根硬上限限制，无法达到 3 年</b>，腾讯 mkline 备用域名仅 320 根、主域名 502 也无法补齐。切到这两个周期时不要按 3 年视图理解。全部同源新浪不复权 K 线，8 个标的；volume 单位为「股」，仅用于相对量能比较（指数与 ETF 不可横向比较绝对值）。</li>'+
    '<li><b>缩放与平移。</b>真实行情图上<b>滚轮以鼠标位置为锚缩放</b>（最小 30 根，最大该周期全部数据）、<b>按住左键拖拽平移</b>查看任意历史区间、<b>双击或点「重置视图」回到最新</b>。「显示」下拉也可直接设定可见根数。缩放/平移只改变可视窗口，不改变事件判定（判定始终用该周期全部历史数据），也不会重新识别区间。长视图 x 轴改显「年-月」；事件表仍按全历史倒序列出。默认 750 根约等于 3 年日线。</li>'+
    '<li>周期越短，噪声越多、区间越不稳定；15 分钟图上识别到的「吸筹」在日线级别可能只是一次普通回调。请<b>从大到小逐级对照</b>。</li></ul>';
}
function draw(){compute();drawSchematic();drawChart();drawInfo();caveat();}

/* ---------- 交互 ---------- */
$('#wy-sym').innerHTML=WK.symbols.map(s=>'<option value="'+s.code+'">'+esc(s.name)+'</option>').join('');
$('#wy-sym').value=S.sym;
$('#wy-sym').addEventListener('change',e=>{S.sym=e.target.value;draw();});
$$('#wy-tf button').forEach(b=>b.addEventListener('click',()=>{
  $$('#wy-tf button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  S.tf=b.dataset.t;S.rev=DEFREV[S.tf]||0.025;$('#wy-rev').value=String(S.rev);draw();
}));
$('#wy-win').addEventListener('change',e=>{S.win=+e.target.value;draw();});
$('#wy-rev').addEventListener('change',e=>{S.rev=+e.target.value;draw();});
$('#wy-volk').addEventListener('change',e=>{S.volK=+e.target.value;draw();});
$('#wy-view').addEventListener('change',e=>{S.viewN=+e.target.value;S.viewEnd=S.rows.length-1;draw();});
$('#wy-reset').addEventListener('click',()=>{
  S.viewN=750;$('#wy-view').value='750';S.viewEnd=S.rows.length-1;draw();
});
$('#wy-labels').addEventListener('change',e=>{S.labels=e.target.checked;drawSchematic();drawChart();});
bindHover('wy-schematic',(mx,my)=>{
  if(!S.schGeo)return null;
  let best=null,bd=1e9;
  S.schGeo.forEach(p=>{const d=(p.px-mx)**2+(p.py-my)**2;if(d<bd){bd=d;best=p;}});
  if(!best||bd>14*14)return null;
  const d=EVDESC[best.code]||{};
  return '<b>'+esc(best.code)+' · '+esc(best.cn)+'</b><br><span style="color:#8892a0">'+esc(d.nm||'')+'</span><br>'+esc(d.ds||'');
});
bindHover('wy-chart',(mx,my)=>{
  const g=S.geo;if(!g)return null;
  let best=null,bd=1e9;
  g.geo.forEach(p=>{
    const d=(p.px-mx)**2+(p.py-my)**2;
    const lim=p.cur?13*13:7*7;   // 历史事件点命中半径更小，避免挡住 K 线 tooltip
    if(d<lim&&d<bd){bd=d;best=p;}
  });
  if(best){
    const e=best.e,d=EVDESC[e.code]||{};
    const tag=e.cur?'<span style="color:#f0b429">#'+e.seg+' 当前段</span>'
                   :'<span style="color:#8892a0">#'+e.seg+' 历史段</span>';
    return '<b>'+esc(e.code)+' · '+esc(d.nm||'')+'</b> '+tag+'<br>'+esc(tlabel(e.t,S.tf))+' · 收盘 '+f2(e.px)+
      ' · 量比 '+f2(e.vr)+'×<br><span style="color:#f0b429">'+esc(e.note)+'</span>'+
      '<br><span style="color:#8892a0">'+esc(d.ds||'')+'</span>';
  }
  const i=clamp(Math.round((mx-g.L)/g.W*g.viewN-0.5)+g.s,g.s,g.end);
  const r=g.rows[i];
  if(!r)return null;
  return '<b>'+esc(r[0])+'</b><br>开 '+f2(r[1])+' 高 '+f2(r[2])+' 低 '+f2(r[3])+' 收 <span style="color:'+
    (r[4]>=r[1]?C.up:C.down)+'">'+f2(r[4])+'</span><br>量 '+f0(r[5]/1e8)+' 亿股 · 量比 '+
    (S.vr&&S.vr[i]!=null?f2(S.vr[i])+'×':'—');
});
/* ---------- 真实行情：滚轮缩放 / 拖拽平移 / 双击重置 ---------- */
let wyDrag=null;
function wyWheel(e){
  const g=S.geo;if(!g||!S.rows.length)return;
  e.preventDefault();
  const r=e.currentTarget.getBoundingClientRect();
  const u=clamp((e.clientX-r.left-g.L)/g.W,0,1);
  const anchor=g.s+u*g.viewN;
  const factor=e.deltaY>0?1.25:0.8;
  const newN=clamp(Math.round(g.viewN*factor),30,S.rows.length);
  const newEnd=clamp(Math.round(anchor+(1-u)*newN-1),newN-1,S.rows.length-1);
  S.viewN=newN;S.viewEnd=newEnd;drawChart();
}
function wyDown(e){
  if(!S.geo)return;
  const r=e.currentTarget.getBoundingClientRect();
  wyDrag={x:e.clientX-r.left,end:S.viewEnd,moved:false};
  e.currentTarget.style.cursor='grabbing';
}
function wyMove(e){
  if(!wyDrag||!S.geo)return;
  const g=S.geo,r=e.currentTarget.getBoundingClientRect();
  const dx=e.clientX-r.left-wyDrag.x;
  if(!wyDrag.moved&&Math.abs(dx)<3)return;
  wyDrag.moved=true;
  if(typeof tipOff==='function')tipOff();
  const delta=Math.round(dx/g.W*g.viewN);
  S.viewEnd=clamp(wyDrag.end-delta,g.viewN-1,S.rows.length-1);
  drawChart();
}
function wyUp(){
  if(!wyDrag)return;
  const el=document.getElementById('wy-chart');if(el)el.style.cursor='grab';
  wyDrag=null;
}
function wyDbl(){if(S.rows.length){S.viewEnd=S.rows.length-1;drawChart();}}
(function bindChartInteractions(){
  const el=document.getElementById('wy-chart');if(!el)return;
  el.style.cursor='grab';
  el.addEventListener('wheel',wyWheel,{passive:false});
  el.addEventListener('mousedown',wyDown);
  el.addEventListener('mousemove',wyMove);
  el.addEventListener('dblclick',wyDbl);
  window.addEventListener('mouseup',wyUp);
})();
$('#wy-rev').value=String(S.rev);
S.viewN=+$('#wy-view').value;
drawLegend();
MODS.wyckoff={draw};
})();

/* ==== wb_flow.js ==== */
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

/* ==== wb_review.js ==== */
/* ===== 09 每日复盘：文章列表（图文）+ 全文详情 =====
   数据来自 build_review.py 生成的 data/reviews.json，纯 DOM 渲染，无 canvas。
   缩略图＝当日时间（年月 / 日 / 周几）＋ 近 20 日上证迷你走势。
*/
(function(){
const R = JSON.parse(document.getElementById('REVIEWS').textContent);
const LIST = R.reviews || [];
let sel = 0;

function spark(arr){
  if(!arr || arr.length < 2) return '';
  const lo=Math.min.apply(null,arr), hi=Math.max.apply(null,arr), w=56, h=14;
  const pts=arr.map((v,i)=>[(i/(arr.length-1)*w).toFixed(1),
                           (h-2-(v-lo)/(hi-lo||1)*(h-4)).toFixed(1)]);
  const col=arr[arr.length-1]>=arr[0]?C.up:C.down;
  return '<svg viewBox="0 0 56 14" preserveAspectRatio="none" aria-hidden="true">'+
         '<polyline points="'+pts.map(p=>p.join(',')).join(' ')+
         '" fill="none" stroke="'+col+'" stroke-width="1.3" stroke-linejoin="round"/></svg>';
}
function thumb(r){
  const ix=r.index||{}, chg=ix.chg;
  return '<div class="rv-thumb" title="'+esc(r.date)+' · '+esc(r.weekday)+'">'+
    '<div class="ym">'+esc(r.yearMonth)+'</div>'+
    '<div class="dd" style="color:'+(chg==null?C.accent:(chg>=0?C.up:C.down))+'">'+esc(r.dayNum)+'</div>'+
    spark(ix.spark)+'</div>';
}
function kpiChip(k){
  return '<span class="kp">'+esc(k.k)+'<b>'+esc(k.v)+'</b></span>';
}
function bulletBox(title,horizon,stance,points,triggers,falsify,tone){
  return '<div class="box"><div class="h">'+esc(title)+
    ' <span style="font-size:10px;color:var(--dim2);font-weight:400">'+esc(horizon)+'</span></div>'+
    '<div style="font-size:11px;color:'+(tone||C.accent)+';margin-bottom:6px">立场：'+esc(stance)+'</div>'+
    '<div class="lbl">观察要点</div><ul>'+points.map(z=>'<li>'+esc(z)+'</li>').join('')+'</ul>'+
    '<div class="lbl">触发条件</div><ul>'+triggers.map(z=>'<li>'+esc(z)+'</li>').join('')+'</ul>'+
    '<div class="lbl">证伪场景</div><ul>'+falsify.map(z=>'<li>'+esc(z)+'</li>').join('')+'</ul></div>';
}
function renderList(){
  $('#rv-count').textContent='共 '+LIST.length+' 篇 · 每交易日盘后自动生成';
  $('#rv-count2').textContent=LIST.length+' 篇';
  if(!LIST.length){
    $('#rv-list').innerHTML='<div style="color:var(--dim2);font-size:11px;padding:14px 4px;line-height:1.8">'+
      '暂无复盘报告。首个交易日盘后将由 build_review.py 自动生成；历史日期不做回溯生成（板块只有当日快照，回填会产生未来函数）。</div>';
    return;
  }
  $('#rv-list').innerHTML=LIST.map((r,i)=>{
    const chg=r.index&&r.index.chg;
    return '<div class="rv-item'+(i===sel?' on':'')+'" data-i="'+i+'">'+thumb(r)+
      '<div style="min-width:0;flex:1">'+
        '<div class="rv-t">'+esc(r.title)+'</div>'+
        '<div class="rv-d">'+esc(r.date)+' · '+esc(r.weekday)+' · 上证 '+
          '<span class="'+(chg==null?'':(chg>=0?'up':'down'))+'">'+sgn(chg)+'</span>'+
          ' · '+DATA_VIEW_COUNT+'栏汇总</div>'+
        '<div class="rv-tags">'+r.tags.slice(0,3).map(t=>'<span>'+esc(t)+'</span>').join('')+
          '<span>+'+(r.tags.length-3)+'</span></div>'+
      '</div></div>';
  }).join('')+
  '<div class="rv-next"><div class="d">NEXT · 待生成</div>'+
    '<div class="t">下一交易日盘后自动生成</div>'+
    '<div class="s">固定规则 · '+DATA_VIEW_COUNT+'栏同源 · 按日期去重<br>历史日期不回填（避免未来函数）</div></div>';
  $$('#rv-list .rv-item').forEach(el=>el.addEventListener('click',()=>{
    sel=+el.dataset.i; renderList(); renderDetail();
    $('#rv-detail').scrollIntoView({block:'nearest',behavior:'smooth'});
  }));
}
function renderDetail(){
  if(!LIST.length){$('#rv-detail').innerHTML='<div class="hint">暂无正文</div>';return;}
  const r=LIST[sel], ix=r.index||{}, chg=ix.chg;
  $('#rv-meta').textContent=esc(r.date)+' · '+esc(r.weekday)+' · 生成于 '+esc((r.createdAt||'').slice(0,16).replace('T',' '));
  let h='';
  h+='<h2 class="rv-h1">'+esc(r.title)+'</h2>';
  const snap=[
    ['上证收盘',f2(ix.close)],['涨跌幅',sgn(chg)],['成交额',f0(ix.amount)+' 亿'],
    ['涨 / 跌 / 平',f0(ix.up)+' / '+f0(ix.down)+' / '+f0(ix.flat)],
    ['最高 / 最低',f2(ix.high)+' / '+f2(ix.low)],['标的数',f0(ix.total)]
  ];
  h+='<div class="rv-kpis">'+snap.map(z=>'<div class="kpi"><div class="k">'+z[0]+
      '</div><div class="v '+(z[0]==='涨跌幅'?(chg==null?'':(chg>=0?'up':'down')):'')+'">'+z[1]+'</div></div>').join('')+'</div>';
  h+='<div class="rv-sum">'+esc(r.digest)+'</div>';
  h+='<div style="font-size:11px;color:var(--accent);margin:14px 0 8px;letter-spacing:.6px">一、'+DATA_VIEW_COUNT+'栏数据汇总（第 04 栏 TMT 交易拥挤度单列一节）</div>';
  (r.sections||[]).forEach((s,i)=>{
    h+='<div class="rv-sec"><div class="h"><span class="n">'+String(i+1).padStart(2,'0')+'</span>'+
       '<span class="t" style="font-size:12px;font-weight:700">'+esc(s.name)+'</span>'+
       '<span class="spacer" style="flex:1"></span>'+
       '<span class="pill" style="background:'+(s.tone==='up'?'#e8453c22':s.tone==='down'?'#22a06b22':'#4b9fea22')+
         ';color:'+(s.tone==='up'?C.up:s.tone==='down'?C.down:C.blue)+'">'+
         (s.tone==='up'?'偏强':s.tone==='down'?'偏弱':'中性')+'</span></div>'+
       '<div class="b"><div class="kpis">'+(s.kpis||[]).map(kpiChip).join('')+'</div>'+
       '<p>'+esc(s.text)+'</p></div></div>';
  });
  h+='<div style="font-size:11px;color:var(--accent);margin:16px 0 8px;letter-spacing:.6px">二、操作参考（条件化，不构成建议）</div>';
  const st=r.shortTerm||{}, lt=r.longTerm||{};
  h+='<div class="rv-adv">'+
     bulletBox('短线',st.horizon||'1~3 个交易日',st.stance,st.points||[],st.triggers||[],st.falsify||[],C.blue)+
     bulletBox('中长线',lt.horizon||'1~3 个月',lt.stance,lt.points||[],lt.triggers||[],lt.falsify||[],C.accent)+'</div>';
  const hm=(r.meta||{}).history||{};
  if(hm.available&&hm.available.length){
    h+='<div style="font-size:11px;color:var(--accent);margin:16px 0 8px;letter-spacing:.6px">三、长历史数据可得性清单（实测结论）</div>';
    h+='<div class="rv-sec"><div class="b"><p style="margin-bottom:9px;color:#c9a24c">'+esc(hm.note||'')+'</p>'+
       '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
       '<div><div style="font-size:11px;font-weight:700;color:'+C.down+';margin-bottom:6px">已按日回补 · 现在就有历史</div>'+
       hm.available.map(z=>'<div style="font-size:11px;line-height:1.7;margin:0 0 7px;padding-left:9px;border-left:2px solid '+C.down+'">'+
         '<b>'+esc(z.item)+'</b> <span class="mono" style="color:var(--acc)">'+esc(z.days)+' 日</span>'+
         '<div style="color:var(--dim2);font-size:10.5px">'+esc(z.source)+'</div></div>').join('')+'</div>'+
       '<div><div style="font-size:11px;font-weight:700;color:'+C.up+';margin-bottom:6px">确认拿不到历史 · 只有当日 / 逐日累积</div>'+
       (hm.unavailable||[]).map(z=>'<div style="font-size:11px;line-height:1.7;margin:0 0 7px;padding-left:9px;border-left:2px solid '+C.up+'">'+
         '<b>'+esc(z.item)+'</b><div style="color:var(--dim2);font-size:10.5px">'+esc(z.reason)+'</div>'+
         '<div style="color:'+C.down+';font-size:10.5px">替代：'+esc(z.alternative)+'</div></div>').join('')+'</div>'+
       '</div></div></div>';
  }
  h+='<div style="font-size:11px;color:var(--accent);margin:16px 0 8px;letter-spacing:.6px">四、生成机制与免责</div>';
  h+='<div class="rv-sec"><div class="b"><p style="margin-bottom:8px">'+esc((r.meta||{}).engine||'')+
     '；数据源：'+esc(((r.meta||{}).sources||[]).join('、'))+'。</p>'+
     ((r.meta||{}).degraded
       ? '<p style="margin-bottom:8px;color:#e6be5d">注意：数据降级，各源截止日期 '+
         esc(JSON.stringify(r.meta.dataAsOf||{}))+'，对应栏目读数沿用上一版。</p>' : '')+
     '<ul style="margin:0;padding-left:16px">'+
     ((r.meta||{}).caveat||[]).map(z=>'<li style="font-size:11px;line-height:1.85;color:var(--dim);margin:3px 0">'+esc(z)+'</li>').join('')+
     '</ul></div></div>';
  $('#rv-detail').innerHTML=h;
}
function renderCaveat(){
  $('#RV_CAVEAT').innerHTML='<b>复盘的边界</b><ul>'+
    '<li>报告由 <span class="mono">build_review.py</span> 用固定规则从本地数据生成，<b>不调用大模型、不联网</b>，每交易日盘后追加一篇，按日期覆盖去重。</li>'+
    '<li><b>不回填历史</b>：板块只有当日横截面快照，用今天的板块去复盘过去会产生未来函数；因此文章列表从首篇开始逐日累积。</li>'+
    '<li>'+DATA_VIEW_COUNT+' 栏读数与各栏页面同源；第 12 栏 ERP 的全部数字来自 <span class="mono">erp.json</span> 锁定快照，'+
    '<b>只读不复算</b>；板块 / ETF / 资金流 / TMT 成交占比均为<b>代理口径</b>；新增 6 栏中两融 / 中金所 / 涨跌停池 / 行业 PE / 解禁 / 跨市场为真实公开数据，'+
    '但 ETF 日度份额是量价反推估计、期权 IV 未接入、TMT 同口径占比历史与炸板率/跌停家数历史实测不可回补；'+
    '行业 PE 中位数/四分位、涨停/连板/晋级率、外部环境三类长历史已分别按日回补 250 / 250 / 460 日；'+
    '建议只给「条件 + 触发 + 证伪」，不含个股与点位预测。</li>'+
    '<li>新增栏目由 <span class="mono">views.json</span> 统一排序，复盘永远排在菜单末尾（当前 VIEW '+VIEW_NO('review')+'）。</li>'+
    '<li>已完成的严格因果检验显示：双冰点次日胜率 55.6% 对基准 52.5% 不显著；威科夫 Phase C 结构兑现率 25%、p=0.256 不显著。报告据此对两类信号保持克制。</li>'+
    '<li><b>本文不是投资建议</b>，不构成任何证券买卖依据。市场有风险，决策请自行判断。</li></ul>';
}
function draw(){renderList();renderDetail();}
function init(){
  renderCaveat();
  MODS.review={draw};
  draw();
}
init();
})();

/* ==== wb_erp.js ==== */
/* ===== 10 股债利差(ERP)区间 =====
   严格只读：所有展示数字均直接取自 data/erp.json 的 snapshot / series，
   由 fetch_erp.py 按固定口径一次性计算并锁定。本文件不重算 ERP、分位、
   通道、阈值、条件概率，也不做任何二次取整或四舍五入（raw() 原样输出）。
   图上画的通道 / 阈值线同样只读取已锁定的序列与阈值常量。
*/
(function(){
const EP   = JSON.parse(document.getElementById('ERP').textContent);
const SNAP = EP.snapshot || {}, META = EP.meta || {}, SER = EP.series || {fields:[],rows:[]};
const fi={}; (SER.fields||[]).forEach((k,i)=>fi[k]=i);
const R=SER.rows||[], N=R.length;
const TH=SNAP.thresholds||[], CP=SNAP.condProb||[], EV=SNAP.event||{}, AD=SNAP.advice||{};

/* 锁定值原样输出：数字不 toFixed / 不四舍五入 / 不改口径；文本（档位、建议、口径说明）原样返回 */
const raw = v => {
  if(v==null) return '—';
  if(typeof v==='string') return v;
  return isFinite(v) ? String(v) : '—';
};
const num = v => (typeof v==='number' && isFinite(v)) ? v : null;
const col = v => (v==null || !isFinite(v)) ? '' : (v>0?'up':(v<0?'down':''));
const dtFmt = d => d ? d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8) : '—';

const G={range:1250};
function ridx(i,k){const v=R[i][fi[k]];return num(v);}
function dstr(i){return String(R[i][fi.date]);}

function autoY(arrs,padPct){
  let lo=Infinity,hi=-Infinity;
  arrs.forEach(a=>a.forEach(v=>{if(v!=null&&isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v;}}));
  if(!isFinite(lo)) return {lo:-1,hi:1};
  if(lo===hi){lo-=1;hi+=1;}
  const p=(hi-lo)*(padPct||0.10);
  return {lo:lo-p,hi:hi+p};
}
function bounds(){
  const len=G.range>0?Math.min(G.range,N):N;
  return [Math.max(0,N-len),N-1];
}
/* 通用面板：与第 04 栏保持一致的视觉语言，但数据源全部为锁定序列 */
function panel(id,cfg){
  const o=CV(id); if(!o) return;
  const g=frame(o,{l:58,r:cfg.y2?58:14,t:18,b:26}), {x}=g;
  const s=cfg.s,e=cfg.e,n=Math.max(1,e-s+1);
  const X=i=>g.L+(n<=1?g.W/2:(i-s)/(e-s||1))*g.W;
  const yl=cfg.y,yr=cfg.y2||yl;
  const Y=(v,ax)=>{const q=ax==='right'?yr:yl;return g.B-(v-q.lo)/(q.hi-q.lo||1)*g.H;};
  yTicks(x,g,yl.lo,yl.hi,4,cfg.yfmt||f1);
  if(cfg.y2) for(let i=0;i<=4;i++){
    const v=yr.lo+(yr.hi-yr.lo)*i/4;
    txt(x,(cfg.y2fmt||f0)(v),g.L+g.W+7,g.B-i/4*g.H,C.dim2,'left');
  }
  if(cfg.zero!==false) hline(x,g.L,g.L+g.W,Y(0),C.line2);
  /* 通道填充：上下轨之间 */
  if(cfg.band&&cfg.band.length===n){
    x.save();x.fillStyle=cfg.bandColor||'#4b9fea14';x.beginPath();
    let started=false;
    for(let i=s;i<=e;i++){
      const u=cfg.band[i-s];
      if(u==null||!isFinite(u))continue;
      if(!started){x.moveTo(X(i),Y(u));started=true;}else x.lineTo(X(i),Y(u));
    }
    for(let i=e;i>=s;i--){
      const l=cfg.bandLow[i-s];
      if(l==null||!isFinite(l))continue;
      x.lineTo(X(i),Y(l));
    }
    x.closePath();x.fill();x.restore();
  }
  (cfg.hlines||[]).forEach(h=>{
    hline(x,g.L,g.L+g.W,Y(h.v),h.color||C.line2,h.dash||[3,3]);
    if(h.label) txt(x,h.label,g.L+g.W-4,Y(h.v)-7,h.color||C.dim2,'right',9);
  });
  (cfg.lines||[]).forEach(l=>{
    const pts=[];
    for(let i=s;i<=e;i++){
      const v=l.vals[i];
      if(v==null||!isFinite(v)){if(pts.length>1)poly(x,pts,l.color,l.width||1.5,l.dash);pts.length=0;continue;}
      pts.push([X(i),Y(v,l.axis)]);
    }
    if(pts.length>1)poly(x,pts,l.color,l.width||1.5,l.dash);
  });
  const step=Math.max(1,Math.round(n/7));
  for(let i=s;i<=e;i+=step) txt(x,dtFmt(dstr(i)).slice(2),X(i),g.B+12,C.dim2,'center');
  let lx=g.L+6;
  (cfg.legend||[]).forEach(z=>{txt(x,'■ '+z[0],lx,g.T+9,z[1]);lx+=z[0].length*8+26;});
  if(cfg.hover) bindHover(id,(mx,my)=>{
    if(mx<g.L||mx>g.L+g.W)return null;
    const i=clamp(Math.round(s+(mx-g.L)/g.W*(e-s)),s,e);
    return cfg.hover(i,X(i));
  });
}
function tipRow(k,v,c){return '<div>'+k+' <b'+(c?' style="color:'+c+'"':'')+'>'+v+'</b></div>';}

/* ---------- 6 个 KPI：全部原样锁定数字 ---------- */
function drawKpi(){
  const items=[
    ['ERP 股债利差',raw(SNAP.erp),'百分点 · '+raw(SNAP.tier),'amber'],
    ['历史分位',raw(SNAP.historyPercentile),'全样本 % · '+raw(SNAP.sampleDays)+' 个交易日',''],
    ['沪深300 PE-TTM',raw(SNAP.peTtm),'倍 · 月末官方锚点',''],
    ['盈利收益率',raw(SNAP.earningsYield),'100 / PE-TTM（%）',''],
    ['中债 10Y',raw(SNAP.y10),'国债到期收益率（%）',''],
    ['σ 偏离',raw(SNAP.sigmaDev),'相对 1250 日中枢',col(SNAP.sigmaDev)]
  ];
  $('#EP_KPI').innerHTML=items.map(z=>'<div class="kpi"><div class="k">'+z[0]+'</div>'+
    '<div class="v '+(z[3]||'')+'">'+z[1]+'</div><div class="s">'+z[2]+'</div></div>').join('');
}

/* ---------- 判读卡：档位 / 通道 / 建议（数值全锁定） ---------- */
function drawDec(){
  let h='<div class="card-h"><span class="t">当日档位判读 · '+esc(dtFmt(SNAP.asof))+'</span>'+
    '<span class="spacer"></span><span class="tag blue">数值已锁定 · 页面只读</span>'+
    '<span class="tag proxy">固定口径，不做参数寻优</span></div><div class="card-b">';
  h+='<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px">'+
    '<span style="font:600 27px JetBrains Mono,monospace;color:var(--accent)">'+esc(raw(SNAP.tier))+'</span>'+
    '<span style="font-size:12px;color:var(--dim)">ERP '+raw(SNAP.erp)+' 位于全样本 '+raw(SNAP.historyPercentile)+'% 分位</span>'+
    '<span style="font-size:11px;color:var(--dim2)">沪深300 收盘 '+raw(SNAP.close)+' 点</span></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px">';
  [['1250 日中枢',SNAP.channelMid],['标准差 σ',SNAP.channelSigma],['+2σ 上轨',SNAP.channelUpper],
   ['−2σ 下轨',SNAP.channelLower],['当前 σ 偏离',SNAP.sigmaDev]].forEach(z=>{
    h+='<div style="background:#1b2431;border-radius:6px;padding:9px 10px">'+
      '<div style="font-size:10px;color:var(--dim2)">'+z[0]+'</div>'+
      '<div style="font:600 15px JetBrains Mono,monospace;margin-top:5px;color:#eef2f7">'+raw(z[1])+'</div></div>';
  });
  h+='</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">';
  [['立场',AD.stance,C.accent],['操作建议',AD.action,C.blue],['证伪场景',AD.falsify,C.up]].forEach(z=>{
    h+='<div style="border-left:3px solid '+z[2]+';padding:2px 0 2px 10px">'+
      '<div style="font-size:10px;color:'+z[2]+';letter-spacing:.5px">'+z[0]+'</div>'+
      '<div style="font-size:11.5px;line-height:1.8;color:var(--dim);margin-top:4px">'+esc(raw(z[1]))+'</div></div>';
  });
  h+='</div></div>';
  $('#EP_DEC').innerHTML=h;
}

/* ---------- 图 01：ERP 历史 + 1250 日 ±2σ 通道 + 四档阈值 ---------- */
function drawMain(){
  const [s,e]=bounds(),n=e-s+1;
  const erp=[],mid=[],up=[],lo=[];
  for(let i=0;i<N;i++){erp.push(ridx(i,'erp'));mid.push(ridx(i,'mid'));up.push(ridx(i,'upper'));lo.push(ridx(i,'lower'));}
  const yy=autoY([erp.slice(s,e+1),up.slice(s,e+1),lo.slice(s,e+1),
                  TH.map(t=>num(t.erp))],0.10);
  const band=new Array(n),bandLow=new Array(n);
  for(let i=s;i<=e;i++){band[i-s]=up[i];bandLow[i-s]=lo[i];}
  const hls=TH.map((t,k)=>({v:num(t.erp),color:[C.accent,C.up,'#d35fa8',C.purple][k],label:t.name}));
  panel('ep-main',{s,e,y:Object.assign({},yy,{fmt:v=>f2(v)}),yfmt:v=>f2(v),
    zero:false,band,bandLow,bandColor:'#4b9fea20',
    hlines:hls,
    lines:[{vals:erp,color:C.accent,width:1.9},
           {vals:mid,color:C.blue,width:1.2,dash:[5,3]},
           {vals:up,color:C.up,width:1.1,dash:[3,3]},
           {vals:lo,color:C.down,width:1.1,dash:[3,3]}],
    legend:[['ERP',C.accent],['1250日中枢',C.blue],['±2σ 通道',C.up]],
    hover:i=>'<b>'+dtFmt(dstr(i))+'</b>'+
      tipRow('ERP',raw(num(ridx(i,'erp'))))+
      tipRow('中枢',raw(num(ridx(i,'mid'))))+
      tipRow('+2σ / −2σ',raw(num(ridx(i,'upper')))+' / '+raw(num(ridx(i,'lower'))))+
      tipRow('PE-TTM',raw(num(ridx(i,'pe'))))+
      tipRow('10Y',raw(num(ridx(i,'y10'))))+
      tipRow('沪深300',raw(num(ridx(i,'close'))))});
}

/* ---------- 图 02：沪深300 收盘 与 ERP 双轴对照 ---------- */
function drawPx(){
  const [s,e]=bounds();
  const close=[],erp=[];
  for(let i=0;i<N;i++){close.push(ridx(i,'close'));erp.push(ridx(i,'erp'));}
  const py=autoY([close.slice(s,e+1)],0.12),ey=autoY([erp.slice(s,e+1)],0.12);
  /* 左轴＝ERP、右轴＝沪深300 点位；close 必须显式 axis:'right'，erp 走左轴 */
  panel('ep-px',{s,e,y:Object.assign({},ey,{fmt:v=>f2(v)}),yfmt:v=>f2(v),
    y2:Object.assign({},py,{fmt:v=>f0(v)}),y2fmt:v=>f0(v),zero:false,
    lines:[{vals:close,color:C.white,width:1.5,axis:'right'},
           {vals:erp,color:C.accent,width:1.8}],
    legend:[['ERP(左)',C.accent],['沪深300(右)',C.white]],
    hover:i=>'<b>'+dtFmt(dstr(i))+'</b>'+
      tipRow('沪深300 收盘',raw(num(ridx(i,'close'))))+
      tipRow('ERP',raw(num(ridx(i,'erp'))))+
      tipRow('PE-TTM',raw(num(ridx(i,'pe'))))+
      tipRow('中债 10Y',raw(num(ridx(i,'y10'))))});
}

/* ---------- 图 03：四档阈值 → 点位换算（横向） ---------- */
function drawPoint(){
  const o=CV('ep-point'); if(!o)return;
  const {x,w,h}=o;
  const L=178,Rr=18,T=30,B=26,W=w-L-Rr,H=h-T-B;
  x.clearRect(0,0,w,h);
  x.font='10px "JetBrains Mono",Consolas,monospace';
  const cur=num(SNAP.close);
  const gaps=TH.map(t=>Math.abs(num(t.gapPct)||0));
  const mx=Math.max(1,...gaps)*1.18;
  hline(x,L,L+W,T-4,C.line2);
  /* 刻度 0 / mx/4 / mx/2 / 3mx/4 / mx */
  for(let i=0;i<=4;i++){
    const v=mx*i/4,px=L+W*i/4;
    vline(x,T,T+H,px,C.line);
    txt(x,'−'+f1(v)+'%',px,T+H+14,C.dim2,'center',9);
  }
  const rowH=H/TH.length;
  TH.forEach((t,k)=>{
    const cy=T+rowH*k+rowH/2;
    const gp=Math.abs(num(t.gapPct)||0);
    const bw=W*gp/mx;
    const c=[C.accent,C.up,'#d35fa8',C.purple][k];
    txt(x,String(k+1).padStart(2,'0')+' '+t.name,L-10,cy,C.dim,'right',10);
    rect(x,L,cy-9,bw,18,c+'44',c+'99');
    txt(x,'−'+raw(Math.abs(num(t.gapPct)))+'%',L+Math.max(6,bw-6),cy,c,'right',10);
    txt(x,raw(t.point)+' 点  ·  ERP '+raw(t.erp)+'  ·  PE '+raw(t.pe),L+6,cy,C.white,'left',9.5);
  });
  txt(x,'当前沪深300 '+raw(cur)+' 点（假设盈利与 10Y 不变，点位 = 现价 × 目标PE / 当前PE）',
      w/2,h-6,C.dim2,'center',9);
}

/* ---------- 图 04：历史条件概率（胜率 / 平均 / 中位收益） ---------- */
function drawProb(){
  const o=CV('ep-prob'); if(!o)return;
  const {x,w,h}=o;
  const g=frame(o,{l:56,r:52,t:24,b:34});
  x.clearRect(0,0,w,h);
  const win=CP.map(c=>num(c.winRate)),avg=CP.map(c=>num(c.avgRet)),med=CP.map(c=>num(c.medianRet));
  const ry=autoY([avg,med],0.25),wy={lo:0,hi:100};
  const Yr=v=>g.B-(v-ry.lo)/(ry.hi-ry.lo||1)*g.H;
  const Yw=v=>g.B-(v-wy.lo)/(wy.hi-wy.lo||1)*g.H;
  for(let i=0;i<=4;i++){
    const v=ry.lo+(ry.hi-ry.lo)*i/4,y=g.B-i/4*g.H;
    hline(x,g.L,g.L+g.W,y,i===0?C.line2:C.line);
    txt(x,f1(v)+'%',g.L-7,y,C.dim2,'right');
    txt(x,f0(wy.lo+(wy.hi-wy.lo)*i/4)+'%',g.L+g.W+7,y,C.dim2,'left');
  }
  hline(x,g.L,g.L+g.W,Yr(0),C.line2);
  hline(x,g.L,g.L+g.W,Yw(50),C.accent,[4,4]);
  txt(x,'50% 胜率基准',g.L+g.W-4,Yw(50)-7,C.accent,'right',9);
  const n=CP.length,gw=g.W/n,bw=Math.min(26,gw/4.2);
  CP.forEach((c,k)=>{
    const cx=g.L+gw*(k+0.5);
    [[avg[k],C.accent,-1.5,Yr(0)],[med[k],C.blue,-0.5,Yr(0)],[win[k],C.purple,0.5,g.B]].forEach(z=>{
      const y0=z[3],y1=(z[2]===0.5)?Yw(z[0]):Yr(z[0]);
      rect(x,cx+z[2]*bw-(bw/2),Math.min(y0,y1),bw,Math.max(1,Math.abs(y1-y0)),z[1]+'cc');
    });
    txt(x,c.horizon+' 日',cx,g.B+13,C.dim,'center');
    txt(x,'n='+raw(c.samples),cx,g.B+25,C.dim2,'center',9);
  });
  let lx=g.L+6;
  [['平均收益(左)',C.accent],['中位收益(左)',C.blue],['胜率(右)',C.purple]].forEach(z=>{
    txt(x,'■ '+z[0],lx,g.T+9,z[1]);lx+=z[0].length*8+26;});
  bindHover('ep-prob',(mx)=>{
    if(mx<g.L||mx>g.L+g.W)return null;
    const k=clamp(Math.floor((mx-g.L)/gw),0,CP.length-1),c=CP[k];
    return '<b>持有 '+raw(c.horizon)+' 个交易日</b>'+
      tipRow('样本数',raw(c.samples))+tipRow('胜率',raw(c.winRate)+'%')+
      tipRow('平均收益',raw(c.avgRet)+'%')+tipRow('中位收益',raw(c.medianRet)+'%')+
      '<div style="color:var(--dim2);margin-top:4px">样本重叠，仅作描述，未做显著性检验</div>';
  });
}

/* ---------- 区间事件进度 ---------- */
function drawEvent(){
  const inEv=!!EV.inEvent;
  const p=num(EV.progressPct);
  let h='<div class="card-h"><span class="t">本轮区间事件进度</span><span class="spacer"></span>'+
    '<span class="d">'+esc(raw(EV.definition))+'</span></div><div class="card-b">';
  h+='<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:10px">'+
    '<span style="font:600 22px JetBrains Mono,monospace;color:'+(inEv?C.up:C.dim)+'">'+
    (inEv?'已持续 '+raw(EV.runDays)+' 个交易日':'当前未进入区间')+'</span>'+
    '<span style="font-size:11px;color:var(--dim)">触发线 ERP ≥ '+raw(EV.thresholdErp)+
    '（90 分位），当前 ERP '+raw(SNAP.erp)+'</span></div>';
  const barW=p==null?0:clamp(p,0,100);
  h+='<div style="height:10px;background:#1b2431;border-radius:5px;overflow:hidden;margin-bottom:10px">'+
    '<div style="height:100%;width:'+f1(barW)+'%;background:'+(inEv?C.up:C.dim2)+'"></div></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">';
  [['当前进度',EV.progressPct,'%'],['历史区间次数',EV.eventCount,'次'],
   ['历史中位长度',EV.histMedianDays,'日'],['历史最长',EV.histMaxDays,'日'],
   ['距进入还差',EV.toEnterGap,'ERP 百分点']].forEach(z=>{
    h+='<div style="background:#1b2431;border-radius:6px;padding:9px 10px">'+
      '<div style="font-size:10px;color:var(--dim2)">'+z[0]+'</div>'+
      '<div style="font:600 15px JetBrains Mono,monospace;margin-top:5px;color:#eef2f7">'+
      raw(z[1])+(z[1]==null?'':' <span style="font-size:10px;color:var(--dim2)">'+z[2]+'</span>')+'</div></div>';
  });
  h+='</div><div class="hint">进度 = 本轮已持续天数 ÷ 历史区间中位长度 × 100%；'+
     '未进入区间时进度为空，只给出距触发线的 ERP 差值。</div></div>';
  $('#EP_EVENT').innerHTML=h;
}

/* ---------- 明细表 ---------- */
function drawTables(){
  let a='';
  TH.forEach((t,k)=>{
    a+='<tr><td class="l">'+esc(t.name)+'</td><td>'+raw(t.erp)+'</td><td>'+raw(t.erpGap)+'</td>'+
      '<td>'+raw(t.pe)+'</td><td>'+raw(t.point)+'</td>'+
      '<td class="down">'+raw(t.gapPoint)+'</td><td class="down">'+raw(t.gapPct)+'</td></tr>';
  });
  $('#ep-thtab tbody').innerHTML=a;
  let b='';
  CP.forEach(c=>{
    b+='<tr><td class="l">'+raw(c.horizon)+' 个交易日</td><td>'+raw(c.samples)+'</td>'+
      '<td class="up">'+raw(c.winRate)+'</td><td>'+raw(c.avgRet)+'</td><td>'+raw(c.medianRet)+'</td></tr>';
  });
  $('#ep-probtab tbody').innerHTML=b;
  let c='';
  const s=Math.max(0,N-22);
  for(let i=N-1;i>=s;i--){
    c+='<tr><td class="l">'+dtFmt(dstr(i))+'</td>'+
      '<td>'+raw(num(ridx(i,'erp')))+'</td><td>'+raw(num(ridx(i,'pe')))+'</td>'+
      '<td>'+raw(num(ridx(i,'y10')))+'</td><td>'+raw(num(ridx(i,'close')))+'</td>'+
      '<td>'+raw(num(ridx(i,'mid')))+'</td><td>'+raw(num(ridx(i,'upper')))+'</td>'+
      '<td>'+raw(num(ridx(i,'lower')))+'</td></tr>';
  }
  $('#ep-tab tbody').innerHTML=c;
}

function drawCaveat(){
  let h='<b>固定口径（不得改动）与数据局限（务必先读）</b><ul>';
  h+='<li><b>公式</b>：'+esc(raw(META.formula))+'；<b>通道</b>：'+esc(raw(META.channel))+
     '；<b>档位</b>：'+esc(raw(META.tierRule))+'。</li>';
  h+='<li><b>点位换算</b>：'+esc(raw(META.pointConversion))+'。</li>';
  h+='<li><b>条件概率定义</b>：'+esc(raw(META.condProbDef))+'。</li>';
  h+='<li><b>日频 PE 重构</b>：'+esc(raw(META.dailyPeMethod))+'</li>';
  (META.caveats||[]).forEach(z=>h+='<li>'+esc(z)+'</li>');
  h+='<li><b>数值锁定</b>：本栏所有数字由 <span class="mono">fetch_erp.py</span> 按上述口径一次性计算并写入 '+
     '<span class="mono">data/erp.json</span>；页面、复盘与报告<b>只读</b>，不二次计算、不改口径、不做四舍五入。'+
     '盘后任务仅在出现新交易日时按同一口径追加新行，已锁定的历史数值不回溯修改。</li>';
  h+='<li><b>与既有「每周股债利差(ERP)区间与操作建议」周报的口径关系</b>：本栏是工作台内的独立实现'+
     '（fetch_erp.py），主读数（ERP / 历史分位 / PE-TTM / 10Y / 1250 日 ±2σ 通道）与周报同源同公式、可对照；'+
     '但<b>历史条件概率、本轮区间事件、档位建议措辞的定义不同</b>：本栏条件＝「ERP 不低于当前档位下界」、'+
     '区间事件＝「ERP ≥ 90 分位的连续区间」、持有期 20/60/120 日；周报条件＝「当前分位桶内样本」、'+
     '区间事件＝「首次进入 75–90 分位桶」、持有期 20/60/120/250 日，并使用 ddof=0 的滚动标准差。'+
     '因此两者的<b>胜率与区间进度数字不可直接比较，也不应互相覆盖</b>。'+
     '周报 2026-11-12 原样读数：ERP 6.33%、历史 78 分位、PE-TTM 12.60×、盈利收益率 7.94%、10年国债 1.603%、'+
     '5 年中枢 6.17% / 上轨 7.43% / 下轨 4.90%；本栏锁定日为 2026-11-13，晚一个交易日。</li>';
  h+='<li><b>ERP 不是择时信号</b>：它衡量股债相对性价比，对 1~3 日指数方向无稳定预测力；'+
     '「低估」可以长期更低估，建议仅为条件化描述，不构成投资建议。</li>';
  h+='</ul><b>数据源</b>：'+esc((META.sources||[]).join('、'))+'。<br>'+
     '<b>样本</b>：'+raw(SNAP.sampleDays)+' 个交易日（'+dtFmt(dstr(0))+' ~ '+dtFmt(dstr(N-1))+'）'+
     ' · 锁定基准日 '+esc(dtFmt(SNAP.asof))+'。';
  $('#EP_CAVEAT').innerHTML=h;
  $('#ep-cover').textContent='锁定 '+raw(SNAP.sampleDays)+' 日 · '+dtFmt(dstr(0))+' ~ '+dtFmt(dstr(N-1))+
    ' · 当前显示 '+raw((bounds()[1]-bounds()[0]+1))+' 日';
}

function draw(){
  drawKpi();drawDec();drawMain();drawPx();drawPoint();drawProb();
  drawEvent();drawTables();drawCaveat();
}
function init(){
  const sel=$('#ep-range');
  if(sel) sel.addEventListener('change',e=>{G.range=+e.target.value;draw();});
  MODS.erp={draw};
}
init();
})();

/* ==== wb_derivatives.js ==== */
/* ===== 10 衍生品 / 对冲压力 ===== */
(function(){
const W={prod:'IF',opt:'IO',range:30};
const FF=XD.futuresFields||[], OF=XD.optionsFields||[];
const fi=k=>FF.indexOf(k), oi=k=>OF.indexOf(k);
const prodName={IF:'沪深300',IH:'上证50',IC:'中证500',IM:'中证1000'};
const dates=XD.dates||[];
const slice=n=>n>0&&dates.length>n?dates.slice(-n):dates.slice();
function rows(p,n){const r=(XD.futures||{})[p]||[];const k=slice(n).length;return r.slice(-k);}
function orows(p,n){const r=(XD.options||{})[p]||[];const k=slice(n).length;return r.slice(-k);}

function dec(){
  const p=W.prod, r=rows(p,60), last=r[r.length-1]||[];
  const snap=(XD.snapshot||{})[p]||{}, rank=(XD.rank||{})[p]||{};
  const basis=xnum(last[fi('basis')]), ann=xnum(last[fi('annNear')]), ann2=xnum(last[fi('annSecond')]);
  const o=orows(W.opt,60), ol=o[o.length-1]||[];
  const pcr=xnum(ol[oi('pcrVol')]), pcrO=xnum(ol[oi('pcrOI')]);
  let level='贴水结构：中性',tone=C.dim;
  if(ann2!=null&&ann2<=-8){level='次月年化贴水偏深';tone=C.down;}
  else if(ann2!=null&&ann2>=0){level='次月合约升水';tone=C.up;}
  else if(ann2!=null&&ann2>-3){level='次月贴水温和';tone=C.accent;}
  const body=
    '<b>'+prodName[p]+'（'+p+'）</b>当月合约 <b>'+esc(last[fi('nearId')]||'—')+'</b> 收 '+xf(last[fi('nearClose')],1)+
    '，现货 '+xf(last[fi('spot')],1)+'，基差 <b style="color:'+(basis<0?C.down:C.up)+'">'+xf(basis,1)+' 点</b>；'+
    '当月年化 '+xf(ann,2)+'%（剩 '+xf0(last[fi('daysToExpiry')])+' 天），<b>次月 '+esc(last[fi('secondId')]||'—')+
    ' 年化 '+xf(ann2,2)+'%</b>（剩 '+xf0(last[fi('days2')])+' 天）。'+
    '当月临近到期时 365/剩余天数会显著放大年化，判读应以次月口径为主。<br>'+
    '<b>'+W.opt+'（'+(OPT_NAME[W.opt]||'')+'）期权</b>：成交量 PCR <b>'+xf(pcr,3)+'</b>、持仓量 PCR <b>'+xf(pcrO,3)+
    '</b>。PCR 上行只说明认沽相对活跃，卖 put 同样会推高成交量，不能直接读成看空。<br>'+
    '<b>'+p+' 前 20 席位</b>持买 '+xf0(rank.buy)+' 手、持卖 '+xf0(rank.sell)+' 手，净多空 <b style="color:'+
    ((rank.net||0)<0?C.down:C.up)+'">'+((rank.net||0)>0?'+':'')+xf0(rank.net)+' 手</b>。'+
    '这是会员排名口径，不含全市场账户，也不代表方向预测。<br>'+
    '<span style="color:#8892a0">真实隐含波动率 IV / IV skew 需要期权定价与市场报价，中金所 XML 只有 delta、结算价与持仓，本栏<b>未接入 IV，不做推算冒充</b>。</span>';
  XDEC('DV_DEC','今日结构判读 · '+dateFmt(dates[dates.length-1]||''),level,tone,body,
    ['<span class="tag real">中金所真实</span>','<span class="tag na">IV 未接入</span>']);
}
const OPT_NAME={IO:'沪深300',HO:'上证50',MO:'中证1000'};

function kpi(){
  const p=W.prod, r=rows(p,60), last=r[r.length-1]||[];
  const snap=(XD.snapshot||{})[p]||{}, rank=(XD.rank||{})[p]||{};
  const o=orows(W.opt,60), ol=o[o.length-1]||[];
  XKPI('DV_KPI',[
    ['当月基差',xf(last[fi('basis')],1)+' 点','期货−现货',xcls(-xnum(last[fi('basis')]))],
    ['当月年化贴水',xf(last[fi('annNear')],2)+'%','剩 '+xf0(last[fi('daysToExpiry')])+' 天'],
    ['次月年化贴水',xf(last[fi('annSecond')],2)+'%','剩 '+xf0(last[fi('days2')])+' 天','amber'],
    ['当月持仓',xf0(last[fi('nearOI')])+' 手',esc(last[fi('nearId')]||'')],
    ['四合约总持仓',xf0(last[fi('totalOI')])+' 手','全部挂牌合约'],
    [W.opt+' 成交量 PCR',xf(ol[oi('pcrVol')],3),'ΣP.vol / ΣC.vol'],
    [W.opt+' 持仓量 PCR',xf(ol[oi('pcrOI')],3),'ΣP.OI / ΣC.OI'],
    [p+' 会员净多空',((rank.net||0)>0?'+':'')+xf0(rank.net)+' 手','前 20 席位',((rank.net||0)<0?'down':'up')]
  ]);
}
function drawBasis(){
  const r=rows(W.prod,W.range), d=r.map(z=>z[0]);
  XTS('dv-basis',d,[
    {name:'基差(点)',data:r.map(z=>z[fi('basis')]),color:C.accent,type:'bar'},
    {name:'现货指数(右)',data:r.map(z=>z[fi('spot')]),color:C.white,axis:'right'}
  ],{zero:true,fmt:f1,fmt2:f0,pad:{l:54,r:64,t:18,b:24}});
}
function drawAnn(){
  const r=rows(W.prod,W.range), d=r.map(z=>z[0]);
  XTS('dv-ann',d,[
    {name:'当月年化',data:r.map(z=>z[fi('annNear')]),color:C.accent},
    {name:'次月年化',data:r.map(z=>z[fi('annSecond')]),color:C.blue,width:1.8},
    {name:'零轴',data:d.map(()=>0),color:C.line2,width:1,dash:[2,4]}
  ],{zero:true,fmt:f1});
}
function drawPcr(){
  const r=orows(W.opt,W.range), d=r.map(z=>z[0]);
  $('#dv-pcrsub')&&($('#dv-pcrsub').textContent=W.opt+' '+(OPT_NAME[W.opt]||''));
  XTS('dv-pcr',d,[
    {name:'成交量 PCR',data:r.map(z=>z[oi('pcrVol')]),color:C.up},
    {name:'持仓量 PCR',data:r.map(z=>z[oi('pcrOI')]),color:C.blue},
    {name:'PCR=1',data:d.map(()=>1),color:C.accent,width:1,dash:[3,3]}
  ],{fmt:v=>Number(v).toFixed(2)});
}
function drawOi(){
  const d=slice(W.range), ps=['IF','IH','IC','IM'];
  const base=(XD.futures||{}).IF||[];
  const idx=Object.fromEntries(base.map((z,i)=>[z[0],i]));
  XTS('dv-oi',d,ps.map((p,i)=>({name:p,data:d.map(dt=>{
    const a=(XD.futures||{})[p]||[];const j=idx[dt];return j==null?null:(a[j]?a[j][fi('totalOI')]:null);
  }),color:CAT_COLOR[i]})),{fmt:v=>f0(v/1000)+'k'});
}
function drawRank(){
  const p=W.prod, rank=(XD.rank||{})[p]||{};
  $('#dv-ranksub')&&($('#dv-ranksub').textContent=p+' · '+dateFmt(rank.date||''));
  XBAR('dv-rank',(rank.top||[]).slice(0,12).map(t=>({
    label:t[0],value:t[3],color:t[3]>=0?C.up:C.down
  })),{centered:true,fmt:f0,unit:' 手',pad:{l:150,r:66,t:14,b:22},empty:'当日会员排名未取到'});
}
function drawTab(){
  const p=W.prod, snap=(XD.snapshot||{})[p]||{};
  $('#dv-tabsub')&&($('#dv-tabsub').textContent=p+' · '+dateFmt((XD.rank||{})[p]?.date||''));
  const cs=snap.rows||[];
  XTAB('dv-tab',cs.map(c=>'<tr><td class="l">'+esc(c.id)+'</td><td>'+xf(c.close,1)+'</td>'+
    '<td class="'+xcls(xnum(c.close)-(snap.spot||0))+'">'+xsgn(xnum(c.close)-(snap.spot||0))+'</td>'+
    '<td>'+xf0(c.oi)+'</td><td>'+xf0(c.vol)+'</td><td>'+esc(c.exp||'')+'</td></tr>'));
}
function caveat(){
  XCAV('DV_CAVEAT','口径与边界（本页最重要）',[
    '<b>不是盘中实时。</b>中金所日行情 XML 为交易日收盘后公布，本页由盘后任务抓取；期权与期货均为当日结算口径。',
    '<b>真实 IV / IV skew 未接入。</b>中金所 XML 只有 delta、结算价、成交量与持仓，没有隐含波动率。用结算价反推 IV 需要标的分红、无风险利率与精确定价模型，本页不做推算，也不把 delta 分布冒充 skew。',
    '<b>年化贴水会被临近到期放大。</b>年化＝基差/现货×365/剩余自然日；当月合约剩 1~7 天时数值会剧烈放大，因此同时给出次月合约口径。到期日按「合约月份第三个周五」推算，遇法定节假日顺延可能与交易所实际最后交易日有 1 日误差。',
    '<b>会员净多空是排名口径。</b>datatypeid 0/1/2 按中金所排名表惯例分别对应成交量 / 持买单量 / 持卖单量（已用总量对照核验：持买、持卖前 20 席位合计分别约为全市场持仓的 78% / 86%）。净多空＝前 20 席位持买−持卖，不含全市场账户，且会员名下含客户持仓，<b>不能识别具体机构方向</b>。',
    '<b>PCR 不等于看空。</b>买入认沽与卖出认沽都会增加成交量，PCR 上升需结合持仓量、隐波与标的走势一起看，本页只给结构不给定向结论。',
    '<b>历史长度：</b>已回补 '+dates.length+' 个交易日（中金所 XML 按日可回补）；会员排名与 delta 分布为当日快照，逐日累积从入库起。'
  ]);
}
$$('#dv-prod button').forEach(b=>b.addEventListener('click',()=>{
  $$('#dv-prod button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.prod=b.dataset.p;draw();
}));
$$('#dv-opt button').forEach(b=>b.addEventListener('click',()=>{
  $$('#dv-opt button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.opt=b.dataset.o;kpi();dec();drawPcr();
}));
$$('#dv-range button').forEach(b=>b.addEventListener('click',()=>{
  $$('#dv-range button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.range=+b.dataset.r;drawBasis();drawAnn();drawPcr();drawOi();
}));
function draw(){
  const el=$('#dv-cover');if(el)el.textContent='CFFEX '+dates.length+' 个交易日 · '+dateFmt(dates[0]||'')+' ~ '+dateFmt(dates[dates.length-1]||'');
  kpi();dec();drawBasis();drawAnn();drawPcr();drawOi();drawRank();drawTab();
}
caveat();
MODS.derivatives={draw};
})();

/* ==== wb_leverage.js ==== */
/* ===== 11 杠杆与真实资金 ===== */
(function(){
const W={range:250};
const R=XL.rows||[];
const allD=R.map(r=>r[0]);
const view=()=>W.range>0&&R.length>W.range?R.slice(-W.range):R.slice();
const IV=1e8;                                    // 报表原始单位为元

function dec(){
  const a=R[R.length-1]||[], b=R[R.length-2]||[];
  const bal=xnum(a[5]), prev=xnum(b[5]), chg=(bal!=null&&prev!=null)?(bal-prev)/IV:null;
  const net=xnum(a[3]), buy=xnum(a[2]), pct=xnum(a[6]);
  const amt=M.a[M.n-1];
  const ratio=buy!=null&&amt?buy/1e8/amt*100:null;
  let level='杠杆水位：常态',tone=C.dim;
  if(chg!=null&&chg>150){level='融资余额明显回升';tone=C.up;}
  else if(chg!=null&&chg<-150){level='融资余额明显回落';tone=C.down;}
  const body=
    '截至 <b>'+dateFmt(a[0]||'')+'</b>（T+1 披露），两融余额 <b>'+xf(bal/1e12,4)+' 万亿元</b>，'+
    '较上一交易日 <b style="color:'+(chg>0?C.up:C.down)+'">'+xsgn(chg)+' 亿元</b>；'+
    '其中融资余额 '+xf(xnum(a[1])/IV,0)+' 亿、融券余额 '+xf(xnum(a[4])/IV,0)+' 亿。'+
    '当日融资买入额 '+xf(buy/IV,0)+' 亿，约占两市成交额 <b>'+xf(ratio,2)+'%</b>；'+
    '融资净买入 '+xsgn(net/IV)+' 亿，两融余额占流通市值 <b>'+xf(pct,3)+'%</b>。<br>'+
    '两融是<b>真实可核验的杠杆资金</b>，但属于同步指标：余额上升往往与指数上涨同时发生，'+
    '不能单独当作领先信号；且披露滞后一个交易日，不适合做盘中择时。<br>'+
    '<span style="color:#8892a0">ETF 部分只给基金定期报告披露的<b>季度</b>申购 / 赎回 / 期末份额，'+
    '交易所公布的日度申赎份额无免费公开源；第 07 栏的日度份额为量价反推估计，两者不可混用，'+
    '也不做任何「国家队」买方归因。</span>';
  XDEC('LV_DEC','今日结构判读 · 两融 '+dateFmt(a[0]||''),level,tone,body,
    ['<span class="tag real">两融真实</span>','<span class="tag proxy">T+1 披露</span>','<span class="tag na">无买方识别</span>']);
}
function kpi(){
  const a=R[R.length-1]||[], b=R[R.length-2]||[];
  const bal=xnum(a[5]), prev=xnum(b[5]);
  XKPI('LV_KPI',[
    ['两融余额',xf(bal/1e12,4)+' 万亿',dateFmt(a[0]||'')+' · T+1'],
    ['日变动',xsgn((bal-prev)/IV)+' 亿','较上一交易日',xcls((bal-prev)/IV)],
    ['融资买入额',xf0(xnum(a[2])/IV)+' 亿','当日'],
    ['融资净买入',xsgn(xnum(a[3])/IV)+' 亿','当日',xcls(xnum(a[3]))],
    ['融券余额',xf0(xnum(a[4])/IV)+' 亿','当日'],
    ['占流通市值',xf(xnum(a[6]),3)+'%','东财报表口径'],
    ['历史样本',xf0(R.length)+' 日',dateFmt(allD[0]||'')+' 起'],
    ['ETF 季度申赎',xf0(Object.values(XE.quarterly||{}).reduce((s,v)=>s+v.length,0))+' 期','真实季报']
  ]);
}
function drawBal(){
  const r=view(), d=r.map(z=>z[0]);
  XTS('lv-bal',d,[
    {name:'两融余额(万亿)',data:r.map(z=>xnum(z[5])/1e12),color:C.up,width:1.6},
    {name:'上证指数(右)',data:d.map(dt=>{const j=M.dateIdx[dt];return j==null?null:M.px[j];}),color:C.white,axis:'right'}
  ],{fmt:v=>Number(v).toFixed(3),fmt2:f0,pad:{l:56,r:62,t:18,b:24}});
}
function drawNet(){
  const r=view(), d=r.map(z=>z[0]);
  XTS('lv-net',d,[
    {name:'融资净买入(亿)',data:r.map(z=>xnum(z[3])==null?null:z[3]/IV),color:C.accent,type:'bar'},
    {name:'融资买入额(亿·右)',data:r.map(z=>xnum(z[2])==null?null:z[2]/IV),color:C.blue,axis:'right'}
  ],{zero:true,fmt:f0,fmt2:f0});
}
function drawRatio(){
  const r=view(), d=r.map(z=>z[0]);
  XTS('lv-ratio',d,[{name:'两融余额/流通市值',data:r.map(z=>z[6]),color:C.purple}],
      {fmt:v=>Number(v).toFixed(2)+'%'});
}
function drawEtf(){
  const q=XE.quarterly||{}, m={};
  Object.keys(q).forEach(c=>(q[c]||[]).forEach(z=>{
    const s=m[z[0]]||(m[z[0]]={buy:0,sell:0,n:0});
    s.buy+=xnum(z[1])||0;s.sell+=xnum(z[2])||0;s.n++;
  }));
  const ds=Object.keys(m).sort().slice(-8);
  XBAR('lv-etf',ds.map(dt=>({label:dateFmt(dt),value:m[dt].buy-m[dt].sell,
        color:(m[dt].buy-m[dt].sell)>=0?C.up:C.down,right:m[dt].n+' 只'})),
    {centered:true,fmt:f0,unit:' 亿份',pad:{l:88,r:66,t:14,b:22},empty:'季度申赎未取到'});
}
function drawTab(){
  const r=R.slice(-30).reverse();
  XTAB('lv-tab',r.map((z,i)=>{
    const prev=R[R.length-2-i];
    const d=prev&&xnum(z[5])!=null&&xnum(prev[5])!=null?(z[5]-prev[5])/IV:null;
    return '<tr><td class="l">'+dateFmt(z[0])+'</td><td>'+xf0(xnum(z[1])/IV)+'</td>'+
      '<td class="'+xcls(d)+'">'+xsgn(d)+'</td><td>'+xf0(xnum(z[2])/IV)+'</td>'+
      '<td class="'+xcls(xnum(z[3]))+'">'+xsgn(xnum(z[3])/IV)+'</td>'+
      '<td>'+xf0(xnum(z[4])/IV)+'</td><td>'+xf0(xnum(z[5])/IV)+'</td>'+
      '<td>'+xf(xnum(z[6]),3)+'%</td></tr>';
  }));
}
function caveat(){
  XCAV('LV_CAVEAT','口径与边界',[
    '<b>T+1 披露。</b>两融数据由交易所次日汇总公布，最新一行通常比 A 股行情晚一个交易日；本页不把 T+1 数据回填到 T 日去做择时判断。',
    '<b>单位与口径。</b>报表原始字段单位为元，页面统一折算为亿元 / 万亿元；「占流通市值」直接取东财报表 RZYEZB 字段，分母为报表同期的 A 股流通市值，跨制度变化期不宜直接比较。',
    '<b>真实资金 ≠ 主动净买入。</b>两融余额是存量杠杆，融资买入额是流量，两者都不等于「主动买盘」；第 08 栏的净流入仍是量价代理，不要与本栏混为一谈。',
    '<b>ETF 季度申赎是唯一可核验的份额口径。</b>基金定期报告按季披露期间申购 / 赎回 / 期末份额；交易所公布的日度申赎份额没有免费公开源。第 07 栏的日度曲线是 f116 总市值 ÷ 收盘价反推的<b>估计</b>，含折溢价误差，只从入库首日起累积。',
    '<b>不做机构归因。</b>无论两融、ETF 成交额还是季度申赎，都<b>不能识别买方身份</b>；「国家队」相关持仓只在基金季报 / 年报按季度披露，本工作台已撤销该归因。',
    '<b>北向资金说明。</b>自 2024-08-19 起北向资金日度净买入不再披露，因此本工作台不构建日频北向净流入因子。'
  ]);
}
$$('#lv-range button').forEach(b=>b.addEventListener('click',()=>{
  $$('#lv-range button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.range=+b.dataset.r;drawBal();drawNet();drawRatio();
}));
function draw(){
  const el=$('#lv-cover');if(el)el.textContent='两融 '+R.length+' 日 · '+dateFmt(allD[0]||'')+' ~ '+dateFmt(allD[allD.length-1]||'');
  kpi();dec();drawBal();drawNet();drawRatio();drawEtf();drawTab();
}
caveat();
MODS.leverage={draw};
})();

/* ==== wb_sentiment.js ==== */
/* ===== 12 短线情绪与连板 ===== */
(function(){
const F=XS.fields||[], R=XS.rows||[], SNAP=XS.snapshot||{};
/* 同花顺按 date 回补的历史：涨停家数 / 最高连板 / 连板家数 / 晋级率 */
const HR=HS.rows||[];
const i=k=>F.indexOf(k);
const last=R[R.length-1]||[];

function dec(){
  const zt=xnum(last[i('zt')]),dt=xnum(last[i('dt')]),zb=xnum(last[i('zb')]);
  const lb=xnum(last[i('maxLb')]),lb2=xnum(last[i('lb2')]),zbr=xnum(last[i('zbRate')]);
  const promo=xnum(last[i('promotion')]);
  let level='情绪：中性偏弱',tone=C.dim;
  if(dt!=null&&zt!=null&&dt>=zt){level='跌停不少于涨停 · 情绪偏冰';tone=C.down;}
  else if(zbr!=null&&zbr>=40){level='封板不稳 · 炸板率偏高';tone=C.accent;}
  else if(zt!=null&&zt>=60&&zbr!=null&&zbr<25){level='涨停扩散 · 封板较稳';tone=C.up;}
  const body=
    '<b>'+dateFmt(last[0]||'')+'</b> 涨停 <b style="color:'+C.up+'">'+xf0(zt)+'</b> 家、跌停 <b style="color:'+C.down+'">'+
    xf0(dt)+'</b> 家、炸板 <b>'+xf0(zb)+'</b> 家；最高连板 <b>'+xf0(lb)+'</b> 板，连板（≥2 板）'+
    xf0(lb2)+' 家，炸板率 <b>'+xf(zbr,2)+'%</b>。晋级率 <b>'+(promo==null?'样本不足':xf(promo,2)+'%')+'</b>。<br>'+
    '与第 03 栏「双冰点」是两层不同口径：双冰点看<b>收盘后全市场广度极值</b>（连续两日 4000 家以上下跌），'+
    '本栏看<b>日内封板与接力结构</b>。广度极冷但仍有高标、或涨停不少但炸板率高，含义完全不同，'+
    '应交叉看而不是互相替代。<br>'+
    '<span style="color:#8892a0">晋级率＝今日连板家数 / 昨日涨停家数。涨停 / 连板 / 晋级率已用同花顺历史接口按日回补 <b>'+
    HR.length+'</b> 个交易日（下方两张图）；炸板率、跌停家数因东财 date 参数失效、同花顺无对应历史池、'+
    '逐股缓存无最高价，<b>确实无法回补</b>，仍只有当日快照，不插值、不伪造。</span>';
  XDEC('ST_DEC','今日结构判读 · 短线情绪',level,tone,body,
    ['<span class="tag real">涨跌停池真实</span>','<span class="tag proxy">晋级率需累积</span>','<span class="tag na">非投资建议</span>']);
}
function kpi(){
  XKPI('ST_KPI',[
    ['涨停家数',xf0(last[i('zt')]),'涨停池 tc'],
    ['跌停家数',xf0(last[i('dt')]),'跌停池 tc'],
    ['炸板家数',xf0(last[i('zb')]),'炸板池 tc'],
    ['最高连板',xf0(last[i('maxLb')])+' 板','当日 lbc 最大值','amber'],
    ['连板家数',xf0(last[i('lb2')])+' 家','lbc ≥ 2'],
    ['炸板率',xf(last[i('zbRate')],2)+'%','炸板 /(涨停+炸板)'],
    ['晋级率',xnum(last[i('promotion')])==null?'样本不足':xf(last[i('promotion')],2)+'%','连板 / 昨日涨停'],
    ['历史回补',xf0(HR.length)+' 日','同花顺 · 涨停/连板/晋级率']
  ]);
}
function drawCount(){
  const d=R.map(z=>z[0]);
  XTS('st-count',d,[
    {name:'涨停',data:R.map(z=>z[i('zt')]),color:C.up,type:'bar'},
    {name:'跌停',data:R.map(z=>z[i('dt')]),color:C.down,type:'bar'},
    {name:'炸板',data:R.map(z=>z[i('zb')]),color:C.accent,type:'bar'}
  ],{zero:true,fmt:f0,empty:'历史序列自入库首日起累积，当前只有 '+R.length+' 日'});
  const el=$('#st-bars');if(el)el.textContent=R.length+' 个交易日';
}
function drawRate(){
  const d=R.map(z=>z[0]);
  XTS('st-rate',d,[
    {name:'炸板率',data:R.map(z=>z[i('zbRate')]),color:C.accent,dot:true},
    {name:'晋级率',data:R.map(z=>z[i('promotion')]),color:C.blue,dot:true}
  ],{zero:true,fmt:v=>Number(v).toFixed(1)+'%',empty:'晋级率需至少 2 个交易日'});
}
function drawLadder(){
  const top=SNAP.top||[];
  // 连板梯队用当日涨停池全量更准，快照只留了 top12；按 lbc 分桶展示可见部分
  const m={};
  top.forEach(t=>{const k=(xnum(t.lbc)||1)+' 板';m[k]=(m[k]||0)+1;});
  const ks=Object.keys(m).sort((a,b)=>parseInt(b)-parseInt(a));
  XBAR('st-ladder',ks.map(k=>({label:k,value:m[k],color:C.accent})),
    {fmt:f0,unit:' 家',pad:{l:70,r:60,t:14,b:22},empty:'当日涨停池未取到'});
}
function drawTab(){
  const top=SNAP.top||[];
  $('#st-tabsub')&&($('#st-tabsub').textContent='当日 '+xf0(SNAP.zt)+' 家涨停 · 显示连板前 '+top.length);
  XTAB('st-tab',top.map(t=>'<tr><td class="l mono">'+esc(t.code||'')+'</td>'+
    '<td class="l">'+esc(t.name||'')+'</td><td class="amber">'+xf0(t.lbc)+'</td>'+
    '<td>'+xf0(t.zbc)+'</td><td>'+xf0(xnum(t.fund)==null?null:t.fund/1e4)+'</td>'+
    '<td class="l">'+esc(t.hybk||'')+'</td></tr>'));
}
/* ===== 历史回补图（同花顺口径） ===== */
function drawHistBack(){
  const d=HR.map(z=>z[0]);
  const el=$('#st-histsub');
  if(el)el.textContent=HR.length?HR.length+' 个交易日 · '+dateFmt(HR[0][0])+' ~ '+dateFmt(HR[HR.length-1][0]):'未取到';
  XTS('st-hist',d,[
    {name:'涨停家数',data:HR.map(z=>z[1]),color:C.up,type:'bar'},
    {name:'连板家数(≥2板)',data:HR.map(z=>z[3]),color:C.blue,dot:true}
  ],{zero:true,fmt:f0,empty:'同花顺历史回补未取到',
     note:'同花顺 limit_up_pool + continuous_limit_up 按 date 逐日回补 · 与上方东财当日快照为两套口径'});
}
function drawPromoBack(){
  const d=HR.map(z=>z[0]);
  const pv=HR.map(z=>z[4]).filter(v=>v!=null&&isFinite(v));
  const el=$('#st-promosub');
  if(el)el.textContent=pv.length?'晋级率均值 '+(pv.reduce((a,b)=>a+b,0)/pv.length).toFixed(1)+'% · '+pv.length+' 日':'未取到';
  XTS('st-promo',d,[
    {name:'最高连板(板)',data:HR.map(z=>z[2]),color:C.accent,dot:true},
    {name:'晋级率(%)',data:HR.map(z=>z[4]),color:C.blue,dot:true}
  ],{zero:true,fmt:v=>Number(v).toFixed(1),empty:'同花顺历史回补未取到',
     note:'左轴为同一数值刻度：连板高度约 3~8 板、晋级率约 7~48%，两线只用于看周期位置'});
}
function caveat(){
  XCAV('ST_CAVEAT','口径与边界',[
    '<b>历史分两部分，口径不同不混算。</b>涨停家数、最高连板、连板家数、晋级率已用<b>同花顺</b>涨停池 / 连板池按 <span class="mono">date</span> 逐日回补 '+HR.length+' 个交易日（实测最早可到 2025-11）；当日 KPI 与连板梯队仍用<b>东财</b>涨跌停池快照。两家对「连板」定义略有差异，家数接近但不混算，图上分别标注。',
    '<b>炸板率与跌停家数确实无法回补。</b>东财涨停 / 跌停 / 炸板三池的 <span class="mono">date</span> 参数实测失效（请求 20261112 仍返回 qdate=20261113）；同花顺只有涨停池与连板池的历史接口，无炸板 / 跌停历史池；逐股缓存 flow_state.json 只保留收盘价与成交量，<b>没有最高价</b>，无法自行判定「盘中触板但收盘未封」。这两项因此只有当日快照，历史段留空，绝不伪造。',
    '<b>晋级率需要连续两日快照。</b>定义＝今日连板（lbc≥2）家数 / 昨日涨停家数，样本不足时留空，不插值、不用其它口径替代。',
    '<b>炸板率口径。</b>炸板数 /(涨停数＋炸板数)，涨停数与炸板数来自两个不同池子，同一只股票盘中反复开板可能被重复计数，属于交易所口径的近似。',
    '<b>连板梯队只显示可见样本。</b>快照保留了连板前 12 只，梯队分布图基于该子集，不等于全市场全部涨停股的精确分桶；家数类 KPI 才用池子返回的 tc 全量。',
    '<b>不是 Level-2。</b>封单金额 fund 是涨停池字段，不含委托队列、逐笔主动买卖方向、撤单与竞价数据；本栏无法回答「谁在封板」。',
    '<b>情绪指标不是买卖信号。</b>涨停 / 跌停 / 炸板与第 03 栏双冰点一样，未在本工作台做过样本外因果检验；短线结论只作为观察与条件，不作为策略有效性证据。'
  ]);
}
function draw(){kpi();dec();drawCount();drawRate();drawHistBack();drawPromoBack();drawLadder();drawTab();}
caveat();
MODS.sentiment={draw};
})();

/* ==== wb_vix.js ==== */
/* ===== 06 波动率与恐慌指数（EdsonVIX）=====
   数据：V = JSON#VIX（fetch_vix.py 产出，中金所结算价真实，方差互换法自编）。 */
(function(){
const V = JSON.parse((document.getElementById('VIX')||{textContent:'{}'}).textContent);
const rows = V.rows || [];
const snap = V.snapshot || {};
const causal = V.causal || {};
const META = V.meta || {};
const UNDER_NAME = {IO:'沪深300', HO:'上证50', MO:'中证1000'};
let RANGE = 0; // 0=全部

function dates(){ return rows.map(r=>r.date); }
function inRange(arr){
  if(!RANGE || arr.length<=RANGE) return arr;
  return arr.slice(-RANGE);
}
function ioVix(){ return rows.map(r=>((r.IO)||{}).vix); }
function hv(){ return rows.map(r=>r.hv30); }
function dec(){
  const last = rows[rows.length-1] || {};
  const io = last.IO || {};
  const v = io.vix, pct = snap.percentile, hv30 = last.hv30;
  const prem = (v!=null && hv30!=null) ? v-hv30 : null;
  let level='波动率：中性', tone=C.dim;
  if(pct!=null){
    if(pct>=90){level='恐慌：高温（≥90 分位）';tone=C.down;}
    else if(pct>=75){level='波动：偏高（75-90 分位）';tone=C.accent;}
    else if(pct<=25){level='波动：低温（≤25 分位，自满风险）';tone=C.blue;}
  }
  const c5=(causal.fwd||{})['5'], c20=(causal.fwd||{})['20'];
  const body =
    '<b>EdsonVIX（'+(io.near||'')+'+'+(io.second||'')+' 双月 30 日口径）</b>＝ <b style="color:'+tone+'">'+xf(v,2)+'</b>'+
    '，全样本分位 <b>'+xf(pct,1)+'%</b>；30 日已实现波动率 HV30 ＝ '+xf(hv30,2)+
    '，恐慌溢价（VIX−HV30）<b style="color:'+((prem||0)>0?C.down:C.up)+'">'+((prem||0)>0?'+':'')+xf(prem,2)+'</b>。'+
    'Skew（90%K Put IV − 110%K Call IV）＝ <b>'+xf(io.skew,2)+'</b>'+(io.skew!=null&&io.skew>3?'（尾部保护偏贵）':'')+'。'+
    '对照：<b>HO</b> '+xf((last.HO||{}).vix,2)+' / <b>MO</b> '+xf((last.MO||{}).vix,2)+
    '（'+UNDER_NAME.HO+'低、'+UNDER_NAME.MO+'高为常态结构）。<br>'+
    '<span style="color:#8892a0">因果检验（expanding 90 分位、首次进入去重）：</span>'+
    (c5&&c20
      ? '历史触发 '+xf0(causal.entries||0)+' 次，其后 5 日胜率 '+xf(c5.winRate,1)+'%（基准 '+xf(c5.baseline,1)+'%，p='+c5.p+'）、20 日 '+xf(c20.winRate,1)+'%（p='+c20.p+'）'+
        (c20.sig?'<b style="color:'+C.accent+'">20 日显著</b>':'<b>均不显著</b>——恐慌见底反弹在本样本不构成可靠规律')
      : '样本不足或序列过短');
  XDEC('VX_DEC','恐慌指数判读 · '+dateFmt(last.date||''),level,tone,body,
    ['<span class="tag real">中金所结算价真实</span>','<span class="tag proxy">自编指数 · 方法同 CBOE</span>','<span class="tag na">非官方 iVIX 复刻</span>']);
}
function kpi(){
  const last=rows[rows.length-1]||{}, io=last.IO||{};
  const prev=rows[rows.length-2]||{}, iop=prev.IO||{};
  const chg=(io.vix!=null&&iop.vix!=null)?io.vix-iop.vix:null;
  const prem=(io.vix!=null&&last.hv30!=null)?io.vix-last.hv30:null;
  XKPI('VX_KPI',[
    ['EdsonVIX',xf(io.vix,2),'沪深300·30日隐含',chg!=null?xcls(chg):''],
    ['较前日',((chg||0)>0?'+':'')+xf(chg,2),'',''],
    ['全样本分位',xf(snap.percentile,1)+'%','样本 '+xf0(snap.seriesDays)+' 日',snap.percentile>=90?'down':(snap.percentile<=25?'blue':'amber')],
    ['恐慌溢价 VIX−HV30',((prem||0)>0?'+':'')+xf(prem,2),'隐含 − 已实现',(prem||0)>5?'down':''],
    ['Skew',xf(io.skew,2),'90%K Put − 110%K Call',(io.skew||0)>4?'amber':''],
    ['HO 上证50',xf((last.HO||{}).vix,2),'对照'],
    ['MO 中证1000',xf((last.MO||{}).vix,2),'对照'],
    ['区间统计',xf(snap.min,1)+' ~ '+xf(snap.max,1),'中位 '+xf(snap.median,1)]
  ]);
}
function drawMain(){
  const d=inRange(dates()), v=inRange(ioVix()), h=inRange(hv());
  XTS('vx-main',d,[
    {name:'EdsonVIX',data:v,color:C.accent},
    {name:'HV30 已实现(对照)',data:h,color:C.blue,dash:[4,4]}
  ],{fmt:f2,fmt2:f2,pad:{l:48,r:64,t:18,b:24}});
}
function drawPct(){
  // 分位通道：滚动全样本分位
  const vs=ioVix();
  const pct=vs.map((v,i)=>{
    if(v==null) return null;
    const hist=vs.slice(0,i+1).filter(x=>x!=null);
    return 100*hist.filter(x=>x<=v).length/hist.length;
  });
  XTS('vx-pct',inRange(dates()),[
    {name:'VIX 分位',data:inRange(pct),color:C.purple},
    {name:'90 分位',data:inRange(pct).map(()=>90),color:C.down,dash:[4,4]},
    {name:'25 分位',data:inRange(pct).map(()=>25),color:C.blue,dash:[4,4]}
  ],{fmt:f1,fmt2:f1,pad:{l:48,r:24,t:18,b:24}});
}
function drawCompare(){
  const d=inRange(dates());
  XTS('vx-cmp',d,[
    {name:'IO 沪深300',data:inRange(rows.map(r=>((r.IO)||{}).vix)),color:C.accent},
    {name:'HO 上证50',data:inRange(rows.map(r=>((r.HO)||{}).vix)),color:C.blue},
    {name:'MO 中证1000',data:inRange(rows.map(r=>((r.MO)||{}).vix)),color:C.up}
  ],{fmt:f2,fmt2:f2,pad:{l:48,r:24,t:18,b:24}});
}
function drawSkew(){
  XTS('vx-skew',inRange(dates()),[
    {name:'Skew（Put−Call IV）',data:inRange(rows.map(r=>((r.IO)||{}).skew)),color:C.purple,type:'bar'}
  ],{zero:true,fmt:f2,fmt2:f2,pad:{l:48,r:24,t:18,b:24}});
}
function table(){
  const tb=document.querySelector('#vx-tab tbody'); if(!tb) return;
  const tail=rows.slice(-22).reverse();
  tb.innerHTML=tail.map(r=>{
    const io=r.IO||{};
    return '<tr><td class="l">'+esc(r.date)+'</td>'+
      '<td>'+xf(io.vix,2)+'</td><td>'+xf(r.hv30,2)+'</td>'+
      '<td>'+((io.vix!=null&&r.hv30!=null)?xf(io.vix-r.hv30,2):'—')+'</td>'+
      '<td>'+xf(io.skew,2)+'</td><td>'+xf((r.HO||{}).vix,2)+'</td><td>'+xf((r.MO||{}).vix,2)+'</td></tr>';
  }).join('');
}
function cover(){
  const el=document.getElementById('vx-cover'); if(!el) return;
  el.textContent='样本 '+rows.length+' 日（'+(rows[0]||{}).date+' ~ '+(rows[rows.length-1]||{}).date+
    '）· 近月+'+'次月 → 30 日插值 · r=1.8% 固定';
}
function caveat(){
  const el=document.getElementById('VX_CAVEAT'); if(!el) return;
  const disc=(META.disclosure||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
  el.innerHTML='<b>口径与边界。</b><ul>'+disc+
    '<li>与第 10 栏「衍生品」的关系：本栏用同一份中金所 XML 的<b>合约级结算价</b>自算隐含方差，是真实 IV 的合规推导；第 10 栏的「IV 未接入」指其页面未展示 IV 曲面，两者不矛盾。</li>'+
    '<li>VIX 飙升只说明期权市场为未来波动定价变贵，方向（涨跌）不含在其中；A 股涨跌停制度会吸收极端波动，与美股 VIX 的联动逻辑不同。</li>'+
    '<li>因果检验结论以本栏数据为准：'+((causal.fwd||{})['20']?('20 日胜率 '+causal.fwd['20'].winRate+'%（p='+causal.fwd['20'].p+'，'+(causal.fwd['20'].sig?'显著':'不显著')+'）'):'样本不足')+'。</li>'+
    '<li>本栏全部内容为统计描述，不构成投资建议。</li></ul>';
}
function draw(){
  if(!rows.length){const el=document.getElementById('vx-cover');if(el)el.textContent='无数据';return;}
  dec();kpi();drawMain();drawPct();drawCompare();drawSkew();table();cover();caveat();
}
document.querySelectorAll('#vx-range button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#vx-range button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    RANGE=+b.dataset.r||0;
    drawMain();drawPct();drawCompare();drawSkew();
  });
});
draw();
MODS.vix={draw};
})();

/* ==== wb_valuation.js ==== */
/* ===== 13 行业估值与预期修正 ===== */
(function(){
const W={sort:'pe'};
const IND=(XV.industry||[]).filter(x=>xnum(x.pe)!=null&&x.pe>0);
/* 趋势图用已回补的 250 日行业估值报表序列；横截面 KPI / 分布图仍用当日 219 个板块 f9。
   两套口径不同，绝对值不可直接比较，页面各处已显式标注。 */
const STAT=XV.stat||{}, DAILY=(HV.daily&&HV.daily.length?HV.daily:XV.daily)||[], FC=XV.forecast||{};
const sorted=[...IND].sort((a,b)=>a.pe-b.pe);
const rank=Object.fromEntries(sorted.map((x,i)=>[x.code,sorted.length>1?i/(sorted.length-1)*100:50]));

function dec(){
  const med=xnum(STAT.median),p25=xnum(STAT.p25),p75=xnum(STAT.p75);
  const up=xnum(FC.up),dn=xnum(FC.down),tot=xnum(FC.total);
  const upPct=(up!=null&&tot)?up/tot*100:null;
  let level='估值结构：中性',tone=C.dim;
  if(upPct!=null&&upPct>=70){level='预告预增占优';tone=C.up;}
  else if(upPct!=null&&upPct<55){level='预增占比偏低';tone=C.down;}
  const body=
    '当日取得 <b>'+xf0(IND.length)+'</b> 个有效行业板块 PE-TTM（已剔除 PE≤0 与缺失）。'+
    '横截面中位数 <b>'+xf(med,2)+' 倍</b>，P25 '+xf(p25,2)+'、P75 '+xf(p75,2)+'，'+
    '最低 '+xf(STAT.min,2)+'、最高 '+xf(STAT.max,2)+'（极端值多为微利 / 亏损修复行业，图上已截断显示）。<br>'+
    '业绩预告最近 '+xf0(tot)+' 条中，预增 <b style="color:'+C.up+'">'+xf0(up)+'</b> 条、预减 <b style="color:'+C.down+'">'+
    xf0(dn)+'</b> 条，预增占比 <b>'+xf(upPct,1)+'%</b>。这是<b>公告口径</b>的盈利预期方向代理，'+
    '不是分析师一致预期修正，也不代表已实现盈利。<br>'+
    '与第 12 栏 ERP 的分工：ERP 回答「股 vs 债」的总量性价比，本栏回答「同一时点上哪些行业更贵 / 更便宜」以及'+
    '盈利预期在往哪个方向修。两者都是<b>结构描述而非择时信号</b>。<br>'+
    '<span style="color:#8892a0">本栏中位数 / 四分位已按日回补 <b>'+DAILY.length+'</b> 个交易日'+
    '（东财行业估值报表，127 个行业，2017 年起可回溯）；注意该序列与上方 KPI 的 219 个二级行业板块口径不同，'+
    '<b>绝对值不可直接比较，只看趋势</b>。</span>';
  XDEC('VA_DEC','今日结构判读 · 行业估值',level,tone,body,
    ['<span class="tag real">行业 PE 真实</span>','<span class="tag proxy">预期修正为代理</span>','<span class="tag na">横截面口径</span>']);
}
function kpi(){
  XKPI('VA_KPI',[
    ['有效行业数',xf0(IND.length)+' 个','PE>0'],
    ['PE 中位数',xf(STAT.median,2)+' 倍','当日横截面'],
    ['P25 / P75',xf(STAT.p25,2)+' / '+xf(STAT.p75,2),'四分位'],
    ['最低 / 最高',xf(STAT.min,2)+' / '+xf(STAT.max,2),'含极端值'],
    ['业绩预增',xf0(FC.up)+' 条','最近 '+xf0(FC.total)+' 条','up'],
    ['业绩预减',xf0(FC.down)+' 条','下限/上限口径','down'],
    ['预增占比',xf((FC.up||0)/(FC.total||1)*100,1)+'%','公告口径'],
    ['趋势历史',xf0(DAILY.length)+' 日','已回补 · 报表口径']
  ]);
}
function drawDist(){
  const max=xnum(STAT.p75)?STAT.p75*3:120;
  const bins=[0,10,15,20,25,30,40,50,70,100,max,Infinity];
  const labels=['<10','10-15','15-20','20-25','25-30','30-40','40-50','50-70','70-100','100-'+Math.round(max),'>'+Math.round(max)];
  const cnt=new Array(labels.length).fill(0);
  IND.forEach(x=>{
    for(let k=0;k<bins.length-1;k++) if(x.pe>=bins[k]&&x.pe<bins[k+1]){cnt[k]++;break;}
  });
  XBAR('va-dist',labels.map((l,k)=>({label:l+' 倍',value:cnt[k],color:C.blue})),
    {fmt:f0,unit:' 个',pad:{l:96,r:56,t:14,b:22}});
  const el=$('#va-distsub');if(el)el.textContent=IND.length+' 个行业 · 中位数 '+xf(STAT.median,2)+' 倍';
}
function drawRank(){
  const cap=xnum(STAT.p75)?STAT.p75*3:150;
  const lo=sorted.slice(0,12), hi=sorted.slice(-12).reverse();
  const rows=lo.concat([{name:'—— 高 PE ——',pe:null}]).concat(hi).map(x=>({
    label:(x.name||'').slice(0,9),
    value:x.pe==null?null:Math.min(x.pe,cap),
    color:x.pe==null?C.dim2:(x.pe<=(STAT.median||30)?C.up:C.down),
    right:x.pe==null?'':(x.pe>cap?'>'+Math.round(cap):'')
  }));
  XBAR('va-rank',rows,{fmt:f0,unit:' 倍',pad:{l:110,r:66,t:14,b:22}});
}
function drawTrend(){
  const d=DAILY.map(z=>z[0]);
  XTS('va-trend',d,[
    {name:'中位数',data:DAILY.map(z=>z[1]),color:C.white,dot:true},
    {name:'P25',data:DAILY.map(z=>z[2]),color:C.down},
    {name:'P75',data:DAILY.map(z=>z[3]),color:C.up}
  ],{fmt:f0,empty:'行业估值报表历史未取到',
     note:'东财行业估值报表口径（127 行业）· 已回补 '+DAILY.length+' 日 · 与左侧 KPI 板块口径不同，只看趋势'});
}
function drawFc(){
  const up=xnum(FC.up)||0,dn=xnum(FC.down)||0,tot=xnum(FC.total)||0;
  XBAR('va-fc',[
    {label:'预增(下限>0)',value:up,color:C.up},
    {label:'预减(上限<0)',value:dn,color:C.down},
    {label:'其他 / 不确定',value:Math.max(0,tot-up-dn),color:C.blue}
  ],{fmt:f0,unit:' 条',pad:{l:124,r:56,t:14,b:22}});
  const el=$('#va-fcsub');if(el)el.textContent='最近 '+xf0(tot)+' 条公告';
}
function drawTab(){
  let rows=[...IND];
  if(W.sort==='chg')rows.sort((a,b)=>(xnum(b.chg)||0)-(xnum(a.chg)||0));
  else if(W.sort==='amt')rows.sort((a,b)=>(xnum(b.amt)||0)-(xnum(a.amt)||0));
  else rows.sort((a,b)=>a.pe-b.pe);
  $('#va-tabsub')&&($('#va-tabsub').textContent=rows.length+' 个行业');
  XTAB('va-tab',rows.map(x=>'<tr><td class="l">'+esc(x.name)+' <span class="mono" style="color:#5b6470">'+esc(x.code)+'</span></td>'+
    '<td>'+xf(x.pe,2)+'</td><td class="'+xcls(x.chg)+'">'+xsgn(x.chg)+'</td>'+
    '<td>'+xf(xnum(x.amt)==null?null:x.amt/1e8,2)+'</td>'+
    '<td>'+xf(rank[x.code],1)+'%</td></tr>'));
}
function caveat(){
  XCAV('VA_CAVEAT','口径与边界',[
    '<b>两套口径已分开，不要横向比绝对值。</b>左侧 KPI / 分布图 / 表格用的是当日 <b>219 个东财二级行业板块 f9</b> 横截面；趋势图用的是 <b>东财 RPT_VALUEINDUSTRY_DET 行业估值报表（127 个行业 PE-TTM）</b> 按日回补的 '+DAILY.length+' 日序列（该报表最早可回溯 2017-01-03）。行业分类与样本数不同，中位数自然不同，趋势图只用于看方向，不与 KPI 数字直接比较。表格里的「横截面分位」仍是当日板块口径的名次百分位。',
    '<b>PE 极端值已截断显示。</b>微利 / 亏损修复行业的 PE 可达数千倍，图上以 P75×3 为上限截断并标「&gt;N」，避免把常态区压成一条线；统计值（中位数 / 四分位）仍用原始数字。',
    '<b>预期修正是业绩预告代理。</b>东财 RPT_PUBLIC_OP_NEWPREDICT 的预告净利润变动幅度上下限：下限&gt;0 记为预增、上限&lt;0 记为预减。这是上市公司公告口径，<b>不是分析师一致预期修正</b>，也不代表最终实现值；最近 200 条为按公告日倒序的截断样本。',
    '<b>历史已回补，来源另有一套。</b>趋势序列来自东财数据中心报表 RPT_VALUEINDUSTRY_DET，按交易日返回 127~128 个行业的 PE-TTM / PB / PS，一次回补 250 个交易日；当日板块 f9 仍单独抓取（与成交额 f6 / 涨跌幅 f3 分两次请求，合并请求在本机代理下会被断连），两套都属东财口径，与申万 / 中信不完全一致。',
    '<b>估值不是择时。</b>高 PE 不等于贵、低 PE 不等于便宜，需结合盈利周期、成长性与资本开支；本栏只提供结构描述，不做买卖建议。'
  ]);
}
$$('#va-sort button').forEach(b=>b.addEventListener('click',()=>{
  $$('#va-sort button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.sort=b.dataset.s;drawTab();
}));
function draw(){kpi();dec();drawDist();drawRank();drawTrend();drawFc();drawTab();}
caveat();
MODS.valuation={draw};
})();

/* ==== wb_events.js ==== */
/* ===== 14 筹码供给与事件 ===== */
(function(){
const U=(XEV.unlock||[]).filter(x=>x.date), B=(XEV.billboard||[]).filter(x=>x.date);
const uBy={};
U.forEach(x=>{uBy[x.date]=(uBy[x.date]||0)+(xnum(x.cap)||0);});
const uDates=Object.keys(uBy).sort().slice(0,18);

function dec(){
  const cap=U.reduce((s,x)=>s+(xnum(x.cap)||0),0);
  const near=U.filter(x=>x.date<='20261213').length;
  const bAmt=B.reduce((s,x)=>s+(xnum(x.amt)||0),0)/1e4;
  const top=B.slice().sort((a,b)=>(xnum(b.amt)||0)-(xnum(a.amt)||0))[0]||{};
  const maxU=U.slice().sort((a,b)=>(xnum(b.cap)||0)-(xnum(a.cap)||0))[0]||{};
  let level='供给压力：可观测',tone=C.dim;
  if(cap>5e6){level='未来解禁规模偏大';tone=C.accent;}
  const body=
    '当前取到未来 <b>'+xf0(U.length)+'</b> 笔限售解禁记录，合计解禁市值约 <b>'+xf0(cap/1e4)+' 亿元</b>'+
    '（原始单位万元），其中近一个月内 '+xf0(near)+' 笔；单笔最大为 <b>'+esc(maxU.name||'—')+'</b> '+
    xf0((xnum(maxU.cap)||0)/1e4)+' 亿元（'+dateFmt(maxU.date||'')+'）。'+
    '当日龙虎榜 <b>'+xf0(B.length)+'</b> 条，上榜成交合计约 '+xf0(bAmt)+' 亿元，'+
    '金额最高为 '+esc(top.name||'—')+'。<br>'+
    '解禁是<b>可流通股本增加</b>，不等于实际减持；实际冲击取决于股东意愿、锁定期安排、减持新规与二级市场承接能力。'+
    '龙虎榜只说明个股达到交易所异动阈值，公开的是席位成交金额，<b>不能识别买方身份或资金性质</b>。<br>'+
    '<span style="color:#8892a0">本栏三类事件均为公开披露的真实数据，但都属于「条件」而非「因果」：'+
    '事件日前后收益分布在本工作台未做样本外因果检验，不据此给方向判断。</span>';
  XDEC('EV_DEC','今日结构判读 · 筹码供给',level,tone,body,
    ['<span class="tag real">解禁 / 龙虎榜真实</span>','<span class="tag na">无 Level-2</span>','<span class="tag proxy">事件≠因果</span>']);
}
function kpi(){
  const cap=U.reduce((s,x)=>s+(xnum(x.cap)||0),0);
  XKPI('EV_KPI',[
    ['未来解禁笔数',xf0(U.length)+' 笔','东财 RPT_LIFT_STAGE'],
    ['解禁市值合计',xf0(cap/1e4)+' 亿','万元折算'],
    ['最大单笔',xf0((U.slice().sort((a,b)=>(xnum(b.cap)||0)-(xnum(a.cap)||0))[0]||{}).cap/1e4||0)+' 亿','按市值'],
    ['覆盖日期',xf0(uDates.length)+' 天','图上前 18 天'],
    ['龙虎榜条数',xf0(B.length)+' 条','最近交易日'],
    ['龙虎榜成交额',xf0(B.reduce((s,x)=>s+(xnum(x.amt)||0),0)/1e8)+' 亿','原始单位元'],
    ['上榜最大涨幅',xf(B.reduce((m,x)=>Math.max(m,xnum(x.chg)||-1e9),-1e9),2)+'%','当日'],
    ['事件口径','公开披露','无 Level-2']
  ]);
}
function drawUnlock(){
  XTS('ev-unlock',uDates,[{name:'解禁市值(万元)',data:uDates.map(d=>uBy[d]),color:C.accent,type:'bar'}],
    {zero:true,fmt:f0,empty:'解禁记录未取到'});
}
function drawBoard(){
  const rows=B.slice().sort((a,b)=>(xnum(b.amt)||0)-(xnum(a.amt)||0)).slice(0,14);
  XBAR('ev-board',rows.map(x=>({label:(x.name||x.code||'').slice(0,9),value:(xnum(x.amt)||0)/1e4,
       color:(xnum(x.chg)||0)>=0?C.up:C.down})),
    {fmt:f0,unit:' 万',pad:{l:110,r:62,t:14,b:22},empty:'龙虎榜未取到'});
}
function drawTab(){
  $('#ev-unlocksub')&&($('#ev-unlocksub').textContent=U.length+' 笔');
  XTAB('ev-utab',U.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,60).map(x=>
    '<tr><td class="l">'+dateFmt(x.date)+'</td><td class="l mono">'+esc(x.code||'')+'</td>'+
    '<td class="l">'+esc(x.name||'')+'</td><td>'+xf0(x.cap)+'</td>'+
    '<td>'+xf((xnum(x.ratio)||0)*100,2)+'%</td><td class="l">'+esc((x.kind||'').slice(0,12))+'</td></tr>'));
  $('#ev-boardsub')&&($('#ev-boardsub').textContent=B.length+' 条');
  XTAB('ev-btab',B.slice(0,60).map(x=>
    '<tr><td class="l mono">'+esc(x.code||'')+'</td><td class="l">'+esc(x.name||'')+'</td>'+
    '<td class="'+xcls(x.chg)+'">'+xsgn(x.chg)+'</td><td>'+xf0((xnum(x.amt)||0)/1e4)+'</td>'+
    '<td>'+xf(x.ratio,2)+'%</td></tr>'));
}
function caveat(){
  XCAV('EV_CAVEAT','口径与边界',[
    '<b>解禁 ≠ 减持。</b>RPT_LIFT_STAGE 记录的是限售股到期可流通的规模与日期，不涉及股东是否卖出；把解禁市值直接当作抛压是常见误读。',
    '<b>单位换算。</b>解禁市值 LIFT_MARKET_CAP 原始单位为万元，页面 KPI 折算为亿元；龙虎榜 BILLBOARD_DEAL_AMT 原始单位为元，表格折算为万元。FREE_RATIO 为占股本比例，页面乘 100 显示为 %。',
    '<b>龙虎榜口径。</b>上榜条件由沪深交易所异动规则决定，公开数据只含席位成交金额与涨跌幅，不含逐笔委托、资金性质或机构身份；本栏不推断「游资 / 机构 / 国家队」。',
    '<b>样本截断。</b>解禁取未来排序前 120 笔、龙虎榜取最近 80 条，均为按公告 / 交易日倒序的截断样本，不是全市场完整事件库；跨期比较需自行扩展取数。',
    '<b>无微观结构数据。</b>Level-2 逐笔主动买卖方向、委托队列、封单 / 撤单、竞价数据没有免费公开源，本工作台未接入，也不会用量价代理冒充。',
    '<b>事件不是因果。</b>本栏未对解禁 / 龙虎榜事件做样本外收益检验，所有描述只用于提示「需要留意的条件」，不构成买卖依据。'
  ]);
}
function draw(){kpi();dec();drawUnlock();drawBoard();drawTab();}
caveat();
MODS.events={draw};
})();

/* ==== wb_cross.js ==== */
/* ===== 15 跨市场与宏观 ===== */
(function(){
/* 460 日跨市场历史由 backfill_history.py 从腾讯外盘日线回补，优先级高于逐日累积的当日序列 */
const Q=XC.quotes||[], FX=XC.fx||{}, BOND=XC.bond||{},
      D=(HC.daily&&HC.daily.length?HC.daily:XC.daily)||[];
const NAME={HSI:'恒生指数',NDX:'纳斯达克',DJIA:'道琼斯',SPX:'标普500',UDI:'美元指数',GC00Y:'COMEX黄金'};
const by=Object.fromEntries(Q.map(x=>[x.code,x]));
const get=c=>(by[c]||{}).chg;

function dec(){
  const hsi=get('HSI'),ndx=get('NDX'),fx=xnum(FX.usdcny),y10=xnum(BOND.y10);
  let level='外部环境：中性',tone=C.dim;
  if((hsi||0)<=-1&&(ndx||0)<=-1){level='外围普跌';tone=C.down;}
  else if((hsi||0)>=1&&(ndx||0)>=0.5){level='外围偏强';tone=C.up;}
  const body=
    '恒指 <b style="color:'+(hsi<0?C.down:C.up)+'">'+xsgn(hsi)+'%</b>、纳指 '+xsgn(ndx)+'%、'+
    '标普 '+xsgn(get('SPX'))+'%、道指 '+xsgn(get('DJIA'))+'%；美元指数 <b>'+xf((by.UDI||{}).price,2)+
    '</b>、COMEX 黄金 '+xf((by.GC00Y||{}).price,2)+'。在岸人民币 USDCNY <b>'+xf(fx,4)+'</b>'+
    '（离岸 '+xf(FX.usdcnh,4)+'，'+dateFmt((FX.date||'').replace(/-/g,''))+'），'+
    '中债 10 年期国债收益率 <b>'+xf(y10,4)+'%</b>（'+dateFmt(BOND.date||'')+'）。<br>'+
    '中债 10Y 与第 12 栏 ERP 的固定口径同源：ERP＝100/沪深300 PE-TTM − 中债 10Y。'+
    '跨市场读数只用于给 A 股当日结构补一层外部语境，<b>不能当成 A 股次日方向的领先信号</b>。<br>'+
    '<span style="color:#8892a0">各市场收盘时点不同（美股为前一夜、港股为当日 16:00、汇率与商品为连续报价的某一时点），'+
    '因此这不是同步快照，也不是盘中实时数据。</span>';
  XDEC('CR_DEC','今日结构判读 · 跨市场',level,tone,body,
    ['<span class="tag real">外盘 / 汇率 / 中债真实</span>','<span class="tag proxy">跨时区</span>','<span class="tag na">非盘中实时</span>']);
}
function kpi(){
  XKPI('CR_KPI',[
    ['恒生指数',xsgn(get('HSI'))+'%','最近收盘',xcls(get('HSI'))],
    ['纳斯达克',xsgn(get('NDX'))+'%','最近收盘',xcls(get('NDX'))],
    ['标普 500',xsgn(get('SPX'))+'%','最近收盘',xcls(get('SPX'))],
    ['美元指数',xf((by.UDI||{}).price,2),'DXY 口径'],
    ['COMEX 黄金',xf((by.GC00Y||{}).price,2),'美元/盎司'],
    ['USDCNY 在岸',xf(FX.usdcny,4),dateFmt((FX.date||'').replace(/-/g,''))],
    ['USDCNH 离岸',xf(FX.usdcnh,4),'新浪外汇'],
    ['中债 10Y',xf(BOND.y10,4)+'%',dateFmt(BOND.date||'')]
  ]);
}
function drawQuotes(){
  XBAR('cr-quotes',Q.map(x=>({label:NAME[x.code]||x.name||x.code,value:xnum(x.chg),
       color:xnum(x.chg)>=0?C.up:C.down,right:xf(x.price,2)})),
    {centered:true,fmt:v=>Number(v).toFixed(2),unit:'%',pad:{l:104,r:78,t:14,b:22},empty:'外盘行情未取到'});
}
function drawMacro(){
  const rows=BOND.rows||[];
  if(rows.length<2){
    XEMPTY('cr-macro','中债 10Y 历史仅 '+rows.length+' 日 · USDCNY '+xf(FX.usdcny,4)+' · 10Y '+xf(BOND.y10,4)+'%');
    return;
  }
  XTS('cr-macro',rows.map(z=>z[0]).reverse(),[
    {name:'中债 10Y(%)',data:rows.map(z=>z[1]).reverse(),color:C.blue,dot:true}
  ],{fmt:v=>Number(v).toFixed(3),note:'USDCNY '+xf(FX.usdcny,4)+' · 在左轴数值口径外单列'});
}
function drawDaily(){
  XTS('cr-daily',D.map(z=>z[0]),[
    {name:'恒指 %',data:D.map(z=>z[1]),color:C.up,dot:true},
    {name:'纳指 %',data:D.map(z=>z[2]),color:C.blue,dot:true},
    {name:'标普 %',data:D.map(z=>z[3]),color:C.purple,dot:true}
  ],{zero:true,fmt:v=>Number(v).toFixed(1)+'%',empty:'跨市场历史未取到',
     note:'腾讯外盘日线已回补 '+D.length+' 日 · 美股取不晚于该日的最近收盘（隔夜）'});
}
function drawTab(){
  const rows=Q.map(x=>({n:NAME[x.code]||x.name||x.code,p:x.price,c:x.chg,k:'最近收盘涨跌幅'}));
  rows.push({n:'USDCNY 在岸',p:xnum(FX.usdcny),c:null,k:'汇率 · '+dateFmt((FX.date||'').replace(/-/g,''))});
  rows.push({n:'USDCNH 离岸',p:xnum(FX.usdcnh),c:null,k:'汇率 · 新浪外汇'});
  rows.push({n:'中债 10Y',p:xnum(BOND.y10),c:null,k:'国债收益率 % · '+dateFmt(BOND.date||'')});
  $('#cr-tabsub')&&($('#cr-tabsub').textContent=rows.length+' 项读数');
  XTAB('cr-tab',rows.map(x=>'<tr><td class="l">'+esc(x.n)+'</td><td>'+xf(x.p,4)+'</td>'+
    '<td class="'+xcls(x.c)+'">'+xsgn(x.c)+'</td><td class="l" style="color:#8892a0">'+esc(x.k)+'</td></tr>'));
}
function caveat(){
  XCAV('CR_CAVEAT','口径与边界',[
    '<b>不是盘中实时。</b>公开源均为盘后 / 收盘后可得，外盘指数为各自最近一个收盘，港股与 A 股同日但收盘时点不同，美股为前一交易夜；汇率与商品为连续报价的某一时点快照。',
    '<b>不可直接对齐交易日。</b>把美股隔夜涨跌与 A 股当日收盘放在同一张图里只是语境对照，二者时间窗不重合，不能据此计算领先 / 滞后相关性；本页已有 '+D.length+' 日历史，但<b>仍不输出相关系数或分位</b>，避免因时区错位得出伪结论。',
    '<b>历史回补与缺口。</b>恒指 / 纳指 / 标普 / 道指来自腾讯日线并按日回补 '+D.length+' 个交易日；中债 10Y 在第 12 栏 ERP 的锁定序列里有 5233 日。<b>美元指数与人民币汇率没有免费日度历史源</b>，历史列留空，当日 KPI 仍有读数；不插值、不用其它口径替代。',
    '<b>中债 10Y 口径。</b>东财 RPTA_WEB_TREASURYYIELD 的 EMM00166469 字段（10 年期国债到期收益率，%），与第 12 栏 ERP 固定口径同源；ERP 的历史序列由 fetch_erp.py 另做月末锚点重构，二者不互相覆盖。',
    '<b>汇率方向。</b>USDCNY 数值上行代表人民币走弱；新浪外汇返回为 GBK 编码，本页只解析数值字段，不展示中文名称。',
    '<b>北向资金已不再日频披露。</b>自 2024-08-19 起交易所取消北向资金日度净买入披露，因此本工作台不构建日频北向净流入因子，也不用港股走势反推北向。',
    '<b>语境而非信号。</b>跨市场数据在本工作台只作为 A 股当日结构的外部背景，未做样本外因果检验，不构成投资建议。'
  ]);
}
function draw(){kpi();dec();drawQuotes();drawMacro();drawDaily();drawTab();}
caveat();
MODS.cross={draw};
})();

const _v0=(location.hash||'').slice(1);
switchView(HEAD[_v0]?_v0:'wave');
setTimeout(()=>{const _v=location.hash.slice(1);if(MODS[_v])MODS[_v].draw();},400);
