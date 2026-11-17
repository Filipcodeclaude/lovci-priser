import * as THREE from 'three';
import { TAU } from './util.js';

const Ico = (r, d = 2) => new THREE.IcosahedronGeometry(r, d);
const Cyl = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
const Cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const Sph = (r) => new THREE.SphereGeometry(r, 8, 6);
const Cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 7);

// vlastní sada materiálů pro jeden model (kvůli bliknutí při zásahu)
function kit() {
  const cache = new Map();
  const mats = [];
  const m = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    if (!cache.has(k)) {
      const mt = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
      cache.set(k, mt); mats.push(mt);
    }
    return cache.get(k);
  };
  return { m, mats };
}

function mesh(geo, mat, x, y, z, parent, shadow = true) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  if (parent) parent.add(o);
  return o;
}

function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/* ---------- lovec ---------- */

export function buildWeapon(id) {
  const { m } = kit();
  const g = new THREE.Group();
  const wood = m(0x5a4028), metal = m(0xb9bcc0, { roughness: 0.4, metalness: 0.6 });
  const along = (o) => { o.rotation.x = Math.PI / 2; return o; };
  if (id === 'cepel') {
    along(mesh(Cyl(0.03, 0.035, 0.2), wood, 0, 0, 0.02, g));
    mesh(Box(0.05, 0.02, 0.78), m(0xe8dcc0, { roughness: 0.5 }), 0, 0, 0.5, g);
    for (let i = 0; i < 4; i++) { const t = mesh(Cone(0.03, 0.12, 4), m(0xe8a23a), 0.04, 0, 0.3 + i * 0.16, g); t.rotation.z = -1.2; }
  } else if (id === 'palice') {
    along(mesh(Cyl(0.035, 0.045, 1.0), wood, 0, 0, 0.4, g));
    const h = mesh(new THREE.DodecahedronGeometry(0.24), m(0x5b4a32), 0, 0, 0.95, g);
    h.scale.set(1, 1, 1.25);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; mesh(Cone(0.06, 0.16, 4), m(0x8a7a4e), Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.95, g).rotation.z = a - Math.PI / 2; }
  } else if (id === 'kopi') {
    along(mesh(Cyl(0.025, 0.03, 2.0), m(0x2f3f73), 0, 0, 0.7, g));
    along(mesh(Cone(0.07, 0.42, 4), m(0x7fe0ff, { emissive: 0x2fa8ff, emissiveIntensity: 1.2 }), 0, 0, 1.9, g));
    mesh(Box(0.02, 0.16, 0.3), m(0x3d56a0), 0, -0.08, 1.5, g);
  } else {
    along(mesh(Cyl(0.03, 0.035, 0.22), wood, 0, 0, 0.02, g));
    mesh(Box(0.16, 0.04, 0.04), metal, 0, 0, 0.14, g);
    mesh(Box(0.07, 0.02, 0.62), metal, 0, 0, 0.46, g);
  }
  return g;
}

