/* Interfaz del simulador electro-térmico */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts;
  var $ = function (id) { return document.getElementById(id); };
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  // ---------- definición de controles ----------
  var P = Object.assign({}, S.DEFAULTS, { nWires: 3, heat: 4.0, uf: 3.15, dl: 2.6, up: 240, weld: 450, down: 40, hold: 250 });
  var groups = [
    { name: 'Terminal y control', items: [
      { k: 'nWires', type: 'seg', opts: [[2, '2 alambres'], [3, '3 alambres']], label: 'Alambres en el gancho' },
      { k: 'mode', type: 'seg', opts: [['SCD', 'SCD'], ['PWR', 'PWR'], ['VLT', 'VLT']], label: 'Modo (CTRL)' }
    ] },
    { name: 'Pulso principal', items: [
      { k: 'uf', label: '<abbr title="Corriente al inicio de la rampa de subida">UF</abbr> (kA)', min: 1, max: 6, step: 0.05, d: 2 },
      { k: 'heat', label: '<abbr title="Corriente de la meseta">HEAT</abbr> (kA)', min: 2.5, max: 6, step: 0.05, d: 2 },
      { k: 'dl', label: '<abbr title="Corriente al final de la rampa de bajada">DL</abbr> (kA)', min: 0.5, max: 6, step: 0.05, d: 2 },
      { k: 'up', label: 'UP (ms)', min: 0, max: 500, step: 5, d: 0 },
      { k: 'weld', label: '<abbr title="Tiempo total del pulso; incluye UP y DOWN">WELD</abbr> (ms)', min: 100, max: 800, step: 5, d: 0 },
      { k: 'down', label: 'DOWN (ms)', min: 0, max: 200, step: 5, d: 0 },
      { k: 'hold', label: 'HOLD (ms)', min: 0, max: 600, step: 10, d: 0 }
    ] },
    { name: 'Precalentamiento (pulso previo)', items: [
      { k: 'pre', type: 'seg', opts: [[false, 'No'], [true, 'Sí']], label: 'Pulso previo' },
      { k: 'preI', label: 'Corriente (kA)', min: 0.5, max: 5, step: 0.05, d: 2 },
      { k: 'preT', label: 'Tiempo (ms)', min: 10, max: 400, step: 5, d: 0 },
      { k: 'cool', label: 'COOL entre pulsos (ms)', min: 0, max: 200, step: 5, d: 0 }
    ] },
    { name: 'Electrodo y barra', items: [
      { k: 'wear', label: '<abbr title="Profundidad de la huella que el gancho deja en la cara del electrodo">Cavidad</abbr> (mm)', min: 0, max: 0.8, step: 0.02, d: 2 },
      { k: 'faceDepth', label: '<abbr title="Ancho de la cara en la dirección del ancho del gancho (2 mm)">Ancho de cara</abbr> (mm)', min: 1.5, max: 3.6, step: 0.05, d: 2 },
      { k: 'faceW', label: '<abbr title="Largo de la cara a lo largo del gancho">Largo de cara</abbr> (mm)', min: 3, max: 7, step: 0.1, d: 1 },
      { k: 'Tel0', label: '<abbr title="Temperatura de la punta al empezar (golpes seguidos la calientan)">T inicial punta</abbr> (°C)', min: 30, max: 500, step: 10, d: 0 },
      { k: 'gndCu', type: 'seg', opts: [[false, 'Barra W'], [true, 'Barra Cu']], label: 'Material de la barra' }
    ] },
    { name: 'Avanzado (calibración)', collapsed: true, items: [
      { k: 'fElec', label: 'Factor contacto electrodo', min: 1, max: 6, step: 0.1, d: 1 },
      { k: 'fClose', label: 'Factor contacto del cierre', min: 5, max: 60, step: 1, d: 0 },
      { k: 'zLoss', label: 'Longitud de pérdida 3D (mm)', min: 8, max: 60, step: 1, d: 0 },
      { k: 'Tburn', label: 'T de esmalte (°C)', min: 350, max: 650, step: 10, d: 0 },
      { k: 'Tbond', label: 'T de unión (°C)', min: 550, max: 950, step: 10, d: 0 },
      { k: 'Rref', label: 'R ref. PWR/VLT (mΩ)', min: 0.18, max: 0.4, step: 0.005, d: 3 }
    ] }
  ];
  var PRESETS = [
    { name: '2 alambres · referencia', p: { nWires: 2, heat: 4.2, uf: 3.31, dl: 2.6, up: 220, weld: 405, down: 40, mode: 'SCD', wear: 0, faceDepth: 3, pre: false } },
    { name: '2 alambres · +10%', p: { nWires: 2, heat: 4.62, uf: 3.31, dl: 2.6, up: 220, weld: 405, down: 40, mode: 'SCD', wear: 0, faceDepth: 3, pre: false } },
    { name: '3 alambres · actual', p: { nWires: 3, heat: 4.0, uf: 3.15, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'SCD', wear: 0, faceDepth: 3, pre: false } },
    { name: '3 alambres · −15%', p: { nWires: 3, heat: 3.4, uf: 2.68, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'SCD', wear: 0, faceDepth: 3, pre: false } },
    { name: '3 alambres · corto y fuerte', p: { nWires: 3, heat: 4.25, uf: 3.36, dl: 2.6, up: 160, weld: 300, down: 40, mode: 'SCD', wear: 0, faceDepth: 3, pre: false } },
    { name: '3 alambres · precalentamiento', p: { nWires: 3, heat: 4.0, uf: 3.15, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'SCD', wear: 0, faceDepth: 3, pre: true, preI: 2.8, preT: 150, cool: 30 } },
    { name: 'Electrodo gastado', p: { nWires: 3, heat: 4.0, uf: 3.15, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'SCD', wear: 0.4, faceDepth: 3, pre: false } },
    { name: 'Gastado + técnico sube corriente', p: { nWires: 3, heat: 4.4, uf: 3.15, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'SCD', wear: 0.4, faceDepth: 3, pre: false } },
    { name: 'Cara angosta', p: { nWires: 3, heat: 3.9, uf: 3.1, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'SCD', wear: 0, faceDepth: 1.75, pre: false } },
    { name: 'Modo PWR', p: { nWires: 3, heat: 4.0, uf: 3.15, dl: 2.6, up: 240, weld: 450, down: 40, mode: 'PWR', wear: 0, faceDepth: 3, pre: false } }
  ];

  var inputs = {};
  function buildControls() {
    var box = $('simControls'), h = '';
    h += '<div class="ctl-group"><div class="gh">Casos</div><div class="presets" id="presets">' +
      PRESETS.map(function (pr, i) { return '<button class="chip" type="button" data-i="' + i + '">' + pr.name + '</button>'; }).join('') + '</div></div>';
    groups.forEach(function (g, gi) {
      var inner = '';
      g.items.forEach(function (it) {
        if (it.type === 'seg') {
          inner += '<div class="row" style="grid-template-columns:1fr 170px"><label>' + it.label + '</label><div class="seg" data-k="' + it.k + '">' +
            it.opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
        } else {
          inner += '<div class="row"><label for="in_' + it.k + '">' + it.label + '</label><input type="range" id="in_' + it.k + '" data-k="' + it.k + '" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '"><output id="out_' + it.k + '"></output></div>';
        }
      });
      if (g.collapsed) h += '<details class="ctl-group" style="border:0;padding:8px 0;border-top:1px solid var(--line);border-radius:0"><summary class="gh" style="display:list-item">' + g.name + '</summary>' + inner + '</details>';
      else h += '<div class="ctl-group"><div class="gh">' + g.name + '<span id="gx' + gi + '"></span></div>' + inner + '</div>';
    });
    h += '<div class="ctl-group"><div class="note" id="e10" style="margin-bottom:8px"></div><div class="btns"><button class="btn" id="runBtn" type="button">Simular</button><button class="btn ghost" id="refBtn" type="button" disabled>Fijar como referencia</button><button class="btn ghost" id="clrBtn" type="button" disabled>Quitar ref.</button></div><div class="progress"><i id="prog"></i></div><div class="muted" style="font-size:12px;margin-top:6px" id="runInfo">Cada corrida tarda de 3 a 10 s según el equipo.</div></div>';
    box.innerHTML = h;
    groups.forEach(function (g) { g.items.forEach(function (it) { inputs[it.k] = it; }); });
    box.querySelectorAll('input[type=range]').forEach(function (inp) {
      inp.addEventListener('input', function () { var k = inp.dataset.k; P[k] = parseFloat(inp.value); sync(); markPreset(-1); });
    });
    box.querySelectorAll('.seg').forEach(function (sg) {
      sg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var k = sg.dataset.k, v = b.dataset.v;
        P[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        sync(); markPreset(-1);
      });
    });
    $('presets').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var i = +b.dataset.i; Object.assign(P, PRESETS[i].p); sync(); markPreset(i); run();
    });
    $('runBtn').addEventListener('click', run);
    $('refBtn').addEventListener('click', function () { if (cur) { ref = cur; $('clrBtn').disabled = false; drawCharts(); } });
    $('clrBtn').addEventListener('click', function () { ref = null; $('clrBtn').disabled = true; drawCharts(); });
  }
  function markPreset(i) { document.querySelectorAll('#presets .chip').forEach(function (c, j) { c.classList.toggle('on', j === i); }); }
  function sync() {
    Object.keys(inputs).forEach(function (k) {
      var it = inputs[k];
      if (it.type === 'seg') {
        document.querySelectorAll('.seg[data-k="' + k + '"] button').forEach(function (b) { b.classList.toggle('on', String(P[k]) === b.dataset.v); });
      } else {
        var inp = $('in_' + k); if (inp && document.activeElement !== inp) inp.value = P[k];
        $('out_' + k).textContent = (+P[k]).toFixed(it.d);
      }
    });
    var ok = P.up + P.down < P.weld;
    var flat = P.weld - P.up - P.down;
    var e = i2t(P);
    $('e10').innerHTML = ok ? 'Meseta a HEAT: <b>' + flat + ' ms</b> · I²t ≈ <b>' + e.toFixed(2) + ' kA²·s</b>' + (P.pre ? ' (incluye pulso previo)' : '') :
      '<b style="color:var(--bad)">E-10:</b> UP + DOWN (' + (P.up + P.down) + ' ms) debe ser menor que WELD (' + P.weld + ' ms). La máquina no arrancaría.';
    $('runBtn').disabled = !ok || busy;
  }
  function i2t(p) {
    var up = p.up / 1e3, w = p.weld / 1e3, dn = p.down / 1e3, H = p.heat;
    var e = up / 3 * (p.uf * p.uf + p.uf * H + H * H) + H * H * Math.max(0, w - up - dn) + dn / 3 * (H * H + H * p.dl + p.dl * p.dl);
    if (p.pre) e += p.preI * p.preI * p.preT / 1e3;
    return e;
  }

  // ---------- ejecución ----------
  var worker = null, busy = false, cur = null, ref = null, frameIdx = 0, layer = 'T', playing = null, reqId = 0;
  try { worker = new Worker('js/sim-worker.js'); } catch (e) { worker = null; }
  function run() {
    if (busy) return;
    if (!(P.up + P.down < P.weld)) return;
    busy = true; sync(); $('prog').style.width = '0%';
    $('runInfo').textContent = 'Simulando…';
    var t0 = performance.now(), id = ++reqId, params = Object.assign({}, P);
    function done(r) {
      busy = false; cur = r; $('refBtn').disabled = false; sync();
      $('prog').style.width = '100%';
      $('runInfo').textContent = 'Listo en ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s · malla ' + r.NX + '×' + r.NY + ' · ' + r.series.length + ' ms simulados.';
      frameIdx = r.frames.length - 1;
      // ir al cuadro de máxima temperatura en el gancho
      var best = 0, bi = 0;
      r.frames.forEach(function (f, i) { var m = 0; for (var n = 0; n < f.T.length; n++) { var mt = r.mat[n]; if ((mt === 2 || mt === 3) && f.T[n] > m) m = f.T[n]; } if (m > best) { best = m; bi = i; } });
      frameIdx = bi;
      $('scrub').max = r.frames.length - 1; $('scrub').value = frameIdx;
      renderAll();
    }
    if (worker) {
      worker.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'progress') $('prog').style.width = Math.round(d.value * 100) + '%';
        else if (d.type === 'done' && d.id === id) done(d.result);
        else if (d.type === 'error') { busy = false; sync(); $('runInfo').textContent = 'Error: ' + d.message; }
      };
      worker.onerror = function () { worker = null; busy = false; run(); };
      worker.postMessage({ id: id, params: params });
    } else {
      setTimeout(function () {
        var p = Object.assign({}, S.DEFAULTS, params), r = S.run(p);
        r.verdict = S.verdict(r.summary); r.params = p; done(r);
      }, 30);
    }
  }

  // ---------- render del corte ----------
  var MATCOL = ['#0e1013', '#7b8794', '#c87a43', '#e09a5c', '#3f8f5a', '#5c6670', '#d1a23c', '#a0aab5', '#808a94', '#97a3b0'];
  function cmapT(t) {
    // 20 → 1400 °C, escala tipo "inferno"
    var x = Math.max(0, Math.min(1, (t - 20) / 1380));
    var stops = [[0, 20, 22, 60], [0.2, 80, 18, 120], [0.4, 170, 40, 110], [0.58, 230, 90, 50], [0.75, 250, 160, 30], [0.9, 250, 225, 90], [1, 255, 255, 220]];
    for (var i = 1; i < stops.length; i++) if (x <= stops[i][0]) {
      var a = stops[i - 1], b = stops[i], f = (x - a[0]) / (b[0] - a[0]);
      return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
    }
    return [255, 255, 220];
  }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function cmapF(f) { // 0 azul → 1 verde
    var a = [70, 110, 190], b = [70, 200, 120];
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
  }
  function drawSection(canvas, r, fr, lay) {
    var ctx = canvas.getContext('2d'), NX = r.NX, NY = r.NY, sc = Math.floor(canvas.width / NX);
    canvas.height = NY * sc;
    var img = ctx.createImageData(NX * sc, NY * sc), d = img.data;
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var n = j * NX + i, m = r.mat[n], col;
      if (m === 0) col = [14, 16, 19];
      else if (lay === 'mat' || !fr) col = hex(MATCOL[m]);
      else if (lay === 'T') col = cmapT(fr.T[n]);
      else if (lay === 'burn') col = m === 4 ? cmapF(fr.burn[n]).map(function (v, q) { return fr.burn[n] >= 1 ? [230, 150, 70][q] : v; }) : grey(m);
      else if (lay === 'bond') col = (m === 4 || m === 6) ? cmapF(fr.bond[n]) : grey(m);
      if (fr && fr.melt && fr.melt[n] > 0.5 && lay !== 'mat') col = [255, 255, 255];
      var py = NY - 1 - j;
      for (var a = 0; a < sc; a++) for (var b = 0; b < sc; b++) {
        var o = ((py * sc + a) * NX * sc + (i * sc + b)) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // bordes entre materiales
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var jj = 0; jj < NY; jj++) for (var ii = 0; ii < NX; ii++) {
      var nn = jj * NX + ii, mm = r.mat[nn];
      if (ii < NX - 1 && grp(r.mat[nn + 1]) !== grp(mm)) { ctx.moveTo((ii + 1) * sc + 0.5, (NY - 1 - jj) * sc); ctx.lineTo((ii + 1) * sc + 0.5, (NY - jj) * sc); }
      if (jj < NY - 1 && grp(r.mat[nn + NX]) !== grp(mm)) { ctx.moveTo(ii * sc, (NY - 1 - jj) * sc + 0.5); ctx.lineTo((ii + 1) * sc, (NY - 1 - jj) * sc + 0.5); }
    }
    ctx.stroke();
    return sc;
  }
  function grp(m) { return m === 3 ? 2 : m === 6 ? 2 : m === 9 ? 1 : m === 7 ? 1 : m === 8 ? 5 : m; }
  function grey(m) { var h = hex(MATCOL[m]); var g = (h[0] + h[1] + h[2]) / 3 * 0.45; return [g, g, g + 4]; }

  function probesXY(r) {
    var inf = r.info, dx = r.dx, mid = Math.floor(r.params.nWires / 2);
    return [
      { k: 'Tw', label: 'Alambre central', x: inf.xW0 + inf.ro + mid * 2 * inf.ro, y: inf.yWc, c: '#4fc3f7' },
      { k: 'Tt', label: 'Gancho-alambre', x: inf.xW0 + inf.ro + mid * 2 * inf.ro, y: inf.yT0 + 0.5 * dx, c: '#ffd54f' },
      { k: 'Tc', label: 'Cierre', x: (inf.xC0 + inf.xC1) / 2, y: inf.yB1 + 0.5 * dx, c: '#81c784' },
      { k: 'Te', label: 'Punta electrodo', x: (inf.xE0 + inf.xE1) / 2, y: inf.yT1 + 1.5 * dx, c: '#e57373' }
    ];
  }
  function renderHeat() {
    if (!cur) return;
    var fr = cur.frames[frameIdx], cv = $('heat');
    var sc = drawSection(cv, cur, fr, layer);
    var ctx = cv.getContext('2d');
    probesXY(cur).forEach(function (p) {
      var x = p.x / cur.dx * sc, y = (cur.NY - p.y / cur.dx) * sc;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = p.c; ctx.stroke();
    });
    ctx.font = '600 22px "IBM Plex Mono", monospace'; ctx.fillStyle = '#fff';
    ctx.fillText(fr.t.toFixed(0) + ' ms  ·  ' + fr.I.toFixed(2) + ' kA', 16, 32);
    $('scrubT').textContent = fr.t.toFixed(0) + ' ms';
    var lg = $('heatLegend');
    if (layer === 'T') lg.innerHTML = '20 °C<div class="bar" style="background:linear-gradient(90deg,rgb(20,22,60),rgb(80,18,120),rgb(170,40,110),rgb(230,90,50),rgb(250,160,30),rgb(250,225,90),rgb(255,255,220))"></div>1400 °C · <span style="color:var(--ink)">■ blanco = cobre fundido</span>';
    else if (layer === 'burn') lg.innerHTML = 'Esmalte intacto<div class="bar" style="background:linear-gradient(90deg,rgb(70,110,190),rgb(70,200,120))"></div>quemándose · <span style="color:#e6964a">■ retirado</span>';
    else if (layer === 'bond') lg.innerHTML = 'Interfaz sin unir<div class="bar" style="background:linear-gradient(90deg,rgb(70,110,190),rgb(70,200,120))"></div>unida';
    else lg.innerHTML = S.MAT_NAMES.map(function (n, i) { return i ? '<span style="display:inline-flex;align-items:center;gap:4px"><i style="width:10px;height:10px;border-radius:2px;background:' + MATCOL[i] + ';display:inline-block"></i>' + n + '</span>' : ''; }).join(' ');
  }
  function hoverSetup() {
    var cv = $('heat'), hr = $('hoverRead');
    cv.addEventListener('mousemove', function (e) {
      if (!cur) return;
      var rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left) / rc.width * cur.NX, y = cur.NY - (e.clientY - rc.top) / rc.height * cur.NY;
      var i = Math.floor(x), j = Math.floor(y); if (i < 0 || j < 0 || i >= cur.NX || j >= cur.NY) return;
      var n = j * cur.NX + i, m = cur.mat[n], fr = cur.frames[frameIdx];
      if (m === 0) { hr.style.display = 'none'; return; }
      var s = S.MAT_NAMES[m] + ' · ' + fr.T[n].toFixed(0) + ' °C';
      if (m === 4) s += ' · esmalte ' + Math.round((1 - fr.burn[n]) * 100) + '% · unión ' + Math.round(fr.bond[n] * 100) + '%';
      if (m === 6) s += ' · unión ' + Math.round(fr.bond[n] * 100) + '%';
      if (fr.melt[n] > 0.5) s += ' · FUNDIDO';
      s += ' · (' + (x * cur.dx * 1e3).toFixed(2) + ', ' + (y * cur.dx * 1e3).toFixed(2) + ') mm';
      hr.textContent = s; hr.style.display = 'block';
      hr.style.left = (e.clientX - rc.left) + 'px'; hr.style.top = (e.clientY - rc.top) + 'px';
    });
    cv.addEventListener('mouseleave', function () { hr.style.display = 'none'; });
  }

  // ---------- gráficas y métricas ----------
  function col(s) { return s.map(function (o) { return o; }); }
  function drawCharts() {
    if (!cur) return;
    var tNow = cur.frames[frameIdx].t, s = cur.series, rs = ref && ref.series;
    var T = function (arr, k, sc) { return arr.map(function (o) { return o[k] * (sc || 1); }); };
    var tt = T(s, 't'), rt = rs && T(rs, 't');
    var xMax = Math.max(tt[tt.length - 1], rt ? rt[rt.length - 1] : 0);
    var cu = css('--cu'), bl = css('--blue'), vi = css('--violet'), ok = css('--ok'), ink3 = css('--ink-3');
    // corriente
    var ser = [{ x: tt, y: T(s, 'set'), color: ink3, width: 1.5, dash: '4 3' }, { x: tt, y: T(s, 'I'), color: cu, width: 2.2 }];
    if (rs) ser.push({ x: rt, y: T(rs, 'I'), color: cu, width: 1.5, dash: '6 4', opacity: 0.55 });
    C.line($('chI'), { series: ser, xMin: 0, xMax: xMax, yMin: 0, xLabel: 'ms', yLabel: 'kA', cursor: tNow });
    C.legend($('lgI'), [{ color: cu, label: 'Corriente real' }, { color: ink3, label: 'Consigna (kA equivalentes)' }].concat(rs ? [{ color: cu, label: 'Referencia (punteada)' }] : []));
    // temperaturas
    var pc = { Tw: '#2c8fd6', Tt: '#d4a017', Tc: '#3a9a5b', Te: '#d0473b' }, lab = { Tw: 'Alambre central', Tt: 'Gancho-alambre', Tc: 'Cierre', Te: 'Punta electrodo' };
    var serT = [];
    Object.keys(pc).forEach(function (k) { serT.push({ x: tt, y: T(s, k), color: pc[k], width: 2 }); if (rs) serT.push({ x: rt, y: T(rs, k), color: pc[k], width: 1.4, dash: '6 4', opacity: 0.5 }); });
    C.line($('chT'), { series: serT, xMin: 0, xMax: xMax, yMin: 0, yMax: Math.max(1300, cur.summary.peaks.Te * 1.05), xLabel: 'ms', yLabel: '°C', cursor: tNow,
      hlines: [{ y: cur.params.Tburn, color: '#6b7a8c', label: 'esmalte' }, { y: cur.params.Tbond, color: '#3a9a5b', label: 'unión' }, { y: 1083, color: '#d0473b', label: 'Cu funde' }] });
    C.legend($('lgT'), Object.keys(pc).map(function (k) { return { color: pc[k], label: lab[k] }; }));
    // R y P
    var serR = [{ x: tt, y: T(s, 'R'), color: vi, width: 2 }, { x: tt, y: T(s, 'P'), color: cu, width: 2, axis: 2 }];
    if (rs) { serR.push({ x: rt, y: T(rs, 'R'), color: vi, width: 1.4, dash: '6 4', opacity: 0.5 }); serR.push({ x: rt, y: T(rs, 'P'), color: cu, width: 1.4, dash: '6 4', opacity: 0.5, axis: 2 }); }
    C.line($('chR'), { series: serR.map(function (q) { if (q.axis !== 2) q.y = q.y.map(function (v, i) { return s[i] && s[i].I === 0 && q.x === tt ? NaN : v; }); return q; }), xMin: 0, xMax: xMax, yMin: 0, xLabel: 'ms', yLabel: 'mΩ', y2Label: 'kW', cursor: tNow });
    C.legend($('lgR'), [{ color: vi, label: 'R medida entre electrodos (mΩ)' }, { color: cu, label: 'Potencia (kW)' }]);
    // progreso
    var serB = [{ x: tt, y: T(s, 'burn', 100), color: '#6b7a8c', width: 2 }, { x: tt, y: T(s, 'bondW', 100), color: '#2c8fd6', width: 2 }, { x: tt, y: T(s, 'bondC', 100), color: ok, width: 2 }, { x: tt, y: T(s, 'melt'), color: '#d0473b', width: 2, axis: 2 }];
    if (rs) serB.push({ x: rt, y: T(rs, 'bondC', 100), color: ok, width: 1.4, dash: '6 4', opacity: 0.5 });
    C.line($('chB'), { series: serB, xMin: 0, xMax: xMax, yMin: 0, yMax: 105, y2Min: 0, y2Max: Math.max(2, cur.summary.melt * 1.2), xLabel: 'ms', yLabel: '%', y2Label: 'mm² fundidos', cursor: tNow });
    C.legend($('lgB'), [{ color: '#6b7a8c', label: 'Esmalte retirado' }, { color: '#2c8fd6', label: 'Alambres unidos' }, { color: ok, label: 'Cierre unido' }, { color: '#d0473b', label: 'Cobre fundido (mm², eje der.)' }]);
  }
  function metric(label, v, d, frac, cls) {
    return '<div class="metric"><div class="l">' + label + '</div><div class="v"' + (cls ? ' style="color:var(--' + cls + ')"' : '') + '>' + v + '</div>' + (d ? '<div class="d muted">' + d + '</div>' : '') + (frac != null ? '<div class="meter"><i style="width:' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%"></i></div>' : '') + '</div>';
  }
  function diff(a, b, dec, unit) { if (b == null) return ''; var d = a - b; return (d >= 0 ? '+' : '') + d.toFixed(dec) + (unit || '') + ' vs ref.'; }
  function renderMetrics() {
    var s = cur.summary, r = ref && ref.summary, v = cur.verdict;
    var vd = $('verdict'); vd.className = 'verdict ' + v.cls;
    vd.innerHTML = '<div class="big">' + v.code + '</div><div><b>' + v.text + '</b><div class="muted" style="margin-top:4px">' +
      cur.params.nWires + ' alambres · ' + cur.params.mode + ' · HEAT ' + cur.params.heat.toFixed(2) + ' kA · WELD ' + cur.params.weld + ' ms' + (cur.params.pre ? ' · con precalentamiento' : '') + (cur.params.wear > 0 ? ' · cavidad ' + cur.params.wear.toFixed(2) + ' mm' : '') + '</div></div>';
    var maxPulse = Math.max.apply(null, cur.series.map(function (o) { return o.pulse; }));
    var Imean = 0, nI = 0; cur.series.forEach(function (o) { if (o.I > 0) { Imean += o.I; nI++; } }); Imean = nI ? Imean / nI : 0;
    $('metrics').innerHTML =
      metric('Esmalte retirado', Math.round(s.burn * 100) + '%', s.tBurn ? 'completo a los ' + s.tBurn.toFixed(0) + ' ms' : 'no se completó', s.burn) +
      metric('Alambres unidos', Math.round(s.bondW * 100) + '%', diff(s.bondW * 100, r && r.bondW * 100, 0, ' pts'), s.bondW) +
      metric('Cierre unido', Math.round(s.bondC * 100) + '%', diff(s.bondC * 100, r && r.bondC * 100, 0, ' pts'), s.bondC) +
      metric('Cobre fundido', s.melt.toFixed(2) + ' mm²', s.melt > 1 ? 'quemada' : s.melt > 0.3 ? 'superficial' : 'sin fusión', null, s.melt > 1 ? 'bad' : s.melt > 0.3 ? 'warn' : null) +
      metric('Pico punta electrodo', s.peaks.Te.toFixed(0) + ' °C', diff(s.peaks.Te, r && r.peaks.Te, 0, ' °C'), null, s.peaks.Te > 1300 ? 'bad' : null) +
      metric('Pico alambre central', s.peaks.Tw.toFixed(0) + ' °C', diff(s.peaks.Tw, r && r.peaks.Tw, 0, ' °C')) +
      metric('Energía eléctrica', s.Eel.toFixed(0) + ' J', 'corriente media ' + Imean.toFixed(2) + ' kA') +
      metric('Calor en el cobre', s.Ejoint.toFixed(0) + ' J', (s.Ejoint / s.Eel * 100).toFixed(1) + '% de la energía · PULSE máx ' + maxPulse.toFixed(0) + '%');
  }
  function renderAll() { renderHeat(); drawCharts(); renderMetrics(); }

  function init() {
    buildControls(); sync(); hoverSetup();
    $('scrub').addEventListener('input', function () { frameIdx = +this.value; renderHeat(); drawCharts(); });
    $('layerSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; layer = b.dataset.l;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); renderHeat();
    });
    $('playBtn').addEventListener('click', function () {
      if (!cur) return;
      if (playing) { clearInterval(playing); playing = null; this.textContent = '▶ Reproducir'; return; }
      var btn = this; btn.textContent = '❚❚ Pausa'; if (frameIdx >= cur.frames.length - 1) frameIdx = 0;
      playing = setInterval(function () {
        frameIdx++; if (frameIdx >= cur.frames.length) { frameIdx = cur.frames.length - 1; clearInterval(playing); playing = null; btn.textContent = '▶ Reproducir'; }
        $('scrub').value = frameIdx; renderHeat(); drawCharts();
      }, 70);
    });
    // geometría inicial en el visor
    var g = S.buildGeometry(Object.assign({}, S.DEFAULTS, P));
    cur = null;
    var pseudo = { NX: g.NX, NY: g.NY, mat: Array.from(g.mat), dx: g.dx };
    drawSection($('heat'), pseudo, null, 'mat');
    markPreset(2);
    run();
    window.addEventListener('themechange', function () { if (cur) drawCharts(); });
  }

  window.SimUI = {
    load: function (p) { Object.assign(P, p); sync(); markPreset(-1); document.getElementById('simulador').scrollIntoView(); run(); },
    drawSection: drawSection, MATCOL: MATCOL
  };
  document.addEventListener('DOMContentLoaded', init);
})();
