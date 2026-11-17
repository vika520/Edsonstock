/* ===== 10 衍生品 / 对冲压力 ===== */
(function(){
const W={prod:'IF',opt:'IO',range:30};
const FF=XD.futuresFields||[], OF=XD.optionsFields||[];
const fi=k=>FF.indexOf(k), oi=k=>OF.indexOf(k);
const prodName={IF:'沪深300',IH:'上证50',IC:'中证500',IM:'中证1000'};
const dates=XD.dates||[];
const slice=n=>n>0&&dates.length>n?dates.slice(-n):dates.slice();
function rows(p,n){const r=(XD.futures||{})[p]||[];const k=slice(n).length;return r.slice(-k);}
function orows(p,n){const r=(XD.options||{})[p]||[];const k=slice(n).length;return r.slice(-k);}

function dec(){
  const p=W.prod, r=rows(p,60), last=r[r.length-1]||[];
  const snap=(XD.snapshot||{})[p]||{}, rank=(XD.rank||{})[p]||{};
  const basis=xnum(last[fi('basis')]), ann=xnum(last[fi('annNear')]), ann2=xnum(last[fi('annSecond')]);
  const o=orows(W.opt,60), ol=o[o.length-1]||[];
  const pcr=xnum(ol[oi('pcrVol')]), pcrO=xnum(ol[oi('pcrOI')]);
  let level='贴水结构：中性',tone=C.dim;
  if(ann2!=null&&ann2<=-8){level='次月年化贴水偏深';tone=C.down;}
  else if(ann2!=null&&ann2>=0){level='次月合约升水';tone=C.up;}
  else if(ann2!=null&&ann2>-3){level='次月贴水温和';tone=C.accent;}
  const body=
    '<b>'+prodName[p]+'（'+p+'）</b>当月合约 <b>'+esc(last[fi('nearId')]||'—')+'</b> 收 '+xf(last[fi('nearClose')],1)+
    '，现货 '+xf(last[fi('spot')],1)+'，基差 <b style="color:'+(basis<0?C.down:C.up)+'">'+xf(basis,1)+' 点</b>；'+
    '当月年化 '+xf(ann,2)+'%（剩 '+xf0(last[fi('daysToExpiry')])+' 天），<b>次月 '+esc(last[fi('secondId')]||'—')+
    ' 年化 '+xf(ann2,2)+'%</b>（剩 '+xf0(last[fi('days2')])+' 天）。'+
    '当月临近到期时 365/剩余天数会显著放大年化，判读应以次月口径为主。<br>'+
    '<b>'+W.opt+'（'+(OPT_NAME[W.opt]||'')+'）期权</b>：成交量 PCR <b>'+xf(pcr,3)+'</b>、持仓量 PCR <b>'+xf(pcrO,3)+
    '</b>。PCR 上行只说明认沽相对活跃，卖 put 同样会推高成交量，不能直接读成看空。<br>'+
    '<b>'+p+' 前 20 席位</b>持买 '+xf0(rank.buy)+' 手、持卖 '+xf0(rank.sell)+' 手，净多空 <b style="color:'+
    ((rank.net||0)<0?C.down:C.up)+'">'+((rank.net||0)>0?'+':'')+xf0(rank.net)+' 手</b>。'+
    '这是会员排名口径，不含全市场账户，也不代表方向预测。<br>'+
    '<span style="color:#8892a0">真实隐含波动率 IV / IV skew 需要期权定价与市场报价，中金所 XML 只有 delta、结算价与持仓，本栏<b>未接入 IV，不做推算冒充</b>。</span>';
  XDEC('DV_DEC','今日结构判读 · '+dateFmt(dates[dates.length-1]||''),level,tone,body,
    ['<span class="tag real">中金所真实</span>','<span class="tag na">IV 未接入</span>']);
}
const OPT_NAME={IO:'沪深300',HO:'上证50',MO:'中证1000'};

function kpi(){
  const p=W.prod, r=rows(p,60), last=r[r.length-1]||[];
  const snap=(XD.snapshot||{})[p]||{}, rank=(XD.rank||{})[p]||{};
  const o=orows(W.opt,60), ol=o[o.length-1]||[];
  XKPI('DV_KPI',[
    ['当月基差',xf(last[fi('basis')],1)+' 点','期货−现货',xcls(-xnum(last[fi('basis')]))],
    ['当月年化贴水',xf(last[fi('annNear')],2)+'%','剩 '+xf0(last[fi('daysToExpiry')])+' 天'],
    ['次月年化贴水',xf(last[fi('annSecond')],2)+'%','剩 '+xf0(last[fi('days2')])+' 天','amber'],
    ['当月持仓',xf0(last[fi('nearOI')])+' 手',esc(last[fi('nearId')]||'')],
    ['四合约总持仓',xf0(last[fi('totalOI')])+' 手','全部挂牌合约'],
    [W.opt+' 成交量 PCR',xf(ol[oi('pcrVol')],3),'ΣP.vol / ΣC.vol'],
    [W.opt+' 持仓量 PCR',xf(ol[oi('pcrOI')],3),'ΣP.OI / ΣC.OI'],
    [p+' 会员净多空',((rank.net||0)>0?'+':'')+xf0(rank.net)+' 手','前 20 席位',((rank.net||0)<0?'down':'up')]
  ]);
}
function drawBasis(){
  const r=rows(W.prod,W.range), d=r.map(z=>z[0]);
  XTS('dv-basis',d,[
    {name:'基差(点)',data:r.map(z=>z[fi('basis')]),color:C.accent,type:'bar'},
    {name:'现货指数(右)',data:r.map(z=>z[fi('spot')]),color:C.white,axis:'right'}
  ],{zero:true,fmt:f1,fmt2:f0,pad:{l:54,r:64,t:18,b:24}});
}
function drawAnn(){
  const r=rows(W.prod,W.range), d=r.map(z=>z[0]);
  XTS('dv-ann',d,[
    {name:'当月年化',data:r.map(z=>z[fi('annNear')]),color:C.accent},
    {name:'次月年化',data:r.map(z=>z[fi('annSecond')]),color:C.blue,width:1.8},
    {name:'零轴',data:d.map(()=>0),color:C.line2,width:1,dash:[2,4]}
  ],{zero:true,fmt:f1});
}
function drawPcr(){
  const r=orows(W.opt,W.range), d=r.map(z=>z[0]);
  $('#dv-pcrsub')&&($('#dv-pcrsub').textContent=W.opt+' '+(OPT_NAME[W.opt]||''));
  XTS('dv-pcr',d,[
    {name:'成交量 PCR',data:r.map(z=>z[oi('pcrVol')]),color:C.up},
    {name:'持仓量 PCR',data:r.map(z=>z[oi('pcrOI')]),color:C.blue},
    {name:'PCR=1',data:d.map(()=>1),color:C.accent,width:1,dash:[3,3]}
  ],{fmt:v=>Number(v).toFixed(2)});
}
function drawOi(){
  const d=slice(W.range), ps=['IF','IH','IC','IM'];
  const base=(XD.futures||{}).IF||[];
  const idx=Object.fromEntries(base.map((z,i)=>[z[0],i]));
  XTS('dv-oi',d,ps.map((p,i)=>({name:p,data:d.map(dt=>{
    const a=(XD.futures||{})[p]||[];const j=idx[dt];return j==null?null:(a[j]?a[j][fi('totalOI')]:null);
  }),color:CAT_COLOR[i]})),{fmt:v=>f0(v/1000)+'k'});
}
function drawRank(){
  const p=W.prod, rank=(XD.rank||{})[p]||{};
  $('#dv-ranksub')&&($('#dv-ranksub').textContent=p+' · '+dateFmt(rank.date||''));
  XBAR('dv-rank',(rank.top||[]).slice(0,12).map(t=>({
    label:t[0],value:t[3],color:t[3]>=0?C.up:C.down
  })),{centered:true,fmt:f0,unit:' 手',pad:{l:150,r:66,t:14,b:22},empty:'当日会员排名未取到'});
}
function drawTab(){
  const p=W.prod, snap=(XD.snapshot||{})[p]||{};
  $('#dv-tabsub')&&($('#dv-tabsub').textContent=p+' · '+dateFmt((XD.rank||{})[p]?.date||''));
  const cs=snap.rows||[];
  XTAB('dv-tab',cs.map(c=>'<tr><td class="l">'+esc(c.id)+'</td><td>'+xf(c.close,1)+'</td>'+
    '<td class="'+xcls(xnum(c.close)-(snap.spot||0))+'">'+xsgn(xnum(c.close)-(snap.spot||0))+'</td>'+
    '<td>'+xf0(c.oi)+'</td><td>'+xf0(c.vol)+'</td><td>'+esc(c.exp||'')+'</td></tr>'));
}
function caveat(){
  XCAV('DV_CAVEAT','口径与边界（本页最重要）',[
    '<b>不是盘中实时。</b>中金所日行情 XML 为交易日收盘后公布，本页由盘后任务抓取；期权与期货均为当日结算口径。',
    '<b>真实 IV / IV skew 未接入。</b>中金所 XML 只有 delta、结算价、成交量与持仓，没有隐含波动率。用结算价反推 IV 需要标的分红、无风险利率与精确定价模型，本页不做推算，也不把 delta 分布冒充 skew。',
    '<b>年化贴水会被临近到期放大。</b>年化＝基差/现货×365/剩余自然日；当月合约剩 1~7 天时数值会剧烈放大，因此同时给出次月合约口径。到期日按「合约月份第三个周五」推算，遇法定节假日顺延可能与交易所实际最后交易日有 1 日误差。',
    '<b>会员净多空是排名口径。</b>datatypeid 0/1/2 按中金所排名表惯例分别对应成交量 / 持买单量 / 持卖单量（已用总量对照核验：持买、持卖前 20 席位合计分别约为全市场持仓的 78% / 86%）。净多空＝前 20 席位持买−持卖，不含全市场账户，且会员名下含客户持仓，<b>不能识别具体机构方向</b>。',
    '<b>PCR 不等于看空。</b>买入认沽与卖出认沽都会增加成交量，PCR 上升需结合持仓量、隐波与标的走势一起看，本页只给结构不给定向结论。',
    '<b>历史长度：</b>已回补 '+dates.length+' 个交易日（中金所 XML 按日可回补）；会员排名与 delta 分布为当日快照，逐日累积从入库起。'
  ]);
}
$$('#dv-prod button').forEach(b=>b.addEventListener('click',()=>{
  $$('#dv-prod button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.prod=b.dataset.p;draw();
}));
$$('#dv-opt button').forEach(b=>b.addEventListener('click',()=>{
  $$('#dv-opt button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.opt=b.dataset.o;kpi();dec();drawPcr();
}));
$$('#dv-range button').forEach(b=>b.addEventListener('click',()=>{
  $$('#dv-range button').forEach(z=>z.classList.remove('on'));b.classList.add('on');
  W.range=+b.dataset.r;drawBasis();drawAnn();drawPcr();drawOi();
}));
function draw(){
  const el=$('#dv-cover');if(el)el.textContent='CFFEX '+dates.length+' 个交易日 · '+dateFmt(dates[0]||'')+' ~ '+dateFmt(dates[dates.length-1]||'');
  kpi();dec();drawBasis();drawAnn();drawPcr();drawOi();drawRank();drawTab();
}
caveat();
MODS.derivatives={draw};
})();
