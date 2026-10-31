// Jetline - rendering, input, HUD, game loop
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const JC = window.JC, M = JC.M;
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('jetline:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('jetline:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

// ---------------- setup ----------------
let levelIdx = Math.min(JC.levels.length - 1, Math.max(0, store.get('level', 0) | 0));
let level, track, race;
// input settings live with the game (the physics never reads them); saved together with the tuning
const INPUT_DEFAULTS = { airPitchInvert: 1 };   // 1 = S tilts the nose up in the air (flight-sim)
const SOUND_DEFAULTS = { volMaster: 0.8, volJet: 0.45, volEngine: 1, volWind: 1, volSkid: 0.8 };
const ALL_DEFAULTS = Object.assign({}, JC.defaultTuning, INPUT_DEFAULTS, SOUND_DEFAULTS);
const tuning = Object.assign({}, ALL_DEFAULTS, store.get('tuning', {}));
const car = new JC.Car(tuning);
const DT = 1 / 240;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('view').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HAZE = new THREE.Color('#cdd8de');
scene.fog = new THREE.FogExp2(HAZE, 0.0014);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 4000);

// sky dome (not fogged)
{
  const geo = new THREE.SphereGeometry(3000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#3f78a8') }, mid: { value: new THREE.Color('#9ec0d8') }, low: { value: HAZE.clone() }, sunDir: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y;
        vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, low, smoothstep(0.0, -0.12, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat); sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);
  scene.userData.sky = sky;
}

const hemi = new THREE.HemisphereLight('#d9ecff', '#6b7b6a', 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff2df', 2.4);
const SUN_DIR = new THREE.Vector3(0.25, 1, 0.18).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ground far below, so heights read
{
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7f9488'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#76897e'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(120, 120); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.userData.ground = ground;
}

// ---------------- track meshes ----------------
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function boxMatrix(c, ax, size) {
  const m = new THREE.Matrix4().makeBasis(v3(ax[0]).negate(), v3(ax[1]), v3(ax[2]));
  m.scale(new THREE.Vector3(size[0], size[1], size[2]));
  m.setPosition(c[0], c[1], c[2]);
  return m;
}
let trackGroup = null;
let gateMeshes = [];
const blockTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c4c8ca'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(0,0,0,0.04)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  g.strokeStyle = 'rgba(40,50,60,0.28)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
})();
function buildTrackMeshes() {
  if (trackGroup) { scene.remove(trackGroup); trackGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  trackGroup = new THREE.Group(); scene.add(trackGroup);
  gateMeshes = [];
  // solid blocks (floor, decks, boxes): concrete with a 4 m grid
  for (const bx of track.boxes) {
    if (bx.kind !== 'block') continue;
    const size = bx.h.map((x) => x * 2);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // scale UVs per face so the grid stays 4 m everywhere
    const uv = geo.attributes.uv, faceDims = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v; uv.setXY(i, uv.getX(i) * size[faceDims[f][0]] / 4, uv.getY(i) * size[faceDims[f][1]] / 4);
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: blockTex, roughness: 0.9, color: bx.h[1] < 1.5 ? '#e4e7e9' : '#aab3ba' }));
    mesh.applyMatrix4(boxMatrix(bx.c, bx.ax, size));
    mesh.castShadow = bx.h[0] < 60; mesh.receiveShadow = true;
    trackGroup.add(mesh);
  }
  // Visual road: a continuous swept ribbon built from the collision slabs (smooth edges, no stair steps)

  const pos = [], col = [], nrm = [];
  const C = (h) => new THREE.Color(h);
  const cTopA = C('#cfd3d6'), cTopB = C('#c2c7cb'), cLoop = C('#d9d4c9'), cSide = C('#77818b'), cBottom = C('#626c76'), cOr = C('#ff6b1f'), cW = C('#f4f4f2');
  // quad with per-corner normals (smooth shading along curves); n = [na, nb, nc, nd]
  const quad = (a, b, c, d, color, n) => {
    // keep the triangle winding consistent with the given normals (DoubleSide flips back faces)
    const wn = M.cross(M.sub(b, a), M.sub(c, a)), avg = M.add(M.add(n[0], n[1]), M.add(n[2], n[3]));
    if (M.dot(wn, avg) < 0) { [b, d] = [d, b]; n = [n[0], n[3], n[2], n[1]]; }
    const vs = [a, b, c, a, c, d], ns = [n[0], n[1], n[2], n[0], n[2], n[3]];
    for (let i = 0; i < 6; i++) { pos.push(vs[i][0], vs[i][1], vs[i][2]); col.push(color.r, color.g, color.b); nrm.push(ns[i][0], ns[i][1], ns[i][2]); }
  };
  const SL = 2.0;
  const runs = [];
  for (const bx of track.boxes) { if (bx.kind === 'block') continue; if (bx.capB || !runs.length) runs.push([]); runs[runs.length - 1].push(bx); }
  for (const run of runs) {
    const st = [];
    const realHalf = (bx) => (bx.h[2] - 0.05) / 1.04;
    const top = (bx, s) => M.add(M.add(bx.c, M.mul(bx.ax[1], bx.h[1])), M.mul(bx.ax[2], s * realHalf(bx)));
    st.push({ p: top(run[0], -1), r: run[0].ax[0], u: run[0].ax[1], w: run[0].h[0] });
    for (let i = 0; i < run.length - 1; i++) {
      const A = run[i], B = run[i + 1];
      st.push({ p: M.mul(M.add(top(A, 1), top(B, -1)), 0.5), r: M.norm(M.add(A.ax[0], B.ax[0])), u: M.norm(M.add(A.ax[1], B.ax[1])), w: (A.h[0] + B.h[0]) / 2 });
    }
    const last = run[run.length - 1];
    st.push({ p: top(last, 1), r: last.ax[0], u: last.ax[1], w: last.h[0] });
    const corners = (s) => {
      const L = M.sub(s.p, M.mul(s.r, s.w)), R = M.add(s.p, M.mul(s.r, s.w));
      const dn = M.mul(s.u, -SL), lift = M.mul(s.u, 0.02);
      return { L, R, BL: M.add(L, dn), BR: M.add(R, dn),
        cL0: M.add(L, lift), cL1: M.add(M.add(L, M.mul(s.r, 0.7)), lift), cR0: M.add(R, lift), cR1: M.add(M.sub(R, M.mul(s.r, 0.7)), lift) };
    };
    for (let i = 0; i < run.length; i++) {
      const a = corners(st[i]), b = corners(st[i + 1]), bx = run[i];
      const A = st[i], B = st[i + 1];
      const up4 = [A.u, B.u, B.u, A.u], dn4 = [M.mul(A.u, -1), M.mul(A.u, -1), M.mul(B.u, -1), M.mul(B.u, -1)];
      const lf = [M.mul(A.r, -1), M.mul(A.r, -1), M.mul(B.r, -1), M.mul(B.r, -1)], rt = [A.r, B.r, B.r, A.r];
      quad(a.L, b.L, b.R, a.R, bx.kind === 'loop' ? cLoop : bx.stripe ? cTopA : cTopB, up4);
      quad(a.L, a.BL, b.BL, b.L, cSide, lf);
      quad(a.R, b.R, b.BR, a.BR, cSide, rt);
      quad(a.BL, a.BR, b.BR, b.BL, cBottom, dn4);
      quad(a.cL0, b.cL0, b.cL1, a.cL1, bx.stripe ? cOr : cW, up4);
      quad(a.cR0, a.cR1, b.cR1, b.cR0, bx.stripe ? cOr : cW, [A.u, A.u, B.u, B.u]);
      if (i === 0) { const bk = M.mul(bx.ax[2], -1); quad(a.L, a.R, a.BR, a.BL, cSide, [bk, bk, bk, bk]); }
      if (i === run.length - 1) { const fw = bx.ax[2]; quad(b.L, b.BL, b.BR, b.R, cSide, [fw, fw, fw, fw]); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide }));
  road.castShadow = true; road.receiveShadow = true;
  trackGroup.add(road);

  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 16;
  const fg = fc.getContext('2d');
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { fg.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f2'; fg.fillRect(i * 8, j * 8, 8, 8); }
  const flagTex = new THREE.CanvasTexture(fc); flagTex.colorSpace = THREE.SRGBColorSpace;
  for (const g of track.gates) {
    const grp = new THREE.Group();
    const col = g.finish ? '#f4f4f2' : '#3fd9c8';
    const postMat = new THREE.MeshStandardMaterial({ color: '#2a333d', roughness: 0.5 });
    const glow = new THREE.MeshBasicMaterial({ color: col });
    const H = 6.5, half = g.w / 2 + 0.6;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), postMat);
      post.position.set(s * half, H / 2, 0); post.castShadow = true; grp.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 1.0, 0.35), g.finish ? new THREE.MeshBasicMaterial({ map: flagTex }) : glow);
    beam.position.set(0, H, 0); grp.add(beam);
    const m = new THREE.Matrix4().makeBasis(v3(g.r).negate(), v3(g.u), v3(g.f));
    grp.quaternion.setFromRotationMatrix(m);
    grp.position.set(g.p[0], g.p[1], g.p[2]);
    trackGroup.add(grp);
    gateMeshes.push({ grp, mat: glow, base: new THREE.Color(col) });
  }
}

