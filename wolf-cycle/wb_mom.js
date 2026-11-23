/* ===== 08 散户反向指数（宝妈指数 / Mom Index）=====
   数据：MOM = JSON#MOM（fetch_mom.py 产出：东财股吧真实帖子 + mom-index v0.1 词库/权重）。 */
(function(){
const M = JSON.parse((document.getElementById('MOM')||{textContent:'{}'}).textContent);
const META = M.meta || {}, SNAP = M.snapshot || {};
const SECTORS = (META.sectors) || {nasdaq:'纳斯达克',gold:'黄金',cpo:'CPO通信',semiconductor:'半导体'};
let RANGE = 0;
let CUR = 'overall';

function hist(k){
  const a=(M.history||{})[k]||[];
  return (RANGE && a.length>RANGE) ? a.slice(-RANGE) : a;
}
function dates(){ return hist('overall').map(r=>r.date); }

function tone(v){
  if(v==null) return C.dim;
  if(v>=75) return C.down;
  if(v>=60) return C.accent;
  if(v<=20) return C.blue;
  return C.dim;
}
function dec(){
  const last=M.latest||{}, s=last.sectors||{};
  const v=SNAP.overall, p=SNAP.percentile;
  let level='散户情绪：正常区间', t=C.dim;
  if(v>=75){level='极度狂热：擦鞋童时刻（反向警戒）';t=C.down;}
  else if(v>=60){level='高度警惕：小白大量涌入';t=C.accent;}
  else if(v<=20){level='极度冷清：小白沉默（可能近底）';t=C.blue;}
  const per=Object.keys(SECTORS).map(k=>SECTORS[k]+' '+xf((s[k]||{}).index,1)).join(' / ');
  const body=
    '<b>综合散户反向指数</b>＝ <b style="color:'+tone(v)+'">'+xf(v,1)+'</b>（'+esc(SNAP.interpretation||'—')+'），'+
    '四板块等权平均：'+per+'。<br>'+
    '小白买入子指数 '+xf(SNAP.buyAvg,1)+' / 卖出 '+xf(SNAP.sellAvg,1)+
    '（样本 '+xf0(last.sectors?Object.values(last.sectors).reduce((a,r)=>a+(r.postsUsed||0),0):0)+' 条当日股吧帖子）。'+
    '全样本分位 '+(p!=null?xf(p,1)+'%':'样本不足 20 日，暂不输出')+'。<br>'+
    '<span style="color:#8892a0">反向含义：</span>指数越高＝小白讨论越集中、情绪越极端＝市场越危险；'+
    '越低＝散户沉默，历史上更接近底部区域。<b>这是研究性观察指标，不是买卖指令</b>——'+
    '关键词规则为 v0.1 可读基线，未经充分实证验证，请与狼波/STH/EdsonVIX 合读。';
  XDEC('MO_DEC','散户反向判读 · '+dateFmt((SNAP.asof||'').replace(/-/g,'')),level,t,body,
    ['<span class="tag real">股吧帖子真实</span>','<span class="tag proxy">词库判定为规则近似</span>','<span class="tag na">历史不可回补</span>']);
}
function kpi(){
  const last=M.latest||{}, s=last.sectors||{};
  const parts=Object.keys(SECTORS).map(k=>[SECTORS[k],xf((s[k]||{}).index,1),'反向热度']);
  XKPI('MO_KPI',[
    ['综合指数',xf(SNAP.overall,1),'四板块等权',tone(SNAP.overall)===C.down?'down':(tone(SNAP.overall)===C.blue?'blue':'amber')],
    ['判读',esc(SNAP.interpretation||'—').split('：')[0],'越高越危险'],
    ['买入子指数',xf(SNAP.buyAvg,1),'小白买入倾向'],
    ['卖出子指数',xf(SNAP.sellAvg,1),'小白卖出倾向'],
    ...parts.slice(0,2),
    ['样本日数',xf0(SNAP.recordCount)+' 日','逐日累积',SNAP.recordCount<20?'amber':''],
    ['采集帖子',xf0(Object.values(s).reduce((a,r)=>a+(r.postsUsed||0),0))+' 条','当日股吧']
  ]);
}
function drawMain(){
  const d=dates();
  XTS('mo-main',d,[
    {name:'综合指数',data:hist('overall').map(r=>r.index),color:C.accent,width:2},
    {name:'狂热警戒 75',data:d.map(()=>75),color:C.down,dash:[4,4]},
    {name:'警惕线 60',data:d.map(()=>60),color:C.accent,dash:[2,4]},
    {name:'冷清线 20',data:d.map(()=>20),color:C.blue,dash:[4,4]}
  ],{fmt:f1,fmt2:f1,pad:{l:48,r:44,t:20,b:24},_sxgeo:true});
}
function drawSectors(){
  const d=hist('overall').map(r=>r.date);
  const colors=[C.white,C.blue,C.purple,C.up];
  const rows=Object.keys(SECTORS).map((k,i)=>({
    name:SECTORS[k],data:hist(k).map(r=>r.index),color:colors[i%4]
  }));
  XTS('mo-sectors',d,rows,{fmt:f1,fmt2:f1,pad:{l:48,r:52,t:20,b:24},_sxgeo:true});
}
function drawBuySell(){
  const recs=(M.records||[]).slice(RANGE? -RANGE:0);
  XTS('mo-bs',recs.map(r=>r.date),[
    {name:'买入子指数',data:recs.map(r=>r.buyAvg),color:C.up,type:'bar'},
    {name:'卖出子指数',data:recs.map(r=>r.sellAvg),color:C.down,type:'bar'}
  ],{zero:true,fmt:f1,fmt2:f1,pad:{l:48,r:20,t:20,b:24},_sxgeo:true});
}
function table(){
  const tb=document.querySelector('#mo-tab tbody'); if(!tb) return;
  const recs=(M.records||[]).slice().reverse().slice(0,20);
  tb.innerHTML=recs.map(r=>{
    const s=r.sectors||{};
    return '<tr><td class="l">'+esc(r.date)+'</td><td>'+xf(r.overall,1)+'</td>'+
      Object.keys(SECTORS).map(k=>'<td>'+xf((s[k]||{}).index,1)+'</td>').join('')+
      '<td>'+xf(r.buyAvg,1)+'</td><td>'+xf(r.sellAvg,1)+'</td></tr>';
  }).join('');
}
function posts(){
  const el=document.getElementById('MO_POSTS'); if(!el) return;
  const s=(M.latest||{}).sectors||{};
  let h='';
  Object.keys(SECTORS).forEach(k=>{
    const r=s[k]||{}, ps=r.topPosts||[];
    h+='<div class="grp"><b>'+esc(SECTORS[k])+'</b>（指数 '+xf(r.index,1)+'）<br>'+
      (ps.length?ps.slice(0,3).map(p=>'<span class="p">「'+esc(p.title)+'」<i>'+esc(p.level)+' '+xf(p.score,0)+'分</i></span>').join('<br>')
       :'<span style="color:#8892a0">当日无小白帖样本</span>')+'</div>';
  });
  el.innerHTML=h;
}
function cover(){
  const el=document.getElementById('mo-cover'); if(!el) return;
  el.textContent='样本 '+xf0(SNAP.recordCount)+' 日（'+(META.lockedBase||'—')+' 起逐日累积，历史不可回补）· 股吧 4 板块';
}
function caveat(){
  const el=document.getElementById('MO_CAVEAT'); if(!el) return;
  el.innerHTML='<b>口径与边界。</b><ul>'+
    (META.disclosure||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+
    '<li>参考仓库 <span class="mono">mihang123/mom-index</span>（MIT）为公开框架版 v0.1，其 <span class="mono">data/</span> 为合成演示数据，本栏只用真实采集结果。</li>'+
    '<li>反向指标的有效性需要长期样本验证；当前样本 '+(SNAP.recordCount||0)+' 日，<b>不足以做任何统计推断</b>。</li>'+
    '<li>本栏全部内容为行为金融研究观察，不构成投资建议。</li></ul>';
}
function draw(){
  if(!(M.records||[]).length){const el=document.getElementById('mo-cover');if(el)el.textContent='无数据';return;}
  dec();kpi();drawMain();drawSectors();drawBuySell();table();posts();cover();caveat();
}
document.querySelectorAll('#mo-range button').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('#mo-range button').forEach(x=>x.classList.remove('on'));
    b.classList.add('on'); RANGE=+b.dataset.r||0;
    drawMain();drawSectors();drawBuySell();
  });
});
draw();
MODS.mom={draw};
})();
