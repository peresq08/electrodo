/* Editor del programa de pulsos con el formato de las pantallas SCHEDULE (1) y (2) del controlador.
 * WELD = 000 apaga ese pulso, igual que en la máquina. Flechas ↑↓ ajustan (Shift = ×10). */
(function () {
  'use strict';
  var S = window.FusingSim, C = window.Charts;
  var WE_COL = ['#c4652e', '#2c7fb8', '#7b52b3'];
  // [clave, dígitos enteros, decimales, mínimo, máximo, paso]
  var F = {
    sqd: [4, 0, 0, 9999, 10], sqz: [4, 0, 0, 9999, 10], cool1: [4, 0, 0, 9999, 5], cool2: [4, 0, 0, 9999, 5], hold: [4, 0, 0, 9999, 10], off: [4, 0, 0, 9990, 10],
    up: [3, 0, 0, 999, 5], weld: [3, 0, 0, 999, 5], down: [3, 0, 0, 999, 5],
    uf: [2, 2, 0, 20, 0.01], heat: [2, 2, 0, 20, 0.01], dl: [2, 2, 0, 20, 0.01],
    puls: [2, 0, 1, 19, 1], intv: [3, 0, 0, 999, 5]
  };
  var HELP = {
    sqd: ['SQD · retardo de apriete', '0–9999 ms', 'Se suma a SQZ solo en la primera soldadura tras la señal de inicio. No cambia el calor: no afecta la simulación.'],
    sqz: ['SQZ · apriete', '0–9999 ms', 'Tiempo con fuerza antes de la corriente. Si es más corto que la carrera del electrodo sale E-07. No afecta la simulación.'],
    cool1: ['COOL1', '0–9999 ms', 'Pausa sin corriente entre WE1 y WE2. Con precalentamiento deja que la temperatura se iguale.'],
    cool2: ['COOL2', '0–9999 ms', 'Pausa sin corriente entre WE2 y WE3.'],
    hold: ['HOLD · sostener', '0–9999 ms', 'Fuerza aplicada sin corriente al final: la unión se enfría bajo presión.'],
    off: ['OFF', '0–9990 ms', 'Pausa entre ciclos en modo repetición. No afecta la simulación.'],
    up: ['UP · rampa de subida', '0–WELD ms', 'Sube de UF a HEAT. Forma parte de WELD. UP + DOWN debe ser menor que WELD (E-10).'],
    weld: ['WELD · tiempo de soldadura', '0–999 ms', 'Tiempo con corriente de este pulso, incluye UP y DOWN. 000 = pulso apagado.'],
    down: ['DOWN · rampa de bajada', '0–WELD ms', 'Baja de HEAT a DL. Forma parte de WELD.'],
    uf: ['UF · inicio de rampa', 'kA', 'Corriente al inicio de UP. No puede ser mayor que HEAT (E-10).'],
    heat: ['HEAT · corriente', 'kA (en PWR/VLT: kA equivalentes)', 'Consigna de la meseta. La energía va con HEAT²: ±5% de HEAT ≈ ±10% de energía.'],
    dl: ['DL · fin de rampa', 'kA', 'Corriente al final de DOWN. No puede ser mayor que HEAT (E-10).'],
    ctrl: ['CTRL · modo de control', 'SCD / PWR / VLT', 'Clic o Enter para cambiar. SCD mantiene la corriente; PWR la potencia; VLT el voltaje entre electrodos.'],
    puls: ['PULSATION', '1–19', 'Repeticiones de este pulso (cada una con sus rampas).'],
    intv: ['INTERVAL', '0–999 ms', 'Pausa entre repeticiones. Con rampas y pulsación debe ser mayor que 0 (E-10).']
  };
  function fmt(k, v) {
    var f = F[k]; v = +v || 0;
    var s = v.toFixed(f[1]), ip = s.split('.')[0], pad = f[0] - ip.length;
    return (pad > 0 ? new Array(pad + 1).join('0') : '') + s;
  }
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
  function sync(state) { state.we.forEach(function (w) { w.on = w.weld > 0; }); }

  function create(box, state, onChange, opts) {
    opts = opts || {};
    state.sqd = state.sqd == null ? 300 : state.sqd; state.sqz = state.sqz == null ? 300 : state.sqz; state.off = state.off || 0;
    var scr = 1;
    function inp(k, i) {
      var f = F[k], w = f[0] + (f[1] ? f[1] + 1 : 0);
      return '<span class="lcf">[<input data-k="' + k + '"' + (i != null ? ' data-i="' + i + '"' : '') + ' size="' + w + '" style="width:' + w + 'ch" inputmode="decimal" autocomplete="off" spellcheck="false">]</span>';
    }
    function ctrl(i) { return '<span class="lcf">[<button type="button" data-ctrl="' + i + '"></button>]</span>'; }
    var s1 = '<div class="lcd-l">SCHEDULE #001' + (opts.title ? '<span class="lcd-r">' + opts.title + '</span>' : '') + '</div>' +
      '<div class="lcd-g g6"><span>SQD</span><span>SQZ</span><span>COOL1</span><span>COOL2</span><span>HOLD</span><span>OFF</span><i></i>' +
      inp('sqd') + inp('sqz') + inp('cool1') + inp('cool2') + inp('hold') + inp('off') + '<i>ms</i></div>' +
      '<div class="lcd-g g7"><i></i><span>UP</span><span>WELD</span><span>DOWN</span><span>UF</span><span>HEAT</span><span>DL</span><span>CTRL</span>' +
      [0, 1, 2].map(function (i) { return '<i class="wn" style="color:' + WE_COL[i] + '">' + (i + 1) + '</i>' + inp('up', i) + inp('weld', i) + inp('down', i) + inp('uf', i) + inp('heat', i) + inp('dl', i) + ctrl(i); }).join('') + '</div>' +
      '<div class="lcd-l lcd-dim">ms · ms · ms · kA · kA · kA · WELD 000 = apagado<span class="lcd-r lcd-next" data-scr="2">NEXT ▸</span></div>';
    var s2 = '<div class="lcd-l">SCHEDULE #001 (2)<span class="lcd-r lcd-next" data-scr="1">◂ BACK</span></div>' +
      '<div class="lcd-g g3"><i></i><span>PULSATION</span><span>INTERVAL</span><i></i>' +
      [0, 1, 2].map(function (i) { return '<i class="wn" style="color:' + WE_COL[i] + '">WELD' + (i + 1) + '</i>' + inp('puls', i) + inp('intv', i) + '<i>ms</i>'; }).join('') + '</div>' +
      '<div class="lcd-l lcd-dim">PULSE LIMIT, GAIN, CURRENT RANGE y TURN RATIO no cambian el calor en el modelo.</div>';
    box.innerHTML = '<div class="lcd lcd-edit"><div data-s="1">' + s1 + '</div><div data-s="2" hidden>' + s2 + '</div><div class="lcd-help">Selecciona un campo · ↑↓ ajustan · Shift ×10</div></div>' +
      '<svg class="chart" viewBox="0 0 420 130" data-prev style="margin-top:6px"></svg>' +
      '<div class="pu-info" style="font-size:12.5px;color:var(--ink-2)"></div>';
    var lcd = box.querySelector('.lcd'), help = box.querySelector('.lcd-help');
    function get(el) { var k = el.dataset.k, i = el.dataset.i; return i != null ? state.we[+i][k] : state[k]; }
    function set(el, v) {
      var k = el.dataset.k, i = el.dataset.i, f = F[k];
      var res = f[1] ? 0.01 : 1; v = Math.min(f[3], Math.max(f[2], Math.round(v / res) * res));
      v = +v.toFixed(f[1] || 0);
      if (i != null) state.we[+i][k] = v; else state[k] = v;
      sync(state);
    }
    function showHelp(k, i) {
      var h = HELP[k]; if (!h) return;
      help.innerHTML = '<b>' + h[0] + (i != null ? ' · WE' + (+i + 1) : '') + '</b> · ' + h[1] + ' — ' + h[2];
    }
    lcd.addEventListener('focusin', function (e) { var el = e.target; if (el.dataset.k) { showHelp(el.dataset.k, el.dataset.i); el.select && el.select(); } else if (el.dataset.ctrl != null) showHelp('ctrl', el.dataset.ctrl); });
    lcd.addEventListener('keydown', function (e) {
      var el = e.target; if (!el.dataset.k) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        var f = F[el.dataset.k]; set(el, (+get(el) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * f[4] * (e.shiftKey ? 10 : 1));
        el.value = fmt(el.dataset.k, get(el)); changed(el);
      } else if (e.key === 'Enter') { el.blur(); }
    });
    lcd.addEventListener('wheel', function (e) {
      var el = e.target; if (!el.dataset || !el.dataset.k || document.activeElement !== el) return;
      e.preventDefault(); var f = F[el.dataset.k]; set(el, (+get(el) || 0) + (e.deltaY < 0 ? 1 : -1) * f[4] * (e.shiftKey ? 10 : 1));
      el.value = fmt(el.dataset.k, get(el)); changed(el);
    }, { passive: false });
    lcd.addEventListener('change', function (e) {
      var el = e.target; if (!el.dataset.k) return;
      var v = parseFloat(String(el.value).replace(',', '.'));
      if (isFinite(v)) set(el, v);
      el.value = fmt(el.dataset.k, get(el)); changed(el);
    });
    lcd.addEventListener('click', function (e) {
      var c = e.target.closest('[data-ctrl]'), n = e.target.closest('[data-scr]');
      if (c) { var w = state.we[+c.dataset.ctrl], order = ['SCD', 'PWR', 'VLT']; w.ctrl = order[(order.indexOf(w.ctrl) + 1) % 3]; showHelp('ctrl', c.dataset.ctrl); render(); onChange && onChange(); }
      if (n) { scr = +n.dataset.scr; lcd.querySelector('[data-s="1"]').hidden = scr !== 1; lcd.querySelector('[data-s="2"]').hidden = scr !== 2; }
    });
    function changed() { render(true); onChange && onChange(); }
    function render(keepFocus) {
      sync(state);
      lcd.querySelectorAll('input[data-k]').forEach(function (el) {
        if (keepFocus && document.activeElement === el) return;
        el.value = fmt(el.dataset.k, get(el));
        var i = el.dataset.i;
        el.classList.toggle('off', i != null && !state.we[+i].on && el.dataset.k !== 'weld');
      });
      lcd.querySelectorAll('[data-ctrl]').forEach(function (b) { var w = state.we[+b.dataset.ctrl]; b.textContent = w.ctrl; b.classList.toggle('off', !w.on); });
      var sm = sample(state, 1), ser = [{ x: sm.xs, y: sm.all, color: '#8a939e', width: 1.2 }];
      for (var i = 0; i < 3; i++) ser.push({ x: sm.xs, y: sm.ys[i], color: WE_COL[i], width: 2.2 });
      var hold = state.hold || 0;
      C.line(box.querySelector('[data-prev]'), { series: ser, xMin: 0, xMax: Math.max(50, sm.xs[sm.xs.length - 1]), yMin: 0, yMax: Math.max(2, Math.max.apply(null, state.we.map(function (x) { return x.on ? Math.max(x.heat, x.uf, x.dl) : 0; })) * 1.12), xLabel: 'ms', yLabel: 'kA',
        bands: hold > 0 ? [{ x0: sm.wf.tWeldEnd * 1e3, x1: sm.wf.total * 1e3, color: '#888', opacity: 0.08 }] : [] });
      var en = S.energyOf(state), errs = S.checkProgram(state);
      var txt = 'I²t ' + en.per.map(function (e, i) { return state.we[i].on ? '<span style="color:' + WE_COL[i] + '">WE' + (i + 1) + ' ' + e.toFixed(2) + '</span>' : ''; }).filter(Boolean).join(' · ') + ' · <b>total ' + en.total.toFixed(2) + ' kA²·s</b> · corriente hasta ' + Math.round(sm.wf.tWeldEnd * 1e3) + ' ms';
      if (errs.length) txt += '<div style="color:var(--bad);margin-top:3px"><b>E-10:</b> ' + errs.join('; ') + '</div>';
      box.querySelector('.pu-info').innerHTML = txt;
    }
    render();
    return { render: function () { render(true); }, select: function () {} };
  }

  function defaultProgram() {
    return { we: [S.pulseOf({ on: true, ctrl: 'SCD', uf: 3.15, heat: 4.0, dl: 2.6, up: 240, weld: 450, down: 40 }), S.pulseOf({}), S.pulseOf({})], cool1: 0, cool2: 0, hold: 250, sqd: 300, sqz: 300, off: 0 };
  }
  function clone(pr) { return { we: pr.we.map(function (w) { return Object.assign({}, w); }), cool1: pr.cool1 || 0, cool2: pr.cool2 || 0, hold: pr.hold, sqd: pr.sqd, sqz: pr.sqz, off: pr.off }; }
  function describe(pr) {
    var parts = [];
    pr.we.forEach(function (w, i) {
      if (!(w.weld > 0) || w.on === false) return;
      parts.push('WE' + (i + 1) + ' ' + w.ctrl + ' ' + (+w.heat).toFixed(2) + ' kA × ' + w.weld + ' ms' + (w.puls > 1 ? ' ×' + w.puls : ''));
    });
    return parts.join(' + ');
  }
  function equalize(pr, target, wi) {
    var en = S.energyOf(pr), other = en.total - en.per[wi];
    if (en.per[wi] <= 0 || target <= other) return pr;
    var f = Math.sqrt((target - other) / en.per[wi]), w = pr.we[wi];
    w.uf *= f; w.heat *= f; w.dl *= f;
    return pr;
  }
  window.PulseUI = { create: create, defaultProgram: defaultProgram, clone: clone, describe: describe, equalize: equalize, sample: sample, WE_COL: WE_COL };
})();