export function buildHunter(c = {}) {
  const { m, mats } = kit();
  const col = { cloth: 0x7a4a2a, cloak: 0x3d5a3a, skin: 0xe0b48a, pants: 0x4a3b2c, boots: 0x2c231b, ...c };
  const g = new THREE.Group();
  const body = pivot(g, 0, 0.95, 0);
  const B = pivot(body, 0, -0.95, 0);
  const cloakMat = new THREE.MeshStandardMaterial({ color: col.cloak, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
  mesh(Cap(0.27, 0.42), m(col.cloth), 0, 1.28, 0, B);
  mesh(Cyl(0.29, 0.3, 0.1, 8), m(col.boots), 0, 1.02, 0, B);
  const cl = mesh(new THREE.ConeGeometry(0.44, 1.0, 6, 1, true), cloakMat, 0, 1.12, -0.13, B);
  cl.scale.set(1, 1, 0.75);
  mesh(Box(0.34, 0.36, 0.17), m(0x6b5234), 0, 1.3, -0.3, B);
  const roll = mesh(Cyl(0.09, 0.09, 0.4, 6), m(0x9a8358), 0, 1.54, -0.3, B); roll.rotation.z = Math.PI / 2;

  const head = pivot(B, 0, 1.72, 0);
  mesh(Sph(0.19), m(col.skin), 0, 0, 0, head);
  const hood = mesh(new THREE.SphereGeometry(0.235, 8, 6, 0, TAU, 0, Math.PI * 0.62), cloakMat, 0, 0.01, -0.03, head);
  hood.rotation.x = -0.35;
  if (col.beard) mesh(Cone(0.13, 0.26, 5), m(col.beard), 0, -0.2, 0.1, head).rotation.x = Math.PI;

  const arm = (sx) => {
    const a = pivot(B, sx * 0.36, 1.52, 0);
    mesh(Cap(0.085, 0.3), m(col.cloth), 0, -0.24, 0, a);
    const f = pivot(a, 0, -0.5, 0);
    mesh(Cap(0.072, 0.26), m(col.skin), 0, -0.19, 0, f);
    const h = pivot(f, 0, -0.42, 0);
    return [a, f, h];
  };
  const leg = (sx) => {
    const l = pivot(B, sx * 0.14, 0.95, 0);
    mesh(Cap(0.1, 0.3), m(col.pants), 0, -0.23, 0, l);
    const s = pivot(l, 0, -0.47, 0);
    mesh(Cap(0.088, 0.28), m(col.boots), 0, -0.21, 0, s);
    mesh(Box(0.15, 0.09, 0.28), m(col.boots), 0, -0.44, 0.05, s);
    return [l, s];
  };
  const [armL, foreL] = arm(1);
  const [armR, foreR, hand] = arm(-1);
  const [legL, shinL] = leg(1);
  const [legR, shinR] = leg(-1);
  return { group: g, parts: { body, head, armL, armR, foreL, foreR, legL, legR, shinL, shinR, hand }, mats, cloakMat };
}

/* ---------- Trnovec ---------- */

export function buildTrnovec(alpha = false) {
  const { m, mats } = kit();
  const hide = alpha ? 0x6e5340 : 0x6b7a45, belly = 0xc9b98a, spikeC = alpha ? 0xd9552b : 0xe8a23a, dark = 0x2e2a1e;
  const g = new THREE.Group();
  const body = pivot(g, 0, 1.0, 0);
  mesh(Ico(0.72), m(hide), 0, 0, 0, body).scale.set(1, 0.92, 1.65);
  mesh(Ico(0.6), m(belly), 0, -0.22, 0, body).scale.set(0.9, 0.7, 1.5);
  const spikes = pivot(body, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    for (const sx of [-0.3, 0, 0.3]) {
      if (sx !== 0 && (i === 0 || i === 4)) continue;
      const z = -0.85 + i * 0.42;
      const h = 0.45 + (sx === 0 ? 0.28 : 0) + (i === 2 ? 0.12 : 0);
      const s = mesh(Cone(0.11, h, 5), m(spikeC), sx, 0.55 + h * 0.35 - Math.abs(sx) * 0.45 - Math.abs(z) * 0.12, z, spikes);
      s.rotation.z = -sx * 1.5; s.rotation.x = -0.25;
    }
  }
  const head = pivot(body, 0, 0.08, 1.05);
  mesh(Ico(0.36), m(hide), 0, 0, 0.1, head).scale.set(1, 0.92, 1.2);
  const sn = mesh(Cyl(0.19, 0.25, 0.42, 6), m(belly), 0, -0.08, 0.52, head); sn.rotation.x = Math.PI / 2;
  mesh(Sph(0.07), m(dark), 0, -0.02, 0.74, head);
  const eye = new THREE.MeshStandardMaterial({ color: 0x1a1408, emissive: 0xff5a1f, emissiveIntensity: 0, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    mesh(Sph(0.06), eye, sx * 0.25, 0.12, 0.3, head);
    const hn = mesh(Cone(0.07, 0.5, 5), m(0xeadfc4), sx * 0.2, 0.32, 0.28, head); hn.rotation.x = 0.9; hn.rotation.z = -sx * 0.3;
    const er = mesh(Cone(0.08, 0.2, 4), m(hide), sx * 0.34, 0.2, -0.02, head); er.rotation.z = -sx * 1.1;
  }
  const tail = pivot(body, 0, 0.12, -1.1);
  mesh(Cone(0.12, 0.5, 5), m(hide), 0, 0, -0.2, tail).rotation.x = -Math.PI / 2;
  const legs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const l = pivot(body, sx * 0.42, -0.25, sz * 0.7);
    mesh(Cyl(0.16, 0.11, 0.62, 6), m(hide), 0, -0.3, 0, l);
    mesh(Cyl(0.12, 0.13, 0.16, 6), m(dark), 0, -0.67, 0, l);
    legs.push(l);
  }
  if (alpha) g.scale.setScalar(1.35);
  return { group: g, parts: { body, head, tail, spikes, legs }, eye, mats };
}

/* ---------- Bahňák ---------- */

export function buildBahnak() {
  const { m, mats } = kit();
  const mud = 0x5b4a32, belly = 0x9a8a58, algae = 0x4d6b2a;
  const g = new THREE.Group();
  const body = pivot(g, 0, 0.78, 0);
  mesh(Ico(1), m(mud), 0, 0, 0, body).scale.set(1.45, 0.62, 2.1);
  mesh(Ico(0.9), m(belly), 0, -0.2, 0.1, body).scale.set(1.3, 0.45, 2.0);
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4, r = 0.3 + (i % 3) * 0.3;
    mesh(Ico(0.18 + (i % 2) * 0.1, 0), m(algae), Math.cos(a) * r, 0.52 - r * 0.12, -1.2 + i * 0.32, body);
  }
  for (let i = 0; i < 5; i++) mesh(Cone(0.12, 0.3, 4), m(0x3d3222), 0, 0.68, -1.3 + i * 0.6, body);

  const head = pivot(body, 0, 0.05, 1.85);
  mesh(Ico(0.95), m(mud), 0, 0.1, 0.3, head).scale.set(1.25, 0.46, 1.1);
  const jaw = pivot(head, 0, -0.12, -0.35);
  mesh(Ico(0.9), m(belly), 0, -0.1, 0.62, jaw).scale.set(1.2, 0.28, 1.05);
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + i * 0.37;
    const t = mesh(Cone(0.06, 0.2, 4), m(0xefe6cc), Math.sin(a) * 1.05, -0.08, 0.3 + Math.cos(a) * 0.95, head);
    t.rotation.x = Math.PI;
  }
  const eye = new THREE.MeshStandardMaterial({ color: 0xf2d24a, emissive: 0xf2c21a, emissiveIntensity: 0.6, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    mesh(Sph(0.24), m(mud), sx * 0.55, 0.5, 0.2, head);
    mesh(Sph(0.16), eye, sx * 0.6, 0.58, 0.32, head);
    mesh(Sph(0.07), m(0x14110a), sx * 0.63, 0.6, 0.45, head);
  }
  const legs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const l = pivot(body, sx * 1.2, -0.15, sz * 1.1);
    const th = mesh(Cyl(0.28, 0.22, 0.75, 6), m(mud), sx * 0.2, -0.3, 0, l); th.rotation.z = sx * 0.5;
    mesh(Ico(0.3, 0), m(0x3d3222), sx * 0.42, -0.6, 0.15, l).scale.set(1.2, 0.35, 1.5);
    legs.push(l);
  }
  const tail = [];
  let par = pivot(body, 0, 0, -1.8);
  const sizes = [[0.55, 0.42], [0.42, 0.28], [0.28, 0.1]];
  for (const [a, b] of sizes) {
    const s = mesh(Cyl(b, a, 1.2, 6), m(mud), 0, 0, -0.6, par); s.rotation.x = -Math.PI / 2;
    tail.push(par);
    par = pivot(par, 0, 0, -1.15);
  }
  return { group: g, parts: { body, head, jaw, legs, tail }, eye, mats };
}

