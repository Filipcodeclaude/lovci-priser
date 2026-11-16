import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeNoise, fbm, clamp, lerp, smooth, mulberry, TAU, dist2 } from './util.js';
import { REGIONS } from './data.js';
import { buildCamp, buildPickup, buildSpring, buildNest, buildHunter, STATIONS } from './models.js';

const S = 640, SEG = 200, N = SEG + 1, CELL = S / SEG, R = 290;
const RK = ['camp', 'jungle', 'coast', 'swamp', 'rocks'];
const SC = [40, 100, 100, 100, 100];
const W = [0, 0, 0, 0, 0];
const nA = makeNoise(1337), nB = makeNoise(4242), nC = makeNoise(99);

function weights(x, z) {
  let s = 0;
  for (let i = 0; i < 5; i++) {
    const r = REGIONS[RK[i]];
    const d = Math.max(Math.hypot(x - r.x, z - r.z), 2);
    const v = Math.pow(SC[i] / d, 5);
    W[i] = v; s += v;
  }
  for (let i = 0; i < 5; i++) W[i] /= s;
  return W;
}

function rawHeight(x, z) {
  weights(x, z);
  const n1 = fbm(nA, x * 0.006, z * 0.006, 4);
  const n2 = fbm(nB, x * 0.02, z * 0.02, 3);
  const dR = Math.hypot(x - REGIONS.rocks.x, z - REGIONS.rocks.z);
  const ridge = 1 - Math.abs(fbm(nC, x * 0.012 + 7, z * 0.012 - 3, 4));
  const hCamp = 5.5;
  const hJ = 7 + n1 * 6 + n2 * 1.4;
  const hC = 2.4 + n1 * 1.3 + n2 * 0.5;
  const hS = 0.12 + n2 * 0.95;
  const hR = 9 + ridge * ridge * 24 * smooth(22, 75, dR) + n2 * 1.6;
  const h = W[0] * hCamp + W[1] * hJ + W[2] * hC + W[3] * hS + W[4] * hR;
  const rr = Math.hypot(x, z) / R;
  const edge = 1 - smooth(0.7, 1, rr + n1 * 0.05);
  return lerp(-6, h, edge);
}

function part(geo, hex, o = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  let mtx = o.m;
  if (!mtx) {
    const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0];
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : (o.s || [1, 1, 1]);
    mtx = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  }
  g.applyMatrix4(mtx);
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// list vyrůstající z bodu, natočený kolem osy Y a skloněný ven
function frond(geo, hex, top, a, tilt, len, flat = 0.18) {
  const m = new THREE.Matrix4().makeTranslation(...top)
    .multiply(new THREE.Matrix4().makeRotationY(a))
    .multiply(new THREE.Matrix4().makeRotationZ(-tilt))
    .multiply(new THREE.Matrix4().makeTranslation(0, len / 2, 0))
    .multiply(new THREE.Matrix4().makeScale(1, 1, flat));
  return part(geo, hex, { m });
}

