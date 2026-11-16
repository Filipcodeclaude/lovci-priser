import * as THREE from 'three';
import { clamp, compassName, lerp } from './util.js';
import { BEASTS, TRACK_TEXT } from './data.js';

const MAX = 240;

function tex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.translate(64, 64); draw(x);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blob = (x, cx, cy, rx, ry, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, 7); x.fill(); };

export function createTracks(G) {
  const scene = G.scene, world = G.world;
  const ink = 'rgba(38,26,14,.92)';
  const T = {
    // špička otisku míří nahoru v obrázku = směr chůze
    trnovec: tex((x) => { x.fillStyle = ink; blob(x, 0, 22, 20, 16); blob(x, -22, -14, 10, 24, -0.3); blob(x, 0, -24, 10, 26); blob(x, 22, -14, 10, 24, 0.3); }),
    bahnak: tex((x) => { x.fillStyle = ink; blob(x, 0, 18, 30, 24); for (let i = -2; i <= 2; i++) blob(x, i * 17, -22 - (2 - Math.abs(i)) * 6, 8, 20, i * 0.22); x.globalAlpha = 0.5; x.beginPath(); x.moveTo(-36, -10); x.lineTo(0, -46); x.lineTo(36, -10); x.closePath(); x.fill(); }),
    dravec: tex((x) => { x.strokeStyle = ink; x.lineWidth = 9; x.lineCap = 'round'; for (const a of [-0.55, 0, 0.55]) { x.beginPath(); x.moveTo(0, 8); x.lineTo(Math.sin(a) * 50, 8 - Math.cos(a) * 52); x.stroke(); } x.beginPath(); x.moveTo(0, 8); x.lineTo(0, 44); x.stroke(); x.fillStyle = ink; blob(x, 0, 8, 12, 12); }),
    drag: tex((x) => { x.strokeStyle = ink; x.lineWidth = 22; x.lineCap = 'round'; x.beginPath(); x.moveTo(-6, 54); x.quadraticCurveTo(14, 0, -4, -54); x.stroke(); }),
    scratch: tex((x) => { x.strokeStyle = 'rgba(240,222,180,.95)'; x.lineWidth = 6; x.lineCap = 'round'; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 15 - 6, -40 + Math.abs(i) * 6); x.lineTo(i * 15 + 6, 40 - Math.abs(i) * 8); x.stroke(); } }),
    feather: tex((x) => { x.fillStyle = '#2f4f9a'; x.beginPath(); x.moveTo(0, -58); x.quadraticCurveTo(26, -10, 6, 50); x.lineTo(-6, 50); x.quadraticCurveTo(-26, -10, 0, -58); x.fill(); x.fillStyle = '#6fd0ff'; x.beginPath(); x.moveTo(0, -58); x.quadraticCurveTo(12, -34, 0, -22); x.quadraticCurveTo(-12, -34, 0, -58); x.fill(); x.strokeStyle = '#dfe8ff'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, -50); x.lineTo(0, 60); x.stroke(); }),
    ring: tex((x) => { const g = x.createRadialGradient(0, 0, 30, 0, 0, 62); g.addColorStop(0, 'rgba(255,220,120,0)'); g.addColorStop(0.7, 'rgba(255,224,140,.9)'); g.addColorStop(1, 'rgba(255,220,120,0)'); x.fillStyle = g; x.fillRect(-64, -64, 128, 128); }),
  };
  const plane = new THREE.PlaneGeometry(1, 1);
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), qy = new THREE.Quaternion();
  const SIZE = { trnovec: 0.7, bahnak: 1.5, dravec: 1.4 };
  const list = [];

  function ground(m, x, z, yaw, lift) {
    const h = world.getHeight(x, z);
    nrm.set(world.getHeight(x - 0.6, z) - world.getHeight(x + 0.6, z), 1.2, world.getHeight(x, z - 0.6) - world.getHeight(x, z + 0.6)).normalize();
    q.setFromUnitVectors(up, nrm); qy.setFromAxisAngle(up, yaw);
    m.quaternion.copy(q).multiply(qy);
    m.rotateX(-Math.PI / 2);
    m.position.set(x, Math.max(h, 0.02) + lift, z);
  }

  function add(kind, type, x, z, yaw, o = {}) {
    if (world.getHeight(x, z) < -0.5) return null;
    if (list.length >= MAX) remove(list.find((t) => !t.keep) || list[0]);
    const rain = G.sky.k.rain > 0.5;
    const t = { kind, type, x, z, yaw, age: o.age || 0, life: (rain ? 330 : 210) + (o.keep ? 600 : 0), wet: rain, seen: false, keep: !!o.keep, group: new THREE.Group() };
    let m;
    const mat = (map, op) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    if (type === 'print' || type === 'drag') {
      m = new THREE.Mesh(plane, mat(type === 'drag' ? T.drag : T[kind], rain ? 0.95 : 0.75));
      const s = SIZE[kind] * (type === 'drag' ? 1.6 : 1) * (rain ? 1.15 : 1);
      m.scale.set(s, s, 1);
      ground(m, x, z, yaw + Math.PI, 0.05);
    } else if (type === 'feather') {
      m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: T.feather, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
      m.scale.set(0.9, 1.5, 1);
      ground(m, x, z, yaw, 0.1);
    } else if (type === 'scratch') {
      m = new THREE.Mesh(plane, mat(T.scratch, 0.95));
      m.material.side = THREE.DoubleSide;
      m.scale.set(0.8, 0.9, 1);
      const r = (o.r || 0.4) + 0.04;
      m.position.set(x + Math.sin(yaw) * r, world.getHeight(x, z) + (kind === 'dravec' ? 0.6 : 1.25), z + Math.cos(yaw) * r);
      m.rotation.y = yaw;
      t.x = m.position.x; t.z = m.position.z;
    } else {
      m = new THREE.Group();
      const c = kind === 'bahnak' ? [0xd8d2c4, 0xb8b0a0] : [0xe2557a, 0xf2e3c0];
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: c[i % 2], flatShading: true }));
        b.position.set(Math.cos(i * 1.7) * 0.25, 0.05, Math.sin(i * 1.7) * 0.25); b.rotation.x = i; m.add(b);
      }
      m.position.set(x, world.getHeight(x, z), z);
    }
    t.mesh = m; t.group.add(m);
    const ring = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: T.ring, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(t.x, Math.max(world.getHeight(t.x, t.z), 0) + 0.2, t.z);
    t.ring = ring; t.group.add(ring);
    scene.add(t.group); list.push(t);
    return t;
  }

  function remove(t) {
    const i = list.indexOf(t); if (i < 0) return;
    scene.remove(t.group);
    t.group.traverse((o) => { if (o.material && o.material !== t.ring.material) o.material.dispose(); });
    t.ring.material.dispose();
    list.splice(i, 1);
  }

  function examine(t) {
    const st = G.state, B = BEASTS[t.kind];
    const first = !t.seen;
    t.seen = true;
    let txt = TRACK_TEXT[t.kind][t.type] || TRACK_TEXT[t.kind].print;
    const age = t.age < 45 ? 'Úplně čerstvé.' : t.age < 130 ? 'Pár minut staré.' : 'Starší, okraje už jsou rozmazané.';
    txt += '. ' + age;
    if (t.type === 'print' || t.type === 'drag') txt += ' Míří na ' + compassName(Math.sin(t.yaw), Math.cos(t.yaw)) + '.';
    if (t.wet) txt += ' V mokré zemi jsou vidět krásně.';
    G.audio.sfx('track');
    if (first) {
      const was = st.know[t.kind];
      G.learn(t.kind, 1);
      st.marks.push({ x: Math.round(t.x), z: Math.round(t.z), k: t.kind });
      if (st.marks.length > 40) st.marks.shift();
      G.ui.toast((was === 0 ? 'Nová stopa: ' : B.name + ': ') + txt, 'track');
      G.quests.onEvent('track', { kind: t.kind });
    } else G.ui.toast(txt, 'track');
  }

  // stopa vedoucí od místa A k místu B, ať má hráč čeho se chytit
  function seedTrail(kind, x0, z0, x1, z1, n, types = ['print']) {
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1 || 1), w = Math.sin(i * 2.1) * 5;
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
      const x = lerp(x0, x1, f) + (-dz / l) * w, z = lerp(z0, z1, f) + (dx / l) * w;
      const type = types[i % types.length];
      const yaw = Math.atan2(dx, dz) + Math.sin(i) * 0.3;
      if (type === 'scratch') {
        const o = world.nearObstacle(x, z, 14);
        if (o) { add(kind, 'scratch', o.x, o.z, Math.atan2(x - o.x, z - o.z), { keep: true, r: o.r, age: 60 + (n - i) * 15 }); continue; }
      }
      add(kind, type === 'scratch' ? 'print' : type, x, z, yaw, { keep: true, age: 40 + (n - i) * 18 });
    }
  }

  function nearest(px, pz, maxD) {
    let best = null, bd = maxD;
    for (const t of list) {
      const d = Math.hypot(t.x - px, t.z - pz) + (t.seen ? 1.2 : 0);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  let pulse = 0;
  function update(dt) {
    pulse += dt;
    const p = G.player.pos, rain = G.sky.k.rain > 0.5;
    const reach = 26 * (0.5 + 0.5 * G.sky.vis());
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i];
      t.age += dt;
      if (t.age > t.life) { remove(t); continue; }
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const fade = clamp((t.life - t.age) / 30, 0, 1);
      if (t.mesh.material) t.mesh.material.opacity = (t.wet || rain ? 0.95 : 0.75) * fade;
      const near = clamp(1 - d / reach, 0, 1);
      t.ring.visible = near > 0 && !t.seen;
      if (t.ring.visible) {
        const s = 1.5 + Math.sin(pulse * 3 + t.x) * 0.25;
        t.ring.scale.set(s, s, 1);
        t.ring.material.opacity = near * 0.75 * fade;
      }
    }
  }

  return { list, add, examine, seedTrail, nearest, update, clear() { while (list.length) remove(list[0]); } };
}