/* ---------- Bouřný dravec ---------- */

function wingGeo(pts) {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (let i = 1; i < pts.length - 1; i++) v.push(...pts[0], ...pts[i], ...pts[i + 1]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function buildDravec() {
  const { m, mats } = kit();
  const navy = 0x1f2a4a, wingC = 0x2f3f73, tip = 0x5fb8ff;
  const g = new THREE.Group();
  const body = pivot(g, 0, 1.7, 0);
  mesh(Ico(0.75), m(navy), 0, 0, 0, body).scale.set(1, 0.95, 1.9);
  mesh(Ico(0.55), m(0x3a4a80), 0, -0.25, 0.3, body).scale.set(0.95, 0.7, 1.5);
  const crystal = new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x2fb8ff, emissiveIntensity: 1.2, roughness: 0.2, flatShading: true });
  mesh(new THREE.OctahedronGeometry(0.28), crystal, 0, -0.38, 0.85, body).scale.set(1, 1.3, 0.8);

  const neck = pivot(body, 0, 0.25, 1.2);
  const nk = mesh(Cyl(0.22, 0.34, 1.0, 6), m(navy), 0, 0.3, 0.3, neck); nk.rotation.x = 0.8;
  const head = pivot(neck, 0, 0.7, 0.75);
  mesh(Ico(0.34), m(navy), 0, 0, 0, head).scale.set(1, 0.95, 1.3);
  const bk = mesh(Cone(0.2, 0.9, 4), m(0xe8c25a), 0, -0.05, 0.75, head); bk.rotation.x = Math.PI / 2 + 0.15;
  for (let i = 0; i < 3; i++) { const cr = mesh(Cone(0.07, 0.5 - i * 0.08, 4), m(tip, { emissive: 0x1f7fd8, emissiveIntensity: 0.8 }), 0, 0.3, -0.1 - i * 0.2, head); cr.rotation.x = -0.9; }
  const eye = new THREE.MeshStandardMaterial({ color: 0xfff2a8, emissive: 0xffe24a, emissiveIntensity: 1, roughness: 0.3 });
  for (const sx of [-1, 1]) mesh(Sph(0.07), eye, sx * 0.26, 0.08, 0.22, head);

  const wm = new THREE.MeshStandardMaterial({ color: wingC, roughness: 0.8, flatShading: true, side: THREE.DoubleSide });
  const wt = new THREE.MeshStandardMaterial({ color: tip, emissive: 0x1f7fd8, emissiveIntensity: 0.5, roughness: 0.6, flatShading: true, side: THREE.DoubleSide });
  mats.push(wm, wt);
  const wings = [];
  for (const sx of [1, -1]) {
    const w = pivot(body, sx * 0.55, 0.3, 0.25);
    w.scale.x = sx;
    mesh(wingGeo([[0, 0, 0.95], [3.3, 0, 0.6], [3.5, 0, -1.4], [0, 0, -1.0]]), wm, 0, 0, 0, w);
    mesh(Cyl(0.09, 0.13, 3.3, 5), m(navy), 1.65, 0.03, 0.75, w).rotation.z = Math.PI / 2;
    const o = pivot(w, 3.3, 0, 0);
    mesh(wingGeo([[0, 0, 0.6], [3.6, 0, -0.4], [2.4, 0, -1.5], [0.2, 0, -1.4]]), wm, 0, 0, 0, o);
    mesh(wingGeo([[2.2, 0.01, -0.2], [3.6, 0.01, -0.4], [2.4, 0.01, -1.5]]), wt, 0, 0, 0, o);
    wings.push([w, o]);
  }
  const tail = pivot(body, 0, 0, -1.35);
  mesh(wingGeo([[0, 0, 0.2], [0.9, 0, -1.9], [0, 0, -2.3], [-0.9, 0, -1.9]]), wm, 0, 0, 0, tail);
  mesh(wingGeo([[0, 0.01, -1.4], [0.5, 0.01, -2.0], [0, 0.01, -2.3], [-0.5, 0.01, -2.0]]), wt, 0, 0, 0, tail);
  const legs = [];
  for (const sx of [-1, 1]) {
    const l = pivot(body, sx * 0.38, -0.45, -0.1);
    mesh(Cyl(0.11, 0.07, 1.1, 5), m(0x8a7a4e), 0, -0.55, 0, l);
    for (let i = -1; i <= 1; i++) { const t = mesh(Cone(0.05, 0.36, 4), m(0x2a2a2a), i * 0.12, -1.12, 0.16, l); t.rotation.x = Math.PI / 2; t.rotation.z = -i * 0.4; }
    legs.push(l);
  }
  g.scale.setScalar(1.5);
  return { group: g, parts: { body, neck, head, wings, tail, legs }, eye, crystal, mats };
}

