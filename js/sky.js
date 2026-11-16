import * as THREE from 'three';
import { clamp, lerp, rand, TAU } from './util.js';

const HOURS_PER_SEC = 24 / 600; // celý den trvá 10 minut

const KEYS = [
  { t: 0, top: 0x060a1a, hor: 0x121d38, sun: 0x8fa6ff, si: 0.5, hi: 0.5 },
  { t: 4.8, top: 0x060a1a, hor: 0x121d38, sun: 0x8fa6ff, si: 0.5, hi: 0.5 },
  { t: 5.6, top: 0x1c2a52, hor: 0x8a5a5a, sun: 0xff9a6a, si: 0.25, hi: 0.6 },
  { t: 6.8, top: 0x41659c, hor: 0xf2b08a, sun: 0xffb27a, si: 1.6, hi: 0.9 },
  { t: 9, top: 0x3a86d0, hor: 0xbfe3f2, sun: 0xfff1d6, si: 2.9, hi: 1.25 },
  { t: 16, top: 0x3a86d0, hor: 0xbfe3f2, sun: 0xfff1d6, si: 2.9, hi: 1.25 },
  { t: 18.6, top: 0x3b4f8f, hor: 0xf08a5a, sun: 0xff9a5c, si: 1.5, hi: 0.85 },
  { t: 19.7, top: 0x1c2a52, hor: 0x8a4a5a, sun: 0xff7a5a, si: 0.25, hi: 0.6 },
  { t: 20.6, top: 0x060a1a, hor: 0x121d38, sun: 0x8fa6ff, si: 0.5, hi: 0.5 },
  { t: 24, top: 0x060a1a, hor: 0x121d38, sun: 0x8fa6ff, si: 0.5, hi: 0.5 },
];
KEYS.forEach((k) => { k.top = new THREE.Color(k.top); k.hor = new THREE.Color(k.hor); k.sun = new THREE.Color(k.sun); });

const WEATHER = {
  clear: { rain: 0, fog: 0, storm: 0, over: 0, dens: 0.0022 },
  rain: { rain: 1, fog: 0, storm: 0, over: 0.65, dens: 0.0055 },
  fog: { rain: 0, fog: 1, storm: 0, over: 0.5, dens: 0.019 },
  storm: { rain: 1, fog: 0, storm: 1, over: 0.92, dens: 0.0075 },
};

