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
  const xC0 = inf.xC0 * k, xC1 = inf.xC1 * k;
  if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
  group = new THREE.Group();
  // barra de tierra (más ancha que el gancho)
  group.add(box(xL - 0.5, Math.max(xT1 + 0.6, xL + 6), 0, yB0, -zH - 1.5, zH + 1.5, P.gndCu ? MATS.cu : MATS.gnd));
  // terminal: cuerpo, pared del doblez, gancho y punta de cierre
  group.add(box(xL, xT1 + 0.4, yB0, yB1, -zH - 0.6, zH + 0.6, MATS.cu));
  group.add(box(xL, xL + t, yB0, yT1, -zH, zH, MATS.cu));
  group.add(box(xL, xT1, yT0, yT1, -zH, zH, MATS.cu));
  group.add(box(xC0, xC1, yB1 + 0.06, yT0, -zH, zH, MATS.cu));
  group.add(box(xC0, xC1, yB1, yB1 + 0.06, -zH, zH, MATS.close));
  // alambres (salen del gancho a ambos lados)
  for (let w = 0; w < P.nWires; w++) {
    const x = xW0 + ro + w * 2 * ro;
    group.add(cyl(x, yWc, ro, 9, MATS.enamel));
    group.add(cyl(x, yWc, rc, 9.12, MATS.cuWire));
  }
  // electrodo: cara faceW (a lo largo) × faceDepth (a lo ancho); con cavidad, los flancos abrazan el gancho
  const xEc = (xW0 + xT1) / 2 + (P.elecX || 0), hx = P.faceW / 2, fd = P.faceDepth, cav = Math.min(P.wear || 0, 0.9);
  const yE = yT1, H = 3.2;
  group.add(box(xEc - hx, xEc + hx, yE, yE + H, -fd / 2, fd / 2, MATS.w));
  // vástago
  group.add(box(xEc - hx * 0.8, xEc + hx * 0.8, yE + H, yE + H + 2.5, -Math.max(fd, 2.4) / 2 - 0.4, Math.max(fd, 2.4) / 2 + 0.4, MATS.w));
  if (cav > 0 && fd > hw) {
    const zIn = Math.min(fd / 2, zH + 0.02);
    group.add(box(xEc - hx, xEc + hx, yE - cav, yE, zIn, fd / 2, MATS.w));
    group.add(box(xEc - hx, xEc + hx, yE - cav, yE, -fd / 2, -zIn, MATS.w));
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
    const key = JSON.stringify([p.nWires, p.wireCore, p.wireDiam, p.thick, p.hookLen, p.elecX, p.faceW, p.faceDepth, p.wear, p.gndCu]);
    if (key === lastKey) return; lastKey = key;
    build(p);
  },
  resize
};
window.addEventListener('resize', () => window.Geo3D.resize());
window.dispatchEvent(new Event('geo3dready'));
