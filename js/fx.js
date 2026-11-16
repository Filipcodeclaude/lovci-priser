import * as THREE from 'three';
import { rand } from './util.js';

// Jiskry, prach, sek zbraní, značky na zemi a slova nad příšerou.
export function createFx(G) {
  const scene = G.scene, MAX = 500;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.42, map: G.world.dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; scene.add(pts);
  const ps = [];
  for (let i = 0; i < MAX; i++) ps.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, r: 0, g: 0, b: 0, grav: 0 });
  let cur = 0;
  const c = new THREE.Color();

  function burst(p, hex, n = 10, spd = 4, life = 0.5, grav = 7, spread = 0.2) {
    c.set(hex);
    for (let i = 0; i < n; i++) {
      const q = ps[cur]; const k = cur * 3; cur = (cur + 1) % MAX;
      pos[k] = p.x + rand(-spread, spread); pos[k + 1] = p.y + rand(-spread, spread); pos[k + 2] = p.z + rand(-spread, spread);
      const a = rand(Math.PI * 2), e = rand(-0.2, 1);
      q.vx = Math.cos(a) * spd * rand(0.3, 1); q.vz = Math.sin(a) * spd * rand(0.3, 1); q.vy = e * spd;
      q.life = q.max = life * rand(0.6, 1.2); q.r = c.r; q.g = c.g; q.b = c.b; q.grav = grav;
    }
  }

  // sek zbraní
  const slashes = [];
  function slash(x, y, z, yaw, range, hex, heavy) {
    const g = new THREE.RingGeometry(range * 0.45, range, 14, 1, -0.95, 1.9);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.order = 'YXZ'; m.rotation.y = yaw - Math.PI / 2; m.rotation.x = -Math.PI / 2 + (heavy ? 0.5 : rand(-0.35, 0.35));
    m.position.set(x, y, z); scene.add(m);
    slashes.push({ m, t: 0, dur: heavy ? 0.28 : 0.18 });
  }

  // kruh na zemi (varování před bleskem, dopad)
  const marks = [];
  const ringGeo = new THREE.RingGeometry(0.82, 1, 28);
  function marker(x, z, r, dur, hex) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, G.world.getHeight(x, z) + 0.15, z); m.scale.setScalar(r); scene.add(m);
    const o = { m, t: 0, dur, r };
    marks.push(o);
    return o;
  }

  // slova nad příšerou
  const wordsEl = document.getElementById('words');
  const words = [];
  const v = new THREE.Vector3();
  function word(p, text, cls = '') {
    const el = document.createElement('div');
    el.className = 'word ' + cls; el.textContent = text;
    wordsEl.appendChild(el);
    words.push({ el, x: p.x, y: p.y, z: p.z, t: 0 });
  }

  function update(dt) {
    for (let i = 0; i < MAX; i++) {
      const q = ps[i], k = i * 3;
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { col[k] = col[k + 1] = col[k + 2] = 0; continue; }
      q.vy -= q.grav * dt;
      pos[k] += q.vx * dt; pos[k + 1] += q.vy * dt; pos[k + 2] += q.vz * dt;
      const f = q.life / q.max;
      col[k] = q.r * f; col[k + 1] = q.g * f; col[k + 2] = q.b * f;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    for (let i = slashes.length - 1; i >= 0; i--) {
      const s = slashes[i]; s.t += dt;
      s.m.material.opacity = 0.7 * (1 - s.t / s.dur); s.m.rotation.y -= dt * 9;
      if (s.t >= s.dur) { scene.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); slashes.splice(i, 1); }
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const s = marks[i]; s.t += dt;
      const f = s.t / s.dur;
      s.m.material.opacity = 0.35 + 0.6 * Math.abs(Math.sin(s.t * (6 + f * 14)));
      if (s.t >= s.dur) { scene.remove(s.m); s.m.material.dispose(); marks.splice(i, 1); }
    }
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i]; w.t += dt;
      v.set(w.x, w.y + w.t * 1.2, w.z).project(G.camera);
      w.el.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
      w.el.style.opacity = v.z > 1 ? 0 : Math.min(1, (1.1 - w.t) * 3);
      if (w.t > 1.1) { w.el.remove(); words.splice(i, 1); }
    }
  }
  return { burst, slash, marker, word, update };
}