// ---------------- car mesh ----------------
function makeCar(ghost) {
  const grp = new THREE.Group();
  const mk = (color, opts = {}) => ghost
    ? new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.28, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.45, metalness: opts.m ?? 0.15, ...(opts.e ? { emissive: opts.e } : {}) });
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = !ghost; grp.add(o); return o; };
  const white = mk('#eef1f3'), dark = mk('#20262d', { r: 0.6 }), glass = mk('#1b3142', { r: 0.15, m: 0.4 }), orange = mk('#ff6b1f');
  add(new THREE.BoxGeometry(1.75, 0.42, 3.9), white, 0, -0.05, -0.05);           // chassis
  const nose = add(new THREE.BoxGeometry(1.5, 0.28, 0.9), white, 0, -0.1, 2.25); nose.rotation.x = 0.18;
  add(new THREE.BoxGeometry(1.1, 0.38, 1.4), glass, 0, 0.33, 0.05);               // cockpit
  add(new THREE.BoxGeometry(1.8, 0.06, 0.5), orange, 0, -0.05, 1.55);            // stripe
  add(new THREE.BoxGeometry(0.12, 0.45, 0.35), dark, 0.6, 0.35, -1.75);          // wing struts
  add(new THREE.BoxGeometry(0.12, 0.45, 0.35), dark, -0.6, 0.35, -1.75);
  add(new THREE.BoxGeometry(1.9, 0.07, 0.55), orange, 0, 0.6, -1.8);             // rear wing
  const nozzle = add(new THREE.CylinderGeometry(0.28, 0.36, 0.7, 14, 1, true), dark, 0, 0.05, -2.15); nozzle.rotation.x = Math.PI / 2;
  const parts = { grp, wheels: [], flaps: [], flame: null };
  if (!ghost) {
    const flameMat = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1, 14, 1, true), flameMat);
    flame.rotation.x = -Math.PI / 2; flame.position.set(0, 0.05, -2.5);
    const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    flameOuter.rotation.x = -Math.PI / 2; flameOuter.position.set(0, 0.05, -2.5);
    grp.add(flame, flameOuter); parts.flame = [flame, flameOuter];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.55, 0.17, -1.35);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), orange); flap.position.set(0, 0, 0.31); flap.castShadow = true;
      pivot.add(flap); grp.add(pivot); parts.flaps.push(pivot);
    }
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.1), orange);
      wing.position.set(s * 0.85, 0.02, -0.55); wing.castShadow = true;
      grp.add(wing); parts.wings = (parts.wings || []).concat({ mesh: wing, side: s });
    }
    const tireMat = mk('#1d2126', { r: 0.9 }), hubMat = mk('#b7bec5', { m: 0.6 });
    for (const w of JC.Car.WHEELS) {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(tuning.wheelRadius, tuning.wheelRadius, 0.32, 18), tireMat);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true;
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, tuning.wheelRadius * 1.3), hubMat);
      const spin = new THREE.Group(); spin.add(tire, hub);
      wg.add(spin); grp.add(wg);
      parts.wheels.push({ wg, spin, def: w });
    }
  }
  return parts;
}
const carMesh = makeCar(false);
scene.add(carMesh.grp);
const ghostMesh = makeCar(true);
scene.add(ghostMesh.grp);

