import * as THREE from 'three';
import { clamp, lerp, dist2, fmtHour } from './util.js';
import { BEASTS, OBSERVE, MATS, CONTROLS } from './data.js';
import { createWorld } from './world.js';
import { createSky } from './sky.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createTracks } from './tracks.js';
import { createPlayer } from './player.js';
import { createEco } from './eco.js';
import { createQuests } from './quests.js';
import { createUI } from './ui.js';

const SAVE_KEY = 'lovci-priser-v1';
const $ = (id) => document.getElementById(id);

function freshState() {
  return {
    v: 1, mats: {}, items: { obklad: 2, past: 0, navnada: 0, traskavka: 0 }, weapons: ['tesak'], armors: ['kazajka'], weapon: 'tesak', armor: 'kazajka',
    sharp: {}, done: [], active: null, prog: {}, know: { trnovec: 0, bahnak: 0, dravec: 0 }, weak: {}, log: [], sel: 'obklad',
    unlocked: ['camp', 'jungle'], marks: [], hints: [], hour: 7, day: 1, started: false,
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    const s = JSON.parse(raw);
    return s && s.v === 1 ? { ...freshState(), ...s } : freshState();
  } catch (err) { return freshState(); }
}

const canvas = $('game');
const touchDevice = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer:coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchDevice, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touchDevice ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(touchDevice ? 66 : 60, innerWidth / innerHeight, 0.3, 1500);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const G = { scene, camera, renderer, lowSpec: touchDevice, mode: 'title', hitstop: 0, shakeAmt: 0, state: loadState() };
window.G = G;
const hadSave = G.state.started;

G.shake = (a) => { G.shakeAmt = Math.max(G.shakeAmt, a); };
G.save = () => {
  if (G.sky) { G.state.hour = G.sky.hour; G.state.day = G.sky.day; }
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (err) { /* plné úložiště nebo soukromé okno: hraje se dál bez ukládání */ }
};
G.newGame = () => { try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* nic */ } location.reload(); };
G.log = (text, loud) => {
  const s = G.state;
  s.log.push({ t: `den ${G.sky.day}, ${fmtHour(G.sky.hour)}`, x: text });
  if (s.log.length > 70) s.log.shift();
  if (loud) G.ui.toast(text, 'info'); else G.ui.feed(text);
};
G.give = (loot) => {
  const parts = [];
  for (const k in loot) { G.state.mats[k] = (G.state.mats[k] || 0) + loot[k]; parts.push(`${loot[k]}× ${MATS[k]}`); }
  G.ui.feed('Sebráno: ' + parts.join(', '));
  G.quests.check();
};
G.learn = (kind, n) => {
  const s = G.state, B = BEASTS[kind], before = s.know[kind];
  s.know[kind] = before + n;
  if (before === 0) G.log(`Nový zápis v deníku: ${B.name}.`, false);
  for (const nt of B.notes) if (nt.need > 1 && before < nt.need && s.know[kind] >= nt.need) { G.log(`Deník: víš o něco víc (${B.name}). Mrkni do deníku klávesou J.`, true); if (nt.need === 5) s.weak[kind] = true; }
};
G.observe = (kind) => {
  const s = G.state;
  if (s.know[kind] >= 5) return;
  const lines = OBSERVE[kind];
  G.ui.toast('Pozoruješ: ' + lines[s.know[kind] % lines.length], 'track');
  G.learn(kind, 1);
};
G.reveal = (kind) => {
  if (G.state.weak[kind]) return;
  G.state.weak[kind] = true;
  if (G.state.know[kind] === 0) G.state.know[kind] = 1;
  G.log(`Přišel jsi na slabinu: ${BEASTS[kind].name}. Je zapsaná v deníku.`, true);
};

G.world = createWorld(G);
G.sky = createSky(G);
G.sky.hour = G.state.hour; G.sky.day = G.state.day;
G.audio = createAudio();
G.input = createInput(G);
G.fx = createFx(G);
G.ui = createUI(G);
G.tracks = createTracks(G);
G.player = createPlayer(G);
G.eco = createEco(G);
G.quests = createQuests(G);
G.player.equip();
G.player.pos.y = G.world.getHeight(G.player.pos.x, G.player.pos.z);
G.player.model.group.position.copy(G.player.pos);
G.player.model.group.rotation.y = Math.PI;

