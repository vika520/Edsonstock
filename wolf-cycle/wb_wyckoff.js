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