function syncCarMesh() {
  const g = carMesh.grp;
  g.position.set(car.pos[0], car.pos[1], car.pos[2]);
  g.quaternion.set(car.q[0], car.q[1], car.q[2], car.q[3]);
  const rayLen = tuning.suspTravel + tuning.wheelRadius;
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i], p = carMesh.wheels[i];
    const ext = w.contact ? rayLen - w.comp : rayLen;
    p.wg.position.set(p.def.x, JC.Car.MOUNT_Y - ext + tuning.wheelRadius, p.def.z);
    p.wg.rotation.y = -w.steer;
    p.spin.rotation.x = w.spin;
  }
  for (const f of carMesh.flaps) f.rotation.x = -car.flaps * 1.25;
  for (const w of carMesh.wings) {
    const e = car.flaps;
    w.mesh.visible = e > 0.02;
    w.mesh.scale.x = Math.max(0.01, e);
    w.mesh.position.x = w.side * (0.85 + 0.65 * e);
  }
  const jl = car.jetLevel;
  const flick = 0.85 + Math.random() * 0.3;
  carMesh.flame[0].scale.set(1, 0.2 + jl * 1.7 * flick, 1);
  carMesh.flame[0].position.z = -2.5 - (0.2 + jl * 1.7 * flick) / 2 + 0.1;
  carMesh.flame[1].scale.set(1, 0.1 + jl * 1.2 * flick, 1);
  carMesh.flame[1].position.z = -2.5 - (0.1 + jl * 1.2 * flick) / 2 + 0.1;
  carMesh.flame[0].visible = carMesh.flame[1].visible = jl > 0.02;
}

// ---------------- skid marks ----------------
// Ring buffer of dark quads laid on the road behind wheels that slide sideways or lock up.
const skids = (() => {
  const MAX = 5000, W = 0.17;
  const pos = new Float32Array(MAX * 6 * 3), col = new Float32Array(MAX * 6 * 4);
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pa); geo.setAttribute('color', ca);
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);
  let head = 0, count = 0, lo = Infinity, hi = -1;
  const last = [null, null, null, null];
  function add(a, b, na, nb, alphaA, alphaB) {
    const d = M.sub(b, a);
    const sa = M.mul(M.norm(M.cross(d, na)), W), sb = M.mul(M.norm(M.cross(d, nb)), W);
    const lift = 0.025;
    const A0 = M.add(M.add(a, sa), M.mul(na, lift)), A1 = M.add(M.sub(a, sa), M.mul(na, lift));
    const B0 = M.add(M.add(b, sb), M.mul(nb, lift)), B1 = M.add(M.sub(b, sb), M.mul(nb, lift));
    const vs = [A0, A1, B1, A0, B1, B0], al = [alphaA, alphaA, alphaB, alphaA, alphaB, alphaB];
    const o = head * 6;
    for (let i = 0; i < 6; i++) {
      pos.set(vs[i], (o + i) * 3);
      col.set([0.07, 0.07, 0.08, al[i]], (o + i) * 4);
    }
    lo = Math.min(lo, head); hi = Math.max(hi, head);
    head = (head + 1) % MAX; count = Math.min(MAX, count + 1);
  }
  return {
    intensity: 0, // 0..1, how hard the tires are sliding right now (drives the skid sound)
    update() {
      let loudest = 0;
      car.wheels.forEach((w, i) => {
        const slideV = Math.abs(w.slipV || 0), over = Math.abs(w.slip || 0);   // over = slip angle / grip peak
        const rear = !w.front;
        let k = 0;
        if (w.contact && w.cp) {
          // marks only past the grip limit: a grip turn runs the rear tires near 1x their peak slip angle,
          // and full keyboard steering pushes the fronts to ~2.5x (understeer scrub), so those stay clean
          if (slideV > 1.5) k = Math.max(k, rear ? (over - 1.3) / 2 : (over - 3) / 3);
          if (car.drifting && rear) k = Math.max(k, 0.55);                          // drifting rear tires
          if (w.brakeOn && Math.abs(w.longV) > 6) k = Math.max(k, 0.35);           // hard braking
        }
        if (k > loudest) loudest = k;
        if (k <= 0) { last[i] = null; return; }
        const alpha = Math.min(0.75, 0.2 + k * 0.6);
        const p = w.cp, n = w.n;
        const prev = last[i];
        if (prev) {
          const dist = M.len(M.sub(p, prev.p));
          if (dist > 4) { last[i] = { p, n, a: alpha }; return; }   // teleport / jump: start a new streak
          if (dist < 0.3) return;                                    // wait until the wheel moved a bit
          add(prev.p, p, prev.n, n, prev.a, alpha);
        }
        last[i] = { p, n, a: alpha };
      });
      this.intensity = Math.min(1, loudest);
      if (hi >= 0) {
        geo.setDrawRange(0, count * 6);
        for (const attr of [pa, ca]) {
          const isz = attr.itemSize;
          if (attr.clearUpdateRanges) { attr.clearUpdateRanges(); attr.addUpdateRange(lo * 6 * isz, (hi - lo + 1) * 6 * isz); }
          attr.needsUpdate = true;
        }
        lo = Infinity; hi = -1;
      }
    },
    breakStreaks() { last.fill(null); },
    clear() { head = 0; count = 0; last.fill(null); geo.setDrawRange(0, 0); },
  };
})();

// ---------------- input ----------------
const keys = new Set();
const tapped = new Set(); // keys pressed since the last frame, so very short taps still register
const touch = { gas: 0, brake: 0, jet: 0, air: 0, left: 0, right: 0 };
let tilt = { on: false, value: 0 };
let steerKb = 0;
// The player's intents for the sim. Devices (keyboard, touch, gamepad, tilt) are translated into these in updateInput.
const input = { throttle: 0, brake: 0, handbrake: 0, steer: 0, jet: false, airbrake: false, pitch: 0, roll: 0 };

addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault();
  // Alt is the handbrake: keep the browser from treating Alt + a driving key as its own shortcut (where it lets us)
  if (e.altKey && /^(Key[WASDEQ]|Arrow|Shift|Space)/.test(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code === 'KeyR') restart();
    if (e.code === 'Enter' || e.code === 'Backspace') respawn();
    if (e.code === 'KeyT') toggleTune();
    if (e.code === 'KeyC') camMode = (camMode + 1) % CAMS.length;
    if (e.code === 'KeyG') { ghostOn = !ghostOn; toast(ghostOn ? 'Ghost on' : 'Ghost off'); }
    if (e.code === 'KeyM') { audio.muted = !audio.muted; store.set('muted', audio.muted); toast(audio.muted ? 'Sound off' : 'Sound on'); }
    if (e.code === 'KeyH') showStartCard(true);
    if (e.code === 'KeyX') setDriftExit(!isClassicExit());
  }
  keys.add(e.code); tapped.add(e.code);
  audio.start();
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault(); });
addEventListener('blur', () => keys.clear());

const kd = (...c) => c.some((k) => keys.has(k) || tapped.has(k));
function readGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const r = { throttle: b(7), brake: b(6), steer: dz(gp.axes[0] || 0), pitch: dz(gp.axes[1] || 0), jet: b(0) > 0.5, air: b(1) > 0.5, handbrake: b(2), roll: b(5) - b(4) };
    if (gp.buttons[3] && gp.buttons[3].pressed && !gpPrev.y) respawn();
    if (gp.buttons[8] && gp.buttons[8].pressed && !gpPrev.back) restart();
    gpPrev.y = gp.buttons[3] && gp.buttons[3].pressed; gpPrev.back = gp.buttons[8] && gp.buttons[8].pressed;
    if (r.throttle || r.brake || r.handbrake || r.jet || r.air || Math.abs(r.steer) > 0.2) audio.start();
    return r;
  }
  return null;
}
const gpPrev = { y: false, back: false };

function updateInput(dt) {
  const gp = readGamepad();
  const kThr = kd('KeyW', 'ArrowUp') ? 1 : 0, kBrk = kd('KeyS', 'ArrowDown') ? 1 : 0;
  const kSteer = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0) + touch.right - touch.left;
  const rate = kSteer === 0 || Math.sign(kSteer) !== Math.sign(steerKb) ? 9 : 4.5;
  steerKb += Math.max(-rate * dt, Math.min(rate * dt, Math.max(-1, Math.min(1, kSteer)) - steerKb));
  input.throttle = Math.max(kThr, touch.gas, gp ? gp.throttle : 0);
  input.brake = Math.max(kBrk, touch.brake, gp ? gp.brake : 0);
  input.handbrake = Math.max(kd('AltLeft', 'AltRight') ? 1 : 0, gp ? gp.handbrake : 0);
  // every device plays by the same rules: the steering limit applies to keys, sticks and tilt alike
  let steer = steerKb;
  if (tilt.on) steer += tilt.value;
  if (gp && Math.abs(gp.steer) > Math.abs(steer)) steer = gp.steer;
  input.steer = Math.max(-1, Math.min(1, steer));
  input.jet = kd('ShiftLeft', 'ShiftRight') || !!touch.jet || !!(gp && gp.jet);
  input.airbrake = kd('Space') || !!touch.air || !!(gp && gp.air);
  // in the air: W / gas / stick up = nose up (arcade style); "Flight-sim pitch" flips it
  const pitchSign = tuning.airPitchInvert >= 0.5 ? -1 : 1;
  input.pitch = Math.max(-1, Math.min(1, pitchSign * (input.throttle - input.brake - (gp ? gp.pitch : 0))));
  // keyboard: S while steering hard at speed on the ground works as the handbrake (Alt, the real handbrake key,
  // is grabbed by some browsers). S on its own stays the brake / reverse.
  if (kBrk && Math.abs(steerKb) > 0.5 && car.grounded >= 2 && M.dot(car.vel, car.fwd) > 14) {
    input.handbrake = 1; input.brake = Math.max(touch.brake, gp ? gp.brake : 0);
  }
  input.roll = (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0) + (gp ? gp.roll : 0);
  if (!race.started && !race.finished && (input.throttle > 0.1 || input.jet || input.brake > 0.1)) startRun();
  tapped.clear();
}