/* --- počasí a hromy --- */
G.sky.onWeather = (w) => {
  const msg = {
    clear: 'Vyjasnilo se. Trnovci vylézají z houští zpátky na pastvu.',
    rain: 'Začíná pršet. V mokré zemi teď budou stopy líp vidět a Bahňák vyleze z bahna.',
    fog: 'Padá mlha. Hůř uvidíš ty, ale i příšery tebe.',
    storm: 'Blíží se bouřka. Stáda jsou nervózní a nad údolím se může objevit Bouřný dravec.',
  }[w];
  if (G.mode === 'play') G.log(msg, true);
};
G.sky.onLightning = (x, z, delay) => {
  const p = G.player.pos, d = dist2(x, z, p.x, p.z);
  setTimeout(() => G.audio.sfx('thunder', clamp(1.2 - d / 320, 0.25, 1), clamp((x - p.x) / 200, -1, 1)), delay * 1000);
  for (const h of G.eco.herds) {
    const m = h.members.find((c) => c.alive);
    if (m && !h.alarm && dist2(x, z, h.cx, h.cz) < 90 && Math.random() < 0.5) {
      h.alert(m);
      if (dist2(h.cx, h.cz, p.x, p.z) < 110 && G.mode === 'play') G.ui.feed('Hrom vyplašil stádo Trnovců.');
    }
  }
};

/* --- odpočinek a omdlení --- */
const fadeEl = $('fade');
function fade(fn) {
  fadeEl.classList.add('on');
  setTimeout(() => { fn(); G.player.camera(0, true); setTimeout(() => fadeEl.classList.remove('on'), 350); }, 550);
}
G.rest = (kind) => {
  fade(() => {
    const sky = G.sky;
    if (kind === 'morning') { sky.skipTo(6.6); if (sky.weather !== 'clear' && Math.random() < 0.6) sky.setWeather('clear', true); G.log('Vyspal ses do rána.', true); }
    else if (kind === 'night') { sky.skipTo(21); G.log('Setmělo se. V noci je ostrov jiný a nebezpečnější.', true); }
    else { sky.hour = (sky.hour + 1.5) % 24; sky.rollWeather(true); sky.onWeather(sky.weather); }
    G.player.hp = G.player.maxHp;
    G.ui.refresh(); G.save();
  });
};
let dying = false;
G.onDeath = () => {
  if (dying) return;
  dying = true;
  fade(() => {
    G.player.respawn();
    G.sky.skipTo(6.6);
    G.log('Omdlel jsi. Radovan tě našel a dotáhl do tábora. Je ráno dalšího dne.', true);
    dying = false; G.save();
  });
};

/* --- co je po ruce (klávesa E) --- */
const PICK_NAME = { list: 'léčivý list', vlakno: 'vlákno z lián', plod: 'sladké plody', kamen: 'kámen', ruda: 'jiskřivou rudu', musle: 'mušle', hliza: 'bahenní hlízu' };
function findInteract() {
  const p = G.player.pos, w = G.world;
  let best = null, bd = 1e9;
  const consider = (d, max, o) => { if (d < max && d < bd) { bd = d; best = o; } };
  if (G.player.inCamp) for (const s of w.stations) consider(dist2(p.x, p.z, s.x, s.z) - 1, 2.6, { label: s.label, act: () => G.ui.openCamp(s.id) });
  for (const c of G.eco.monsters) if (!c.alive && !c.gone && !c.looted && c.state === 'dead') consider(dist2(p.x, p.z, c.pos.x, c.pos.z) - c.radius, 2.2, { label: `Sebrat suroviny (${c.name})`, act: () => G.eco.harvest(c) });
  for (const d of G.eco.drops) consider(dist2(p.x, p.z, d.x, d.z), 2.2, { label: `Sebrat: ${MATS[d.mat]}`, act: () => G.eco.takeDrop(d) });
  for (const pk of w.pickups) {
    if (!pk.avail) continue;
    consider(dist2(p.x, p.z, pk.x, pk.z), 2.1, {
      label: `Sebrat ${PICK_NAME[pk.type]}`,
      act: () => { pk.avail = false; pk.timer = 240; pk.group.visible = false; G.give({ [pk.type]: pk.type === 'vlakno' || pk.type === 'plod' ? 2 : 1 }); G.audio.sfx('pickup'); },
    });
  }
  const t = G.tracks.nearest(p.x, p.z, 2.6);
  if (t) consider(Math.hypot(t.x - p.x, t.z - p.z) + (t.seen ? 1.5 : 0.3), 4.2, { label: t.seen ? 'Prohlédnout stopu znovu' : 'Prozkoumat stopu', act: () => G.tracks.examine(t) });
  return best;
}

