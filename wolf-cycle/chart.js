(function(){
"use strict";
const DATA = JSON.parse(document.getElementById('DATA').textContent);
const $ = s => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d'), box = $('#chartbox'), tip = $('#tip');

const STOPS = [
  [0.00,[38,99,200]], [0.20,[28,163,170]], [0.40,[38,166,91]],
  [0.60,[212,192,32]], [0.80,[240,138,28]], [1.00,[232,69,60]]
];
function heat(v, a){
  v = Math.min(1, Math.max(0, v));
  let i = 0; while(i < STOPS.length-2 && v > STOPS[i+1][0]) i++;
  const p0 = STOPS[i], p1 = STOPS[i+1];
  const t = (v-p0[0])/(p1[0]-p0[0]);
  const c = [0,1,2].map(k => Math.round(p0[1][k] + (p1[1][k]-p0[1][k])*t));
  return `rgba(${c[0]},${c[1]},${c[2]},${a===undefined?1:a})`;
}
const fmt = n => n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const pad2 = n => String(n).padStart(2,'0');
function dstr(s){ return s.slice(0,4)+'/'+s.slice(4,6)+'/'+s.slice(6,8); }
function dObj(s){ return new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8)); }

/* ---------------- state ---------------- */
const S = { code:'sh000001', tf:'day', range:'5y', mode:'causal', rev:0.08,
            rows:[], ind:null, view:{start:0,end:0}, hover:-1, drag:null, geo:null };

const IDX = ['sh000001','sz399001','sz399006','sh000300'];
const YBARS = {day:250, week:52, month:12};

/* ---------------- resample ---------------- */
function resample(raw, tf){
  const src = raw.map(r => ({d:r[0], c:r[1], h:r[2], l:r[3]}));
  if(tf === 'day') return src;
  const out = [], groups = new Map();
  for(const r of src){
    let key;
    if(tf === 'month') key = r.d.slice(0,6);
    else {
      const d = dObj(r.d), wd = (d.getDay()+6)%7;
      d.setDate(d.getDate()-wd);
      key = d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate());
    }
    const g = groups.get(key);
    if(!g) groups.set(key, {d:r.d, c:r.c, h:r.h, l:r.l});
    else { g.d=r.d; g.c=r.c; g.h=Math.max(g.h,r.h); g.l=Math.min(g.l,r.l); }
  }
  for(const k of [...groups.keys()].sort()) out.push(groups.get(k));
  return out;
}