// touch pads
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch');
  $('pads').hidden = false;
  for (const el of document.querySelectorAll('.pad')) {
    const k = el.dataset.k;
    const on = (e) => { e.preventDefault(); el.setPointerCapture && el.setPointerCapture(e.pointerId); touch[k] = 1; el.classList.add('down'); audio.start(); };
    const off = (e) => { e.preventDefault(); touch[k] = 0; el.classList.remove('down'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  }
  const tb = document.createElement('button');
  tb.className = 'btn'; tb.type = 'button'; tb.id = 'bTilt'; tb.textContent = 'Tilt';
  $('tr').prepend(tb);
  tb.addEventListener('click', async () => {
    if (tilt.on) { tilt.on = false; tb.classList.remove('on'); $('pads').classList.remove('tilt'); return; }
    try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch (e) { /* refused */ }
    let got = false;
    const handler = (e) => {
      if (e.beta === null) return;
      got = true;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let v = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
      tilt.value = Math.max(-1, Math.min(1, (v || 0) / 22));
    };
    addEventListener('deviceorientation', handler);
    setTimeout(() => {
      if (got) { tilt.on = true; tb.classList.add('on'); $('pads').classList.add('tilt'); toast('Tilt steering on'); }
      else { removeEventListener('deviceorientation', handler); toast('Tilt is blocked here. Use the arrows.'); }
    }, 900);
  });
}

// ---------------- audio ----------------
const audio = {
  ctx: null, muted: store.get('muted', false),
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = this.master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
      // jet roar
      this.jetF = ctx.createBiquadFilter(); this.jetF.type = 'bandpass'; this.jetF.frequency.value = 700; this.jetF.Q.value = 0.6;
      this.jetG = ctx.createGain(); this.jetG.gain.value = 0;
      noise().connect(this.jetF).connect(this.jetG).connect(master);
      // wind
      this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 400;
      this.windG = ctx.createGain(); this.windG.gain.value = 0;
      noise().connect(this.windF).connect(this.windG).connect(master);
      // engine
      this.eng = ctx.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 50;
      this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 500;
      this.engG = ctx.createGain(); this.engG.gain.value = 0;
      this.eng.connect(this.engF).connect(this.engG).connect(master); this.eng.start();
      // tire screech: narrow band of noise whose pitch wobbles a little
      this.skidF = ctx.createBiquadFilter(); this.skidF.type = 'bandpass'; this.skidF.frequency.value = 1600; this.skidF.Q.value = 4;
      this.skidG = ctx.createGain(); this.skidG.gain.value = 0;
      const wobble = ctx.createOscillator(), wobbleAmt = ctx.createGain();
      wobble.frequency.value = 23; wobbleAmt.gain.value = 140;
      wobble.connect(wobbleAmt).connect(this.skidF.frequency); wobble.start();
      noise().connect(this.skidF).connect(this.skidG).connect(master);
    } catch (e) { this.ctx = null; }
  },
  update() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const m = this.muted ? 0 : 1, v = car.speed;
    this.master.gain.setTargetAtTime(0.6 * tuning.volMaster, t, k);
    this.jetG.gain.setTargetAtTime(m * tuning.volJet * car.jetLevel * 0.55, t, k);
    this.jetF.frequency.setTargetAtTime(500 + car.jetLevel * 900 + v * 6, t, k);
    this.windG.gain.setTargetAtTime(m * tuning.volWind * Math.min(0.35, v * v * 0.00012 + car.flaps * 0.08), t, k);
    this.windF.frequency.setTargetAtTime(250 + v * 18, t, k);
    const fv = Math.abs(M.dot(car.vel, car.fwd));
    this.eng.frequency.setTargetAtTime(45 + fv * 4.5 + input.throttle * 12, t, k);
    this.engG.gain.setTargetAtTime(m * tuning.volEngine * (0.04 + input.throttle * 0.08) * (car.grounded ? 1 : 0.6), t, k);
    const skid = v > 3 ? skids.intensity : 0;
    this.skidG.gain.setTargetAtTime(m * tuning.volSkid * skid * 0.3, t, 0.03);
    this.skidF.frequency.setTargetAtTime(1300 + Math.min(v, 60) * 10, t, k);
  },
};

