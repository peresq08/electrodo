/* Interfaz del simulador electro-térmico */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts, PU = window.PulseUI;
  var $ = function (id) { return document.getElementById(id); };
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  // ---------- estado ----------
  var AWG = { 14: 1.628, 15: 1.450, 16: 1.291, 17: 1.150, 18: 1.024, 19: 0.912, 20: 0.812, 21: 0.723, 22: 0.644 };
  var P = Object.assign({}, S.DEFAULTS, { nWires: 3, awg: 17, ins: 'REF' });
  // Tipos de aislamiento. Química, clase térmica y normas: de la especificación de alambre.
  // Espesor por lado: típico NEMA MW-1000 para 17 AWG (sencillo ≈ 21 µm, doble ≈ 41 µm). Temperatura de retiro: estimada por la química.
  var INSUL = {
    REF: { n: 'Referencia del modelo', um: 30, T: 480, note: 'Referencia de calibración: ~30 µm por lado, retiro ~480 °C.' },
    HNP: { n: 'HNP · Heavy Nylon Polyurethane', um: 41, T: 400, note: 'Doble película: poliuretano + capa de poliamida (nylon). Clase 155 °C. NEMA MW-80C · IEC 60317-21. Poliuretano soldable: se retira a menor temperatura.' },
    SNP: { n: 'SNP · Single Nylon Polyurethane', um: 21, T: 400, note: 'Sencillo: poliuretano + poliamida (nylon). Clase 155 °C. NEMA MW-80C · IEC 60317-21.' },
    SP: { n: 'SP · Single Polyurethane', um: 21, T: 390, note: 'Sencillo de poliuretano. Clase 155 °C. NEMA MW-79C · IEC 60317-20. El más fácil de retirar.' },
    'SP-ST': { n: 'SP-ST · Solderable Single Polyurethane', um: 21, T: 430, note: 'Sencillo de poliuretano soldable de clase 180 °C. NEMA MW-82. Pide más temperatura que el SP de clase 155.' },
    HAIP: { n: 'HAIP · Heavy Amide Imide Polyester', um: 41, T: 480, note: 'Doble película: poliéster(amida)(imida) + capa de poliamida-imida. Clase 200 °C. NEMA MW-35C, MW-73C · IEC 60317-13. No soldable.' },
    SAIP: { n: 'SAIP · Single Amide Imide Polyester', um: 21, T: 480, note: 'Sencillo: poliéster(amida)(imida) + poliamida-imida. Clase 200 °C. NEMA MW-35C, MW-74C · IEC 60317-13.' },
    BSAIP: { n: 'BSAIP · Bondable Single AIP', um: 33, T: 470, note: 'Sencillo de poliéster(amida)(imida) + capa autoadherente (bondable). Clase 180 °C. NEMA MW-102 · IEC 60317-38. La capa adherente suma espesor pero se retira fácil.' },
    HPPI: { n: 'HPPI · High Performance Polyamide-imide', um: 41, T: 530, note: 'Poliamida-imida. Clase 220 °C. NEMA MW-81 · IEC 60317-26. El más difícil de retirar. Espesor supuesto de doble capa: confirmar.' }
  };
  var INS_KEY = 'electrodo-insul-v2', insOver = {};
  try { insOver = JSON.parse(localStorage.getItem(INS_KEY) || '{}') || {}; } catch (e) { insOver = {}; }
  function insOf(code) { return Object.assign({}, INSUL[code] || INSUL.REF, insOver[code] || {}); }
  function saveIns() { try { localStorage.setItem(INS_KEY, JSON.stringify(insOver)); } catch (e) {} }
  var GEO0 = { awg: 17, thick: 1.0, hookLen: 8.5, elecX: 0, faceW: 4.5 };
  var GEO_KEYS = ['nWires', 'awg', 'thick', 'hookLen', 'closeAngle', 'elecType', 'stepLen', 'elecD', 'bossH', 'elecX', 'faceW', 'faceDepth'];
  var PROG = PU.defaultProgram();
  function pw(o) { return S.pulseOf(Object.assign({ on: true, ctrl: 'SCD', puls: 1, intv: 0 }, o)); }
  function prog(we1, we2, we3, cool1, cool2, hold) { return { we: [we1 ? pw(we1) : S.pulseOf({}), we2 ? pw(we2) : S.pulseOf({}), we3 ? pw(we3) : S.pulseOf({})], cool1: cool1 || 0, cool2: cool2 || 0, hold: hold == null ? 250 : hold }; }
  var T3 = { uf: 3.15, heat: 4.0, dl: 2.6, up: 240, weld: 450, down: 40 };
  var E_T3 = S.energyOf(prog(T3)).total;
  var EL0 = { wear: 0, faceDepth: 3, awg: 17, thick: 1.0, hookLen: 8.5, closeAngle: 60, elecType: 'flat', stepLen: 2.0, elecD: 6.0, bossH: 1.5, elecLen: 15, elecX: 0, faceW: 4.5 };

  var AWG_OPTS = [[14, '14 AWG · Ø1.63'], [15, '15 AWG · Ø1.45'], [16, '16 AWG · Ø1.29'], [17, '17 AWG · Ø1.15'], [18, '18 AWG · Ø1.02'], [19, '19 AWG · Ø0.91'], [20, '20 AWG · Ø0.81'], [21, '21 AWG · Ø0.72'], [22, '22 AWG · Ø0.64']];
  var groups = [
    { name: 'Terminal', id: 'gTerm', geo: true, items: [
      { k: 'nWires', type: 'seg', opts: [[1, '1'], [2, '2'], [3, '3'], [4, '4']], label: 'Alambres en el gancho' },
      { k: 'awg', type: 'select', opts: AWG_OPTS, label: 'Calibre del alambre' },
      { k: 'thick', label: '<abbr title="Espesor del material de la terminal">Espesor</abbr> (mm)', min: 0.5, max: 1.5, step: 0.05, d: 2 },
      { k: 'hookLen', label: '<abbr title="Largo desarrollado del gancho; define cuánto gancho queda libre después de los alambres">Largo de gancho</abbr> (mm)', min: 5, max: 12, step: 0.1, d: 1 },
      { k: 'ins', type: 'select', opts: Object.keys(INSUL).map(function (c) { return [c, INSUL[c].n]; }), label: 'Aislamiento del alambre' },
      { k: 'Tburn', label: '<abbr title="Temperatura a la que el esmalte se descompone y se retira">T de retiro</abbr> (°C)', min: 350, max: 650, step: 5, d: 0 },
      { k: 'closeAngle', label: '<abbr title="Ángulo con el que la tira baja del último alambre hacia el cuerpo">Ángulo de bajada</abbr> (°)', min: 30, max: 85, step: 1, d: 0 }
    ] },
    { name: 'Electrodo y barra', id: 'gElec', geo: true, items: [
      { k: 'elecType', type: 'seg', opts: [['flat', 'Plano'], ['step', 'Escalonado']], label: '<abbr title="Escalonado: una cara pisa los alambres y otra, más baja, pisa la punta del gancho apoyada sobre el cuerpo">Tipo de electrodo</abbr>' },
      { k: 'stepLen', label: '<abbr title="Largo de la cara baja del escalón, sobre la punta apoyada">Largo del escalón</abbr> (mm)', min: 0.5, max: 4, step: 0.1, d: 1 },
      { k: 'elecD', label: '<abbr title="Diámetro del cilindro de tungsteno del que se maquina la punta">Diámetro del electrodo</abbr> (mm)', min: 3, max: 12, step: 0.1, d: 1 },
      { k: 'bossH', label: '<abbr title="Altura de los rasgos maquinados en la punta (la cara que pisa) antes de llegar al diámetro completo">Altura maquinada</abbr> (mm)', min: 0.3, max: 4, step: 0.1, d: 1 },
      { k: 'elecLen', label: '<abbr title="Largo de tungsteno desde la punta hasta el portaelectrodo enfriado por agua">Largo hasta el agua</abbr> (mm)', min: 5, max: 40, step: 1, d: 0 },
      { k: 'elecX', label: '<abbr title="Corrimiento del centro del electrodo a lo largo del gancho: negativo hacia el doblez, positivo hacia el cierre">Posición</abbr> (mm)', min: -2.5, max: 2.5, step: 0.05, d: 2 },
      { k: 'faceW', label: '<abbr title="Largo de la cara a lo largo del gancho">Largo de cara</abbr> (mm)', min: 2, max: 8, step: 0.1, d: 1 },
      { k: 'faceDepth', label: '<abbr title="Ancho de la cara a lo ancho del gancho (el gancho mide 2 mm)">Ancho de cara</abbr> (mm)', min: 1.5, max: 3.6, step: 0.05, d: 2 },
      { k: 'wear', label: '<abbr title="Profundidad de la huella que el gancho deja en la cara del electrodo">Cavidad</abbr> (mm)', min: 0, max: 0.8, step: 0.02, d: 2 },
      { k: 'Tel0', label: '<abbr title="Temperatura de la punta al empezar (golpes seguidos la calientan)">T inicial punta</abbr> (°C)', min: 30, max: 500, step: 10, d: 0 },
      { k: 'gndCu', type: 'seg', opts: [[false, 'Tungsteno'], [true, 'Cobre']], label: 'Barra de tierra' }
    ] },
    { name: 'Avanzado (modelo)', id: 'gAdv', items: [
      { k: 'fElec', label: 'Factor contacto electrodo', min: 2, max: 25, step: 0.5, d: 1 },
      { k: 'fClose', label: 'Factor contacto del cierre', min: 5, max: 60, step: 1, d: 0 },
      { k: 'zLoss', label: 'Longitud de pérdida 3D (mm)', min: 8, max: 60, step: 1, d: 0 },
      { k: 'Tbond', label: 'T de unión (°C)', min: 550, max: 950, step: 10, d: 0 },
      { k: 'enamelUm', label: '<abbr title="Espesor efectivo del esmalte en el modelo (el anillo es de una celda); cambia el tiempo de retiro y su resistencia térmica">Espesor efectivo de esmalte</abbr> (µm)', min: 10, max: 60, step: 1, d: 0 },
      { k: 'Rref', label: 'R ref. PWR/VLT (mΩ)', min: 0.18, max: 0.4, step: 0.005, d: 3 }
    ] }
  ];
  var PRESETS = [
    { grp: 'Referencia', name: '2 alambres · referencia', p: { nWires: 2 }, g: prog({ uf: 3.31, heat: 4.2, dl: 2.6, up: 220, weld: 405, down: 40 }) },
    { grp: 'Referencia', name: '2 alambres · +10%', p: { nWires: 2 }, g: prog({ uf: 3.31, heat: 4.62, dl: 2.6, up: 220, weld: 405, down: 40 }) },
    { grp: 'Referencia', name: '3 alambres · actual', p: { nWires: 3 }, g: prog(T3) },
    { grp: 'Referencia', name: '3 alambres · −15%', p: { nWires: 3 }, g: prog({ uf: 2.68, heat: 3.4, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { grp: 'Referencia', name: '3 alambres · corto y fuerte', p: { nWires: 3 }, g: prog({ uf: 3.52, heat: 4.45, dl: 2.6, up: 160, weld: 300, down: 40 }) },
    { grp: 'Varios pulsos', name: 'Precalentamiento + principal', p: { nWires: 3 }, g: prog({ uf: 2.8, heat: 2.8, dl: 2.8, up: 0, weld: 150, down: 0 }, T3, null, 30) },
    { grp: 'Varios pulsos', name: 'Principal + post-calentamiento', p: { nWires: 3 }, g: prog(T3, { uf: 2.5, heat: 2.5, dl: 2.5, up: 0, weld: 150, down: 0 }, null, 10) },
    { grp: 'Varios pulsos', name: 'Pulsación 3 × 150 ms', p: { nWires: 3 }, g: prog({ uf: 3.73, heat: 3.73, dl: 3.73, up: 0, weld: 150, down: 0, puls: 3, intv: 30 }) },
    { grp: 'Varios pulsos', name: 'VLT para esmalte + SCD', p: { nWires: 3 }, g: prog({ ctrl: 'VLT', uf: 4.0, heat: 4.0, dl: 4.0, up: 0, weld: 120, down: 0 }, { uf: 3.6, heat: 4.0, dl: 2.6, up: 100, weld: 330, down: 40 }, null, 5) },
    { grp: 'Varios pulsos', name: '+ dos pulsos de 0.5 kA', p: { nWires: 3 }, g: prog(T3, { uf: 0.5, heat: 0.5, dl: 0.5, up: 0, weld: 100, down: 0 }, { uf: 0.5, heat: 0.5, dl: 0.5, up: 0, weld: 100, down: 0 }, 20, 20) },
    { grp: 'Electrodo', name: 'Electrodo gastado', p: { nWires: 3, wear: 0.4 }, g: prog(T3) },
    { grp: 'Electrodo', name: 'Gastado + técnico sube corriente', p: { nWires: 3, wear: 0.4 }, g: prog({ uf: 3.15, heat: 4.4, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { grp: 'Electrodo', name: 'Electrodo corrido hacia el cierre', p: { nWires: 3, elecX: 1.5 }, g: prog(T3) },
    { grp: 'Electrodo', name: 'Electrodo corrido hacia el doblez', p: { nWires: 3, elecX: -1.5 }, g: prog(T3) },
    { grp: 'Electrodo', name: 'Cara angosta (−10% de corriente)', p: { nWires: 3, faceDepth: 1.75 }, g: prog({ uf: 2.85, heat: 3.6, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { grp: 'Calibre grueso', name: '14 AWG · 2 alambres · electrodo plano', p: { nWires: 2, awg: 14 }, g: prog({ uf: 3.5, heat: 4.45, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { grp: 'Calibre grueso', name: '14 AWG · 2 alambres · electrodo escalonado', p: { nWires: 2, awg: 14, elecType: 'step', stepLen: 2.0 }, g: prog({ uf: 3.55, heat: 4.5, dl: 2.6, up: 240, weld: 450, down: 40 }) },
    { grp: 'Control', name: 'Modo PWR', p: { nWires: 3 }, g: prog(Object.assign({ ctrl: 'PWR' }, T3)) }
  ];

  var inputs = {}, pulseEd = null;
  function fieldHTML(it) {
    if (it.type === 'seg') return '<div class="row r2"><label>' + it.label + '</label><div class="seg" data-k="' + it.k + '">' + it.opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    if (it.type === 'select') return '<div class="row r2"><label>' + it.label + '</label><select data-k="' + it.k + '" id="in_' + it.k + '">' + it.opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('') + '</select></div>';
    return '<div class="row"><label for="in_' + it.k + '">' + it.label + '</label><input type="range" id="in_' + it.k + '" data-k="' + it.k + '" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '"><output id="out_' + it.k + '"></output></div>';
  }
  function buildControls() {
    var box = $('simControls'), h = '', grpNames = [];
    PRESETS.forEach(function (p) { if (grpNames.indexOf(p.grp) < 0) grpNames.push(p.grp); });
    h += '<div class="ctl-scroll">';
    h += '<div class="ctl-group"><div class="row r2" style="grid-template-columns:62px 1fr"><label>Caso</label><select id="presetSel"><option value="">— personalizado —</option>' +
      grpNames.map(function (gname) { return '<optgroup label="' + gname + '">' + PRESETS.map(function (pr, i) { return pr.grp === gname ? '<option value="' + i + '">' + pr.name + '</option>' : ''; }).join('') + '</optgroup>'; }).join('') + '</select></div><div id="calibBox"></div></div>';
    h += '<div class="ctl-group"><div class="gh">Programa del controlador <span>como en la pantalla</span></div><div id="simPulses"></div></div>';
    groups.forEach(function (g) {
      h += '<details class="ctl-det" id="' + g.id + '"><summary><span>' + g.name + '</span><em id="' + g.id + 'Sum"></em></summary><div class="ctl-det-body">' +
        (g.geo ? '<div class="geo3d-host" data-geo3d><div class="geo3d-msg">Cargando vista 3D…</div></div>' : '') +
        g.items.map(fieldHTML).join('') + '</div></details>';
    });
    h += '</div>';
    h += '<div class="ctl-run"><div class="btns"><button class="btn" id="runBtn" type="button">▶ Simular</button><button class="btn ghost" id="refBtn" type="button" disabled>Fijar referencia</button><button class="btn ghost" id="clrBtn" type="button" disabled>Quitar ref.</button></div><div class="progress"><i id="prog"></i></div><div class="muted" style="font-size:12px;margin-top:4px" id="runInfo">Cada corrida tarda de 1 a 4 s.</div></div>';
    box.innerHTML = h;
    groups.forEach(function (g) { g.items.forEach(function (it) { inputs[it.k] = it; }); });
    pulseEd = PU.create($('simPulses'), PROG, function () { markPreset(-1); sync(); });
    box.querySelectorAll('input[type=range][data-k]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.dataset.k; P[k] = parseFloat(inp.value);
        if (k === 'Tburn') { insOver[P.ins] = Object.assign({}, insOver[P.ins] || {}, { T: P[k] }); saveIns(); }
        sync(); markPreset(-1); geoPreview(k);
      });
    });
    box.querySelectorAll('select[data-k]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var k = sel.dataset.k;
        if (k === 'ins') { P.ins = sel.value; P.Tburn = insOf(P.ins).T; }
        else P[k] = +sel.value;
        sync(); markPreset(-1); geoPreview(k);
      });
    });
    box.querySelector('#in_Tburn').closest('.row').insertAdjacentHTML('beforebegin', '<div class="note mini" id="insNote"></div>');
    box.querySelectorAll('.seg[data-k]').forEach(function (sg) {
      sg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var k = sg.dataset.k, v = b.dataset.v;
        P[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
        sync(); markPreset(-1); geoPreview(k);
      });
    });
    // vista 3D en el menú abierto
    box.querySelectorAll('details.ctl-det').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        var host = d.querySelector('[data-geo3d]');
        if (host) { box.querySelectorAll('details.ctl-det').forEach(function (o) { if (o !== d && o.open && o.querySelector('[data-geo3d]')) o.open = false; }); attach3D(host); }
      });
    });
    $('presetSel').addEventListener('change', function () { if (this.value === '') return; var i = +this.value; applyPreset(PRESETS[i]); run(); });
    $('runBtn').addEventListener('click', run);
    $('refBtn').addEventListener('click', function () { if (cur) { ref = cur; $('clrBtn').disabled = false; drawCharts(); renderMetrics(); } });
    $('clrBtn').addEventListener('click', function () { ref = null; $('clrBtn').disabled = true; drawCharts(); renderMetrics(); });
  }
  var pending3D = null;
  function attach3D(host) {
    if (window.Geo3D) { var m = host.querySelector('.geo3d-msg'); if (m) m.remove(); window.Geo3D.attach(host); window.Geo3D.update(params()); }
    else pending3D = host;
  }
  window.addEventListener('geo3dready', function () { if (pending3D) attach3D(pending3D); });
  function update3D() { if (window.Geo3D) window.Geo3D.update(params()); }
  function setProgram(g) {
    PROG.we = g.we.map(function (w) { return Object.assign({}, w); });
    PROG.cool1 = g.cool1 || 0; PROG.cool2 = g.cool2 || 0; if (g.hold != null) PROG.hold = g.hold;
  }
  function applyPreset(pr) { Object.assign(P, EL0, pr.p); setProgram(pr.g); sync(); update3D(); }
  function markPreset(i) { var s = $('presetSel'); if (s && i < 0) s.value = ''; else if (s) s.value = String(i); }
  function calibBox() {
    var c = window.Calib, info = c.info(P.nWires), box = $('calibBox');
    if (!box) return;
    if (!isDefaultGeo()) { box.innerHTML = '<div class="note mini">Geometría distinta a la de referencia: se simula <b>sin calibración</b>. Sirve para comparar, no para fijar parámetros.</div>'; return; }
    if (!info) { box.innerHTML = '<div class="note mini">Modelo <b>sin calibrar</b> para ' + P.nWires + ' alambres · <a href="#asistente">calibrar con mis datos</a></div>'; return; }
    box.innerHTML = '<div class="note mini"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="calOn"' + (c.enabled() ? ' checked' : '') + '> Calibrado con mis datos: <b>×' + info.c.toFixed(3) + '</b> (' + info.n + ' corridas, ' + Math.round(info.acc * 100) + '%)</label></div>';
    $('calOn').onchange = function () { c.setEnabled(this.checked); };
  }
  function groupSummaries() {
    var t = $('gTermSum'), e = $('gElecSum');
    if (t) t.textContent = P.nWires + ' × ' + P.awg + ' AWG ' + (P.ins !== 'REF' ? P.ins + ' ' : '') + '· ' + (+P.thick).toFixed(2) + ' mm · gancho ' + (+P.hookLen).toFixed(1);
    if (e) e.textContent = 'Ø' + (+P.elecD).toFixed(1) + ' · ' + (P.elecType === 'step' ? 'escalonado · ' : '') + (P.elecX ? (P.elecX > 0 ? '+' : '') + (+P.elecX).toFixed(2) + ' mm · ' : '') + (+P.faceW).toFixed(1) + '×' + (+P.faceDepth).toFixed(2) + (P.wear > 0 ? ' · cav ' + (+P.wear).toFixed(2) : '');
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
    calibBox(); groupSummaries();
    var nb = $('insNote'); if (nb) { var d = insOf(P.ins), ed = insOver[P.ins]; nb.innerHTML = d.note + ' <br>En el modelo el tipo solo cambia la <b>temperatura de retiro</b> (vaporización del esmalte).' + (ed ? ' <b>Valores editados por ti.</b> <a href="#" id="insReset">restablecer</a>' : ''); var rs = $('insReset'); if (rs) rs.onclick = function (e) { e.preventDefault(); delete insOver[P.ins]; saveIns(); P.Tburn = insOf(P.ins).T; sync(); }; }
    $('runBtn').disabled = S.checkProgram(PROG).length > 0 || busy;
  }
  function isDefaultGeo() { return (P.nWires === 2 || P.nWires === 3) && P.awg === 17 && P.thick === 1.0 && P.hookLen === 8.5 && P.closeAngle === 60 && P.elecType === 'flat' && P.elecD === 6 && P.bossH === 1.5 && P.elecLen === 15; }
  var geoTimer = null;
  function geoPreview(k) {
    if (GEO_KEYS.concat(['wear', 'gndCu']).indexOf(k) < 0) return;
    update3D();
    if (GEO_KEYS.indexOf(k) < 0) return;
    clearTimeout(geoTimer);
    geoTimer = setTimeout(function () {
      var p = params(), g = S.buildGeometry(Object.assign({}, S.DEFAULTS, p));
      drawSection($('heat'), { NX: g.NX, NY: g.NY, mat: Array.from(g.mat), dx: g.dx }, null, 'mat');
      var ctx = $('heat').getContext('2d'); ctx.font = '600 22px "IBM Plex Sans", sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText('Vista previa del corte · presiona Simular', 16, 32);
      $('heatLegend').textContent = 'Gancho libre después de los alambres: ' + (g.info.free * 1e3).toFixed(2) + ' mm (' + (g.info.reaches ? 'baja ' + (g.info.slopeLen * 1e3).toFixed(2) + ' mm y apoya ' + (g.info.flat * 1e3).toFixed(2) + ' mm' : 'NO alcanza el cuerpo') + ') · electrodo de ' + (g.info.xE0 * 1e3).toFixed(2) + ' a ' + (g.info.xE1 * 1e3).toFixed(2) + ' mm · gancho de ' + (g.info.xL * 1e3).toFixed(2) + ' a ' + (g.info.xT1 * 1e3).toFixed(2) + ' mm' + (g.info.xE1 > g.info.xT1 + 1e-6 ? ' · el electrodo sobresale del gancho' : '');
    }, 120);
  }
  function params() {
    var p = Object.assign({}, P, { we: PROG.we, cool1: PROG.cool1, cool2: PROG.cool2, hold: PROG.hold });
    var d = AWG[P.awg] || 1.15; p.wireCore = d / 2 - 0.025; p.wireDiam = d;
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
      renderAll(); addHist(r);
    }).catch(function (err) { busy = false; sync(); $('runInfo').textContent = 'Error: ' + err.message; });
  }

  // ---------- render del corte ----------
  var MATCOL = ['#0e1013', '#7b8794', '#c87a43', '#e09a5c', '#3f8f5a', '#5c6670', '#d1a23c', '#a0aab5', '#808a94', '#97a3b0', '#a8743f'];
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
  function grp(m) { return m === 3 ? 2 : m === 6 ? 2 : m === 10 ? 2 : m === 9 ? 1 : m === 7 ? 1 : m === 8 ? 5 : m; }
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
      else if (lay === 'bond') col = (m === 4 || m === 6 || m === 10) ? cmapF(fr.bond[n]) : grey(m);
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
      if (m === 6 || m === 10) s += ' · unión ' + Math.round(fr.bond[n] * 100) + '%';
      if (fr.melt[n] > 0.5) s += ' · FUNDIDO';
      s += ' · (' + (x * cur.dx * 1e3).toFixed(2) + ', ' + (y * cur.dx * 1e3).toFixed(2) + ') mm';
      hr.textContent = s; hr.style.display = 'block';
      var wr = cv.parentNode.getBoundingClientRect(); hr.style.left = (e.clientX - wr.left) + 'px'; hr.style.top = (e.clientY - wr.top) + 'px';
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
    var pc = { Tw: '#2c8fd6', Tt: '#d4a017', Tc: '#3a9a5b', Te: '#d0473b' }, lab = { Tw: 'Alambre central', Tt: 'Gancho-alambre', Tc: 'Punta del gancho', Te: 'Punta electrodo' };
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
    var serB = [{ x: tt, y: T(s, 'burn', 100), color: '#6b7a8c', width: 2 }, { x: tt, y: T(s, 'bondW', 100), color: '#2c8fd6', width: 2 }, { x: tt, y: T(s, 'bondMin', 100), color: ok, width: 2 }, { x: tt, y: T(s, 'bondC', 100), color: '#d4a017', width: 1.5, dash: '3 3' }, { x: tt, y: T(s, 'melt'), color: '#d0473b', width: 2, axis: 2 }];
    if (rs) serB.push({ x: rt, y: T(rs, 'bondMin', 100), color: ok, width: 1.4, dash: '6 4', opacity: 0.5 });
    C.line($('chB'), { series: serB, xMin: 0, xMax: xMax, yMin: 0, yMax: 105, y2Min: 0, y2Max: Math.max(2, cur.summary.melt * 1.2), xLabel: 'ms', yLabel: '%', y2Label: 'mm² fundidos', cursor: tNow, bands: bands });
    C.legend($('lgB'), [{ color: '#6b7a8c', label: 'Esmalte retirado' }, { color: '#2c8fd6', label: 'Alambres unidos' }, { color: ok, label: 'Alambre más débil' }, { color: '#d4a017', label: 'Punta del gancho (unión)' }, { color: '#d0473b', label: 'Cobre fundido (mm², eje der.)' }]);
  }
  function elecZone(t) {
    if (t < 700) return { c: 'ok', t: 'poco efecto en el tungsteno' };
    if (t < 900) return { c: 'warn', t: 'oxidación del tungsteno' };
    if (t < 1083) return { c: 'warn', t: 'se ablanda: la cara toma la huella' };
    if (t < 1200) return { c: 'bad', t: 'el cobre se funde y se pega' };
    return { c: 'bad', t: 'recristaliza y se fragiliza' };
  }
  window.ElecZone = elecZone;
  function metric(label, v, d, frac, cls) {
    return '<div class="metric"><div class="l">' + label + '</div><div class="v"' + (cls ? ' style="color:var(--' + cls + ')"' : '') + '>' + v + '</div>' + (d ? '<div class="d muted">' + d + '</div>' : '') + (frac != null ? '<div class="meter"><i style="width:' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%"></i></div>' : '') + '</div>';
  }
  function diff(a, b, dec, unit) { if (b == null) return ''; var d = a - b; return (d >= 0 ? '+' : '') + d.toFixed(dec) + (unit || '') + ' vs ref.'; }
  function renderMetrics() {
    if (!cur) return;
    var s = cur.summary, r = ref && ref.summary, v = cur.verdict, cp = cur.params;
    var vd = $('verdict'); vd.className = 'verdict ' + v.cls;
    vd.innerHTML = '<div class="big">' + v.code + '</div><div><b>' + v.text + '</b><div class="muted" style="margin-top:4px">' +
      cp.nWires + ' alambres' + (cp.awg !== 17 ? ' ' + cp.awg + ' AWG' : '') + (cp.ins && cp.ins !== 'REF' ? ' ' + cp.ins : '') + (cp.thick !== 1 ? ' · terminal ' + cp.thick.toFixed(2) + ' mm' : '') + (cp.hookLen !== 8.5 ? ' · gancho ' + cp.hookLen.toFixed(1) + ' mm' : '') + (cp.elecType === 'step' ? ' · electrodo escalonado' : '') + (cp.elecX ? ' · electrodo corrido ' + (cp.elecX > 0 ? '+' : '') + cp.elecX.toFixed(2) + ' mm' : '') + ' · ' + PU.describe(cp) + (cp.wear > 0 ? ' · cavidad ' + cp.wear.toFixed(2) + ' mm' : '') + (cp.iCal !== 1 ? ' · calibrado ×' + cp.iCal.toFixed(3) : '') + '</div></div>';
    var maxPulse = Math.max.apply(null, cur.series.map(function (o) { return o.pulse; }));
    var tEnd = s.tWeldEnd;
    $('metrics').innerHTML =
      metric('Esmalte retirado', Math.round(s.burn * 100) + '%', s.tBurn ? 'completo a los ' + s.tBurn.toFixed(0) + ' ms' : 'no se completó', s.burn) +
      metric('Alambres unidos', Math.round(s.bondW * 100) + '%', diff(s.bondW * 100, r && r.bondW * 100, 0, ' pts'), s.bondW) +
      metric('Alambre más débil', Math.round(s.bondMin * 100) + '%', r ? diff(s.bondMin * 100, r.bondMin * 100, 0, ' pts') : (s.reaches === false ? 'gancho abierto' : 'punta del gancho ' + Math.round(s.bondC * 100) + '% unida'), s.bondMin) +
      metric('Cobre fundido', s.melt.toFixed(2) + ' mm²', s.melt > 1 ? 'quemada' : s.melt > 0.3 ? 'superficial' : 'sin fusión', null, s.melt > 1 ? 'bad' : s.melt > 0.3 ? 'warn' : null) +
      metric('Pico punta electrodo', s.peaks.Te.toFixed(0) + ' °C', r ? diff(s.peaks.Te, r.peaks.Te, 0, ' °C') : elecZone(s.peaks.Te).t, null, elecZone(s.peaks.Te).c) +
      metric('Pico en el cobre', (s.peaks.Tcu || s.peaks.Tt).toFixed(0) + ' °C', r ? diff(s.peaks.Tcu || 0, r.peaks.Tcu || 0, 0, ' °C') : 'alambre central ' + s.peaks.Tw.toFixed(0) + ' °C', null, (s.peaks.Tcu || 0) >= 1080 ? 'bad' : null) +
      metric('Energía eléctrica', s.Eel.toFixed(0) + ' J', s.perPulse.map(function (x, i) { return x.E > 0 ? 'WE' + (i + 1) + ' ' + x.E.toFixed(0) : ''; }).filter(Boolean).join(' · ')) +
      metric('Tiempo con corriente', tEnd.toFixed(0) + ' ms', 'calor en el cobre ' + s.Ejoint.toFixed(0) + ' J (' + (s.Ejoint / s.Eel * 100).toFixed(1) + '%) · PULSE máx ' + maxPulse.toFixed(0) + '%');
  }
  function renderAll() { renderHeat(); drawCharts(); renderMetrics(); }
  // ---------- historial de corridas ----------
  var HKEY = 'electrodo-hist-v1', hist = [];
  try { hist = JSON.parse(localStorage.getItem(HKEY) || '[]') || []; } catch (e) { hist = []; }
  function saveHist() { try { localStorage.setItem(HKEY, JSON.stringify(hist.slice(0, 40))); } catch (e) {} }
  function addHist(r) {
    var s = r.summary, cp = r.params;
    hist.unshift({ id: Date.now(), t: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      desc: cp.nWires + '×' + cp.awg + ' AWG' + (cp.ins && cp.ins !== 'REF' ? ' ' + cp.ins : '') + (cp.elecType === 'step' ? ' · escalonado' : '') + (cp.wear > 0 ? ' · cav ' + cp.wear.toFixed(2) : '') + (cp.elecX ? ' · pos ' + cp.elecX.toFixed(2) : '') + ' · ' + PU.describe(cp),
      v: r.verdict.code, cls: r.verdict.cls, E: Math.round(s.Eel), I2t: +S.energyOf(cp).total.toFixed(2), Tcu: Math.round(s.peaks.Tcu || 0), Te: Math.round(s.peaks.Te), bm: Math.round((s.bondMin || 0) * 100), m: +s.melt.toFixed(2), tEnd: Math.round(s.tWeldEnd),
      p: (function () { var o = {}; Object.keys(P).forEach(function (k) { o[k] = P[k]; }); return o; })(), g: PU.clone(PROG) });
    hist = hist.slice(0, 40); saveHist(); renderHist();
  }
  function renderHist() {
    var box = $('histBox'); if (!box) return;
    if (!hist.length) { box.innerHTML = '<p class="muted">Aún no hay corridas.</p>'; return; }
    box.innerHTML = '<table class="hist"><thead><tr><th>Hora</th><th>Caso</th><th>Resultado</th><th>Energía</th><th>I²t</th><th>Pico cobre</th><th>Pico punta</th><th>Alambre más débil</th><th>Fundido</th><th>Corriente</th></tr></thead><tbody>' +
      hist.map(function (h, i) {
        var z = elecZone(h.Te);
        return '<tr data-h="' + i + '" title="Clic para volver a cargar este caso"><td>' + h.t + '</td><td class="hdesc">' + h.desc + '</td><td><span class="tag ' + h.cls + '">' + h.v + '</span></td><td><b>' + h.E + ' J</b></td><td>' + h.I2t + '</td><td style="color:var(--' + (h.Tcu >= 1080 ? 'bad' : 'ink') + ')">' + h.Tcu + ' °C</td><td style="color:var(--' + z.c + ')"><b>' + h.Te + ' °C</b></td><td>' + h.bm + '%</td><td>' + h.m + ' mm²</td><td>' + h.tEnd + ' ms</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function histSetup() {
    renderHist();
    var box = $('histBox'); if (!box) return;
    box.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-h]'); if (!tr) return;
      var h = hist[+tr.dataset.h]; if (!h) return;
      Object.assign(P, h.p); setProgram(h.g); sync(); update3D(); markPreset(-1); run();
      document.querySelector('.simx').scrollIntoView({ behavior: 'smooth' });
    });
    var clr = $('histClear'); if (clr) clr.onclick = function () { hist = []; saveHist(); renderHist(); };
    var exp = $('histCsv'); if (exp) exp.onclick = function () {
      var rows = [['hora', 'caso', 'resultado', 'energia_J', 'I2t_kA2s', 'pico_cobre_C', 'pico_punta_C', 'alambre_mas_debil_pct', 'fundido_mm2', 'corriente_ms']].concat(hist.map(function (h) { return [h.t, '"' + h.desc.replace(/"/g, '""') + '"', h.v, h.E, h.I2t, h.Tcu, h.Te, h.bm, h.m, h.tEnd]; }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv' })); a.download = 'historial-simulaciones.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 300);
    };
  }
  function chartTabs() {
    document.querySelectorAll('.simx-charts').forEach(function (card) {
      var t = card.querySelector('.chart-tabs');
      t.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        t.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        card.querySelectorAll('.chart-pane').forEach(function (p) { p.hidden = p.dataset.pane !== b.dataset.pane; });
      });
    });
  }

  function init() {
    buildControls(); applyPreset(PRESETS[2]); markPreset(2); hoverSetup(); chartTabs(); histSetup();
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
      sync(); update3D(); markPreset(-1); document.getElementById('simulador').scrollIntoView(); run();
    },
    simulate: enqueue, prog: prog, energyT3: E_T3,
    drawSection: drawSection, MATCOL: MATCOL
  };
  document.addEventListener('DOMContentLoaded', init);
})();
