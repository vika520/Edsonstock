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
