import * as THREE from 'three';
import { clamp, lerp, angDiff, dist2 } from './util.js';
import { buildHunter, buildWeapon } from './models.js';
import { WEAPONS, ARMORS, ITEMS, ITEM_ORDER } from './data.js';

const RUN = 6, SPRINT = 9.3, SNEAK = 2.7, CAMP_R = 40;

export function createPlayer(G) {
  const { world, scene, camera } = G;
  const model = buildHunter();
  scene.add(model.group);
  let W = WEAPONS.tesak, A = ARMORS.kazajka, weaponMesh = null;
  const p = {
    model, pos: new THREE.Vector3(world.camp.x + 1, 0, world.camp.z + 5), yaw: Math.PI, camYaw: Math.PI, camPitch: 0.3,
    hp: 100, maxHp: 100, sta: 100, state: 'idle', t: 0, inv: 0, crouch: false, sprinting: false, lock: null,
    kx: 0, kz: 0, anim: 0, speed: 0, slowT: 0, combo: 0, comboT: 0, queued: false, stepAcc: 0, inCamp: true, stealth: 1,
    staWait: 0, atk: null, use: null, wade: false, msgT: 0,
  };
  const safePos = p.pos.clone();
  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let camInit = false;

  p.equip = () => {
    const st = G.state;
    W = WEAPONS[st.weapon]; A = ARMORS[st.armor];
    const ratio = p.hp / p.maxHp;
    p.maxHp = A.hp; p.hp = Math.min(p.maxHp, Math.max(1, ratio * p.maxHp)); p.stealth = A.stealth;
    if (weaponMesh) model.parts.hand.remove(weaponMesh);
    weaponMesh = buildWeapon(st.weapon);
    model.parts.hand.add(weaponMesh);
    model.cloakMat.color.setHex(A.col);
  };
  const dmgMul = () => (G.state.sharp[G.state.weapon] ? 1.25 : 1);

  p.hurt = (dmg, fx, fz, knock = 5) => {
    if (p.inv > 0 || p.state === 'dead' || p.inCamp) return false;
    p.hp -= dmg * A.def;
    const a = Math.atan2(p.pos.x - fx, p.pos.z - fz);
    p.kx = Math.sin(a) * knock; p.kz = Math.cos(a) * knock;
    p.state = 'stagger'; p.t = 0; p.atk = null; p.use = null; p.inv = 0.7;
    G.audio.sfx('hurt'); G.shake(0.35); G.ui.hurt();
    G.fx.burst({ x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z }, 0xffd0a0, 8, 4, 0.4);
    if (p.hp <= 0) { p.hp = 0; p.state = 'dead'; p.t = 0; p.lock = null; }
    return true;
  };

  function startAttack(kind) {
    const cost = kind === 'heavy' ? 20 : 7;
    if (p.sta < cost * 0.5) { G.audio.sfx('deny'); return; }
    p.sta -= cost; p.staWait = 0.7;
    const mv = G.input.move();
    if (p.lock) p.yaw = Math.atan2(p.lock.pos.x - p.pos.x, p.lock.pos.z - p.pos.z);
    else if (mv.len < 0.2) p.yaw = p.camYaw;
    const n = kind === 'light' ? p.combo : 0;
    const dur = (kind === 'heavy' ? 1.0 : 0.42) * W.spd;
    p.atk = { kind, n, dur, hitAt: dur * (kind === 'heavy' ? 0.55 : 0.45), did: false };
    p.state = 'attack'; p.t = 0; p.queued = false; p.crouch = false;
  }

  function doHit() {
    const a = p.atk, heavy = a.kind === 'heavy';
    const range = W.range + (heavy ? 0.5 : 0);
    let dmg = (heavy ? W.heavy : W.light) * dmgMul() * (a.n === 2 ? 1.35 : 1);
    G.audio.sfx(heavy ? 'swingHeavy' : 'swing');
    G.fx.slash(p.pos.x + Math.sin(p.yaw) * 0.4, p.pos.y + 1.15, p.pos.z + Math.cos(p.yaw) * 0.4, p.yaw, range, heavy ? 0xffd27a : 0xf2f2e0, heavy);
    let any = false;
    for (const c of G.eco.monsters) {
      if (!c.alive || (c.alt || 0) > 3 || c.state === 'hidden' && c.yOff < -0.9 && dist2(c.pos.x, c.pos.z, p.pos.x, p.pos.z) > 3) continue;
      const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, d = Math.hypot(dx, dz) - c.radius;
      if (d > range) continue;
      if (d > 0.6 && Math.abs(angDiff(p.yaw, Math.atan2(dx, dz))) > 1.25) continue;
      const res = G.eco.hit(c, dmg, p.pos, heavy, heavy && W.stun);
      const at = { x: c.pos.x - (dx / (d + c.radius || 1)) * c.radius * 0.7, y: c.model.group.position.y + 1.3, z: c.pos.z - (dz / (d + c.radius || 1)) * c.radius * 0.7 };
      if (res === 'weak') { G.audio.sfx('hitWeak'); G.fx.burst(at, 0xffe24a, 18, 6, 0.5); G.fx.word(at, 'Slabina!', 'weak'); G.hitstop = 0.09; G.shake(0.2); }
      else if (res === 'block') { G.audio.sfx('block'); G.fx.burst(at, 0xcfd8e0, 8, 5, 0.3); G.fx.word(at, 'Odraženo', 'block'); G.ui.hint('block', 'Rány do zad Trnovci nevadí, trny je odrazí. Zkus to zepředu nebo z boku.'); }
      else { G.audio.sfx('hit'); G.fx.burst(at, 0xffb060, 10, 5, 0.4); G.hitstop = heavy ? 0.07 : 0.04; G.shake(heavy ? 0.16 : 0.07); }
      p.lastTarget = c; any = true;
    }
    return any;
  }

  function useItem() {
    const st = G.state, id = st.sel;
    if (!st.items[id]) { G.audio.sfx('deny'); G.ui.toast(`${ITEMS[id].n}: žádný už nemáš.`, 'warn'); return; }
    if (id === 'obklad' && p.hp >= p.maxHp) { G.ui.toast('Zdraví máš plné.', 'warn'); return; }
    if (id !== 'obklad' && p.inCamp) { G.ui.toast('V táboře to nepotřebuješ.', 'warn'); return; }
    p.use = { id, dur: id === 'obklad' ? 1.0 : 0.5 };
    p.state = 'use'; p.t = 0;
  }

  function finishUse() {
    const st = G.state, id = p.use.id;
    st.items[id]--;
    const fx = p.pos.x + Math.sin(p.yaw), fz = p.pos.z + Math.cos(p.yaw);
    if (id === 'obklad') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.45); G.audio.sfx('heal'); G.fx.burst({ x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z }, 0x7fe8b0, 16, 2, 0.9, -2); }
    else if (id === 'past') { G.eco.placeTrap(p.pos.x + Math.sin(p.yaw) * 1.5, p.pos.z + Math.cos(p.yaw) * 1.5); G.audio.sfx('craft', 0.6); G.ui.hint('trap', 'Past leží. Teď do ní příšeru naveď, třeba tak, že budeš stát za ní.'); }
    else if (id === 'navnada') { G.eco.placeBait(p.pos.x + Math.sin(p.yaw) * 2, p.pos.z + Math.cos(p.yaw) * 2); G.audio.sfx('pickup'); G.ui.hint('bait', 'Návnada voní. Ustup a schovej se, ať příšera přijde.'); }
    else if (id === 'traskavka') { G.audio.sfx('swing'); const tx = fx + Math.sin(p.yaw) * 8, tz = fz + Math.cos(p.yaw) * 8; setTimeout(() => G.eco.bang(tx, tz), 420); }
    G.ui.refresh();
  }

  function lockToggle() {
    if (p.lock) { p.lock = null; return; }
    let best = null, bs = 1e9;
    for (const c of G.eco.monsters) {
      if (!c.alive || (c.state === 'hidden' && !c.aware)) continue;
      const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 45) continue;
      const s = d + Math.abs(angDiff(p.camYaw, Math.atan2(dx, dz))) * 18;
      if (s < bs) { bs = s; best = c; }
    }
    p.lock = best;
    G.audio.sfx(best ? 'ui' : 'deny');
  }

  function animate(dt) {
    const P = model.parts, s = p.state, e = Math.min(1, dt * 14);
    const mv = clamp(p.speed / RUN, 0, 1.5);
    p.anim += dt * (2 + p.speed * 1.55);
    const sw = Math.sin(p.anim) * Math.min(mv, 1.2);
    let by = 0.95, bx = mv * 0.1, bry = 0, aLx = sw * 0.8, aRx = -0.35 - sw * 0.3, aRz = 0, fLx = -0.35, fRx = -0.75;
    let lLx = -sw * 0.85, lRx = sw * 0.85, sLx = Math.max(0, Math.sin(p.anim + 1.2)) * mv * 1.1, sRx = Math.max(0, Math.sin(p.anim + 1.2 + Math.PI)) * mv * 1.1, hx = 0;
    let snap = e;
    if (p.crouch) { by = 0.62; bx = 0.4; lLx -= 0.8; lRx -= 0.8; sLx += 1.3; sRx += 1.3; hx = -0.3; }
    if (s === 'attack') {
      const a = p.atk, k = p.t / a.dur, h = a.hitAt / a.dur;
      const w = clamp(k / h, 0, 1), f = clamp((k - h) / 0.22, 0, 1);
      snap = 1;
      if (a.kind === 'heavy') { aRx = lerp(-1.2, -3.0, w) + f * 2.9; aLx = aRx; fRx = -0.3; fLx = -0.3; bx = lerp(0, -0.3, w) + f * 0.75; }
      else if (a.n === 1) { aRx = -1.5; fRx = -0.2; aRz = lerp(-0.3, -1.3, w) + f * 2.4; bry = lerp(0, -0.5, w) + f * 1.0; }
      else { aRx = lerp(-1.2, -2.8, w) + f * 2.7; fRx = -0.25; bx = lerp(0, -0.15, w) + f * 0.4; if (a.n === 2) bry = k * Math.PI * 2; }
    } else if (s === 'dodge') { snap = 1; bx = (p.t / 0.48) * Math.PI * 2; by = 0.55; lLx = -1.4; lRx = -1.4; sLx = 1.8; sRx = 1.8; aLx = -1; aRx = -1; }
    else if (s === 'stagger') { bx = -0.4; aLx = -1.2; aRx = -1.2; }
    else if (s === 'use') { aLx = -1.7; fLx = -1.7; hx = 0.2; }
    else if (s === 'dead') { bx = -1.5; by = 0.28; aLx = -0.4; aRx = -0.4; lLx = lRx = 0; sLx = sRx = 0; snap = Math.min(1, dt * 6); }
    P.body.position.y = lerp(P.body.position.y, by, snap);
    P.body.rotation.x = s === 'dodge' ? bx : lerp(P.body.rotation.x % (Math.PI * 2), bx, snap);
    P.body.rotation.y = lerp(P.body.rotation.y, bry, snap);
    P.armL.rotation.x = lerp(P.armL.rotation.x, aLx, snap); P.armR.rotation.x = lerp(P.armR.rotation.x, aRx, snap);
    P.armR.rotation.z = lerp(P.armR.rotation.z, aRz, snap);
    P.foreL.rotation.x = lerp(P.foreL.rotation.x, fLx, snap); P.foreR.rotation.x = lerp(P.foreR.rotation.x, fRx, snap);
    P.legL.rotation.x = lerp(P.legL.rotation.x, lLx, snap); P.legR.rotation.x = lerp(P.legR.rotation.x, lRx, snap);
    P.shinL.rotation.x = lerp(P.shinL.rotation.x, sLx, snap); P.shinR.rotation.x = lerp(P.shinR.rotation.x, sRx, snap);
    P.head.rotation.x = lerp(P.head.rotation.x, hx, e);
  }

  function updateCamera(dt, snapCam) {
    const touch = G.input.isTouch;
    const dist = (touch ? 7.6 : 6.6) * (p.lock ? 1.12 : 1);
    if (p.lock) {
      const want = Math.atan2(p.lock.pos.x - p.pos.x, p.lock.pos.z - p.pos.z);
      p.camYaw += angDiff(p.camYaw, want) * Math.min(1, dt * 4.5);
      const hd = (p.lock.model.group.position.y - p.pos.y);
      p.camPitch = lerp(p.camPitch, clamp(0.4 - hd * 0.035, -0.2, 0.5), Math.min(1, dt * 2));
    }
    const cp = Math.cos(p.camPitch), sx = Math.sin(p.camYaw), cz = Math.cos(p.camYaw);
    const side = p.lock ? 1.5 : 0.55;
    camTarget.set(p.pos.x - cz * side, p.pos.y + (p.crouch ? 1.3 : 1.7), p.pos.z + sx * side);
    const want = new THREE.Vector3(camTarget.x - sx * cp * dist, camTarget.y + Math.sin(p.camPitch) * dist, camTarget.z - cz * cp * dist);
    // kamera nesmí skončit uvnitř kmene nebo skály
    if (world.collide(want, 0.9)) {
      const back = Math.hypot(want.x - camTarget.x, want.z - camTarget.z);
      if (back < dist * cp * 0.55) { want.x = lerp(camTarget.x, want.x, 0.5); want.z = lerp(camTarget.z, want.z, 0.5); }
    }
    const gy = Math.max(world.getHeight(want.x, want.z), 0) + 0.7;
    if (want.y < gy) want.y = gy;
    if (!camInit || snapCam) { camPos.copy(want); camInit = true; } else camPos.lerp(want, Math.min(1, dt * 14));
    camera.position.copy(camPos);
    if (G.shakeAmt > 0.001) camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(G.shakeAmt));
    camera.lookAt(camTarget);
  }

  p.respawn = () => {
    p.pos.set(world.camp.x + 1, 0, world.camp.z + 5); safePos.copy(p.pos);
    p.hp = p.maxHp; p.sta = 100; p.state = 'idle'; p.kx = p.kz = 0; p.yaw = p.camYaw = Math.PI; p.lock = null; p.slowT = 0;
    camInit = false;
  };

  p.update = (dt) => {
    const inp = G.input, st = G.state;
    const [lx, ly] = inp.look();
    const sens = inp.isTouch ? 0.0021 : 0.0024;
    p.camYaw -= lx * sens; p.camPitch = clamp(p.camPitch + ly * sens * 0.85, -0.3, 1.25);
    p.t += dt; p.inv = Math.max(0, p.inv - dt); p.slowT = Math.max(0, p.slowT - dt); p.msgT -= dt;
    p.comboT -= dt; if (p.comboT <= 0) p.combo = 0;
    for (let i = 0; i < 4; i++) if (inp.hit('item' + (i + 1))) { st.sel = ITEM_ORDER[i]; G.ui.refresh(); G.audio.sfx('ui'); }
    if (inp.hit('next')) { st.sel = ITEM_ORDER[(ITEM_ORDER.indexOf(st.sel) + 1) % 4]; G.ui.refresh(); G.audio.sfx('ui'); }
    if (inp.hit('lock')) lockToggle();
    if (p.lock && (!p.lock.alive || dist2(p.lock.pos.x, p.lock.pos.z, p.pos.x, p.pos.z) > 55)) p.lock = null;

    const mv = inp.move();
    const fx = Math.sin(p.camYaw), fz = Math.cos(p.camYaw);
    let dx = fx * mv.y - fz * mv.x, dz = fz * mv.y + fx * mv.x;
    const h0 = world.getHeight(p.pos.x, p.pos.z);
    p.wade = h0 < -0.08;
    let vx = 0, vz = 0;
    p.sprinting = false;

    if (p.state === 'dead') {
      if (p.t > 2.6) G.onDeath();
    } else if (p.state === 'idle') {
      if (inp.hit('crouch')) { p.crouch = !p.crouch; G.audio.sfx('ui', 0.6); }
      const wantSprint = inp.sprint() && mv.len > 0.2 && p.sta > 1 && !p.crouch;
      p.sprinting = wantSprint;
      let spd = (p.crouch ? SNEAK : wantSprint ? SPRINT : RUN) * W.move;
      if (p.slowT > 0) spd *= 0.55;
      if (p.wade && !A.mud) spd *= 0.72;
      if (mv.len > 0.1) {
        p.yaw += angDiff(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
        vx = dx * spd; vz = dz * spd;
      }
      if (wantSprint) { p.sta -= 13 * dt; p.staWait = 0.5; }
      if (inp.hit('dodge')) {
        if (p.sta >= 15) {
          p.sta -= 20; p.staWait = 0.8; p.state = 'dodge'; p.t = 0; p.inv = 0.36; p.crouch = false;
          const a = mv.len > 0.2 ? Math.atan2(dx, dz) : p.yaw + Math.PI;
          p.dx = Math.sin(a); p.dz = Math.cos(a); if (mv.len > 0.2) p.yaw = a;
          G.audio.sfx('dodge');
        } else G.audio.sfx('deny');
      } else if (inp.hit('light')) startAttack('light');
      else if (inp.hit('heavy')) startAttack('heavy');
      else if (inp.hit('use')) useItem();
    } else if (p.state === 'attack') {
      const a = p.atk;
      if (p.lock) p.yaw += angDiff(p.yaw, Math.atan2(p.lock.pos.x - p.pos.x, p.lock.pos.z - p.pos.z)) * Math.min(1, dt * 6);
      if (p.t < a.hitAt) { const l = a.kind === 'heavy' ? 2.2 : 3.2; vx = Math.sin(p.yaw) * l; vz = Math.cos(p.yaw) * l; }
      if (!a.did && p.t >= a.hitAt) { a.did = true; doHit(); }
      if (inp.hit('light') && a.kind === 'light') p.queued = true;
      if (inp.hit('dodge') && a.did && p.sta >= 15) { p.atk = null; p.state = 'idle'; inp.clear(); }
      else if (p.t >= a.dur) {
        const n = a.n; p.atk = null; p.state = 'idle';
        if (a.kind === 'light') { p.combo = (n + 1) % 3; p.comboT = 0.55; if (p.queued && n < 2) startAttack('light'); }
      }
      inp.hit('heavy'); inp.hit('use');
    } else if (p.state === 'dodge') {
      const v = 12.5 * (1 - (p.t / 0.48) * 0.55);
      vx = p.dx * v; vz = p.dz * v;
      if (p.t >= 0.48) p.state = 'idle';
    } else if (p.state === 'stagger') {
      if (p.t > 0.45) p.state = 'idle';
    } else if (p.state === 'use') {
      vx = dx * 1.8; vz = dz * 1.8;
      if (p.t >= p.use.dur) { finishUse(); p.use = null; p.state = 'idle'; }
    }
    if (p.state !== 'idle') { inp.hit('crouch'); }

    p.staWait -= dt;
    if (p.staWait <= 0 && !p.sprinting) p.sta = Math.min(100, p.sta + 24 * A.regen * dt);
    p.sta = Math.max(0, p.sta);
    if (p.inCamp && p.state !== 'dead') p.hp = Math.min(p.maxHp, p.hp + 6 * dt);

    // pohyb + odhození
    vx += p.kx; vz += p.kz;
    p.kx *= Math.max(0, 1 - dt * 6); p.kz *= Math.max(0, 1 - dt * 6);
    p.pos.x += vx * dt; p.pos.z += vz * dt;
    p.speed = Math.hypot(vx, vz);
    world.collide(p.pos, 0.42);
    const h = world.getHeight(p.pos.x, p.pos.z);
    const reg = world.regionAt(p.pos.x, p.pos.z);
    if (h < -1.25) { p.pos.copy(safePos); if (p.msgT <= 0) { p.msgT = 4; G.ui.toast('Dál je hluboko. Tudy to nepůjde.', 'warn'); } }
    else if (!st.unlocked.includes(reg)) {
      const c = world.camp, a = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
      p.pos.copy(safePos); p.pos.x += Math.sin(a) * 0.3; p.pos.z += Math.cos(a) * 0.3;
      if (p.msgT <= 0) { p.msgT = 5; G.ui.toast('Tuhle část ostrova ještě neznáš. Stezku ti ukáže Radovan, až splníš úkol.', 'warn'); G.audio.sfx('deny'); }
    } else safePos.copy(p.pos);
    p.pos.y = Math.max(world.getHeight(p.pos.x, p.pos.z), -0.9);
    p.region = reg;
    p.inCamp = dist2(p.pos.x, p.pos.z, world.camp.x, world.camp.z) < CAMP_R;

    // kroky
    p.stepAcc += p.speed * dt;
    if (p.stepAcc > (p.crouch ? 1.5 : 2.3) && p.state !== 'dodge') {
      p.stepAcc = 0;
      if (p.wade) { G.audio.sfx('splash', 0.5); G.fx.burst({ x: p.pos.x, y: 0.15, z: p.pos.z }, 0xbfe0e8, 5, 2, 0.4); }
      else G.audio.sfx('step', p.crouch ? 0.3 : p.sprinting ? 1 : 0.7);
    }

    model.group.position.copy(p.pos);
    model.group.rotation.y = p.yaw;
    model.group.visible = !(p.inv > 0 && p.state === 'stagger' && Math.sin(p.t * 50) > 0.3);
    animate(dt);
    updateCamera(dt);
  };

  p.camera = updateCamera;
  p.weapon = () => W;
  return p;
}
