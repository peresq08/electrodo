/* Vista 3D rápida de la geometría (terminal, alambres, electrodo y barra) con three.js local. */
import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const S = window.FusingSim;
let renderer, scene, camera, controls, group, host = null, lastKey = '', raf = 0, needs = true;

const MATS = {
  cu: new THREE.MeshStandardMaterial({ color: 0xc8793f, metalness: 0.55, roughness: 0.38 }),
  cuWire: new THREE.MeshStandardMaterial({ color: 0xe29a5c, metalness: 0.5, roughness: 0.35 }),
  enamel: new THREE.MeshStandardMaterial({ color: 0x8a3a12, metalness: 0.1, roughness: 0.55 }),
  w: new THREE.MeshStandardMaterial({ color: 0x8c96a3, metalness: 0.65, roughness: 0.3 }),
  gnd: new THREE.MeshStandardMaterial({ color: 0x5c6670, metalness: 0.5, roughness: 0.45 }),
  close: new THREE.MeshStandardMaterial({ color: 0xd9a63c, metalness: 0.4, roughness: 0.4 })
};

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.6); d1.position.set(6, 10, 8); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-8, 4, -6); scene.add(d2);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.autoRotate = true; controls.autoRotateSpeed = 0.9;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  controls.addEventListener('change', () => { needs = true; });
  renderer.domElement.className = 'geo3d-canvas';
  renderer.domElement.title = 'Arrastra para girar · rueda para acercar';
}

function box(x0, x1, y0, y1, z0, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0)), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}
function cyl(x, y, r, len, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, 0);
  return m;
}

function build(p) {
  const P = Object.assign({}, S.DEFAULTS, p);
  const inf = S.buildGeometry(P).info, k = 1e3; // a mm
  const t = P.thick, hw = P.hookW, zH = hw / 2;
  const xL = inf.xL * k, xT1 = inf.xT1 * k, xW0 = inf.xW0 * k, ro = inf.ro * k, rc = P.wireCore;
  const yB0 = 1, yB1 = inf.yB1 * k, yT0 = inf.yT0 * k, yT1 = inf.yT1 * k, yWc = inf.yWc * k;
  if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
  group = new THREE.Group();
  // barra de tierra (más ancha que el gancho)
  group.add(box(xL - 0.5, Math.max(inf.xT1 * k + 0.6, xL + 6), 0, yB0, -zH - 1.5, zH + 1.5, P.gndCu ? MATS.cu : MATS.gnd));
  // terminal: cuerpo, doblez, tira sobre los alambres, tramo inclinado y punta apoyada
  const xS = inf.xS * k, xF0 = inf.xF0 * k, xF1 = inf.xF1 * k, th = inf.theta, sl = inf.reaches ? inf.slopeLen * k : inf.free * k;
  group.add(box(xL, Math.max(xT1, xF1) + 0.4, yB0, yB1, -zH - 0.6, zH + 0.6, MATS.cu));
  group.add(box(xL, xL + t, yB0, yT1, -zH, zH, MATS.cu));
  group.add(box(xL, xS, yT0, yT1, -zH, zH, MATS.cu));
  if (sl > 0) {
    const dxs = Math.cos(th), dys = -Math.sin(th), nx = Math.sin(th), ny = Math.cos(th);
    const L = sl + t * Math.tan(th / 2) * 2;
    const cx = xS + dxs * sl / 2 + nx * t / 2, cy = yT0 + dys * sl / 2 + ny * t / 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, t, hw), MATS.cu);
    m.position.set(cx, cy, 0); m.rotation.z = -th; group.add(m);
  }
  if (inf.reaches && xF1 > xF0) {
    group.add(box(xF0, xF1, yB1, yB1 + t, -zH, zH, MATS.cu));
    group.add(box(xF0, xF0 + Math.max(inf.closeLen * k, 0.1), yB1 - 0.02, yB1 + 0.07, -zH - 0.01, zH + 0.01, MATS.close));
  }
  // alambres (salen del gancho a ambos lados)
  for (let w = 0; w < P.nWires; w++) {
    const x = xW0 + ro + w * 2 * ro;
    group.add(cyl(x, yWc, ro, 9, MATS.enamel));
    group.add(cyl(x, yWc, rc, 9.12, MATS.cuWire));
  }
  // electrodo: cilindro de tungsteno con la punta maquinada (cara faceW × faceDepth y, si aplica, escalón)
  const xEc = inf.xEc * k, R = inf.R * k, yC = inf.yCyl * k, hx = Math.min(P.faceW / 2, R), fd = Math.min(P.faceDepth, 2 * R), cav = Math.min(P.wear || 0, 0.9);
  const yE = yT1, Hc = 6;
  const cylM = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Hc, 40), MATS.w);
  cylM.position.set(xEc, yC + Hc / 2, 0); group.add(cylM);
  group.add(box(xEc - hx, xEc + hx, yE, yC, -fd / 2, fd / 2, MATS.w));            // cara maquinada sobre los alambres
  if (cav > 0 && fd > hw) {
    const zIn = Math.min(fd / 2, zH + 0.02);
    group.add(box(xEc - hx, xEc + hx, yE - cav, yE, zIn, fd / 2, MATS.w));
    group.add(box(xEc - hx, xEc + hx, yE - cav, yE, -fd / 2, -zIn, MATS.w));
  }
  if (inf.step) {
    const st = inf.step, x0 = st.x0 * k, x1 = st.x1 * k, y0 = st.y0 * k;
    group.add(box(x0, x1, y0, yC, -fd / 2, fd / 2, MATS.w));                        // escalón (cara baja)
    if (x0 > xEc + hx) group.add(box(xEc + hx, x0, yE + 0.12, yC, -fd / 2, fd / 2, MATS.w));
  }
  // centrar
  const c = new THREE.Vector3((xL + xT1) / 2, yT1 / 2 + 1, 0);
  group.position.set(-c.x, -c.y, 0);
  scene.add(group);
  fit();
  needs = true;
}
let fitted = false;
function fit() {
  if (fitted) return; fitted = true;
  const b = new THREE.Box3().setFromObject(group), size = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.62, dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const dir = new THREE.Vector3(0.55, 0.42, 0.72).normalize();
  controls.target.copy(ctr); camera.position.copy(ctr).addScaledVector(dir, dist); camera.updateProjectionMatrix();
}

function resize() {
  if (!host) return;
  const w = host.clientWidth || 300, h = Math.round(w * 0.62);
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true;
}

function loop() {
  raf = requestAnimationFrame(loop);
  if (!host || !host.isConnected || host.offsetParent === null) return;
  const moved = controls.update();
  if (moved || needs || controls.autoRotate) { renderer.render(scene, camera); needs = false; }
}

window.Geo3D = {
  attach(el) {
    if (!renderer) init();
    host = el; el.appendChild(renderer.domElement);
    resize(); if (!raf) loop();
    needs = true;
  },
  update(p) {
    if (!renderer) init();
    const key = JSON.stringify([p.nWires, p.wireCore, p.wireDiam, p.thick, p.hookLen, p.elecX, p.faceW, p.faceDepth, p.wear, p.gndCu, p.closeAngle, p.elecType, p.stepLen, p.elecD, p.bossH]);
    if (key === lastKey) return; lastKey = key;
    build(p);
  },
  resize
};
window.addEventListener('resize', () => window.Geo3D.resize());
window.dispatchEvent(new Event('geo3dready'));
