import * as THREE from 'three';
import { clamp, lerp, rand, angDiff, dist2, TAU } from './util.js';
import { buildTrnovec, buildBahnak, buildDravec, buildCritter } from './models.js';
import { BEASTS, REGIONS } from './data.js';

// Chování všech zvířat. Každé má stav (state) a čas v něm (t).
export function createCreatures(G) {
  const { world, scene } = G;
  const camp = world.camp;
  const pl = () => G.player;
  const dP = (c) => dist2(c.pos.x, c.pos.z, pl().pos.x, pl().pos.z);
  const set = (c, s) => { c.state = s; c.t = 0; };
  const face = (c, x, z, dt, rate = 4) => {
    const w = Math.atan2(x - c.pos.x, z - c.pos.z);
    c.yaw += clamp(angDiff(c.yaw, w), -rate * dt, rate * dt);
    return angDiff(c.yaw, w);
  };
  function steer(c, x, z, spd, dt, rate = 3.5) {
    const d = dist2(x, z, c.pos.x, c.pos.z);
    if (d < 0.25) { c.moved = 0; return d; }
    const a = face(c, x, z, dt, rate), f = Math.max(0, Math.cos(a));
    c.pos.x += Math.sin(c.yaw) * spd * f * dt; c.pos.z += Math.cos(c.yaw) * spd * f * dt;
    c.moved = spd * f;
    return d;
  }
  function fly(c, x, z, spd, dt, rate = 2) {
    const d = dist2(x, z, c.pos.x, c.pos.z);
    face(c, x, z, dt, rate);
    c.pos.x += Math.sin(c.yaw) * spd * dt; c.pos.z += Math.cos(c.yaw) * spd * dt;
    c.moved = spd;
    return d;
  }
  const senseMul = () => { const p = pl(); let m = G.sky.vis() * p.stealth; if (p.crouch) m *= 0.55; if (p.sprinting) m *= 1.25; return m; };
  const safe = () => pl().inCamp || pl().state === 'dead';
  const sees = (c, R) => !safe() && dP(c) < R * senseMul();
  const toPlayer = (c) => Math.atan2(pl().pos.x - c.pos.x, pl().pos.z - c.pos.z);

  function call(c, name, range = 90, vol = 1) {
    const p = pl(), d = dP(c);
    if (d > range) return;
    const rel = angDiff(p.camYaw, Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z));
    G.audio.sfx(name, vol * Math.pow(1 - d / range, 1.3), clamp(-Math.sin(rel) * 0.7 + rand(-0.3, 0.3), -1, 1));
  }
  function prints(c, dt, every, type = 'print') {
    c.stepAcc += c.moved * dt;
    if (c.stepAcc > every) { c.stepAcc = 0; G.tracks.add(c.kind, type, c.pos.x + rand(-0.3, 0.3), c.pos.z + rand(-0.3, 0.3), c.yaw); }
  }
  function strike(c, dmg, reach, knock) {
    if (dP(c) < reach) return pl().hurt(dmg, c.pos.x, c.pos.z, knock);
    return false;
  }
  const head = (c, up = 1.2) => ({ x: c.pos.x + Math.sin(c.yaw) * c.radius, y: c.model.group.position.y + up, z: c.pos.z + Math.cos(c.yaw) * c.radius });

  function spawn(kind, x, z, o = {}) {
    const model = kind === 'trnovec' ? buildTrnovec(o.alpha) : kind === 'bahnak' ? buildBahnak() : kind === 'dravec' ? buildDravec() : buildCritter(kind);
    const base = { trnovec: { hp: o.alpha ? 130 : 70, radius: o.alpha ? 1.5 : 1.15, state: 'graze' }, bahnak: { hp: 160, radius: 2.1, state: 'hidden' }, dravec: { hp: 220, radius: 2.8, state: 'roost' } }[kind] || { hp: 1, radius: 0.3, state: 'wander' };
    const c = {
      kind, model, pos: new THREE.Vector3(x, world.getHeight(x, z), z), yaw: rand(TAU), hp: base.hp, maxHp: base.hp, radius: base.radius,
      state: base.state, t: 0, alive: true, gone: false, aware: false, flash: 0, anim: rand(10), stepAcc: 0, moved: 0, yOff: 0, alt: 0, altT: 0,
      cd: 0, wait: rand(1, 4), obs: 0, monster: !!BEASTS[kind], name: BEASTS[kind] ? BEASTS[kind].name : kind, px: x, pz: z, fy: 0, ...o,
    };
    if (kind === 'bahnak') { c.yOff = -1.05; c.dry = 0; c.prowlT = rand(20, 40); }
    if (kind === 'dravec') { c.ang = rand(TAU); c.stalkT = 3; c.featherT = 10; c.huntT = rand(30, 50); c.roam = { x: REGIONS.rocks.x, z: REGIONS.rocks.z }; c.roamT = 50; c.fy = c.pos.y; }
    model.group.position.copy(c.pos);
    scene.add(model.group);
    return c;
  }

  function despawn(c) { c.gone = true; c.alive = false; scene.remove(c.model.group); }

  /* ---------- zásah od hráče ---------- */
  function hit(c, dmg, from, heavy, stun) {
    if (!c.alive) return 'miss';
    let mul = 1, res = 'hit';
    const fromA = Math.atan2(from.x - c.pos.x, from.z - c.pos.z);
    if (c.kind === 'trnovec') {
      const open = c.state === 'winded' || c.state === 'trapped';
      if (open) { mul = 1.8; res = 'weak'; }
      else if (Math.abs(angDiff(c.yaw, fromA)) > 2.1) { mul = 0.35; res = 'block'; }
      if (c.state === 'rest') mul *= 1.5;
      c.enraged = 16; c.herd.alert(c, true);
      if (['graze', 'rest', 'alert', 'flee', 'lured'].includes(c.state)) set(c, 'windup');
    } else if (c.kind === 'bahnak') {
      if (c.state === 'recover' || c.state === 'trapped' || c.state === 'stunned') { mul = 1.6; res = 'weak'; }
      if (c.dry > 10) { mul *= 1.5; res = 'weak'; }
      if (c.state === 'hidden' || c.state === 'lured') { mul = 1.6; res = 'weak'; set(c, 'approach'); c.cd = 1; }
      c.aware = true; c.lost = 0;
    } else if (c.kind === 'dravec') {
      if (c.state === 'roost') { mul = 2; res = 'weak'; c.gT = 2.4; set(c, 'grounded'); call(c, 'screech', 160); }
      else if (c.state === 'stunned') { mul = 1.8; res = 'weak'; }
      else if (c.state === 'grounded' || c.state === 'buffetWind' || c.state === 'lured') { mul = 1.5; res = 'weak'; if (c.state === 'lured') { c.gT = 2.2; set(c, 'grounded'); } }
      c.aware = true;
    }
    c.hp -= dmg * mul; c.flash = 0.16; c.lastHit = 0;
    if (res === 'weak') G.reveal(c.kind);
    if (stun && c.alive && c.kind !== 'dravec' && !['winded', 'recover', 'trapped'].includes(c.state)) { c.windT = 1.6; set(c, c.kind === 'trnovec' ? 'winded' : 'stunned'); }
    if (c.hp <= 0) { die(c); return res; }
    if (c.hp < c.maxHp * 0.25 && !c.fleeing && !c.alpha) {
      c.fleeing = true;
      if (c.kind === 'trnovec') { G.eco.drop('trn', c.pos.x, c.pos.z, 2); set(c, 'limp'); }
      if (c.kind === 'bahnak') { G.eco.drop('supina', c.pos.x, c.pos.z, 1); set(c, 'retreat'); call(c, 'growl', 80); }
      if (c.kind === 'dravec') { G.eco.drop('pero', c.pos.x, c.pos.z, 2); set(c, 'flee'); call(c, 'screech', 200); }
      G.ui.toast(c.name + ' má dost a dává se na útěk. Můžeš ho nechat jít.', 'info');
    }
    return res;
  }

  function die(c) {
    c.alive = false; c.hp = 0; set(c, 'dead'); c.moved = 0; c.altT = 0; c.aware = false;
    call(c, c.kind === 'trnovec' ? 'snort' : c.kind === 'bahnak' ? 'growl' : 'screech', 120);
    G.audio.sfx('thud');
    G.eco.onDefeat(c, 'kill');
  }
  function repel(c) {
    G.eco.onDefeat(c, 'repel');
    despawn(c);
  }

  // drží zvířata mimo tábor a hlubokou vodu
  function bounds(c, minH) {
    const dc = dist2(c.pos.x, c.pos.z, camp.x, camp.z);
    if (dc < 42) { c.pos.x = camp.x + ((c.pos.x - camp.x) / dc) * 42; c.pos.z = camp.z + ((c.pos.z - camp.z) / dc) * 42; }
    if (world.getHeight(c.pos.x, c.pos.z) < minH) { c.pos.x = c.px; c.pos.z = c.pz; c.blocked = true; } else { c.px = c.pos.x; c.pz = c.pos.z; c.blocked = false; }
  }

  /* ---------- Trnovec ---------- */
  function escapePoint(c) {
    const p = pl().pos, base = Math.atan2(c.pos.x - p.x, c.pos.z - p.z);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = base + off, x = c.pos.x + Math.sin(a) * 16, z = c.pos.z + Math.cos(a) * 16;
      if (world.getHeight(x, z) > 0.3 && dist2(x, z, camp.x, camp.z) > 48 && Math.hypot(x, z) < world.radius * 0.86) return { x, z };
    }
    return null;
  }

  function upTrn(c, dt) {
    const p = pl(), d = dP(c), herd = c.herd, sky = G.sky;
    if (c.enraged > 0) c.enraged -= dt;
    c.eating = false;
    switch (c.state) {
      case 'graze': {
        if (sky.isNight() && !herd.alarm) { set(c, 'rest'); break; }
        if (!c.tgt) {
          c.wait -= dt; c.eating = c.wait > 0.5; c.moved = 0;
          if (c.wait <= 0) {
            const a = rand(TAU), r = rand(3, 13);
            c.tgt = { x: herd.cx + Math.cos(a) * r, z: herd.cz + Math.sin(a) * r };
            if (Math.random() < 0.3) G.tracks.add('trnovec', 'food', c.pos.x + Math.sin(c.yaw), c.pos.z + Math.cos(c.yaw), 0);
          }
        } else if (steer(c, c.tgt.x, c.tgt.z, 1.7, dt, 2.5) < 1.3 || c.t > 14) {
          c.tgt = null; c.wait = rand(2, 7); c.t = 0;
          const o = world.nearObstacle(c.pos.x, c.pos.z, 2.5);
          if (o && o.r < 1 && Math.random() < 0.35) G.tracks.add('trnovec', 'scratch', o.x, o.z, Math.atan2(c.pos.x - o.x, c.pos.z - o.z), { r: o.r });
        }
        if (sees(c, c.alpha ? 16 : 22 * (sky.weather === 'storm' ? 1.3 : 1))) herd.alert(c);
        break;
      }
      case 'rest':
        c.moved = 0;
        if (!sky.isNight()) { set(c, 'graze'); break; }
        if (dist2(c.pos.x, c.pos.z, herd.cx, herd.cz) > 9 && c.t < 12) steer(c, herd.cx + c.slot[0], herd.cz + c.slot[1], 1.7, dt);
        if (sees(c, 9)) herd.alert(c);
        break;
      case 'alert':
        c.moved = 0; face(c, p.pos.x, p.pos.z, dt, 5);
        if (c.t > 1.1) set(c, c.alpha || c.enraged > 0 ? 'windup' : 'flee');
        break;
      case 'flee': {
        if (!c.esc || c.t - c.escT > 0.7) { c.esc = escapePoint(c); c.escT = c.t; }
        if (!c.esc) { c.enraged = 12; set(c, 'windup'); break; }
        steer(c, c.esc.x, c.esc.z, 9.4, dt, 5);
        if (d < 5) { c.corner = (c.corner || 0) + dt; if (c.corner > 1.3) { c.corner = 0; c.enraged = 12; set(c, 'windup'); G.ui.hint('corner', 'Zahnal jsi Trnovce do kouta. Teď se bude bránit!'); } }
        else c.corner = Math.max(0, (c.corner || 0) - dt * 0.5);
        if ((d > 50 || safe()) && c.t > 3) { herd.calm(); set(c, 'graze'); c.tgt = null; c.wait = 1.5; }
        break;
      }
      case 'windup':
        c.moved = 0; face(c, p.pos.x, p.pos.z, dt, 5);
        if (!c.cued) { c.cued = true; call(c, 'snort', 60, 1.2); }
        if (c.t > 0.95) { c.cued = false; c.hitP = false; set(c, 'charge'); call(c, 'hooves', 60); }
        break;
      case 'charge': {
        if (c.t < 0.22) face(c, p.pos.x, p.pos.z, dt, 2.5);
        const bx = c.pos.x, bz = c.pos.z;
        c.pos.x += Math.sin(c.yaw) * 16 * dt; c.pos.z += Math.cos(c.yaw) * 16 * dt; c.moved = 16;
        if (!c.hitP && strike(c, c.alpha ? 28 : 22, c.radius + 0.7, 9)) c.hitP = true;
        const ex = c.pos.x, ez = c.pos.z;
        if (world.collide(c.pos, 0.7) && dist2(ex, ez, c.pos.x, c.pos.z) > 0.12 && c.t > 0.15) {
          c.pos.x = bx; c.pos.z = bz; c.windT = 2.8; set(c, 'winded');
          G.audio.sfx('thud', clamp(1.3 - d / 40, 0, 1)); G.fx.burst(head(c, 1), 0xd8c8a0, 14, 4, 0.6);
          G.fx.word(head(c, 2), 'Omráčen!', 'weak'); G.reveal('trnovec');
        } else if (c.t > 1.15) { c.windT = 1.5; set(c, 'winded'); }
        break;
      }
      case 'winded':
        c.moved = 0;
        if (c.t > c.windT) {
          if (c.fleeing) set(c, 'limp');
          else if (c.enraged > 0 || c.alpha) {
            const behind = Math.abs(angDiff(c.yaw, toPlayer(c))) > 1.9;
            set(c, d < 3.8 && behind ? 'bristle' : (d > 40 || safe() ? 'flee' : 'windup'));
          } else set(c, 'flee');
        }
        break;
      case 'bristle':
        c.moved = 0;
        if (!c.cued) { c.cued = true; call(c, 'rattle', 40, 1.2); }
        if (c.t > 0.65 && !c.burst) { c.burst = true; G.fx.burst({ x: c.pos.x, y: c.pos.y + 1.6, z: c.pos.z }, 0xe8a23a, 18, 6, 0.4); strike(c, 14, 3.6, 7); }
        if (c.t > 1.15) { c.cued = c.burst = false; set(c, 'windup'); }
        break;
      case 'limp':
        if (!c.esc || c.t - c.escT > 1) { c.esc = escapePoint(c) || { x: herd.home.x, z: herd.home.z }; c.escT = c.t; }
        steer(c, c.esc.x, c.esc.z, 5.2, dt, 3);
        if (d > 52 || c.t > 30) repel(c);
        break;
      case 'trapped':
        c.moved = 0;
        if (c.t > 6) { c.enraged = 10; set(c, c.fleeing ? 'limp' : 'windup'); }
        break;
      case 'lured':
        if (!c.bait || c.bait.gone) { c.bait = null; set(c, 'graze'); break; }
        if (steer(c, c.bait.x, c.bait.z, 2.4, dt) < 1.6) { c.moved = 0; c.eating = true; c.bait.eat += dt; }
        if (sees(c, 8)) herd.alert(c);
        break;
    }
    prints(c, dt, 4.5);
    world.collide(c.pos, 0.6);
    bounds(c, 0.05);
    if (c.blocked && c.state === 'charge') { c.windT = 1.2; set(c, 'winded'); }
  }

  function animTrn(c, dt) {
    const P = c.model.parts, s = c.state, mv = Math.min(c.moved / 3, 1);
    c.anim += dt * (3 + c.moved * 1.3);
    let hx = 0, by = 1.0, bx = 0, bz = 0, sp = 1, glow = 0, fold = 0;
    if (c.eating) hx = 0.75 + Math.sin(c.anim * 2.4) * 0.08;
    if (s === 'rest') { by = 0.56; fold = 1.35; hx = 0.45; }
    else if (s === 'alert') hx = -0.4;
    else if (s === 'windup') { hx = 0.6; bx = 0.12; glow = 2.5; }
    else if (s === 'charge') { hx = 0.5; bx = 0.1; glow = 2.5; }
    else if (s === 'winded') { hx = 0.3 + Math.sin(c.t * 6) * 0.2; bz = Math.sin(c.t * 5) * 0.07; }
    else if (s === 'bristle') { sp = 1 + Math.min(c.t / 0.6, 1) * 0.55 + Math.sin(c.t * 60) * 0.05; glow = 2; }
    else if (s === 'trapped') bz = Math.sin(c.t * 18) * 0.06;
    else if (s === 'limp') bz = Math.sin(c.anim) * 0.1;
    else if (s === 'dead') { by = 0.55; bz = 1.45; hx = 0.3; }
    const e = Math.min(1, dt * 8);
    P.body.position.y = lerp(P.body.position.y, by, e);
    P.body.rotation.x = lerp(P.body.rotation.x, bx, e);
    P.body.rotation.z = lerp(P.body.rotation.z, bz, s === 'dead' ? Math.min(1, dt * 4) : e);
    P.head.rotation.x = lerp(P.head.rotation.x, hx, e);
    P.spikes.scale.setScalar(lerp(P.spikes.scale.x, sp, e));
    P.tail.rotation.y = Math.sin(c.anim * 0.8) * 0.5;
    P.legs.forEach((l, i) => {
      const ph = i === 0 || i === 3 ? 0 : Math.PI;
      let r = Math.sin(c.anim + ph) * 0.7 * mv + fold * (i < 2 ? -1 : 1);
      if (s === 'windup' && i === 0) r = -0.5 + Math.sin(c.t * 16) * 0.5;
      l.rotation.x = lerp(l.rotation.x, r, Math.min(1, dt * 14));
    });
    c.model.eye.emissiveIntensity = lerp(c.model.eye.emissiveIntensity, glow, e);
  }

  /* ---------- Bahňák ---------- */
  function upBah(c, dt) {
    const p = pl(), d = dP(c), sky = G.sky;
    c.cd -= dt;
    const wetNow = world.getHeight(c.pos.x, c.pos.z) < 0.28 || sky.k.rain > 0.5;
    c.dry = clamp(c.dry + (wetNow ? -2.5 : 1) * dt, 0, 15);
    if (c.dry > 10 && !c.dryCue && c.alive) { c.dryCue = true; G.fx.word(head(c, 2), 'Vysychá!', 'weak'); G.reveal('bahnak'); }
    if (c.dry < 5) c.dryCue = false;
    const slow = c.dry > 10 ? 0.6 : 1;
    const combat = () => { c.aware = true; c.lost = 0; set(c, 'approach'); };
    switch (c.state) {
      case 'hidden': {
        c.moved = 0; c.aware = false;
        c.yOff = lerp(c.yOff, -1.05, dt * 2);
        if (dist2(c.pos.x, c.pos.z, c.pool.x, c.pool.z) > 1.5) { c.pos.x = lerp(c.pos.x, c.pool.x, dt); c.pos.z = lerp(c.pos.z, c.pool.z, dt); }
        c.bubT = (c.bubT || 0) - dt;
        if (c.bubT <= 0) { c.bubT = rand(1.5, 4); G.fx.burst({ x: c.pos.x + rand(-1, 1), y: 0.15, z: c.pos.z + rand(-1, 1) }, 0x9aa87a, 3, 0.5, 0.8, -1); if (Math.random() < 0.5) call(c, 'bubble', 26); }
        if (!safe() && d < (p.crouch ? 4.5 : 7.5) * p.stealth) { set(c, 'ambushWind'); call(c, 'gurgle', 50, 1.3); break; }
        const q = G.eco.nearestPrey(c.pos, 5.5);
        if (q) { c.yaw = Math.atan2(q.pos.x - c.pos.x, q.pos.z - c.pos.z); G.eco.eatPrey(c, q); c.snap = 0.5; break; }
        c.prowlT -= dt;
        if (c.prowlT <= 0 && (sky.isNight() || sky.k.rain > 0.5 || sky.k.fog > 0.5)) { set(c, 'prowl'); c.tgt = null; c.prowlLen = rand(40, 70); }
        break;
      }
      case 'ambushWind':
        c.yOff = lerp(c.yOff, -0.35, dt * 5); face(c, p.pos.x, p.pos.z, dt, 3);
        if (Math.random() < dt * 14) G.fx.burst({ x: c.pos.x + rand(-1.5, 1.5), y: 0.2, z: c.pos.z + rand(-1.5, 1.5) }, 0xb8c89a, 2, 1.2, 0.5, 2);
        if (c.t > 0.85) { c.aware = true; c.hitP = false; set(c, 'lunge'); call(c, 'growl', 70); }
        break;
      case 'biteWind':
        c.moved = 0; face(c, p.pos.x, p.pos.z, dt, 2.2 * slow);
        if (!c.cued) { c.cued = true; call(c, 'growl', 60); }
        if (c.t > 0.85) { c.cued = false; c.hitP = false; set(c, 'lunge'); }
        break;
      case 'lunge': {
        c.yOff = lerp(c.yOff, 0, dt * 10);
        const v = 19 * Math.max(0, 1 - c.t / 0.38);
        c.pos.x += Math.sin(c.yaw) * v * dt; c.pos.z += Math.cos(c.yaw) * v * dt; c.moved = v;
        const h = head(c, 0);
        if (!c.hitP && !safe() && dist2(h.x, h.z, p.pos.x, p.pos.z) < 2.1 && p.hurt(30, c.pos.x, c.pos.z, 8)) c.hitP = true;
        if (c.t > 0.42) { set(c, 'recover'); c.recT = 1.5; }
        break;
      }
      case 'recover':
        c.moved = 0;
        if (c.t > c.recT) { c.cd = 0.6; set(c, c.fleeing ? 'retreat' : 'approach'); }
        break;
      case 'approach': {
        c.yOff = lerp(c.yOff, 0, dt * 4);
        if (safe() || d > 34) { c.lost += dt; if (c.lost > 5) { c.aware = false; set(c, 'return'); break; } } else c.lost = 0;
        const a = Math.abs(angDiff(c.yaw, toPlayer(c)));
        if (d > 4.2) steer(c, p.pos.x, p.pos.z, 2.9 * slow, dt, 1.6 * slow); else { c.moved = 0; face(c, p.pos.x, p.pos.z, dt, 1.4 * slow); }
        if (c.cd <= 0 && !safe()) {
          if (d < 4.8 && a > 1.3) { set(c, 'tailWind'); c.cd = 2; }
          else if (d < 6.2 && a < 0.6) { set(c, 'biteWind'); c.cd = 2.2; }
          else if (d > 9 && d < 22 && a < 0.5) { set(c, 'spitWind'); c.cd = 3.5; }
        }
        break;
      }
      case 'tailWind':
        c.moved = 0;
        if (!c.cued) { c.cued = true; call(c, 'gurgle', 50); }
        if (c.t > 0.75) { c.cued = false; c.hitP = false; set(c, 'tailSweep'); G.audio.sfx('swingHeavy', clamp(1.2 - d / 25, 0, 1)); }
        break;
      case 'tailSweep':
        c.yaw += dt * 13;
        if (!c.hitP && strike(c, 20, 4.8, 10)) c.hitP = true;
        if (c.t > 0.45) { set(c, 'recover'); c.recT = 0.9; }
        break;
      case 'spitWind':
        c.moved = 0; face(c, p.pos.x, p.pos.z, dt, 2);
        if (!c.cued) { c.cued = true; call(c, 'gurgle', 60, 1.2); }
        if (c.t > 0.95) { c.cued = false; G.eco.shoot(c, p.pos.x, p.pos.z); call(c, 'spit', 60); set(c, 'recover'); c.recT = 0.7; }
        break;
      case 'prowl': {
        c.yOff = lerp(c.yOff, 0, dt * 2);
        if (sees(c, 14)) { call(c, 'growl', 70); combat(); break; }
        const q = c.prey && !c.prey.gone ? c.prey : (c.prey = G.eco.nearestPrey(c.pos, 24));
        if (q) {
          if (steer(c, q.pos.x, q.pos.z, 3.4, dt, 2) < 5) { c.yaw = Math.atan2(q.pos.x - c.pos.x, q.pos.z - c.pos.z); G.eco.eatPrey(c, q); c.prey = null; c.snap = 0.5; c.moved = 0; }
        } else {
          if (!c.tgt || dist2(c.pos.x, c.pos.z, c.tgt.x, c.tgt.z) < 3) c.tgt = world.randomPointIn('swamp', (x, z, h) => h > -0.4 && h < 1.2 && dist2(x, z, c.pool.x, c.pool.z) < 60);
          steer(c, c.tgt.x, c.tgt.z, 2.2, dt, 1.5);
        }
        if (c.t > c.prowlLen || (!sky.isNight() && sky.k.rain < 0.4 && sky.k.fog < 0.4 && c.t > 15)) set(c, 'return');
        break;
      }
      case 'return':
        if (sees(c, 9)) { combat(); break; }
        if (steer(c, c.pool.x, c.pool.z, 2.6, dt, 1.8) < 2) { set(c, 'hidden'); c.prowlT = rand(25, 50); }
        break;
      case 'retreat':
        if (steer(c, c.pool.x, c.pool.z, 3.3, dt, 2) < 2.5 || c.t > 40) { G.fx.burst({ x: c.pos.x, y: 0.3, z: c.pos.z }, 0x9aa87a, 20, 3, 0.8); G.audio.sfx('splash'); repel(c); }
        break;
      case 'lured':
        c.yOff = lerp(c.yOff, 0, dt * 2);
        if (!c.bait || c.bait.gone) { c.bait = null; set(c, 'return'); break; }
        if (steer(c, c.bait.x, c.bait.z, 2.5, dt, 1.8) < 2.6) { c.moved = 0; c.bait.eat += dt; c.snap = 0.3; }
        if (sees(c, 5)) { call(c, 'growl', 70); combat(); }
        break;
      case 'trapped':
        c.moved = 0;
        if (c.t > 4.5) set(c, c.fleeing ? 'retreat' : 'approach');
        break;
      case 'stunned':
        c.moved = 0;
        if (c.t > (c.windT || 2)) set(c, c.fleeing ? 'retreat' : 'approach');
        break;
    }
    if (c.snap > 0) c.snap -= dt;
    if (c.state !== 'hidden') { prints(c, dt, 4, Math.random() < 0.4 ? 'drag' : 'print'); world.collide(c.pos, 1.2); bounds(c, -0.9); }
  }

  function animBah(c, dt) {
    const P = c.model.parts, s = c.state;
    c.anim += dt * (1.5 + c.moved * 1.2);
    let jaw = 0.05, hx = 0, bz = 0, sc = 1, tw = 0.25, glow = 0.6, ty = 0;
    if (s === 'ambushWind' || s === 'biteWind') { jaw = 0.75; hx = -0.4; glow = 3; }
    else if (s === 'lunge') { jaw = c.t < 0.25 ? 0.9 : 0; hx = 0.1; glow = 3; }
    else if (s === 'recover') { hx = 0.25; jaw = 0.3; bz = 0.12; }
    else if (s === 'tailWind') { ty = -1.1 * Math.min(c.t / 0.6, 1); glow = 2.5; }
    else if (s === 'tailSweep') ty = 0.9;
    else if (s === 'spitWind') { sc = 1 + Math.min(c.t, 0.9) * 0.16; jaw = 0.25; hx = -0.2; glow = 2.5; }
    else if (s === 'trapped' || s === 'stunned') bz = Math.sin(c.t * 16) * 0.05;
    else if (s === 'dead') { bz = 0.5; jaw = 0.5; tw = 0; glow = 0; }
    if (c.snap > 0) jaw = 0.8;
    const e = Math.min(1, dt * 9);
    P.jaw.rotation.x = lerp(P.jaw.rotation.x, jaw, Math.min(1, dt * 16));
    P.head.rotation.x = lerp(P.head.rotation.x, hx, e);
    P.body.rotation.z = lerp(P.body.rotation.z, bz, e);
    P.body.scale.setScalar(lerp(P.body.scale.x, sc, e));
    P.tail.forEach((t, i) => { t.rotation.y = lerp(t.rotation.y, ty * 0.6 + Math.sin(c.anim * 1.2 - i * 0.8) * tw, e); });
    const mv = Math.min(c.moved / 2, 1);
    P.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.anim * 2 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5 * mv; });
    c.model.eye.emissiveIntensity = lerp(c.model.eye.emissiveIntensity, glow, e);
  }

  /* ---------- Bouřný dravec ---------- */
  function upDrv(c, dt) {
    const p = pl(), d = dP(c), sky = G.sky, nest = world.nest;
    const active = sky.isNight() || sky.weather === 'storm';
    if (c.alt > 4 && c.state !== 'roost') {
      c.featherT -= dt;
      if (c.featherT <= 0) { c.featherT = rand(14, 26); G.tracks.add('dravec', 'feather', c.pos.x + rand(-4, 4), c.pos.z + rand(-4, 4), rand(TAU)); }
    }
    const lose = () => { c.aware = false; set(c, 'circle'); };
    switch (c.state) {
      case 'roost':
        c.altT = 0; c.moved = 0; c.pos.x = nest.x; c.pos.z = nest.z;
        if (active && c.t > 4) { c.next = 'circle'; set(c, 'takeoff'); }
        else if (!safe() && c.t > 1 && d < (p.crouch ? 2.5 : 9) * p.stealth) { c.aware = true; call(c, 'screech', 160); c.next = 'stalk'; set(c, 'takeoff'); }
        break;
      case 'takeoff':
        c.altT = 17; c.moved = 0;
        if (c.t > 1.2) set(c, c.next || 'stalk');
        break;
      case 'circle': {
        c.altT = 24; c.ang += dt * 0.24;
        fly(c, c.roam.x + Math.cos(c.ang) * 42, c.roam.z + Math.sin(c.ang) * 42, 11, dt, 1.3);
        c.roamT -= dt;
        if (c.roamT <= 0) { c.roamT = rand(45, 80); const far = Math.random() < 0.4; c.roam = far ? { x: lerp(REGIONS.rocks.x, REGIONS.coast.x, 0.55), z: lerp(REGIONS.rocks.z, REGIONS.coast.z, 0.55) } : { x: REGIONS.rocks.x, z: REGIONS.rocks.z }; }
        if (!active && c.t > 8) { set(c, 'return'); break; }
        if (c.alt > 10 && sees(c, 95)) { c.aware = true; call(c, 'screech', 200, 1.2); G.ui.hint('seen', 'Na obloze něco zakřičelo. Dravec tě vidí!'); c.stalkT = rand(2.5, 4); set(c, 'stalk'); break; }
        c.huntT -= dt;
        if (c.huntT <= 0) { c.huntT = rand(35, 60); const q = G.eco.nearestPrey(c.pos, 60); if (q) { c.prey = q; set(c, 'preyDive'); } }
        break;
      }
      case 'preyDive': {
        const q = c.prey;
        if (!q || q.gone || c.t > 7) { c.prey = null; set(c, 'circle'); break; }
        const dq = fly(c, q.pos.x, q.pos.z, 26, dt, 4);
        c.altT = clamp(dq * 0.5, 0.5, 24);
        if (dq < 2.5) { G.eco.eatPrey(c, q); c.prey = null; c.next = 'circle'; set(c, 'takeoff'); }
        break;
      }
      case 'return': {
        const dn = fly(c, nest.x, nest.z, 12, dt, 2);
        c.altT = clamp(dn * 0.5, 0, 22);
        if (active) { set(c, 'circle'); break; }
        if (dn < 1.5) { c.pos.x = nest.x; c.pos.z = nest.z; set(c, 'roost'); }
        break;
      }
      case 'stalk':
        c.altT = 16;
        if (safe() || d > 160) { lose(); break; }
        c.ang += dt * 0.75;
        fly(c, p.pos.x + Math.cos(c.ang) * 15, p.pos.z + Math.sin(c.ang) * 15, 13, dt, 2.4);
        if (c.t > c.stalkT) {
          c.stalkT = rand(2.5, 4.5); c.tp = null;
          if (sky.weather === 'storm' && Math.random() < 0.45) { set(c, 'boltWind'); call(c, 'hum', 120, 1.2); }
          else { set(c, 'diveWind'); call(c, 'screech', 160, 1.2); }
        }
        break;
      case 'diveWind':
        c.moved = 0; c.altT = 15; face(c, p.pos.x, p.pos.z, dt, 5);
        if (c.t > 0.75 && !c.tp) c.tp = { x: p.pos.x, z: p.pos.z };
        if (c.t > 1.05) set(c, 'dive');
        break;
      case 'dive': {
        const dt2 = fly(c, c.tp.x, c.tp.z, 34, dt, 9);
        c.alt = Math.min(c.alt, dt2 * 0.55); c.altT = c.alt;
        if (dt2 < 2 || c.t > 2) {
          c.alt = c.altT = 0;
          G.fx.burst({ x: c.pos.x, y: world.getHeight(c.pos.x, c.pos.z) + 0.4, z: c.pos.z }, 0xd8c8a0, 24, 7, 0.7);
          G.audio.sfx('thud', clamp(1.4 - d / 40, 0, 1)); G.shake(clamp(0.5 - d / 60, 0, 0.5));
          strike(c, 28, 4.2, 10);
          c.gT = 3.6; c.buff = false; set(c, 'grounded');
        }
        break;
      }
      case 'grounded':
        c.altT = 0; c.moved = 0; face(c, p.pos.x, p.pos.z, dt, 1.5);
        if (c.t > 0.9 && !c.buff && d < 5 && Math.abs(angDiff(c.yaw, toPlayer(c))) < 0.9) { c.gKeep = c.t; set(c, 'buffetWind'); call(c, 'wing', 40, 1.3); }
        else if (c.t > c.gT) { c.next = c.fleeing ? 'flee' : 'stalk'; set(c, 'takeoff'); call(c, 'wing', 60); }
        break;
      case 'buffetWind':
        if (c.t > 0.7) {
          c.buff = true;
          G.fx.burst(head(c, 1.5), 0xbfe8ff, 22, 9, 0.4, 0);
          G.audio.sfx('swingHeavy', 1);
          if (d < 6.2 && Math.abs(angDiff(c.yaw, toPlayer(c))) < 1.2) p.hurt(14, c.pos.x, c.pos.z, 13);
          c.state = 'grounded'; c.t = c.gKeep + 0.7;
        }
        break;
      case 'boltWind':
        c.moved = 0; c.altT = 16; face(c, p.pos.x, p.pos.z, dt, 4);
        if (!c.tp) { c.tp = { x: p.pos.x, z: p.pos.z }; c.mark = G.fx.marker(c.tp.x, c.tp.z, 3.3, 1.4, 0x7fd8ff); }
        if (c.t < 0.55) { c.tp.x = p.pos.x; c.tp.z = p.pos.z; c.mark.m.position.set(c.tp.x, world.getHeight(c.tp.x, c.tp.z) + 0.15, c.tp.z); }
        if (c.t > 1.4) {
          sky.strike(c.tp.x, c.tp.z, 0.05);
          G.fx.burst({ x: c.tp.x, y: world.getHeight(c.tp.x, c.tp.z) + 0.5, z: c.tp.z }, 0x9fe0ff, 30, 9, 0.5);
          if (dist2(c.tp.x, c.tp.z, p.pos.x, p.pos.z) < 3.4) p.hurt(26, c.tp.x, c.tp.z, 6);
          c.tp = null; set(c, 'stalk');
        }
        break;
      case 'stunned':
        c.altT = 0; c.moved = 0;
        if (c.t > 5) { c.next = c.fleeing ? 'flee' : 'stalk'; set(c, 'takeoff'); }
        break;
      case 'lured':
        if (!c.bait || c.bait.gone) { c.bait = null; c.next = 'circle'; set(c, 'takeoff'); break; }
        { const db = dist2(c.pos.x, c.pos.z, c.bait.x, c.bait.z);
          if (db > 2.5) { fly(c, c.bait.x, c.bait.z, 14, dt, 3); c.altT = clamp(db * 0.5 - 1, 0, 20); } else { c.altT = 0; c.moved = 0; if (c.alt < 0.5) c.bait.eat += dt; }
          if (c.alt < 1 && sees(c, 6)) { c.aware = true; c.gT = 1.5; c.buff = false; set(c, 'grounded'); call(c, 'screech', 120); } }
        break;
      case 'flee': {
        c.altT = 55;
        const a = Math.atan2(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
        fly(c, c.pos.x + Math.sin(a) * 40, c.pos.z + Math.cos(a) * 40, 20, dt, 2);
        if (c.t > 9 || d > 150) repel(c);
        break;
      }
    }
    const rate = c.state === 'stunned' ? 45 : c.state === 'dive' ? 60 : 9;
    c.alt += clamp(c.altT - c.alt, -rate * dt, rate * 0.75 * dt);
    if (c.alt < 0.6 && c.moved > 0) prints(c, dt, 3);
  }

  function animDrv(c, dt) {
    const P = c.model.parts, s = c.state, air = c.alt > 1.5;
    let rate = 5, amp = 0.3, fold = 0, droop = 0, pitch = 0, hx = 0, by = 1.7, bz = 0, cg = 1.2, legs = air ? 1.1 : 0;
    if (s === 'takeoff' || s === 'diveWind' || s === 'boltWind') { rate = 11; amp = 0.75; pitch = -0.35; }
    else if (s === 'stalk' || s === 'lured' || s === 'return' || s === 'flee') { rate = 7; amp = 0.5; }
    else if (s === 'dive' || s === 'preyDive') { rate = 2; amp = 0.05; fold = 0.95; pitch = 0.75; }
    else if (s === 'grounded') { rate = 2.5; amp = 0.08; fold = 0.3; droop = -0.38; }
    else if (s === 'buffetWind') { rate = 0; amp = 0; fold = -0.3; droop = -0.9 * Math.min(c.t / 0.6, 1); }
    else if (s === 'roost') { rate = 1; amp = 0.02; fold = 1.25; droop = 0.5; hx = 0.9; by = 1.25; }
    else if (s === 'stunned') { rate = 14; amp = 0.1; fold = 0.3; droop = 0.3; by = 1.0; bz = Math.sin(c.t * 12) * 0.08; }
    else if (s === 'dead') { rate = 0; amp = 0; fold = 0.2; droop = 0.35; by = 0.75; bz = 0.35; hx = 0.8; cg = 0.1; }
    if (s === 'boltWind') cg = 1.2 + c.t * 6;
    c.anim += dt * rate;
    const e = Math.min(1, dt * 8), fl = Math.sin(c.anim) * amp, fl2 = Math.sin(c.anim - 0.9) * amp * 1.3;
    P.wings.forEach(([w, o], i) => {
      const sx = i === 0 ? 1 : -1;
      w.rotation.z = lerp(w.rotation.z, sx * (fl - droop), Math.min(1, dt * 16));
      w.rotation.y = lerp(w.rotation.y, sx * fold, e);
      o.rotation.z = lerp(o.rotation.z, fl2 - droop * 0.6, Math.min(1, dt * 16));
      o.rotation.y = lerp(o.rotation.y, fold * 0.7, e);
    });
    P.body.rotation.x = lerp(P.body.rotation.x, pitch, e);
    P.body.rotation.z = lerp(P.body.rotation.z, bz, e);
    P.body.position.y = lerp(P.body.position.y, by, e);
    P.neck.rotation.x = lerp(P.neck.rotation.x, hx, e);
    P.head.rotation.y = s === 'circle' ? Math.sin(c.anim * 0.2) * 0.5 : 0;
    P.tail.rotation.x = Math.sin(c.anim) * 0.1;
    P.legs.forEach((l) => { l.rotation.x = lerp(l.rotation.x, legs, e); });
    c.model.crystal.emissiveIntensity = lerp(c.model.crystal.emissiveIntensity, cg + Math.sin(c.anim * 0.7) * 0.3, e);
    if (air && rate > 4 && Math.sin(c.anim) > 0.96 && !c.wb) { c.wb = true; call(c, 'wing', 45, 0.6); } else if (Math.sin(c.anim) < 0) c.wb = false;
  }

  /* ---------- drobná kořist ---------- */
  function upPrey(c, dt) {
    const p = pl(), d = dP(c);
    let threat = null;
    if (d < 9 && !p.crouch) threat = p.pos;
    if (!threat) for (const m of G.eco.monsters) { if (m.alive && m.kind !== 'trnovec' && m.state !== 'hidden' && (m.alt || 0) < 6 && dist2(m.pos.x, m.pos.z, c.pos.x, c.pos.z) < 9) { threat = m.pos; break; } }
    if (threat) {
      const a = Math.atan2(c.pos.x - threat.x, c.pos.z - threat.z) + Math.sin(c.anim) * 0.5;
      steer(c, c.pos.x + Math.sin(a) * 6, c.pos.z + Math.cos(a) * 6, 7.5, dt, 9);
      if (!c.scared) { c.scared = true; call(c, 'squeak', 25); }
      c.tgt = null;
    } else {
      c.scared = false;
      if (!c.tgt) { c.wait -= dt; c.moved = 0; if (c.wait <= 0) c.tgt = { x: c.pos.x + rand(-9, 9), z: c.pos.z + rand(-9, 9) }; }
      else if (steer(c, c.tgt.x, c.tgt.z, 2.4, dt, 5) < 0.6 || c.t > 6) { c.tgt = null; c.wait = rand(1, 5); c.t = 0; }
    }
    world.collide(c.pos, 0.25);
    bounds(c, c.kind === 'slipka' ? -0.25 : 0.2);
    if (world.regionAt(c.pos.x, c.pos.z) !== c.region && !threat) c.tgt = { x: REGIONS[c.region].x + rand(-40, 40), z: REGIONS[c.region].z + rand(-40, 40) };
    c.anim += dt * (4 + c.moved * 2);
    c.model.parts.body.position.y = 0.28 + (c.moved > 0.3 ? Math.abs(Math.sin(c.anim)) * (c.kind === 'slipka' ? 0.12 : 0.35) : 0);
    c.model.parts.body.rotation.x = c.moved < 0.3 && c.wait > 2 ? 0.35 : 0;
  }

  function update(c, dt) {
    if (c.gone) return;
    c.t += dt;
    if (c.lastHit !== undefined) c.lastHit += dt;
    if (c.alive) {
      if (c.kind === 'trnovec') upTrn(c, dt); else if (c.kind === 'bahnak') upBah(c, dt); else if (c.kind === 'dravec') upDrv(c, dt); else upPrey(c, dt);
    } else if (c.kind === 'dravec') c.alt = Math.max(0, c.alt - dt * 40);
    if (c.kind === 'trnovec') animTrn(c, dt); else if (c.kind === 'bahnak') animBah(c, dt); else if (c.kind === 'dravec') animDrv(c, dt);
    const gy = Math.max(world.getHeight(c.pos.x, c.pos.z), c.kind === 'bahnak' ? -0.6 : -5);
    c.pos.y = gy;
    let y = gy + c.yOff;
    if (c.kind === 'dravec') { c.fy = c.alt > 1 ? lerp(c.fy, gy + c.alt, Math.min(1, dt * 3)) : gy + c.alt; y = c.fy; }
    c.model.group.position.set(c.pos.x, y, c.pos.z);
    c.model.group.rotation.y = c.yaw;
    if (c.flash > 0) {
      c.flash -= dt;
      const on = c.flash > 0;
      for (const m of c.model.mats) { if (m.userData.em === undefined) m.userData.em = m.emissive.getHex(); if (on) m.emissive.setHex(0xffffff); else m.emissive.setHex(m.userData.em); }
    }
  }

  return { spawn, despawn, update, hit, set, call };
}