// ---------------- HUD ----------------
const fmt = (s) => { if (s == null) return '—'; const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2); };
const fmtD = (d) => (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2);
let best = null; // {time, splits, ghost}
// saved records belong to one layout of a level: rebuilding the track gives it a new layoutId,
// which starts fresh times, ghosts and air records (the old ones are removed)
const bestKey = () => 'best:' + level.name + ':' + track.layoutId;
const airKey = () => 'air:' + level.name + ':' + track.layoutId;
function dropStaleRecords() {
  try {
    const keep = new Set(['jetline:' + bestKey(), 'jetline:' + airKey()]);
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      for (const kind of ['best:', 'air:']) {
        const base = 'jetline:' + kind + level.name;
        if ((k === base || k.startsWith(base + ':')) && !keep.has(k)) stale.push(k);
      }
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch (e) { /* storage unavailable */ }
}
let toastTimer = 0;
function toast(html, ms = 1400) { const t = $('toast'); t.innerHTML = html; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
let cpTotal = 0;
let bestAir = 0;
function updateHud() {
  if (track.free) {
    $('time').textContent = 'Free ride';
    $('cpCount').innerHTML = `Air now <b>${car.grounded ? '0.0' : car.airTime.toFixed(1)}</b> s`;
    $('best').textContent = 'Longest air ' + bestAir.toFixed(1) + ' s';
  } else {
    $('time').textContent = fmt(race.time);
    $('cpCount').innerHTML = `Checkpoint <b>${Math.min(race.next, cpTotal)}</b>/${cpTotal}`;
    $('best').textContent = 'Best ' + (best ? fmt(best.time) : '—');
  }
  $('speed').textContent = Math.round(car.speed * 3.6);
  $('lJet').classList.toggle('on', car.jetLevel > 0.5);
  $('lAir').classList.toggle('on', car.flaps > 0.5);
  $('lDrift').classList.toggle('on', !!car.drifting);
  const unlimited = tuning.jetUnlimited >= 0.5;
  $('fuelFill').style.transform = `scaleX(${unlimited ? 1 : car.fuel})`;
  $('fuel').classList.toggle('inf', unlimited);
  $('fuel').classList.toggle('low', !unlimited && car.fuel < 0.2);
}
function showStartCard(on) { $('card').hidden = !on; $('cardStart').hidden = !on; $('cardEnd').hidden = true; }
$('bHelp').addEventListener('click', () => showStartCard($('card').hidden || $('cardStart').hidden));
$('bRestart').addEventListener('click', (e) => { e.currentTarget.blur(); restart(); });
$('bAgain').addEventListener('click', () => restart());

// ---------------- tuning panel ----------------
// slider definitions: key -> [label, min, max, step]; grouped in the panel like JC.tuningGroups
const SLIDERS = {
  airPitchInvert: ['Flight-sim pitch (1 = S is nose up)', 0, 1, 1],
  volMaster: ['Master volume', 0, 1, 0.05],
  volJet: ['Jet', 0, 1, 0.05],
  volEngine: ['Engine', 0, 1, 0.05],
  volWind: ['Wind', 0, 1, 0.05],
  volSkid: ['Tire skids', 0, 1, 0.05],
  gravity: ['Gravity (m/s²)', 3, 20, 0.1],
  engineForce: ['Engine force (N)', 2000, 30000, 250],
  engineTopSpeed: ['Engine top speed (m/s)', 15, 120, 1],
  rollRes: ['Rolling resistance', 0, 40, 0.5],
  handbrakeGrip: ['Handbrake: locked rear wheels slide with grip', 0.2, 1.2, 0.05],
  jetThrust: ['Jet thrust (N)', 4000, 40000, 500],
  jetUnlimited: ['Unlimited (1 = on)', 0, 1, 1],
  jetCapacity: ['Tank (s of boost)', 1, 20, 0.5],
  jetRecharge: ['Refill time on ground (s)', 2, 40, 1],
  springK: ['Spring stiffness', 6000, 40000, 500],
  damperC: ['Damping', 500, 8000, 100],
  reboundDamping: ['Rebound damping (× damping)', 0.5, 4, 0.05],
  grip: ['Tire grip', 0.6, 3.5, 0.05],
  rearGrip: ['Rear grip ratio', 0.7, 1.6, 0.01],
  slipPeak: ['Slip angle to full grip', 0.03, 0.4, 0.01],
  steerMax: ['Steering angle (rad)', 0.2, 0.9, 0.01],
  steerFalloff: ['Steering falloff with speed', 0, 0.12, 0.002],
  steerLimit: ['Steering limit: front grip (x slip peak, 0 = off)', 0, 3, 0.05],
  steerLimitRear: ['Steering limit: protect rear grip (0 = off)', 0, 10, 0.5],
  dragCoef: ['Air drag', 0.4, 4, 0.05],
  downforce: ['Downforce', 0, 8, 0.1],
  airbrakeDrag: ['Air brake drag', 0, 15, 0.25],
  airbrakeHeight: ['Air brake nose-up lever', -0.5, 1.5, 0.05],
  airbrakeArm: ['Air brake distance behind center', 0, 3, 0.05],
  airbrakeDownforce: ['Air brake extra grip', 0, 16, 0.25],
  wingLift: ['Wing lift (air brakes open)', 0, 40, 0.5],
  bodyLift: ['Body lift', 0, 6, 0.1],
  wingCenter: ['Lift position (− = rear, stable)', -2, 1, 0.05],
  finStability: ['Tail fin stability', 0, 2, 0.05],
  airPitch: ['Pitch control', 0, 12, 0.25],
  airYaw: ['Yaw control', 0, 10, 0.25],
  airRoll: ['Roll control', 0, 10, 0.25],
  airControlBase: ['Control without air brakes or jet', 0, 1, 0.05],
  jetAirControl: ['Air control while the jet fires', 0, 1, 0.05],
  airDamping: ['Rotation damping (every axis)', 0, 4, 0.05],
  driftGrip: ['Rear grip', 0.15, 1, 0.01],
  driftControl: ['Control: 0 = hold turns angle, 1 = steering sets angle', 0, 1, 1],
  driftKick: ['Brake-tap kick angle (rad)', 0, 0.8, 0.01],
  driftSteerRate: ['Angle change speed (rad/s), mode 0', 0.2, 6, 0.05],
  driftTargetAngle: ['Angle at full steering (rad), mode 1', 0.2, 1.1, 0.01],
  driftRecover: ['Countersteer straightens faster (x)', 0, 4, 0.25],
  driftCatch: ['Catch after a drift ends (s, 0 = off)', 0, 1.5, 0.05],
  driftMaxAngle: ['Max angle (rad)', 0.4, 1.4, 0.01],
  driftExitAngle: ['Exit below angle (rad)', 0.02, 0.3, 0.01],
  driftCarveExit: ['Carve kept while straightening out', 0, 1, 0.05],
  driftExitGain: ['Exit: how firmly the car straightens', 1, 6, 0.25],
  driftExitBlend: ['Exit: tires fade back below angle (rad)', 0, 1, 0.01],
  driftCarve: ['Carve into the turn', 0, 5, 0.1],
  driftKeep: ['Speed kept', 0, 1, 0.01],
  driftPower: ['Engine push in a slide', 0, 1.5, 0.05],
  driftMinSpeed: ['Min speed (m/s)', 5, 40, 1],
  autoDrift: ['Auto start (1 = on)', 0, 1, 1],
  autoDriftAngle: ['Auto start slide angle (rad)', 0.05, 0.6, 0.01],
  autoDriftHold: ['Auto start: slide must last (s)', 0, 0.5, 0.01],
  landingMinAir: ['Landing = air time over (s)', 0.1, 1.5, 0.05],
  stability: ['Roll assist (stays flat on banks)', 0, 3, 0.05],
  spinAssist: ['Anti-spin assist (flat ground)', 0, 3, 0.05],
  loopAssist: ['Loop steering assist', 0, 1, 0.05],
};
const PANEL_GROUPS = [
  ['Controls', INPUT_DEFAULTS], ['Sound', SOUND_DEFAULTS], ['Chassis', JC.tuningGroups.chassis], ['Engine & brakes', JC.tuningGroups.engine],
  ['Jet', JC.tuningGroups.jet], ['Suspension', JC.tuningGroups.suspension], ['Tires & steering', JC.tuningGroups.tires],
  ['Aerodynamics', JC.tuningGroups.aero], ['Air control', JC.tuningGroups.airControl], ['Drift', JC.tuningGroups.drift],
  ['Assists', JC.tuningGroups.assists],
];
const fmtVal = (v) => +(+v).toFixed(3);
{
  const rows = $('tuneRows');
  for (const [title, group] of PANEL_GROUPS) {
    const keys = Object.keys(group).filter((k) => SLIDERS[k]);
    if (!keys.length) continue;
    const h = document.createElement('h3'); h.className = 'tuneGroup'; h.textContent = title;
    rows.appendChild(h);
    for (const k of keys) {
      const [label, min, max, step] = SLIDERS[k];
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = `<label for="t_${k}">${label}</label><output id="o_${k}"></output><input id="t_${k}" type="range" min="${min}" max="${max}" step="${step}">`;
      rows.appendChild(r);
      const inp = r.querySelector('input'), out = r.querySelector('output');
      inp.value = tuning[k]; out.textContent = fmtVal(tuning[k]);
      inp.addEventListener('input', () => { tuning[k] = +inp.value; out.textContent = fmtVal(inp.value); saveTuning(); });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
    }
  }
}
// drift exit styles: classic (the default) = no countersteer recovery and no catch, exits are all skill;
// assisted = recovery and a short catch. X switches between them while driving.
const isClassicExit = () => tuning.driftRecover === 0 && tuning.driftCatch === 0;
const ASSISTED_EXIT = { driftRecover: 1, driftCatch: 0.4 };
function setDriftExit(classic) {
  tuning.driftRecover = classic ? 0 : ASSISTED_EXIT.driftRecover;
  tuning.driftCatch = classic ? 0 : ASSISTED_EXIT.driftCatch;
  refreshTuneInputs(); saveTuning();
  toast(classic ? 'Drift exit: classic' : 'Drift exit: assisted');
}
function updateExitButtons() {
  const c = isClassicExit();
  $('bExitClassic').classList.toggle('on', c); $('bExitAssisted').classList.toggle('on', !c);
}
{
  // buttons above the Drift sliders
  const heads = [...document.querySelectorAll('#tuneRows .tuneGroup')];
  const drift = heads.find((h) => h.textContent === 'Drift');
  const box = document.createElement('div'); box.className = 'tuneBtns';
  box.innerHTML = '<button class="btn" id="bExitClassic" type="button">Classic exit</button><button class="btn" id="bExitAssisted" type="button">Assisted exit</button>';
  drift.after(box);
  $('bExitClassic').addEventListener('click', (e) => { e.currentTarget.blur(); setDriftExit(true); });
  $('bExitAssisted').addEventListener('click', (e) => { e.currentTarget.blur(); setDriftExit(false); });
}
function updatePitchHelp() {
  const el = $('pitchHelp');
  if (el) el.textContent = tuning.airPitchInvert >= 0.5 ? 'nose down / nose up' : 'nose up / nose down';
}
updatePitchHelp(); updateExitButtons();
// settings that differ from the defaults
function changedSettings() {
  const diff = {};
  for (const k in ALL_DEFAULTS) if (tuning[k] !== ALL_DEFAULTS[k]) diff[k] = tuning[k];
  return diff;
}
function saveTuning() { updatePitchHelp(); updateExitButtons(); store.set('tuning', changedSettings()); }
function refreshTuneInputs() { for (const k in SLIDERS) { $('t_' + k).value = tuning[k]; $('o_' + k).textContent = fmtVal(tuning[k]); } }
function toggleTune() { const p = $('tune'); p.hidden = !p.hidden; $('bTune').classList.toggle('on', !p.hidden); }
$('bTune').addEventListener('click', (e) => { e.currentTarget.blur(); toggleTune(); });
$('bDefaults').addEventListener('click', () => { Object.assign(tuning, ALL_DEFAULTS); refreshTuneInputs(); saveTuning(); toast('Default handling'); });
$('bCopy').addEventListener('click', () => {
  const diff = changedSettings();
  const text = JSON.stringify(Object.keys(diff).length ? diff : { note: 'defaults' });
  const box = $('copyBox'); box.value = text; box.hidden = false; box.select();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Settings copied'), () => toast('Select the text and copy it'));
  else toast('Select the text and copy it');
});

// ---------------- run control ----------------
let ghostOn = true, ghostRec = [], recTick = 0;
const GHOST_HZ = 30;
function startRun() { race.started = true; showStartCard(false); }
function restart() {
  race.reset(); race.respawnCar(car); ghostRec = []; recTick = 0; skids.breakStreaks();
  for (const g of gateMeshes) g.mat.color.copy(g.base);
  snapCamera(); showStartCard(false); $('card').hidden = true;
  if (!race.started) toast('Go when ready', 900);
}
function respawn() {
  if (race.finished) return;
  race.respawnCar(car); snapCamera(); skids.breakStreaks();
}
function onFinish(time) {
  const prev = best ? best.time : null;
  const isBest = prev == null || time < prev;
  if (isBest) { best = { time, splits: race.splits.slice(), ghost: ghostRec }; store.set(bestKey(), best); }
  $('card').hidden = false; $('cardStart').hidden = true; $('cardEnd').hidden = false;
  $('result').textContent = fmt(time);
  $('resultSub').innerHTML = prev == null ? 'First clean run. Your ghost will race you next time.'
    : isBest ? `<span style="color:var(--good)">New best, ${fmtD(time - prev)}</span>` : `<span style="color:var(--bad)">${fmtD(time - prev)}</span> vs best ${fmt(prev)}`;
}
function handleEvents(evs) {
  for (const e of evs) {
    if (e.type === 'cp') {
      const gm = gateMeshes[e.index]; if (gm) gm.mat.color.set('#5fe08f');
      const ref = best && best.splits ? best.splits[e.index] : null;
      toast(`Checkpoint ${e.index + 1}/${cpTotal} &nbsp; ${fmt(e.time)}` + (ref != null ? ` &nbsp;<span class="d ${e.time <= ref ? 'good' : 'bad'}">${fmtD(e.time - ref)}</span>` : ''));
    } else if (e.type === 'finish') onFinish(e.time);
    else if (e.type === 'fell') { toast(race.next > 0 ? 'Back to checkpoint' : 'Back to start', 900); respawn(); stunt.pitch = stunt.roll = stunt.yaw = stunt.air = 0; }
  }
}

// ---------------- camera ----------------
const CAMS = [{ dist: 8.5, h: 2.6, look: 1.0 }, { dist: 13, h: 4.2, look: 1.2 }, { dist: 5.2, h: 1.7, look: 0.9 }];
let camMode = 0;
const cam = { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), air: 0 };
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), WUP = new THREE.Vector3(0, 1, 0);
function updateCamera(dt, snap) {
  const p = v3(car.pos), fwd = v3(car.fwd), up = v3(car.up);
  const spd = car.speed;
  const airborne = car.grounded === 0 && !car.inLoop;
  // 0 on the ground, eases to 1 in the air (short hops barely move the camera)
  cam.air += ((airborne ? 1 : 0) - cam.air) * (snap ? 1 : 1 - Math.exp(-dt * (airborne ? 2.5 : 4)));
  const want = fwd.clone();
  if (airborne && spd > 4) {
    // in the air follow the flight path, not the car's nose: flips and rolls don't swing the view
    const v = v3(car.vel), hz = new THREE.Vector3(v.x, 0, v.z);
    if (hz.length() > 3) {
      want.copy(hz.normalize());
      want.y = Math.max(-0.6, Math.min(0.35, v.y / spd));   // tilt toward where you'll land
    } else {
      // going (almost) straight up or down, e.g. off a vertical wall: keep the current heading
      want.set(cam.dir.x, 0, cam.dir.z);
      if (want.lengthSq() < 1e-4) want.set(fwd.x, 0, fwd.z);
      want.normalize(); want.y = v.y < 0 ? -0.5 : 0.2;
    }
    want.normalize();
  } else if (car.grounded && spd > 8 && M.dot(car.vel, car.fwd) > 0) {
    want.lerp(v3(car.vel).normalize(), car.drifting ? 0.6 : 0.3).normalize(); // look where you're going in a slide
  }
  cam.dir.lerp(want, snap ? 1 : 1 - Math.exp(-dt * (airborne ? 3.5 : 6))).normalize();
  // horizon: follow the car's tilt only on steep stuff (loops, walls); otherwise keep it level
  const wantUp = car.inLoop || ((car.grounded >= 2) && car.up[1] < 0.85) ? up : WUP;
  cam.up.lerp(wantUp, snap ? 1 : 1 - Math.exp(-dt * (car.grounded ? 4 : 3))).normalize();
  const c = CAMS[camMode];
  // in the air pull back and up a little, and look further ahead along the flight path
  const dist = c.dist + Math.min(4, spd * 0.03) + cam.air * 3;
  const height = c.h + cam.air * 2.2;
  tmp.copy(p).addScaledVector(cam.dir, -dist).addScaledVector(cam.up, height);
  if (snap) camera.position.copy(tmp); else camera.position.lerp(tmp, 1 - Math.exp(-dt * 14));
  camera.up.copy(cam.up);
  tmp2.copy(p).addScaledVector(cam.up, c.look).addScaledVector(cam.dir, 4 + cam.air * (6 + Math.min(14, spd * 0.12)));
  camera.lookAt(tmp2);
  const fov = 68 + Math.min(18, spd * 0.18);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  sun.position.copy(p).addScaledVector(SUN_DIR, 120); sun.target.position.copy(p);
  scene.userData.sky.position.copy(camera.position);
}
function snapCamera() { updateCamera(0, true); }

