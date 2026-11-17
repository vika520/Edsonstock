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
