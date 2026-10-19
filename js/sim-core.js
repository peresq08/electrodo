/*
 * Modelo electro-térmico 2D de una unión de fusing (corte transversal del gancho).
 * Diferencias finitas: potencial eléctrico ∇·(σ∇φ)=0 por SOR y calor explícito
 * ρc·∂T/∂t = ∇·(k∇T) + q, con q = σ|∇φ|². Modelo educativo, no calibrado.
 *
 * Plano: x a lo largo del gancho, y vertical. Profundidad (eje del alambre) = ancho del gancho.
 */
(function (root) {
  'use strict';

  var MAT = { AIR: 0, W_EL: 1, CU_TERM: 2, CU_WIRE: 3, ENAMEL: 4, GROUND: 5, CLOSE: 6, C_EL: 7, C_GND: 8, W_TIP: 9 };
  var MAT_NAMES = ['Aire', 'Electrodo (W)', 'Terminal (Cu)', 'Alambre (Cu)', 'Esmalte', 'Barra de tierra', 'Zona de cierre', 'Contacto electrodo', 'Contacto tierra', 'Punta del electrodo (W)'];

  function rhoCu(T) { return 1.72e-8 * (1 + 0.0039 * (T - 20)); }
  function rhoW(T) { return 5.6e-8 * (1 + 0.0045 * (T - 20)); }

  function buildGeometry(p) {
    var dx = p.dx;                         // m
    var NX = Math.round(p.domainW / dx), NY = Math.round(p.domainH / dx);
    var mat = new Uint8Array(NX * NY);
    var mm = 1e-3;
    function fill(x0, x1, y0, y1, m) {
      for (var j = Math.max(0, Math.floor(y0 / dx + 1e-9)); j < Math.min(NY, Math.ceil(y1 / dx - 1e-9)); j++)
        for (var i = Math.max(0, Math.floor(x0 / dx + 1e-9)); i < Math.min(NX, Math.ceil(x1 / dx - 1e-9)); i++)
          mat[j * NX + i] = m;
    }
    var t = p.thick * mm, rc = p.wireCore * mm, ro = (p.wireCore + p.enamel) * mm, pitch = 2 * ro;
    var xL = 1.0 * mm;                       // borde izquierdo de la pared del doblez
    var yG0 = 0, yG1 = 1.0 * mm;             // barra de tierra
    var yB0 = yG1, yB1 = yB0 + t;            // cuerpo de la terminal
    var xW0 = xL + t;                        // inicio de la fila de alambres
    var yWc = yB1 + ro;                      // centro de los alambres
    var yT0 = yB1 + pitch, yT1 = yT0 + t;    // gancho (tang)
    var xW1 = xW0 + p.nWires * pitch;        // fin de la fila de alambres
    var free = Math.max(0, p.hookLen * mm - p.innerR * mm - p.nWires * p.wireDiam * mm);
    var closeW = Math.min(2.2 * mm, Math.max(0.5 * mm, free * p.closeFrac));
    var xC0 = xW1 + 0.25 * mm, xC1 = xC0 + closeW;
    var xT1 = xC1;                           // el gancho termina donde termina el cierre
    // barra de tierra
    fill(xL - 0.5 * mm, Math.max(xT1 + 0.6 * mm, xL + 6 * mm), yG0, yG1, MAT.GROUND);
    // cuerpo
    fill(xL, xT1 + 0.4 * mm, yB0, yB1, MAT.CU_TERM);
    // pared del doblez
    fill(xL, xL + t, yB0, yT1, MAT.CU_TERM);
    // gancho
    fill(xL, xT1, yT0, yT1, MAT.CU_TERM);
    // punta del gancho bajando hacia el cuerpo (zona de cierre)
    fill(xC0, xC1, yB1 + dx, yT0, MAT.CU_TERM);
    fill(xC0, xC1, yB1, yB1 + dx, MAT.CLOSE);
    // alambres con esmalte
    for (var w = 0; w < p.nWires; w++) {
      var xc = xW0 + ro + w * pitch;
      for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
        var x = (i + 0.5) * dx, y = (j + 0.5) * dx, d = Math.hypot(x - xc, y - yWc);
        if (d <= rc) mat[j * NX + i] = MAT.CU_WIRE;
        else if (d <= ro + 0.5 * dx && mat[j * NX + i] === MAT.AIR) mat[j * NX + i] = MAT.ENAMEL;
      }
    }
    // electrodo: cara centrada sobre los alambres, ancho = faceW
    var xEc = (xW0 + xT1) / 2, half = p.faceW * mm / 2;
    var xE0 = Math.max(0, xEc - half), xE1 = Math.min(p.domainW, xEc + half);
    fill(xE0, xE1, yT1, yT1 + dx, MAT.C_EL);
    fill(xE0, xE1, yT1 + dx, p.domainH, MAT.W_EL);
    fill(xE0, xE1, yT1 + dx, yT1 + dx + p.tipLen * mm, MAT.W_TIP);
    // contacto con la barra de tierra
    for (var i2 = 0; i2 < NX; i2++) {
      var jg = Math.round(yG1 / dx) - 1;
      if (mat[jg * NX + i2] === MAT.GROUND && mat[(jg + 1) * NX + i2] === MAT.CU_TERM) mat[jg * NX + i2] = MAT.C_GND;
    }
    return {
      NX: NX, NY: NY, dx: dx, mat: mat,
      info: { xW0: xW0, xW1: xW1, yWc: yWc, ro: ro, xC0: xC0, xC1: xC1, yB1: yB1, yT0: yT0, yT1: yT1, xE0: xE0, xE1: xE1, free: free, closeW: closeW }
    };
  }

  // Forma de onda: devuelve el valor de consigna (kA equivalentes) en t (s)
  function makeWaveform(p) {
    var segs = [];
    var t = 0;
    if (p.pre) { segs.push({ t0: 0, t1: p.preT / 1e3, f: function () { return p.preI; } }); t = (p.preT + p.cool) / 1e3; }
    var up = p.up / 1e3, w = p.weld / 1e3, dn = p.down / 1e3, t0 = t;
    segs.push({ t0: t0, t1: t0 + w, f: function (tt) {
      var s = tt - t0;
      if (s < up) return p.uf + (p.heat - p.uf) * (s / up);
      if (s > w - dn) return p.heat + (p.dl - p.heat) * ((s - (w - dn)) / dn);
      return p.heat;
    } });
    var tEnd = t0 + w;
    return { tWeldEnd: tEnd, total: tEnd + p.hold / 1e3, at: function (tt) {
      for (var k = 0; k < segs.length; k++) if (tt >= segs[k].t0 && tt < segs[k].t1) return segs[k].f(tt);
      return 0;
    } };
  }

  function run(p, onProgress) {
    var G = buildGeometry(p), NX = G.NX, NY = G.NY, N = NX * NY, dx = G.dx, mat = G.mat;
    var depth = p.hookW * 1e-3;
    var T = new Float64Array(N), phi = new Float64Array(N), sig = new Float64Array(N), k = new Float64Array(N), rc = new Float64Array(N), q = new Float64Array(N);
    var burn = new Float64Array(N), bond = new Float64Array(N);
    var i, j, n;
    for (n = 0; n < N; n++) {
      var m = mat[n];
      T[n] = (m === MAT.W_EL || m === MAT.W_TIP || m === MAT.C_EL) ? p.Tel0 : p.T0;
    }
    var TBURN = p.Tburn, TBOND = p.Tbond, RREF = 0.217e-3, REXT = p.Rext * 1e-3, TMELT = 1083, LCU = 1.84e9;
    var melt = new Float64Array(N);
    // Electrodo en la dirección de la profundidad (ancho del gancho): factores de área.
    // Cavidad de desgaste c: si la cara es más ancha que el gancho, el electrodo abraza los flancos (más área);
    // en control de posición la fuerza cae con c (el resorte se descomprime).
    var hw = p.hookW, cav = p.wear, fd = p.faceDepth;
    var contactW = fd > hw ? Math.min(fd, hw + 2 * cav) : fd;
    var AfC = contactW / hw;
    var Frel = Math.max(0.25, 1 - p.forceLoss * cav);
    var fElecEff = p.fElec / Math.sqrt(Frel); // Holm: R de contacto ~ 1/√F
    var geomOut = { contactW: contactW, AfC: AfC, Frel: Frel, pressRel: Frel / AfC };
    function props() {
      for (var nn = 0; nn < N; nn++) {
        var m = mat[nn], t = T[nn];
        switch (m) {
          case MAT.AIR: sig[nn] = 0; k[nn] = 0; rc[nn] = 1; break;
          case MAT.W_EL: sig[nn] = 1 / rhoW(t); k[nn] = 150; rc[nn] = 2.59e6; break;
          case MAT.W_TIP: sig[nn] = AfC / rhoW(t); k[nn] = 150 * AfC; rc[nn] = 2.59e6 * AfC; break;
          case MAT.GROUND: if (p.gndCu) { sig[nn] = 1 / rhoCu(t); k[nn] = 390; rc[nn] = 3.45e6; } else { sig[nn] = 1 / rhoW(t); k[nn] = 150; rc[nn] = 2.59e6; } break;
          case MAT.CU_TERM: case MAT.CU_WIRE: sig[nn] = 1 / rhoCu(t); k[nn] = 390; rc[nn] = 3.45e6; break;
          case MAT.ENAMEL: {
            var b = burn[nn];
            var lr = Math.log(1e2) * (1 - b) + Math.log(rhoCu(t) * p.fEnamel) * b; // de aislante a contacto
            sig[nn] = 1 / Math.exp(lr);
            k[nn] = 0.6 + (390 - 0.6) * b * (0.3 + 0.7 * bond[nn]);
            rc[nn] = 2.0e6 * (1 - b) + 3.45e6 * b; break;
          }
          case MAT.CLOSE: {
            var f = p.fClose + (1 - p.fClose) * bond[nn];
            sig[nn] = 1 / (rhoCu(t) * f); k[nn] = 120 + 270 * bond[nn]; rc[nn] = 3.45e6; break;
          }
          case MAT.C_EL: sig[nn] = AfC / (rhoW(t) * fElecEff); k[nn] = 100 * AfC; rc[nn] = 2.59e6 * AfC; break;
          case MAT.C_GND: sig[nn] = 1 / (rhoW(t) * p.fElec); k[nn] = 100; rc[nn] = 2.59e6; break;
        }
      }
    }
    function hmean(a, b) { return (a > 0 && b > 0) ? 2 * a * b / (a + b) : 0; }
    // Potencial: fila superior del electrodo = 1, fila inferior de la barra = 0
    var fixed = new Uint8Array(N), fixedV = new Float64Array(N);
    for (i = 0; i < NX; i++) {
      var top = (NY - 1) * NX + i;
      if (mat[top] === MAT.W_EL || mat[top] === MAT.W_TIP) { fixed[top] = 1; fixedV[top] = 1; }
      if (mat[i] === MAT.GROUND) { fixed[i] = 1; fixedV[i] = 0; }
    }
    for (n = 0; n < N; n++) { if (fixed[n]) phi[n] = fixedV[n]; else phi[n] = (Math.floor(n / NX)) / NY; }
    function solvePhi(iters) {
      var w = 1.85;
      for (var it = 0; it < iters; it++) {
        for (var jj = 0; jj < NY; jj++) for (var ii = 0; ii < NX; ii++) {
          var nn = jj * NX + ii; if (fixed[nn] || sig[nn] === 0) continue;
          var s = sig[nn], sum = 0, den = 0, g;
          if (ii > 0) { g = hmean(s, sig[nn - 1]); sum += g * phi[nn - 1]; den += g; }
          if (ii < NX - 1) { g = hmean(s, sig[nn + 1]); sum += g * phi[nn + 1]; den += g; }
          if (jj > 0) { g = hmean(s, sig[nn - NX]); sum += g * phi[nn - NX]; den += g; }
          if (jj < NY - 1) { g = hmean(s, sig[nn + NX]); sum += g * phi[nn + NX]; den += g; }
          if (den > 0) phi[nn] += w * (sum / den - phi[nn]);
        }
      }
      // conductancia: corriente que entra a la barra por la fila 1 hacia la fila 0
      var Itot = 0;
      for (var i3 = 0; i3 < NX; i3++) { var a = NX + i3, b = i3; if (sig[a] > 0 && sig[b] > 0) Itot += hmean(sig[a], sig[b]) * depth * (phi[a] - phi[b]); }
      return Itot; // A por 1 V
    }
    function heatGen(scaleV) {
      // q por celda = suma de potencia en caras / volumen de celda
      var vol = dx * dx * depth;
      for (var nn = 0; nn < N; nn++) q[nn] = 0;
      for (var jj = 0; jj < NY; jj++) for (var ii = 0; ii < NX; ii++) {
        var nn2 = jj * NX + ii; if (sig[nn2] === 0) continue;
        if (ii < NX - 1 && sig[nn2 + 1] > 0) { var g = hmean(sig[nn2], sig[nn2 + 1]) * depth, dv = (phi[nn2] - phi[nn2 + 1]) * scaleV, P = g * dv * dv; q[nn2] += P / 2 / vol; q[nn2 + 1] += P / 2 / vol; }
        if (jj < NY - 1 && sig[nn2 + NX] > 0) { var g2 = hmean(sig[nn2], sig[nn2 + NX]) * depth, dv2 = (phi[nn2] - phi[nn2 + NX]) * scaleV, P2 = g2 * dv2 * dv2; q[nn2] += P2 / 2 / vol; q[nn2 + NX] += P2 / 2 / vol; }
      }
    }

    var wf = makeWaveform(p);
    var dt = p.dt, steps = Math.ceil(wf.total / dt), eEvery = Math.max(1, Math.round(p.elecEvery / dt));
    var fEvery = Math.max(1, Math.round(p.frameEvery / dt)), sEvery = Math.max(1, Math.round(0.001 / dt));
    var frames = [], series = [];
    var Tn = new Float64Array(N);
    var Rdom = 1, I = 0, V = 0, Pw = 0, Eel = 0, Edom = 0;
    var cellsEnamel = 0, cellsClose = 0, cellsJoint = 0;
    for (n = 0; n < N; n++) { if (mat[n] === MAT.ENAMEL) cellsEnamel++; if (mat[n] === MAT.CLOSE) cellsClose++; if (mat[n] === MAT.CU_TERM || mat[n] === MAT.CU_WIRE || mat[n] === MAT.ENAMEL || mat[n] === MAT.CLOSE) cellsJoint++; }
    // sondas
    var inf = G.info;
    function cellAt(xm, ym) { return Math.min(NY - 1, Math.max(0, Math.floor(ym / dx))) * NX + Math.min(NX - 1, Math.max(0, Math.floor(xm / dx))); }
    var midW = Math.floor(p.nWires / 2);
    var probes = {
      wire: cellAt(inf.xW0 + inf.ro + midW * 2 * inf.ro, inf.yWc),
      tang: cellAt(inf.xW0 + inf.ro + midW * 2 * inf.ro, inf.yT0 + 0.5 * dx),
      close: cellAt((inf.xC0 + inf.xC1) / 2, inf.yB1 + 0.5 * dx),
      elec: cellAt((inf.xE0 + inf.xE1) / 2, inf.yT1 + 1.5 * dx)
    };
    var Tmax = 0, TelMax = 0, G3 = 2 / (depth * p.zLoss * 1e-3);
    var pk = { Tw: 0, Tt: 0, Tc: 0, Te: 0 }, cellsCu = 0, EjEnd = 0, tBurn = null, tBondC = null;
    props();
    var I1V = solvePhi(400);
    RREF = p.Rref * 1e-3; // PWR/VLT: con R medida = Rref entregan la misma corriente que SCD
    var vol = dx * dx * depth;
    for (var s = 0; s <= steps; s++) {
      var t = s * dt;
      var set = wf.at(t);
      if (s % eEvery === 0) { props(); I1V = solvePhi(set > 0 ? 25 : 0) || I1V; }
      Rdom = I1V > 0 ? 1 / I1V : 1e9;
      var Rtot = Rdom + REXT;
      if (set > 0) {
        if (p.mode === 'PWR') { var Pset = Math.pow(set * 1e3, 2) * RREF; I = Math.sqrt(Pset / Rtot); }
        else if (p.mode === 'VLT') { var Vset = set * 1e3 * RREF; I = Vset / Rtot; }
        else I = set * 1e3;
        I = Math.min(I, p.Imax * 1e3, p.Vmax / Rtot);
      } else I = 0;
      V = I * Rtot; Pw = I * I * Rtot;
      var Vdom = I * Rdom;
      if (s % eEvery === 0) heatGen(Vdom);
      if (I === 0) { for (n = 0; n < N; n++) q[n] = 0; }
      else if (s % eEvery !== 0) { /* q reescalado implícito: se mantiene del último cálculo, escalado por corriente */ }
      Eel += Pw * dt; Edom += I * I * Rdom * dt;
      // calor explícito
      for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
        n = j * NX + i; if (mat[n] === MAT.AIR) { Tn[n] = T[n]; continue; }
        var kn = k[n], flux = 0, g;
        if (i > 0 && k[n - 1] > 0) { g = hmean(kn, k[n - 1]); flux += g * (T[n - 1] - T[n]); }
        if (i < NX - 1 && k[n + 1] > 0) { g = hmean(kn, k[n + 1]); flux += g * (T[n + 1] - T[n]); }
        if (j > 0 && k[n - NX] > 0) { g = hmean(kn, k[n - NX]); flux += g * (T[n - NX] - T[n]); }
        else if (j === 0) { flux += kn * (p.Twater - T[n]) * 2; }
        if (j < NY - 1 && k[n + NX] > 0) { g = hmean(kn, k[n + NX]); flux += g * (T[n + NX] - T[n]); }
        else if (j === NY - 1) { flux += kn * (p.Twater - T[n]) * 2; }
        Tn[n] = T[n] + dt * (flux / (dx * dx) + q[n] - G3 * kn * (T[n] - p.T0)) / rc[n];
      }
      var tmp = T; T = Tn; Tn = tmp;
      // esmalte, uniones y fusión del cobre (calor latente)
      for (n = 0; n < N; n++) {
        var mm2 = mat[n];
        if ((mm2 === MAT.CU_TERM || mm2 === MAT.CU_WIRE || mm2 === MAT.CLOSE) && T[n] > TMELT && melt[n] < 1) { var ex = rc[n] * (T[n] - TMELT); var dm = Math.min(1 - melt[n], ex / LCU); melt[n] += dm; T[n] -= dm * LCU / rc[n]; }
        if (mm2 === MAT.ENAMEL && T[n] > TBURN && burn[n] < 1) burn[n] = Math.min(1, burn[n] + dt / p.burnTime * Math.min(3, (T[n] - TBURN) / 100 + 0.3));
        if ((mm2 === MAT.CLOSE || (mm2 === MAT.ENAMEL && burn[n] >= 1)) && T[n] > TBOND && bond[n] < 1) bond[n] = Math.min(1, bond[n] + dt / p.bondTime * Math.min(3, (T[n] - TBOND) / 100 + 0.3));
        if (T[n] > Tmax && mat[n] !== MAT.W_EL && mat[n] !== MAT.W_TIP && mat[n] !== MAT.C_EL && mat[n] !== MAT.GROUND && mat[n] !== MAT.C_GND) Tmax = T[n];
        if ((mm2 === MAT.C_EL) && T[n] > TelMax) TelMax = T[n];
      }
      if (T[probes.wire] > pk.Tw) pk.Tw = T[probes.wire]; if (T[probes.tang] > pk.Tt) pk.Tt = T[probes.tang];
      if (T[probes.close] > pk.Tc) pk.Tc = T[probes.close]; if (T[probes.elec] > pk.Te) pk.Te = T[probes.elec];
      if (s === Math.round(wf.tWeldEnd / dt)) { for (var n4 = 0; n4 < N; n4++) { var m4 = mat[n4]; if (m4 === MAT.CU_TERM || m4 === MAT.CU_WIRE || m4 === MAT.ENAMEL || m4 === MAT.CLOSE) EjEnd += rc[n4] * (T[n4] - p.T0) * vol; } }
      if (s % sEvery === 0) {
        var bE = 0, bdE = 0, bdC = 0, mC = 0;
        for (n = 0; n < N; n++) { if (mat[n] === MAT.ENAMEL) { bE += burn[n]; bdE += bond[n]; } if (mat[n] === MAT.CLOSE) bdC += bond[n]; if (melt[n] > 0.5) mC++; }
        series.push({ t: t * 1e3, set: set, I: I / 1e3, V: V, pulse: Math.min(100, V / p.Vmax * 100), P: Pw / 1e3, R: Rtot * 1e3,
          Tw: T[probes.wire], Tt: T[probes.tang], Tc: T[probes.close], Te: T[probes.elec],
          burn: cellsEnamel ? bE / cellsEnamel : 0, bondW: cellsEnamel ? bdE / cellsEnamel : 0, bondC: cellsClose ? bdC / cellsClose : 0, melt: mC * dx * dx * 1e6 });
        var ls = series[series.length - 1];
        if (tBurn === null && ls.burn >= 0.95) tBurn = ls.t; if (tBondC === null && ls.bondC >= 0.95) tBondC = ls.t;
      }
      if (s % fEvery === 0 || s === steps) frames.push({ t: t * 1e3, I: I / 1e3, T: Float32Array.from(T), burn: Float32Array.from(burn), bond: Float32Array.from(bond), melt: Float32Array.from(melt) });
      if (onProgress && s % 2000 === 0) onProgress(s / steps);
    }
    // energía en el cobre de la unión
    var Ejoint = 0;
    for (n = 0; n < N; n++) { var m3 = mat[n]; if (m3 === MAT.CU_TERM || m3 === MAT.CU_WIRE || m3 === MAT.ENAMEL || m3 === MAT.CLOSE) Ejoint += rc[n] * (T[n] - p.T0) * vol; }
    var last = series[series.length - 1];
    return {
      NX: NX, NY: NY, dx: dx, mat: Array.from(mat), info: G.info, frames: frames, series: series,
      summary: {
        Eel: Eel, Edom: Edom, Ejoint: EjEnd, peaks: pk, tBurn: tBurn, tBondC: tBondC, tWeldEnd: wf.tWeldEnd * 1e3, Tmax: Tmax, TelMax: TelMax,
        geom: geomOut, burn: last.burn, bondW: last.bondW, bondC: last.bondC, melt: last.melt, Rref: RREF * 1e3,
        free: G.info.free * 1e3, closeW: G.info.closeW * 1e3
      }
    };
  }

  var DEFAULTS = {
    dx: 0.125e-3, domainW: 10.5e-3, domainH: 8e-3, dt: 2.5e-5, elecEvery: 0.001, frameEvery: 0.01,
    nWires: 3, wireDiam: 1.15, wireCore: 0.55, enamel: 0.075, thick: 1.0, hookW: 2.0, hookLen: 8.5, innerR: 0.65, closeFrac: 0.35,
    faceW: 4.5, T0: 25, Tel0: 150, Twater: 30, Tburn: 480, Tbond: 700, burnTime: 0.025, bondTime: 0.04,
    fEnamel: 8, fClose: 25, fElec: 2.5, Rext: 0.16, Rref: 0.28, Imax: 9.9, Vmax: 2.83, wear: 0, faceDepth: 3.0, tipLen: 0.75, forceLoss: 0.8, zLoss: 25, gndCu: false,
    mode: 'SCD', pre: false, preT: 150, preI: 2.8, cool: 30, up: 240, weld: 450, down: 40, uf: 3.15, heat: 4.0, dl: 2.6, hold: 300
  };

  // Veredicto de la unión a partir del resumen
  function verdict(sm) {
    if (sm.melt > 1.0) return { code: 'QUEMADA', cls: 'bad', text: 'Cobre fundido (' + sm.melt.toFixed(1) + ' mm² en el corte): quemada / expulsión.' };
    if (sm.burn < 0.9) return { code: 'FRÍA', cls: 'bad', text: 'El esmalte no se removió por completo (' + Math.round(sm.burn * 100) + '%). Unión fría: abre con poca fuerza y R alta.' };
    if (sm.bondC < 0.5 || sm.bondW < 0.5) return { code: 'DÉBIL', cls: 'warn', text: 'Esmalte removido pero unión incompleta (alambres ' + Math.round(sm.bondW * 100) + '%, cierre ' + Math.round(sm.bondC * 100) + '%). Pasa resistencia, pero puede abrir en jalón o con vibración.' };
    if (sm.melt > 0.3) return { code: 'OK (caliente)', cls: 'warn', text: 'Unión completa con fusión superficial bajo el electrodo: poco margen hacia quemado y más desgaste.' };
    return { code: 'OK', cls: 'ok', text: 'Esmalte removido, alambres y cierre unidos, sin cobre fundido.' };
  }

  var api = { verdict: verdict, run: run, buildGeometry: buildGeometry, makeWaveform: makeWaveform, MAT: MAT, MAT_NAMES: MAT_NAMES, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FusingSim = api;
})(typeof self !== 'undefined' ? self : this);
