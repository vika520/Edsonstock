/* ===== 09 每日复盘：文章列表（图文）+ 全文详情 =====
   数据来自 build_review.py 生成的 data/reviews.json，纯 DOM 渲染，无 canvas。
   缩略图＝当日时间（年月 / 日 / 周几）＋ 近 20 日上证迷你走势。
*/
(function(){
const R = JSON.parse(document.getElementById('REVIEWS').textContent);
const LIST = R.reviews || [];
let sel = 0;

function spark(arr){
  if(!arr || arr.length < 2) return '';
  const lo=Math.min.apply(null,arr), hi=Math.max.apply(null,arr), w=56, h=14;
  const pts=arr.map((v,i)=>[(i/(arr.length-1)*w).toFixed(1),
                           (h-2-(v-lo)/(hi-lo||1)*(h-4)).toFixed(1)]);
  const col=arr[arr.length-1]>=arr[0]?C.up:C.down;
  return '<svg viewBox="0 0 56 14" preserveAspectRatio="none" aria-hidden="true">'+
         '<polyline points="'+pts.map(p=>p.join(',')).join(' ')+
         '" fill="none" stroke="'+col+'" stroke-width="1.3" stroke-linejoin="round"/></svg>';
}
function thumb(r){
  const ix=r.index||{}, chg=ix.chg;
  return '<div class="rv-thumb" title="'+esc(r.date)+' · '+esc(r.weekday)+'">'+
    '<div class="ym">'+esc(r.yearMonth)+'</div>'+
    '<div class="dd" style="color:'+(chg==null?C.accent:(chg>=0?C.up:C.down))+'">'+esc(r.dayNum)+'</div>'+
    spark(ix.spark)+'</div>';
}
function kpiChip(k){
  return '<span class="kp">'+esc(k.k)+'<b>'+esc(k.v)+'</b></span>';
}
function bulletBox(title,horizon,stance,points,triggers,falsify,tone){
  return '<div class="box"><div class="h">'+esc(title)+
    ' <span style="font-size:10px;color:var(--dim2);font-weight:400">'+esc(horizon)+'</span></div>'+
    '<div style="font-size:11px;color:'+(tone||C.accent)+';margin-bottom:6px">立场：'+esc(stance)+'</div>'+
    '<div class="lbl">观察要点</div><ul>'+points.map(z=>'<li>'+esc(z)+'</li>').join('')+'</ul>'+
    '<div class="lbl">触发条件</div><ul>'+triggers.map(z=>'<li>'+esc(z)+'</li>').join('')+'</ul>'+
    '<div class="lbl">证伪场景</div><ul>'+falsify.map(z=>'<li>'+esc(z)+'</li>').join('')+'</ul></div>';
}
function renderList(){
  $('#rv-count').textContent='共 '+LIST.length+' 篇 · 每交易日盘后自动生成';
  $('#rv-count2').textContent=LIST.length+' 篇';
  if(!LIST.length){
    $('#rv-list').innerHTML='<div style="color:var(--dim2);font-size:11px;padding:14px 4px;line-height:1.8">'+
      '暂无复盘报告。首个交易日盘后将由 build_review.py 自动生成；历史日期不做回溯生成（板块只有当日快照，回填会产生未来函数）。</div>';
    return;
  }
  $('#rv-list').innerHTML=LIST.map((r,i)=>{
    const chg=r.index&&r.index.chg;
    return '<div class="rv-item'+(i===sel?' on':'')+'" data-i="'+i+'">'+thumb(r)+
      '<div style="min-width:0;flex:1">'+
        '<div class="rv-t">'+esc(r.title)+'</div>'+
        '<div class="rv-d">'+esc(r.date)+' · '+esc(r.weekday)+' · 上证 '+
          '<span class="'+(chg==null?'':(chg>=0?'up':'down'))+'">'+sgn(chg)+'</span>'+
          ' · '+DATA_VIEW_COUNT+'栏汇总</div>'+
        '<div class="rv-tags">'+r.tags.slice(0,3).map(t=>'<span>'+esc(t)+'</span>').join('')+
          '<span>+'+(r.tags.length-3)+'</span></div>'+
      '</div></div>';
  }).join('')+
  '<div class="rv-next"><div class="d">NEXT · 待生成</div>'+
    '<div class="t">下一交易日盘后自动生成</div>'+
    '<div class="s">固定规则 · '+DATA_VIEW_COUNT+'栏同源 · 按日期去重<br>历史日期不回填（避免未来函数）</div></div>';
  $$('#rv-list .rv-item').forEach(el=>el.addEventListener('click',()=>{
    sel=+el.dataset.i; renderList(); renderDetail();
    $('#rv-detail').scrollIntoView({block:'nearest',behavior:'smooth'});
  }));
}
function renderDetail(){
  if(!LIST.length){$('#rv-detail').innerHTML='<div class="hint">暂无正文</div>';return;}
  const r=LIST[sel], ix=r.index||{}, chg=ix.chg;
  $('#rv-meta').textContent=esc(r.date)+' · '+esc(r.weekday)+' · 生成于 '+esc((r.createdAt||'').slice(0,16).replace('T',' '));
  let h='';
  h+='<h2 class="rv-h1">'+esc(r.title)+'</h2>';
  const snap=[
    ['上证收盘',f2(ix.close)],['涨跌幅',sgn(chg)],['成交额',f0(ix.amount)+' 亿'],
    ['涨 / 跌 / 平',f0(ix.up)+' / '+f0(ix.down)+' / '+f0(ix.flat)],
    ['最高 / 最低',f2(ix.high)+' / '+f2(ix.low)],['标的数',f0(ix.total)]
  ];
  h+='<div class="rv-kpis">'+snap.map(z=>'<div class="kpi"><div class="k">'+z[0]+
      '</div><div class="v '+(z[0]==='涨跌幅'?(chg==null?'':(chg>=0?'up':'down')):'')+'">'+z[1]+'</div></div>').join('')+'</div>';
  h+='<div class="rv-sum">'+esc(r.digest)+'</div>';
  h+='<div style="font-size:11px;color:var(--accent);margin:14px 0 8px;letter-spacing:.6px">一、'+DATA_VIEW_COUNT+'栏数据汇总（第 04 栏 TMT 交易拥挤度单列一节）</div>';
  (r.sections||[]).forEach((s,i)=>{
    h+='<div class="rv-sec"><div class="h"><span class="n">'+String(i+1).padStart(2,'0')+'</span>'+
       '<span class="t" style="font-size:12px;font-weight:700">'+esc(s.name)+'</span>'+
       '<span class="spacer" style="flex:1"></span>'+
       '<span class="pill" style="background:'+(s.tone==='up'?'#e8453c22':s.tone==='down'?'#22a06b22':'#4b9fea22')+
         ';color:'+(s.tone==='up'?C.up:s.tone==='down'?C.down:C.blue)+'">'+
         (s.tone==='up'?'偏强':s.tone==='down'?'偏弱':'中性')+'</span></div>'+
       '<div class="b"><div class="kpis">'+(s.kpis||[]).map(kpiChip).join('')+'</div>'+
       '<p>'+esc(s.text)+'</p></div></div>';
  });
  h+='<div style="font-size:11px;color:var(--accent);margin:16px 0 8px;letter-spacing:.6px">二、操作参考（条件化，不构成建议）</div>';
  const st=r.shortTerm||{}, lt=r.longTerm||{};
  h+='<div class="rv-adv">'+
     bulletBox('短线',st.horizon||'1~3 个交易日',st.stance,st.points||[],st.triggers||[],st.falsify||[],C.blue)+
     bulletBox('中长线',lt.horizon||'1~3 个月',lt.stance,lt.points||[],lt.triggers||[],lt.falsify||[],C.accent)+'</div>';
  const hm=(r.meta||{}).history||{};
  if(hm.available&&hm.available.length){
    h+='<div style="font-size:11px;color:var(--accent);margin:16px 0 8px;letter-spacing:.6px">三、长历史数据可得性清单（实测结论）</div>';
    h+='<div class="rv-sec"><div class="b"><p style="margin-bottom:9px;color:#c9a24c">'+esc(hm.note||'')+'</p>'+
       '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
       '<div><div style="font-size:11px;font-weight:700;color:'+C.down+';margin-bottom:6px">已按日回补 · 现在就有历史</div>'+
       hm.available.map(z=>'<div style="font-size:11px;line-height:1.7;margin:0 0 7px;padding-left:9px;border-left:2px solid '+C.down+'">'+
         '<b>'+esc(z.item)+'</b> <span class="mono" style="color:var(--acc)">'+esc(z.days)+' 日</span>'+
         '<div style="color:var(--dim2);font-size:10.5px">'+esc(z.source)+'</div></div>').join('')+'</div>'+
       '<div><div style="font-size:11px;font-weight:700;color:'+C.up+';margin-bottom:6px">确认拿不到历史 · 只有当日 / 逐日累积</div>'+
       (hm.unavailable||[]).map(z=>'<div style="font-size:11px;line-height:1.7;margin:0 0 7px;padding-left:9px;border-left:2px solid '+C.up+'">'+
         '<b>'+esc(z.item)+'</b><div style="color:var(--dim2);font-size:10.5px">'+esc(z.reason)+'</div>'+
         '<div style="color:'+C.down+';font-size:10.5px">替代：'+esc(z.alternative)+'</div></div>').join('')+'</div>'+
       '</div></div></div>';
  }
  h+='<div style="font-size:11px;color:var(--accent);margin:16px 0 8px;letter-spacing:.6px">四、生成机制与免责</div>';
  h+='<div class="rv-sec"><div class="b"><p style="margin-bottom:8px">'+esc((r.meta||{}).engine||'')+
     '；数据源：'+esc(((r.meta||{}).sources||[]).join('、'))+'。</p>'+
     ((r.meta||{}).degraded
       ? '<p style="margin-bottom:8px;color:#e6be5d">注意：数据降级，各源截止日期 '+
         esc(JSON.stringify(r.meta.dataAsOf||{}))+'，对应栏目读数沿用上一版。</p>' : '')+
     '<ul style="margin:0;padding-left:16px">'+
     ((r.meta||{}).caveat||[]).map(z=>'<li style="font-size:11px;line-height:1.85;color:var(--dim);margin:3px 0">'+esc(z)+'</li>').join('')+
     '</ul></div></div>';
  $('#rv-detail').innerHTML=h;
}
function renderCaveat(){
  $('#RV_CAVEAT').innerHTML='<b>复盘的边界</b><ul>'+
    '<li>报告由 <span class="mono">build_review.py</span> 用固定规则从本地数据生成，<b>不调用大模型、不联网</b>，每交易日盘后追加一篇，按日期覆盖去重。</li>'+
    '<li><b>不回填历史</b>：板块只有当日横截面快照，用今天的板块去复盘过去会产生未来函数；因此文章列表从首篇开始逐日累积。</li>'+
    '<li>'+DATA_VIEW_COUNT+' 栏读数与各栏页面同源；第 12 栏 ERP 的全部数字来自 <span class="mono">erp.json</span> 锁定快照，'+
    '<b>只读不复算</b>；板块 / ETF / 资金流 / TMT 成交占比均为<b>代理口径</b>；新增 6 栏中两融 / 中金所 / 涨跌停池 / 行业 PE / 解禁 / 跨市场为真实公开数据，'+
    '但 ETF 日度份额是量价反推估计、期权 IV 未接入、TMT 同口径占比历史与炸板率/跌停家数历史实测不可回补；'+
    '行业 PE 中位数/四分位、涨停/连板/晋级率、外部环境三类长历史已分别按日回补 250 / 250 / 460 日；'+
    '建议只给「条件 + 触发 + 证伪」，不含个股与点位预测。</li>'+
    '<li>新增栏目由 <span class="mono">views.json</span> 统一排序，复盘永远排在菜单末尾（当前 VIEW '+VIEW_NO('review')+'）。</li>'+
    '<li>已完成的严格因果检验显示：双冰点次日胜率 55.6% 对基准 52.5% 不显著；威科夫 Phase C 结构兑现率 25%、p=0.256 不显著。报告据此对两类信号保持克制。</li>'+
    '<li><b>本文不是投资建议</b>，不构成任何证券买卖依据。市场有风险，决策请自行判断。</li></ul>';
}
function draw(){renderList();renderDetail();}
function init(){
  renderCaveat();
  MODS.review={draw};
  draw();
}
init();
})();
