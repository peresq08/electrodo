/* Prueba de vida del electrodo: condiciones, electrodos, lecturas, fotos y análisis.
 * Todo se guarda en este navegador (localStorage) y se exporta/importa como JSON o CSV. */
(function () {
  'use strict';
  var C = window.Charts;
  var $ = function (id) { return document.getElementById(id); };
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function num(v) { if (v === '' || v == null) return null; var x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; }
  // lista de números: acepta "0.05, 0.06", "0,05 0,06", "62, 58, 65" o "62;58"
  function parseList(str) {
    var out = [];
    String(str || '').trim().split(/\s*;\s*|\s+/).forEach(function (tok) {
      if (!tok) return;
      var parts = tok.split(','), sep = tok.indexOf('.') >= 0 || (parts.length > 1 && parts[0] !== '0' && parts[0] !== '' && parts.every(function (q) { return q.length >= 2 || q === ''; }));
      (sep ? parts : [tok]).forEach(function (q) { var v = num(q); if (v != null) out.push(v); });
    });
    return out;
  }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  var COLS = ['#c4652e', '#2c7fb8', '#3a9a5b', '#7b52b3', '#d4a017', '#d0473b'];

  /* ---------------- almacenamiento ---------------- */
  var KEY = 'electrodo-vida-v1', PKEY = 'electrodo-vida-foto-';
  var D = { cond: [], elec: [], read: [], set: { cavMax: 0.15, fMin: 50, redPct: 20, every: 1000, res: 0.01 } };
  try { var raw = localStorage.getItem(KEY); if (raw) D = Object.assign(D, JSON.parse(raw)); } catch (e) {}
  if (D.set.res == null) D.set.res = 0.01;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { alert('No se pudo guardar en el navegador (almacenamiento lleno). Exporta un respaldo JSON.'); } }
  function photo(id) { try { return localStorage.getItem(PKEY + id); } catch (e) { return null; } }
  function savePhoto(id, data) { try { localStorage.setItem(PKEY + id, data); return true; } catch (e) { return false; } }
  function delPhoto(id) { try { localStorage.removeItem(PKEY + id); } catch (e) {} }
  function condOf(cid) { return D.cond.filter(function (c) { return c.id === cid; })[0]; }
  function elecOf(eid) { return D.elec.filter(function (e) { return e.id === eid; })[0]; }
  function golpes(r) { var e = elecOf(r.eid); if (!e || r.counter == null) return null; var g = (r.counter - (e.c0 || 0)) * (e.mult || 1); if (g < 0 && e.wrap) g += e.wrap * (e.mult || 1); return g; }
  function colorOf(cid) { var i = D.cond.map(function (c) { return c.id; }).indexOf(cid); return COLS[(i < 0 ? 0 : i) % COLS.length]; }

  /* ---------------- estadística ---------------- */
  function lgamma(z) { var g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5], x = z, y = z, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); var ser = 1.000000000190015; for (var j = 0; j < 6; j++) ser += g[j] / ++y; return -tmp + Math.log(2.5066282746310005 * ser / x); }
  function betacf(a, b, x) { var FP = 1e-300, qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FP) d = FP; d = 1 / d; var h = d; for (var m = 1; m <= 300; m++) { var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FP) d = FP; c = 1 + aa / c; if (Math.abs(c) < FP) c = FP; d = 1 / d; var del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
  function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1; var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
  function pT(t, df) { return ibeta(df / (df + t * t), df / 2, 0.5); } // bilateral
  function tCrit(df) { if (!(df > 0)) return NaN; var lo = 0, hi = 100; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (pT(m, df) > 0.05) lo = m; else hi = m; } return (lo + hi) / 2; }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  function sd(a) { if (a.length < 2) return NaN; var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / (a.length - 1)); }
  function linreg(x, y) {
    var n = x.length; if (n < 2) return null;
    var mx = mean(x), my = mean(y), sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < n; i++) { sxx += (x[i] - mx) * (x[i] - mx); sxy += (x[i] - mx) * (y[i] - my); syy += (y[i] - my) * (y[i] - my); }
    if (sxx === 0) return null;
    var b = sxy / sxx, a = my - b * mx, sse = Math.max(0, syy - b * sxy), df = n - 2;
    var s = df > 0 ? Math.sqrt(sse / df) : NaN, seb = df > 0 ? s / Math.sqrt(sxx) : NaN;
    return { a: a, b: b, r2: syy > 0 ? 1 - sse / syy : NaN, r: syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN, n: n, df: df, seb: seb, ci: df > 0 ? tCrit(df) * seb : NaN, p: df > 0 && seb > 0 ? pT(b / seb, df) : NaN, mx: mx, sxx: sxx, s: s };
  }
  function welch(a, b) {
    if (a.length < 2 || b.length < 2) return null;
    var ma = mean(a), mb = mean(b), va = Math.pow(sd(a), 2) / a.length, vb = Math.pow(sd(b), 2) / b.length;
    var t = (ma - mb) / Math.sqrt(va + vb), df = Math.pow(va + vb, 2) / (va * va / (a.length - 1) + vb * vb / (b.length - 1));
    return { t: t, df: df, p: pT(t, df), d: ma - mb };
  }

  /* ---------------- interfaz ---------------- */
  var tab = 0, TABS = ['1 · Condiciones y electrodos', '2 · Lecturas', '3 · Análisis', '4 · Fotos'], selE = null;
  function nav() {
    $('lfTabs').innerHTML = TABS.map(function (t, i) { return '<button type="button" data-t="' + i + '" class="' + (i === tab ? 'on' : '') + '">' + t + '</button>'; }).join('');
    [t1, t2, t3, t4][tab]();
  }
  function setRow(id, label, val, unit, help) { return '<div class="row r2" style="grid-template-columns:1fr 120px"><label title="' + esc(help || '') + '">' + label + '</label><div style="display:flex;gap:4px;align-items:center"><input class="lf-in" id="' + id + '" value="' + esc(val) + '" inputmode="decimal"><span class="muted" style="font-size:12px">' + unit + '</span></div></div>'; }

  // 1 · condiciones y electrodos
  function t1() {
    var s = D.set;
    $('lfBody').innerHTML = '<div class="grid2">' +
      '<div class="card"><h3>Condiciones a comparar</h3><p class="muted" style="font-size:13px">Por ejemplo: "A · actual 450 ms" y "B · candidato 400 ms". Escribe el programa completo para que quede registrado.</p>' +
      '<div class="tbl-wrap"><table class="edit"><thead><tr><th>Nombre</th><th>Programa (HEAT, WELD, UP…)</th><th>Terminal / canal</th><th></th></tr></thead><tbody>' +
      D.cond.map(function (c) { return '<tr data-c="' + c.id + '"><td><span style="color:' + colorOf(c.id) + '">■</span> <input data-f="name" value="' + esc(c.name) + '" style="width:130px"></td><td><input data-f="prog" value="' + esc(c.prog) + '" style="width:220px"></td><td><input data-f="term" value="' + esc(c.term) + '" style="width:80px"></td><td><button class="chip" data-delc type="button">✕</button></td></tr>'; }).join('') +
      '</tbody></table></div><button class="btn ghost" type="button" id="lfAddC" style="margin-top:8px">+ Condición</button></div>' +
      '<div class="card"><h3>Criterios (escríbelos antes de empezar)</h3>' +
      setRow('lfCav', 'Criterio de rectificado (profundidad de cavidad)', s.cavMax, 'mm', 'Profundidad a la que hoy se rectifica o a la que propones rectificar') +
      setRow('lfFmin', 'Fuerza mínima aceptable', s.fMin, 'N', 'Límite inferior de fuerza de la unión') +
      setRow('lfRed', 'Mejora mínima de desgaste para aceptar el candidato', s.redPct, '%', 'Reducción de la tasa de desgaste contra la condición actual') +
      setRow('lfEvery', 'Leer cada', s.every, 'golpes', 'Intervalo sugerido entre lecturas') +
      setRow('lfRes', 'Resolución del instrumento de cavidad', s.res, 'mm', 'La división mínima del indicador o calibrador') +
      '<div class="note mini" style="margin-top:6px">Con un instrumento de ' + s.res + ' mm, mide la cavidad <b>3 veces</b> en cada lectura (escríbelas separadas por coma) y lee cada ~1000 golpes: los cambios entre lecturas deben ser mayores que la resolución. La pendiente sale de la regresión de todas las lecturas, así que se puede estimar con más precisión que una lectura individual.</div>' +
      '<div class="note mini" style="margin-top:6px">El criterio de rectificado de arriba es provisional. Hoy se rectifica cuando sale mal la pieza; esta prueba registra a qué profundidad aparece la primera falla y en Análisis propone un criterio medible.</div>' +
      '<div class="note mini" style="margin-top:8px">Recomendado: al menos <b>2 electrodos por condición</b>, alternando A, B, A, B, para separar el efecto del programa de la variación entre electrodos. Cada electrodo empieza recién rectificado y termina al llegar al criterio de rectificado o a un conteo fijo.</div></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Electrodos (una vida = de un rectificado al siguiente)</h3><p class="muted" style="font-size:13px">El <b>contador inicial</b> es la lectura del contador del controlador de la máquina al instalar el electrodo recién rectificado. Si el contador cuenta ciclos (estatores) en lugar de golpes de ese electrodo, pon en "golpes por cuenta" cuántos golpes da el electrodo por cada cuenta. <b>Para saberlo:</b> anota el contador, corre 10 estatores y vuelve a leerlo; si subió 10 es por ciclo (pon 3 si el electrodo suelda las 3 terminales), si subió 30 es por golpe (pon 1).</p>' +
      '<div class="tbl-wrap"><table class="edit"><thead><tr><th>Electrodo</th><th>Condición</th><th>Contador inicial</th><th>Golpes por cuenta</th><th>Fecha</th><th>Notas</th><th>Lecturas</th><th></th></tr></thead><tbody>' +
      D.elec.map(function (e) {
        var n = D.read.filter(function (r) { return r.eid === e.id; }).length;
        return '<tr data-e="' + e.id + '"><td><input data-f="label" value="' + esc(e.label) + '" style="width:80px"></td><td><select data-f="cid">' + D.cond.map(function (c) { return '<option value="' + c.id + '"' + (c.id === e.cid ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></td><td><input data-f="c0" value="' + esc(e.c0) + '" style="width:90px" inputmode="numeric"></td><td><input data-f="mult" value="' + esc(e.mult || 1) + '" style="width:50px" inputmode="numeric"></td><td><input data-f="date" type="date" value="' + esc(e.date) + '"></td><td><input data-f="note" value="' + esc(e.note) + '" style="width:140px"></td><td>' + n + '</td><td><button class="chip" data-dele type="button">✕</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<button class="btn ghost" type="button" id="lfAddE" style="margin-top:8px"' + (D.cond.length ? '' : ' disabled') + '>+ Electrodo</button>' + (D.cond.length ? '' : ' <span class="muted" style="font-size:12px">Primero agrega una condición.</span>') + '</div>';
    var body = $('lfBody');
    body.onchange = function (e) {
      var el = e.target, f = el.dataset.f;
      if (['lfCav', 'lfFmin', 'lfRed', 'lfEvery', 'lfRes'].indexOf(el.id) >= 0) {
        var k = { lfCav: 'cavMax', lfFmin: 'fMin', lfRed: 'redPct', lfEvery: 'every', lfRes: 'res' }[el.id], v = num(el.value); if (v != null) D.set[k] = v; save(); return;
      }
      var tr = el.closest('tr'); if (!tr || !f) return;
      if (tr.dataset.c) { var c = condOf(tr.dataset.c); c[f] = el.value; save(); if (f === 'name') t1(); }
      if (tr.dataset.e) { var ee = elecOf(tr.dataset.e); ee[f] = (f === 'c0' || f === 'mult') ? num(el.value) : el.value; save(); }
    };
    body.onclick = function (e) {
      if (e.target.id === 'lfAddC') { D.cond.push({ id: uid(), name: String.fromCharCode(65 + D.cond.length) + ' · ', prog: '', term: '' }); save(); t1(); }
      if (e.target.id === 'lfAddE') { D.elec.push({ id: uid(), label: 'E' + String(D.elec.length + 1).padStart(2, '0'), cid: D.cond[D.elec.length % D.cond.length].id, c0: null, mult: 1, date: new Date().toISOString().slice(0, 10), note: '' }); save(); t1(); }
      var dc = e.target.closest('[data-delc]'), de = e.target.closest('[data-dele]');
      if (dc) { var cid = dc.closest('tr').dataset.c; if (D.elec.some(function (x) { return x.cid === cid; })) { alert('Esta condición tiene electrodos; bórralos o cámbialos primero.'); return; } D.cond = D.cond.filter(function (c) { return c.id !== cid; }); save(); t1(); }
      if (de) { var eid = de.closest('tr').dataset.e; if (!confirm('¿Borrar el electrodo y sus lecturas?')) return; D.read.filter(function (r) { return r.eid === eid; }).forEach(function (r) { if (r.ph) delPhoto(r.id); }); D.read = D.read.filter(function (r) { return r.eid !== eid; }); D.elec = D.elec.filter(function (x) { return x.id !== eid; }); save(); t1(); }
    };
  }

  // 2 · lecturas
  function t2() {
    if (!D.elec.length) { $('lfBody').innerHTML = '<div class="note">Primero registra condiciones y electrodos en el paso 1.</div>'; return; }
    if (!selE || !elecOf(selE)) selE = D.elec[0].id;
    var e = elecOf(selE), rs = D.read.filter(function (r) { return r.eid === selE; }).sort(function (a, b) { return (a.counter || 0) - (b.counter || 0); });
    var last = rs[rs.length - 1];
    var nextCnt = last && last.counter != null ? Math.round(last.counter + (D.set.every || 500) / (e.mult || 1)) : (e.c0 != null ? e.c0 : '');
    $('lfBody').innerHTML = '<div class="grid2" style="grid-template-columns:400px 1fr">' +
      '<div class="card"><div class="row r2" style="grid-template-columns:90px 1fr"><label>Electrodo</label><select id="lfSel">' + D.elec.map(function (x) { var c = condOf(x.cid); return '<option value="' + x.id + '"' + (x.id === selE ? ' selected' : '') + '>' + esc(x.label) + ' · ' + esc(c ? c.name : '') + '</option>'; }).join('') + '</select></div>' +
      (e.c0 == null ? '<div class="note mini" style="background:var(--warn-soft)">Falta el contador inicial de este electrodo (paso 1): sin él no se calculan los golpes.</div>' : '') +
      '<div class="lf-form">' +
      field('counter', 'Contador del controlador', nextCnt, '', 'Lectura del contador de la máquina en este momento') +
      field('cav', 'Profundidad de cavidad (1 a 3 medidas)', '', 'mm', 'Ejemplo: 0.05, 0.06, 0.05 (se promedian)') +
      '<div class="gh" style="margin-top:8px">Pantalla MONITOR (último golpe)</div>' +
      field('I', 'Corriente', '', 'kA') + field('V', 'Voltaje', '', 'V') + field('P', 'Potencia', '', 'kW') + field('pulse', 'PULSE', '', '%') +
      '<div class="gh" style="margin-top:8px">Calidad</div>' +
      field('force', 'Fuerza (medidor digital)', '', 'N', 'Una o varias piezas separadas por coma: 62, 58, 65') +
      field('R', 'Resistencia', '', 'Ω') +
      sel('hipot', 'Hipot', ['', 'OK', 'NG']) + sel('surge', 'Surge', ['', 'OK', 'NG']) + sel('vis', 'Visual', ['', 'OK', 'Gancho abierto', 'Quemado', 'Alambre suelto', 'Cobre pegado al electrodo', 'Otro']) +
      field('note', 'Nota', '', '') +
      '<div class="row r2" style="grid-template-columns:1fr 200px"><label>Foto de la punta</label><input type="file" id="lfPh" accept="image/*" capture="environment"></div>' +
      '<button class="btn" type="button" id="lfAdd" style="margin-top:8px">Agregar lectura</button></div></div>' +
      '<div class="card"><div class="heat-top"><h3 style="margin:0">' + esc(e.label) + ' · ' + rs.length + ' lecturas</h3></div><svg class="chart" id="lfMini" viewBox="0 0 520 200"></svg><div class="tbl-wrap" style="max-height:380px;overflow:auto">' +
      (rs.length ? '<table class="hist"><thead><tr><th>Contador</th><th>Golpes</th><th>Cavidad</th><th>I</th><th>V</th><th>V/I</th><th>PULSE</th><th>Fuerza</th><th>R</th><th>Hipot</th><th>Surge</th><th>Visual</th><th>Foto</th><th></th></tr></thead><tbody>' +
        rs.map(function (r) {
          var g = golpes(r), fz = r.force || [];
          return '<tr><td>' + (r.counter != null ? r.counter : '—') + '</td><td>' + (g != null ? g : '—') + '</td><td>' + (r.cav != null ? r.cav.toFixed(3) + (r.cavN && r.cavN.length > 1 ? ' (n' + r.cavN.length + ')' : '') : '—') + '</td><td>' + (r.I != null ? r.I : '—') + '</td><td>' + (r.V != null ? r.V : '—') + '</td><td>' + (r.I && r.V ? (r.V / r.I).toFixed(3) : '—') + '</td><td>' + (r.pulse != null ? r.pulse : '—') + '</td><td>' + (fz.length ? mean(fz).toFixed(0) + (fz.length > 1 ? ' (n' + fz.length + ')' : '') : '—') + '</td><td>' + (r.R != null ? r.R : '—') + '</td><td>' + (r.hipot || '—') + '</td><td>' + (r.surge || '—') + '</td><td>' + (r.vis || '—') + '</td><td>' + (r.ph ? '📷' : '') + '</td><td><button class="chip" data-delr="' + r.id + '" type="button">✕</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">Sin lecturas. Registra la lectura inicial (golpes 0) con la cavidad del electrodo recién rectificado.</p>') + '</div></div></div>';
    $('lfSel').onchange = function () { selE = this.value; t2(); };
    $('lfAdd').onclick = function () {
      var g = function (id) { return $('lf_' + id).value; };
      var cavs = parseList(g('cav'));
      var r = { id: uid(), eid: selE, ts: new Date().toISOString(), counter: num(String(g('counter')).replace(/[,\s]/g, '')), cav: cavs.length ? +mean(cavs).toFixed(4) : null, cavN: cavs, I: num(g('I')), V: num(g('V')), P: num(g('P')), pulse: num(g('pulse')),
        force: parseList(g('force')), R: num(g('R')), hipot: g('hipot'), surge: g('surge'), vis: g('vis'), note: g('note'), ph: false };
      if (r.counter == null) { alert('Falta el contador del controlador.'); return; }
      var file = $('lfPh').files[0];
      function done() { D.read.push(r); save(); t2(); }
      if (file) shrink(file, function (data) { r.ph = savePhoto(r.id, data); if (!r.ph) alert('La foto no cupo en el almacenamiento del navegador; se guardó la lectura sin foto. Exporta y borra fotos viejas.'); done(); });
      else done();
    };
    $('lfBody').onclick = function (ev) {
      var b = ev.target.closest('[data-delr]'); if (!b) return;
      var id = b.dataset.delr; D.read = D.read.filter(function (x) { return x.id !== id; }); delPhoto(id); save(); t2();
    };
    // mini gráfica de cavidad contra golpes
    var pts = rs.filter(function (r) { return r.cav != null && golpes(r) != null; });
    if (pts.length) {
      var xs = pts.map(golpes), ys = pts.map(function (r) { return r.cav; }), ser = [{ x: xs, y: ys, color: colorOf(e.cid), dots: true, width: 1.5 }];
      var lr = linreg(xs, ys); if (lr) ser.push({ x: [0, Math.max.apply(null, xs)], y: [lr.a, lr.a + lr.b * Math.max.apply(null, xs)], color: css('--ink-3'), dash: '5 4', width: 1.2 });
      C.line($('lfMini'), { series: ser, xMin: 0, xMax: Math.max(1000, Math.max.apply(null, xs) * 1.05), yMin: 0, yMax: Math.max(D.set.cavMax * 1.15, Math.max.apply(null, ys) * 1.15), xLabel: 'golpes', yLabel: 'cavidad (mm)', hlines: [{ y: D.set.cavMax, color: '#d0473b', label: 'rectificar' }] });
    }
  }
  function field(id, label, val, unit, help) { return '<div class="row r2" style="grid-template-columns:1fr 170px"><label title="' + esc(help || '') + '">' + label + '</label><div style="display:flex;gap:4px;align-items:center"><input class="lf-in" id="lf_' + id + '" value="' + esc(val) + '"' + (id === 'note' ? '' : ' inputmode="decimal"') + '><span class="muted" style="font-size:12px;min-width:22px">' + unit + '</span></div></div>'; }
  function sel(id, label, opts) { return '<div class="row r2" style="grid-template-columns:1fr 170px"><label>' + label + '</label><select id="lf_' + id + '">' + opts.map(function (o) { return '<option>' + o + '</option>'; }).join('') + '</select></div>'; }
  function shrink(file, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = Math.min(560, img.width), h = Math.round(img.height * w / img.width), cv = document.createElement('canvas');
        cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL('image/jpeg', 0.72));
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  // 3 · análisis
  function perElectrode() {
    return D.elec.map(function (e) {
      var rs = D.read.filter(function (r) { return r.eid === e.id && r.cav != null && golpes(r) != null; }).sort(function (a, b) { return golpes(a) - golpes(b); });
      var xs = rs.map(golpes), ys = rs.map(function (r) { return r.cav; }), lr = linreg(xs, ys);
      var life = lr && lr.b > 0 ? (D.set.cavMax - lr.a) / lr.b : null;
      var fr = D.read.filter(function (r) { return r.eid === e.id && r.force && r.force.length; });
      var vi = D.read.filter(function (r) { return r.eid === e.id && r.I && r.V && golpes(r) != null; });
      var ng = D.read.filter(function (r) { return r.eid === e.id && (r.hipot === 'NG' || r.surge === 'NG' || (r.vis && r.vis !== 'OK')); }).length;
      var nq = D.read.filter(function (r) { return r.eid === e.id && (r.hipot || r.surge || r.vis); }).length;
      return { e: e, rs: rs, lr: lr, life: life, fr: fr, vi: vi, ng: ng, nq: nq, maxG: xs.length ? Math.max.apply(null, xs) : 0 };
    });
  }
  function t3() {
    var pe = perElectrode(), hasData = pe.some(function (p) { return p.rs.length >= 2; });
    if (!hasData) { $('lfBody').innerHTML = '<div class="note">Se necesitan al menos 2 lecturas con cavidad por electrodo para calcular la tasa de desgaste.</div>'; return; }
    var s = D.set;
    // tabla por electrodo
    var tE = '<table class="hist"><thead><tr><th>Electrodo</th><th>Condición</th><th>Lecturas</th><th>Golpes</th><th>Desgaste (mm / 1000 golpes)</th><th>IC 95%</th><th>R²</th><th>Vida proyectada a ' + s.cavMax + ' mm</th><th>Fuerza media</th><th>NG</th></tr></thead><tbody>' +
      pe.map(function (p) {
        var c = condOf(p.e.cid), allF = [].concat.apply([], p.fr.map(function (r) { return r.force; }));
        return '<tr><td><span style="color:' + colorOf(p.e.cid) + '">■</span> ' + esc(p.e.label) + '</td><td>' + esc(c ? c.name : '') + '</td><td>' + p.rs.length + '</td><td>' + p.maxG + '</td><td><b>' + (p.lr ? (p.lr.b * 1000).toFixed(4) : '—') + '</b></td><td>' + (p.lr && isFinite(p.lr.ci) ? '±' + (p.lr.ci * 1000).toFixed(4) : '—') + '</td><td>' + (p.lr && isFinite(p.lr.r2) ? (p.lr.r2 * 100).toFixed(0) + '%' : '—') + '</td><td>' + (p.life ? Math.round(p.life).toLocaleString('es-MX') + ' golpes' : '—') + '</td><td>' + (allF.length ? mean(allF).toFixed(0) + ' N' : '—') + '</td><td>' + (p.nq ? p.ng + '/' + p.nq : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
    // por condición
    var byC = D.cond.map(function (c) {
      var ps = pe.filter(function (p) { return p.e.cid === c.id && p.lr; });
      var slopes = ps.map(function (p) { return p.lr.b * 1000; });
      var forces = [].concat.apply([], pe.filter(function (p) { return p.e.cid === c.id; }).map(function (p) { return [].concat.apply([], p.fr.map(function (r) { return r.force; })); }));
      var lifes = ps.map(function (p) { return p.life; }).filter(function (v) { return v; });
      // si hay un solo electrodo, la incertidumbre es la de su regresión (no incluye variación entre electrodos)
      var m = slopes.length ? mean(slopes) : null, ci = slopes.length >= 2 ? tCrit(slopes.length - 1) * sd(slopes) / Math.sqrt(slopes.length) : (ps[0] && isFinite(ps[0].lr.ci) ? ps[0].lr.ci * 1000 : NaN);
      var ng = pe.filter(function (p) { return p.e.cid === c.id; }).reduce(function (a, p) { return a + p.ng; }, 0), nq = pe.filter(function (p) { return p.e.cid === c.id; }).reduce(function (a, p) { return a + p.nq; }, 0);
      return { c: c, n: ps.length, slopes: slopes, m: m, ci: ci, forces: forces, fBelow: forces.filter(function (f) { return f < s.fMin; }).length, life: lifes.length ? mean(lifes) : null, ng: ng, nq: nq };
    });
    var tC = '<table class="hist"><thead><tr><th>Condición</th><th>Electrodos</th><th>Desgaste medio (mm / 1000)</th><th>IC 95%</th><th>Vida media proyectada</th><th>Fuerza (media ± DE)</th><th>Bajo ' + s.fMin + ' N</th><th>NG eléctrico / visual</th></tr></thead><tbody>' +
      byC.map(function (b) { return '<tr><td><span style="color:' + colorOf(b.c.id) + '">■</span> ' + esc(b.c.name) + '</td><td>' + b.n + '</td><td><b>' + (b.m != null ? b.m.toFixed(4) : '—') + '</b></td><td>' + (isFinite(b.ci) ? '±' + b.ci.toFixed(4) + (b.n < 2 ? ' *' : '') : '—') + '</td><td>' + (b.life ? Math.round(b.life).toLocaleString('es-MX') + ' golpes' : '—') + '</td><td>' + (b.forces.length ? mean(b.forces).toFixed(0) + (b.forces.length > 1 ? ' ± ' + sd(b.forces).toFixed(0) : '') + ' N (n=' + b.forces.length + ')' : '—') + '</td><td>' + (b.forces.length ? b.fBelow + '/' + b.forces.length : '—') + '</td><td>' + (b.nq ? b.ng + '/' + b.nq : '—') + '</td></tr>'; }).join('') + '</tbody></table>' +
      (byC.some(function (b) { return b.n === 1; }) ? '<p class="muted" style="font-size:12px">* Con un solo electrodo el intervalo solo refleja el ruido de la medición, no la variación entre electrodos: subestima la incertidumbre real.</p>' : '');
    $('lfBody').innerHTML =
      '<div class="card"><h3>Desgaste: profundidad de cavidad contra golpes</h3><svg class="chart" id="lfWear" viewBox="0 0 640 280"></svg><div class="chart-legend" id="lfWearLg"></div><div class="tbl-wrap" style="margin-top:8px">' + tE + '</div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Comparación por condición</h3><div class="tbl-wrap">' + tC + '</div><div id="lfDec" style="margin-top:10px"></div></div>' +
      '<div class="card" style="margin-top:16px"><h3>Criterio de rectificado con datos</h3><div id="lfCrit"></div></div>' +
      '<div class="grid2" style="margin-top:16px"><div class="card"><h3>Fuerza contra profundidad de cavidad</h3><svg class="chart" id="lfForce" viewBox="0 0 520 240"></svg><div id="lfForceTxt" class="note mini"></div></div>' +
      '<div class="card"><h3>V/I del MONITOR como indicador de desgaste</h3><svg class="chart" id="lfVI" viewBox="0 0 520 240"></svg><div id="lfVITxt" class="note mini"></div></div></div>';
    // gráfica de desgaste
    var ser = [], xMax = 1000, yMax = s.cavMax * 1.2;
    pe.forEach(function (p) {
      if (!p.rs.length) return;
      var xs = p.rs.map(golpes), ys = p.rs.map(function (r) { return r.cav; }), col = colorOf(p.e.cid);
      xMax = Math.max(xMax, Math.max.apply(null, xs)); yMax = Math.max(yMax, Math.max.apply(null, ys) * 1.1);
      ser.push({ x: xs, y: ys, color: col, dots: true, noLine: true });
      if (p.lr) ser.push({ x: [0, Math.max.apply(null, xs)], y: [p.lr.a, p.lr.a + p.lr.b * Math.max.apply(null, xs)], color: col, width: 1.6, opacity: 0.8 });
    });
    C.line($('lfWear'), { series: ser, xMin: 0, xMax: xMax * 1.05, yMin: 0, yMax: yMax, xLabel: 'golpes desde el rectificado', yLabel: 'cavidad (mm)', hlines: [{ y: s.cavMax, color: '#d0473b', label: 'criterio de rectificado' }] });
    C.legend($('lfWearLg'), D.cond.map(function (c) { return { color: colorOf(c.id), label: c.name }; }));
    // decisión
    var dec = '';
    if (byC.length >= 2 && byC[0].m != null && byC[1].m != null) {
      var A = byC[0], B = byC[1], red = (1 - B.m / A.m) * 100, w = welch(A.slopes, B.slopes), wf = welch(B.forces, A.forces);
      var okWear = red >= s.redPct, okForce = !B.forces.length || !A.forces.length ? null : !((mean(B.forces) < mean(A.forces) && wf && wf.p < 0.05) || (B.fBelow / B.forces.length > A.fBelow / A.forces.length + 0.05));
      var lines = ['<b>' + esc(B.c.name) + '</b> contra <b>' + esc(A.c.name) + '</b>: el desgaste cambia <b>' + (red >= 0 ? '−' : '+') + Math.abs(red).toFixed(0) + '%</b> (criterio: ≥ ' + s.redPct + '% menos).'];
      if (w) lines.push('Diferencia de tasas entre electrodos: p = ' + w.p.toFixed(3) + (w.p < 0.05 ? ' (significativa).' : ' (no significativa todavía; faltan electrodos o lecturas).'));
      else lines.push('Para probar la diferencia estadísticamente se necesitan al menos 2 electrodos por condición.');
      if (A.forces.length && B.forces.length) lines.push('Fuerza: ' + mean(B.forces).toFixed(0) + ' N contra ' + mean(A.forces).toFixed(0) + ' N' + (wf ? ' (p = ' + wf.p.toFixed(3) + ')' : '') + '; bajo el mínimo: ' + B.fBelow + '/' + B.forces.length + ' contra ' + A.fBelow + '/' + A.forces.length + '.');
      if (B.nq) lines.push('NG eléctrico o visual: ' + B.ng + '/' + B.nq + ' contra ' + A.ng + '/' + A.nq + '.');
      var verdict = !w ? 'Faltan datos' : (okWear && w.p < 0.05 && okForce !== false) ? 'El candidato cumple' : (!okWear ? 'No cumple la mejora de desgaste' : okForce === false ? 'Mejora el desgaste pero empeora la unión' : 'Prometedor, pero aún no es concluyente');
      dec = '<div class="note"><span class="tag ' + (verdict === 'El candidato cumple' ? 'ok' : verdict === 'Faltan datos' || verdict.indexOf('Prometedor') === 0 ? 'warn' : 'bad') + '">' + verdict + '</span> ' + lines.join(' ') + '</div>';
    } else dec = '<div class="note mini">Registra al menos dos condiciones con lecturas para comparar. La primera condición de la lista se toma como referencia (la actual).</div>';
    $('lfDec').innerHTML = dec;
    // criterio de rectificado: profundidad a la que aparece la primera falla en cada electrodo
    var firsts = pe.map(function (p) {
      var rs = D.read.filter(function (r) { return r.eid === p.e.id && r.cav != null; }).sort(function (a, b) { return (golpes(a) || 0) - (golpes(b) || 0); });
      var bad = rs.filter(function (r) { return r.hipot === 'NG' || r.surge === 'NG' || (r.vis && r.vis !== 'OK') || (r.force && r.force.length && Math.min.apply(null, r.force) < s.fMin); })[0];
      return { p: p, cav: bad ? bad.cav : null, g: bad ? golpes(bad) : null, maxCav: rs.length ? rs[rs.length - 1].cav : null };
    });
    var fails = firsts.filter(function (f) { return f.cav != null; }), crit = '';
    if (fails.length) {
      var minF = Math.min.apply(null, fails.map(function (f) { return f.cav; })), sug = Math.floor(0.8 * minF / s.res) * s.res;
      crit = '<table class="hist"><thead><tr><th>Electrodo</th><th>Primera falla</th><th>Cavidad</th></tr></thead><tbody>' + firsts.map(function (f) { return '<tr><td>' + esc(f.p.e.label) + '</td><td>' + (f.g != null ? f.g.toLocaleString('es-MX') + ' golpes' : 'sin falla (hasta ' + (f.maxCav != null ? f.maxCav.toFixed(3) + ' mm' : '—') + ')') + '</td><td>' + (f.cav != null ? f.cav.toFixed(3) + ' mm' : '—') + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<div class="note" style="margin-top:8px">La primera falla (fuerza bajo ' + s.fMin + ' N, NG eléctrico o defecto visual) apareció desde <b>' + minF.toFixed(3) + ' mm</b> de cavidad. Criterio propuesto con 20% de margen: <b>rectificar a ' + sug.toFixed(2) + ' mm</b>, medible con tu instrumento de ' + s.res + ' mm. ' + (fails.length < 3 ? 'Con menos de 3 electrodos con falla, tómalo como provisional.' : '') + '</div>';
    } else crit = '<div class="note mini">Ningún electrodo ha tenido falla todavía' + (firsts.some(function (f) { return f.maxCav != null; }) ? ' (máximo medido: ' + Math.max.apply(null, firsts.filter(function (f) { return f.maxCav != null; }).map(function (f) { return f.maxCav; })).toFixed(3) + ' mm)' : '') + '. Si la prueba llega lejos sin fallas, el electrodo se puede usar más de lo que hoy se cree.</div>';
    // resolución del instrumento
    var resMsg = pe.filter(function (p) { return p.lr; }).map(function (p) { var ch = p.lr.b * p.maxG; return ch < 5 * s.res ? esc(p.e.label) : null; }).filter(Boolean);
    if (resMsg.length) crit += '<div class="note mini" style="margin-top:6px;background:var(--warn-soft)">En ' + resMsg.join(', ') + ' el cambio total de cavidad es menor que 5 veces la resolución (' + s.res + ' mm): la tasa todavía es poco precisa. Sigue corriendo o mide 3 veces por lectura.</div>';
    $('lfCrit').innerHTML = crit;
    // fuerza contra cavidad
    var fs = [], fx = [], fy = [];
    D.cond.forEach(function (c) {
      var xs = [], ys = [];
      D.read.forEach(function (r) { var e = elecOf(r.eid); if (!e || e.cid !== c.id || r.cav == null || !r.force || !r.force.length) return; r.force.forEach(function (f) { xs.push(r.cav); ys.push(f); }); });
      if (xs.length) { fs.push({ x: xs, y: ys, color: colorOf(c.id), dots: true, noLine: true }); fx = fx.concat(xs); fy = fy.concat(ys); }
    });
    if (fx.length >= 3) {
      var lf = linreg(fx, fy), xm = Math.max(s.cavMax * 1.2, Math.max.apply(null, fx));
      if (lf) fs.push({ x: [0, xm], y: [lf.a, lf.a + lf.b * xm], color: css('--ink-3'), dash: '5 4', width: 1.3 });
      C.line($('lfForce'), { series: fs, xMin: 0, xMax: xm, yMin: 0, xLabel: 'cavidad (mm)', yLabel: 'fuerza (N)', hlines: [{ y: s.fMin, color: '#d0473b', label: 'mínimo' }] });
      var cross = lf && lf.b < 0 ? (s.fMin - lf.a) / lf.b : null;
      $('lfForceTxt').innerHTML = lf ? 'Tendencia: ' + (lf.b * 0.1).toFixed(1) + ' N por cada 0.1 mm de cavidad (p = ' + (isFinite(lf.p) ? lf.p.toFixed(3) : '—') + ', R² ' + (lf.r2 * 100).toFixed(0) + '%). ' + (cross && cross > 0 ? 'La fuerza media cruzaría el mínimo hacia <b>' + cross.toFixed(3) + ' mm</b> de cavidad: ' + (cross < s.cavMax ? '<b>antes</b> del criterio de rectificado actual. Conviene rectificar antes.' : 'después del criterio actual; hay margen.') : 'No se ve caída de fuerza con el desgaste en estos datos.') + ' Es la tendencia de la media; una pieza individual puede caer antes.' : '';
    } else $('lfForceTxt').textContent = 'Se necesitan al menos 3 mediciones de fuerza con su cavidad.';
    // V/I contra cavidad
    var vs = [], vx = [], vy = [];
    D.cond.forEach(function (c) {
      var xs = [], ys = [];
      D.read.forEach(function (r) { var e = elecOf(r.eid); if (!e || e.cid !== c.id || r.cav == null || !r.I || !r.V) return; xs.push(r.cav); ys.push(r.V / r.I); });
      if (xs.length) { vs.push({ x: xs, y: ys, color: colorOf(c.id), dots: true, noLine: true }); vx = vx.concat(xs); vy = vy.concat(ys); }
    });
    if (vx.length >= 3) {
      var lv = linreg(vx, vy), xm2 = Math.max(s.cavMax * 1.2, Math.max.apply(null, vx));
      if (lv) vs.push({ x: [0, xm2], y: [lv.a, lv.a + lv.b * xm2], color: css('--ink-3'), dash: '5 4', width: 1.3 });
      C.line($('lfVI'), { series: vs, xMin: 0, xMax: xm2, xLabel: 'cavidad (mm)', yLabel: 'V/I (mΩ)' });
      $('lfVITxt').innerHTML = lv ? 'Correlación r = ' + lv.r.toFixed(2) + ' (p = ' + (isFinite(lv.p) ? lv.p.toFixed(3) : '—') + '). ' + (Math.abs(lv.r) >= 0.7 && lv.p < 0.05 ? '<b>V/I sigue al desgaste:</b> se puede usar el MONITOR para vigilar el electrodo sin desmontarlo y poner un límite en MONITOR SET.' : 'Todavía no hay relación clara: no uses V/I como criterio de desgaste con estos datos.') : '';
    } else $('lfVITxt').textContent = 'Anota I y V del MONITOR junto con la cavidad (al menos 3 lecturas).';
  }

  // 4 · fotos
  function t4() {
    var groups = D.elec.map(function (e) {
      var rs = D.read.filter(function (r) { return r.eid === e.id && r.ph; }).sort(function (a, b) { return (golpes(a) || 0) - (golpes(b) || 0); });
      return { e: e, rs: rs };
    }).filter(function (g) { return g.rs.length; });
    $('lfBody').innerHTML = groups.length ? groups.map(function (g) {
      var c = condOf(g.e.cid);
      return '<div class="card" style="margin-bottom:12px"><h3><span style="color:' + colorOf(g.e.cid) + '">■</span> ' + esc(g.e.label) + ' · ' + esc(c ? c.name : '') + '</h3><div class="lf-gal">' +
        g.rs.map(function (r) { var src = photo(r.id); return '<figure>' + (src ? '<img src="' + src + '" alt="punta a ' + (golpes(r) || 0) + ' golpes" loading="lazy">' : '<div class="muted">sin imagen</div>') + '<figcaption>' + (golpes(r) != null ? golpes(r).toLocaleString('es-MX') + ' golpes' : '') + (r.cav != null ? ' · ' + r.cav.toFixed(3) + ' mm' : '') + '</figcaption></figure>'; }).join('') + '</div></div>';
    }).join('') : '<div class="note">Aún no hay fotos. Agrégalas en cada lectura (paso 2), con la misma luz, distancia y ángulo, para comparar la huella a lo largo de la vida.</div>';
  }

  /* ---------------- respaldo ---------------- */
  function exportJSON(withPhotos) {
    var out = JSON.parse(JSON.stringify(D));
    if (withPhotos) { out.photos = {}; D.read.forEach(function (r) { if (r.ph) { var p = photo(r.id); if (p) out.photos[r.id] = p; } }); }
    dl('prueba-vida-electrodo.json', JSON.stringify(out), 'application/json');
  }
  function exportCSV() {
    var head = ['condicion', 'programa', 'electrodo', 'contador', 'golpes', 'cavidad_mm', 'I_kA', 'V_V', 'V_I_mOhm', 'P_kW', 'PULSE_pct', 'fuerzas_N', 'fuerza_media_N', 'R_ohm', 'hipot', 'surge', 'visual', 'nota', 'fecha'];
    var rows = D.read.map(function (r) {
      var e = elecOf(r.eid) || {}, c = condOf(e.cid) || {}, f = r.force || [];
      return [c.name, c.prog, e.label, r.counter, golpes(r), r.cav, r.I, r.V, r.I && r.V ? (r.V / r.I).toFixed(4) : '', r.P, r.pulse, f.join(' '), f.length ? mean(f).toFixed(1) : '', r.R, r.hipot, r.surge, r.vis, r.note, r.ts].map(function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    });
    dl('prueba-vida-electrodo.csv', head.join(',') + '\n' + rows.join('\n'), 'text/csv');
  }
  function dl(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function importJSON(file) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d.cond || !d.elec || !d.read) throw new Error('formato');
        if (D.read.length && !confirm('¿Reemplazar los datos actuales con los del archivo?')) return;
        if (d.photos) Object.keys(d.photos).forEach(function (id) { savePhoto(id, d.photos[id]); });
        delete d.photos; D = Object.assign({ set: D.set }, d); save(); nav();
      } catch (e) { alert('El archivo no es un respaldo válido de la prueba de vida.'); }
    };
    rd.readAsText(file);
  }
  function example() {
    if (D.read.length && !confirm('Se agregarán datos de EJEMPLO FICTICIO a los tuyos. ¿Continuar?')) return;
    var R = (function (seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; })(11);
    var ca = { id: uid(), name: 'A · actual 450 ms (EJEMPLO)', prog: 'HEAT 4.30 kA, WELD 450, UP 240, DOWN 40', term: 'T3' };
    var cb = { id: uid(), name: 'B · candidato 400 ms (EJEMPLO)', prog: 'HEAT 4.30 kA, WELD 400, UP 212, DOWN 40', term: 'T3' };
    D.cond.push(ca, cb);
    [[ca, 0.032], [cb, 0.024], [ca, 0.036], [cb, 0.022]].forEach(function (x, i) {
      var e = { id: uid(), label: 'X' + (i + 1), cid: x[0].id, c0: 100000 + i * 6000, mult: 1, date: '2026-10-2' + i, note: 'ejemplo ficticio' }; D.elec.push(e);
      for (var g = 0; g <= 5000; g += 500) {
        var cav = Math.max(0, 0.01 + x[1] * g / 1000 * (1 + (R() - 0.5) * 0.25) + (R() - 0.5) * 0.008);
        var vi = 0.24 - 0.25 * cav + (R() - 0.5) * 0.006, I = 4.3;
        var f1 = 80 - 140 * cav + (R() - 0.5) * 14, f2 = 80 - 140 * cav + (R() - 0.5) * 14;
        D.read.push({ id: uid(), eid: e.id, ts: '', counter: e.c0 + g, cav: +cav.toFixed(3), I: I, V: +(vi * I).toFixed(2), P: null, pulse: null, force: [Math.round(f1), Math.round(f2)], R: 7.62, hipot: 'OK', surge: 'OK', vis: cav > 0.17 ? 'Cobre pegado al electrodo' : 'OK', note: 'EJEMPLO FICTICIO', ph: false });
      }
    });
    save(); tab = 2; nav();
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('lfTabs')) return;
    $('lfTabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; tab = +b.dataset.t; nav(); });
    $('lfJson').onclick = function () { exportJSON(true); };
    $('lfCsv').onclick = exportCSV;
    $('lfImp').onchange = function () { if (this.files[0]) importJSON(this.files[0]); this.value = ''; };
    $('lfEx').onclick = example;
    $('lfClr').onclick = function () { if (!confirm('¿Borrar toda la prueba de vida guardada en este navegador (incluye fotos)?')) return; D.read.forEach(function (r) { if (r.ph) delPhoto(r.id); }); D = { cond: [], elec: [], read: [], set: D.set }; save(); tab = 0; nav(); };
    nav();
    window.addEventListener('themechange', function () { if (tab === 2 || tab === 1) nav(); });
  });
})();