/* ---------------- pivots ---------------- */
// 因果：只确认「已经反向走完 rev」的极值，严格逐根推进
function causalPivots(c, rev){
  const n = c.length, piv = [];
  let trend = 1, hi = c[0], hiI = 0, lo = c[0], loI = 0;
  for(let i=1;i<n;i++){
    const p = c[i];
    if(trend === 1){
      if(p > hi){ hi = p; hiI = i; }
      else if(p <= hi*(1-rev)){
        piv.push({i:hiI, type:'H', p:hi, confirm:i});
        trend = -1; lo = p; loI = i;
      }
    } else {
      if(p < lo){ lo = p; loI = i; }
      else if(p >= lo*(1+rev)){
        piv.push({i:loI, type:'L', p:lo, confirm:i});
        trend = 1; hi = p; hiI = i;
      }
    }
  }
  // 虚拟起点，保证相位有完整的第一段
  if(piv.length) piv.unshift({i:0, type: piv[0].type==='H'?'L':'H', p:c[0], confirm:0, virtual:true});
  return {piv, trend};
}
// 事后：中心化分形（含未来 k 根），仅作对照
function hindsightPivots(c, rev){
  const n = c.length, k = Math.max(4, Math.round(rev*150)), cand = [];
  for(let i=k;i<n-k;i++){
    let isH = true, isL = true;
    for(let j=i-k;j<=i+k;j++){ if(c[j] > c[i]) isH = false; if(c[j] < c[i]) isL = false; }
    if(isH) cand.push({i, type:'H', p:c[i], confirm:i});
    else if(isL) cand.push({i, type:'L', p:c[i], confirm:i});
  }
  const piv = [];
  for(const q of cand){
    const last = piv[piv.length-1];
    if(last && last.type === q.type){
      if((q.type==='H' && q.p > last.p) || (q.type==='L' && q.p < last.p)) piv[piv.length-1] = q;
    } else piv.push(q);
  }
  if(!piv.length) return {piv:[{i:0,type:'L',p:c[0],confirm:0,virtual:true},{i:n-1,type:'H',p:c[n-1],confirm:n-1}], trend:1, k};
  if(piv[0].i > 0) piv.unshift({i:0, type: piv[0].type==='H'?'L':'H', p:c[0], confirm:0, virtual:true});
  const trend = piv[piv.length-1].type === 'H' ? -1 : 1;
  return {piv, trend, k};
}
function buildPhase(n, obj){
  const piv = obj.piv, val = t => t==='H' ? 1 : 0;
  const phase = new Float64Array(n);
  const bands = [];
  const put = (a,b,va,vb,dir) => {
    const len = Math.max(1,b-a);
    for(let i=a;i<=b;i++) phase[i] = va + (vb-va)*((i-a)/len);
    bands.push({a,b,dir});
  };
  put(0, piv[0].i, 1-val(piv[0].type), val(piv[0].type), val(piv[0].type));
  for(let j=0;j<piv.length-1;j++){
    const a = piv[j], b = piv[j+1];
    if(b.i > a.i) put(a.i, b.i, val(a.type), val(b.type), val(b.type));
  }
  const last = piv[piv.length-1];
  // 未确认段只外推到 0.88 / 0.12：表示「接近但尚未确认极值」，避免把末端画成完美的 0/1 抄底逃顶点
  const target = obj.trend === 1 ? 0.88 : 0.12;
  if(n-1 > last.i) put(last.i, n-1, val(last.type), target, obj.trend === 1 ? 1 : 0);
  // 未确认区：最后一个「已确认」极值所在位置之后（当时并不知道它是极值）
  const unconfirmedFrom = last.virtual ? 0 : last.i;
  const realPiv = piv.filter(p => !p.virtual);
  const lag = realPiv.length
    ? realPiv.reduce((s,p)=>s+(p.confirm-p.i),0)/realPiv.length : 0;
  return {phase, bands, piv, unconfirmedFrom, lag, lastConfirm: realPiv.length?realPiv[realPiv.length-1].confirm:n-1, k:obj.k||0};
}
function compute(){
  const c = S.rows.map(r=>r.c);
  const obj = S.mode === 'causal' ? causalPivots(c, S.rev) : hindsightPivots(c, S.rev);
  S.ind = buildPhase(c.length, obj);
}

/* ---------------- view ---------------- */
function setRange(){
  const n = S.rows.length, y = {'1y':1,'3y':3,'5y':5,'10y':10,'all':Infinity}[S.range];
  const cnt = y === Infinity ? n : Math.max(30, Math.min(n, Math.round(YBARS[S.tf]*y)));
  S.view = {start: Math.max(0,n-cnt), end: n-1};
}
function clampView(){
  const n = S.rows.length, w = S.view.end-S.view.start;
  S.view.start = Math.max(0, Math.min(n-30, S.view.start));
  S.view.end = Math.min(n-1, S.view.start + Math.max(29, w));
  if(S.view.end <= S.view.start) S.view.end = Math.min(n-1, S.view.start+29);
}

