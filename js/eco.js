import * as THREE from 'three';
import { clamp, rand, pick, dist2, TAU } from './util.js';
import { REGIONS, MATS } from './data.js';
import { createCreatures } from './creatures.js';
import { buildPickup, buildTrap, buildBait } from './models.js';

const PREY = { jungle: 'hopik', coast: 'hopik', swamp: 'slipka', rocks: 'skalnik' };
const PREY_NAME = { hopik: 'hopíků', slipka: 'slípek', skalnik: 'skalníků' };
const CAP = { jungle: 8, coast: 7, swamp: 7, rocks: 5 };
const LOOT = {
  trnovec: (c) => (c.alpha ? { trn: 4, usen: 3 } : { trn: 2 + (Math.random() < 0.5 ? 1 : 0), usen: 1 + (Math.random() < 0.5 ? 1 : 0) }),
  bahnak: () => ({ supina: 3, hliza: 1 }),
  dravec: () => ({ pero: 3 }),
};

export function createEco(G) {
  const { world, scene } = G;
  const K = createCreatures(G);
  const eco = { monsters: [], prey: [], traps: [], baits: [], shots: [], drops: [], herds: [], respawns: [], boom: {}, gone: { swamp: 0, hunt: 0 } };
  let callT = 12, popT = 5, baitT = 0;

  /* --- stáda Trnovců --- */
  function makeHerd(region, x, z, n, alpha) {
    const herd = {
      region, home: { x, z }, cx: x, cz: z, members: [], alarm: false, moveT: rand(30, 60), size: n + (alpha ? 1 : 0), lost: 0,
      alert(src, attacked) {
        if (!herd.alarm) K.call(src, 'snort', 70);
        herd.alarm = true;
        for (const m of herd.members) {
          if (!m.alive) continue;
          if (m === src && attacked) continue;
          if (['graze', 'rest', 'lured'].includes(m.state)) K.set(m, 'alert');
        }
      },
      calm() {
        if (!herd.alarm) return;
        herd.alarm = false;
        const live = herd.members.filter((m) => m.alive);
        if (!live.length) return;
        const mx = live.reduce((s, m) => s + m.pos.x, 0) / live.length, mz = live.reduce((s, m) => s + m.pos.z, 0) / live.length;
        if (dist2(mx, mz, herd.home.x, herd.home.z) < 90 && world.getHeight(mx, mz) > 1) { herd.cx = mx; herd.cz = mz; } else { herd.cx = herd.home.x; herd.cz = herd.home.z; }
      },
    };
    for (let i = 0; i < n; i++) addTrn(herd, false);
    if (alpha) addTrn(herd, true);
    eco.herds.push(herd);
    return herd;
  }
  function addTrn(herd, alpha) {
    const a = rand(TAU), r = rand(2, 9);
    const c = K.spawn('trnovec', herd.cx + Math.cos(a) * r, herd.cz + Math.sin(a) * r, { alpha, herd, slot: [Math.cos(a) * 4, Math.sin(a) * 4] });
    if (alpha) c.name = 'Starý samec';
    herd.members.push(c); eco.monsters.push(c);
    return c;
  }
  function addBahnak(pool, tag) {
    const c = K.spawn('bahnak', pool.x, pool.z, { pool, tag });
    eco.monsters.push(c);
    return c;
  }
  function addDravec() {
    const c = K.spawn('dravec', world.nest.x, world.nest.z, {});
    eco.monsters.push(c);
    return c;
  }
  function addPrey(region, nearPlayerOk) {
    const p = G.player ? G.player.pos : null;
    const pt = world.randomPointIn(region, (x, z, h) => (region === 'swamp' ? h > -0.2 && h < 1.5 : h > 1 && world.slopeAt(x, z) < 0.6) && (nearPlayerOk || !p || dist2(x, z, p.x, p.z) > 35));
    const c = K.spawn(PREY[region], pt.x, pt.z, { region });
    eco.prey.push(c);
  }

  const jc = REGIONS.jungle, cc = REGIONS.coast;
  makeHerd('jungle', jc.x + 10, jc.z + 15, 4, false);
  const hb = world.randomPointIn('coast', (x, z, h) => h > 2 && dist2(x, z, cc.x - 30, cc.z - 20) < 40);
  makeHerd('coast', hb.x, hb.z, 3, true);
  addBahnak(world.pools[0], 'spring');
  addBahnak(world.pools[1]);
  addDravec();
  for (const r in CAP) for (let i = 0; i < CAP[r]; i++) addPrey(r, true);

  /* --- kořist a dravci --- */
  eco.nearestPrey = (pos, maxD) => {
    let best = null, bd = maxD;
    for (const q of eco.prey) { if (q.gone) continue; const d = dist2(pos.x, pos.z, q.pos.x, q.pos.z); if (d < bd) { bd = d; best = q; } }
    return best;
  };
  eco.eatPrey = (c, q) => {
    K.despawn(q);
    const d = dist2(c.pos.x, c.pos.z, G.player.pos.x, G.player.pos.z);
    G.fx.burst({ x: q.pos.x, y: q.pos.y + 0.4, z: q.pos.z }, 0xd8d2c4, 8, 3, 0.5);
    if (d < 90) {
      K.call(c, c.kind === 'bahnak' ? 'gurgle' : 'screech', 90);
      if (c.kind === 'bahnak') G.log('Z rákosí se ozvalo šplouchnutí. Bahňák ulovil slípku.', d < 45);
      else G.log('Stín se snesl z oblohy a odnesl si kořist. Dravec loví.', d < 45);
    }
  };

  const predatorsIn = (region) => eco.monsters.filter((m) => m.alive && ((region === 'swamp' && m.kind === 'bahnak') || ((region === 'rocks' || region === 'coast') && m.kind === 'dravec'))).length;

  function population(dt) {
    popT -= dt;
    if (popT > 0) return;
    popT = 12;
    for (const region in CAP) {
      const hasPred = region === 'jungle' ? true : predatorsIn(region) > 0;
      eco.gone[region] = hasPred ? 0 : (eco.gone[region] || 0) + 12;
      if (!hasPred && eco.gone[region] >= 36 && !eco.boom[region]) {
        eco.boom[region] = true;
        G.log(region === 'swamp' ? 'Bez Bahňáka je v močálu klid. Slípek rychle přibývá.' : `Bez dravce na obloze se ${region === 'rocks' ? 'v údolí' : 'na pobřeží'} odvažuje ven víc ${PREY_NAME[PREY[region]]}.`, true);
      }
      if (hasPred && eco.boom[region]) { eco.boom[region] = false; G.log(`${REGIONS[region].name}: dravec je zpátky a drobná zvěř se zase schovává.`, false); }
      const cap = Math.round(CAP[region] * (eco.boom[region] ? 1.8 : 1));
      const n = eco.prey.filter((q) => !q.gone && q.region === region).length;
      if (n < cap) addPrey(region);
      else if (n > cap + 1) { const q = eco.prey.find((x) => !x.gone && x.region === region && dist2(x.pos.x, x.pos.z, G.player.pos.x, G.player.pos.z) > 50); if (q) K.despawn(q); }
    }
    eco.prey = eco.prey.filter((q) => !q.gone);
    eco.monsters = eco.monsters.filter((m) => !m.gone);
    // stádo, které přišlo o kusy, spase míň
    for (const h of eco.herds) {
      const live = h.members.filter((m) => m.alive).length;
      if (h.size - live >= 2 && !h.thin) {
        h.thin = true;
        G.log(`${REGIONS[h.region].name}: stádo Trnovců prořídlo. Keře, které dřív spásli, teď stačí dozrát.`, true);
      }
      if (h.thin) for (const pk of world.pickups) if (pk.type === 'plod' && !pk.avail && world.regionAt(pk.x, pk.z) === h.region) pk.timer -= 12;
    }
  }

  function respawns(dt) {
    for (let i = eco.respawns.length - 1; i >= 0; i--) {
      const r = eco.respawns[i];
      r.t -= dt;
      if (r.t > 0) continue;
      const far = (x, z) => dist2(x, z, G.player.pos.x, G.player.pos.z) > 60;
      if (r.kind === 'trnovec') {
        if (!far(r.herd.cx, r.herd.cz)) { r.t = 30; continue; }
        addTrn(r.herd, r.alpha);
        r.herd.thin = false;
        G.log(r.alpha ? 'Na pobřeží se objevil nový starý samec a převzal stádo.' : `${REGIONS[r.herd.region].name}: ke stádu se přidal mladý Trnovec.`, false);
      } else if (r.kind === 'bahnak') {
        if (!far(r.pool.x, r.pool.z)) { r.t = 30; continue; }
        addBahnak(r.pool, r.tag);
        G.log('Do močálu se nastěhoval nový Bahňák. Tůň dlouho prázdná nezůstane.', false);
      } else { addDravec(); G.log('Nad Hromovým údolím zase krouží Bouřný dravec.', false); }
      eco.respawns.splice(i, 1);
    }
  }

  eco.onDefeat = (c, how) => {
    G.quests.onEvent('defeat', { c, how, weather: G.sky.weather, trapped: !!c.wasTrapped });
    if (how === 'repel') {
      G.log(`${c.name} utekl${c.kind === 'dravec' ? ' za obzor' : c.kind === 'bahnak' ? ' zpátky do bahna' : ' do houští'}. Jen tak se nevrátí.`, true);
      G.audio.sfx('quest', 0.5);
    } else G.log(`${c.name} je poražen. Seber z něj suroviny.`, true);
    const t = how === 'kill' ? 260 : 200;
    if (c.kind === 'trnovec') eco.respawns.push({ kind: 'trnovec', t, herd: c.herd, alpha: !!c.alpha });
    else if (c.kind === 'bahnak') eco.respawns.push({ kind: 'bahnak', t, pool: c.pool, tag: c.tag });
    else eco.respawns.push({ kind: 'dravec', t: t + 60 });
    if (G.player.lock === c) G.player.lock = null;
  };

  /* --- suroviny z příšer --- */
  eco.harvest = (c) => {
    const loot = LOOT[c.kind](c);
    c.looted = true;
    G.give(loot);
    G.audio.sfx('pickup');
    G.fx.burst({ x: c.pos.x, y: c.pos.y + 1, z: c.pos.z }, 0xffe9a8, 16, 3, 0.8, 2);
    c.fade = 2.5;
  };
  eco.drop = (mat, x, z, n) => {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), px = x + Math.cos(a) * rand(0.8, 2), pz = z + Math.sin(a) * rand(0.8, 2);
      const g = buildPickup('drop');
      g.position.set(px, Math.max(world.getHeight(px, pz), 0), pz);
      scene.add(g);
      eco.drops.push({ mat, x: px, z: pz, group: g, t: 0 });
    }
  };
  eco.takeDrop = (d) => {
    scene.remove(d.group);
    eco.drops.splice(eco.drops.indexOf(d), 1);
    G.give({ [d.mat]: 1 });
    G.audio.sfx('pickup');
  };

  /* --- pasti, návnady, třaskavky, bahno --- */
  eco.placeTrap = (x, z) => {
    const g = buildTrap();
    g.position.set(x, world.getHeight(x, z), z);
    scene.add(g);
    eco.traps.push({ x, z, group: g });
  };
  eco.placeBait = (x, z) => {
    const g = buildBait();
    g.position.set(x, world.getHeight(x, z), z);
    scene.add(g);
    eco.baits.push({ x, z, group: g, t: 70, eat: 0, gone: false });
  };
  eco.bang = (x, z) => {
    const y = world.getHeight(x, z) + 1;
    G.fx.burst({ x, y, z }, 0xfff6d0, 40, 11, 0.5, 2);
    G.sky.flash = Math.max(G.sky.flash, 0.6);
    G.audio.sfx('bang');
    G.shake(0.25);
    for (const m of eco.monsters) {
      if (!m.alive) continue;
      const d = dist2(m.pos.x, m.pos.z, x, z);
      if (m.kind === 'trnovec' && d < 24) { m.enraged = 0; if (m.state === 'charge' || m.state === 'windup') { m.windT = 1.8; K.set(m, 'winded'); } else if (!['winded', 'trapped', 'limp'].includes(m.state)) K.set(m, 'flee'); m.herd.alarm = true; }
      if (m.kind === 'bahnak' && d < 18) { m.aware = true; m.windT = 2.2; m.yOff = Math.max(m.yOff, -0.3); K.set(m, 'stunned'); }
      if (m.kind === 'dravec' && d < 34 && m.state !== 'roost') {
        if (m.alt > 2) { G.fx.word({ x: m.pos.x, y: m.model.group.position.y + 2, z: m.pos.z }, 'Sražen!', 'weak'); G.reveal('dravec'); }
        m.aware = true; K.set(m, 'stunned');
      }
    }
  };
  const shotGeo = new THREE.IcosahedronGeometry(0.4, 0), shotMat = new THREE.MeshStandardMaterial({ color: 0x4a3d28, flatShading: true });
  eco.shoot = (c, tx, tz) => {
    const m = new THREE.Mesh(shotGeo, shotMat);
    const sx = c.pos.x + Math.sin(c.yaw) * 3, sz = c.pos.z + Math.cos(c.yaw) * 3, sy = c.pos.y + 1.6;
    const T = 0.9;
    m.position.set(sx, sy, sz); scene.add(m);
    eco.shots.push({ m, vx: (tx - sx) / T, vz: (tz - sz) / T, vy: (world.getHeight(tx, tz) - sy) / T + 0.5 * 18 * T });
  };

  function gadgets(dt) {
    const p = G.player;
    for (let i = eco.traps.length - 1; i >= 0; i--) {
      const t = eco.traps[i];
      for (const m of eco.monsters) {
        if (!m.alive || m.alt > 1 || m.state === 'hidden' || m.state === 'trapped') continue;
        if (dist2(m.pos.x, m.pos.z, t.x, t.z) < 1.2 + m.radius * 0.5) {
          m.wasTrapped = true; m.aware = true; K.set(m, m.kind === 'dravec' ? 'stunned' : 'trapped');
          G.audio.sfx('trap'); G.fx.burst({ x: t.x, y: m.pos.y + 0.5, z: t.z }, 0xd8e08a, 14, 4, 0.5);
          G.fx.word({ x: m.pos.x, y: m.pos.y + 2.4, z: m.pos.z }, 'V pasti!', 'weak');
          G.quests.onEvent('trap', { c: m });
          scene.remove(t.group); eco.traps.splice(i, 1);
          break;
        }
      }
    }
    baitT -= dt;
    const scan = baitT <= 0;
    if (scan) baitT = 1;
    for (let i = eco.baits.length - 1; i >= 0; i--) {
      const b = eco.baits[i];
      b.t -= dt;
      if (b.t <= 0 || b.eat > 7) {
        b.gone = true; scene.remove(b.group); eco.baits.splice(i, 1);
        if (b.eat > 7) G.fx.burst({ x: b.x, y: world.getHeight(b.x, b.z) + 0.3, z: b.z }, 0xe2557a, 8, 2, 0.5);
        continue;
      }
      if (!scan) continue;
      for (const m of eco.monsters) {
        if (!m.alive || m.aware || m.bait) continue;
        const ok = (m.kind === 'trnovec' && m.state === 'graze') || (m.kind === 'bahnak' && ['hidden', 'prowl', 'return'].includes(m.state)) || (m.kind === 'dravec' && m.state === 'circle');
        if (ok && dist2(m.pos.x, m.pos.z, b.x, b.z) < (m.kind === 'dravec' ? 70 : 45)) {
          m.bait = b; K.set(m, 'lured');
          if (dist2(m.pos.x, m.pos.z, p.pos.x, p.pos.z) < 70) G.ui.hint('bait' + m.kind, `${m.name} ucítil návnadu a jde za ní.`);
        }
      }
    }
    for (let i = eco.shots.length - 1; i >= 0; i--) {
      const s = eco.shots[i];
      s.vy -= 18 * dt;
      s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
      s.m.rotation.x += dt * 6;
      const gy = Math.max(world.getHeight(s.m.position.x, s.m.position.z), 0);
      const dp = dist2(s.m.position.x, s.m.position.z, p.pos.x, p.pos.z);
      const hitP = dp < 1.3 && Math.abs(s.m.position.y - p.pos.y - 1) < 1.3;
      if (s.m.position.y < gy + 0.2 || hitP) {
        G.fx.burst({ x: s.m.position.x, y: gy + 0.3, z: s.m.position.z }, 0x8a7a4e, 14, 4, 0.5);
        G.audio.sfx('splash', clamp(1.2 - dp / 20, 0, 1));
        if (dp < 2.2 && p.hurt(12, s.m.position.x - s.vx, s.m.position.z - s.vz, 3)) { p.slowT = 3; G.ui.hint('mud', 'Bahno tě zpomalilo. Příště uhni, když Bahňák nafoukne tváře.'); }
        scene.remove(s.m); eco.shots.splice(i, 1);
      }
    }
    for (const d of eco.drops) { d.t += dt; d.group.rotation.y += dt * 2; d.group.children[0].position.y = 0.45 + Math.sin(d.t * 3) * 0.1; }
  }

  function ambientCalls(dt) {
    callT -= dt;
    if (callT > 0) return;
    callT = rand(13, 28);
    const p = G.player.pos;
    const near = eco.monsters.filter((m) => m.alive && !m.aware && dist2(m.pos.x, m.pos.z, p.x, p.z) < 170);
    if (!near.length) return;
    const c = pick(near);
    if (c.kind === 'trnovec' && !G.sky.isNight()) K.call(c, 'snort', 170, 0.7);
    if (c.kind === 'bahnak') K.call(c, c.state === 'hidden' ? 'bubble' : 'gurgle', 150, 0.9);
    if (c.kind === 'dravec' && c.alt > 5) K.call(c, 'screech', 260, 0.6);
  }

  function herds(dt) {
    const sky = G.sky;
    for (const h of eco.herds) {
      h.moveT -= dt;
      if (h.moveT <= 0 && !h.alarm) {
        h.moveT = rand(35, 70);
        // za deště se stádo stahuje ke středu oblasti pod stromy
        const r = sky.k.rain > 0.5 ? 15 : 45, a = rand(TAU);
        const x = h.home.x + Math.cos(a) * r, z = h.home.z + Math.sin(a) * r;
        if (world.getHeight(x, z) > 1.2 && world.regionAt(x, z) === h.region) { h.cx = x; h.cz = z; }
      }
    }
  }

  // pozorování z úkrytu přidává poznámky do deníku
  function observe(dt) {
    const p = G.player;
    for (const m of eco.monsters) {
      if (!m.alive || m.aware) continue;
      const d = dist2(m.pos.x, m.pos.z, p.pos.x, p.pos.z);
      if (d > (m.kind === 'dravec' ? 70 : 34) || (m.kind === 'trnovec' && m.herd.alarm)) continue;
      m.obs += dt;
      if (m.obs > 8) { m.obs = 0; G.observe(m.kind); }
      if (m.kind === 'trnovec' && d < 28) G.quests.onEvent('found', { kind: 'trnovec' });
    }
  }

  eco.update = (dt) => {
    for (const m of eco.monsters) {
      K.update(m, dt);
      if (m.gone) continue;
      if (m.fade !== undefined) { m.fade -= dt; m.model.group.scale.multiplyScalar(Math.max(0.01, 1 - dt * 0.9)); if (m.fade <= 0) K.despawn(m); }
      else if (!m.alive && m.t > 150) K.despawn(m);
    }
    for (const q of eco.prey) K.update(q, dt);
    if (!G.player) return;
    gadgets(dt); population(dt); respawns(dt); ambientCalls(dt); herds(dt); observe(dt);
  };
  eco.hit = K.hit;
  eco.springBahnak = () => eco.monsters.find((m) => m.kind === 'bahnak' && m.tag === 'spring' && !m.gone);
  return eco;
}
