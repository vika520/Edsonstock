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