/* --- úvodní obrazovka --- */
$('titleKeys').innerHTML = touchDevice
  ? '<span>páčka vlevo: pohyb</span><span>tah po obrazovce: kamera</span><span>tlačítka vpravo: útok, úskok, akce</span>'
  : CONTROLS.slice(0, 9).map(([k, d]) => `<span><b>${k}</b> ${d}</span>`).join('');
$('titleLoad').classList.add('hidden');
$('titleBtns').classList.remove('hidden');
if (hadSave) { $('btnContinue').classList.remove('hidden'); $('btnNew').textContent = 'Začít znovu od začátku'; $('btnNew').classList.add('ghost'); }

function start() {
  G.audio.init();
  G.mode = 'play';
  $('title').classList.add('gone');
  setTimeout(() => $('title').classList.add('hidden'), 900);
  $('hud').classList.remove('hidden');
  G.input.clear();
  G.player.camera(0, true);
  if (!G.state.started) {
    G.state.started = true;
    G.log('Vylodil ses na ostrově. V táboře u ohně čeká starý lovec Radovan.', false);
    G.ui.toast('Dojdi k Radovanovi u nástěnky a zmáčkni ' + (touchDevice ? 'Akce' : 'E') + '. Dá ti první úkol.', 'info');
  } else if (G.state.active) G.quests.reseed();
  G.ui.refresh(); G.save();
}
$('btnContinue').addEventListener('click', start);
$('btnNew').addEventListener('click', () => {
  if (!hadSave) { start(); return; }
  try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* nic */ }
  location.reload();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.mode === 'play' && !G.ui.isOpen() && !dying) G.ui.openPause();
});

/* --- hlavní smyčka --- */
const env = { storm: 0, rain: 0, coast: 0, camp: 0, jungle: 0, swamp: 0, night: 0, high: 0 };
let last = performance.now(), saveT = 20, titleA = 0, prompt = null;
const focus = new THREE.Vector3();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const real = dt;
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.06; }
  G.shakeAmt = Math.max(0, G.shakeAmt - real * 1.6);
  const p = G.player, inp = G.input, ui = G.ui;

  if (G.mode === 'play') {
    if (ui.isOpen()) {
      if (inp.hit('esc') || inp.hit('map') || inp.hit('journal')) ui.close();
      inp.clear();
    } else {
      if (inp.hit('map')) ui.openMap();
      else if (inp.hit('journal')) ui.openJournal();
      else if (inp.hit('esc')) ui.openPause();
      else {
        G.sky.update(dt, camera.position, p.pos);
        p.update(dt);
        G.eco.update(dt);
        G.tracks.update(dt);
        G.quests.update(dt);
        prompt = p.state === 'dead' ? null : findInteract();
        ui.prompt(prompt ? prompt.label : null);
        if (inp.hit('interact') && prompt && p.state === 'idle') { prompt.act(); ui.refresh(); }
        saveT -= dt;
        if (saveT <= 0) { saveT = 20; ui.refresh(); G.save(); }
      }
    }
    focus.copy(p.pos);
  } else {
    titleA += dt * 0.06;
    const c = G.world.camp;
    camera.position.set(c.x + Math.cos(titleA) * 26, c.y + 9, c.z + Math.sin(titleA) * 26);
    camera.lookAt(c.x, c.y + 2.5, c.z);
    focus.set(c.x, c.y, c.z);
    G.sky.update(dt, camera.position, focus);
    G.eco.update(dt);
  }

  G.world.update(dt);
  G.fx.update(real);
  // zvuk prostředí podle toho, kde hráč stojí
  const reg = p.region || 'camp', k = G.sky.k, e = Math.min(1, real * 2);
  const h = p.pos.y;
  env.storm = k.storm; env.rain = k.rain; env.night = G.sky.nightK;
  env.coast = lerp(env.coast, reg === 'coast' ? 1 : clamp((4 - h) / 4, 0, 0.6), e);
  env.camp = lerp(env.camp, clamp(1 - dist2(p.pos.x, p.pos.z, G.world.camp.x, G.world.camp.z) / 30, 0, 1), e);
  env.jungle = lerp(env.jungle, reg === 'jungle' ? 1 : reg === 'camp' ? 0.4 : 0, e);
  env.swamp = lerp(env.swamp, reg === 'swamp' ? 1 : 0, e);
  env.high = lerp(env.high, reg === 'rocks' ? 1 : 0, e);
  G.audio.update(real, env);
  ui.update(real);
  renderer.render(scene, camera);
}
G.frame = frame;
requestAnimationFrame(frame);
addEventListener('beforeunload', () => { if (G.mode === 'play') G.save(); });
