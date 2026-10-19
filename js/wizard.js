/* Asistente de DOE: terminal → punto de partida → plan → resultados → calibración y recomendación.
 * Los resultados se guardan solo en el navegador (localStorage) y se exportan a CSV. */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts;
  var $ = function (id) { return document.getElementById(id); };
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  var RES = ['OK', 'DÉBIL', 'FRÍA', 'QUEMADA'];
  var ORD = { 'ABIERTA': 0, 'FRÍA': 0, 'DÉBIL': 1, 'OK': 2, 'OK (caliente)': 2.5, 'QUEMADA': 3.5 };
  var AWG = { 14: 1.628, 15: 1.450, 16: 1.291, 17: 1.150, 18: 1.024, 19: 0.912, 20: 0.812, 21: 0.723, 22: 0.644 };

  /* ---------------- almacén de resultados ---------------- */
  var KEY = 'electrodo-doe-v1', rows = [];
  try { var raw = localStorage.getItem(KEY); if (raw) rows = JSON.parse(raw) || []; } catch (e) { rows = []; }
  var COLS = ['nW', 'heat', 'weld', 'up', 'uf', 'down', 'dl', 'eOther', 'res', 'R', 'pull', 'note'];
  var LABEL = { nW: 'Alambres', heat: 'HEAT kA', weld: 'WELD ms', up: 'UP ms', uf: 'UF kA', down: 'DOWN ms', dl: 'DL kA', eOther: 'I²t otros pulsos', res: 'Resultado', R: 'R (Ω)', pull: 'Jalón (N)', note: 'Nota' };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} window.dispatchEvent(new Event('doechange')); }
  function newRow(o) { return Object.assign({ id: Math.random().toString(36).slice(2, 9), nW: 3, heat: 4.0, weld: 450, up: 240, uf: 3.15, down: 40, dl: 2.6, eOther: 0, res: '', R: '', pull: '', note: '' }, o || {}); }
  function rowEnergy(r) {
    var p = { we: [S.pulseOf({ on: true, uf: +r.uf, heat: +r.heat, dl: +r.dl, up: +r.up, weld: +r.weld, down: +r.down })] };
    return S.energyOf(p).total + (+r.eOther || 0);
  }
  window.DOEStore = {
    rows: function () { return rows; },
    equiv: function (r) { return { heat: window.WindowMap.equivHeat(rowEnergy(r), +r.weld), weld: +r.weld, E: rowEnergy(r) }; }
  };
  function toCSV() {
    var head = COLS.join(',');
    return head + '\n' + rows.map(function (r) { return COLS.map(function (c) { var v = r[c] == null ? '' : String(r[c]); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  }
  function parseCSV(txt) {
    var lines = txt.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = lines[0].indexOf(';') >= 0 && lines[0].indexOf(',') < 0 ? ';' : lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    function split(l) { var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
    var head = split(lines[0]).map(function (h) { return h.trim(); });
    var alias = { alambres: 'nW', nw: 'nW', heat: 'heat', weld: 'weld', up: 'up', uf: 'uf', down: 'down', dl: 'dl', eother: 'eOther', res: 'res', resultado: 'res', r: 'R', pull: 'pull', jalon: 'pull', 'jalón': 'pull', note: 'note', nota: 'note' };
    var map = head.map(function (h) { var k = h.toLowerCase().replace(/\s*\(.*\)|\s*(ka|ms|n)$/g, '').trim(); return alias[k] || (COLS.indexOf(h) >= 0 ? h : null); });
    return lines.slice(1).map(function (l) {
      var v = split(l), o = {};
      map.forEach(function (k, i) { if (k) o[k] = v[i] != null ? v[i].trim() : ''; });
      ['nW', 'heat', 'weld', 'up', 'uf', 'down', 'dl', 'eOther'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '') o[k] = parseFloat(String(o[k]).replace(',', '.')); });
      if (o.res) { var u = o.res.toUpperCase().replace('FRIA', 'FRÍA').replace('DEBIL', 'DÉBIL'); o.res = RES.indexOf(u) >= 0 ? u : ''; }
      return newRow(o);
    });
  }
  function download(name, text, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv' })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- estado del asistente ---------------- */
  var W = { nW: 3, awg: 17, lw: 2.0, t: 1.0, wi: 2.0, l: 5, weld: 450, dPct: 5, hLevels: 3, wLevels: 3, wPct: 20, reps: 2, seed: 1, center: null, pullMin: 50 };
  function q(nW, awg) {
    var d = AWG[awg] || 1.15, rho = 8.96e-3, c = 0.385;
    return (nW * Math.PI * d * d / 4 * W.lw + W.t * W.wi * W.l) * rho * c * 775;
  }
  function mapKeyFor(nW) { return nW <= 2 ? 'w2' : 'w3'; }
  function calFor(nW) { return window.Calib.get(nW <= 2 ? 2 : 3); }
  // factor de energía para terminales que no están en el mapa (otro calibre o número de alambres)
  function energyScale() {
    var ref = W.nW <= 2 ? q(2, 17) : q(3, 17);
    return Math.sqrt(q(W.nW, W.awg) / ref);
  }
  // barrido de HEAT a un WELD: clase del modelo (calibrado) para cada consigna
  function scan(weld) {
    var key = mapKeyFor(W.nW), c = calFor(W.nW), es = energyScale(), out = [];
    for (var h = 3.0; h <= 5.6001; h += 0.02) {
      var v = window.WindowMap.verdictAt(key, h * c / es, weld);
      out.push({ h: +h.toFixed(2), v: v });
    }
    return out;
  }
  function okRange(sc) {
    var best = null, cur = null;
    sc.forEach(function (o) {
      var ok = o.v.code === 'OK' || o.v.code === 'OK (caliente)';
      if (ok) { if (!cur) cur = { a: o.h, b: o.h, okc: 0, n: 0 }; cur.b = o.h; cur.n++; if (o.v.code === 'OK') cur.okc++; }
      else if (cur) { if (!best || cur.n > best.n) best = cur; cur = null; }
    });
    if (cur && (!best || cur.n > best.n)) best = cur;
    if (best) { best.c = +((best.a + best.b) / 2).toFixed(2); best.width = (best.b - best.a) / best.c * 100; }
    return best;
  }

  /* ---------------- pasos ---------------- */
  var step = 0;
  var STEPS = ['1 · Terminal', '2 · Punto de partida', '3 · Plan del DOE', '4 · Resultados', '5 · Análisis'];
  function nav() {
    $('wzTabs').innerHTML = STEPS.map(function (s, i) { return '<button type="button" data-s="' + i + '" class="' + (i === step ? 'on' : '') + '">' + s + '</button>'; }).join('');
    [s1, s2, s3, s4, s5][step]();
  }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function slider(id, label, min, max, st, val, d) { return '<div class="row"><label>' + label + '</label><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + st + '" value="' + val + '"><output id="' + id + 'o">' + (+val).toFixed(d) + '</output></div>'; }
  function bindSliders(map, after) {
    Object.keys(map).forEach(function (id) {
      var el = $(id); if (!el) return;
      el.addEventListener('input', function () { W[map[id][0]] = parseFloat(el.value); $(id + 'o').textContent = (+el.value).toFixed(map[id][1]); after(); });
    });
  }
  function footer(prev, next) {
    return '<div class="btns" style="margin-top:14px;justify-content:space-between">' + (prev ? '<button class="btn ghost" type="button" data-go="' + (step - 1) + '">← Anterior</button>' : '<span></span>') + (next ? '<button class="btn" type="button" data-go="' + (step + 1) + '">' + next + ' →</button>' : '') + '</div>';
  }

  // 1 · terminal
  function s1() {
    $('wzBody').innerHTML = '<div class="grid2"><div class="card">' +
      '<div class="row" style="grid-template-columns:1fr 190px"><label>Alambres en el gancho</label><div class="seg" id="wzN">' + [1, 2, 3, 4].map(function (n) { return '<button type="button" data-v="' + n + '"' + (W.nW === n ? ' class="on"' : '') + '>' + n + '</button>'; }).join('') + '</div></div>' +
      '<div class="row" style="grid-template-columns:1fr 190px"><label>Calibre (AWG)</label><select id="wzAwg">' + Object.keys(AWG).map(function (a) { return '<option value="' + a + '"' + (+a === W.awg ? ' selected' : '') + '>' + a + ' AWG · Ø' + AWG[a].toFixed(3) + ' mm</option>'; }).join('') + '</select></div>' +
      slider('wzLw', 'Largo de alambre bajo el gancho (mm)', 1, 4, 0.1, W.lw, 1) + slider('wzT', 'Espesor del gancho (mm)', 0.5, 1.6, 0.05, W.t, 2) + slider('wzWi', 'Ancho del gancho (mm)', 1, 4, 0.1, W.wi, 1) + slider('wzL', 'Largo de gancho que se calienta (mm)', 2, 9, 0.5, W.l, 1) +
      '<button class="btn ghost" type="button" id="wzGeo" style="margin-top:8px">Ver esta terminal en el simulador</button></div><div class="stack"><div class="card" id="wzQ"></div><div class="note">El mapa del modelo existe para 2 y 3 alambres de 17 AWG en un gancho de 1 × 2 mm. Para otra combinación, el asistente escala la corriente con la raíz de la energía que necesita la unión (Q = m·c·ΔT). Es un punto de partida, no un resultado: el DOE lo confirma.</div></div></div>' + footer(false, 'Punto de partida');
    function upd() {
      var Q = q(W.nW, W.awg), Q2 = q(2, 17), Q3 = q(3, 17), es = energyScale();
      $('wzQ').innerHTML = '<h3>Calor que necesita la unión</h3><div class="kpi-row"><div class="kpi"><b>' + Q.toFixed(1) + ' J</b><span>para llegar a ~800 °C</span></div><div class="kpi"><b>' + ((Q / Q2 - 1) * 100 >= 0 ? '+' : '') + ((Q / Q2 - 1) * 100).toFixed(0) + '%</b><span>vs 2 alambres 17 AWG</span></div><div class="kpi"><b>' + ((Q / Q3 - 1) * 100 >= 0 ? '+' : '') + ((Q / Q3 - 1) * 100).toFixed(0) + '%</b><span>vs 3 alambres 17 AWG</span></div><div class="kpi"><b>×' + es.toFixed(3) + '</b><span>escala de corriente vs el mapa de ' + (W.nW <= 2 ? 2 : 3) + ' alambres</span></div></div>';
    }
    $('wzN').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; W.nW = +b.dataset.v; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); upd(); });
    $('wzAwg').addEventListener('change', function () { W.awg = +this.value; upd(); });
    $('wzGeo').onclick = function () {
      var es = energyScale(), h = +(4.0 * es).toFixed(2);
      window.SimUI.load({ nWires: W.nW, awg: W.awg, thick: W.t }, window.SimUI.prog({ uf: +(h * 0.79).toFixed(2), heat: h, dl: 2.6, up: 240, weld: 450, down: 40 }, null, null, 0, 0, 200));
    };
    bindSliders({ wzLw: ['lw', 1], wzT: ['t', 2], wzWi: ['wi', 1], wzL: ['l', 1] }, upd);
    upd();
  }

  // 2 · punto de partida
  function s2() {
    $('wzBody').innerHTML = '<div class="grid2"><div class="card">' + slider('wzWeld', 'WELD (ms)', 200, 600, 10, W.weld, 0) +
      '<svg class="chart" id="wzStrip" viewBox="0 0 520 120"></svg><div id="wzStart"></div></div>' +
      '<div class="card"><h3>Ventana del modelo por WELD</h3><div class="tbl-wrap" id="wzByW"></div></div></div>' + footer(true, 'Plan del DOE');
    function upd() {
      var sc = scan(W.weld), r = okRange(sc), svg = $('wzStrip');
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var col = { 'ABIERTA': '#9aa3ad', 'FRÍA': '#8fb7dd', 'DÉBIL': '#f1d27a', 'OK': '#7cc795', 'OK (caliente)': '#c9dd7f', 'QUEMADA': '#e9877b' };
      var x0 = 40, x1 = 510, X = function (h) { return x0 + (h - 3.0) / 2.6 * (x1 - x0); };
      sc.forEach(function (o) { C.el('rect', { x: X(o.h), y: 20, width: (x1 - x0) / sc.length + 0.6, height: 40, fill: col[o.v.code] }, svg); });
      for (var h = 3.0; h <= 5.61; h += 0.4) { var t = C.el('text', { x: X(h), y: 78, 'text-anchor': 'middle' }, svg); t.textContent = h.toFixed(1); }
      var tl = C.el('text', { x: x0 - 4, y: 44, 'text-anchor': 'end' }, svg); tl.textContent = 'kA';
      if (r) {
        C.el('line', { x1: X(r.c), x2: X(r.c), y1: 12, y2: 68, stroke: css('--ink'), 'stroke-width': 2 }, svg);
        var tt = C.el('text', { x: X(r.c), y: 100, 'text-anchor': 'middle' }, svg); tt.textContent = 'centro ' + r.c.toFixed(2) + ' kA';
        W.center = r.c;
        $('wzStart').innerHTML = '<div class="kpi-row"><div class="kpi"><b>' + r.c.toFixed(2) + ' kA</b><span>HEAT de partida</span></div><div class="kpi"><b>' + r.a.toFixed(2) + '–' + r.b.toFixed(2) + '</b><span>rango OK del modelo</span></div><div class="kpi"><b>±' + (r.width / 2).toFixed(1) + '%</b><span>margen</span></div></div>' +
          '<p class="muted" style="font-size:12.5px;margin-top:8px">UF = 0.79·HEAT, UP = 53% de WELD, DOWN 40 ms a 2.6 kA. ' + (calFor(W.nW) !== 1 ? 'Con tu calibración ×' + calFor(W.nW).toFixed(3) + '.' : 'Modelo sin calibrar.') + '</p>' +
          '<button class="btn ghost" type="button" id="wzSim">Simular este punto</button>';
        $('wzSim').onclick = function () { window.SimUI.load({ nWires: W.nW <= 2 ? 2 : 3 }, window.SimUI.prog({ uf: +(r.c * 0.79).toFixed(2), heat: r.c, dl: 2.6, up: Math.round(W.weld * 0.53), weld: W.weld, down: 40 }, null, null, 0, 0, 150)); };
      } else { W.center = null; $('wzStart').innerHTML = '<div class="note">No hay región OK en este WELD dentro de 3.0–5.6 kA. Prueba otro WELD.</div>'; }
      var welds = [250, 300, 350, 400, 450, 500, 550, 600], best = null;
      var trs = welds.map(function (w) { var rr = okRange(scan(w)); if (rr && (!best || rr.width > best.width)) best = Object.assign({ w: w }, rr); return { w: w, r: rr }; });
      $('wzByW').innerHTML = '<table><thead><tr><th>WELD</th><th>Rango OK (kA)</th><th>Centro</th><th>Margen</th></tr></thead><tbody>' + trs.map(function (o) {
        return '<tr' + (best && o.w === best.w ? ' style="background:var(--ok-soft)"' : '') + '><td>' + o.w + ' ms</td><td>' + (o.r ? o.r.a.toFixed(2) + '–' + o.r.b.toFixed(2) : '—') + '</td><td>' + (o.r ? o.r.c.toFixed(2) : '—') + '</td><td>' + (o.r ? '±' + (o.r.width / 2).toFixed(1) + '%' : 'sin ventana') + '</td></tr>';
      }).join('') + '</tbody></table>' + (best ? '<p class="muted" style="font-size:12.5px;margin-top:6px">El margen más ancho del modelo está en WELD ' + best.w + ' ms. Es una hipótesis para el DOE, no una conclusión.</p>' : '');
    }
    bindSliders({ wzWeld: ['weld', 0] }, upd);
    window.WindowMap.ready.then(upd);
  }

  // 3 · plan
  function plan() {
    var c = W.center || 4.0, hs = [], ws = [], R = rng(W.seed), runs = [];
    for (var i = 0; i < W.hLevels; i++) hs.push(+(c * (1 + W.dPct / 100 * (W.hLevels === 1 ? 0 : (2 * i / (W.hLevels - 1) - 1)))).toFixed(2));
    for (var j = 0; j < W.wLevels; j++) ws.push(Math.round(W.weld * (1 + W.wPct / 100 * (W.wLevels === 1 ? 0 : (2 * j / (W.wLevels - 1) - 1))) / 5) * 5);
    for (var r = 0; r < W.reps; r++) hs.forEach(function (h) { ws.forEach(function (w) { runs.push({ heat: h, weld: w, rep: r + 1 }); }); });
    for (var k = runs.length - 1; k > 0; k--) { var m = Math.floor(R() * (k + 1)), t = runs[k]; runs[k] = runs[m]; runs[m] = t; }
    runs.forEach(function (o, i) { o.order = i + 1; o.up = Math.round(o.weld * 0.53); o.uf = +(o.heat * 0.79).toFixed(2); o.down = 40; o.dl = 2.6; });
    return { hs: hs, ws: ws, runs: runs };
  }
  function s3() {
    $('wzBody').innerHTML = '<div class="grid2"><div class="card">' +
      slider('wzD', 'Paso de HEAT (± %)', 2, 12, 0.5, W.dPct, 1) + slider('wzHL', 'Niveles de HEAT', 2, 5, 1, W.hLevels, 0) +
      slider('wzWP', 'Paso de WELD (± %)', 0, 40, 5, W.wPct, 0) + slider('wzWL', 'Niveles de WELD', 1, 4, 1, W.wLevels, 0) +
      slider('wzR', 'Réplicas', 1, 4, 1, W.reps, 0) + slider('wzSeed', 'Semilla de aleatorización', 1, 99, 1, W.seed, 0) +
      '<canvas id="wzPlanMap" width="520" height="300" style="width:100%;margin-top:8px;border-radius:6px"></canvas><div class="muted" style="font-size:12px">Fondo: predicción del modelo' + (calFor(W.nW) !== 1 ? ' calibrado' : '') + '. Puntos: corridas del plan.</div></div>' +
      '<div class="card"><div class="kpi-row" id="wzPlanK"></div><div class="tbl-wrap" id="wzPlanT" style="max-height:420px;overflow:auto;margin-top:8px"></div>' +
      '<div class="btns" style="margin-top:10px"><button class="btn" type="button" id="wzAdd">Agregar al registro de resultados</button><button class="btn ghost" type="button" id="wzCsv">Descargar plan (CSV)</button></div></div></div>' + footer(true, 'Resultados');
    function upd() {
      var pl = plan();
      $('wzPlanK').innerHTML = '<div class="kpi"><b>' + pl.runs.length + '</b><span>corridas</span></div><div class="kpi"><b>' + pl.hs.join(' / ') + '</b><span>HEAT (kA)</span></div><div class="kpi"><b>' + pl.ws.join(' / ') + '</b><span>WELD (ms)</span></div>';
      $('wzPlanT').innerHTML = '<table><thead><tr><th>Orden</th><th>HEAT</th><th>WELD</th><th>UP</th><th>UF</th><th>Réplica</th></tr></thead><tbody>' + pl.runs.map(function (o) { return '<tr><td>' + o.order + '</td><td>' + o.heat.toFixed(2) + '</td><td>' + o.weld + '</td><td>' + o.up + '</td><td>' + o.uf.toFixed(2) + '</td><td>' + o.rep + '</td></tr>'; }).join('') + '</tbody></table>';
      // mapa del plan
      var cv = $('wzPlanMap'), ctx = cv.getContext('2d'), Wd = cv.width, Hd = cv.height, key = mapKeyFor(W.nW), cal = calFor(W.nW), es = energyScale();
      var hMin = Math.min.apply(null, pl.hs) * 0.9, hMax = Math.max.apply(null, pl.hs) * 1.1, wMin = Math.max(200, Math.min.apply(null, pl.ws) * 0.8), wMax = Math.min(600, Math.max.apply(null, pl.ws) * 1.2);
      if (wMax - wMin < 50) { wMin = Math.max(200, wMin - 50); wMax = Math.min(600, wMax + 50); }
      var col = { 'ABIERTA': '#9aa3ad', 'FRÍA': '#8fb7dd', 'DÉBIL': '#f1d27a', 'OK': '#7cc795', 'OK (caliente)': '#c9dd7f', 'QUEMADA': '#e9877b' }, nx = 60, ny = 30;
      for (var a = 0; a < nx; a++) for (var b = 0; b < ny; b++) {
        var h = hMin + (a + 0.5) / nx * (hMax - hMin), w = wMin + (b + 0.5) / ny * (wMax - wMin);
        var v = window.WindowMap.verdictAt(key, h * cal / es, w);
        ctx.fillStyle = col[v.code]; ctx.fillRect(a * Wd / nx, Hd - (b + 1) * Hd / ny, Wd / nx + 1, Hd / ny + 1);
      }
      ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      pl.hs.forEach(function (h) { pl.ws.forEach(function (w) { var x = (h - hMin) / (hMax - hMin) * Wd, y = Hd - (w - wMin) / (wMax - wMin) * Hd; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke(); }); });
      ctx.font = '12px "IBM Plex Mono", monospace'; ctx.fillStyle = '#111';
      ctx.fillText('HEAT ' + hMin.toFixed(2) + '–' + hMax.toFixed(2) + ' kA →', 8, Hd - 8); ctx.fillText('WELD ' + Math.round(wMin) + '–' + Math.round(wMax) + ' ms ↑', 8, 16);
    }
    bindSliders({ wzD: ['dPct', 1], wzHL: ['hLevels', 0], wzWP: ['wPct', 0], wzWL: ['wLevels', 0], wzR: ['reps', 0], wzSeed: ['seed', 0] }, upd);
    $('wzAdd').onclick = function () {
      var pl = plan();
      pl.runs.forEach(function (o) { rows.push(newRow({ nW: W.nW, heat: o.heat, weld: o.weld, up: o.up, uf: o.uf, down: o.down, dl: o.dl, note: 'plan #' + o.order })); });
      save(); step = 3; nav();
    };
    $('wzCsv').onclick = function () {
      var pl = plan();
      download('plan-doe.csv', 'orden,alambres,heat,weld,up,uf,down,dl,replica,res,R,pull,nota\n' + pl.runs.map(function (o) { return [o.order, W.nW, o.heat, o.weld, o.up, o.uf, o.down, o.dl, o.rep, '', '', '', ''].join(','); }).join('\n'));
    };
    window.WindowMap.ready.then(upd);
  }

  // 4 · resultados
  function s4() {
    $('wzBody').innerHTML = '<div class="card"><div class="btns" style="margin-bottom:10px"><button class="btn ghost" type="button" id="wzNew">+ Fila</button><button class="btn ghost" type="button" id="wzImp">Pegar / importar CSV</button><button class="btn ghost" type="button" id="wzExp">Exportar CSV</button><button class="btn ghost" type="button" id="wzEx">Cargar ejemplo ficticio</button><button class="btn ghost" type="button" id="wzClr" style="color:var(--bad)">Borrar todo</button></div>' +
      '<div id="wzImpBox" style="display:none;margin-bottom:10px"><textarea id="wzTxt" rows="6" style="width:100%;font:12px var(--mono);background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px" placeholder="alambres,heat,weld,up,uf,down,dl,res,R,pull,nota\n3,4.0,450,240,3.15,40,2.6,DÉBIL,7.65,38,"></textarea><div class="btns" style="margin-top:6px"><button class="btn" type="button" id="wzImpGo">Agregar filas</button><label class="btn ghost" style="cursor:pointer">Desde archivo<input type="file" id="wzFile" accept=".csv,.txt" style="display:none"></label></div></div>' +
      '<div class="tbl-wrap" id="wzRows"></div>' +
      '<p class="muted" style="font-size:12.5px;margin-top:8px">Los datos se guardan solo en este navegador; no se suben a ningún lado. Exporta el CSV para respaldarlos o pasarlos a otra computadora. <b>Resultado</b>: OK = unión completa; DÉBIL = pasa resistencia pero abre fácil en jalón o le falta fusión en el corte; FRÍA = esmalte sin remover, abierta o R fuera; QUEMADA = cobre fundido o expulsión. <b>I²t otros pulsos</b>: energía de WE2/WE3 en kA²·s si el programa tiene más de un pulso (está en la sección Pulso).</p></div>' + footer(true, 'Análisis');
    function table() {
      $('wzRows').innerHTML = rows.length ? '<table class="edit"><thead><tr><th>#</th>' + COLS.map(function (c) { return '<th>' + LABEL[c] + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' + rows.map(function (r, i) {
        return '<tr data-id="' + r.id + '"><td>' + (i + 1) + '</td>' + COLS.map(function (c) {
          if (c === 'res') return '<td><select data-c="res" class="res-' + (r.res ? r.res.replace('Í', 'I').replace('É', 'E') : 'none') + '"><option value="">—</option>' + RES.map(function (x) { return '<option' + (r.res === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>';
          if (c === 'nW') return '<td><select data-c="nW">' + [1, 2, 3, 4].map(function (x) { return '<option' + (+r.nW === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>';
          return '<td><input data-c="' + c + '" value="' + esc(r[c]) + '"' + (c === 'note' ? ' style="width:110px"' : ' inputmode="decimal" style="width:62px"') + '></td>';
        }).join('') + '<td><button class="chip" data-del type="button">✕</button></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="muted">Sin resultados. Agrega el plan desde el paso 3, pega un CSV o agrega filas.</p>';
    }
    table();
    $('wzRows').addEventListener('change', function (e) {
      var tr = e.target.closest('tr'), c = e.target.dataset.c; if (!tr || !c) return;
      var r = rows.filter(function (x) { return x.id === tr.dataset.id; })[0]; if (!r) return;
      var v = e.target.value;
      r[c] = (c === 'res' || c === 'note') ? v : v === '' ? '' : parseFloat(String(v).replace(',', '.'));
      save(); if (c === 'res') table();
    });
    $('wzRows').addEventListener('click', function (e) {
      if (!e.target.closest('[data-del]')) return;
      var id = e.target.closest('tr').dataset.id; rows = rows.filter(function (x) { return x.id !== id; }); save(); table();
    });
    $('wzNew').onclick = function () { var last = rows[rows.length - 1]; rows.push(newRow(last ? { nW: last.nW, heat: last.heat, weld: last.weld, up: last.up, uf: last.uf, down: last.down, dl: last.dl } : { nW: W.nW })); save(); table(); };
    $('wzImp').onclick = function () { var b = $('wzImpBox'); b.style.display = b.style.display === 'none' ? 'block' : 'none'; };
    $('wzImpGo').onclick = function () { var add = parseCSV($('wzTxt').value); rows = rows.concat(add); save(); table(); $('wzTxt').value = ''; };
    $('wzFile').onchange = function () { var f = this.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { rows = rows.concat(parseCSV(rd.result)); save(); table(); }; rd.readAsText(f); };
    $('wzExp').onclick = function () { download('resultados-doe.csv', toCSV()); };
    $('wzClr').onclick = function () { if (!rows.length) return; if (confirm('¿Borrar todos los resultados guardados en este navegador?')) { rows = []; save(); table(); } };
    $('wzEx').onclick = function () {
      // ejemplo inventado: el "modelo real" tiene corriente efectiva ×0.94 y ruido; NO son datos de ninguna máquina
      window.WindowMap.ready.then(function () {
        var R = rng(7), ex = [];
        [3.6, 3.8, 4.0, 4.2, 4.4, 4.6].forEach(function (h) { [350, 450].forEach(function (w) {
          for (var k = 0; k < 2; k++) {
            var hn = h * 0.94 * (1 + (R() - 0.5) * 0.03), v = window.WindowMap.verdictAt('w3', hn, w), code = v.code === 'OK (caliente)' ? 'OK' : v.code;
            var pull = Math.max(0, Math.round(15 + 70 * v.m.bm * v.m.bw + (R() - 0.5) * 12 - (v.m.m > 1 ? 25 : 0)));
            ex.push(newRow({ nW: 3, heat: h, weld: w, up: Math.round(w * 0.53), uf: +(h * 0.79).toFixed(2), down: 40, dl: 2.6, res: code, R: +(7.62 + (R() - 0.5) * 0.08 + (code === 'FRÍA' ? 0.15 : 0)).toFixed(2), pull: pull, note: 'EJEMPLO FICTICIO' }));
          }
        }); });
        rows = rows.concat(ex); save(); table();
      });
    };
  }

  // 5 · análisis
  function tcdf(t, df) { // P(|T| > |t|) bilateral
    var x = df / (df + t * t);
    return ibeta(x, df / 2, 0.5);
  }
  function betacf(a, b, x) {
    var FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FP) d = FP; d = 1 / d; var h = d;
    for (var m = 1; m <= 300; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d;
      var del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function lgamma(z) { var g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5], x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); var ser = 1.000000000190015; for (var j = 0; j < 6; j++) ser += g[j] / ++y; return -tmp + Math.log(2.5066282746310005 * ser / x); }
  function ols(X, y) {
    var n = X.length, p = X[0].length, XtX = [], Xty = [];
    for (var i = 0; i < p; i++) { XtX.push(new Array(p).fill(0)); Xty.push(0); }
    for (var r = 0; r < n; r++) for (i = 0; i < p; i++) { Xty[i] += X[r][i] * y[r]; for (var j = 0; j < p; j++) XtX[i][j] += X[r][i] * X[r][j]; }
    var inv = invert(XtX); if (!inv) return null;
    var b = inv.map(function (row) { return row.reduce(function (s, v, k) { return s + v * Xty[k]; }, 0); });
    var yhat = X.map(function (row) { return row.reduce(function (s, v, k) { return s + v * b[k]; }, 0); });
    var ym = y.reduce(function (s, v) { return s + v; }, 0) / n, sse = 0, sst = 0;
    y.forEach(function (v, k) { sse += (v - yhat[k]) * (v - yhat[k]); sst += (v - ym) * (v - ym); });
    var df = n - p, s2 = df > 0 ? sse / df : NaN;
    var se = inv.map(function (row, k) { return Math.sqrt(Math.max(0, s2 * row[k])); });
    return { b: b, se: se, t: b.map(function (v, k) { return v / se[k]; }), p: b.map(function (v, k) { return df > 0 ? tcdf(v / se[k], df) : NaN; }), r2: sst > 0 ? 1 - sse / sst : NaN, r2a: sst > 0 && df > 0 ? 1 - (sse / df) / (sst / (n - 1)) : NaN, s: Math.sqrt(s2), df: df, n: n };
  }
  function invert(A) {
    var n = A.length, M = A.map(function (r, i) { return r.concat(A.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var piv = c; for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      if (Math.abs(M[piv][c]) < 1e-12) return null;
      var t = M[c]; M[c] = M[piv]; M[piv] = t;
      var d = M[c][c]; for (var k = 0; k < 2 * n; k++) M[c][k] /= d;
      for (r = 0; r < n; r++) if (r !== c) { var f = M[r][c]; for (k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map(function (r) { return r.slice(n); });
  }
  function calibrate(nW) {
    var key = mapKeyFor(nW), data = rows.filter(function (r) { return +r.nW === nW && r.res && isFinite(+r.heat) && isFinite(+r.weld); });
    if (data.length < 3) return { n: data.length };
    var cs = [], losses = [], best = Infinity;
    var eq = data.map(function (r) { return window.DOEStore.equiv(r); });
    // escala por energía si el calibre/alambres difieren del mapa (se usa la terminal del paso 1 solo si coincide)
    for (var c = 0.7; c <= 1.35001; c += 0.0025) {
      var L = 0;
      data.forEach(function (r, i) { var v = window.WindowMap.verdictAt(key, eq[i].heat * c, eq[i].weld); L += Math.abs(ORD[v.code] - ORD[r.res]); });
      cs.push(+c.toFixed(4)); losses.push(L); if (L < best) best = L;
    }
    var at = cs.filter(function (c, i) { return losses[i] === best; });
    var cBest = at[Math.floor(at.length / 2)], cLo = at[0], cHi = at[at.length - 1];
    var conf = {}, hits = 0;
    var detail = data.map(function (r, i) {
      var v = window.WindowMap.verdictAt(key, eq[i].heat * cBest, eq[i].weld), pc = v.code === 'OK (caliente)' ? 'OK' : v.code;
      if (pc === r.res) hits++;
      conf[r.res + '|' + pc] = (conf[r.res + '|' + pc] || 0) + 1;
      return { r: r, pred: v.code, eqH: eq[i].heat };
    });
    var classes = {}; data.forEach(function (r) { classes[r.res] = 1; });
    return { n: data.length, cs: cs, losses: losses, c: cBest, lo: cLo, hi: cHi, acc: hits / data.length, conf: conf, detail: detail, oneClass: Object.keys(classes).length < 2, edge: cLo <= 0.7001 || cHi >= 1.3499 };
  }
  function s5() {
    var groups = [2, 3].filter(function (n) { return rows.some(function (r) { return +r.nW === n && r.res; }); });
    $('wzBody').innerHTML = '<div id="wzCal"></div><div class="card" style="margin-top:16px" id="wzEmp"></div><div class="card" style="margin-top:16px" id="wzRec"></div>' + footer(true, null);
    if (!groups.length) { $('wzCal').innerHTML = '<div class="note">Todavía no hay resultados con la columna <b>Resultado</b> llena. Ve al paso 4.</div>'; $('wzEmp').style.display = 'none'; $('wzRec').style.display = 'none'; return; }
    window.WindowMap.ready.then(function () {
      var calRes = {};
      $('wzCal').innerHTML = groups.map(function (n) { return '<div class="card" style="margin-bottom:16px" id="wzCal' + n + '"></div>'; }).join('');
      groups.forEach(function (n) {
        var r = calibrate(n), box = $('wzCal' + n); calRes[n] = r;
        if (r.n < 3) { box.innerHTML = '<h3>' + n + ' alambres</h3><p class="muted">Se necesitan al menos 3 corridas con resultado (hay ' + r.n + ').</p>'; return; }
        var order = ['FRÍA', 'DÉBIL', 'OK', 'QUEMADA'];
        var confT = '<table><thead><tr><th>Observado \\ Modelo</th>' + order.map(function (o) { return '<th>' + o + '</th>'; }).join('') + '</tr></thead><tbody>' + order.map(function (o) { return '<tr><td><b>' + o + '</b></td>' + order.map(function (p) { var v = r.conf[o + '|' + p] || 0; return '<td style="' + (v ? (o === p ? 'background:var(--ok-soft);font-weight:600' : 'background:var(--warn-soft)') : 'color:var(--ink-3)') + '">' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
        var warn = [];
        if (r.oneClass) warn.push('Todas las corridas tienen el mismo resultado: la calibración solo da un límite, no un valor. Incluye puntos que salgan fríos y quemados (límites de la Fase 0).');
        if (r.edge) warn.push('El mejor factor quedó en el borde del rango buscado (0.70–1.35): el modelo está muy lejos de tu máquina o las corridas no son comparables (revisa unidades y el canal).');
        if (r.hi - r.lo > 0.08) warn.push('Hay un rango amplio de factores igual de buenos (' + r.lo.toFixed(3) + '–' + r.hi.toFixed(3) + '): faltan corridas cerca de las fronteras entre clases.');
        if (r.acc < 0.6) warn.push('Acierto bajo: el modelo no explica bien tus datos con un solo factor. Toma la calibración con cautela.');
        box.innerHTML = '<h3>Calibración del modelo · ' + n + ' alambres</h3><div class="grid2"><div><svg class="chart" id="wzLoss' + n + '" viewBox="0 0 520 220"></svg></div><div>' +
          '<div class="kpi-row"><div class="kpi"><b>×' + r.c.toFixed(3) + '</b><span>corriente efectiva (rango ' + r.lo.toFixed(3) + '–' + r.hi.toFixed(3) + ')</span></div><div class="kpi"><b>' + Math.round(r.acc * 100) + '%</b><span>acierto de clase (' + r.n + ' corridas)</span></div></div>' +
          '<div class="tbl-wrap" style="margin-top:8px">' + confT + '</div>' +
          (warn.length ? '<div class="note" style="margin-top:8px;background:var(--warn-soft)">' + warn.join('<br>') + '</div>' : '') +
          '<div class="btns" style="margin-top:10px"><button class="btn" type="button" data-apply="' + n + '">Aplicar al simulador y al mapa</button>' + (window.Calib.info(n) ? '<button class="btn ghost" type="button" data-unapply="' + n + '">Quitar calibración</button>' : '') + '</div></div></div>' +
          '<p class="muted" style="font-size:12.5px;margin-top:8px">Qué significa: ×' + r.c.toFixed(3) + ' es el factor por el que hay que multiplicar tu consigna para que el modelo prediga lo que observaste. Menor que 1: tu máquina entrega menos calor útil que el modelo por cada kA (contactos, enfriamiento, canal). Junta en un número todo lo que el modelo no sabe de tu máquina; por eso se calibra por número de alambres.</p>';
        C.line($('wzLoss' + n), { series: [{ x: r.cs, y: r.losses, color: css('--cu'), width: 2 }], xMin: 0.7, xMax: 1.35, yMin: 0, xLabel: 'factor de corriente efectiva', yLabel: 'error', cursor: r.c, bands: [{ x0: r.lo, x1: r.hi + 0.0025, color: css('--ok'), opacity: 0.18 }] });
      });
      $('wzCal').onclick = function (e) {
        var a = e.target.closest('[data-apply]'), u = e.target.closest('[data-unapply]');
        if (a) { var n = +a.dataset.apply, r = calRes[n]; window.Calib.set(n, r.c, { n: r.n, acc: r.acc, lo: r.lo, hi: r.hi, date: new Date().toISOString().slice(0, 10) }); window.Calib.setEnabled(true); s5(); }
        if (u) { window.Calib.remove(+u.dataset.unapply); s5(); }
      };
      empirical(groups, calRes);
      recommend(groups, calRes);
    });
  }
  function empirical(groups) {
    var box = $('wzEmp'), resp = W.resp || 'pull', nG = W.empN && groups.indexOf(W.empN) >= 0 ? W.empN : groups[groups.length - 1];
    var data = rows.filter(function (r) { return +r.nW === nG && r[resp] !== '' && r[resp] != null && isFinite(+r[resp]) && isFinite(+r.heat) && isFinite(+r.weld); });
    var head = '<h3>Modelo empírico (regresión, como en Minitab)</h3><div class="btns" style="margin-bottom:8px"><div class="seg" id="wzResp"><button type="button" data-r="pull"' + (resp === 'pull' ? ' class="on"' : '') + '>Jalón (N)</button><button type="button" data-r="R"' + (resp === 'R' ? ' class="on"' : '') + '>R (Ω)</button></div>' +
      (groups.length > 1 ? '<div class="seg" id="wzEmpN">' + groups.map(function (n) { return '<button type="button" data-n="' + n + '"' + (n === nG ? ' class="on"' : '') + '>' + n + ' alambres</button>'; }).join('') + '</div>' : '') + '</div>';
    var hs = {}, ws = {}; data.forEach(function (r) { hs[+r.heat] = 1; ws[+r.weld] = 1; });
    var nh = Object.keys(hs).length, nw = Object.keys(ws).length;
    if (data.length < 4 || nh < 2) { box.innerHTML = head + '<p class="muted">Se necesitan al menos 4 corridas con ' + (resp === 'pull' ? 'jalón' : 'R') + ' y 2 niveles de HEAT (hay ' + data.length + ').</p>'; bindEmp(groups); return; }
    var hM = mean(data.map(function (r) { return +r.heat; })), hS = half(data.map(function (r) { return +r.heat; })), wM = mean(data.map(function (r) { return +r.weld; })), wS = half(data.map(function (r) { return +r.weld; }));
    var useW = nw >= 2, quadH = nh >= 3, quadW = nw >= 3;
    var names = ['Constante', 'HEAT'].concat(useW ? ['WELD'] : []).concat(quadH ? ['HEAT²'] : []).concat(quadW ? ['WELD²'] : []).concat(useW ? ['HEAT×WELD'] : []);
    function xrow(h, w) { var a = (h - hM) / hS, b = (w - wM) / (wS || 1), r = [1, a]; if (useW) r.push(b); if (quadH) r.push(a * a); if (quadW) r.push(b * b); if (useW) r.push(a * b); return r; }
    while (names.length > data.length - 1 && names.length > 2) { names.pop(); }
    var X = data.map(function (r) { return xrow(+r.heat, +r.weld).slice(0, names.length); }), y = data.map(function (r) { return +r[resp]; });
    var m = ols(X, y);
    if (!m) { box.innerHTML = head + '<p class="muted">Los datos no permiten ajustar el modelo (columnas repetidas o pocos niveles).</p>'; bindEmp(groups); return; }
    var coefT = '<table><thead><tr><th>Término (codificado)</th><th>Coef.</th><th>EE</th><th>t</th><th>p</th></tr></thead><tbody>' + names.map(function (nm, k) { var p = m.p[k]; return '<tr><td>' + nm + '</td><td>' + m.b[k].toFixed(3) + '</td><td>' + m.se[k].toFixed(3) + '</td><td>' + (isFinite(m.t[k]) ? m.t[k].toFixed(2) : '—') + '</td><td style="' + (p < 0.05 ? 'color:var(--ok);font-weight:600' : '') + '">' + (isFinite(p) ? p.toFixed(3) : '—') + '</td></tr>'; }).join('') + '</tbody></table>';
    box.innerHTML = head + '<div class="grid2"><div><canvas id="wzCont" width="520" height="320" style="width:100%;border-radius:6px"></canvas><div class="muted" style="font-size:12px">Superficie ajustada de ' + (resp === 'pull' ? 'jalón' : 'R') + '; puntos = tus corridas (color = resultado).' + (resp === 'pull' ? ' Línea blanca: jalón mínimo.' : '') + '</div>' +
      (resp === 'pull' ? '<div class="row" style="margin-top:6px"><label>Jalón mínimo (N)</label><input type="range" id="wzPm" min="5" max="150" step="1" value="' + W.pullMin + '"><output id="wzPmo">' + W.pullMin + '</output></div>' : '') + '</div>' +
      '<div><div class="kpi-row"><div class="kpi"><b>' + (m.r2 * 100).toFixed(1) + '%</b><span>R²</span></div><div class="kpi"><b>' + (isFinite(m.r2a) ? (m.r2a * 100).toFixed(1) + '%' : '—') + '</b><span>R² ajustada</span></div><div class="kpi"><b>' + (isFinite(m.s) ? m.s.toFixed(2) : '—') + '</b><span>S (error típico)</span></div><div class="kpi"><b>' + m.n + '</b><span>corridas · ' + m.df + ' gl</span></div></div>' +
      '<div class="tbl-wrap" style="margin-top:8px">' + coefT + '</div><p class="muted" style="font-size:12.5px;margin-top:6px">Variables codificadas: HEAT = (HEAT − ' + hM.toFixed(2) + ')/' + hS.toFixed(2) + (useW ? ', WELD = (WELD − ' + wM.toFixed(0) + ')/' + wS.toFixed(0) : '') + '. p &lt; 0.05 en verde. Con pocas corridas la superficie es solo orientativa.</p></div></div>';
    function draw() {
      var cv = $('wzCont'), ctx = cv.getContext('2d'), Wd = cv.width, Hd = cv.height;
      var hl = Math.min.apply(null, data.map(function (r) { return +r.heat; })), hh = Math.max.apply(null, data.map(function (r) { return +r.heat; }));
      var wl = Math.min.apply(null, data.map(function (r) { return +r.weld; })), wh = Math.max.apply(null, data.map(function (r) { return +r.weld; }));
      if (wh - wl < 1) { wl -= 50; wh += 50; }
      var pad = (hh - hl) * 0.08; hl -= pad; hh += pad;
      var nx = 80, ny = 50, vals = [], vmin = Infinity, vmax = -Infinity;
      for (var a = 0; a < nx; a++) { vals.push([]); for (var b = 0; b < ny; b++) { var h = hl + (a + 0.5) / nx * (hh - hl), w = wl + (b + 0.5) / ny * (wh - wl), xr = xrow(h, w).slice(0, names.length), v = xr.reduce(function (s, x, k) { return s + x * m.b[k]; }, 0); vals[a].push(v); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } }
      for (a = 0; a < nx; a++) for (b = 0; b < ny; b++) {
        var f = (vals[a][b] - vmin) / (vmax - vmin || 1), rr = Math.round(30 + 200 * f), gg = Math.round(60 + 120 * f), bb = Math.round(140 - 100 * f);
        if (resp === 'pull' && vals[a][b] < W.pullMin) { rr = Math.round(rr * 0.55); gg = Math.round(gg * 0.55); bb = Math.round(bb * 0.55); }
        ctx.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')'; ctx.fillRect(a * Wd / nx, Hd - (b + 1) * Hd / ny, Wd / nx + 1, Hd / ny + 1);
      }
      if (resp === 'pull') { // contorno del mínimo
        ctx.fillStyle = '#fff';
        for (a = 0; a < nx - 1; a++) for (b = 0; b < ny - 1; b++) { var s1 = vals[a][b] >= W.pullMin, s2 = vals[a + 1][b] >= W.pullMin, s3 = vals[a][b + 1] >= W.pullMin; if (s1 !== s2 || s1 !== s3) ctx.fillRect((a + 0.5) * Wd / nx, Hd - (b + 1) * Hd / ny, 3, 3); }
      }
      var colR = { 'FRÍA': '#8fb7dd', 'DÉBIL': '#f1d27a', 'OK': '#7cc795', 'QUEMADA': '#e9877b' };
      data.forEach(function (r) { var x = (+r.heat - hl) / (hh - hl) * Wd, yy = Hd - (+r.weld - wl) / (wh - wl) * Hd; ctx.beginPath(); ctx.arc(x, Math.min(Hd - 6, Math.max(6, yy)), 6, 0, 7); ctx.fillStyle = colR[r.res] || '#ddd'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#111'; ctx.stroke(); });
      ctx.font = '12px "IBM Plex Mono", monospace'; ctx.fillStyle = '#fff';
      ctx.fillText('HEAT ' + hl.toFixed(2) + '–' + hh.toFixed(2) + ' kA →', 8, Hd - 8); ctx.fillText('WELD ' + Math.round(wl) + '–' + Math.round(wh) + ' ms ↑', 8, 16);
      ctx.fillText((resp === 'pull' ? 'jalón ' : 'R ') + vmin.toFixed(resp === 'R' ? 2 : 0) + '–' + vmax.toFixed(resp === 'R' ? 2 : 0), Wd - 150, 16);
    }
    draw();
    var pm = $('wzPm'); if (pm) pm.oninput = function () { W.pullMin = +this.value; $('wzPmo').textContent = this.value; draw(); };
    bindEmp(groups);
  }
  function bindEmp(groups) {
    var r = $('wzResp'); if (r) r.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; W.resp = b.dataset.r; empirical(groups); };
    var n = $('wzEmpN'); if (n) n.onclick = function (e) { var b = e.target.closest('button'); if (!b) return; W.empN = +b.dataset.n; empirical(groups); };
  }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function half(a) { var mn = Math.min.apply(null, a), mx = Math.max.apply(null, a); return (mx - mn) / 2 || 1; }
  function recommend(groups, calRes) {
    var box = $('wzRec'), html = '<h3>Recomendación</h3>';
    groups.forEach(function (n) {
      var r = calRes[n]; if (!r || !r.c) return;
      var key = mapKeyFor(n), ws = {}; rows.forEach(function (x) { if (+x.nW === n && x.res) ws[+x.weld] = 1; });
      var welds = Object.keys(ws).map(Number).sort(function (a, b) { return a - b; });
      var lines = welds.map(function (w) {
        var sc = []; for (var h = 3.0; h <= 5.6001; h += 0.02) sc.push({ h: +h.toFixed(2), v: window.WindowMap.verdictAt(key, h * r.c, w) });
        return { w: w, r: okRange(sc) };
      });
      var best = null; lines.forEach(function (l) { if (l.r && (!best || l.r.width > best.r.width)) best = l; });
      html += '<h4 style="margin:10px 0 4px">' + n + ' alambres (calibración ×' + r.c.toFixed(3) + ')</h4><div class="tbl-wrap"><table><thead><tr><th>WELD probado</th><th>Rango OK del modelo calibrado</th><th>Centro</th><th>Margen</th></tr></thead><tbody>' +
        lines.map(function (l) { return '<tr' + (best && l.w === best.w ? ' style="background:var(--ok-soft)"' : '') + '><td>' + l.w + ' ms</td><td>' + (l.r ? l.r.a.toFixed(2) + '–' + l.r.b.toFixed(2) + ' kA' : '—') + '</td><td>' + (l.r ? l.r.c.toFixed(2) + ' kA' : '—') + '</td><td>' + (l.r ? '±' + (l.r.width / 2).toFixed(1) + '%' : 'sin ventana') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      if (best) {
        var bc = best.r.c;
        html += '<div class="note" style="margin-top:8px"><b>Punto propuesto: HEAT ' + bc.toFixed(2) + ' kA, WELD ' + best.w + ' ms</b> (UF ' + (bc * 0.79).toFixed(2) + ', UP ' + Math.round(best.w * 0.53) + ' ms, DOWN 40 ms a 2.6 kA). Está en el centro de la ventana más ancha entre los WELD que probaste, con ±' + (best.r.width / 2).toFixed(1) + '% de margen según el modelo calibrado.<br><br><b>Siguiente paso:</b> corrida de confirmación de 30 piezas en el punto propuesto contra el actual, con jalón y corte transversal en una muestra, y luego límites del MONITOR SET con esas 30 soldaduras. ' + (r.acc < 0.75 ? '<b>El acierto de la calibración es ' + Math.round(r.acc * 100) + '%: agrega corridas cerca de las fronteras antes de confiar en el margen.</b>' : '') +
          '<div class="btns" style="margin-top:8px"><button class="btn ghost" type="button" data-rec="' + n + '|' + bc + '|' + best.w + '">Simular el punto propuesto</button></div></div>';
      } else html += '<div class="note">El modelo calibrado no encuentra región OK en los WELD probados.</div>';
    });
    html += '<p class="muted" style="font-size:12.5px;margin-top:10px">La recomendación combina tus resultados (vía la calibración) con la física del modelo para interpolar entre corridas. No sustituye la confirmación: el modelo no ve variación de material, posición o desgaste del electrodo entre piezas.</p>';
    box.innerHTML = html;
    box.onclick = function (e) {
      var b = e.target.closest('[data-rec]'); if (!b) return; var a = b.dataset.rec.split('|'), n = +a[0], h = +a[1], w = +a[2];
      if (!window.Calib.info(n)) window.Calib.set(n, calRes[n].c, { n: calRes[n].n, acc: calRes[n].acc, lo: calRes[n].lo, hi: calRes[n].hi });
      window.SimUI.load({ nWires: n }, window.SimUI.prog({ uf: +(h * 0.79).toFixed(2), heat: h, dl: 2.6, up: Math.round(w * 0.53), weld: w, down: 40 }, null, null, 0, 0, 150));
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('wzTabs')) return;
    $('wzTabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; step = +b.dataset.s; nav(); });
    $('wzBody').addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (!b) return; step = +b.dataset.go; nav(); $('asistente').scrollIntoView(); });
    nav();
    window.addEventListener('calibchange', function () { var cb = document.querySelector('#asistente'); if (cb && step !== 3 && step !== 4) nav(); });
  });
})();
