/* ===== 06 波动率与恐慌指数（EdsonVIX）=====
   数据：V = JSON#VIX（fetch_vix.py 产出，中金所结算价真实，方差互换法自编）。 */
(function(){
const V = JSON.parse((document.getElementById('VIX')||{textContent:'{}'}).textContent);
const rows = V.rows || [];
const snap = V.snapshot || {};
const causal = V.causal || {};
const META = V.meta || {};
const UNDER_NAME = {IO:'沪深300', HO:'上证50', MO:'中证1000'};
let RANGE = 0; // 0=全部

function dates(){ return rows.map(r=>r.date); }
function inRange(arr){
  if(!RANGE || arr.length<=RANGE) return arr;
  return arr.slice(-RANGE);
}
function ioVix(){ return rows.map(r=>((r.IO)||{}).vix); }
function hv(){ return rows.map(r=>r.hv30); }
function dec(){
  const last = rows[rows.length-1] || {};
  const io = last.IO || {};
  const v = io.vix, pct = snap.percentile, hv30 = last.hv30;
  const prem = (v!=null && hv30!=null) ? v-hv30 : null;
  let level='波动率：中性', tone=C.dim;
  if(pct!=null){
    if(pct>=90){level='恐慌：高温（≥90 分位）';tone=C.down;}
    else if(pct>=75){level='波动：偏高（75-90 分位）';tone=C.accent;}
    else if(pct<=25){level='波动：低温（≤25 分位，自满风险）';tone=C.blue;}
  }
  const c5=(causal.fwd||{})['5'], c20=(causal.fwd||{})['20'];
  const body =
    '<b>EdsonVIX（'+(io.near||'')+'+'+(io.second||'')+' 双月 30 日口径）</b>＝ <b style="color:'+tone+'">'+xf(v,2)+'</b>'+
    '，全样本分位 <b>'+xf(pct,1)+'%</b>；30 日已实现波动率 HV30 ＝ '+xf(hv30,2)+
    '，恐慌溢价（VIX−HV30）<b style="color:'+((prem||0)>0?C.down:C.up)+'">'+((prem||0)>0?'+':'')+xf(prem,2)+'</b>。'+
    'Skew（90%K Put IV − 110%K Call IV）＝ <b>'+xf(io.skew,2)+'</b>'+(io.skew!=null&&io.skew>3?'（尾部保护偏贵）':'')+'。'+
    '对照：<b>HO</b> '+xf((last.HO||{}).vix,2)+' / <b>MO</b> '+xf((last.MO||{}).vix,2)+
    '（'+UNDER_NAME.HO+'低、'+UNDER_NAME.MO+'高为常态结构）。<br>'+
    '<span style="color:#8892a0">因果检验（expanding 90 分位、首次进入去重）：</span>'+
    (c5&&c20
      ? '历史触发 '+xf0(causal.entries||0)+' 次，其后 5 日胜率 '+xf(c5.winRate,1)+'%（基准 '+xf(c5.baseline,1)+'%，p='+c5.p+'）、20 日 '+xf(c20.winRate,1)+'%（p='+c20.p+'）'+
        (c20.sig?'<b style="color:'+C.accent+'">20 日显著</b>':'<b>均不显著</b>——恐慌见底反弹在本样本不构成可靠规律')
      : '样本不足或序列过短');
  XDEC('VX_DEC','恐慌指数判读 · '+dateFmt(last.date||''),level,tone,body,
    ['<span class="tag real">中金所结算价真实</span>','<span class="tag proxy">自编指数 · 方法同 CBOE</span>','<span class="tag na">非官方 iVIX 复刻</span>']);
}
function kpi(){
  const last=rows[rows.length-1]||{}, io=last.IO||{};
  const prev=rows[rows.length-2]||{}, iop=prev.IO||{};
  const chg=(io.vix!=null&&iop.vix!=null)?io.vix-iop.vix:null;
  const prem=(io.vix!=null&&last.hv30!=null)?io.vix-last.hv30:null;
  XKPI('VX_KPI',[
    ['EdsonVIX',xf(io.vix,2),'沪深300·30日隐含',chg!=null?xcls(chg):''],
    ['较前日',((chg||0)>0?'+':'')+xf(chg,2),'',''],
    ['全样本分位',xf(snap.percentile,1)+'%','样本 '+xf0(snap.seriesDays)+' 日',snap.percentile>=90?'down':(snap.percentile<=25?'blue':'amber')],
    ['恐慌溢价 VIX−HV30',((prem||0)>0?'+':'')+xf(prem,2),'隐含 − 已实现',(prem||0)>5?'down':''],
    ['Skew',xf(io.skew,2),'90%K Put − 110%K Call',(io.skew||0)>4?'amber':''],
    ['HO 上证50',xf((last.HO||{}).vix,2),'对照'],
    ['MO 中证1000',xf((last.MO||{}).vix,2),'对照'],
    ['区间统计',xf(snap.min,1)+' ~ '+xf(snap.max,1),'中位 '+xf(snap.median,1)]
  ]);
}
function drawMain(){
  const d=inRange(dates()), v=inRange(ioVix()), h=inRange(hv());
  XTS('vx-main',d,[
    {name:'EdsonVIX',data:v,color:C.accent},
    {name:'HV30 已实现(对照)',data:h,color:C.blue,dash:[4,4]}
  ],{fmt:f2,fmt2:f2,pad:{l:48,r:64,t:18,b:24}});
}
function drawPct(){
  // 分位通道：滚动全样本分位
  const vs=ioVix();
  const pct=vs.map((v,i)=>{
    if(v==null) return null;
    const hist=vs.slice(0,i+1).filter(x=>x!=null);
    return 100*hist.filter(x=>x<=v).length/hist.length;
  });
  XTS('vx-pct',inRange(dates()),[
    {name:'VIX 分位',data:inRange(pct),color:C.purple},
    {name:'90 分位',data:inRange(pct).map(()=>90),color:C.down,dash:[4,4]},
    {name:'25 分位',data:inRange(pct).map(()=>25),color:C.blue,dash:[4,4]}
  ],{fmt:f1,fmt2:f1,pad:{l:48,r:24,t:18,b:24}});
}
function drawCompare(){
  const d=inRange(dates());
  XTS('vx-cmp',d,[
    {name:'IO 沪深300',data:inRange(rows.map(r=>((r.IO)||{}).vix)),color:C.accent},
    {name:'HO 上证50',data:inRange(rows.map(r=>((r.HO)||{}).vix)),color:C.blue},
    {name:'MO 中证1000',data:inRange(rows.map(r=>((r.MO)||{}).vix)),color:C.up}
  ],{fmt:f2,fmt2:f2,pad:{l:48,r:24,t:18,b:24}});
}
function drawSkew(){
  XTS('vx-skew',inRange(dates()),[
    {name:'Skew（Put−Call IV）',data:inRange(rows.map(r=>((r.IO)||{}).skew)),color:C.purple,type:'bar'}
  ],{zero:true,fmt:f2,fmt2:f2,pad:{l:48,r:24,t:18,b:24}});
}
function table(){
  const tb=document.querySelector('#vx-tab tbody'); if(!tb) return;
  const tail=rows.slice(-22).reverse();
  tb.innerHTML=tail.map(r=>{
    const io=r.IO||{};
    return '<tr><td class="l">'+esc(r.date)+'</td>'+
      '<td>'+xf(io.vix,2)+'</td><td>'+xf(r.hv30,2)+'</td>'+
      '<td>'+((io.vix!=null&&r.hv30!=null)?xf(io.vix-r.hv30,2):'—')+'</td>'+
      '<td>'+xf(io.skew,2)+'</td><td>'+xf((r.HO||{}).vix,2)+'</td><td>'+xf((r.MO||{}).vix,2)+'</td></tr>';
  }).join('');
}
function cover(){
  const el=document.getElementById('vx-cover'); if(!el) return;
  el.textContent='样本 '+rows.length+' 日（'+(rows[0]||{}).date+' ~ '+(rows[rows.length-1]||{}).date+
    '）· 近月+'+'次月 → 30 日插值 · r=1.8% 固定';
}
function caveat(){
  const el=document.getElementById('VX_CAVEAT'); if(!el) return;
  const disc=(META.disclosure||[]).map(x=>'<li>'+esc(x)+'</li>').join('');
  el.innerHTML='<b>口径与边界。</b><ul>'+disc+
    '<li>与第 10 栏「衍生品」的关系：本栏用同一份中金所 XML 的<b>合约级结算价</b>自算隐含方差，是真实 IV 的合规推导；第 10 栏的「IV 未接入」指其页面未展示 IV 曲面，两者不矛盾。</li>'+
    '<li>VIX 飙升只说明期权市场为未来波动定价变贵，方向（涨跌）不含在其中；A 股涨跌停制度会吸收极端波动，与美股 VIX 的联动逻辑不同。</li>'+
    '<li>因果检验结论以本栏数据为准：'+((causal.fwd||{})['20']?('20 日胜率 '+causal.fwd['20'].winRate+'%（p='+causal.fwd['20'].p+'，'+(causal.fwd['20'].sig?'显著':'不显著')+'）'):'样本不足')+'。</li>'+
    '<li>本栏全部内容为统计描述，不构成投资建议。</li></ul>';
}
function draw(){
  if(!rows.length){const el=document.getElementById('vx-cover');if(el)el.textContent='无数据';return;}
  dec();kpi();drawMain();drawPct();drawCompare();drawSkew();table();cover();caveat();
}
document.querySelectorAll('#vx-range button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#vx-range button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    RANGE=+b.dataset.r||0;
    drawMain();drawPct();drawCompare();drawSkew();
  });
});
draw();
MODS.vix={draw};
})();