/* ---------- drobná zvířata ---------- */

export function buildCritter(type) {
  const { m, mats } = kit();
  const g = new THREE.Group();
  const body = pivot(g, 0, 0.28, 0);
  if (type === 'slipka') {
    mesh(Ico(0.24, 0), m(0x4a7a78), 0, 0.12, 0, body).scale.set(0.9, 0.9, 1.3);
    mesh(Cyl(0.05, 0.07, 0.3, 5), m(0x4a7a78), 0, 0.36, 0.2, body).rotation.x = 0.4;
    mesh(Ico(0.1, 0), m(0x2f5856), 0, 0.52, 0.28, body);
    mesh(Cone(0.035, 0.16, 4), m(0xe8862a), 0, 0.5, 0.42, body).rotation.x = Math.PI / 2;
    mesh(Cone(0.1, 0.3, 4), m(0x2f5856), 0, 0.18, -0.36, body).rotation.x = -1.2;
    for (const sx of [-1, 1]) mesh(Cyl(0.015, 0.015, 0.3, 4), m(0xe8862a), sx * 0.08, -0.14, 0, body);
  } else {
    const c = type === 'skalnik' ? 0x8f8a82 : 0xb98a56;
    mesh(Ico(0.26, 1), m(c), 0, 0, 0, body).scale.set(0.9, 0.85, 1.25);
    mesh(Ico(0.17, 1), m(c), 0, 0.16, 0.3, body);
    for (const sx of [-1, 1]) { const e = mesh(Cone(0.05, 0.34, 4), m(c), sx * 0.08, 0.42, 0.26, body); e.rotation.z = -sx * 0.25; e.rotation.x = -0.2; }
    mesh(Ico(0.09, 0), m(0xf2ead8), 0, 0.02, -0.34, body);
    mesh(Sph(0.03), m(0x111111), 0, 0.14, 0.47, body);
  }
  return { group: g, parts: { body }, mats };
}

