/* ===== 03 STH 成本基础（筹码衰减版）=====
   数据：ST = JSON#STH（fetch_sth.py 产出：筹码衰减马尔可夫链，未复权+股本跳变除权）。 */
(function(){
const ST = JSON.parse((document.getElementById('STH')||{textContent:'{}'}).textContent);
const META = ST.meta || {};
const SNAP = ST.snapshot || {};
let CUR = null; // 由首个可用 target 决定
let RANGE = 0;
(function initCur(){
  const ks = Object.keys(ST.targets||{});
  if(ks.length){
    // 优先篮子，否则第一个
    const pref=['hs300top','cybtop','kcbtop','300750'];
    CUR = pref.find(k=>ks.includes(k)) || ks[0];
    // 同步按钮高亮
    document.querySelectorAll('#sx-target button').forEach(b=>{
      b.classList.toggle('on', b.dataset.t===CUR);
    });
  }
})();

function T(){ return (ST.targets||{})[CUR] || {dates:[],close:[],sth:{},spread:[],ch:{}}; }
function inRange(a){ return (RANGE && a.length>RANGE) ? a.slice(-RANGE) : a; }
function dates(){ return inRange(T().dates||[]); }

function pctLabel(z){
  if(z==null) return '—';
  if(z>=2) return '极端过热（≥+2σ）';
  if(z>=1.5) return '严重过热（+1.5σ）';
  if(z>=1) return '过热（+1σ）';
  if(z>=0.5) return '偏热（+0.5σ）';
  if(z>-0.5) return '中性';
  if(z>-1) return '偏冷（−0.5σ）';
  if(z>-1.5) return '冷却（−1σ）';
  if(z>-2) return '严重冷却（−1.5σ）';
  return '极端冷却（≤−2σ）';
}
function ztone(z){
  if(z==null) return C.dim;
  if(z>=2) return C.down;
  if(z>=1) return C.accent;
  if(z<=-2) return C.blue;
  if(z<=-1) return '#4b9fea';
  return C.dim;
}
function dec(){
  const t=T(), s=SNAP[CUR]||{};
  const n=t.dates.length;
  const i=n-1;
  const z=s.z, f=t.fwd||{};
  const f20=f['20'], f60=f['60'];
  let level='STH 成本：中性', tone=C.dim;
  if(z!=null){
    if(z>=2){level='极端过热：价格远高于短持成本（≥+2σ）';tone=C.down;}
    else if(z<=-2){level='极端冷却：价格深贴/跌破短持成本（≤−2σ）';tone=C.blue;}
    else if(z>=1){level='偏热：脱离成本上方（+1σ）';tone=C.accent;}
    else if(z<=-1){level='偏冷：跌破成本（−1σ）';tone='#4b9fea';}
  }
  const mem=(t.members?('<br>篮子成员 '+t.nMembers+' 只等权（代理口径，非官方成分加权）'):'');
  const body=
    '<b>'+esc(t.name||CUR)+'</b> 收盘 <b>'+xf(s.close,2)+'</b>，STH80 成本 <b>'+xf(s.sth80,2)+
    '</b>，价差 <b>'+xf(s.spread,2)+'</b> → z=<b style="color:'+ztone(z)+'">'+xf(z,2)+'</b>（'+pctLabel(z)+'）。'+
    '通道为价差的 250 日滚动均值 ±[0.5/1/1.5/2]σ；500 日辅窗对照。'+mem+'<br>'+
    '<span style="color:#8892a0">因果检验（spread≤mean−2σ 首次进入）：</span>'+
    (f20&&f60
      ? '历史触发 '+xf0((f20.events||0))+' 次；其后 20 日胜率 '+xf(f20.winRate,1)+'%（基准 '+xf(f20.baseline,1)+'%，p='+f20.p+'）、'+
        '60 日胜率 '+xf(f60.winRate,1)+'%（p='+f60.p+'）'+(f60.sig?'<b style="color:'+C.accent+'">60日显著</b>':'<b>均不显著</b>')+
        '。注意：−2σ 是逆势信号，持续阴跌中会连续触发连续失效（2026-09 宁德即为例）。'
      : '样本不足');
  XDEC('SX_DEC','STH 成本判读 · '+dateFmt(t.dates[i]||''),level,tone,body,
    ['<span class="tag real">新浪日线/东财股本真实</span>','<span class="tag proxy">筹码分布为模型推算</span>','<span class="tag na">非链上可验证口径</span>']);
}
function kpi(){
  const s=SNAP[CUR]||{}, t=T();
  const i=t.dates.length-1;
  const sth=t.sth||{};
  XKPI('SX_KPI',[
    ['收盘',xf(s.close,2),''],
    ['STH80 成本',xf(s.sth80,2),'N=80 交易日'],
    ['价差',xf(s.spread,2),'收盘 − STH80'],
    ['z 值',xf(s.z,2)+'σ',pctLabel(s.z),ztone(s.z)],
    ['N=60 成本',xf((sth['60']||[])[i],2),'短周期对照'],
    ['N=100 成本',xf((sth['100']||[])[i],2),'长周期对照'],
    ['−2σ 轨',xf((t.ch&&t.ch['250']?t.ch['250']['p2'][i]:null),2),'250日窗'],
    ['+2σ 轨',xf((t.ch&&t.ch['250']?t.ch['250']['m2'][i]:null),2),'250日窗']
  ]);
}
function drawMain(){
  const t=T(), d=inRange(t.dates);
  const i0=t.dates.length-d.length;
  const ch=t.ch||{}, c250=ch['250']||{};
  const cost=inRange(((t.sth||{})['80']||[]).slice(i0));
  // BTC STH 图的正确复刻：通道轨 = 成本 + (价差通道 mean±kσ)，回到价格量纲，
  // 价格在成本线与上下轨之间穿插（而非价差通道贴底脱节）。
  const rail=k=>{
    const chg=(c250[k]||[]).slice(i0);
    return cost.map((c,j)=> (c!=null && chg[j]!=null) ? c+chg[j] : null);
  };
  XTS('sx-main',d,[
    {name:'收盘',data:inRange((t.close||[]).slice(i0)),color:C.white,width:1.6},
    {name:'STH80 成本',data:cost,color:C.accent,width:1.8},
    {name:'上轨 +2σ',data:rail('m2'),color:C.down,dash:[4,4]},
    {name:'+1σ',data:rail('m1'),color:C.down,dash:[2,4]},
    {name:'−1σ',data:rail('p1'),color:C.blue,dash:[2,4]},
    {name:'下轨 −2σ',data:rail('p2'),color:C.blue,dash:[4,4]}
  ],{fmt:f2,fmt2:f2,pad:{l:56,r:20,t:20,b:24}});
}
function drawN(){
  const t=T(), d=inRange(t.dates);
  const i0=t.dates.length-d.length;
  const sth=t.sth||{};
  XTS('sx-n',d,[
    {name:'收盘',data:inRange((t.close||[]).slice(i0)),color:C.white,width:1.4},
    {name:'N=60',data:inRange(((sth['60'])||[]).slice(i0)),color:C.up},
    {name:'N=80',data:inRange(((sth['80'])||[]).slice(i0)),color:C.accent},
    {name:'N=100',data:inRange(((sth['100'])||[]).slice(i0)),color:C.purple}
  ],{fmt:f2,fmt2:f2,pad:{l:56,r:20,t:20,b:24}});
}
function drawZ(){
  const t=T(); const d=inRange(t.dates);
  const i0=t.dates.length-d.length;
  const ch=t.ch||{}, c250=ch['250']||{};
  const mean=c250['mean']||[], sd=c250['sd']||[], sp=(t.spread||[]).slice(i0);
  const m2=mean.slice(i0), s2=sd.slice(i0);
  const z=m2.map((m,j)=> (m!=null&&s2[j]&&sp[j]!=null) ? (sp[j]-m)/s2[j] : null);
  XTS('sx-z',d,[
    {name:'价差 z 值',data:z,color:C.accent,type:'bar'},
    {name:'+2σ',data:z.map(()=>2),color:C.down,dash:[4,4]},
    {name:'−2σ',data:z.map(()=>-2),color:C.blue,dash:[4,4]}
  ],{zero:true,fmt:f2,fmt2:f2,pad:{l:48,r:20,t:20,b:24}});
}
function table(){
  const tb=document.querySelector('#sx-tab tbody'); if(!tb) return;
  const t=T();
  const rows=(t.dates||[]).slice(-20).reverse();
  const i0=t.dates.length-((t.dates||[]).length);
  const ch=t.ch&&t.ch['250']||{};
  tb.innerHTML=rows.map(dd=>{
    const j=t.dates.indexOf(dd);
    const sp=t.spread[j], m=ch['mean']?ch['mean'][j]:null, sd=ch['sd']?ch['sd'][j]:null;
    const z=(sp!=null&&m!=null&&sd)?(sp-m)/sd:null;
    return '<tr><td class="l">'+esc(dd)+'</td><td>'+xf(t.close[j],2)+'</td>'+
      '<td>'+xf((t.sth['80']||[])[j],2)+'</td><td>'+xf(sp,2)+'</td><td>'+xf(z,2)+'</td></tr>';
  }).join('');
}
function cover(){
  const el=document.getElementById('sx-cover'); if(!el) return;
  const t=T();
  el.textContent=(t.dates&&t.dates.length)
    ? ('样本 '+t.dates.length+' 日（'+t.dates[0]+' ~ '+t.dates[t.dates.length-1]+'）· burn-in 500 · 股本跳变检测除权')
    : '无数据';
}
function caveat(){
  const el=document.getElementById('SX_CAVEAT'); if(!el) return;
  const disc=(META.disclosure||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
  el.innerHTML='<b>口径与边界。</b><ul>'+disc+
    '<li>本栏是<b>筹码分布的统计近似</b>：三角分布与换手衰减是简化假设，非真实持仓迁移；大股东锁仓用自由流通股本近似剔除。</li>'+
    '<li>−2σ 触发是<b>逆势信号</b>：单边阴跌中会连续触发连续失效（宁德 2026-09 三连错），必须结合趋势栏目合读。</li>'+
    '<li>篮子为等权 15 只流动性样本，非官方指数加权，与真实沪深300 指数读数有偏差。</li>'+
    '<li>因果检验结论以本栏数据为准；本栏全部内容为统计描述，不构成投资建议。</li></ul>';
}
function draw(){
  if(!(T().dates||[]).length){const el=document.getElementById('sx-cover');if(el)el.textContent='无数据';return;}
  dec();kpi();drawMain();drawN();drawZ();table();cover();caveat();
}
document.querySelectorAll('#sx-target button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#sx-target button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    CUR=b.dataset.t;
    draw();
  });
});
document.querySelectorAll('#sx-range button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#sx-range button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    RANGE=+b.dataset.r||0;
    drawMain();drawN();drawZ();
  });
});
draw();
MODS.sth={draw};
})();
