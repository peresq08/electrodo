/* Editor del programa de pulsos (WE1, WE2, WE3) reutilizable, como las pantallas SCHEDULE del controlador */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts;
  var WE_COL = ['#c4652e', '#2c7fb8', '#7b52b3'];
  var FIELDS = [
    ['uf', '<abbr title="Corriente al inicio de la rampa de subida">UF</abbr> (kA)', 0.3, 6, 0.05, 2],
    ['heat', '<abbr title="Consigna de la meseta. En PWR/VLT son kA equivalentes a la R de referencia">HEAT</abbr> (kA)', 0.3, 6, 0.05, 2],
    ['dl', '<abbr title="Corriente al final de la rampa de bajada">DL</abbr> (kA)', 0.3, 6, 0.05, 2],
    ['up', 'UP (ms)', 0, 500, 5, 0],
    ['weld', '<abbr title="Tiempo de cada pulso; incluye UP y DOWN">WELD</abbr> (ms)', 0, 800, 5, 0],
    ['down', 'DOWN (ms)', 0, 300, 5, 0],
    ['puls', '<abbr title="Repeticiones del pulso (PULSATION)">PULSATION</abbr>', 1, 9, 1, 0],
    ['intv', '<abbr title="Tiempo sin corriente entre repeticiones">INTERVAL</abbr> (ms)', 0, 200, 5, 0]
  ];
  var GLOBAL = [['cool1', 'COOL1 (WE1→WE2) ms', 0, 300, 5, 0], ['cool2', 'COOL2 (WE2→WE3) ms', 0, 300, 5, 0], ['hold', 'HOLD (ms)', 0, 600, 10, 0]];

  function sample(state, step) {
    var wf = S.makeWaveform(state), end = wf.total * 1e3, xs = [], ys = [[], [], []], all = [];
    for (var t = 0; t <= end + 1e-9; t += step) {
      var v = wf.at(t / 1e3), id = wf.idx;
      xs.push(t);
      for (var i = 0; i < 3; i++) ys[i].push(id === i ? v : NaN);
      all.push(v);
    }
    return { xs: xs, ys: ys, all: all, wf: wf };
  }

  function create(box, state, onChange, opts) {
    opts = opts || {};
    var cur = 0, uid = 'pu' + Math.random().toString(36).slice(2, 7);
    function rowHTML(k, label, min, max, step) {
      return '<div class="row"><label>' + label + '</label><input type="range" data-pk="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '"><output data-po="' + k + '"></output></div>';
    }
    box.innerHTML =
      '<div class="seg we-tabs" style="margin-bottom:8px">' + [0, 1, 2].map(function (i) { return '<button type="button" data-we="' + i + '"><i class="dot" style="background:' + WE_COL[i] + '"></i>WE' + (i + 1) + '</button>'; }).join('') + '</div>' +
      '<div class="row" style="grid-template-columns:1fr 170px"><label>Pulso activo</label><div class="seg" data-pseg="on"><button type="button" data-v="true">Sí</button><button type="button" data-v="false">No</button></div></div>' +
      '<div class="row" style="grid-template-columns:1fr 170px"><label><abbr title="Modo de control de este pulso">CTRL</abbr></label><div class="seg" data-pseg="ctrl"><button type="button" data-v="SCD">SCD</button><button type="button" data-v="PWR">PWR</button><button type="button" data-v="VLT">VLT</button></div></div>' +
      FIELDS.map(function (f) { return rowHTML(f[0], f[1], f[2], f[3], f[4]); }).join('') +
      '<div style="border-top:1px dashed var(--line);margin:8px 0 6px"></div>' +
      GLOBAL.filter(function (g) { return !(opts.noHold && g[0] === 'hold'); }).map(function (g) { return '<div class="row"><label>' + g[1] + '</label><input type="range" data-gk="' + g[0] + '" min="' + g[2] + '" max="' + g[3] + '" step="' + g[4] + '"><output data-go="' + g[0] + '"></output></div>'; }).join('') +
      '<svg class="chart" viewBox="0 0 420 150" data-prev style="margin-top:6px"></svg>' +
      '<div class="pu-info" style="font-size:12.5px;color:var(--ink-2)"></div>';
    var tabs = box.querySelector('.we-tabs');
    tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; cur = +b.dataset.we; render(); });
    box.addEventListener('input', function (e) {
      var k = e.target.dataset.pk, g = e.target.dataset.gk;
      if (k) state.we[cur][k] = parseFloat(e.target.value);
      else if (g) state[g] = parseFloat(e.target.value);
      else return;
      render(); onChange && onChange();
    });
    box.addEventListener('click', function (e) {
      var sg = e.target.closest('[data-pseg]'), b = e.target.closest('button');
      if (!sg || !b) return;
      var k = sg.dataset.pseg, v = b.dataset.v;
      state.we[cur][k] = v === 'true' ? true : v === 'false' ? false : v;
      render(); onChange && onChange();
    });
    function render() {
      var w = state.we[cur];
      tabs.querySelectorAll('button').forEach(function (b, i) { b.classList.toggle('on', i === cur); b.style.opacity = state.we[i].on ? 1 : 0.55; });
      box.querySelectorAll('[data-pseg]').forEach(function (sg) { var k = sg.dataset.pseg; sg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', String(w[k]) === b.dataset.v); }); });
      FIELDS.forEach(function (f) {
        var inp = box.querySelector('[data-pk="' + f[0] + '"]'); if (document.activeElement !== inp) inp.value = w[f[0]];
        box.querySelector('[data-po="' + f[0] + '"]').textContent = (+w[f[0]]).toFixed(f[5]);
        inp.disabled = !w.on; inp.closest('.row').style.opacity = w.on ? 1 : 0.45;
      });
      GLOBAL.forEach(function (g) {
        var inp = box.querySelector('[data-gk="' + g[0] + '"]'); if (!inp) return;
        if (document.activeElement !== inp) inp.value = state[g[0]] || 0;
        box.querySelector('[data-go="' + g[0] + '"]').textContent = (+(state[g[0]] || 0)).toFixed(g[5]);
      });
      // vista previa
      var sm = sample(state, 1), ser = [{ x: sm.xs, y: sm.all, color: '#8a939e', width: 1.2 }];
      for (var i = 0; i < 3; i++) ser.push({ x: sm.xs, y: sm.ys[i], color: WE_COL[i], width: 2, fill: false });
      var hold = state.hold || 0;
      C.line(box.querySelector('[data-prev]'), { series: ser, xMin: 0, xMax: Math.max(50, sm.xs[sm.xs.length - 1]), yMin: 0, yMax: Math.max(2, Math.max.apply(null, state.we.map(function (x) { return x.on ? Math.max(x.heat, x.uf, x.dl) : 0; })) * 1.12), xLabel: 'ms', yLabel: 'kA',
        bands: hold > 0 ? [{ x0: sm.wf.tWeldEnd * 1e3, x1: sm.wf.total * 1e3, color: '#888', opacity: 0.08 }] : [] });
      var en = S.energyOf(state), errs = S.checkProgram(state);
      var txt = 'I²t: ' + en.per.map(function (e, i) { return state.we[i].on ? '<span style="color:' + WE_COL[i] + '">WE' + (i + 1) + ' ' + e.toFixed(2) + '</span>' : ''; }).filter(Boolean).join(' · ') + ' · <b>total ' + en.total.toFixed(2) + ' kA²·s</b> · corriente hasta ' + Math.round(sm.wf.tWeldEnd * 1e3) + ' ms';
      if (errs.length) txt += '<div style="color:var(--bad);margin-top:4px"><b>E-10:</b> ' + errs.join('; ') + '</div>';
      box.querySelector('.pu-info').innerHTML = txt;
    }
    render();
    return { render: render, select: function (i) { cur = i; render(); } };
  }

  function defaultProgram() {
    return { we: [S.pulseOf({ on: true, ctrl: 'SCD', uf: 3.15, heat: 4.0, dl: 2.6, up: 240, weld: 450, down: 40 }), S.pulseOf({}), S.pulseOf({})], cool1: 0, cool2: 0, hold: 250 };
  }
  function clone(pr) { return { we: pr.we.map(function (w) { return Object.assign({}, w); }), cool1: pr.cool1 || 0, cool2: pr.cool2 || 0, hold: pr.hold }; }
  function describe(pr) {
    var parts = [];
    pr.we.forEach(function (w, i) {
      if (!w.on || !(w.weld > 0)) return;
      parts.push('WE' + (i + 1) + ' ' + w.ctrl + ' ' + (+w.heat).toFixed(2) + ' kA × ' + w.weld + ' ms' + (w.puls > 1 ? ' ×' + w.puls : ''));
    });
    return parts.join(' + ');
  }
  // Escala las corrientes de un pulso para que el programa tenga la energía objetivo (kA²·s)
  function equalize(pr, target, wi) {
    var en = S.energyOf(pr), other = en.total - en.per[wi];
    if (en.per[wi] <= 0 || target <= other) return pr;
    var f = Math.sqrt((target - other) / en.per[wi]), w = pr.we[wi];
    w.uf *= f; w.heat *= f; w.dl *= f;
    return pr;
  }
  window.PulseUI = { create: create, defaultProgram: defaultProgram, clone: clone, describe: describe, equalize: equalize, sample: sample, WE_COL: WE_COL };
})();