/* ---------- věci ke sbírání ---------- */

export function buildPickup(type) {
  const { m } = kit();
  const g = new THREE.Group();
  if (type === 'list') {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; const l = mesh(Cone(0.12, 0.5, 4), m(0x3fb58a), Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14, g); l.rotation.z = -Math.cos(a) * 0.8; l.rotation.x = Math.sin(a) * 0.8; l.scale.z = 0.3; }
    mesh(Ico(0.07, 0), m(0xffffff, { emissive: 0x9ff5d8, emissiveIntensity: 0.5 }), 0, 0.42, 0, g);
  } else if (type === 'vlakno') {
    for (let i = 0; i < 3; i++) { const t = mesh(new THREE.TorusGeometry(0.22 - i * 0.03, 0.05, 5, 9), m(0x9aa85a), 0, 0.08 + i * 0.1, 0, g); t.rotation.x = Math.PI / 2; }
    mesh(Cyl(0.03, 0.03, 0.5, 4), m(0x7d8a45), 0.2, 0.3, 0, g).rotation.z = 0.5;
  } else if (type === 'plod') {
    mesh(Ico(0.42, 0), m(0x3b7a33), 0, 0.36, 0, g);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; mesh(Sph(0.09), m(0xe2557a, { roughness: 0.4 }), Math.cos(a) * 0.36, 0.3 + (i % 2) * 0.22, Math.sin(a) * 0.36, g); }
  } else if (type === 'kamen') {
    mesh(Ico(0.22, 0), m(0x8f8a82), 0, 0.14, 0, g);
    mesh(Ico(0.16, 0), m(0x7d7469), 0.24, 0.1, 0.1, g);
    mesh(Ico(0.13, 0), m(0x9a948a), -0.1, 0.08, 0.22, g);
  } else if (type === 'ruda') {
    mesh(Ico(0.32, 0), m(0x5f5a55), 0, 0.2, 0, g);
    for (let i = 0; i < 4; i++) { const cr = mesh(new THREE.OctahedronGeometry(0.11), m(i % 2 ? 0xffb14a : 0x58c7ff, { emissive: i % 2 ? 0xff8a1a : 0x1f9fff, emissiveIntensity: 0.9, roughness: 0.2 }), Math.cos(i * 1.7) * 0.2, 0.42 + (i % 2) * 0.1, Math.sin(i * 1.7) * 0.2, g); cr.scale.y = 1.9; cr.rotation.z = Math.cos(i * 1.7) * -0.5; }
  } else if (type === 'musle') {
    for (const sx of [-1, 1]) { const s = mesh(Sph(0.16), m(sx > 0 ? 0xf2e3d0 : 0xf0b8c0, { roughness: 0.3 }), sx * 0.13, 0.05, 0, g); s.scale.set(1, 0.35, 1.2); s.rotation.z = sx * 0.4; }
  } else if (type === 'hliza') {
    mesh(Sph(0.2), m(0x7a4f8a), 0, 0.16, 0, g).scale.y = 0.8;
    mesh(Cone(0.26, 0.2, 7), m(0xb07cff, { emissive: 0x8a4fff, emissiveIntensity: 1 }), 0, 0.42, 0, g);
    mesh(Cyl(0.05, 0.07, 0.2, 5), m(0xd9c8e8), 0, 0.3, 0, g);
  } else {
    // upadlá surovina z příšery
    mesh(new THREE.OctahedronGeometry(0.2), m(0xffe9a8, { emissive: 0xffc24a, emissiveIntensity: 1.1 }), 0, 0.45, 0, g);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildTrap() {
  const { m } = kit();
  const g = new THREE.Group();
  const r = mesh(new THREE.TorusGeometry(0.7, 0.05, 5, 14), m(0x9aa85a), 0, 0.06, 0, g); r.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mesh(Cone(0.05, 0.3, 4), m(0x5a4028), Math.cos(a) * 0.7, 0.15, Math.sin(a) * 0.7, g); }
  return g;
}

