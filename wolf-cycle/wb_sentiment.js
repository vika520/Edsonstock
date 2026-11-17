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
