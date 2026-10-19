/* Gráficas SVG mínimas, sin dependencias. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceStep(range, n) {
    var raw = range / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function fmt(v) { var a = Math.abs(v); return a >= 1000 ? Math.round(v).toString() : a >= 10 ? (+v.toFixed(0)).toString() : a >= 1 ? (+v.toFixed(1)).toString() : (+v.toFixed(2)).toString(); }

  /*
   * opts: { series: [{x:[], y:[], color, width, dash, axis:1|2, fill}], xMin, xMax, yMin, yMax, y2Min, y2Max,
   *         xLabel, yLabel, y2Label, cursor (x), bands: [{x0,x1,color}], hlines: [{y,color,label}] }
   */
  function line(svg, o) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
    var hasY2 = o.series.some(function (s) { return s.axis === 2; });
    var m = { l: 46, r: hasY2 ? 46 : 12, t: 10, b: 34 };
    var pw = W - m.l - m.r, ph = H - m.t - m.b;
    function ext(axis) {
      var mn = Infinity, mx = -Infinity;
      o.series.forEach(function (s) { if ((s.axis || 1) !== axis) return; s.y.forEach(function (v) { if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }); });
      if (!isFinite(mn)) { mn = 0; mx = 1; }
      if (mx === mn) mx = mn + 1;
      return [mn, mx];
    }
    var xs = [];
    o.series.forEach(function (s) { xs = xs.concat([s.x[0], s.x[s.x.length - 1]]); });
    var xMin = o.xMin != null ? o.xMin : Math.min.apply(null, xs), xMax = o.xMax != null ? o.xMax : Math.max.apply(null, xs);
    var e1 = ext(1), y1Min = o.yMin != null ? o.yMin : Math.min(0, e1[0]), y1Max = o.yMax != null ? o.yMax : e1[1] * 1.08;
    var e2 = ext(2), y2Min = o.y2Min != null ? o.y2Min : Math.min(0, e2[0]), y2Max = o.y2Max != null ? o.y2Max : e2[1] * 1.08;
    function X(v) { return m.l + (v - xMin) / (xMax - xMin) * pw; }
    function Y1(v) { return m.t + ph - (v - y1Min) / (y1Max - y1Min) * ph; }
    function Y2(v) { return m.t + ph - (v - y2Min) / (y2Max - y2Min) * ph; }
    (o.bands || []).forEach(function (b) { el('rect', { x: X(b.x0), y: m.t, width: Math.max(0, X(b.x1) - X(b.x0)), height: ph, fill: b.color, opacity: b.opacity || 0.12 }, svg); });
    var st = niceStep(y1Max - y1Min, 5);
    for (var v = Math.ceil(y1Min / st) * st; v <= y1Max + 1e-9; v += st) {
      el('line', { x1: m.l, x2: m.l + pw, y1: Y1(v), y2: Y1(v), class: 'grid' }, svg);
      var t = el('text', { x: m.l - 6, y: Y1(v) + 4, 'text-anchor': 'end' }, svg); t.textContent = fmt(v);
    }
    if (hasY2) {
      var st2 = niceStep(y2Max - y2Min, 5);
      for (var v2 = Math.ceil(y2Min / st2) * st2; v2 <= y2Max + 1e-9; v2 += st2) {
        var t2 = el('text', { x: m.l + pw + 6, y: Y2(v2) + 4, 'text-anchor': 'start' }, svg); t2.textContent = fmt(v2);
      }
    }
    var sx = niceStep(xMax - xMin, 6);
    for (var u = Math.ceil(xMin / sx) * sx; u <= xMax + 1e-9; u += sx) {
      var tx = el('text', { x: X(u), y: m.t + ph + 15, 'text-anchor': 'middle' }, svg); tx.textContent = fmt(u);
    }
    el('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, class: 'axis' }, svg);
    el('line', { x1: m.l, x2: m.l, y1: m.t, y2: m.t + ph, class: 'axis' }, svg);
    if (o.xLabel) { var xl = el('text', { x: m.l + pw / 2, y: H - 4, 'text-anchor': 'middle' }, svg); xl.textContent = o.xLabel; }
    if (o.yLabel) { var yl = el('text', { x: 12, y: m.t + ph / 2, 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + (m.t + ph / 2) + ')' }, svg); yl.textContent = o.yLabel; }
    if (o.y2Label) { var y2l = el('text', { x: W - 8, y: m.t + ph / 2, 'text-anchor': 'middle', transform: 'rotate(90 ' + (W - 8) + ' ' + (m.t + ph / 2) + ')' }, svg); y2l.textContent = o.y2Label; }
    (o.hlines || []).forEach(function (h) {
      var Yf = h.axis === 2 ? Y2 : Y1;
      el('line', { x1: m.l, x2: m.l + pw, y1: Yf(h.y), y2: Yf(h.y), stroke: h.color, 'stroke-dasharray': '3 3', 'stroke-width': 1 }, svg);
      if (h.label) { var hl = el('text', { x: m.l + pw - 4, y: Yf(h.y) - 4, 'text-anchor': 'end' }, svg); hl.textContent = h.label; hl.style.fill = h.color; }
    });
    var clipId = 'c' + Math.random().toString(36).slice(2);
    var defs = el('defs', {}, svg), cp = el('clipPath', { id: clipId }, defs);
    el('rect', { x: m.l, y: m.t - 2, width: pw, height: ph + 4 }, cp);
    var g = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    o.series.forEach(function (s) {
      var Yf = s.axis === 2 ? Y2 : Y1, d = '';
      for (var i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) continue; d += (d ? 'L' : 'M') + X(s.x[i]).toFixed(1) + ' ' + Yf(s.y[i]).toFixed(1); }
      if (s.fill) el('path', { d: d + 'L' + X(s.x[s.x.length - 1]) + ' ' + Yf(Math.max(s.axis === 2 ? y2Min : y1Min, 0)) + 'L' + X(s.x[0]) + ' ' + Yf(Math.max(s.axis === 2 ? y2Min : y1Min, 0)) + 'Z', fill: s.color, opacity: 0.12 }, g);
      if (!s.noLine) el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-dasharray': s.dash || '', 'stroke-linejoin': 'round', opacity: s.opacity || 1 }, g);
      if (s.dots) for (var j = 0; j < s.x.length; j++) { if (!isFinite(s.y[j])) continue; el('circle', { cx: X(s.x[j]).toFixed(1), cy: Yf(s.y[j]).toFixed(1), r: s.r || 3.5, fill: s.hollow ? 'none' : s.color, stroke: s.color, 'stroke-width': 1.5 }, g); }
    });
    if (o.cursor != null) el('line', { x1: X(o.cursor), x2: X(o.cursor), y1: m.t, y2: m.t + ph, class: 'cursor' }, svg);
    return { X: X, Y1: Y1, Y2: Y2, m: m, pw: pw, ph: ph };
  }

  function legend(div, items) {
    div.innerHTML = items.map(function (it) { return '<span style="--c:' + it.color + '">' + it.label + '</span>'; }).join('');
  }

  root.Charts = { line: line, legend: legend, el: el };
})(window);