export function buildBait() {
  const { m } = kit();
  const g = new THREE.Group();
  mesh(Ico(0.22, 0), m(0xc45a7a), 0, 0.16, 0, g);
  mesh(Ico(0.14, 0), m(0xe8a23a), 0.2, 0.1, 0.08, g);
  mesh(Ico(0.12, 0), m(0xd9698a), -0.12, 0.09, 0.2, g);
  return g;
}

/* ---------- tábor ---------- */

export const STATIONS = [
  { id: 'quests', x: -7, z: -5, label: 'Promluvit s Radovanem (úkoly)' },
  { id: 'craft', x: 8, z: -3, label: 'Dílna' },
  { id: 'gear', x: 6.5, z: 6, label: 'Truhla s výbavou' },
  { id: 'rest', x: -8, z: 6.5, label: 'Stan (odpočinek)' },
];

export function buildCamp() {
  const { m } = kit();
  const g = new THREE.Group();
  const wood = m(0x6b4a2c), dark = m(0x3a2a1a), canvasM = m(0xcdb78c), stone = m(0x8a8378);

  // ohniště
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; mesh(Ico(0.22, 0), stone, Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85, g); }
  for (let i = 0; i < 3; i++) { const l = mesh(Cyl(0.09, 0.1, 1.2, 5), dark, 0, 0.2, 0, g); l.rotation.z = Math.PI / 2 - 0.25; l.rotation.y = i * 1.05; }
  const flames = [];
  const fcols = [0xff7a1a, 0xffb02a, 0xffe07a];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(Cone(0.36 - i * 0.1, 0.95 - i * 0.2, 6), new THREE.MeshBasicMaterial({ color: fcols[i], transparent: true, opacity: 0.9, fog: false }));
    f.position.set(0, 0.6 + i * 0.05, 0); g.add(f); flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff8a3a, 40, 34, 1.8);
  fireLight.position.set(0, 1.4, 0); g.add(fireLight);
  // kotlík
  mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, TAU, Math.PI / 2, Math.PI / 2), m(0x2a2a2a, { metalness: 0.5, roughness: 0.5 }), 1.6, 0.75, 0.4, g);
  for (const dx of [-0.35, 0.35]) mesh(Cyl(0.03, 0.03, 1.1, 4), dark, 1.6 + dx, 0.55, 0.4, g);
  // klády na sezení
  for (const [x, z, r] of [[0, 2.6, 0], [-2.5, 0.6, 1.3], [2.3, -1.8, -0.9]]) { const l = mesh(Cyl(0.3, 0.32, 2.4, 7), wood, x, 0.3, z, g); l.rotation.z = Math.PI / 2; l.rotation.y = r; }

  // stany
  const tent = (x, z, ry, s, c) => {
    const t = pivot(g, x, 0, z); t.rotation.y = ry; t.scale.setScalar(s);
    const cone = mesh(Cone(2.4, 2.9, 4), m(c), 0, 1.45, 0, t); cone.rotation.y = Math.PI / 4;
    const door = mesh(Cone(0.85, 1.9, 3), dark, 0, 0.95, 1.38, t); door.rotation.x = -0.52; door.scale.z = 0.1;
    mesh(Cyl(0.04, 0.04, 3.4, 4), wood, 0, 1.7, 0, t);
  };
  tent(-8, 8.5, 2.6, 1.1, 0xcdb78c);
  tent(-3.5, 11.5, 2.9, 0.9, 0x8a9a6a);

  // nástěnka
  const bd = pivot(g, -7, 0, -6.3); bd.rotation.y = 0.75;
  for (const dx of [-1.1, 1.1]) mesh(Cyl(0.08, 0.09, 2.5, 5), wood, dx, 1.25, 0, bd);
  mesh(Box(2.5, 1.5, 0.1), m(0x7d5a36), 0, 1.6, 0, bd);
  mesh(Box(2.7, 0.14, 0.3), wood, 0, 2.45, 0, bd).rotation.x = 0.2;
  const papers = [[-0.7, 1.85, 0.5, 0.6, 0.08], [0.1, 1.7, 0.55, 0.7, -0.06], [0.8, 1.9, 0.45, 0.5, 0.1], [-0.3, 1.25, 0.6, 0.4, -0.03], [0.7, 1.25, 0.4, 0.45, 0.05]];
  for (const [x, y, w, h, r] of papers) { const p = mesh(Box(w, h, 0.02), m(0xeadfc4), x, y, 0.07, bd, false); p.rotation.z = r; mesh(Sph(0.035), m(0xa4472a), x, y + h / 2 - 0.06, 0.09, bd, false); }

  // dílna
  const wb = pivot(g, 8, 0, -4); wb.rotation.y = -0.5;
  mesh(Box(2.6, 0.14, 1.1), wood, 0, 0.95, 0, wb);
  for (const [x, z] of [[-1.15, -0.4], [1.15, -0.4], [-1.15, 0.4], [1.15, 0.4]]) mesh(Box(0.12, 0.95, 0.12), dark, x, 0.47, z, wb);
  mesh(Box(0.5, 0.3, 0.3), m(0x4a4a4a, { metalness: 0.6, roughness: 0.4 }), -0.6, 1.17, 0, wb);
  mesh(Box(0.08, 0.08, 0.5), wood, 0.2, 1.06, 0.1, wb).rotation.y = 0.5;
  mesh(Box(0.2, 0.14, 0.14), m(0x777777, { metalness: 0.6 }), 0.35, 1.1, -0.08, wb);
  mesh(Ico(0.18, 0), m(0xe8a23a), 0.9, 1.15, 0.2, wb);
  for (const dx of [-1.6, 1.6]) mesh(Cyl(0.06, 0.07, 2.4, 5), wood, dx, 1.2, -0.9, wb);
  mesh(Cyl(0.05, 0.05, 3.3, 5), wood, 0, 2.3, -0.9, wb).rotation.z = Math.PI / 2;
  for (const dx of [-0.9, 0, 0.9]) mesh(Box(0.6, 0.9, 0.04), m(dx === 0 ? 0x6b7a45 : 0x9a8358), dx, 1.75, -0.9, wb);

  // truhla a sudy
  const ch = pivot(g, 6.5, 0, 7); ch.rotation.y = -2.3;
  mesh(Box(1.3, 0.6, 0.8), wood, 0, 0.3, 0, ch);
  const lid = mesh(Cyl(0.4, 0.4, 1.3, 8, 1), m(0x7d5a36), 0, 0.6, 0, ch); lid.rotation.z = Math.PI / 2; lid.scale.y = 1; lid.scale.x = 0.55;
  for (const dx of [-0.45, 0.45]) mesh(Box(0.1, 0.66, 0.84), m(0x3a3a3a, { metalness: 0.6 }), dx, 0.31, 0, ch);
  for (const [x, z] of [[8.3, 8.2], [9.1, 7.2]]) mesh(Cyl(0.42, 0.38, 1.0, 8), m(0x7d5a36), x, 0.5, z, g);

  // stožár s vlajkou
  mesh(Cyl(0.07, 0.1, 6.5, 6), wood, 3.5, 3.25, -8, g);
  const fgeo = new THREE.PlaneGeometry(2.2, 1.2, 8, 3);
  fgeo.translate(1.1, 0, 0);
  const flag = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ color: 0xa4472a, side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(3.55, 5.7, -8); g.add(flag);

  // lucerny
  const lamps = [];
  for (const [x, z] of [[-11, -1], [11, 2], [1, 13], [-2, -11]]) {
    mesh(Cyl(0.06, 0.08, 2.4, 5), wood, x, 1.2, z, g);
    const lm = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84a, emissiveIntensity: 1 });
    mesh(Box(0.24, 0.3, 0.24), lm, x, 2.5, z, g, false); lamps.push(lm);
  }
  // sušák
  for (const dx of [-1, 1]) mesh(Cyl(0.05, 0.05, 2, 4), wood, -12 + dx, 1, 8, g);
  mesh(Cyl(0.04, 0.04, 2.2, 4), wood, -12, 1.9, 8, g).rotation.z = Math.PI / 2;
  mesh(Box(0.7, 0.9, 0.03), m(0x9a8358), -12.3, 1.4, 8, g);

  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return { group: g, flames, fireLight, flag, lamps };
}

