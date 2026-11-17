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