// ---------------- levels ----------------
function loadLevel(i) {
  levelIdx = i; store.set('level', i);
  level = JC.levels[i];
  track = JC.buildTrack(level);
  race = new JC.Race(track);
  cpTotal = track.gates.filter((g) => !g.finish).length;
  dropStaleRecords();
  best = store.get(bestKey(), null);
  bestAir = store.get(airKey(), 0);
  buildTrackMeshes();
  scene.userData.ground.position.y = track.minY - 160;
  ghostRec = []; recTick = 0;
  race.respawnCar(car);
  skids.clear();
  ghostMesh.grp.visible = false;
  document.querySelectorAll('.lvl').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
  document.body.classList.toggle('free', !!track.free);
  snapCamera();
}
{
  const wrap = $('levels');
  JC.levels.forEach((lv, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn lvl'; b.dataset.i = i;
    b.textContent = lv.name;
    b.addEventListener('click', () => { loadLevel(i); b.blur(); });
    wrap.appendChild(b);
  });
}

// ---------------- stunts (air time, flips, rolls) ----------------
const stunt = { pitch: 0, roll: 0, yaw: 0, air: 0 };
function trackStunts(dt) {
  if (car.grounded === 0 && !car.bodyContact) {
    const w = car.w, f = car.fwd, u = car.up, r = M.cross(f, u);
    stunt.pitch += M.dot(w, r) * dt; stunt.roll += M.dot(w, f) * dt; stunt.yaw += M.dot(w, u) * dt;
    stunt.air = car.airTime;
  } else if (car.grounded >= 3 && stunt.air > 0) {
    if (stunt.air > 0.8) {
      const turns = (a) => Math.floor((Math.abs(a) + 0.6) / (2 * Math.PI));
      const parts = [];
      const fp = turns(stunt.pitch), fr = turns(stunt.roll), fy = Math.floor((Math.abs(stunt.yaw) + 0.5) / Math.PI);
      if (fp) parts.push((fp > 1 ? fp + '× ' : '') + (stunt.pitch > 0 ? 'backflip' : 'frontflip'));
      if (fr) parts.push((fr > 1 ? fr + '× ' : '') + 'barrel roll');
      if (fy) parts.push(fy * 180 + '° spin');
      const isBest = stunt.air > bestAir;
      if (isBest) { bestAir = stunt.air; store.set(airKey(), bestAir); }
      if (track.free || parts.length) toast(`${stunt.air.toFixed(1)} s air` + (parts.length ? ' &nbsp;·&nbsp; ' + parts.join(' + ') : '') + (isBest && track.free ? ' &nbsp;<span class="d good">longest!</span>' : ''), 1800);
    }
    stunt.pitch = stunt.roll = stunt.yaw = stunt.air = 0;
  } else if (car.bodyContact && car.grounded < 2) { stunt.pitch = stunt.roll = stunt.yaw = stunt.air = 0; }
}

