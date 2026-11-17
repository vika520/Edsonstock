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