export function buildSpring() {
  const { m } = kit();
  const g = new THREE.Group();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; mesh(Ico(0.4 + (i % 3) * 0.12, 0), m(0x8a8f8a), Math.cos(a) * 1.7, 0.2, Math.sin(a) * 1.7, g); }
  mesh(Ico(0.9, 0), m(0x7d8480), -0.4, 0.6, -1.4, g).scale.y = 1.6;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.55, 14), new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x2fb8d8, emissiveIntensity: 0.7, roughness: 0.1, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.22; g.add(water);
  return { group: g, water };
}

export function buildNest() {
  const { m } = kit();
  const g = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const s = mesh(Cyl(0.07, 0.09, 2.2, 4), m(i % 2 ? 0x5a4028 : 0x7d6a4a), Math.cos(a) * 2.6, 0.3 + (i % 3) * 0.12, Math.sin(a) * 2.6, g);
    s.rotation.z = Math.PI / 2; s.rotation.y = -a + Math.PI / 2 + (i % 2 ? 0.3 : -0.3);
  }
  for (let i = 0; i < 4; i++) mesh(new THREE.OctahedronGeometry(0.18), m(0x58c7ff, { emissive: 0x1f9fff, emissiveIntensity: 0.9 }), Math.cos(i * 2) * 1.2, 0.2, Math.sin(i * 2) * 1.2, g);
  return g;
}