// ---------------- loop ----------------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
loadLevel(levelIdx);

let last = performance.now(), acc = 0, stuck = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  updateInput(dt);
  acc += dt;
  while (acc >= DT) {
    car.step(DT, input, track);
    trackStunts(DT);
    handleEvents(race.update(car, DT));
    if (!track.free && race.started && !race.finished && (recTick++ % (240 / GHOST_HZ)) === 0)
      ghostRec.push(...car.pos.map((x) => Math.round(x * 100) / 100), ...car.q.map((x) => Math.round(x * 1e4) / 1e4));
    acc -= DT;
  }
  // stuck on the roof or side: auto respawn
  if (race.started && !race.finished && car.bodyContact && car.grounded < 2 && car.speed < 3) {
    stuck += dt; if (stuck > 2.5) { stuck = 0; toast('Flipped. Back to checkpoint', 900); respawn(); }
  } else stuck = 0;

  // ghost playback
  if (ghostOn && !track.free && best && best.ghost && race.started) {
    const i = Math.floor(race.time * GHOST_HZ) * 7, gd = best.ghost;
    if (i + 6 < gd.length) {
      ghostMesh.grp.visible = true;
      ghostMesh.grp.position.set(gd[i], gd[i + 1], gd[i + 2]);
      ghostMesh.grp.quaternion.set(gd[i + 3], gd[i + 4], gd[i + 5], gd[i + 6]).normalize();
    } else ghostMesh.grp.visible = false;
  } else ghostMesh.grp.visible = false;

  skids.update();
  syncCarMesh();
  updateCamera(dt, false);
  updateHud();
  audio.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
// handy for debugging in the console
window.__jetline = { car, input, tuning, get race() { return race; }, get track() { return track; }, loadLevel };
