/* Módulos interactivos: anatomía, ventana, pulso, calor, modos, electrodo, barra, controlador */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts;
  var $ = function (id) { return document.getElementById(id); };
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function f(v, d) { return (+v).toFixed(d); }

  /* ---------------- tema y navegación ---------------- */
  function theme() {
    var KEY = 'electrodo-theme';
    try { var t = localStorage.getItem(KEY); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
    $('themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      var nt = dark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nt);
      try { localStorage.setItem(KEY, nt); } catch (e) {}
      window.dispatchEvent(new Event('themechange'));
    });
    var links = Array.prototype.slice.call(document.querySelectorAll('#nav a'));
    var secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { var i = secs.indexOf(e.target); links.forEach(function (l, j) { l.classList.toggle('on', i === j); }); } });
      }, { rootMargin: '-40% 0px -55% 0px' });
      secs.forEach(function (s) { if (s) io.observe(s); });
    }
  }

  /* ---------------- anatomía ---------------- */
  function anatomy() {
    var p = Object.assign({}, S.DEFAULTS, { nWires: 3 });
    var g = S.buildGeometry(p), cv = $('anat');
    var r = { NX: g.NX, NY: g.NY, mat: Array.from(g.mat), dx: g.dx };
    var sc = window.SimUI.drawSection(cv, r, null, 'mat');
    var ctx = cv.getContext('2d'), inf = g.info;
    ctx.font = '600 20px "IBM Plex Sans", sans-serif'; ctx.fillStyle = '#fff';
    function lbl(t, xm, ym) { ctx.fillText(t, xm / g.dx * sc, (g.NY - ym / g.dx) * sc); }
    lbl('Electrodo W', inf.xE0 + 0.4e-3, 7.2e-3);
    lbl('Gancho (Cu)', inf.xE1 + 0.3e-3, inf.yT1 - 0.2e-3);
    lbl('Barra de tierra', 6.4e-3, 0.35e-3);
    lbl('Cierre', inf.xC0 - 0.1e-3, inf.yB1 - 0.35e-3);
    var used = {}; r.mat.forEach(function (m) { used[m] = 1; });
    $('anatLegend').innerHTML = S.MAT_NAMES.map(function (n, i) { return i && used[i] ? '<span style="--c:' + window.SimUI.MATCOL[i] + '">' + n + '</span>' : ''; }).join('');
    var tip = document.createElement('div'); tip.className = 'hover-read'; cv.parentNode.style.position = 'relative'; cv.parentNode.appendChild(tip);
    var DESC = {
      1: 'Tungsteno: ρ ≈ 3.3× la del cobre en frío y sube 4.5‰/°C. Aquí se genera la mayor parte del calor.',
      9: 'Punta del electrodo: la zona que se deforma y toma la huella del gancho.',
      2: 'Terminal de cobre ETP, 1 mm de espesor. El gancho se dobla sobre los alambres.',
      3: 'Núcleo de cobre del alambre 17 AWG.',
      4: 'Esmalte: aislante eléctrico y térmico. Debe retirarse para que haya unión.',
      5: 'Barra de tierra: cierra el circuito por el cuerpo de la terminal.',
      6: 'Zona de cierre: la punta del gancho contra el cuerpo. Si no se une, la terminal puede abrirse.',
      7: 'Contacto electrodo-gancho: resistencia de contacto, depende de fuerza y área.',
      8: 'Contacto cuerpo-barra.'
    };
    cv.addEventListener('mousemove', function (e) {
      var rc = cv.getBoundingClientRect(), i = Math.floor((e.clientX - rc.left) / rc.width * g.NX), j = Math.floor(g.NY - (e.clientY - rc.top) / rc.height * g.NY);
      if (i < 0 || j < 0 || i >= g.NX || j >= g.NY) return;
      var m = g.mat[j * g.NX + i];
      if (!m) { tip.style.display = 'none'; return; }
      tip.textContent = S.MAT_NAMES[m] + ' — ' + (DESC[m] || '');
      tip.style.whiteSpace = 'normal'; tip.style.maxWidth = '280px';
      tip.style.display = 'block'; tip.style.left = (e.clientX - rc.left) + 'px'; tip.style.top = (e.clientY - rc.top) + 'px';
    });
    cv.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  }

  /* ---------------- ventana de proceso ---------------- */
  function windowMap() {
    var data = null, key = 'w2', sel = null;
    var CLS = { 'FRÍA': 'FRIA', 'DÉBIL': 'DEBIL', 'OK': 'OK', 'OK (caliente)': 'OKC', 'QUEMADA': 'QUEMADA' };
    var SHORT = { 'FRÍA': 'F', 'DÉBIL': 'D', 'OK': 'OK', 'OK (caliente)': 'OK', 'QUEMADA': 'Q' };
    function draw() {
      if (!data) return;
      var H = data.heats, W = data.welds, M = data.maps[key], box = $('wmap');
      if (!M || M.length < W.length) { box.innerHTML = '<p class="muted">Este mapa aún no está disponible.</p>'; return; }
      box.style.gridTemplateColumns = '56px repeat(' + H.length + ', 1fr)';
      var h = '';
      for (var wi = W.length - 1; wi >= 0; wi--) {
        h += '<div class="hdr">' + W[wi] + ' ms</div>';
        for (var hi = 0; hi < H.length; hi++) {
          var c = M[wi][hi], v = S.verdict({ melt: c.m, burn: c.b, bondW: c.bw, bondC: c.bc });
          h += '<div class="c c-' + CLS[v.code] + '" data-w="' + wi + '" data-h="' + hi + '" title="' + v.code + ' · HEAT ' + H[hi] + ' kA · WELD ' + W[wi] + ' ms">' + SHORT[v.code] + '</div>';
        }
      }
      h += '<div class="hdr">WELD ↑</div>' + H.map(function (x, i) { return '<div class="hdr">' + (i % 2 === 0 ? x.toFixed(1) : '') + '</div>'; }).join('');
      h += '<div></div><div class="hdr" style="grid-column: span ' + H.length + '">HEAT (kA) →</div>';
      box.innerHTML = h;
    }
    function info(wi, hi) {
      var H = data.heats, W = data.welds, c = data.maps[key][wi][hi], v = S.verdict({ melt: c.m, burn: c.b, bondW: c.bw, bondC: c.bc });
      var nW = key === 'w2' ? 2 : 3, wear = key === 'w3gastado' ? 0.4 : 0;
      $('wInfo').innerHTML = '<h3>HEAT ' + H[hi].toFixed(2) + ' kA · WELD ' + W[wi] + ' ms</h3><p><span class="tag ' + v.cls + '">' + v.code + '</span> ' + v.text + '</p>' +
        '<div class="kpi-row"><div class="kpi"><b>' + Math.round(c.b * 100) + '%</b><span>esmalte retirado</span></div><div class="kpi"><b>' + Math.round(c.bw * 100) + '%</b><span>alambres unidos</span></div><div class="kpi"><b>' + Math.round(c.bc * 100) + '%</b><span>cierre unido</span></div><div class="kpi"><b>' + c.m.toFixed(1) + '</b><span>mm² fundidos</span></div><div class="kpi"><b>' + c.te + ' °C</b><span>punta electrodo</span></div><div class="kpi"><b>' + c.E + ' J</b><span>energía</span></div></div>' +
        '<button class="btn" style="margin-top:10px" type="button" id="wLoad">Abrir en el simulador</button>';
      $('wLoad').onclick = function () {
        var w = W[wi], h = H[hi];
        window.SimUI.load({ nWires: nW, wear: wear, heat: h, uf: +(h * 0.79).toFixed(2), dl: 2.6, weld: w, up: Math.round(w * 0.53), down: 40, hold: 150, mode: 'SCD', pre: false, faceDepth: 3 });
      };
    }
    $('wSeg').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; key = b.dataset.k;
      this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); if (sel) info(sel[0], sel[1]);
    });
    $('wmap').addEventListener('click', function (e) {
      var c = e.target.closest('.c'); if (!c) return; sel = [+c.dataset.w, +c.dataset.h]; info(sel[0], sel[1]);
    });
    fetch('data/ventana.json').then(function (r) { return r.json(); }).then(function (d) { data = d; draw(); })
      .catch(function () { $('wmap').innerHTML = '<p class="muted">No se pudo cargar data/ventana.json (si abriste el archivo directo del disco, usa GitHub Pages o un servidor local).</p>'; });
  }

  /* ---------------- editor de pulso ---------------- */
  function pulse() {
    var fields = [['UF', 'uf', 1, 6, 0.05, 2, 'kA'], ['HEAT', 'h', 1, 6, 0.05, 2, 'kA'], ['DL', 'dl', 0.5, 6, 0.05, 2, 'kA'], ['UP', 'up', 0, 500, 5, 0, 'ms'], ['WELD', 'w', 50, 800, 5, 0, 'ms'], ['DOWN', 'dn', 0, 300, 5, 0, 'ms'],
      ['Pulso 2: corriente', 'i2', 0, 5, 0.05, 2, 'kA'], ['Pulso 2: tiempo', 't2', 0, 300, 5, 0, 'ms'], ['COOL entre pulsos', 'c', 0, 200, 5, 0, 'ms']];
    var s = { uf: 3.15, h: 4.0, dl: 2.6, up: 240, w: 450, dn: 40, i2: 0.5, t2: 100, c: 0 };
    var ref = null;
    var box = $('pulseCtl');
    box.innerHTML = '<div class="presets" style="margin-bottom:10px"><button class="chip" type="button" data-p="a">Rampa + meseta</button><button class="chip" type="button" data-p="b">Con pulso 2 de 0.5 kA</button><button class="chip" type="button" data-p="c">Sin rampa</button><button class="chip" type="button" data-p="d">Misma energía, más corto</button></div>' +
      fields.map(function (q) { return '<div class="row"><label>' + q[0] + ' (' + q[6] + ')</label><input type="range" data-k="' + q[1] + '" min="' + q[2] + '" max="' + q[3] + '" step="' + q[4] + '"><output id="po_' + q[1] + '"></output></div>'; }).join('') +
      '<div class="btns" style="margin-top:8px"><button class="btn ghost" type="button" id="pRef">Fijar como referencia</button></div>';
    var P = { a: { uf: 3.15, h: 4.0, dl: 2.6, up: 240, w: 450, dn: 40, i2: 0, t2: 0, c: 0 }, b: { uf: 3.15, h: 4.0, dl: 2.6, up: 240, w: 450, dn: 40, i2: 0.5, t2: 100, c: 0 }, c: { uf: 4.0, h: 4.0, dl: 4.0, up: 0, w: 450, dn: 0, i2: 0, t2: 0, c: 0 } };
    function E(q) { var up = q.up / 1e3, w = q.w / 1e3, dn = q.dn / 1e3; return up / 3 * (q.uf * q.uf + q.uf * q.h + q.h * q.h) + q.h * q.h * Math.max(0, w - up - dn) + dn / 3 * (q.h * q.h + q.h * q.dl + q.dl * q.dl) + q.i2 * q.i2 * q.t2 / 1e3; }
    function wave(q) {
      var xs = [0], ys = [0], t = 0;
      xs.push(0); ys.push(q.up > 0 ? q.uf : q.h);
      xs.push(q.up); ys.push(q.h); xs.push(q.w - q.dn); ys.push(q.h); xs.push(q.w); ys.push(q.dn > 0 ? q.dl : q.h); xs.push(q.w); ys.push(0);
      t = q.w;
      if (q.t2 > 0 && q.i2 > 0) { t += q.c; xs.push(t); ys.push(0); xs.push(t); ys.push(q.i2); xs.push(t + q.t2); ys.push(q.i2); xs.push(t + q.t2); ys.push(0); t += q.t2; }
      xs.push(t + 40); ys.push(0);
      return { x: xs, y: ys, end: t };
    }
    function draw() {
      fields.forEach(function (q) { var inp = box.querySelector('[data-k="' + q[1] + '"]'); if (document.activeElement !== inp) inp.value = s[q[1]]; $('po_' + q[1]).textContent = f(s[q[1]], q[5]); });
      var wv = wave(s), ser = [{ x: wv.x, y: wv.y, color: css('--cu'), width: 2.4, fill: true }];
      if (ref) { var rw = wave(ref); ser.push({ x: rw.x, y: rw.y, color: css('--ink-3'), width: 1.5, dash: '5 4' }); }
      var xMax = Math.max(wv.end, ref ? wave(ref).end : 0) + 40;
      var bands = [];
      if (s.up > 0) bands.push({ x0: 0, x1: s.up, color: css('--blue') });
      if (s.dn > 0) bands.push({ x0: s.w - s.dn, x1: s.w, color: css('--violet') });
      C.line($('pulsePlot'), { series: ser, xMin: 0, xMax: xMax, yMin: 0, yMax: 6, xLabel: 'ms', yLabel: 'kA', bands: bands });
      var e = E(s), e10 = s.up + s.dn >= s.w, e2 = s.i2 * s.i2 * s.t2 / 1e3, flat = s.w - s.up - s.dn;
      var rms = Math.sqrt((e - e2) / (s.w / 1e3));
      $('pulseOut').innerHTML =
        '<div class="kpi"><b>' + e.toFixed(2) + '</b><span>I²t total (kA²·s)</span></div>' +
        (ref ? '<div class="kpi"><b>' + ((e / E(ref) - 1) * 100).toFixed(1) + '%</b><span>vs referencia</span></div>' : '') +
        '<div class="kpi"><b>' + rms.toFixed(2) + ' kA</b><span>RMS del pulso 1</span></div>' +
        '<div class="kpi"><b>' + Math.max(0, flat) + ' ms</b><span>meseta a HEAT</span></div>' +
        '<div class="kpi"><b>' + (e2 / e * 100).toFixed(1) + '%</b><span>aporte del pulso 2</span></div>' +
        '<div class="kpi" style="' + (e10 ? 'background:var(--bad-soft)' : '') + '"><b style="color:var(--' + (e10 ? 'bad' : 'ok') + ')">' + (e10 ? 'E-10' : 'OK') + '</b><span>UP + DOWN &lt; WELD</span></div>';
    }
    box.addEventListener('input', function (e) { var k = e.target.dataset.k; if (!k) return; s[k] = parseFloat(e.target.value); draw(); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      if (b.dataset.p === 'd') {
        // misma energía con WELD 25% más corto: resolver HEAT
        var tgt = E(s), q = Object.assign({}, s); q.w = Math.round(s.w * 0.75 / 5) * 5; q.up = Math.round(s.up * 0.75 / 5) * 5;
        var k = q.uf / q.h, up = q.up / 1e3, w = q.w / 1e3, dn = q.dn / 1e3;
        var a = up * (k * k + k + 1) / 3 + (w - up - dn) + dn / 3, bb = dn * q.dl / 3, c = dn * q.dl * q.dl / 3 + q.i2 * q.i2 * q.t2 / 1e3;
        q.h = (-bb + Math.sqrt(bb * bb + 4 * a * (tgt - c))) / (2 * a); q.uf = k * q.h; s = q;
      } else s = Object.assign({}, P[b.dataset.p]);
      draw();
    });
    $('pRef').addEventListener('click', function () { ref = Object.assign({}, s); draw(); });
    draw();
    window.addEventListener('themechange', draw);
  }

  /* ---------------- presupuesto térmico ---------------- */
  function heat() {
    var F = [['Alambres en el gancho', 'n', 1, 4, 1, 0], ['Diámetro de cobre del alambre (mm)', 'd', 0.5, 2, 0.01, 2], ['Largo de alambre bajo el gancho (mm)', 'lw', 1, 4, 0.1, 1],
      ['Espesor del gancho (mm)', 't', 0.5, 1.6, 0.05, 2], ['Ancho del gancho (mm)', 'wi', 1, 4, 0.1, 1], ['Largo de gancho que se calienta (mm)', 'l', 2, 9, 0.5, 1],
      ['Temperatura de unión (°C)', 'tj', 500, 1000, 25, 0], ['Corriente (kA)', 'i', 2, 6, 0.05, 2], ['V/I medido (mΩ)', 'r', 0.1, 0.4, 0.005, 3], ['Tiempo de pulso (ms)', 'p', 100, 800, 10, 0]];
    var s = { n: 3, d: 1.15, lw: 2.0, t: 1.0, wi: 2.0, l: 5, tj: 800, i: 4.0, r: 0.217, p: 450 };
    var box = $('heatCtl');
    box.innerHTML = F.map(function (q) { return '<div class="row"><label>' + q[0] + '</label><input type="range" data-k="' + q[1] + '" min="' + q[2] + '" max="' + q[3] + '" step="' + q[4] + '" value="' + s[q[1]] + '"><output id="ho_' + q[1] + '"></output></div>'; }).join('');
    function calc() {
      F.forEach(function (q) { $('ho_' + q[1]).textContent = f(s[q[1]], q[5]); });
      var rho = 8.96e-3, c = 0.385; // g/mm³, J/g·K
      var mW = s.n * Math.PI * s.d * s.d / 4 * s.lw * rho, mT = s.t * s.wi * s.l * rho, m = mW + mT;
      var Q = m * c * (s.tj - 25);
      var m2 = 2 * Math.PI * s.d * s.d / 4 * s.lw * rho + mT, Q2 = m2 * c * (s.tj - 25);
      var E = s.i * 1e3 * s.i * 1e3 * s.r * 1e-3 * s.p / 1e3;
      var free = 8.5 - 0.65 - s.n * s.d;
      $('heatOut').innerHTML =
        '<div class="kpi"><b>' + (m * 1000).toFixed(0) + ' mg</b><span>cobre en la unión (alambre ' + (mW * 1000).toFixed(0) + ' + gancho ' + (mT * 1000).toFixed(0) + ')</span></div>' +
        '<div class="kpi"><b>' + Q.toFixed(1) + ' J</b><span>calor para llegar a ' + s.tj + ' °C</span></div>' +
        '<div class="kpi"><b>' + ((Q / Q2 - 1) * 100 >= 0 ? '+' : '') + ((Q / Q2 - 1) * 100).toFixed(0) + '%</b><span>vs la misma unión con 2 alambres</span></div>' +
        '<div class="kpi"><b>' + E.toFixed(0) + ' J</b><span>energía entre electrodos (V·I·t)</span></div>' +
        '<div class="kpi"><b>' + (Q / E * 100).toFixed(1) + '%</b><span>eficiencia mínima necesaria</span></div>' +
        '<div class="kpi"><b>' + free.toFixed(2) + ' mm</b><span>gancho libre para cerrar (8.5 mm de gancho, R0.65)</span></div>' +
        '<div class="kpi"><b>' + (Math.sqrt(1.13e-4 * s.p / 1e3) * 1e3).toFixed(1) + ' mm</b><span>√(α·t): lo que viaja el calor en el pulso</span></div>';
      var ts = [], ds = [], dsW = [];
      for (var t = 0; t <= 800; t += 10) { ts.push(t); ds.push(Math.sqrt(1.13e-4 * t / 1e3) * 1e3); dsW.push(Math.sqrt(6.5e-5 * t / 1e3) * 1e3); }
      C.line($('diffPlot'), { series: [{ x: ts, y: ds, color: css('--cu'), width: 2.2 }, { x: ts, y: dsW, color: css('--w'), width: 2, dash: '5 4' }], xMin: 0, xMax: 800, yMin: 0, xLabel: 'ms (cobre sólido / tungsteno punteado)', yLabel: 'mm', cursor: s.p,
        hlines: [{ y: s.d, color: css('--blue'), label: 'diámetro de alambre' }, { y: s.n * s.d, color: css('--violet'), label: 'fila de alambres' }] });
    }
    box.addEventListener('input', function (e) { var k = e.target.dataset.k; if (!k) return; s[k] = parseFloat(e.target.value); calc(); });
    calc();
    window.addEventListener('themechange', calc);
  }

  /* ---------------- modos de control ---------------- */
  function modes() {
    var R0 = 0.217;
    function vals(R, I0) {
      var V0 = I0 * R0, P0 = I0 * I0 * R0;
      return {
        SCD: { I: I0, V: I0 * R, P: I0 * I0 * R },
        PWR: { I: Math.sqrt(P0 / R), V: Math.sqrt(P0 * R), P: P0 },
        VLT: { I: V0 / R, V: V0, P: V0 * V0 / R }
      };
    }
    function draw() {
      var R = +$('mR').value, I0 = +$('mI').value;
      $('mRv').textContent = R.toFixed(3) + ' mΩ'; $('mIv').textContent = I0.toFixed(2) + ' kA';
      var rs = [], sc = [], pw = [], vl = [];
      for (var r = 0.12; r <= 0.4501; r += 0.005) { rs.push(r); var v = vals(r, I0); sc.push(v.SCD.P); pw.push(v.PWR.P); vl.push(v.VLT.P); }
      var g = C.line($('modePlot'), { series: [{ x: rs, y: sc, color: css('--cu'), width: 2.4 }, { x: rs, y: pw, color: css('--blue'), width: 2.4 }, { x: rs, y: vl, color: css('--violet'), width: 2.4 }],
        xMin: 0.12, xMax: 0.45, yMin: 0, xLabel: 'R entre electrodos (mΩ)', yLabel: 'potencia (kW)', cursor: R });
      var cur = vals(R, I0), ref = vals(R0, I0);
      var rows = ['SCD', 'PWR', 'VLT'].map(function (k) {
        var d = (cur[k].P / ref[k].P - 1) * 100;
        return '<tr><td><code>' + k + '</code></td><td>' + cur[k].I.toFixed(2) + ' kA</td><td>' + cur[k].V.toFixed(2) + ' V</td><td>' + cur[k].P.toFixed(2) + ' kW</td><td style="color:var(--' + (Math.abs(d) < 3 ? 'ok' : Math.abs(d) < 12 ? 'warn' : 'bad') + ')">' + (d >= 0 ? '+' : '') + d.toFixed(0) + '%</td></tr>';
      }).join('');
      $('modeTable').innerHTML = '<table><thead><tr><th>Modo</th><th>Corriente</th><th>Voltaje</th><th>Calor (P)</th><th>Cambio de calor</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }
    ['mR', 'mI'].forEach(function (id) { $(id).addEventListener('input', draw); });
    document.querySelectorAll('[data-r]').forEach(function (b) { b.addEventListener('click', function () { $('mR').value = b.dataset.r; draw(); }); });
    draw();
    window.addEventListener('themechange', draw);
  }

  /* ---------------- electrodo: huella ---------------- */
  function wear() {
    var mode = 'pos';
    function draw() {
      var c = +$('wC').value, fw = +$('wF').value, hw = 2.0;
      $('wCv').textContent = c.toFixed(2) + ' mm'; $('wFv').textContent = fw.toFixed(2) + ' mm';
      var contact = fw > hw ? Math.min(fw, hw + 2 * c) : fw;
      var Af = contact / hw, Frel = mode === 'pos' ? Math.max(0.25, 1 - 0.8 * c) : 1;
      var J = 1 / Af, Pp = Frel / Af, Q = 1 / Math.pow(Af, 0.8);
      var svg = $('wearSvg'); while (svg.firstChild) svg.removeChild(svg.firstChild);
      var el = C.el, s = 70, cx = 260, yTop = 40, yFace = 150;
      // electrodo
      var half = fw / 2 * s, cav = Math.min(c, 1) * s, hh = hw / 2 * s;
      var d = 'M' + (cx - half) + ' ' + yTop + ' H' + (cx + half) + ' V' + yFace;
      if (fw > hw && c > 0) {
        var inner = Math.min(half, hh + 4);
        d += ' H' + (cx + inner) + ' V' + (yFace - cav) + ' H' + (cx - inner) + ' V' + yFace;
      }
      d += ' H' + (cx - half) + ' Z';
      el('path', { d: d, fill: css('--w'), opacity: 0.85, stroke: css('--ink-2'), 'stroke-width': 1.2 }, svg);
      // gancho (sección)
      var gTop = yFace - (fw > hw ? Math.min(cav, (contact - hw) / 2 * s) : 0);
      el('rect', { x: cx - hh, y: yFace - (fw > hw ? Math.min(cav, 1e9) : 0), width: hw * s, height: 1.0 * s + (fw > hw ? Math.min(cav, 1e9) : 0), fill: css('--cu'), opacity: 0.55, stroke: css('--cu'), 'stroke-width': 2 }, svg);
      // líneas de corriente
      var n = 9;
      for (var i = 0; i < n; i++) {
        var u = (i + 0.5) / n, x0 = cx - half + u * 2 * half;
        var x1 = cx - contact / 2 * s + u * contact * s;
        el('path', { d: 'M' + x0 + ' ' + (yTop + 6) + ' L' + x1 + ' ' + (yFace - 2), stroke: '#ffcf70', 'stroke-width': 2.4 * J, fill: 'none', opacity: 0.8 }, svg);
      }
      el('rect', { x: cx - 3.2 * s / 2 - 20, y: yFace + 1.0 * s, width: 3.2 * s + 40, height: 12, fill: css('--ink-3'), opacity: 0.5 }, svg);
      var t1 = el('text', { x: cx, y: 24, 'text-anchor': 'middle' }, svg); t1.textContent = 'Fuerza ' + Math.round(Frel * 100) + '%  ↓';
      var t2 = el('text', { x: cx, y: 290, 'text-anchor': 'middle' }, svg); t2.textContent = 'gancho 2.0 mm · contacto ' + contact.toFixed(2) + ' mm';
      $('wearOut').innerHTML =
        '<div class="kpi"><b>' + Math.round(Af * 100) + '%</b><span>área de contacto</span></div>' +
        '<div class="kpi"><b>' + Math.round(J * 100) + '%</b><span>densidad de corriente</span></div>' +
        '<div class="kpi"><b>' + Math.round(Pp * 100) + '%</b><span>presión</span></div>' +
        '<div class="kpi" style="background:var(--' + (Q > 0.92 ? 'ok' : Q > 0.85 ? 'warn' : 'bad') + '-soft)"><b>' + Math.round(Q * 100) + '%</b><span>calor útil en la unión (SCD)</span></div>' +
        '<div class="kpi"><b>+' + Math.max(0, Math.round((1 / Math.sqrt(Q) - 1) * 100)) + '%</b><span>corriente que "pediría" el técnico</span></div>';
    }
    ['wC', 'wF'].forEach(function (id) { $(id).addEventListener('input', draw); });
    $('wMode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); });
    draw();
    window.addEventListener('themechange', draw);
  }

  /* ---------------- círculo vicioso ---------------- */
  function cycle() {
    var svg = $('cycleSvg'), el = C.el;
    var steps = ['La cavidad crece', 'Más área de contacto', 'Menos A/mm² y presión', 'Unión fría', 'Se sube la corriente', 'Punta más caliente'];
    var cx = 260, cy = 122, R = 80, idx = 0;
    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      el('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: css('--line'), 'stroke-width': 2, 'stroke-dasharray': '4 5' }, svg);
      steps.forEach(function (s, i) {
        var a = -Math.PI / 2 + i * 2 * Math.PI / steps.length, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        var on = i === idx;
        el('circle', { cx: x, cy: y, r: on ? 9 : 6, fill: on ? css('--cu') : css('--panel'), stroke: css('--cu'), 'stroke-width': 2 }, svg);
        var tx = el('text', { x: x + (Math.cos(a) > 0.2 ? 14 : Math.cos(a) < -0.2 ? -14 : 0), y: y + (Math.sin(a) > 0.5 ? 22 : Math.sin(a) < -0.5 ? -14 : 4), 'text-anchor': Math.cos(a) > 0.2 ? 'start' : Math.cos(a) < -0.2 ? 'end' : 'middle' }, svg);
        tx.textContent = s; tx.style.fill = on ? css('--ink') : css('--ink-2'); tx.style.fontSize = '12.5px'; tx.style.fontFamily = 'var(--sans)'; if (on) tx.style.fontWeight = '600';
      });
      var m = el('text', { x: cx, y: cy + 5, 'text-anchor': 'middle' }, svg); m.textContent = 'cada vuelta, más rápido'; m.style.fill = css('--cu'); m.style.fontSize = '12px';
    }
    draw();
    setInterval(function () { if (document.hidden) return; idx = (idx + 1) % steps.length; draw(); }, 1400);
  }

  /* ---------------- vida del electrodo ---------------- */
  function life() {
    var F = [['Golpes a simular', 'N', 2000, 20000, 500, 0], ['Desgaste nominal (mm de cavidad / 1000 golpes)', 'k0', 0.02, 0.2, 0.005, 3], ['Criterio de rectificado (mm)', 'cmax', 0.04, 0.4, 0.01, 2],
      ['Paso del técnico (+% corriente)', 'step', 2, 10, 1, 0], ['Uniones frías antes de reaccionar', 'react', 1, 20, 1, 0], ['Ancho de cara (mm)', 'fw', 1.6, 3.6, 0.05, 2], ['Material por rectificado (mm)', 'grind', 0.02, 0.3, 0.01, 2], ['Variación de desgaste entre electrodos (%)', 'var', 0, 50, 5, 0]];
    var s = { N: 8000, k0: 0.08, cmax: 0.07, step: 4, react: 20, fw: 3.0, grind: 0.08, ctrl: 'pos', var: 25 };
    function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    var box = $('lifeCtl');
    box.innerHTML = F.map(function (q) { return '<div class="row"><label>' + q[0] + '</label><input type="range" data-k="' + q[1] + '" min="' + q[2] + '" max="' + q[3] + '" step="' + q[4] + '" value="' + s[q[1]] + '"><output id="lo_' + q[1] + '"></output></div>'; }).join('') +
      '<div class="row" style="grid-template-columns:1fr 170px"><label>Fuerza</label><div class="seg" id="lCtrl"><button type="button" data-v="pos" class="on">Posición</button><button type="button" data-v="force">Fuerza</button></div></div>' +
      '<div class="note" style="margin-top:8px">Índice de calor en la unión: Q = (I/I₀)² · (área₀/área)^0.8 · F^0.3. OK entre 0.92 y 1.12. La cavidad crece a k₀·m·(T punta)³ por golpe, con T punta ∝ (I/I₀)²/√área y m distinto para cada electrodo (lognormal). El STEPPER es lazo abierto: sigue la curva promedio, no la del electrodo real.</div>';
    var hw = 2.0;
    function sim(strategy) {
      var c = 0, I = 1, coldRun = 0, burnRun = 0, rect = 0, mm = 0, cold = 0, burnt = 0, xs = [], qs = [], stepN = 0;
      var narrow = s.fw <= hw, kn = s.k0 / 1000, R = rng(7), mult = [];
      for (var e = 0; e < 2000; e++) { var g = Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R()); mult.push(Math.exp(g * s.var / 100)); }
      var nRect = Math.max(50, Math.round(s.cmax / kn));
      function area(cc) { return narrow ? 1 : Math.min(s.fw, hw + 2 * cc) / hw; }
      function force(cc) { return s.ctrl === 'pos' ? Math.max(0.3, 1 - 0.8 * cc) : 1; }
      for (var n = 0; n < s.N; n++) {
        var A = area(c), Fr = force(c), Ieff = I;
        if (strategy === 'stepper') { var cp = kn * stepN; Ieff = Math.sqrt(Math.pow(area(cp), 0.8) / Math.pow(force(cp), 0.3)); }
        var Q = Ieff * Ieff / Math.pow(A, 0.8) * Math.pow(Fr, 0.3), tip = Ieff * Ieff / Math.sqrt(A);
        if (strategy === 'pwr') { Q = Math.pow(A, -0.25) * Math.pow(Fr, 0.3); tip = 1; }
        c += kn * mult[Math.min(rect, mult.length - 1)] * Math.pow(tip, 3) * (narrow ? 0.6 : 1);
        stepN++;
        var isCold = Q < 0.92, isBurn = Q > 1.12;
        if (isCold) { cold++; coldRun++; } else coldRun = 0;
        if (isBurn) { burnt++; burnRun++; } else burnRun = 0;
        if (n % 10 === 0) { xs.push(n); qs.push(Q); }
        if (strategy === 'tech') {
          // sube corriente tras varias frías; rectifica solo cuando ya no puede compensar (y no regresa la corriente)
          if (coldRun >= s.react) { I *= 1 + s.step / 100; coldRun = 0; }
          if (burnRun >= 2) { I /= 1 + s.step / 100; burnRun = 0; }
          if (I > 1.3) { mm += c + s.grind; c = 0; rect++; }
        } else if (strategy === 'stepper') {
          if (stepN >= nRect) { mm += c + s.grind; c = 0; rect++; stepN = 0; }
        } else if (c >= s.cmax) { mm += c + s.grind; c = 0; rect++; stepN = 0; }
      }
      return { xs: xs, qs: qs, rect: rect, mm: mm, cold: cold, burnt: burnt };
    }
    function draw() {
      F.forEach(function (q) { $('lo_' + q[1]).textContent = f(s[q[1]], q[5]); });
      var st = [{ k: 'tech', name: 'Técnico sube corriente', c: '#d0473b' }, { k: 'stepper', name: 'STEPPER + rectificado en E-27', c: '#2c8fd6' }, { k: 'umbral', name: 'Rectificar por profundidad de cavidad', c: '#3a9a5b' }, { k: 'pwr', name: 'Modo PWR + rectificado por cavidad', c: '#8a63c9' }];
      var res = st.map(function (x) { return sim(x.k); });
      C.line($('lifePlot'), { series: res.map(function (r, i) { return { x: r.xs, y: r.qs, color: st[i].c, width: 1.6 }; }), xMin: 0, xMax: s.N, yMin: 0.6, yMax: 1.4, xLabel: 'golpes', yLabel: 'índice de calor Q',
        hlines: [{ y: 0.92, color: '#2c8fd6', label: 'fría' }, { y: 1.12, color: '#d0473b', label: 'quemada' }], bands: [] });
      C.legend($('lifeLegend'), st.map(function (x) { return { color: x.c, label: x.name }; }));
      $('lifeTable').innerHTML = '<table><thead><tr><th>Estrategia</th><th>Fuera de ventana</th><th>Frías</th><th>Quemadas</th><th>Rectificados</th><th>mm de electrodo</th></tr></thead><tbody>' +
        res.map(function (r, i) { var bad = (r.cold + r.burnt) / s.N * 100; return '<tr><td><span style="color:' + st[i].c + '">■</span> ' + st[i].name + '</td><td><b style="color:var(--' + (bad < 1 ? 'ok' : bad < 5 ? 'warn' : 'bad') + ')">' + bad.toFixed(1) + '%</b></td><td>' + r.cold + '</td><td>' + r.burnt + '</td><td>' + r.rect + '</td><td>' + r.mm.toFixed(2) + '</td></tr>'; }).join('') + '</tbody></table>';
    }
    box.addEventListener('input', function (e) { var k = e.target.dataset.k; if (!k) return; s[k] = parseFloat(e.target.value); draw(); });
    $('lCtrl').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; s.ctrl = b.dataset.v; this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); });
    draw();
    window.addEventListener('themechange', draw);
  }

  /* ---------------- barra de tierra ---------------- */
  function ground() {
    var M = { cu: { n: 'Cobre ETP', rho: 1.72e-8, a: 0.0039, rc: 3.45e6, soft: 250 }, cucrzr: { n: 'Cu-Cr-Zr', rho: 2.1e-8, a: 0.0035, rc: 3.45e6, soft: 500 }, wcu: { n: 'W-Cu 70/30', rho: 4.0e-8, a: 0.004, rc: 2.9e6, soft: 900 }, mo: { n: 'Molibdeno', rho: 5.3e-8, a: 0.0045, rc: 2.6e6, soft: 1000 } };
    function calc() {
      var A = +$('gA').value * 1e-6, m = M[$('gM').value], I = 4000, t = 0.45;
      $('gAv').textContent = $('gA').value;
      // calentamiento adiabático con resistividad que sube: dT/dt = J² ρ0 (1+aΔT) / ρc  → ΔT = (exp(a·J²ρ0·t/ρc) − 1)/a
      var J = I / A, k = J * J * m.rho * t / m.rc, dT = (Math.exp(m.a * k) - 1) / m.a;
      var R = m.rho * 5e-3 / A * 1e3; // mΩ en 5 mm
      $('gOut').innerHTML = '<div class="kpi"><b>' + (J / 1e6).toFixed(0) + ' A/mm²</b><span>densidad de corriente</span></div>' +
        '<div class="kpi" style="background:var(--' + (dT < m.soft * 0.5 ? 'ok' : dT < m.soft ? 'warn' : 'bad') + '-soft)"><b>+' + (dT > 5000 ? '>5000' : dT.toFixed(0)) + ' °C</b><span>por pulso (adiabático)</span></div>' +
        '<div class="kpi"><b>' + m.soft + ' °C</b><span>empieza a ablandarse</span></div>' +
        '<div class="kpi"><b>' + R.toFixed(3) + ' mΩ</b><span>R de 5 mm de cuello</span></div>';
    }
    $('gA').addEventListener('input', calc); $('gM').addEventListener('change', calc); calc();
  }

  /* ---------------- controlador ---------------- */
  function controller() {
    var H = {
      sch: ['SCHEDULE #', '001–255', 'Número de programa. La máquina lo selecciona por las entradas de la tarjeta (un programa por terminal/canal).', 'Documenta qué número usa cada terminal y verifica que el programa del DOE sea el que corre en producción.'],
      sqd: ['SQD · retardo de apriete', '0–9999 ms', 'Tiempo que se suma a SQZ solo en la primera soldadura tras la señal de inicio.', 'Útil si el primer golpe de la secuencia sale distinto. En secuencias de 3 terminales afecta solo a la primera.'],
      sqz: ['SQZ · apriete', '0–9999 ms', 'Tiempo desde que se aplica fuerza hasta que fluye corriente. La fuerza debe estar estable antes de soldar.', 'Muy corto: la corriente arranca con fuerza baja → chispa y picadura del electrodo. Verifícalo con la curva de fuerza del servo.'],
      cool1: ['COOL1 · enfriamiento 1', '0–9999 ms', 'Pausa sin corriente entre WELD1 y WELD2.', 'Con precalentamiento, deja escapar calor de la punta antes del pulso principal. 20–50 ms bastan: el alambre iguala temperatura en ~3 ms.'],
      cool2: ['COOL2 · enfriamiento 2', '0–9999 ms', 'Pausa entre WELD2 y WELD3.', 'Solo aplica si se usa un tercer pulso.'],
      hold: ['HOLD · sostener', '0–20000 ms', 'Tiempo con fuerza aplicada y sin corriente al final.', 'Deja que la unión baje de ~700 °C antes de liberar. Muy corto: el gancho rebota y la unión se abre. El simulador muestra cuánto tarda en enfriar.'],
      off: ['OFF · pausa de repetición', '0–9990 ms', 'En modo de repetición, tiempo entre ciclos.', 'Normalmente 0 en estaciones automáticas. Si se usa, RE-WELD queda deshabilitado.'],
      up: ['UP · rampa de subida', '0–WELD', 'Tiempo para subir de UF a HEAT. Forma parte de WELD.', 'Rampa = tiempo para que el esmalte salga antes del pico. 40–60% del WELD es típico en fusing. Más rampa = menos golpe al electrodo.'],
      weld: ['WELD · tiempo de soldadura', '0–9999 ms (según modo y rango)', 'Tiempo total con corriente del pulso, incluyendo UP y DOWN.', 'Regla: UP + DOWN < WELD o aparece E-10. Subir WELD amplía la ventana más que subir HEAT (ver mapa de ventana).'],
      down: ['DOWN · rampa de bajada', '0–WELD', 'Tiempo para bajar de HEAT a DL. Forma parte de WELD.', 'Rampa corta a corriente baja: reduce el choque térmico y el pegado del electrodo.'],
      uf: ['UF · inicio de rampa', 'según CURRENT RANGE', 'Corriente al inicio de UP. Solo aplica si UP > 0.', 'UF ≈ 75–80% de HEAT. Muy bajo desperdicia tiempo; muy alto quita el beneficio de la rampa. UF y DL no pueden ser mayores que HEAT (E-10).'],
      heat: ['HEAT · corriente', 'según CURRENT RANGE (5/10/20 kA)', 'Consigna de la meseta. Su unidad cambia con CTRL: kA en SCD/PRI, kW en PWR, V en VLT.', 'El parámetro más sensible: la energía va con I². ±5% de HEAT ≈ ±10% de energía.'],
      dl: ['DL · fin de rampa', 'según CURRENT RANGE', 'Corriente al final de DOWN.', 'Corriente baja que deja la unión en temperatura de forja mientras baja.'],
      ctrl: ['CTRL · modo de control', 'PRI, SCD, PWR, PEAK, VLT, FIX', 'Variable que la fuente mantiene constante en cada pulso.', 'SCD por defecto. PWR compensa el cambio de resistencia por desgaste. Ver sección Modos.'],
      we2: ['Pulso 2 (WELD2)', 'igual que WELD1', 'Segundo pulso del programa, después de COOL1.', 'Un pulso de 100 ms a 0.5 kA aporta menos de 2% de la energía: no calienta la unión. Si existe "por si acaso", conviene probar su eliminación con una prueba de equivalencia.'],
      we3: ['Pulso 3 (WELD3)', 'igual que WELD1', 'Tercer pulso, después de COOL2.', 'Mismo razonamiento que WELD2: si no aporta energía, solo agrega tiempo de ciclo.'],
      next: ['NEXT', '—', 'Pasa a la pantalla SCHEDULE (2): pulsación, frecuencia, rango, ganancia.', ''],
      onoff: ['WELD ON/OFF', 'ON/OFF', 'Uno de los tres permisos para soldar (pantalla, botón del frente, señal externa).', 'Si está en OFF el ciclo corre sin corriente: la terminal sale sin soldar.'],
      plim: ['PULSE LIMIT', '10–99.9%', 'Límite del ancho de pulso del inverter.', 'Solo en modo de pico primario.'],
      puls: ['PULSATION', '1–19', 'Repite cada WELD n veces con INTERVAL entre repeticiones.', 'Dosifica energía sin sobrecalentar la punta. El monitor solo muestra la última repetición.'],
      intv: ['INTERVAL', '0–999 ms', 'Tiempo sin corriente entre pulsaciones.', ''],
      freq: ['WELD TRANS FREQ', '600–3000 Hz', 'Frecuencia del inverter.', 'No mayor que la del transformador. Más alta: control más fino y menos rizo.'],
      vcomp: ['VOLT COMPENSATION', '0–100%', 'Compensación de voltaje.', 'Solo en modo de pico primario.'],
      valve: ['VALVE #', '1–2', 'Válvula/salida de fuerza asociada.', 'En estaciones con servo puede no usarse.'],
      gain: ['GAIN', '1–9', 'Ganancia del lazo de control.', '1 es lo normal. Alto da sobrepico de corriente que golpea el electrodo.'],
      range: ['CURRENT RANGE', '5 / 10 / 20 kA', 'Escala de medición y control. Precisión ±3% de la escala completa.', 'Corrientes cerca de 4–5 kA: escala de 10 kA (±0.3 kA). En 20 kA el error sería ±0.6 kA, más que la ventana.'],
      tr: ['TURN RATIO', '1–199.9', 'Relación de vueltas del transformador.', 'Crítico en modos primarios: con ella se calcula la corriente del secundario.'],
      maxc: ['MAX CURRENT', 'hasta la escala', 'Corriente máxima permitida.', 'Tope de seguridad: si alguien sube HEAT, no puede pasar de aquí.'],
      trans: ['TRANS #', '1–5', 'Transformador asignado.', ''],
      mI: ['MONITOR · corriente', '—', 'Corriente RMS medida del último pulso de ese programa.', 'Compárala con la consigna. En SCD deben coincidir; en PWR/VLT la corriente cambia con la resistencia.'],
      mV: ['MONITOR · voltaje', '—', 'Voltaje entre electrodos (cable de detección).', 'V/I = resistencia dinámica. Baja conforme el electrodo gana área (cavidad): es un indicador indirecto de desgaste.'],
      mP: ['MONITOR · potencia', '—', 'V·I del pulso.', 'El calor real que entrega la fuente. Útil para MONITOR SET.'],
      mPu: ['MONITOR · PULSE', '0–100%', 'Ancho de pulso del inverter usado.', 'Cerca de 100% = la fuente está al límite y ya no puede regular. Bajo = hay margen.'],
      mT: ['MONITOR · tiempo', '—', 'Tiempo real de corriente.', ''],
      mNG: ['NG / límites', 'CAUTION / ERROR', 'Resultado contra MONITOR SET. CAUTION avisa; ERROR detiene.', 'Con límites abiertos (999/0) nunca dispara. Configura media ± 3σ de 30 soldaduras buenas.'],
      mPre: ['PRECHECK', '0–999 ms', 'Pulso de prueba de baja corriente antes de soldar para medir resistencia.', 'Detecta terminal mal asentada, alambre faltante o electrodo sin contacto antes de quemar la pieza.'],
      mCnt: ['COUNTER', '0–999999', 'Contador de soldaduras.', 'Reinícialo con cada cambio de electrodo: así se mide la vida real. Un contador saturado no da información.']
    };
    var screens = {
      s1: [
        ['SCHEDULE #', '[001]', 'sch', '                         ', 'DATE --/--/--'],
        ['  SQD    SQZ    COOL1  COOL2  HOLD   OFF'],
        [' ', '[0300]', 'sqd', ' ', '[0300]', 'sqz', ' ', '[0030]', 'cool1', ' ', '[0000]', 'cool2', ' ', '[0250]', 'hold', ' ', '[0000]', 'off', ' ms'],
        ['     UP     WELD   DOWN    UF      HEAT    DL      CTRL'],
        [' 1 ', '[240]', 'up', '  ', '[450]', 'weld', '  ', '[040]', 'down', '  ', '[03.15]', 'uf', ' ', '[04.00]', 'heat', ' ', '[02.60]', 'dl', ' kA ', '[SCD]', 'ctrl'],
        [' 2 ', '[000]', 'we2', '  ', '[000]', 'we2', '  ', '[000]', 'we2', '  ', '[00.50]', 'we2', ' ', '[00.50]', 'we2', ' ', '[00.50]', 'we2', ' kA ', '[SCD]', 'we2'],
        [' 3 ', '[000]', 'we3', '  ', '[000]', 'we3', '  ', '[000]', 'we3', '  ', '[00.50]', 'we3', ' ', '[00.50]', 'we3', ' ', '[00.50]', 'we3', ' kA ', '[SCD]', 'we3'],
        ['                                                     ', 'NEXT', 'next']
      ],
      s2: [
        ['SCHEDULE #001                      WELD ON/OFF ', '[ON ]', 'onoff'],
        ['  PULSE LIMIT             PULSATION   INTERVAL'],
        [' WELD1 ', '[99.9]', 'plim', '%            ', '[01]', 'puls', '        ', '[000]', 'intv', ' ms'],
        [' WELD2 ', '[99.9]', 'plim', '%            ', '[01]', 'puls', '        ', '[000]', 'intv', ' ms'],
        [' WELD3 ', '[99.9]', 'plim', '%            ', '[01]', 'puls', '        ', '[000]', 'intv', ' ms'],
        [' WELD TRANS FREQ ', '[1000]', 'freq', 'Hz   VOLT COMPENSATION ', '[000]', 'vcomp', '%'],
        [' VALVE #         ', '[1]', 'valve', '        GAIN              ', '[01]', 'gain'],
        [' CURRENT RANGE   ', '[10]', 'range', 'kA      TURN RATIO        ', '[050.0]', 'tr'],
        [' MAX CURRENT     ', '[10.0]', 'maxc', 'kA    TRANS #           ', '[1]', 'trans']
      ],
      mon: [
        ['MONITOR   SCHEDULE #001            COUNT ', '[000123]', 'mCnt'],
        ['        CURR      VOLT     POWER    PULSE    TIME'],
        [' WE1  ', '[04.00]', 'mI', 'kA  ', '[0.87]', 'mV', 'V  ', '[3.48]', 'mP', 'kW  ', '[31.0]', 'mPu', '%  ', '[450]', 'mT', 'ms'],
        [' WE2   ----      ----     ----     ----     ----'],
        [' WE3   ----      ----     ----     ----     ----'],
        [' NG: ', '[ ---- ]', 'mNG', '                  PRECHECK ', '[000]', 'mPre', ' ms']
      ]
    };
    var curS = 's1';
    function render() {
      var rows = screens[curS];
      $('lcd').innerHTML = rows.map(function (r) {
        var h = '', i = 0;
        // formato: texto plano o tríos [texto, campo, clave]
        while (i < r.length) {
          if (i + 2 < r.length + 0 && r[i + 2] && H[r[i + 2]] && /^\[|NEXT/.test(r[i + 1])) { h += esc(r[i]) + '<span class="f" data-f="' + r[i + 2] + '">' + esc(r[i + 1]) + '</span>'; i += 3; }
          else if (r[i] && /^\[|NEXT/.test(r[i]) && H[r[i + 1]]) { h += '<span class="f" data-f="' + r[i + 1] + '">' + esc(r[i]) + '</span>'; i += 2; }
          else { h += esc(r[i]); i++; }
        }
        return '<div class="lcd-row">' + h + '</div>';
      }).join('');
    }
    function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    $('lcd').addEventListener('click', function (e) {
      var s = e.target.closest('.f'); if (!s) return;
      this.querySelectorAll('.f').forEach(function (x) { x.classList.toggle('on', x.dataset.f === s.dataset.f); });
      var h = H[s.dataset.f];
      $('lcdHelp').innerHTML = '<div class="kicker">Rango: ' + h[1] + '</div><h3>' + h[0] + '</h3><p>' + h[2] + '</p>' + (h[3] ? '<div class="note"><b>En fusing:</b> ' + h[3] + '</div>' : '');
      if (s.dataset.f === 'next') { curS = 's2'; setSeg(); render(); }
    });
    function setSeg() { $('lcdSeg').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === curS); }); }
    $('lcdSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; curS = b.dataset.s; setSeg(); render(); });
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    [theme, anatomy, windowMap, pulse, heat, modes, wear, cycle, life, ground, controller].forEach(function (fn) {
      try { fn(); } catch (e) { console.error(fn.name, e); }
    });
  });
})();
