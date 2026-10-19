/* Calibración del modelo con resultados del DOE: factor de corriente por número de alambres.
 * Se guarda solo en el navegador de quien la usa (localStorage). */
(function () {
  'use strict';
  var KEY = 'electrodo-calib-v2', st = { on: true, f: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) st = Object.assign(st, JSON.parse(raw)); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} window.dispatchEvent(new Event('calibchange')); }
  window.Calib = {
    get: function (nW) { return st.on && st.f[nW] ? st.f[nW].c : 1; },
    info: function (nW) { return st.f[nW] || null; },
    set: function (nW, c, meta) { st.f[nW] = Object.assign({ c: c }, meta || {}); save(); },
    clear: function () { st.f = {}; save(); },
    remove: function (nW) { delete st.f[nW]; save(); },
    enabled: function () { return st.on; },
    setEnabled: function (v) { st.on = !!v; save(); },
    any: function () { return Object.keys(st.f).length > 0; }
  };
})();