export function createWorld(G) {
  const scene = G.scene;
  const rng = mulberry(2024);
  const windU = { time: { value: 0 }, strength: { value: 1 } };

  /* --- terén --- */
  const H = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) H[iz * N + ix] = rawHeight(-S / 2 + ix * CELL, -S / 2 + iz * CELL);

  function getHeight(x, z) {
    const fx = clamp((x + S / 2) / CELL, 0, SEG - 0.001), fz = clamp((z + S / 2) / CELL, 0, SEG - 0.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * N + ix;
    return lerp(lerp(H[i], H[i + 1], tx), lerp(H[i + N], H[i + N + 1], tx), tz);
  }
  const slopeAt = (x, z) => Math.hypot(getHeight(x + 1.5, z) - getHeight(x - 1.5, z), getHeight(x, z + 1.5) - getHeight(x, z - 1.5)) / 3;

  function regionAt(x, z) {
    weights(x, z);
    let b = 1;
    for (let i = 2; i < 5; i++) if (W[i] > W[b]) b = i;
    return W[0] > W[b] ? 'camp' : RK[b];
  }

  const C = {
    camp: new THREE.Color(0x7a6040), jungle: new THREE.Color(0x2f6a26), coast: new THREE.Color(0x8fa84a),
    swamp: new THREE.Color(0x4a5226), rocks: new THREE.Color(0x8a8068), sand: new THREE.Color(0xe6d49a),
    cliff: new THREE.Color(0x6f6a62), mud: new THREE.Color(0x3a3320), rgrass: new THREE.Color(0x7a8446),
  };
  const tgeo = new THREE.PlaneGeometry(S, S, SEG, SEG);
  tgeo.rotateX(-Math.PI / 2);
  const tpos = tgeo.attributes.position;
  const tcol = new Float32Array(N * N * 3);
  const tmp = new THREE.Color();
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const i = iz * N + ix, x = -S / 2 + ix * CELL, z = -S / 2 + iz * CELL, h = H[i];
    tpos.setY(i, h);
    weights(x, z);
    const sl = slopeAt(x, z);
    tmp.setRGB(0, 0, 0);
    const add = (c, w) => { tmp.r += c.r * w; tmp.g += c.g * w; tmp.b += c.b * w; };
    add(C.camp, W[0]); add(C.jungle, W[1]); add(C.coast, W[2]);
    add(h < 0.12 ? C.mud : C.swamp, W[3]);
    add(sl > 0.55 ? C.cliff : (h < 13 ? C.rgrass : C.rocks), W[4]);
    const beach = smooth(1.9, 0.7, h) * (1 - W[3]);
    tmp.lerp(C.sand, beach);
    if (sl > 0.8) tmp.lerp(C.cliff, clamp((sl - 0.8) * 2, 0, 0.8));
    const v = 0.86 + 0.28 * (nB(x * 0.07, z * 0.07) * 0.5 + 0.5) + (rng() - 0.5) * 0.06;
    tcol[i * 3] = tmp.r * v; tcol[i * 3 + 1] = tmp.g * v; tcol[i * 3 + 2] = tmp.b * v;
  }
  tgeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  /* --- voda --- */
  const rip = document.createElement('canvas'); rip.width = rip.height = 256;
  {
    const c = rip.getContext('2d');
    c.fillStyle = '#7fb8c8'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.08 + rng() * 0.22})`; c.lineWidth = 1 + rng() * 2.5;
      const x = rng() * 256, y = rng() * 256, w = 14 + rng() * 40;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y + (rng() - 0.5) * 12, x + w, y); c.stroke();
    }
  }
  const mkRip = (rep) => { const t = new THREE.CanvasTexture(rip); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const seaTex = mkRip(90), seaTex2 = mkRip(55), swTex = mkRip(26);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: 0x3f9fb8, map: seaTex, transparent: true, opacity: 0.82, roughness: 0.2, metalness: 0.15 }));
  sea.rotation.x = -Math.PI / 2; sea.receiveShadow = true; scene.add(sea);
  const sea2 = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: 0xffffff, map: seaTex2, transparent: true, opacity: 0.16, depthWrite: false }));
  sea2.rotation.x = -Math.PI / 2; sea2.position.y = 0.04; scene.add(sea2);
  const swAlpha = document.createElement('canvas'); swAlpha.width = swAlpha.height = 128;
  { const c = swAlpha.getContext('2d'); const gr = c.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, '#fff'); gr.addColorStop(0.75, '#fff'); gr.addColorStop(1, '#000'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }
  const swampWater = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0x55602e, map: swTex, alphaMap: new THREE.CanvasTexture(swAlpha), transparent: true, opacity: 0.9, roughness: 0.35, depthWrite: false }));
  swampWater.rotation.x = -Math.PI / 2; swampWater.position.set(REGIONS.swamp.x, 0.06, REGIONS.swamp.z); scene.add(swampWater);

  /* --- vítr v listí --- */
  function windy(amp) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU.time; sh.uniforms.uWind = windU.strength;
      sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float wph = instanceMatrix[3][0]*0.35 + instanceMatrix[3][2]*0.27;
        #else
          float wph = 0.0;
        #endif
        float wsw = max(position.y, 0.0) * ${amp.toFixed(4)} * uWind;
        transformed.x += sin(uTime*1.6 + wph + position.y*0.4) * wsw;
        transformed.z += cos(uTime*1.25 + wph*1.3) * wsw * 0.7;`);
    };
    return mat;
  }
  const treeMat = windy(0.014), grassMat = windy(0.26), reedMat = windy(0.09), rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

  /* --- překážky --- */
  const grid = new Map();
  const GC = 8;
  function addObstacle(x, z, r) {
    const k = Math.floor(x / GC) + ',' + Math.floor(z / GC);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push({ x, z, r });
  }
  function collide(pos, r) {
    let moved = false;
    const cx = Math.floor(pos.x / GC), cz = Math.floor(pos.z / GC);
    for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
      const cell = grid.get(ax + ',' + az);
      if (!cell) continue;
      for (const o of cell) {
        const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), min = r + o.r;
        if (d < min && d > 0.001) { pos.x = o.x + (dx / d) * min; pos.z = o.z + (dz / d) * min; moved = true; }
      }
    }
    return moved;
  }
  function nearObstacle(x, z, maxD) {
    let best = null, bd = maxD;
    const cx = Math.floor(x / GC), cz = Math.floor(z / GC);
    for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
      const cell = grid.get(ax + ',' + az);
      if (!cell) continue;
      for (const o of cell) { const d = dist2(x, z, o.x, o.z) - o.r; if (d < bd) { bd = d; best = o; } }
    }
    return best;
  }

  /* --- rozmístění rostlin --- */
  const camp = REGIONS.camp;
  const dCamp = (x, z) => dist2(x, z, camp.x, camp.z);
  function scatter(n, test) {
    const out = [];
    let t = 0;
    while (out.length < n && t++ < n * 60) {
      const x = (rng() - 0.5) * S * 0.95, z = (rng() - 0.5) * S * 0.95, h = getHeight(x, z);
      if (h < -0.6) continue;
      weights(x, z);
      const s = test(x, z, h, W);
      if (s) out.push({ x, y: h, z, s, ry: rng() * TAU });
    }
    return out;
  }
  const dummy = new THREE.Object3D(), ic = new THREE.Color();
  function instanced(geo, mat, items, o = {}) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y + (o.dy || 0), it.z);
      dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      dummy.scale.set(it.sx || it.s, it.sy || it.s, it.sz || it.s);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      if (it.c) im.setColorAt(i, it.c);
      else if (o.vary) { const v = 1 - o.vary + rng() * o.vary * 2; ic.setRGB(v * (0.94 + rng() * 0.12), v, v * (0.9 + rng() * 0.15)); im.setColorAt(i, ic); }
    });
    im.castShadow = o.cast !== false; im.receiveShadow = !!o.receive;
    scene.add(im);
    return im;
  }
  const merge = (l) => mergeGeometries(l, false);
  const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const Cyl = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
  const Cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
  const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);

  // stromy džungle
  const treeA = merge([
    part(Cyl(0.22, 0.42, 6), 0x5a4028, { p: [0, 3, 0] }),
    part(Ico(2.4, 1), 0x2f6b2a, { p: [0, 6.8, 0], s: [1, 0.72, 1] }),
    part(Ico(1.7), 0x3d8236, { p: [1.3, 6.2, 0.5] }),
    part(Ico(1.5), 0x4a9440, { p: [-1.1, 7.6, -0.7] }),
  ]);
  const vines = [];
  for (let i = 0; i < 7; i++) { const a = i * 0.9; vines.push(part(Box(0.07, 2.5 + (i % 3), 0.07), 0x5f9a3a, { p: [Math.cos(a) * 3, 10.6 - (i % 3) * 0.5, Math.sin(a) * 3] })); }
  const treeB = merge([
    part(Cyl(0.5, 0.95, 13, 7), 0x4a3524, { p: [0, 6.5, 0] }),
    part(Cone(1.5, 2.4, 5), 0x4a3524, { p: [0, 1.0, 0] }),
    part(Ico(4.3, 1), 0x275c26, { p: [0, 13.8, 0], s: [1, 0.5, 1] }),
    part(Ico(3), 0x347a2e, { p: [2.2, 12.4, 1] , s: [1, 0.7, 1] }),
    part(Ico(2.6), 0x3f8a36, { p: [-2, 15, -1], s: [1, 0.6, 1] }),
    ...vines,
  ]);
  const fr = [];
  for (let i = 0; i < 8; i++) fr.push(frond(Cone(0.45, 3.3, 4), i % 2 ? 0x4f9a3e : 0x3f8a36, [0.55, 6.3, 0], (i / 8) * TAU, 1.75 + (i % 3) * 0.12, 3.3));
  const palm = merge([
    part(Cyl(0.17, 0.22, 2.3), 0x8a6a42, { p: [0, 1.15, 0] }),
    part(Cyl(0.15, 0.17, 2.3), 0x8a6a42, { p: [0.14, 3.3, 0], r: [0, 0, -0.12] }),
    part(Cyl(0.13, 0.15, 2.2), 0x7d5f3a, { p: [0.4, 5.3, 0], r: [0, 0, -0.2] }),
    part(Ico(0.16), 0x4a3520, { p: [0.4, 6.0, 0.2] }), part(Ico(0.16), 0x4a3520, { p: [0.7, 6.0, -0.1] }),
    ...fr,
  ]);
  const roots = [];
  for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; roots.push(part(Cyl(0.07, 0.12, 2.2), 0x3b3226, { p: [Math.cos(a) * 0.7, 0.75, Math.sin(a) * 0.7], r: [Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75] })); }
  const moss = [];
  for (let i = 0; i < 6; i++) { const a = i * 1.1; moss.push(part(Box(0.06, 1.3 + (i % 2) * 0.7, 0.06), 0x7a8a44, { p: [Math.cos(a) * 1.7, 3.9, Math.sin(a) * 1.7] })); }
  const swampTree = merge([
    part(Cyl(0.2, 0.5, 4.6), 0x3b3226, { p: [0.15, 2.9, 0], r: [0, 0, -0.08] }),
    ...roots,
    part(Ico(2), 0x4a5a2a, { p: [0.3, 5.3, 0], s: [1.3, 0.45, 1.3] }),
    part(Ico(1.3), 0x566b30, { p: [1.4, 4.6, 0.5], s: [1.2, 0.5, 1.2] }),
    ...moss,
  ]);
  const pine = merge([
    part(Cyl(0.12, 0.2, 2.2), 0x4a3524, { p: [0, 1.1, 0] }),
    part(Cone(1.3, 2.2, 6), 0x2f4f3a, { p: [0, 2.6, 0] }),
    part(Cone(1.0, 1.9, 6), 0x35593f, { p: [0, 3.7, 0] }),
    part(Cone(0.65, 1.5, 6), 0x3a6146, { p: [0, 4.7, 0] }),
  ]);
  const bush = merge([part(Ico(0.8), 0x3b7a33, { p: [0, 0.6, 0] }), part(Ico(0.6), 0x4c8f3c, { p: [0.6, 0.45, 0.2] }), part(Ico(0.55), 0x337030, { p: [-0.5, 0.5, -0.3] })]);
  const ff = [];
  for (let i = 0; i < 7; i++) ff.push(frond(Cone(0.22, 1.5, 3), i % 2 ? 0x4f9a3e : 0x5aa846, [0, 0.05, 0], (i / 7) * TAU, 0.95, 1.5, 0.2));
  const fern = merge(ff);
  const gb = [];
  for (let i = 0; i < 4; i++) gb.push(part(Cone(0.055, 0.62, 3), 0xffffff, { p: [Math.cos(i * 1.6) * 0.09, 0.3, Math.sin(i * 1.6) * 0.09], r: [Math.sin(i * 1.6) * 0.35, 0, -Math.cos(i * 1.6) * 0.35] }));
  const grass = merge(gb);
  const rd = [];
  for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.14, h = 1.7 + i * 0.25; rd.push(part(Cyl(0.022, 0.03, h, 4), 0x7c8a45, { p: [x, h / 2, i * 0.07] }), part(Cyl(0.05, 0.05, 0.3, 5), 0x5a3a22, { p: [x, h + 0.1, i * 0.07] })); }
  const reed = merge(rd);
  const flower = merge([part(Cyl(0.015, 0.015, 0.4, 4), 0x9ab86a, { p: [0, 0.2, 0] }), part(Ico(0.09), 0xffffff, { p: [0, 0.44, 0] })]);
  const lily = part(new THREE.CircleGeometry(0.5, 7), 0x4f8a3a, { r: [-Math.PI / 2, 0, 0] });
  function rough(geo, amt, hexA, hexB) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
    const a = new THREE.Color(hexA), b = new THREE.Color(hexB), key = new Map();
    for (let i = 0; i < n; i++) {
      const k = p.getX(i).toFixed(2) + p.getY(i).toFixed(2) + p.getZ(i).toFixed(2);
      if (!key.has(k)) key.set(k, [1 + (rng() - 0.5) * amt, rng()]);
      const [f, t] = key.get(k);
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
      tmp.copy(a).lerp(b, t); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  const boulder = rough(Ico(1, 1), 0.38, 0x8a8378, 0x6f6a62);
  const spireG = new THREE.CylinderGeometry(0.4, 1.5, 7, 6, 3); spireG.translate(0, 3.2, 0);
  const spire = rough(spireG, 0.3, 0x80786c, 0x5f5a52);

  const far = (x, z, d) => dCamp(x, z) > d;
  const obst = (items, r) => items.forEach((it) => addObstacle(it.x, it.z, r * it.s));

  const tA = scatter(430, (x, z, h, w) => (w[1] > 0.45 && h > 1.4 && far(x, z, 30) ? 0.8 + rng() * 0.9 : 0));
  const tA2 = scatter(60, (x, z, h, w) => ((w[0] > 0.2 || w[2] > 0.5) && h > 2.6 && far(x, z, 27) && rng() < 0.4 ? 0.7 + rng() * 0.5 : 0));
  instanced(treeA, treeMat, [...tA, ...tA2], { vary: 0.14 }); obst([...tA, ...tA2], 0.45);
  const tB = scatter(70, (x, z, h, w) => (w[1] > 0.6 && h > 2 ? 0.8 + rng() * 0.6 : 0));
  instanced(treeB, treeMat, tB, { vary: 0.1 }); obst(tB, 0.9);
  const pl = scatter(150, (x, z, h, w) => (w[3] < 0.3 && w[4] < 0.4 && h > 0.7 && h < (w[2] > 0.4 ? 5 : 2) && far(x, z, 27) ? 0.75 + rng() * 0.55 : 0));
  instanced(palm, treeMat, pl, { vary: 0.1 }); obst(pl, 0.3);
  const st = scatter(180, (x, z, h, w) => (w[3] > 0.45 && h > -0.3 ? 0.7 + rng() * 0.7 : 0));
  instanced(swampTree, treeMat, st.map((t) => ({ ...t, y: Math.max(t.y, 0) - 0.5 })), { vary: 0.12 }); obst(st, 0.5);
  const pn = scatter(70, (x, z, h, w) => (w[4] > 0.5 && slopeAt(x, z) < 0.5 && h < 24 ? 0.8 + rng() * 0.7 : 0));
  instanced(pine, treeMat, pn, { vary: 0.1 }); obst(pn, 0.35);
  const bs = scatter(520, (x, z, h, w) => (h > 1.5 && w[3] < 0.4 && far(x, z, 22) && (w[1] > 0.4 || rng() < 0.25) && slopeAt(x, z) < 0.6 ? 0.6 + rng() * 0.8 : 0));
  instanced(bush, treeMat, bs, { vary: 0.18 });
  const fn = scatter(560, (x, z, h, w) => ((w[1] > 0.4 || w[3] > 0.5) && h > 0.3 && far(x, z, 20) ? 0.6 + rng() * 0.8 : 0));
  instanced(fern, reedMat, fn, { vary: 0.16 });

  const gcol = { 1: new THREE.Color(0x4f9a3a), 2: new THREE.Color(0x9ab04a), 3: new THREE.Color(0x6a7a34), 4: new THREE.Color(0x8a9450), 0: new THREE.Color(0x7fa046) };
  const gr = scatter(G.lowSpec ? 3500 : 6500, (x, z, h, w) => {
    if (h < 1.1 && w[3] < 0.5) return 0;
    if (h < 0.2 || dCamp(x, z) < 9 || slopeAt(x, z) > 0.6) return 0;
    return 0.8 + rng() * 0.9;
  }).map((it) => {
    weights(it.x, it.z);
    let b = 0; for (let i = 1; i < 5; i++) if (W[i] > W[b]) b = i;
    const c = gcol[b].clone().multiplyScalar(0.8 + rng() * 0.4);
    return { ...it, c, sy: it.s * (0.8 + rng() * 0.7), sx: it.s, sz: it.s };
  });
  instanced(grass, grassMat, gr, { cast: false });
  const rds = scatter(750, (x, z, h, w) => (w[3] > 0.4 && h > -0.3 && h < 0.5 ? 0.7 + rng() * 0.7 : 0));
  instanced(reed, reedMat, rds, { cast: false, vary: 0.12 });
  const fcols = [0xffe36a, 0xff8ab0, 0xffffff, 0xc09aff, 0xff9a4a].map((h) => new THREE.Color(h));
  const fl = scatter(600, (x, z, h, w) => (h > 1.6 && w[3] < 0.3 && w[4] < 0.6 && dCamp(x, z) > 7 ? 0.8 + rng() * 0.6 : 0)).map((it) => ({ ...it, c: fcols[(rng() * fcols.length) | 0] }));
  instanced(flower, grassMat, fl, { cast: false });
  const ll = scatter(220, (x, z, h, w) => (w[3] > 0.5 && h < -0.12 ? 0.6 + rng() * 0.9 : 0)).map((it) => ({ ...it, y: 0.09 }));
  const lilyMesh = instanced(lily, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), ll, { cast: false, vary: 0.12 });

  const bl = scatter(400, (x, z, h, w) => {
    if (dCamp(x, z) < 20) return 0;
    const p = w[4] > 0.4 ? 1 : w[2] > 0.5 ? 0.35 : w[1] > 0.5 ? 0.22 : 0.12;
    return rng() < p ? 0.5 + rng() * rng() * 2.4 : 0;
  }).map((it) => ({ ...it, sx: it.s * (0.8 + rng() * 0.5), sy: it.s * (0.6 + rng() * 0.5), sz: it.s * (0.8 + rng() * 0.5), y: it.y - it.s * 0.15, rx: rng() * 0.5 }));
  instanced(boulder, rockMat, bl, { vary: 0.1, receive: true }); obst(bl, 0.85);
  const sp = scatter(50, (x, z, h, w) => (w[4] > 0.55 ? 0.8 + rng() * 1.2 : 0)).map((it) => ({ ...it, y: it.y - 0.5, rx: (rng() - 0.5) * 0.25, rz: (rng() - 0.5) * 0.25 }));
  instanced(spire, rockMat, sp, { vary: 0.08, receive: true }); obst(sp, 1.2);

  // svítící houby
  const shMat = new THREE.MeshStandardMaterial({ color: 0x9fe8d0, emissive: 0x3fd8b0, emissiveIntensity: 0.3, flatShading: true });
  const shroom = merge([part(Cyl(0.04, 0.06, 0.25, 5), 0xffffff, { p: [0, 0.12, 0] }), part(Cone(0.17, 0.15, 6), 0xffffff, { p: [0, 0.3, 0] })]);
  const shs = scatter(220, (x, z, h, w) => ((w[3] > 0.5 || (w[1] > 0.6 && rng() < 0.3)) && h > 0.1 ? 0.7 + rng() * 1.2 : 0));
  instanced(shroom, shMat, shs, { cast: false });

  /* --- tábor --- */
  const campY = getHeight(camp.x, camp.z);
  const campM = buildCamp();
  campM.group.position.set(camp.x, campY, camp.z);
  scene.add(campM.group);
  const stations = STATIONS.map((s) => ({ ...s, x: camp.x + s.x, z: camp.z + s.z }));
  for (const [x, z, r] of [[0, 0, 1.1], [-8, 8.5, 2.4], [-3.5, 11.5, 2], [-7, -6.3, 1.2], [8, -4, 1.5], [6.5, 7, 0.9], [8.7, 7.7, 0.9], [3.5, -8, 0.3]]) addObstacle(camp.x + x, camp.z + z, r);
  const radovan = buildHunter({ cloth: 0x5a3d2a, cloak: 0x7a2e2e, pants: 0x3a3028, beard: 0xd8d2c4 });
  radovan.group.position.set(camp.x - 5.4, getHeight(camp.x - 5.4, camp.z - 4.4), camp.z - 4.4);
  radovan.group.rotation.y = 0.9;
  radovan.parts.armR.rotation.x = -0.3; radovan.parts.foreR.rotation.x = -1.2; radovan.parts.armL.rotation.x = -0.2; radovan.parts.foreL.rotation.x = -1.3;
  scene.add(radovan.group);
  addObstacle(camp.x - 5.4, camp.z - 4.4, 0.4);

  /* --- zvláštní místa --- */
  function findSpot(cx, cz, rad, ok) {
    for (let r = 0; r < rad; r += 3) for (let a = 0; a < TAU; a += 0.5) {
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (ok(x, z, getHeight(x, z))) return { x, z };
    }
    return { x: cx, z: cz };
  }
  const spring = findSpot(REGIONS.swamp.x + 12, REGIONS.swamp.z - 14, 50, (x, z, h) => h > 0.35 && h < 1.2);
  const springM = buildSpring();
  springM.group.position.set(spring.x, getHeight(spring.x, spring.z), spring.z);
  scene.add(springM.group);
  const pools = [];
  const poolOk = (x, z, h) => h < -0.22 && regionAt(x, z) === 'swamp' && pools.every((p) => dist2(p.x, p.z, x, z) > 35);
  pools.push(findSpot(spring.x, spring.z, 40, (x, z, h) => poolOk(x, z, h) && dist2(x, z, spring.x, spring.z) > 9));
  pools.push(findSpot(REGIONS.swamp.x - 35, REGIONS.swamp.z + 20, 60, poolOk));
  pools.push(findSpot(REGIONS.swamp.x + 10, REGIONS.swamp.z + 45, 60, poolOk));
  let nest = { x: REGIONS.rocks.x, z: REGIONS.rocks.z, h: -1 };
  for (let i = 0; i < 500; i++) {
    const x = REGIONS.rocks.x + (rng() - 0.5) * 110, z = REGIONS.rocks.z + (rng() - 0.5) * 110, h = getHeight(x, z);
    if (h > nest.h && h < 21 && slopeAt(x, z) < 0.45 && regionAt(x, z) === 'rocks') nest = { x, z, h };
  }
  const nestM = buildNest();
  nestM.position.set(nest.x, nest.h, nest.z);
  scene.add(nestM);

  /* --- suroviny ke sbírání --- */
  const pickups = [];
  function addPickups(type, n, test) {
    scatter(n, (x, z, h, w) => (far(x, z, 28) && slopeAt(x, z) < 0.7 && test(w, h) ? 1 : 0)).forEach((it) => {
      const g = buildPickup(type);
      g.position.set(it.x, it.y, it.z); g.rotation.y = it.ry;
      scene.add(g);
      pickups.push({ type, x: it.x, z: it.z, y: it.y, group: g, avail: true, timer: 0, glint: rng() * 2 });
    });
  }
  addPickups('list', 12, (w, h) => w[1] > 0.5 && h > 1.5);
  addPickups('list', 6, (w, h) => w[3] > 0.5 && h > 0.2);
  addPickups('list', 6, (w, h) => w[2] > 0.5 && h > 1.5);
  addPickups('list', 5, (w, h) => w[4] > 0.5 && h < 14);
  addPickups('vlakno', 16, (w, h) => w[1] > 0.5 && h > 1.5);
  addPickups('plod', 10, (w, h) => w[1] > 0.5 && h > 1.5);
  addPickups('plod', 6, (w, h) => w[2] > 0.5 && h > 1.8);
  addPickups('kamen', 5, (w, h) => w[1] > 0.5 && h > 1.5);
  addPickups('kamen', 6, (w, h) => w[2] > 0.5 && h > 0.6);
  addPickups('kamen', 8, (w, h) => w[4] > 0.5);
  addPickups('ruda', 11, (w, h) => w[4] > 0.55);
  addPickups('musle', 14, (w, h) => w[2] > 0.4 && h > 0.3 && h < 1.6);
  addPickups('hliza', 13, (w, h) => w[3] > 0.55 && h > 0.1);

  /* --- motýli / světlušky --- */
  const MO = 70;
  const mgeo = new THREE.BufferGeometry();
  const mpos = new Float32Array(MO * 3), mcol = new Float32Array(MO * 3), mseed = [];
  for (let i = 0; i < MO; i++) mseed.push([rng() * 60 - 30, 0.6 + rng() * 3, rng() * 60 - 30, rng() * TAU, 0.5 + rng()]);
  mgeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  mgeo.setAttribute('color', new THREE.BufferAttribute(mcol, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  { const c = dot.getContext('2d'); const gd = c.createRadialGradient(16, 16, 0, 16, 16, 16); gd.addColorStop(0, '#fff'); gd.addColorStop(0.4, 'rgba(255,255,255,.6)'); gd.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gd; c.fillRect(0, 0, 32, 32); }
  const dotTex = new THREE.CanvasTexture(dot);
  const motes = new THREE.Points(mgeo, new THREE.PointsMaterial({ size: 0.28, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  motes.frustumCulled = false; scene.add(motes);

  /* --- hejna ptáků --- */
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, 0, 0, -0.25, 0.9, 0.1, -0.1, 0, 0, 0.3, -0.9, 0.1, -0.1, 0, 0, -0.25], 3));
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2a30, side: THREE.DoubleSide });
  const flocks = [];
  for (const k of ['jungle', 'coast', 'swamp', 'camp']) {
    const f = { cx: REGIONS[k].x, cz: REGIONS[k].z, a: rng() * TAU, r: 40 + rng() * 30, y: 34 + rng() * 14, birds: [], white: k === 'coast' };
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(birdGeo, k === 'coast' ? new THREE.MeshBasicMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide }) : birdMat); b.userData.o = [rng() * 8 - 4, rng() * 3, rng() * 8 - 4, rng() * TAU]; scene.add(b); f.birds.push(b); }
    flocks.push(f);
  }

  /* --- mapa --- */
  const mapCanvas = document.createElement('canvas'); mapCanvas.width = mapCanvas.height = N;
  {
    const c = mapCanvas.getContext('2d'), img = c.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const h = H[i];
      let r, g, b;
      if (h < 0) { const d = clamp(-h / 6, 0, 1); r = lerp(150, 96, d); g = lerp(178, 140, d); b = lerp(170, 150, d); }
      else { tmp.setRGB(tcol[i * 3], tcol[i * 3 + 1], tcol[i * 3 + 2]).convertLinearToSRGB(); const sh = 0.75 + clamp(h / 30, 0, 0.45); r = lerp(tmp.r * 255 * sh, 205, 0.42); g = lerp(tmp.g * 255 * sh, 185, 0.42); b = lerp(tmp.b * 255 * sh, 140, 0.42); }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }

  function randomPointIn(region, ok) {
    const c = REGIONS[region];
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 80;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, h = getHeight(x, z);
      if (regionAt(x, z) !== region) continue;
      if (ok ? ok(x, z, h) : h > 0.5) return { x, z };
    }
    return { x: c.x, z: c.z };
  }

  let ft = 0;
  function update(dt) {
    const sky = G.sky, p = G.player;
    windU.time.value += dt;
    windU.strength.value = lerp(windU.strength.value, 0.7 + sky.k.rain * 0.9 + sky.k.storm * 1.6, dt);
    const t = windU.time.value;
    seaTex.offset.set(t * 0.004, t * 0.0025); seaTex2.offset.set(-t * 0.006, t * 0.004); swTex.offset.set(t * 0.0012, -t * 0.0008);
    sea.position.y = Math.sin(t * 0.6) * 0.05; sea2.position.y = 0.05 + Math.sin(t * 0.6 + 1) * 0.05;
    // oheň
    ft += dt;
    campM.flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 9 + i * 2) * 0.14, 1 + Math.sin(t * 13 + i) * 0.2, 1 + Math.cos(t * 8 + i) * 0.14); f.rotation.y = t * (1 + i); });
    const night = sky.nightK;
    campM.fireLight.intensity = (22 + night * 46) * (0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23) * 0.07);
    campM.lamps.forEach((l) => { l.emissiveIntensity = 0.3 + night * 2; });
    shMat.emissiveIntensity = 0.15 + night * 1.6;
    springM.water.material.emissiveIntensity = 0.6 + Math.sin(t * 2) * 0.2 + night * 0.6;
    const fp = campM.flag.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) { const x = fp.getX(i); fp.setZ(i, Math.sin(x * 2.4 - t * 5 * windU.strength.value) * 0.16 * x); }
    fp.needsUpdate = true;
    radovan.parts.body.rotation.z = Math.sin(t * 0.7) * 0.02; radovan.parts.head.rotation.y = Math.sin(t * 0.4) * 0.35;
    if (!p) return;
    // suroviny
    for (const pk of pickups) {
      if (!pk.avail) { pk.timer -= dt; if (pk.timer <= 0) { pk.avail = true; pk.group.visible = true; } continue; }
      const d = dist2(pk.x, pk.z, p.pos.x, p.pos.z);
      if (d < 26) { pk.glint -= dt; if (pk.glint <= 0) { pk.glint = 1.3 + Math.random(); G.fx.burst({ x: pk.x, y: pk.y + 0.6, z: pk.z }, 0xfff2a8, 1, 0.4, 0.9, -0.6); } }
    }
    // motýli ve dne, světlušky v noci
    const wet = sky.k.rain + sky.k.storm;
    const mp = motes.geometry.attributes.position, mc = motes.geometry.attributes.color;
    const reg = regionAt(p.pos.x, p.pos.z);
    const lively = reg === 'jungle' || reg === 'swamp' || reg === 'camp' ? 1 : 0.4;
    for (let i = 0; i < MO; i++) {
      const s = mseed[i];
      const x = p.pos.x + ((s[0] + Math.sin(t * 0.3 * s[4] + s[3]) * 6 - p.pos.x % 60 + 90) % 60) - 30;
      const z = p.pos.z + ((s[2] + Math.cos(t * 0.25 * s[4] + s[3]) * 6 - p.pos.z % 60 + 90) % 60) - 30;
      const y = getHeight(x, z) + s[1] + Math.sin(t * 2 * s[4] + s[3]) * 0.5;
      mp.setXYZ(i, x, Math.max(y, 0.4), z);
      const on = i / MO < lively && wet < 0.5;
      if (!on) mc.setXYZ(i, 0, 0, 0);
      else if (night > 0.5) { const b = (0.5 + 0.5 * Math.sin(t * 3 * s[4] + s[3] * 5)) * night; mc.setXYZ(i, 0.8 * b, 1.0 * b, 0.3 * b); }
      else { const b = (1 - night) * 0.55; const h = s[3] % 3; mc.setXYZ(i, (h < 1 ? 1 : 0.5) * b, (h < 2 ? 0.7 : 0.4) * b, (h > 1 ? 0.9 : 0.2) * b); }
    }
    mp.needsUpdate = true; mc.needsUpdate = true;
    // ptáci
    for (const f of flocks) {
      f.a += dt * 0.12;
      const vis = night < 0.6 && wet < 0.7;
      f.birds.forEach((b, i) => {
        b.visible = vis;
        const o = b.userData.o, a = f.a - i * 0.05;
        b.position.set(f.cx + Math.cos(a) * f.r + o[0], f.y + o[1] + Math.sin(t + o[3]) * 1.5, f.cz + Math.sin(a) * f.r + o[2]);
        b.rotation.y = -a; b.scale.set(1.6, 1 + Math.sin(t * 9 + o[3]) * 2.2, 1.6);
      });
    }
  }

  return {
    size: S, radius: R, getHeight, slopeAt, regionAt, collide, nearObstacle, addObstacle, camp: { x: camp.x, z: camp.z, y: campY }, stations,
    pickups, spring, pools, nest, mapCanvas, randomPointIn, update, dotTex,
  };
}
