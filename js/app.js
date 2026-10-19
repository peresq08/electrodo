/* Interfaz del simulador electro-térmico */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts, PU = window.PulseUI;
  var $ = function (id) { return document.getElementById(id); };
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  // ---------- estado ----------
  var AWG = { 14: 1.628, 15: 1.450, 16: 1.291, 17: 1.150, 18: 1.024, 19: 0.912, 20: 0.812, 21: 0.723, 22: 0.644 };
  var P = Object.assign({}, S.DEFAULTS, { nWires: 3, awg: 17 });
  var GEO0 = { awg: 17, thick: 1.0, hookLen: 8.5, elecX: 0, faceW: 4.5 };
  var GEO_KEYS = ['nWires', 'awg', 'thick', 'hookLen', 'elecX', 'faceW', 'faceDepth'];
  var PROG = PU.defaultProgram();
  function pw(o) { return S.pulseOf(Object.assign({ on: true, ctrl: 'SCD', puls: 1, intv: 0 }, o)); }
  function prog(we1, we2, we3, cool1, cool2, hold) { return { we: [we1 ? pw(we1) : S.pulseOf({}), we2 ? pw(we2) : S.pulseOf({}), we3 ? pw(we3) : S.pulseOf({})], cool1: cool1 || 0, cool2: cool2 || 0, hold: hold == null ? 250 : hold }; }
  var T3 = { uf: 3.15, heat: 4.0, dl: 2.6, up: 240, weld: 450, down: 40 };
  var E_T3 = S.energyOf(prog(T3)).total;
  var EL0 = { wear: 0, faceDepth: 3, awg: 17, thick: 1.0, hookLen: 8.5, elecX: 0, faceW: 4.5 };

  var groups = [
    { name: 'Terminal y posición', items: [
      { k: 'nWires', type: 'seg', opts: [[1, '1'], [2, '2'], [3, '3'], [4, '4']], label: 'Alambres en el gancho' },
      { k: 'awg', type: 'select', opts: [[14, '14 AWG · Ø1.63'], [15, '15 AWG · Ø1.45'], [16, '16 AWG · Ø1.29'], [17, '17 AWG · Ø1.15'], [18, '18 AWG · Ø1.02'], [19, '19 AWG · Ø0.91'], [20, '20 AWG · Ø0.81'], [21, '21 AWG · Ø0.72'], [22, '22 AWG · Ø0.64']], label: 'Calibre del alambre' },
      { k: 'thick', label: '<abbr title="Espesor del material de la terminal">Espesor terminal</abbr> (mm)', min: 0.5, max: 1.5, step: 0.05, d: 2 },
      { k: 'hookLen', label: '<abbr title="Largo desarrollado del gancho; define cuánto gancho queda libre para cerrar">Largo de gancho</abbr> (mm)', min: 5, max: 12, step: 0.1, d: 1 },
      { k: 'elecX', label: '<abbr title="Corrimiento del centro del electrodo a lo largo del gancho: negativo hacia el doblez, positivo hacia el cierre">Posición del electrodo</abbr> (mm)', min: -2.5, max: 2.5, step: 0.05, d: 2 },
      { k: 'faceW', label: '<abbr title="Largo de la cara a lo largo del gancho">Largo de cara</abbr> (mm)', min: 2, max: 8, step: 0.1, d: 1 }
    ] },
    { name: 'Electrodo y barra', items: [
      { k: 'wear', label: '<abbr title="Profundidad de la huella que el gancho deja en la cara del electrodo">Cavidad</abbr> (mm)', min: 0, max: 0.8, step: 0.02, d: 2 },
      { k: 'faceDepth', label: '<abbr title="Ancho de la cara en la dirección del ancho del gancho (2 mm)">Ancho de cara</abbr> (mm)', min: 1.5, max: 3.6, step: 0.05, d: 2 },
      { k: 'Tel0', label: '<abbr title="Temperatura de la punta al empezar (golpes seguidos la calientan)">T inicial punta</abbr> (°C)', min: 30, max: 500, step: 10, d: 0 },
      { k: 'gndCu', type: 'seg', opts: [[false, 'Barra W'], [true, 'Barra Cu']], label: 'Material de la barra' }
    ] },
    { name: 'Avanzado (modelo)', collapsed: true, items: [
      { k: 'fElec', label: 'Factor contacto electrodo', min: 1, max: 6, step: 0.1, d: 1 },
      { k: 'fClose', label: 'Factor contacto del cierre', min: 5, max: 60, step: 1, d: 0 },
      { k: 'zLoss', label: 'Longitud de pérdida 3D (mm)', min: 8, max: 60, step: 1, d: 0 },
      { k: 'Tburn', label: 'T de esmalte (°C)', min: 350, max: 650, step: 10, d: 0 },
      { k: 'Tbond', label: 'T de unión (°C)', min: 550, max: 950, step: 10, d: 0 },
      { k: 'Rref', label: 'R ref. PWR/VLT (mΩ)', min: 0.18, max: 0.4, step: 0.005, d: 3 }
    ] }
  ];
  var PRESETS = [
    { name: '2 alambres · referencia', p: { nWires: 2 }, g: prog({ uf: 3.31, heat: 4.2, dl: 2.6, up: 220, weld: 405, down: 40 }) },
    { name: '2 alambres · +10%', p: { nWires: 2 }, g: prog({ uf: 3.31, heat: 4.62, dl: 2.6, up: 220, weld: 405, down: 40 }) },
    { name: '3 alambres · actual', p: { nWires: 3 }, g: prog(T3) },
    { name: '3 alambres · −15%', p: { nWires: 3 }, g: prog({ uf: 2.68, heat: 3.4, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { name: '3 alambres · corto y fuerte', p: { nWires: 3 }, g: prog({ uf: 3.36, heat: 4.25, dl: 2.6, up: 160, weld: 300, down: 40 }) },
    { name: 'Precalentamiento + principal', p: { nWires: 3 }, g: prog({ uf: 2.8, heat: 2.8, dl: 2.8, up: 0, weld: 150, down: 0 }, T3, null, 30) },
    { name: 'Principal + post-calentamiento', p: { nWires: 3 }, g: prog(T3, { uf: 2.5, heat: 2.5, dl: 2.5, up: 0, weld: 150, down: 0 }, null, 10) },
    { name: 'Pulsación 3 × 150 ms', p: { nWires: 3 }, g: prog({ uf: 3.73, heat: 3.73, dl: 3.73, up: 0, weld: 150, down: 0, puls: 3, intv: 30 }) },
    { name: 'VLT para esmalte + SCD', p: { nWires: 3 }, g: prog({ ctrl: 'VLT', uf: 4.0, heat: 4.0, dl: 4.0, up: 0, weld: 120, down: 0 }, { uf: 3.6, heat: 4.0, dl: 2.6, up: 100, weld: 330, down: 40 }, null, 5) },
    { name: '+ dos pulsos de 0.5 kA', p: { nWires: 3 }, g: prog(T3, { uf: 0.5, heat: 0.5, dl: 0.5, up: 0, weld: 100, down: 0 }, { uf: 0.5, heat: 0.5, dl: 0.5, up: 0, weld: 100, down: 0 }, 20, 20) },
    { name: 'Electrodo gastado', p: { nWires: 3, wear: 0.4 }, g: prog(T3) },
    { name: 'Gastado + técnico sube corriente', p: { nWires: 3, wear: 0.4 }, g: prog({ uf: 3.15, heat: 4.4, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { name: 'Electrodo corrido hacia el cierre', p: { nWires: 3, elecX: 1.5 }, g: prog(T3) },
    { name: 'Electrodo corrido hacia el doblez', p: { nWires: 3, elecX: -1.5 }, g: prog(T3) },
    { name: 'Cara angosta', p: { nWires: 3, faceDepth: 1.75 }, g: prog({ uf: 3.1, heat: 3.9, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { name: 'Modo PWR', p: { nWires: 3 }, g: prog(Object.assign({ ctrl: 'PWR' }, T3)) }
  ];

  var inputs = {}, pulseEd = null;
  function buildControls() {
    var box = $('simControls'), h = '';
    h += '<div class="ctl-group"><div class="gh">Casos</div><div class="presets" id="presets">' +
      PRESETS.map(function (pr, i) { return '<button class="chip" type="button" data-i="' + i + '">' + pr.name + '</button>'; }).join('') + '</div></div>';
    h += '<div class="ctl-group" id="calibBox"></div>';
    groups.forEach(function (g, gi) {
      var inner = '';
      g.items.forEach(function (it) {
        if (it.type === 'seg') {
          inner += '<div class="row" style="grid-template-columns:1fr 170px"><label>' + it.label + '</label><div class="seg" data-k="' + it.k + '">' +
            it.opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
        } else if (it.type === 'select') {
          inner += '<div class="row" style="grid-template-columns:1fr 170px"><label>' + it.label + '</label><select data-k="' + it.k + '" id="in_' + it.k + '">' + it.opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>';
        } else {
          inner += '<div class="row"><label for="in_' + it.k + '">' + it.label + '</label><input type="range" id="in_' + it.k + '" data-k="' + it.k + '" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '"><output id="out_' + it.k + '"></output></div>';
        }
      });
      var block = g.collapsed ? '<details class="ctl-group" style="border:0;padding:8px 0;border-top:1px solid var(--line);border-radius:0"><summary class="gh" style="display:list-item">' + g.name + '</summary>' + inner + '</details>'
        : '<div class="ctl-group"><div class="gh">' + g.name + '</div>' + inner + '</div>';
      h += block;
      if (gi === 0) h += '<div class="ctl-group"><div class="gh">Programa de pulsos <span>WE1 → COOL1 → WE2 → COOL2 → WE3 → HOLD</span></div><div id="simPulses"></div></div>';
    });
    h += '<div class="ctl-group"><div class="btns"><button class="btn" id="runBtn" type="button">Simular</button><button class="btn ghost" id="refBtn" type="button" disabled>Fijar como referencia</button><button class="btn ghost" id="clrBtn" type="button" disabled>Quitar ref.</button></div><div class="progress"><i id="prog"></i></div><div class="muted" style="font-size:12px;margin-top:6px" id="runInfo">Cada corrida tarda de 1 a 4 s según el equipo.</div></div>';
    box.innerHTML = h;
    groups.forEach(function (g) { g.items.forEach(function (it) { inputs[it.k] = it; }); });
    pulseEd = PU.create($('simPulses'), PROG, function () { markPreset(-1); sync(); });
    box.querySelectorAll('input[type=range][data-k]').forEach(function (inp) {
      inp.addEventListener('input', function () { P[inp.dataset.k] = parseFloat(inp.value); sync(); markPreset(-1); geoPreview(inp.dataset.k); });
    });
    box.querySelectorAll('select[data-k]').forEach(function (sel) {
      sel.addEventListener('change', function () { P[sel.dataset.k] = +sel.value; sync(); markPreset(-1); geoPreview(sel.dataset.k); });
    });
    box.querySelectorAll('.seg[data-k]').forEach(function (sg) {
      sg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var k = sg.dataset.k, v = b.dataset.v;
        P[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        sync(); markPreset(-1); geoPreview(k);
      });
    });
    $('presets').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var i = +b.dataset.i; applyPreset(PRESETS[i]); markPreset(i); run();
    });
    $('runBtn').addEventListener('click', run);
    $('refBtn').addEventListener('click', function () { if (cur) { ref = cur; $('clrBtn').disabled = false; drawCharts(); renderMetrics(); } });
    $('clrBtn').addEventListener('click', function () { ref = null; $('clrBtn').disabled = true; drawCharts(); renderMetrics(); });
  }
  function setProgram(g) {
    PROG.we = g.we.map(function (w) { return Object.assign({}, w); });
    PROG.cool1 = g.cool1 || 0; PROG.cool2 = g.cool2 || 0; if (g.hold != null) PROG.hold = g.hold;
    pulseEd.select(PROG.we[1].on && !PROG.we[0].on ? 1 : 0);
  }
  function applyPreset(pr) { Object.assign(P, EL0, pr.p); setProgram(pr.g); sync(); }
  function markPreset(i) { document.querySelectorAll('#presets .chip').forEach(function (c, j) { c.classList.toggle('on', j === i); }); }
  function calibBox() {
    var c = window.Calib, f = c.get(P.nWires), info = c.info(P.nWires), box = $('calibBox');
    if (!box) return;
    if (!isDefaultGeo()) { box.innerHTML = '<div class="note" style="font-size:12.5px">Geometría distinta a la de referencia (2–3 alambres 17 AWG, terminal de 1 mm, gancho de 8.5 mm): se simula <b>sin calibración</b>. Úsalo para comparar contra la referencia, no para fijar parámetros.</div>'; return; }
    if (!info) { box.innerHTML = '<div class="note" style="font-size:12.5px">Modelo <b>sin calibrar</b> para ' + P.nWires + ' alambres. Captura tus resultados en el <a href="#asistente">Asistente de DOE</a> para ajustarlo a tu máquina.</div>'; return; }
    box.innerHTML = '<div class="note" style="font-size:12.5px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="calOn"' + (c.enabled() ? ' checked' : '') + '> Usar calibración con mis datos</label>' +
      '<div style="margin-top:4px">' + P.nWires + ' alambres: corriente efectiva <b>×' + info.c.toFixed(3) + '</b> (' + info.n + ' corridas, ' + Math.round(info.acc * 100) + '% de acierto)</div></div>';
    $('calOn').onchange = function () { c.setEnabled(this.checked); };
  }
  function sync() {
    Object.keys(inputs).forEach(function (k) {
      var it = inputs[k];
      if (it.type === 'seg') {
        document.querySelectorAll('.seg[data-k="' + k + '"] button').forEach(function (b) { b.classList.toggle('on', String(P[k]) === b.dataset.v); });
      } else if (it.type === 'select') {
        $('in_' + k).value = String(P[k]);
      } else {
        var inp = $('in_' + k); if (inp && document.activeElement !== inp) inp.value = P[k];
        $('out_' + k).textContent = (+P[k]).toFixed(it.d);
      }
    });
    if (pulseEd) pulseEd.render();
    calibBox();
    $('runBtn').disabled = S.checkProgram(PROG).length > 0 || busy;
  }
  function isDefaultGeo() { return (P.nWires === 2 || P.nWires === 3) && P.awg === 17 && P.thick === 1.0 && P.hookLen === 8.5; }
  var geoTimer = null;
  function geoPreview(k) {
    if (GEO_KEYS.indexOf(k) < 0) return;
    clearTimeout(geoTimer);
    geoTimer = setTimeout(function () {
      var p = params(), g = S.buildGeometry(Object.assign({}, S.DEFAULTS, p));
      drawSection($('heat'), { NX: g.NX, NY: g.NY, mat: Array.from(g.mat), dx: g.dx }, null, 'mat');
      var ctx = $('heat').getContext('2d'); ctx.font = '600 22px "IBM Plex Sans", sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('Vista previa de la geometría · presiona Simular', 16, 32);
      $('heatLegend').textContent = 'Gancho libre para cerrar: ' + (g.info.free * 1e3).toFixed(2) + ' mm · electrodo de ' + (g.info.xE0 * 1e3).toFixed(2) + ' a ' + (g.info.xE1 * 1e3).toFixed(2) + ' mm · gancho de ' + (g.info.xL * 1e3).toFixed(2) + ' a ' + (g.info.xT1 * 1e3).toFixed(2) + ' mm' + (g.info.xE1 > g.info.xT1 + 1e-6 ? ' · el electrodo sobresale del gancho' : '');
    }, 120);
  }
  function params() {
    var p = Object.assign({}, P, { we: PROG.we, cool1: PROG.cool1, cool2: PROG.cool2, hold: PROG.hold });
    var d = AWG[P.awg] || 1.15; p.wireCore = d / 2 - 0.025; p.wireDiam = d + 0.05;
    p.iCal = isDefaultGeo() ? window.Calib.get(P.nWires) : 1;
    return JSON.parse(JSON.stringify(p));
  }

  // ---------- ejecución ----------
  var worker = null, busy = false, cur = null, ref = null, frameIdx = 0, layer = 'T', playing = null, reqId = 0;
  try { worker = new Worker('js/sim-worker.js'); } catch (e) { worker = null; }
  function simulate(params, onProg) {
    // promesa reutilizable (también la usan otros módulos)
    return new Promise(function (resolve, reject) {
      var id = ++reqId;
      if (worker) {
        var h = function (e) {
          var d = e.data; if (d.id !== id && d.type !== 'progress') return;
          if (d.type === 'progress') { if (onProg) onProg(d.value); return; }
          worker.removeEventListener('message', h);
          if (d.type === 'done') resolve(d.result); else reject(new Error(d.message));
        };
        worker.addEventListener('message', h);
        worker.postMessage({ id: id, params: params });
      } else {
        setTimeout(function () {
          try { var p = Object.assign({}, S.DEFAULTS, params), r = S.run(p); r.verdict = S.verdict(r.summary); r.params = p; resolve(r); } catch (err) { reject(err); }
        }, 20);
      }
    });
  }
  var queue = Promise.resolve();
  function enqueue(params, onProg) { var pr = queue.then(function () { return simulate(params, onProg); }); queue = pr.catch(function () {}); return pr; }
  function run() {
    if (busy) return;
    if (S.checkProgram(PROG).length) return;
    busy = true; sync(); $('prog').style.width = '0%';
    $('runInfo').textContent = 'Simulando…';
    var t0 = performance.now();
    enqueue(params(), function (v) { $('prog').style.width = Math.round(v * 100) + '%'; }).then(function (r) {
      busy = false; cur = r; $('refBtn').disabled = false; sync();
      $('prog').style.width = '100%';
      $('runInfo').textContent = 'Listo en ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s · malla ' + r.NX + '×' + r.NY + ' · ' + r.series.length + ' ms simulados' + (r.params.iCal !== 1 ? ' · calibrado ×' + r.params.iCal.toFixed(3) : '') + '.';
      var best = 0, bi = 0;
      r.frames.forEach(function (f, i) { var m = 0; for (var n = 0; n < f.T.length; n++) { var mt = r.mat[n]; if ((mt === 2 || mt === 3) && f.T[n] > m) m = f.T[n]; } if (m > best) { best = m; bi = i; } });
      frameIdx = bi;
      $('scrub').max = r.frames.length - 1; $('scrub').value = frameIdx;
      renderAll();
    }).catch(function (err) { busy = false; sync(); $('runInfo').textContent = 'Error: ' + err.message; });
  }

  // ---------- render del corte ----------
  var MATCOL = ['#0e1013', '#7b8794', '#c87a43', '#e09a5c', '#3f8f5a', '#5c6670', '#d1a23c', '#a0aab5', '#808a94', '#97a3b0'];
  function cmapT(t) {
    var x = Math.max(0, Math.min(1, (t - 20) / 1380));
    var stops = [[0, 20, 22, 60], [0.2, 80, 18, 120], [0.4, 170, 40, 110], [0.58, 230, 90, 50], [0.75, 250, 160, 30], [0.9, 250, 225, 90], [1, 255, 255, 220]];
    for (var i = 1; i < stops.length; i++) if (x <= stops[i][0]) {
      var a = stops[i - 1], b = stops[i], f = (x - a[0]) / (b[0] - a[0]);
      return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
    }
    return [255, 255, 220];
  }
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function cmapF(f) { var a = [70, 110, 190], b = [70, 200, 120]; return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])]; }
  function grp(m) { return m === 3 ? 2 : m === 6 ? 2 : m === 9 ? 1 : m === 7 ? 1 : m === 8 ? 5 : m; }
  function grey(m) { var h = hex(MATCOL[m]); var g = (h[0] + h[1] + h[2]) / 3 * 0.45; return [g, g, g + 4]; }
  function drawSection(canvas, r, fr, lay) {
    var ctx = canvas.getContext('2d'), NX = r.NX, NY = r.NY, sc = Math.max(4, Math.floor(840 / NX));
    canvas.width = NX * sc; canvas.height = NY * sc;
    var img = ctx.createImageData(NX * sc, NY * sc), d = img.data;
    for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
      var n = j * NX + i, m = r.mat[n], col;
      if (m === 0) col = [14, 16, 19];
      else if (lay === 'mat' || !fr) col = hex(MATCOL[m]);
      else if (lay === 'T') col = cmapT(fr.T[n]);
      else if (lay === 'burn') col = m === 4 ? (fr.burn[n] >= 1 ? [230, 150, 70] : cmapF(fr.burn[n])) : grey(m);
      else if (lay === 'bond') col = (m === 4 || m === 6) ? cmapF(fr.bond[n]) : grey(m);
      if (fr && fr.melt && fr.melt[n] > 0.5 && lay !== 'mat') col = [255, 255, 255];
      var py = NY - 1 - j;
      for (var a = 0; a < sc; a++) for (var b = 0; b < sc; b++) {
        var o = ((py * sc + a) * NX * sc + (i * sc + b)) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var jj = 0; jj < NY; jj++) for (var ii = 0; ii < NX; ii++) {
      var nn = jj * NX + ii, mm = r.mat[nn];
      if (ii < NX - 1 && grp(r.mat[nn + 1]) !== grp(mm)) { ctx.moveTo((ii + 1) * sc + 0.5, (NY - 1 - jj) * sc); ctx.lineTo((ii + 1) * sc + 0.5, (NY - jj) * sc); }
      if (jj < NY - 1 && grp(r.mat[nn + NX]) !== grp(mm)) { ctx.moveTo(ii * sc, (NY - 1 - jj) * sc + 0.5); ctx.lineTo((ii + 1) * sc, (NY - 1 - jj) * sc + 0.5); }
    }
    ctx.stroke();
    return sc;
  }
  function probesXY(r) {
    var inf = r.info, dx = r.dx, mid = Math.floor(r.params.nWires / 2);
    return [
      { x: inf.xW0 + inf.ro + mid * 2 * inf.ro, y: inf.yWc, c: '#4fc3f7' },
      { x: inf.xW0 + inf.ro + mid * 2 * inf.ro, y: inf.yT0 + 0.5 * dx, c: '#ffd54f' },
      { x: (inf.xC0 + inf.xC1) / 2, y: inf.yB1 + 0.5 * dx, c: '#81c784' },
      { x: (inf.xE0 + inf.xE1) / 2, y: inf.yT1 + 1.5 * dx, c: '#e57373' }
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
    var sr = cur.series[Math.min(cur.series.length - 1, Math.round(fr.t))];
    ctx.font = '600 22px "IBM Plex Mono", monospace'; ctx.fillStyle = '#fff';
    ctx.fillText(fr.t.toFixed(0) + ' ms  ·  ' + fr.I.toFixed(2) + ' kA' + (sr && sr.we > 0 && fr.I > 0 ? '  ·  WE' + sr.we : ''), 16, 32);
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
  function drawCharts() {
    if (!cur) return;
    var tNow = cur.frames[frameIdx].t, s = cur.series, rs = ref && ref.series;
    var T = function (arr, k, sc) { return arr.map(function (o) { return o[k] * (sc || 1); }); };
    var tt = T(s, 't'), rt = rs && T(rs, 't');
    var xMax = Math.max(tt[tt.length - 1], rt ? rt[rt.length - 1] : 0);
    var cu = css('--cu'), vi = css('--violet'), ok = css('--ok'), ink3 = css('--ink-3');
    // bandas por pulso
    var bands = [], prevWe = 0, b0 = 0;
    s.forEach(function (o, i) {
      var w = o.I > 0 ? o.we : 0;
      if (w !== prevWe) { if (prevWe > 0) bands.push({ x0: b0, x1: o.t, color: PU.WE_COL[prevWe - 1], opacity: 0.09 }); b0 = o.t; prevWe = w; }
    });
    var ser = [{ x: tt, y: T(s, 'set'), color: ink3, width: 1.5, dash: '4 3' }, { x: tt, y: T(s, 'I'), color: cu, width: 2.2 }];
    if (rs) ser.push({ x: rt, y: T(rs, 'I'), color: cu, width: 1.5, dash: '6 4', opacity: 0.55 });
    C.line($('chI'), { series: ser, xMin: 0, xMax: xMax, yMin: 0, xLabel: 'ms', yLabel: 'kA', cursor: tNow, bands: bands });
    C.legend($('lgI'), [{ color: cu, label: 'Corriente real' }, { color: ink3, label: 'Consigna (kA equivalentes)' }].concat(rs ? [{ color: cu, label: 'Referencia (punteada)' }] : []).concat([0, 1, 2].filter(function (i) { return s.some(function (o) { return o.we === i + 1 && o.I > 0; }); }).map(function (i) { return { color: PU.WE_COL[i], label: 'WE' + (i + 1) + ' (banda)' }; })));
    var pc = { Tw: '#2c8fd6', Tt: '#d4a017', Tc: '#3a9a5b', Te: '#d0473b' }, lab = { Tw: 'Alambre central', Tt: 'Gancho-alambre', Tc: 'Cierre', Te: 'Punta electrodo' };
    var serT = [];
    Object.keys(pc).forEach(function (k) { serT.push({ x: tt, y: T(s, k), color: pc[k], width: 2 }); if (rs) serT.push({ x: rt, y: T(rs, k), color: pc[k], width: 1.4, dash: '6 4', opacity: 0.5 }); });
    C.line($('chT'), { series: serT, xMin: 0, xMax: xMax, yMin: 0, yMax: Math.max(1300, cur.summary.peaks.Te * 1.05), xLabel: 'ms', yLabel: '°C', cursor: tNow, bands: bands,
      hlines: [{ y: cur.params.Tburn, color: '#6b7a8c', label: 'esmalte' }, { y: cur.params.Tbond, color: '#3a9a5b', label: 'unión' }, { y: 1083, color: '#d0473b', label: 'Cu funde' }] });
    C.legend($('lgT'), Object.keys(pc).map(function (k) { return { color: pc[k], label: lab[k] }; }));
    var Rv = s.map(function (o) { return o.I > 0 ? o.R : NaN; });
    var serR = [{ x: tt, y: Rv, color: vi, width: 2 }, { x: tt, y: T(s, 'P'), color: cu, width: 2, axis: 2 }];
    if (rs) { serR.push({ x: rt, y: rs.map(function (o) { return o.I > 0 ? o.R : NaN; }), color: vi, width: 1.4, dash: '6 4', opacity: 0.5 }); serR.push({ x: rt, y: T(rs, 'P'), color: cu, width: 1.4, dash: '6 4', opacity: 0.5, axis: 2 }); }
    C.line($('chR'), { series: serR, xMin: 0, xMax: xMax, yMin: 0, xLabel: 'ms', yLabel: 'mΩ', y2Label: 'kW', cursor: tNow, bands: bands });
    C.legend($('lgR'), [{ color: vi, label: 'R medida entre electrodos (mΩ)' }, { color: cu, label: 'Potencia (kW)' }]);
    var serB = [{ x: tt, y: T(s, 'burn', 100), color: '#6b7a8c', width: 2 }, { x: tt, y: T(s, 'bondW', 100), color: '#2c8fd6', width: 2 }, { x: tt, y: T(s, 'bondC', 100), color: ok, width: 2 }, { x: tt, y: T(s, 'melt'), color: '#d0473b', width: 2, axis: 2 }];
    if (rs) serB.push({ x: rt, y: T(rs, 'bondC', 100), color: ok, width: 1.4, dash: '6 4', opacity: 0.5 });
    C.line($('chB'), { series: serB, xMin: 0, xMax: xMax, yMin: 0, yMax: 105, y2Min: 0, y2Max: Math.max(2, cur.summary.melt * 1.2), xLabel: 'ms', yLabel: '%', y2Label: 'mm² fundidos', cursor: tNow, bands: bands });
    C.legend($('lgB'), [{ color: '#6b7a8c', label: 'Esmalte retirado' }, { color: '#2c8fd6', label: 'Alambres unidos' }, { color: ok, label: 'Cierre unido' }, { color: '#d0473b', label: 'Cobre fundido (mm², eje der.)' }]);
  }
  function metric(label, v, d, frac, cls) {
    return '<div class="metric"><div class="l">' + label + '</div><div class="v"' + (cls ? ' style="color:var(--' + cls + ')"' : '') + '>' + v + '</div>' + (d ? '<div class="d muted">' + d + '</div>' : '') + (frac != null ? '<div class="meter"><i style="width:' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%"></i></div>' : '') + '</div>';
  }
  function diff(a, b, dec, unit) { if (b == null) return ''; var d = a - b; return (d >= 0 ? '+' : '') + d.toFixed(dec) + (unit || '') + ' vs ref.'; }
  function renderMetrics() {
    if (!cur) return;
    var s = cur.summary, r = ref && ref.summary, v = cur.verdict, cp = cur.params;
    var vd = $('verdict'); vd.className = 'verdict ' + v.cls;
    vd.innerHTML = '<div class="big">' + v.code + '</div><div><b>' + v.text + '</b><div class="muted" style="margin-top:4px">' +
      cp.nWires + ' alambres' + (cp.awg !== 17 ? ' ' + cp.awg + ' AWG' : '') + (cp.thick !== 1 ? ' · terminal ' + cp.thick.toFixed(2) + ' mm' : '') + (cp.hookLen !== 8.5 ? ' · gancho ' + cp.hookLen.toFixed(1) + ' mm' : '') + (cp.elecX ? ' · electrodo corrido ' + (cp.elecX > 0 ? '+' : '') + cp.elecX.toFixed(2) + ' mm' : '') + ' · ' + PU.describe(cp) + (cp.wear > 0 ? ' · cavidad ' + cp.wear.toFixed(2) + ' mm' : '') + (cp.iCal !== 1 ? ' · calibrado ×' + cp.iCal.toFixed(3) : '') + '</div></div>';
    var maxPulse = Math.max.apply(null, cur.series.map(function (o) { return o.pulse; }));
    var tEnd = s.tWeldEnd;
    $('metrics').innerHTML =
      metric('Esmalte retirado', Math.round(s.burn * 100) + '%', s.tBurn ? 'completo a los ' + s.tBurn.toFixed(0) + ' ms' : 'no se completó', s.burn) +
      metric('Alambres unidos', Math.round(s.bondW * 100) + '%', diff(s.bondW * 100, r && r.bondW * 100, 0, ' pts'), s.bondW) +
      metric('Cierre unido', Math.round(s.bondC * 100) + '%', diff(s.bondC * 100, r && r.bondC * 100, 0, ' pts'), s.bondC) +
      metric('Cobre fundido', s.melt.toFixed(2) + ' mm²', s.melt > 1 ? 'quemada' : s.melt > 0.3 ? 'superficial' : 'sin fusión', null, s.melt > 1 ? 'bad' : s.melt > 0.3 ? 'warn' : null) +
      metric('Pico punta electrodo', s.peaks.Te.toFixed(0) + ' °C', diff(s.peaks.Te, r && r.peaks.Te, 0, ' °C'), null, s.peaks.Te > 1300 ? 'bad' : null) +
      metric('Pico alambre central', s.peaks.Tw.toFixed(0) + ' °C', diff(s.peaks.Tw, r && r.peaks.Tw, 0, ' °C')) +
      metric('Energía eléctrica', s.Eel.toFixed(0) + ' J', s.perPulse.map(function (x, i) { return x.E > 0 ? 'WE' + (i + 1) + ' ' + x.E.toFixed(0) : ''; }).filter(Boolean).join(' · ')) +
      metric('Tiempo con corriente', tEnd.toFixed(0) + ' ms', 'calor en el cobre ' + s.Ejoint.toFixed(0) + ' J (' + (s.Ejoint / s.Eel * 100).toFixed(1) + '%) · PULSE máx ' + maxPulse.toFixed(0) + '%');
  }
  function renderAll() { renderHeat(); drawCharts(); renderMetrics(); }

  function init() {
    buildControls(); applyPreset(PRESETS[2]); markPreset(2); hoverSetup();
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
    var g = S.buildGeometry(Object.assign({}, S.DEFAULTS, P));
    drawSection($('heat'), { NX: g.NX, NY: g.NY, mat: Array.from(g.mat), dx: g.dx }, null, 'mat');
    run();
    window.addEventListener('themechange', function () { if (cur) drawCharts(); pulseEd.render(); });
    window.addEventListener('calibchange', function () { calibBox(); });
  }

  window.SimUI = {
    // carga un caso: p = parámetros (nWires, wear...), g = programa de pulsos (opcional)
    load: function (p, g) {
      Object.assign(P, EL0, p);
      if (g) setProgram(g);
      else if (p.heat) setProgram(prog({ uf: p.uf, heat: p.heat, dl: p.dl, up: p.up, weld: p.weld, down: p.down }, null, null, 0, 0, p.hold));
      sync(); markPreset(-1); document.getElementById('simulador').scrollIntoView(); run();
    },
    simulate: enqueue, prog: prog, energyT3: E_T3,
    drawSection: drawSection, MATCOL: MATCOL
  };
  document.addEventListener('DOMContentLoaded', init);
})();