export function createSky(G) {
  const scene = G.scene;
  const top = new THREE.Color(), hor = new THREE.Color(), sunC = new THREE.Color(), grey = new THREE.Color();
  const uni = { top: { value: top }, hor: { value: hor }, sunCol: { value: sunC }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 1 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 14), new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir; uniform float glow; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.5));
        float s = max(dot(d, sunDir),0.0); c += sunCol * (pow(s,500.0)*2.0 + pow(s,14.0)*0.22) * glow;
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a4030, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  const ms = G.lowSpec ? 1024 : 2048;
  sun.shadow.mapSize.set(ms, ms);
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 420 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.35;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.FogExp2(0xbfe3f2, 0.0022);

  // hvězdy
  const sp = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) { const a = Math.random() * TAU, y = Math.random() * 0.95 + 0.03, r = Math.sqrt(1 - y * y); sp[i * 3] = Math.cos(a) * r * 900; sp[i * 3 + 1] = y * 900; sp[i * 3 + 2] = Math.sin(a) * r * 900; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false; scene.add(stars);

  // mraky
  const cc = document.createElement('canvas'); cc.width = cc.height = 128;
  { const c = cc.getContext('2d'); for (let i = 0; i < 9; i++) { const x = 30 + Math.random() * 68, y = 44 + Math.random() * 40, r = 16 + Math.random() * 22; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); } }
  const cloudTex = new THREE.CanvasTexture(cc);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cloudMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * TAU;
    const s = 160 + Math.random() * 220; m.scale.set(s, s * 0.7, 1);
    m.position.set(rand(-700, 700), 170 + Math.random() * 60, rand(-700, 700));
    scene.add(clouds[i] = m);
  }

  // déšť
  const RN = G.lowSpec ? 800 : 1500;
  const rp = new Float32Array(RN * 6), rs = [];
  for (let i = 0; i < RN; i++) rs.push([rand(-28, 28), rand(0, 34), rand(-28, 28), rand(24, 34)]);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xbfd4e8, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false; scene.add(rain);

  // blesk
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  const bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xdfefff, fog: false }));
  bolt.visible = false; bolt.frustumCulled = false; scene.add(bolt);

  const sky = {
    hour: 7, day: 1, weather: 'clear', k: { rain: 0, fog: 0, storm: 0, over: 0, dens: 0.0022 }, nightK: 0,
    flash: 0, nextWeather: rand(70, 110), nextBolt: 6, onLightning: null, onWeather: null,
    isNight() { return sky.hour < 5.5 || sky.hour > 20; },
    // jak daleko je vidět (1 = jasný den)
    vis() { return clamp(1 - sky.k.fog * 0.5 - sky.k.rain * 0.15, 0.4, 1) * (1 - sky.nightK * 0.3); },
    setWeather(w, quiet) {
      if (w === sky.weather) return;
      sky.weather = w; sky.nextWeather = rand(75, 130);
      if (!quiet && sky.onWeather) sky.onWeather(w);
    },
    rollWeather(quiet) {
      const night = sky.isNight();
      const opts = [['clear', 0.42], ['rain', 0.23], ['fog', night ? 0.22 : 0.16], ['storm', 0.17]].filter((o) => o[0] !== sky.weather);
      let r = Math.random() * opts.reduce((s, o) => s + o[1], 0);
      for (const [w, p] of opts) { r -= p; if (r <= 0) { sky.setWeather(w, quiet); return; } }
    },
    skipTo(h) { if (h <= sky.hour) sky.day++; sky.hour = h; },
    update(dt, camPos, focus) {
      sky.hour += dt * HOURS_PER_SEC;
      if (sky.hour >= 24) { sky.hour -= 24; sky.day++; }
      sky.nextWeather -= dt;
      if (sky.nextWeather <= 0) sky.rollWeather();
      const tw = WEATHER[sky.weather], k = sky.k, e = Math.min(1, dt * 0.35);
      for (const n in tw) k[n] = lerp(k[n], tw[n], e);

      // barvy podle hodiny
      let a = KEYS[0], b = KEYS[1];
      for (let i = 0; i < KEYS.length - 1; i++) if (sky.hour >= KEYS[i].t && sky.hour <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
      const f = (sky.hour - a.t) / Math.max(b.t - a.t, 0.001);
      top.copy(a.top).lerp(b.top, f); hor.copy(a.hor).lerp(b.hor, f); sunC.copy(a.sun).lerp(b.sun, f);
      let si = lerp(a.si, b.si, f), hi = lerp(a.hi, b.hi, f);
      const dayK = clamp((hi - 0.5) / 0.75, 0, 1);
      sky.nightK = 1 - dayK;
      const lum = 0.1 + dayK * 0.5;
      grey.setRGB(lum, lum * 1.03, lum * 1.08).multiplyScalar(1 - k.storm * 0.45);
      top.lerp(grey, k.over * 0.9); hor.lerp(grey, k.over * 0.8);
      si *= 1 - k.over * 0.75; hi *= 1 - k.over * 0.25;

      // slunce nebo měsíc
      const day = sky.hour > 5.6 && sky.hour < 19.7;
      const ang = day ? ((sky.hour - 5.6) / 14.1) * Math.PI : (((sky.hour + 24 - 19.7) % 24) / 9.9) * Math.PI;
      const dir = uni.sunDir.value.set(Math.cos(ang), Math.sin(ang) * 0.9 + 0.12, 0.4).normalize();
      uni.glow.value = (day ? 1 : 0.6) * (1 - k.over);
      sun.color.copy(sunC); sun.intensity = si + sky.flash * 6;
      hemi.color.copy(top).lerp(hor, 0.5).lerp(new THREE.Color(0xffffff), 0.35);
      hemi.groundColor.setRGB(0.3, 0.26, 0.2).multiplyScalar(0.4 + dayK * 0.6);
      hemi.intensity = hi + sky.flash * 3;
      sun.position.copy(focus).addScaledVector(dir, 180); sun.target.position.copy(focus);
      scene.fog.color.copy(hor).multiplyScalar(1 + sky.flash * 1.5);
      scene.fog.density = lerp(scene.fog.density, k.dens * (1 + sky.nightK * 0.25), Math.min(1, dt));
      dome.position.copy(camPos);
      stars.position.copy(camPos); stars.material.opacity = sky.nightK * (1 - k.over);
      cloudMat.opacity = 0.32 + k.over * 0.6;
      cloudMat.color.setRGB(1, 1, 1).multiplyScalar((0.25 + dayK * 0.75) * (1 - k.storm * 0.55));
      for (const c of clouds) { c.position.x += dt * (3 + k.storm * 9); if (c.position.x > 750) c.position.x = -750; }

      // déšť
      rain.material.opacity = clamp(k.rain, 0, 1) * 0.5;
      rain.visible = k.rain > 0.03;
      if (rain.visible) {
        const p = rg.attributes.position, wx = 3 + k.storm * 7;
        for (let i = 0; i < RN; i++) {
          const s = rs[i]; s[1] -= s[3] * dt; s[0] += wx * dt * 0.3;
          if (s[1] < -4) { s[1] = 30; s[0] = rand(-28, 28); s[2] = rand(-28, 28); }
          const x = camPos.x + s[0], y = camPos.y + s[1] - 8, z = camPos.z + s[2];
          p.setXYZ(i * 2, x, y, z); p.setXYZ(i * 2 + 1, x + wx * 0.03, y + 0.8, z);
        }
        p.needsUpdate = true;
      }
      // blesky
      sky.flash = Math.max(0, sky.flash - dt * 4);
      if (bolt.visible && sky.flash < 0.35) bolt.visible = false;
      if (k.storm > 0.6) {
        sky.nextBolt -= dt;
        if (sky.nextBolt <= 0) {
          sky.nextBolt = rand(6, 16);
          sky.strike(focus.x + rand(-180, 180), focus.z + rand(-180, 180), rand(0.4, 2.2));
        }
      }
    },
    strike(x, z, delay = 0.3) {
      sky.flash = 1;
      const p = boltGeo.attributes.position;
      const gy = G.world ? Math.max(G.world.getHeight(x, z), 0) : 0;
      for (let i = 0; i < 12; i++) { const t = i / 11; p.setXYZ(i, x + (i === 11 ? 0 : rand(-6, 6) * (1 - t)), lerp(210, gy, t), z + (i === 11 ? 0 : rand(-6, 6) * (1 - t))); }
      p.needsUpdate = true; bolt.visible = true;
      if (sky.onLightning) sky.onLightning(x, z, delay);
    },
  };
  return sky;
}
