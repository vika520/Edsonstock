/* ===== 6 类补充栏目共享内核：数据、通用 KPI / 判读 / 时序图 / 横条图 ===== */
'use strict';
const X  = JSON.parse(document.getElementById('EXTRAS').textContent);
/* HIST：一次性回补的长历史（行业 PE 250 日 / 涨停连板 250 日 / 跨市场 460 日）。
   与 EXTRAS 的「当日快照 + 逐日累积」分开存放，避免盘后更新覆盖已回补的历史。 */
const H  = JSON.parse((document.getElementById('HIST')||{textContent:'{}'}).textContent);
const HV = H.valuation || {}, HS = H.sentiment || {}, HC = H.cross || {};
const XM = X.meta || {};
const XD = X.derivatives || {}, XL = X.leverage || {}, XE = X.etfFlow || {},
      XS = X.sentiment || {}, XV = X.valuation || {}, XEV = X.events || {},
      XC = X.cross || {};

const xnum = v => (v == null || !isFinite(v)) ? null : +v;
const xf = (v, n) => (v == null || !isFinite(v)) ? '—' : Number(v).toFixed(n == null ? 2 : n);
const xf0 = v => (v == null || !isFinite(v)) ? '—' : Math.round(v).toLocaleString('en-US');
const xsgn = v => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(2);
const xcls = v => (v == null || !isFinite(v)) ? '' : (v > 0 ? 'up' : (v < 0 ? 'down' : ''));

function XKPI(id, items) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = items.map(z =>
    '<div class="kpi"><div class="k">' + z[0] + '</div>' +
    '<div class="v ' + (z[3] || '') + '">' + z[1] + '</div>' +
    '<div class="s">' + z[2] + '</div></div>').join('');
}
function XDEC(id, title, level, tone, body, tags) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML =
    '<div class="card-h"><span class="t">' + title + '</span><span class="spacer"></span>' +
    (tags || []).join(' ') + '</div>' +
    '<div class="card-b" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">' +
    '<div style="flex:0 0 200px"><div class="k" style="font-size:10px;color:#5b6470">结构判读</div>' +
    '<div style="font-size:16px;font-weight:700;color:' + (tone || C.txt) +
    ';margin-top:7px;line-height:1.45">' + level + '</div></div>' +
    '<div style="flex:1;min-width:320px;font-size:12px;line-height:1.9;color:#c3cbd6">' + body +
    '</div></div>';
}
function XCAV(id, title, list) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = '<b>' + title + '</b><ul>' + list.map(v => '<li>' + v + '</li>').join('') + '</ul>';
}
function XEMPTY(id, msg) {
  const o = CV(id); if (!o) return;
  txt(o.x, msg || '数据不足', o.w / 2, o.h / 2, C.dim2, 'center', 11);
}

/* 通用横条图：rows = [{label, value, color, right}] */
function XBAR(id, rows, opts) {
  opts = opts || {};
  const o = CV(id); if (!o) return;
  if (!rows || !rows.length) { XEMPTY(id, opts.empty || '暂无数据'); return; }
  const g = frame(o, opts.pad || {l: 112, r: 74, t: 14, b: 22}), x = o.x;
  const vals = rows.map(r => xnum(r.value)).filter(v => v != null);
  if (!vals.length) { XEMPTY(id, '暂无有效数值'); return; }
  const centered = !!opts.centered;
  let lo = centered ? -Math.max(...vals.map(Math.abs)) * 1.12 : Math.min(0, Math.min(...vals));
  let hi = centered ? Math.max(...vals.map(Math.abs)) * 1.12 : Math.max(...vals) * 1.12;
  if (hi === lo) hi = lo + 1;
  const X = v => g.L + (v - lo) / (hi - lo) * g.W;
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * k / 3;
    hline(x, g.L, g.L + g.W, g.B - k / 3 * g.H, k === 0 ? C.line2 : C.line);
    txt(x, (opts.fmt || f1)(v), g.L - 7, g.B - k / 3 * g.H, C.dim2, 'right');
  }
  if (centered) vline(x, g.T, g.B, X(0), C.line2);
  const bh = g.H / rows.length;
  rows.forEach((r, i) => {
    const y = g.T + i * bh + bh * 0.18, h = bh * 0.64, v = xnum(r.value);
    if (v == null) return;
    const a = Math.min(X(0), X(v)), b = Math.max(X(0), X(v));
    rect(x, centered ? a : g.L, y, centered ? Math.max(1, b - a) : Math.max(1, X(v) - g.L), h,
         (r.color || (v >= 0 ? C.up : C.down)) + 'bb');
    txt(x, r.label, g.L - 7, y + h / 2, C.txt, 'right');
    txt(x, (opts.labelFmt || f1)(v) + (opts.unit || ''),
        (centered ? (v >= 0 ? b : a) : X(v)) + 5, y + h / 2, C.txt, 'left');
    if (r.right) txt(x, r.right, g.L + g.W + 6, y + h / 2, C.dim2, 'right');
  });
}

