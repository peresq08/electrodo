/* Estrategias de varios pulsos a igual energía (I²t de la consigna). Se usa en el navegador y en Node. */
(function (root) {
  'use strict';
  var S = root.FusingSim || (typeof require !== 'undefined' ? require('./sim-core.js') : null);
  function pw(o) { return S.pulseOf(Object.assign({ on: true, ctrl: 'SCD', puls: 1, intv: 0 }, o)); }
  function prog(a, b, c, c1, c2, hold) { return { we: [a ? pw(a) : S.pulseOf({}), b ? pw(b) : S.pulseOf({}), c ? pw(c) : S.pulseOf({})], cool1: c1 || 0, cool2: c2 || 0, hold: hold == null ? 250 : hold }; }
  function equalize(pr, target, wi) {
    var en = S.energyOf(pr), other = en.total - en.per[wi];
    if (en.per[wi] <= 0 || target <= other) return pr;
    var f = Math.sqrt((target - other) / en.per[wi]), w = pr.we[wi];
    w.uf = +(w.uf * f).toFixed(3); w.heat = +(w.heat * f).toFixed(3); w.dl = +(w.dl * f).toFixed(3);
    return pr;
  }
  var COLORS = ['#c4652e', '#2c7fb8', '#3a9a5b', '#7b52b3', '#d4a017', '#6b7a8c'];
  // base: { uf, heat, dl, up, weld, down }
  function build(base) {
    var H = base.heat, E = S.energyOf(prog(base)).total, out = [];
    out.push({ key: 'uno', name: 'Un pulso con rampa', why: 'Referencia. Una sola subida: el esmalte sale durante UP y la unión se forma en la meseta.', g: prog(base) });
    out.push({ key: 'pre', name: 'Precalentamiento + principal', why: 'WE1 suave calienta y ablanda el esmalte; COOL1 deja que la temperatura se iguale; WE2 une. Separa "sacar esmalte" de "unir".',
      g: equalize(prog({ uf: 0.7 * H, heat: 0.7 * H, dl: 0.7 * H, weld: 150 }, Object.assign({}, base), null, 30), E, 1) });
    out.push({ key: 'post', name: 'Principal + post-calentamiento', why: 'WE2 baja mantiene la unión en temperatura de forja mientras la fuerza cierra el gancho, en lugar de enfriar de golpe.',
      g: equalize(prog(Object.assign({}, base), { uf: 0.6 * H, heat: 0.6 * H, dl: 0.6 * H, weld: 150 }, null, 10), E, 0) });
    out.push({ key: 'puls', name: 'Pulsación 3×', why: 'La misma energía en 3 golpes con INTERVAL: la punta descarga calor entre golpes y no llega tan caliente.',
      g: equalize(prog({ uf: H, heat: H, dl: H, weld: Math.round(base.weld / 3 / 5) * 5, puls: 3, intv: 30 }), E, 0) });
    out.push({ key: 'vlt', name: 'VLT para esmalte + SCD', why: 'Voltaje constante en WE1: con el esmalte la R es alta y la corriente se limita sola; cuando el esmalte sale, la corriente sube. Luego SCD une.',
      g: equalize(prog({ ctrl: 'VLT', uf: H, heat: H, dl: H, weld: 120 }, { uf: 0.9 * H, heat: H, dl: base.dl, up: 100, weld: Math.max(200, base.weld - 120), down: base.down }, null, 5), E, 1) });
    out.push({ key: 'extra', name: '+ dos pulsos de 0.5 kA', why: 'El pulso principal más dos pulsos de 100 ms a 0.5 kA. Muestra cuánto aportan pulsos de baja corriente.',
      g: prog(Object.assign({}, base), { uf: 0.5, heat: 0.5, dl: 0.5, weld: 100 }, { uf: 0.5, heat: 0.5, dl: 0.5, weld: 100 }, 20, 20) });
    out.forEach(function (o, i) { o.color = COLORS[i]; o.E = S.energyOf(o.g).total; });
    return out;
  }
  var api = { build: build, equalize: equalize, prog: prog, COLORS: COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Strategies = api;
})(typeof self !== 'undefined' ? self : this);