/* ---------------- draw ---------------- */
const CH = 620;
function draw(){
  const W = box.clientWidth - 2, H = CH;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  cv.style.width = W+'px'; cv.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);

  const pad = {l:16, r:96, t:22, b:30};
  const plotW = W-pad.l-pad.r;
  const mainH = Math.round((H-pad.t-pad.b)*0.70);
  const subTop = pad.t+mainH+30;
  const subH = H-pad.b-subTop;
  const rows = S.rows, ind = S.ind;
  const a = S.view.start, b = S.view.end, span = Math.max(1,b-a);
  const X = i => pad.l + (i-a)/span*plotW;

  // 可见价格范围（对数）
  let lo = Infinity, hi = -Infinity;
  for(let i=a;i<=b;i++){ if(rows[i].l < lo) lo = rows[i].l; if(rows[i].h > hi) hi = rows[i].h; }
  if(!isFinite(lo) || !isFinite(hi)) return;
  const lgLo = Math.log(Math.max(1,lo*0.96)), lgHi = Math.log(hi*1.04);
  const Y = p => pad.t + (lgHi-Math.log(Math.max(1,p)))/(lgHi-lgLo)*mainH;
  const YS = v => subTop + (1-v)*subH;
  S.geo = {pad,plotW,mainH,subTop,subH,X,Y,YS,a,b,W,H};

  ctx.fillStyle = '#0b0e11'; ctx.fillRect(0,0,W,H);

  // 网格
  ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 1;
  ctx.font = '10px Consolas,monospace'; ctx.textBaseline = 'middle';
  for(let g=0;g<=5;g++){
    const v = Math.exp(lgLo + (lgHi-lgLo)*g/5), y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l,y+.5); ctx.lineTo(W-pad.r+4,y+.5); ctx.stroke();
    ctx.fillStyle = '#6f7986'; ctx.textAlign = 'left';
    ctx.fillText(fmt(v), W-pad.r+10, y);
  }
  // 周期背景带
  for(const bd of ind.bands){
    if(bd.b < a || bd.a > b) continue;
    const x1 = Math.max(pad.l,X(Math.max(a,bd.a))), x2 = Math.min(W-pad.r+4, X(Math.min(b,bd.b)));
    if(x2 - x1 < 2) continue;
    ctx.fillStyle = bd.dir > 0 ? 'rgba(14,86,50,.42)' : 'rgba(108,24,32,.40)';
    ctx.fillRect(x1, pad.t, x2-x1, mainH);
    ctx.fillRect(x1, subTop, x2-x1, subH);
    ctx.strokeStyle = bd.dir > 0 ? 'rgba(36,150,90,.32)' : 'rgba(190,60,60,.30)';
    ctx.beginPath(); ctx.moveTo(x2+.5,pad.t); ctx.lineTo(x2+.5,subTop+subH); ctx.stroke();
    // 阶段小胶囊
    if(x2-x1 > 76){
      const label = bd.dir > 0 ? '上行周期' : '下行周期';
      const tw = ctx.measureText(label).width + 14;
      const tx = (x1+x2)/2-tw/2, ty = subTop-16;
      ctx.fillStyle = bd.dir > 0 ? 'rgba(16,74,45,.95)' : 'rgba(92,24,30,.95)';
      ctx.strokeStyle = bd.dir > 0 ? '#1c6b43' : '#7a2b31';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(tx,ty,tw,15,3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = bd.dir > 0 ? '#7ee0ae' : '#f0a09c';
      ctx.textAlign = 'center'; ctx.font = '9.5px "Microsoft YaHei",sans-serif';
      ctx.fillText(label, tx+tw/2, ty+8);
    }
  }
  // 未确认区斜纹
  if(ind.unconfirmedFrom < b && S.mode==='causal'){
    const ux = Math.max(pad.l, X(ind.unconfirmedFrom));
    ctx.save(); ctx.beginPath(); ctx.rect(ux,pad.t,(W-pad.r+4)-ux,mainH+30+subH); ctx.clip();
    ctx.strokeStyle = 'rgba(150,165,185,.09)'; ctx.lineWidth = 1;
    for(let x=ux-subH-mainH;x<W+200;x+=9){ ctx.beginPath(); ctx.moveTo(x,subTop+subH); ctx.lineTo(x+subH+mainH+30,pad.t); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(190,200,215,.55)'; ctx.font='9.5px "Microsoft YaHei",sans-serif'; ctx.textAlign='left';
    if((W-pad.r+4)-ux > 60) ctx.fillText('相位未确认', ux+5, pad.t+12);
  }

  // 副图参考线
  ctx.strokeStyle='rgba(255,255,255,.09)'; ctx.setLineDash([3,4]); ctx.lineWidth=1;
  for(const v of [0,0.5,1]){ const y=YS(v); ctx.beginPath(); ctx.moveTo(pad.l,y+.5); ctx.lineTo(W-pad.r+4,y+.5); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.fillStyle='#6f7986'; ctx.font='10px Consolas,monospace'; ctx.textAlign='right'; ctx.textBaseline='middle';
  ctx.fillText('1.0',pad.l+plotW-4,YS(1)+9); ctx.fillText('0.5',pad.l+plotW-4,YS(.5)); ctx.fillText('0.0',pad.l+plotW-4,YS(0)-9);
  // 副图标题放到主图左上角，避免与阶段胶囊重叠
  ctx.textAlign='left'; ctx.fillStyle='#8c96a3'; ctx.font='10.5px "Microsoft YaHei",sans-serif';
  ctx.fillText('周期相位（狼波指数）', pad.l+4, pad.t+8);
  ctx.strokeStyle='rgba(255,255,255,.10)'; ctx.beginPath();
  ctx.moveTo(pad.l,pad.t+mainH+.5); ctx.lineTo(W-pad.r+4,pad.t+mainH+.5); ctx.stroke();

  // 主曲线 / 副图曲线：按色阶分桶批量绘制
  const NB = 24, pMain = new Array(NB), pSub = new Array(NB);
  for(let i=a;i<b;i++){
    const k = Math.min(NB-1, Math.max(0, Math.floor(ind.phase[i]*NB)));
    const x1=X(i), x2=X(i+1), y1=Y(rows[i].c), y2=Y(rows[i+1].c);
    if(!pMain[k]) pMain[k]=new Path2D();
    pMain[k].moveTo(x1,y1); pMain[k].lineTo(x2,y2);
    const s1=YS(ind.phase[i]), s2=YS(ind.phase[i+1]);
    if(!pSub[k]) pSub[k]=new Path2D();
    pSub[k].moveTo(x1,s1); pSub[k].lineTo(x2,s2);
  }
  ctx.lineJoin='round'; ctx.lineCap='round';
  for(let k=0;k<NB;k++){
    if(pMain[k]){ ctx.strokeStyle=heat((k+.5)/NB); ctx.lineWidth=2.1; ctx.stroke(pMain[k]); }
    if(pSub[k]){ ctx.strokeStyle=heat((k+.5)/NB); ctx.lineWidth=1.9; ctx.stroke(pSub[k]); }
  }
  // 未确认段：白色虚线覆盖
  if(ind.unconfirmedFrom < b && S.mode==='causal'){
    const st = Math.max(a, ind.unconfirmedFrom);
    ctx.save(); ctx.setLineDash([4,3]); ctx.strokeStyle='rgba(226,234,245,.72)'; ctx.lineWidth=1.6;
    ctx.beginPath(); for(let i=st;i<=b;i++){ const x=X(i),y=YS(ind.phase[i]); i===st?ctx.moveTo(x,y):ctx.lineTo(x,y); } ctx.stroke();
    ctx.restore();
  }

  // 转折点 + 红色手绘箭头
  const shown = [];
  for(const p of ind.piv){
    if(p.virtual || p.i < a || p.i > b) continue;
    if(shown.length && X(p.i)-X(shown[shown.length-1].i) < 52) continue;
    shown.push(p);
  }
  for(const p of shown){
    const x = X(p.i), y = Y(p.p);
    ctx.fillStyle = p.type==='L' ? '#26c281' : '#ff5a4e';
    ctx.beginPath(); ctx.arc(x,y,3.2,0,Math.PI*2); ctx.fill();
    drawArrow(ctx, x, y, p.type);
  }

  // 右侧热力标尺
  const bx = W-30, by = pad.t, bw = 13, bh = mainH;
  const grd = ctx.createLinearGradient(0,by+bh,0,by);
  for(const s of STOPS) grd.addColorStop(s[0], `rgb(${s[1].join(',')})`);
  ctx.fillStyle = grd; ctx.fillRect(bx,by,bw,bh);
  ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.strokeRect(bx+.5,by+.5,bw,bh);
  ctx.font='9.5px Consolas,monospace'; ctx.fillStyle='#7d8794'; ctx.textAlign='left'; ctx.textBaseline='middle';
  const scl = ['0','0.25','0.5','0.75','1'];
  for(let g=0;g<=4;g++){
    const v=g/4, y=by+bh-v*bh;
    ctx.beginPath(); ctx.moveTo(bx+bw,y+.5); ctx.lineTo(bx+bw+4,y+.5); ctx.stroke();
    ctx.font = '9px Consolas,monospace';
    ctx.fillText(scl[g], bx+bw+5, y);
  }
  const cval = ind.phase[b], cy = by+bh-cval*bh;
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(bx-2,cy); ctx.lineTo(bx-8,cy-4); ctx.lineTo(bx-8,cy+4); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#e8edf5'; ctx.font='bold 10px Consolas,monospace'; ctx.textAlign='right';
  ctx.fillText(cval.toFixed(2), bx-10, Math.max(by+8,Math.min(by+bh-8,cy)));

  // 时间轴
  ctx.strokeStyle='rgba(255,255,255,.07)'; ctx.beginPath();
  ctx.moveTo(pad.l,subTop+subH+.5); ctx.lineTo(W-pad.r+4,subTop+subH+.5); ctx.stroke();
  const ticks = Math.max(3, Math.min(9, Math.floor(plotW/130)));
  ctx.font='10px Consolas,monospace'; ctx.fillStyle='#6f7986'; ctx.textBaseline='top';
  for(let g=0;g<=ticks;g++){
    const i = Math.round(a + span*g/ticks), x = X(i);
    ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(x+.5,pad.t); ctx.lineTo(x+.5,subTop+subH); ctx.stroke();
    const d = rows[i].d;
    const lab = (S.range==='1y'||S.tf!=='day') ? d.slice(0,4)+'/'+d.slice(4,6) : d.slice(0,4);
    ctx.textAlign = g===0?'left':(g===ticks?'right':'center');
    ctx.fillText(lab, x, subTop+subH+7);
  }

  // 水印
  ctx.save(); ctx.globalAlpha=.075; ctx.fillStyle='#dfe7f2';
  ctx.font='bold 40px "Microsoft YaHei",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('狼波周期指数 · A股大盘', pad.l+plotW/2, pad.t+mainH*0.45); ctx.restore();

  // 十字光标
  if(S.hover >= a && S.hover <= b){
    const i=S.hover, x=X(i), y=Y(rows[i].c), sy=YS(ind.phase[i]);
    ctx.save(); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(210,220,235,.55)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x+.5,pad.t); ctx.lineTo(x+.5,subTop+subH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l,y+.5); ctx.lineTo(W-pad.r+4,y+.5); ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#0b0e11'; ctx.strokeStyle=heat(ind.phase[i]); ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x,sy,3.5,0,Math.PI*2); ctx.fillStyle=heat(ind.phase[i]); ctx.fill();
    // 右侧价格标签
    ctx.fillStyle='#2b3441'; ctx.fillRect(W-pad.r+6,y-9,pad.r-12,18);
    ctx.fillStyle='#fff'; ctx.font='10px Consolas,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(fmt(rows[i].c), W-pad.r+10, y);
    // 底部日期标签
    const dl = dstr(rows[i].d), dw = 74;
    ctx.fillStyle='#2b3441'; ctx.fillRect(Math.min(W-pad.r+4-dw,Math.max(pad.l,x-dw/2)),subTop+subH+2,dw,17);
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.fillText(dl, Math.min(W-pad.r+4-dw/2,Math.max(pad.l,x-dw/2))+dw/2, subTop+subH+11);
  }
}
function drawArrow(c,x,y,type){
  c.save(); c.strokeStyle='#ff4d45'; c.lineWidth=2.1; c.lineCap='round'; c.lineJoin='round';
  if(type==='L'){
    c.beginPath(); c.moveTo(x-30,y+40); c.quadraticCurveTo(x-30,y+9,x-7,y+7); c.stroke();
    c.beginPath(); c.moveTo(x-7,y+7); c.lineTo(x-16,y+3); c.moveTo(x-7,y+7); c.lineTo(x-14,y+14); c.stroke();
  } else {
    c.beginPath(); c.moveTo(x+30,y-40); c.quadraticCurveTo(x+30,y-9,x+7,y-7); c.stroke();
    c.beginPath(); c.moveTo(x+7,y-7); c.lineTo(x+16,y-3); c.moveTo(x+7,y-7); c.lineTo(x+14,y-14); c.stroke();
  }
  c.restore();
}

/* ---------------- panels ---------------- */
function updateTop(){
  const m = DATA.indices[S.code], r = S.rows, last = r[r.length-1], prev = r[r.length-2];
  const chg = (last.c-prev.c)/prev.c*100;
  $('#sym').innerHTML = m.name + ' <small>'+S.code.slice(2)+'</small>';
  $('#last').textContent = fmt(last.c);
  const el = $('#chg');
  el.textContent = (chg>=0?'+':'')+chg.toFixed(2)+'%';
  el.className = 'chg mono '+(chg>=0?'up':'down');
  $('#asof').textContent = dstr(last.d);
}
function updateMetrics(){
  const r=S.rows, ind=S.ind, b=S.view.end, a=S.view.start;
  const v=ind.phase[b], dir = ind.phase[b] >= ind.phase[Math.max(a,b-5)] ? 1 : -1;
  const realPiv = ind.piv.filter(p=>!p.virtual && p.i<=b);
  const lp = realPiv.length?realPiv[realPiv.length-1]:{i:a,p:r[a].c,type:'L'};
  const ret = (r[b].c/r[a].c-1)*100;
  const extrapolated = S.mode==='causal' && b >= ind.unconfirmedFrom;
  const zone = extrapolated ? '未确认段 · 外推值' : (v>0.8?'高位过热区':(v<0.2?'低位冰点区':'中位运行'));
  const items = [
    ['当前周期指数', v.toFixed(3), zone],
    ['当前阶段', dir>0?'上行 / 扩张':'下行 / 收缩', dir>0?'绿带':'红带'],
    ['本轮起点', dstr(r[lp.i].d), (lp.type==='L'?'谷 ':'峰 ')+fmt(lp.p)],
    ['本轮已运行', (b-lp.i)+' 根', (b-lp.i)+' 个'+(S.tf==='day'?'交易':(S.tf==='week'?'周':'月'))+'单位'],
    ['显示区间涨跌', (ret>=0?'+':'')+ret.toFixed(2)+'%', dstr(r[a].d)+' → '+dstr(r[b].d)],
    [S.mode==='causal'?'平均确认滞后':'未来窗口 k', S.mode==='causal'?ind.lag.toFixed(1)+' 根':'±'+ind.k+' 根',
      S.mode==='causal'?'峰谷箭头的事后定位偏差':'含 look-ahead bias']
  ];
  $('#metrics').innerHTML = items.map(x =>
    `<div class="metric"><div class="k">${x[0]}</div><div class="v mono">${x[1]}</div><div class="s">${x[2]}</div></div>`).join('');
  $('#statusInfo').textContent = `${dstr(r[a].d)} ~ ${dstr(r[b].d)} · ${b-a+1} 根 · 共 ${ind.piv.filter(p=>!p.virtual).length} 个转折点`;
  $('#foot').textContent = `数据来源：${DATA.source}；${DATA.crosscheck}。抓取日期 ${DATA.fetchedAt}。`+
    `四大指数共 ${Object.values(DATA.indices).reduce((s,x)=>s+x.rows.length,0).toLocaleString()} 根日线，最早 2005-01-04。`;
}
function showTip(px,py){
  const g=S.geo, i=S.hover;
  if(!g || i<g.a || i>g.b){ tip.style.display='none'; return; }
  const r=S.rows[i], ind=S.ind, v=ind.phase[i];
  const prev = S.rows[Math.max(0,i-1)], chg=(r.c-prev.c)/prev.c*100;
  const unconf = i>=ind.unconfirmedFrom && S.mode==='causal';
  const realP = ind.piv.filter(p=>!p.virtual && p.i<=i);
  const lastP = realP.length?realP[realP.length-1]:null;
  const dir = v>=ind.phase[Math.max(0,i-5)]?1:-1;
  tip.innerHTML =
    `<div class="d">${dstr(r.d)}　${['周日','周一','周二','周三','周四','周五','周六'][dObj(r.d).getDay()]}</div>`+
    `<div class="r"><span>收盘</span><b class="mono">${fmt(r.c)}</b></div>`+
    `<div class="r"><span>当日</span><b class="mono" style="color:${chg>=0?'#ff6b61':'#3ecf8e'}">${chg>=0?'+':''}${chg.toFixed(2)}%</b></div>`+
    `<div class="r"><span>高 / 低</span><b class="mono">${fmt(r.h)} / ${fmt(r.l)}</b></div>`+
    `<div class="hr"></div>`+
    `<div class="r"><span>周期指数</span><b class="mono" style="color:${heat(v)}">${v.toFixed(3)}</b></div>`+
    `<div class="r"><span>阶段</span><b style="color:${dir>0?'#5fd39a':'#f08a86'}">${dir>0?'上行周期':'下行周期'}</b></div>`+
    `<div class="r"><span>本轮起点</span><b class="mono">${lastP?dstr(S.rows[lastP.i].d):'—'}</b></div>`+
    `<div class="r"><span>相位状态</span><b style="color:${unconf?'#f0b429':'#8ea0b8'}">${unconf?'未确认（外推）':'已确认'}</b></div>`;
  tip.style.display='block';
  const tw=tip.offsetWidth, th=tip.offsetHeight;
  tip.style.left = Math.min(box.clientWidth-tw-8, px+16)+'px';
  tip.style.top = Math.max(6, Math.min(CH-th-6, py-th/2))+'px';
}
function refresh(){ compute(); clampView(); draw(); updateMetrics(); }

/* ---------------- events ---------------- */
function bindGroup(id, key, after){
  $('#'+id).addEventListener('click', e=>{
    const btn=e.target.closest('button'); if(!btn) return;
    [...$('#'+id).querySelectorAll('button')].forEach(b=>b.classList.toggle('on', b===btn));
    S[key]=btn.dataset.v; after();
  });
}
$('#idxBtns').innerHTML = IDX.map((c,i)=>`<button data-v="${c}" class="${i===0?'on':''}">${DATA.indices[c].name}</button>`).join('');
bindGroup('idxBtns','code', ()=>{ rebuild(); });
bindGroup('tfBtns','tf', ()=>{ rebuild(); });
bindGroup('rangeBtns','range', ()=>{ setRange(); refresh(); });
bindGroup('modeBtns','mode', ()=>{
  $('#alert').classList.toggle('show', S.mode==='hindsight'); refresh();
});
$('#rev').addEventListener('input', e=>{
  S.rev = +e.target.value/100; $('#revVal').textContent = e.target.value+'%'; compute(); draw(); updateMetrics();
});
function rebuild(){
  S.rows = resample(DATA.indices[S.code].rows, S.tf);
  setRange(); refresh(); updateTop();
}
$('#exportBtn').addEventListener('click', ()=>{
  S.hover = -1; tip.style.display='none'; draw();
  const a = document.createElement('a');
  const tag = DATA.indices[S.code].name + '_' + ({day:'日线',week:'周线',month:'月线'}[S.tf]) + '_' + S.rows[S.view.end].d;
  a.download = '狼波周期指数_' + tag + '.png';
  a.href = cv.toDataURL('image/png');
  a.click();
});
function idxAt(px){
  const g=S.geo; if(!g) return -1;
  return Math.round(g.a + (px-g.pad.l)/g.plotW*(g.b-g.a));
}
cv.addEventListener('mousemove', e=>{
  const rect=cv.getBoundingClientRect(), px=e.clientX-rect.left, py=e.clientY-rect.top;
  if(S.drag){
    const g=S.geo, delta=Math.round((S.drag.x-px)/g.plotW*(g.b-g.a));
    S.view.start = S.drag.start + delta; S.view.end = S.drag.end + delta;
    clampView(); draw(); tip.style.display='none'; return;
  }
  S.hover = Math.max(S.view.start, Math.min(S.view.end, idxAt(px)));
  draw(); showTip(px,py);
});
cv.addEventListener('mousedown', e=>{
  S.drag = {x:e.clientX-cv.getBoundingClientRect().left, start:S.view.start, end:S.view.end};
  cv.style.cursor='grabbing';
});
window.addEventListener('mouseup', ()=>{ S.drag=null; cv.style.cursor='crosshair'; });
cv.addEventListener('mouseleave', ()=>{ S.hover=-1; tip.style.display='none'; draw(); });
cv.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect=cv.getBoundingClientRect(), px=e.clientX-rect.left;
  const anchor = idxAt(px), g=S.geo;
  const f = e.deltaY>0 ? 1.18 : 0.85;
  const w = (S.view.end-S.view.start)*f;
  const ratio = Math.max(0,Math.min(1,(anchor-S.view.start)/(S.view.end-S.view.start)));
  S.view.start = Math.round(anchor - w*ratio);
  S.view.end = Math.round(anchor + w*(1-ratio));
  clampView(); draw();
}, {passive:false});
window.addEventListener('resize', ()=>draw());

rebuild();
})();
