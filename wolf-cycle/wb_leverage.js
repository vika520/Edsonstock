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
