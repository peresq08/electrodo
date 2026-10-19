/* Corre el simulador fuera del hilo principal para no congelar la página. */
importScripts('sim-core.js');
self.onmessage = function (e) {
  var p = Object.assign({}, self.FusingSim.DEFAULTS, e.data.params);
  try {
    var r = self.FusingSim.run(p, function (f) { self.postMessage({ type: 'progress', value: f }); });
    r.verdict = self.FusingSim.verdict(r.summary);
    r.params = p;
    self.postMessage({ type: 'done', id: e.data.id, result: r });
  } catch (err) {
    self.postMessage({ type: 'error', id: e.data.id, message: String(err && err.message || err) });
  }
};