/* 通用时序图：series = [{name,data,color,type:'line'|'bar',axis:'left'|'right',width}] */
function XTS(id, dates, series, opts) {
  opts = opts || {};
  const o = CV(id); if (!o) return;
  if (!dates || !dates.length) { XEMPTY(id, opts.empty || '历史序列自入库首日起累积，当前样本不足'); return; }
  const g = frame(o, opts.pad || {l: 54, r: 54, t: 16, b: 24}), x = o.x;
  if (opts._sxgeo && o.el) o.el._sxGeo = g;   // STH 栏滚轮缩放锚定用（几何挂 canvas 元素，CV 返回的是临时包装对象）
  const L = series.filter(s => s.axis !== 'right'), R = series.filter(s => s.axis === 'right');
  const flat = a => a.reduce((acc, s) => acc.concat((s.data || []).filter(v => v != null && isFinite(v))), []);
  let lv = flat(L), rv = flat(R);
  if (!lv.length && !rv.length) { XEMPTY(id, '暂无有效数值'); return; }
  let lo = Math.min.apply(null, lv.length ? lv : [0]), hi = Math.max.apply(null, lv.length ? lv : [1]);
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  let p = (hi - lo) * 0.12 || Math.max(1, Math.abs(hi) * 0.1); lo -= p; hi += p;
  let rlo = rv.length ? Math.min.apply(null, rv) : 0, rhi = rv.length ? Math.max.apply(null, rv) : 1;
  let rp = (rhi - rlo) * 0.15 || 1; rlo -= rp; rhi += rp;
  const n = dates.length;
  const X = i => g.L + (i + 0.5) / n * g.W;
  const Y = (v, right) => {
    const a = right ? rlo : lo, b = right ? rhi : hi;
    return g.B - (v - a) / (b - a || 1) * g.H;
  };
  for (let k = 0; k <= 4; k++) {
    const y = g.B - k / 4 * g.H, v = lo + (hi - lo) * k / 4, vr = rlo + (rhi - rlo) * k / 4;
    hline(x, g.L, g.L + g.W, y, k === 0 ? C.line2 : C.line);
    txt(x, (opts.fmt || f1)(v), g.L - 7, y, C.dim2, 'right');
    if (R.length) txt(x, (opts.fmt2 || f1)(vr), g.L + g.W + 7, y, C.dim2, 'left');
  }
  if (opts.zero && lo < 0 && hi > 0) hline(x, g.L, g.L + g.W, Y(0, false), C.line2, [3, 3]);
  const bars = series.filter(s => s.type === 'bar');
  const bw = Math.max(1, Math.min(18, g.W / n * 0.7 / Math.max(1, bars.length)));
  series.forEach((s, si) => {
    const right = s.axis === 'right';
    if (s.type === 'bar') {
      const bi = bars.indexOf(s);
      (s.data || []).forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        const y0 = Y(0, right), y1 = Y(v, right);
        const px = X(i) - bw * bars.length / 2 + bi * bw;
        rect(x, px, Math.min(y0, y1), bw * 0.88, Math.max(1, Math.abs(y1 - y0)),
             (s.color || C.blue) + 'bb');
      });
    } else {
      const pts = [];
      (s.data || []).forEach((v, i) => { if (v != null && isFinite(v)) pts.push([X(i), Y(v, right)]); });
      poly(x, pts, s.color || C.white, s.width || 1.4, s.dash);
      if (s.dot) pts.forEach(q => { x.beginPath(); x.arc(q[0], q[1], 2.2, 0, Math.PI * 2); x.fillStyle = s.color; x.fill(); });
    }
    if (s.guide != null) hline(x, g.L, g.L + g.W, Y(s.guide, right), s.color || C.accent, [3, 3]);
    void si;
  });
  const step = Math.max(1, Math.round(n / 7));
  for (let i = 0; i < n; i += step) txt(x, dateFmt(dates[i]), X(i), g.B + 12, C.dim2, 'center');
  if (opts.note) txt(x, opts.note, g.L + 5, g.T + 8, C.dim2, 'left');
  // 事件标记：opts.markers = [{i|date, label, color, dy}]，画在对应 x 位置的顶部
  (opts.markers||[]).forEach(m=>{
    let mi = (m.i!=null) ? m.i : dates.indexOf(m.date);
    if (mi<0 || mi>=n) return;
    const mx=X(mi);
    // 找该位置 series 最高值作为文字基准
    let top=null;
    series.forEach(s=>{ const v=(s.data||[])[mi]; if(v!=null&&isFinite(v)){ const y=Y(v, s.axis==='right'); if(top==null||y<top) top=y; }});
    if(top==null) top=g.T+12;
    const col=m.color||C.purple;
    txt(x, m.label||'▼', mx, Math.max(g.T+14, top-14), col, 'center');
    x.beginPath(); x.arc(mx, Math.max(g.T+14, top-14)+11, 2.2, 0, Math.PI*2);
    x.fillStyle=col; x.fill();
  });
  const legend = series.filter(s => s.name).map((s, i) =>
    [s.name, s.color || CAT_COLOR[i % CAT_COLOR.length]]);
  legend.forEach((z, i) => {
    const px = g.L + 6 + i * 118;
    rect(x, px, g.T - 2, 9, 3, z[1]);
    txt(x, z[0], px + 13, g.T - 1, C.dim, 'left');
  });
  if (opts.hover !== false) bindHover(id, (mx) => {
    const i = clamp(Math.floor((mx - g.L) / g.W * n), 0, n - 1);
    if (mx < g.L || mx > g.L + g.W) return '';
    let h = '<b>' + dateFmt(dates[i]) + '</b>';
    series.forEach(s => {
      const v = (s.data || [])[i];
      h += '<br>' + s.name + '：<b>' + (v == null || !isFinite(v) ? '—' : (opts.fmt || f2)(v)) + '</b>';
    });
    return h;
  });
}

/* 表格快捷填充 */
function XTAB(id, rows) {
  const el = document.getElementById(id); if (!el) return;
  const body = el.querySelector('tbody');
  if (body) body.innerHTML = rows.join('');
}
