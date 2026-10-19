/*
 * Modelo electro-térmico 2D de una unión de fusing (corte transversal del gancho).
 * Diferencias finitas: potencial eléctrico ∇·(σ∇φ)=0 por SOR y calor explícito
 * ρc·∂T/∂t = ∇·(k∇T) + q, con q = σ|∇φ|². Modelo educativo, no calibrado.
 *
 * Plano: x a lo largo del gancho, y vertical. Profundidad (eje del alambre) = ancho del gancho.
 * Programa de pulsos como el controlador: WE1, COOL1, WE2, COOL2, WE3, HOLD.
 * Cada WE tiene CTRL (SCD/PWR/VLT), UF/HEAT/DL, UP/WELD/DOWN y PULSATION/INTERVAL.
 */
(function (root) {
  'use strict';

  var MAT = { AIR: 0, W_EL: 1, CU_TERM: 2, CU_WIRE: 3, ENAMEL: 4, GROUND: 5, CLOSE: 6, C_EL: 7, C_GND: 8, W_TIP: 9, TIPC: 10 };
  var MAT_NAMES = ['Aire', 'Electrodo (W)', 'Terminal (Cu)', 'Alambre (Cu)', 'Esmalte', 'Barra de tierra', 'Zona de cierre', 'Contacto electrodo', 'Contacto tierra', 'Punta del electrodo (W)', 'Punta del gancho apoyada'];

  function rhoCu(T) { return 1.72e-8 * (1 + 0.0039 * (T - 20)); }
  function rhoW(T) { return 5.6e-8 * (1 + 0.0045 * (T - 20)); }

  function buildGeometry(p) {
    var dx = p.dx, mm = 1e-3;
    // El gancho es una tira de espesor t: pasa sobre los alambres, baja inclinada (closeAngle) y su punta
    // se apoya sobre el cuerpo. El largo libre después del último alambre se conserva (largo desarrollado).
    var t = p.thick * mm, rc = p.wireCore * mm, ro = (p.wireCore + p.enamel) * mm, pitch = 2 * ro;
    var th = (p.closeAngle || 60) * Math.PI / 180;
    var free = Math.max(0, p.hookLen * mm - p.innerR * mm - p.nWires * p.wireDiam * mm);
    var xL = 1.0 * mm, yG0 = 0, yG1 = 1.0 * mm, yB0 = yG1, yB1 = yB0 + t;
    var xW0 = xL + t, yWc = yB1 + ro, yT0 = yB1 + pitch, yT1 = yT0 + t, xW1 = xW0 + p.nWires * pitch;
    var gap = yT0 - yB1, xS = xW1;
    var slopeLen = gap / Math.sin(th), reaches = free >= slopeLen;
    var run = reaches ? gap / Math.tan(th) : free * Math.cos(th);
    var flat = reaches ? free - slopeLen : 0;
    var xF0 = xS + run, xF1 = xF0 + flat, xT1 = Math.max(xF1, xF0 + t * Math.sin(th));
    var closeLen = Math.min(flat, (p.closeLen || 1.0) * mm);
    var needW = xT1 + 1.6 * mm, needH = yT1 + 3.75 * mm;
    var NX = Math.round(Math.max(p.domainW, needW) / dx), NY = Math.round(Math.max(p.domainH, needH) / dx);
    var domW = NX * dx, domH = NY * dx;
    var mat = new Uint8Array(NX * NY);
    function fill(x0, x1, y0, y1, m) {
      for (var j = Math.max(0, Math.floor(y0 / dx + 1e-9)); j < Math.min(NY, Math.ceil(y1 / dx - 1e-9)); j++)
        for (var i = Math.max(0, Math.floor(x0 / dx + 1e-9)); i < Math.min(NX, Math.ceil(x1 / dx - 1e-9)); i++)
          mat[j * NX + i] = m;
    }
    fill(xL - 0.5 * mm, Math.max(xT1 + 0.6 * mm, xL + 6 * mm), yG0, yG1, MAT.GROUND);   // barra
    fill(xL, xT1 + 0.4 * mm, yB0, yB1, MAT.CU_TERM);                                   // cuerpo
    fill(xL, xL + t, yB0, yT1, MAT.CU_TERM);                                           // doblez
    fill(xL, xS, yT0, yT1, MAT.CU_TERM);                                               // gancho sobre los alambres
    // tramo inclinado y punta apoyada (banda de espesor perpendicular t)
    var tc = t / Math.cos(th), tanT = Math.tan(th), xEnd = reaches ? xF1 : xS + run;
    for (var j0 = 0; j0 < NY; j0++) for (var i0 = 0; i0 < NX; i0++) {
      var x = (i0 + 0.5) * dx, y = (j0 + 0.5) * dx;
      if (x < xS || x > xEnd + tc * Math.sin(th) * 0.5) continue;
      var yb = yT0 - (x - xS) * tanT, lo, hi;
      if (x <= xEnd) { lo = Math.max(yB1, yb); hi = Math.min(yT1, Math.max(reaches ? yB1 + t : 0, yb + tc)); }
      else continue;
      if (y >= lo && y < hi) mat[j0 * NX + i0] = MAT.CU_TERM;
    }
    // contacto de la punta con el cuerpo: los primeros closeLen mm son la "zona de cierre"
    if (reaches && flat > 0) {
      var jc = Math.round(yB1 / dx);
      for (var ic = 0; ic < NX; ic++) {
        var xc0 = (ic + 0.5) * dx;
        if (xc0 >= xF0 && xc0 <= xF1 && mat[jc * NX + ic] === MAT.CU_TERM) mat[jc * NX + ic] = xc0 <= xF0 + closeLen ? MAT.CLOSE : MAT.TIPC;
      }
    }
    // alambres con esmalte
    for (var w = 0; w < p.nWires; w++) {
      var xw = xW0 + ro + w * pitch;
      for (var j = 0; j < NY; j++) for (var i = 0; i < NX; i++) {
        var xx = (i + 0.5) * dx, yy = (j + 0.5) * dx, d = Math.hypot(xx - xw, yy - yWc);
        if (d <= rc) mat[j * NX + i] = MAT.CU_WIRE;
        else if (d <= ro + 0.5 * dx && mat[j * NX + i] === MAT.AIR) mat[j * NX + i] = MAT.ENAMEL;
      }
    }
    // electrodo centrado sobre la fila de alambres (más el corrimiento)
    var xEc = (xW0 + xW1) / 2 + (p.elecX || 0) * mm, half = p.faceW * mm / 2;
    var xE0 = Math.max(0, xEc - half), xE1 = Math.min(domW, xEc + half);
    fill(xE0, xE1, yT1, yT1 + dx, MAT.C_EL);
    fill(xE0, xE1, yT1 + dx, domH, MAT.W_EL);
    fill(xE0, xE1, yT1 + dx, yT1 + dx + p.tipLen * mm, MAT.W_TIP);
    // electrodo escalonado: una cara pisa los alambres y otra, más baja, pisa la punta apoyada
    var step = null;
    if (p.elecType === 'step' && reaches && flat > 0) {
      var xB0 = xS + (gap + tc - t) / tanT + dx + (p.elecX || 0) * mm;
      var xB1 = Math.min(xF1, xB0 + (p.stepLen || 2) * mm), yLow = yB1 + t;
      if (xB1 > xB0 + 2 * dx) {
        step = { x0: xB0, x1: xB1, y0: yLow, h: yT1 - yLow };
        var added = [];
        var fillAir = function (x0, x1, y0, y1, m) {
          for (var j = Math.max(0, Math.floor(y0 / dx + 1e-9)); j < Math.min(NY, Math.ceil(y1 / dx - 1e-9)); j++)
            for (var i = Math.max(0, Math.floor(x0 / dx + 1e-9)); i < Math.min(NX, Math.ceil(x1 / dx - 1e-9)); i++)
              if (mat[j * NX + i] === MAT.AIR) { mat[j * NX + i] = m; added.push(j * NX + i); }
        };
        fillAir(Math.min(xE0, xB0), Math.max(xE1, xB1), yT1 + dx, domH, MAT.W_EL);     // cuerpo común
        fillAir(xB0, xB1, yLow + dx, yT1 + dx, MAT.W_TIP);                             // escalón
        fillAir(xB0, xB1, yLow, yLow + dx, MAT.C_EL);                                  // cara baja
        // toda celda de tungsteno que toque cobre lo hace a través de una capa de contacto
        added.forEach(function (c) {
          var m = mat[c]; if (m !== MAT.W_EL && m !== MAT.W_TIP) return;
          var nb = [c - 1, c + 1, c - NX];
          for (var q = 0; q < nb.length; q++) { var mm2 = mat[nb[q]]; if (mm2 === MAT.CU_TERM || mm2 === MAT.CLOSE || mm2 === MAT.TIPC) { mat[c] = MAT.C_EL; break; } }
        });
      }
    }
    for (var i2 = 0; i2 < NX; i2++) {
      var jg = Math.round(yG1 / dx) - 1;
      if (mat[jg * NX + i2] === MAT.GROUND && mat[(jg + 1) * NX + i2] === MAT.CU_TERM) mat[jg * NX + i2] = MAT.C_GND;
    }
    var xC0 = xF0, xC1 = xF0 + Math.max(closeLen, dx);
    return {
      NX: NX, NY: NY, dx: dx, mat: mat,
      info: { xL: xL, xT1: xT1, xS: xS, xF0: xF0, xF1: xF1, theta: th, reaches: reaches, slopeLen: slopeLen, flat: flat, closeLen: closeLen, xW0: xW0, xW1: xW1, yWc: yWc, ro: ro, xC0: xC0, xC1: xC1, yB1: yB1, yT0: yT0, yT1: yT1, xE0: xE0, xE1: xE1, step: step, free: free, closeW: closeLen }
    };
  }

  /* ---------- programa de pulsos ---------- */
  var OFF = { on: false, ctrl: 'SCD', uf: 0.5, heat: 0.5, dl: 0.5, up: 0, weld: 0, down: 0, puls: 1, intv: 0 };
  function pulseOf(o) { return Object.assign({}, OFF, o); }
  // Acepta el formato nuevo (p.we, p.cool) o el antiguo (pulso principal plano + precalentamiento opcional)
  function normalizePulses(p) {
    if (p.we && p.we.length) {
      var we = [0, 1, 2].map(function (i) { return pulseOf(p.we[i] || {}); });
      return { we: we, cool: [(p.cool1 != null ? p.cool1 : (p.coolA || [0, 0])[0]) || 0, (p.cool2 != null ? p.cool2 : (p.coolA || [0, 0])[1]) || 0] };
    }
    var main = pulseOf({ on: true, ctrl: p.mode || 'SCD', uf: p.uf, heat: p.heat, dl: p.dl, up: p.up, weld: p.weld, down: p.down });
    if (p.pre) return { we: [pulseOf({ on: true, ctrl: p.mode || 'SCD', uf: p.preI, heat: p.preI, dl: p.preI, weld: p.preT }), main, pulseOf({})], cool: [p.cool || 0, 0] };
    return { we: [main, pulseOf({}), pulseOf({})], cool: [0, 0] };
  }
  function active(w) { return w.on && w.weld > 0; }
  function makeWaveform(p) {
    var np = normalizePulses(p), we = np.we, segs = [], t = 0;
    var firstOn = -1, lastOn = -1;
    we.forEach(function (w, i) { if (active(w)) { if (firstOn < 0) firstOn = i; lastOn = i; } });
    for (var i = 0; i < 3; i++) {
      var w = we[i];
      if (active(w)) {
        var n = Math.max(1, Math.round(w.puls || 1));
        for (var k = 0; k < n; k++) {
          segs.push({ t0: t, t1: t + w.weld / 1e3, w: w, i: i, k: k });
          t += w.weld / 1e3;
          if (k < n - 1) t += (w.intv || 0) / 1e3;
        }
      }
      if (i < 2 && firstOn >= 0 && firstOn <= i && lastOn > i) t += (np.cool[i] || 0) / 1e3;
    }
    var tEnd = segs.length ? segs[segs.length - 1].t1 : 0;
    var wf = {
      segs: segs, pulses: np, tWeldEnd: tEnd, total: tEnd + (p.hold || 0) / 1e3, ctrl: 'SCD', idx: -1,
      at: function (tt) {
        for (var q = 0; q < segs.length; q++) {
          var sg = segs[q];
          if (tt >= sg.t0 && tt < sg.t1) {
            var W = sg.w, s = tt - sg.t0, up = W.up / 1e3, wl = W.weld / 1e3, dn = W.down / 1e3;
            wf.ctrl = W.ctrl || 'SCD'; wf.idx = sg.i;
            if (up > 0 && s < up) return W.uf + (W.heat - W.uf) * (s / up);
            if (dn > 0 && s > wl - dn) return W.heat + (W.dl - W.heat) * ((s - (wl - dn)) / dn);
            return W.heat;
          }
        }
        wf.idx = -1; return 0;
      }
    };
    return wf;
  }
  // I²t de la consigna (kA²·s) por pulso y total, analítico
  function energyOf(p) {
    var np = normalizePulses(p), per = [0, 0, 0];
    np.we.forEach(function (w, i) {
      if (!active(w)) return;
      var up = w.up / 1e3, wl = w.weld / 1e3, dn = w.down / 1e3, H = w.heat;
      var e = (up > 0 ? up / 3 * (w.uf * w.uf + w.uf * H + H * H) : 0) + H * H * Math.max(0, wl - up - dn) + (dn > 0 ? dn / 3 * (H * H + H * w.dl + w.dl * w.dl) : 0);
      per[i] = e * Math.max(1, Math.round(w.puls || 1));
    });
    return { per: per, total: per[0] + per[1] + per[2] };
  }
  // Reglas del controlador (E-10) para el programa
  function checkProgram(p) {
    var np = normalizePulses(p), errs = [];
    np.we.forEach(function (w, i) {
      if (!w.on) return;
      var tag = 'WE' + (i + 1);
      if (!(w.weld > 0)) errs.push(tag + ': WELD = 0');
      if (w.up + w.down >= w.weld && w.weld > 0 && (w.up > 0 || w.down > 0)) errs.push(tag + ': UP + DOWN (' + (w.up + w.down) + ' ms) debe ser menor que WELD (' + w.weld + ' ms)');
      if (w.up > 0 && w.uf > w.heat) errs.push(tag + ': UF mayor que HEAT');
      if (w.down > 0 && w.dl > w.heat) errs.push(tag + ': DL mayor que HEAT');
      if (w.puls > 1 && (w.up > 0 || w.down > 0) && !(w.intv > 0)) errs.push(tag + ': pulsación con rampas requiere INTERVAL > 0');
    });
    // etapas consecutivas sin COOL: mismo CTRL si hay rampas en la unión
    for (var i = 0; i < 2; i++) {
      var a = np.we[i], b = np.we[i + 1];
      if (active(a) && active(b) && !(np.cool[i] > 0) && a.ctrl !== b.ctrl && (a.down > 0 || b.up > 0)) errs.push('WE' + (i + 1) + '→WE' + (i + 2) + ' sin COOL: modos distintos con rampa');
    }
    if (!np.we.some(active)) errs.push('Ningún pulso activo');
    return errs;
  }

  function run(p, onProgress) {
    var G = buildGeometry(p), NX = G.NX, NY = G.NY, N = NX * NY, dx = G.dx, mat = G.mat;
    var depth = p.hookW * 1e-3, iCal = p.iCal || 1;
    var T = new Float64Array(N), phi = new Float64Array(N), sig = new Float64Array(N), k = new Float64Array(N), rc = new Float64Array(N), q = new Float64Array(N);
    var burn = new Float64Array(N), bond = new Float64Array(N), melt = new Float64Array(N);
    // conductancias por cara (eléctricas y térmicas): W, E, S, N
    var gW = new Float64Array(N), gE = new Float64Array(N), gS = new Float64Array(N), gN = new Float64Array(N), gD = new Float64Array(N);
    var kW = new Float64Array(N), kE = new Float64Array(N), kS = new Float64Array(N), kN = new Float64Array(N), kB = new Float64Array(N), invRc = new Float64Array(N);
    var i, j, n;
    var act = [], enam = [], clos = [], cuc = [], tipc = [];
    for (n = 0; n < N; n++) {
      var m0 = mat[n];
      T[n] = (m0 === MAT.W_EL || m0 === MAT.W_TIP || m0 === MAT.C_EL) ? p.Tel0 : p.T0;
      if (m0 !== MAT.AIR) act.push(n);
      if (m0 === MAT.ENAMEL) enam.push(n);
      if (m0 === MAT.CLOSE) clos.push(n);
      if (m0 === MAT.TIPC) tipc.push(n);
      if (m0 === MAT.CU_TERM || m0 === MAT.CU_WIRE || m0 === MAT.CLOSE || m0 === MAT.TIPC) cuc.push(n);
    }
    var nWv = p.nWires, wireOf = new Int8Array(enam.length), wCount = new Array(nWv).fill(0);
    (function () {
      var gi = G.info;
      for (var e0 = 0; e0 < enam.length; e0++) {
        var c0 = enam[e0], x0 = (c0 % NX + 0.5) * dx;
        var wi0 = Math.max(0, Math.min(nWv - 1, Math.floor((x0 - gi.xW0) / (2 * gi.ro))));
        wireOf[e0] = wi0; wCount[wi0]++;
      }
    })();
    act = Int32Array.from(act); enam = Int32Array.from(enam); clos = Int32Array.from(clos); cuc = Int32Array.from(cuc);
    var nAct = act.length;
    var TBURN = p.Tburn, TBOND = p.Tbond, RREF = p.Rref * 1e-3, REXT = p.Rext * 1e-3, TMELT = 1083, LCU = 1.84e9;
    var hw = p.hookW, cav = p.wear, fd = p.faceDepth;
    var contactW = fd > hw ? Math.min(fd, hw + 2 * cav) : fd;
    var AfC = contactW / hw;
    var Frel = Math.max(0.25, 1 - p.forceLoss * cav);
    var fElecEff = p.fElec / Math.sqrt(Frel);
    var geomOut = { contactW: contactW, AfC: AfC, Frel: Frel, pressRel: Frel / AfC };
    function hmean(a, b) { return (a > 0 && b > 0) ? 2 * a * b / (a + b) : 0; }
    function props() {
      for (var a = 0; a < nAct; a++) {
        var nn = act[a], m = mat[nn], t = T[nn];
        switch (m) {
          case MAT.W_EL: sig[nn] = 1 / rhoW(t); k[nn] = 150; rc[nn] = 2.59e6; break;
          case MAT.W_TIP: sig[nn] = AfC / rhoW(t); k[nn] = 150 * AfC; rc[nn] = 2.59e6 * AfC; break;
          case MAT.GROUND: if (p.gndCu) { sig[nn] = 1 / rhoCu(t); k[nn] = 390; rc[nn] = 3.45e6; } else { sig[nn] = 1 / rhoW(t); k[nn] = 150; rc[nn] = 2.59e6; } break;
          case MAT.CU_TERM: case MAT.CU_WIRE: sig[nn] = 1 / rhoCu(t); k[nn] = 390; rc[nn] = 3.45e6; break;
          case MAT.ENAMEL: {
            var b = burn[nn];
            var lr = Math.log(1e2) * (1 - b) + Math.log(rhoCu(t) * p.fEnamel) * b;
            sig[nn] = 1 / Math.exp(lr);
            k[nn] = 0.6 + (390 - 0.6) * b * (0.3 + 0.7 * bond[nn]);
            rc[nn] = 2.0e6 * (1 - b) + 3.45e6 * b; break;
          }
          case MAT.TIPC:
          case MAT.CLOSE: {
            var f = p.fClose + (1 - p.fClose) * bond[nn];
            sig[nn] = 1 / (rhoCu(t) * f); k[nn] = 120 + 270 * bond[nn]; rc[nn] = 3.45e6; break;
          }
          case MAT.C_EL: sig[nn] = AfC / (rhoW(t) * fElecEff); k[nn] = 100 * AfC; rc[nn] = 2.59e6 * AfC; break;
          case MAT.C_GND: sig[nn] = 1 / (rhoW(t) * p.fElec); k[nn] = 100; rc[nn] = 2.59e6; break;
        }
        invRc[nn] = 1 / rc[nn];
      }
      for (var a2 = 0; a2 < nAct; a2++) {
        var c = act[a2], ii = c % NX, jj = (c - ii) / NX;
        gW[c] = ii > 0 ? hmean(sig[c], sig[c - 1]) : 0; gE[c] = ii < NX - 1 ? hmean(sig[c], sig[c + 1]) : 0;
        gS[c] = jj > 0 ? hmean(sig[c], sig[c - NX]) : 0; gN[c] = jj < NY - 1 ? hmean(sig[c], sig[c + NX]) : 0;
        gD[c] = gW[c] + gE[c] + gS[c] + gN[c];
        kW[c] = ii > 0 ? hmean(k[c], k[c - 1]) : 0; kE[c] = ii < NX - 1 ? hmean(k[c], k[c + 1]) : 0;
        kS[c] = jj > 0 ? hmean(k[c], k[c - NX]) : 0; kN[c] = jj < NY - 1 ? hmean(k[c], k[c + NX]) : 0;
        kB[c] = (jj === 0 ? 2 * k[c] : 0) + (jj === NY - 1 ? 2 * k[c] : 0);
      }
    }
    var fixed = new Uint8Array(N);
    for (i = 0; i < NX; i++) {
      var top = (NY - 1) * NX + i;
      if (mat[top] === MAT.W_EL || mat[top] === MAT.W_TIP) { fixed[top] = 1; phi[top] = 1; }
      if (mat[i] === MAT.GROUND) { fixed[i] = 1; phi[i] = 0; }
    }
    for (n = 0; n < N; n++) if (!fixed[n]) phi[n] = Math.floor(n / NX) / NY;
    var free = [];
    for (var a3 = 0; a3 < nAct; a3++) if (!fixed[act[a3]]) free.push(act[a3]);
    free = Int32Array.from(free);
    var nFree = free.length;
    function solvePhi(iters) {
      var w = 1.85;
      for (var it = 0; it < iters; it++) {
        for (var a = 0; a < nFree; a++) {
          var c = free[a], den = gD[c];
          if (den <= 0) continue;
          var sum = 0;
          if (gW[c]) sum += gW[c] * phi[c - 1];
          if (gE[c]) sum += gE[c] * phi[c + 1];
          if (gS[c]) sum += gS[c] * phi[c - NX];
          if (gN[c]) sum += gN[c] * phi[c + NX];
          phi[c] += w * (sum / den - phi[c]);
        }
      }
      var Itot = 0;
      for (var i3 = 0; i3 < NX; i3++) { var cc = NX + i3; if (gS[cc]) Itot += gS[cc] * depth * (phi[cc] - phi[i3]); }
      return Itot;
    }
    var vol = dx * dx * depth;
    function heatGen(scaleV) {
      for (var a = 0; a < nAct; a++) q[act[a]] = 0;
      var f = depth * scaleV * scaleV / 2 / vol;
      for (var a2 = 0; a2 < nAct; a2++) {
        var c = act[a2], dv, P;
        if (gE[c]) { dv = phi[c] - phi[c + 1]; P = gE[c] * dv * dv * f; q[c] += P; q[c + 1] += P; }
        if (gN[c]) { dv = phi[c] - phi[c + NX]; P = gN[c] * dv * dv * f; q[c] += P; q[c + NX] += P; }
      }
    }

    var wf = makeWaveform(p);
    var dt = p.dt, steps = Math.ceil(wf.total / dt), eEvery = Math.max(1, Math.round(p.elecEvery / dt));
    var fEvery = Math.max(1, Math.round(p.frameEvery / dt)), sEvery = Math.max(1, Math.round(0.001 / dt));
    var frames = [], series = [];
    var Tn = new Float64Array(N);
    T.forEach(function (v, ix) { Tn[ix] = v; });
    var Rdom = 1, I = 0, V = 0, Pw = 0, Eel = 0, Edom = 0, Eset = 0;
    var inf = G.info;
    function cellAt(xm, ym) { return Math.min(NY - 1, Math.max(0, Math.floor(ym / dx))) * NX + Math.min(NX - 1, Math.max(0, Math.floor(xm / dx))); }
    var midW = Math.floor(p.nWires / 2);
    var probes = {
      wire: cellAt(inf.xW0 + inf.ro + midW * 2 * inf.ro, inf.yWc),
      tang: cellAt(inf.xW0 + inf.ro + midW * 2 * inf.ro, inf.yT0 + 0.5 * dx),
      close: cellAt((inf.xC0 + inf.xC1) / 2, inf.yB1 + 0.5 * dx),
      elec: cellAt((inf.xE0 + inf.xE1) / 2, inf.yT1 + 1.5 * dx)
    };
    var G3 = 2 / (depth * p.zLoss * 1e-3), Tw = p.Twater, T0 = p.T0, idx2 = 1 / (dx * dx);
    var pk = { Tw: 0, Tt: 0, Tc: 0, Te: 0 }, EjEnd = 0, tBurn = null, tBondC = null, sEnd = Math.round(wf.tWeldEnd / dt);
    var perPulse = [{ E: 0, Imax: 0, Isum: 0, n: 0 }, { E: 0, Imax: 0, Isum: 0, n: 0 }, { E: 0, Imax: 0, Isum: 0, n: 0 }];
    props();
    var I1V = solvePhi(400);
    var lastFlow = false;
    for (var s = 0; s <= steps; s++) {
      var t = s * dt;
      var set = wf.at(t), ctrl = wf.ctrl, pi = wf.idx;
      var flow = set > 0;
      if (s % eEvery === 0 || (flow && !lastFlow)) { props(); var r1 = solvePhi(flow ? 25 : 0); if (r1) I1V = r1; }
      Rdom = I1V > 0 ? 1 / I1V : 1e9;
      var Rtot = Rdom + REXT;
      if (flow) {
        if (ctrl === 'PWR') { var Pset = Math.pow(set * 1e3 * iCal, 2) * RREF; I = Math.sqrt(Pset / Rtot); }
        else if (ctrl === 'VLT') { var Vset = set * 1e3 * iCal * RREF; I = Vset / Rtot; }
        else I = set * 1e3 * iCal;
        I = Math.min(I, p.Imax * 1e3, p.Vmax / Rtot);
      } else I = 0;
      V = I * Rtot; Pw = I * I * Rtot;
      if (flow && (s % eEvery === 0 || !lastFlow)) heatGen(I * Rdom);
      if (!flow && lastFlow) for (var a0 = 0; a0 < nAct; a0++) q[act[a0]] = 0;
      lastFlow = flow;
      Eel += Pw * dt; Edom += I * I * Rdom * dt; Eset += set * set * dt;
      if (pi >= 0) { var pp = perPulse[pi]; pp.E += Pw * dt; if (I > pp.Imax) pp.Imax = I; pp.Isum += I; pp.n++; }
      // calor explícito sobre celdas activas
      for (var a = 0; a < nAct; a++) {
        var c = act[a], Tc = T[c], flux = kB[c] * (Tw - Tc);
        if (kW[c]) flux += kW[c] * (T[c - 1] - Tc);
        if (kE[c]) flux += kE[c] * (T[c + 1] - Tc);
        if (kS[c]) flux += kS[c] * (T[c - NX] - Tc);
        if (kN[c]) flux += kN[c] * (T[c + NX] - Tc);
        Tn[c] = Tc + dt * (flux * idx2 + q[c] - G3 * k[c] * (Tc - T0)) * invRc[c];
      }
      var tmp = T; T = Tn; Tn = tmp;
      // fusión del cobre (calor latente), esmalte y uniones
      for (var b1 = 0; b1 < cuc.length; b1++) {
        var c1 = cuc[b1];
        if (T[c1] > TMELT && melt[c1] < 1) { var ex = rc[c1] * (T[c1] - TMELT); var dm = Math.min(1 - melt[c1], ex / LCU); melt[c1] += dm; T[c1] -= dm * LCU / rc[c1]; }
      }
      for (var b2 = 0; b2 < enam.length; b2++) {
        var c2 = enam[b2];
        if (T[c2] > TBURN && burn[c2] < 1) burn[c2] = Math.min(1, burn[c2] + dt / p.burnTime * Math.min(3, (T[c2] - TBURN) / 100 + 0.3));
        if (burn[c2] >= 1 && T[c2] > TBOND && bond[c2] < 1) bond[c2] = Math.min(1, bond[c2] + dt / p.bondTime * Math.min(3, (T[c2] - TBOND) / 100 + 0.3));
      }
      for (var b5 = 0; b5 < tipc.length; b5++) { var c5 = tipc[b5]; if (T[c5] > TBOND && bond[c5] < 1) bond[c5] = Math.min(1, bond[c5] + dt / p.bondTime * Math.min(3, (T[c5] - TBOND) / 100 + 0.3)); }
      for (var b3 = 0; b3 < clos.length; b3++) {
        var c3 = clos[b3];
        if (T[c3] > TBOND && bond[c3] < 1) bond[c3] = Math.min(1, bond[c3] + dt / p.bondTime * Math.min(3, (T[c3] - TBOND) / 100 + 0.3));
      }
      if (T[probes.wire] > pk.Tw) pk.Tw = T[probes.wire]; if (T[probes.tang] > pk.Tt) pk.Tt = T[probes.tang];
      if (T[probes.close] > pk.Tc) pk.Tc = T[probes.close]; if (T[probes.elec] > pk.Te) pk.Te = T[probes.elec];
      if (s === sEnd) { for (var b4 = 0; b4 < nAct; b4++) { var c4 = act[b4], m4 = mat[c4]; if (m4 === MAT.CU_TERM || m4 === MAT.CU_WIRE || m4 === MAT.ENAMEL || m4 === MAT.CLOSE || m4 === MAT.TIPC) EjEnd += rc[c4] * (T[c4] - T0) * vol; } }
      if (s % sEvery === 0) {
        var bE = 0, bdE = 0, bdC = 0, mC = 0, wB = new Array(nWv).fill(0);
        for (var e1 = 0; e1 < enam.length; e1++) { bE += burn[enam[e1]]; bdE += bond[enam[e1]]; wB[wireOf[e1]] += bond[enam[e1]]; }
        var bMin = 1; for (var w1 = 0; w1 < nWv; w1++) if (wCount[w1]) bMin = Math.min(bMin, wB[w1] / wCount[w1]);
        for (var e2 = 0; e2 < clos.length; e2++) bdC += bond[clos[e2]];
        for (var e3 = 0; e3 < cuc.length; e3++) if (melt[cuc[e3]] > 0.5) mC++;
        series.push({ t: t * 1e3, set: set, we: pi + 1, I: I / 1e3, V: V, pulse: Math.min(100, V / p.Vmax * 100), P: Pw / 1e3, R: Rtot * 1e3,
          Tw: T[probes.wire], Tt: T[probes.tang], Tc: T[probes.close], Te: T[probes.elec],
          burn: enam.length ? bE / enam.length : 0, bondW: enam.length ? bdE / enam.length : 0, bondC: clos.length ? bdC / clos.length : 0, bondMin: enam.length ? bMin : 0, melt: mC * dx * dx * 1e6 });
        var ls = series[series.length - 1];
        if (tBurn === null && ls.burn >= 0.95) tBurn = ls.t; if (tBondC === null && ls.bondC >= 0.95) tBondC = ls.t;
      }
      if (p.frameEvery < 1 && (s % fEvery === 0 || s === steps)) frames.push({ t: t * 1e3, I: I / 1e3, T: Float32Array.from(T), burn: Float32Array.from(burn), bond: Float32Array.from(bond), melt: Float32Array.from(melt) });
      if (onProgress && s % 2000 === 0) onProgress(s / steps);
    }
    var last = series[series.length - 1];
    return {
      NX: NX, NY: NY, dx: dx, mat: Array.from(mat), info: G.info, frames: frames, series: series,
      summary: {
        Eel: Eel, Edom: Edom, Eset: Eset, Ejoint: EjEnd, peaks: pk, tBurn: tBurn, tBondC: tBondC, tWeldEnd: wf.tWeldEnd * 1e3,
        perPulse: perPulse.map(function (x) { return { E: x.E, Imax: x.Imax / 1e3, Imean: x.n ? x.Isum / x.n / 1e3 : 0 }; }),
        geom: geomOut, burn: last.burn, bondW: last.bondW, bondMin: last.bondMin, bondC: last.bondC, melt: last.melt, Rref: RREF * 1e3, iCal: iCal,
        free: G.info.free * 1e3, closeW: G.info.closeW * 1e3, reaches: G.info.reaches
      }
    };
  }

  var DEFAULTS = {
    dx: 0.125e-3, domainW: 10.5e-3, domainH: 8e-3, dt: 2.5e-5, elecEvery: 0.001, frameEvery: 0.01,
    nWires: 3, wireDiam: 1.15, wireCore: 0.55, enamel: 0.075, thick: 1.0, hookW: 2.0, hookLen: 8.5, innerR: 0.65, closeFrac: 0.35,
    faceW: 4.5, elecX: 0, elecType: 'flat', stepLen: 2.0, closeAngle: 60, closeLen: 1.0, T0: 25, Tel0: 150, Twater: 30, Tburn: 480, Tbond: 700, burnTime: 0.025, bondTime: 0.04,
    fEnamel: 8, fClose: 25, fElec: 2.5, Rext: 0.16, Rref: 0.28, Imax: 9.9, Vmax: 2.83, wear: 0, faceDepth: 3.0, tipLen: 0.75, forceLoss: 0.8, zLoss: 14, gndCu: false, iCal: 1,
    mode: 'SCD', pre: false, preT: 150, preI: 2.8, cool: 30, up: 240, weld: 450, down: 40, uf: 3.15, heat: 4.0, dl: 2.6, hold: 300
  };

  function verdict(sm) {
    if (sm.reaches === false && !(sm.melt > 1.0)) return { code: 'ABIERTA', cls: 'bad', text: 'La punta del gancho no alcanza el cuerpo: con este largo de gancho y estos alambres el cierre queda abierto, sin importar la energía.' };
    if (sm.melt > 1.0) return { code: 'QUEMADA', cls: 'bad', text: 'Cobre fundido (' + sm.melt.toFixed(1) + ' mm² en el corte): quemada / expulsión.' };
    if (sm.burn < 0.9) return { code: 'FRÍA', cls: 'bad', text: 'El esmalte no se removió por completo (' + Math.round(sm.burn * 100) + '%). Unión fría: abre con poca fuerza y R alta.' };
    var bm = sm.bondMin != null ? sm.bondMin : sm.bondW;
    if (bm < 0.5) return { code: 'DÉBIL', cls: 'warn', text: 'Esmalte removido pero unión incompleta: el alambre más débil está unido ' + Math.round(bm * 100) + '% (promedio ' + Math.round(sm.bondW * 100) + '%). Pasa resistencia, pero puede abrir en jalón o con vibración.' };
    if (sm.melt > 0.3) return { code: 'OK (caliente)', cls: 'warn', text: 'Unión completa con fusión superficial bajo el electrodo: poco margen hacia quemado y más desgaste.' };
    return { code: 'OK', cls: 'ok', text: 'Esmalte removido y todos los alambres unidos, sin cobre fundido.' + (sm.bondC != null ? (sm.bondC < 0.5 ? ' La punta del gancho solo está apoyada (sin unir).' : ' La punta del gancho también quedó unida al cuerpo.') : '') };
  }
  // orden de clases para calibración: 0 fría, 1 débil, 2 ok, 3 ok caliente, 4 quemada
  var CLASS_ORDER = { 'ABIERTA': 0, 'FRÍA': 0, 'DÉBIL': 1, 'OK': 2, 'OK (caliente)': 3, 'QUEMADA': 4 };

  var api = { verdict: verdict, CLASS_ORDER: CLASS_ORDER, run: run, buildGeometry: buildGeometry, makeWaveform: makeWaveform, normalizePulses: normalizePulses, energyOf: energyOf, checkProgram: checkProgram, pulseOf: pulseOf, MAT: MAT, MAT_NAMES: MAT_NAMES, DEFAULTS: DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FusingSim = api;
})(typeof self !== 'undefined' ? self : this);
