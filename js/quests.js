import { QUESTS, REGIONS, MATS, RECIPES, ITEMS, WEAPONS, ARMORS } from './data.js';
import { dist2, lerp } from './util.js';

// Úkoly jdou za sebou. Každý má pár kroků a končí návratem do tábora.
export function createQuests(G) {
  const st = G.state, world = G.world;
  const def = (id = st.active) => QUESTS.find((q) => q.id === id) || null;
  const next = () => QUESTS.find((q) => !st.done.includes(q.id)) || null;
  let awayT = 0;

  function herdOf(region) { return G.eco.herds.find((h) => h.region === region); }

  function seed(id) {
    const c = world.camp, T = G.tracks;
    const from = (tx, tz, f) => [lerp(c.x, tx, f), lerp(c.z, tz, f)];
    if (id === 'q1' || id === 'q2') {
      const h = herdOf('jungle'), [x, z] = from(h.cx, h.cz, 0.42);
      T.seedTrail('trnovec', x, z, h.cx, h.cz, 10, ['print', 'print', 'scratch', 'print', 'food']);
    } else if (id === 'q5') {
      const h = herdOf('coast'), [x, z] = from(h.cx, h.cz, 0.4);
      T.seedTrail('trnovec', x, z, h.cx, h.cz, 9, ['print', 'print', 'food']);
    } else if (id === 'q3' || id === 'q4') {
      const b = G.eco.monsters.find((m) => m.kind === 'bahnak' && m.alive) || { pool: world.pools[0] };
      const [x, z] = from(b.pool.x, b.pool.z, 0.5);
      T.seedTrail('bahnak', x, z, b.pool.x, b.pool.z, 8, ['print', 'drag', 'print', 'food']);
    } else if (id === 'q6') {
      const n = world.nest, [x, z] = from(n.x, n.z, 0.45);
      T.seedTrail('dravec', x, z, n.x, n.z, 8, ['feather', 'feather', 'print']);
    }
  }

  function accept(id) {
    st.active = id;
    st.prog = { tracks: 0, found: false, defeated: false, cleared: false, done: false, trapUsed: false };
    seed(id);
    const q = def();
    G.log(`Nový úkol: ${q.title}. Vyraz do oblasti ${REGIONS[q.region].name}.`, true);
    G.audio.sfx('quest', 0.7);
    G.ui.refresh(); G.save();
  }

  function finish() {
    if (st.prog.done) return;
    st.prog.done = true;
    G.log('Úkol je splněn. Vrať se do tábora za Radovanem.', true);
    G.audio.sfx('quest');
    G.save();
  }

  function check() {
    const q = def(), p = st.prog;
    if (!q || p.done) return;
    if (q.id === 'q1' && p.tracks >= 3 && p.found) finish();
    if (q.id === 'q2' && p.defeated && (st.mats.trn || 0) >= 2) finish();
    if (q.id === 'q3' && p.tracks >= 2 && p.cleared) finish();
    if (q.id === 'q4' && p.defeated) finish();
    if (q.id === 'q5' && p.defeated) finish();
    if (q.id === 'q6' && p.defeated && (st.mats.pero || 0) >= 1) finish();
    G.ui.refresh();
  }

  function onEvent(type, d) {
    const q = def(), p = st.prog;
    if (!q || p.done) return;
    if (type === 'track') {
      const want = q.id === 'q1' ? 'trnovec' : q.id === 'q3' ? 'bahnak' : null;
      if (d.kind !== want) return;
      p.tracks++;
      if (q.id === 'q1' && p.tracks === 3) G.ui.toast('Tři stopy stačí. Vedou stejným směrem, stádo bude blízko.', 'info');
    } else if (type === 'found') {
      if (q.id !== 'q1' || p.tracks < 3 || p.found) return;
      p.found = true;
      G.log('Našel jsi stádo Trnovců. Chvíli je pozoruj, nebo se rovnou vrať.', true);
    } else if (type === 'trap') {
      if (q.id === 'q5' && d.c.alpha) { p.trapUsed = true; G.ui.toast('Starý samec šlápl do pasti. Tenhle souboj se Radovanovi počítat nebude.', 'warn'); }
    } else if (type === 'defeat') {
      const c = d.c;
      if (q.id === 'q2' && c.kind === 'trnovec') p.defeated = true;
      if (q.id === 'q3' && c.kind === 'bahnak' && c.tag === 'spring') p.cleared = true;
      if (q.id === 'q4' && c.kind === 'bahnak') {
        if (d.weather !== 'clear') p.defeated = true;
        else G.ui.toast('Je jasno. Radovan chtěl lov za deště, mlhy nebo bouřky, tohle se nepočítá.', 'warn');
      }
      if (q.id === 'q5' && c.alpha && d.how === 'kill') {
        if (d.trapped || p.trapUsed) { p.trapUsed = false; G.ui.toast('Použil jsi past. Počkej, až stádo převezme nový samec, a zkus to bez ní.', 'warn'); }
        else p.defeated = true;
      }
      if (q.id === 'q6' && c.kind === 'dravec') p.defeated = true;
    }
    check();
  }

  function update(dt) {
    const q = def(), p = st.prog;
    if (!q || p.done) return;
    if (q.id === 'q3' && p.tracks >= 2 && !p.cleared) {
      const b = G.eco.springBahnak();
      const away = !b || !b.alive || dist2(b.pos.x, b.pos.z, world.spring.x, world.spring.z) > 34;
      awayT = away ? awayT + dt : 0;
      if (awayT > 10) { p.cleared = true; G.log('Bahňák je od pramene pryč. K vodě se zase dá jít.', true); check(); }
    }
  }

  function stepText() {
    const q = def(), p = st.prog;
    if (!q) return next() ? 'Zajdi v táboře za Radovanem pro další úkol.' : 'Všechny úkoly máš splněné. Ostrov je tvůj, lov podle chuti.';
    if (p.done) return 'Hotovo. Vrať se do tábora za Radovanem.';
    const up = G.sky.isNight() || G.sky.weather === 'storm';
    switch (q.id) {
      case 'q1': return p.tracks < 3 ? `Najdi v džungli stopy Trnovce a prozkoumej je (${p.tracks}/3).` : 'Jdi směrem, kam stopy vedou, a najdi stádo. Bojovat nemusíš.';
      case 'q2': return !p.defeated ? 'Ulov nebo zažeň jednoho Trnovce.' : `Seber trny, které po něm zbyly (${st.mats.trn || 0}/2).`;
      case 'q3': return p.tracks < 2 ? `Najdi v močálu stopy Bahňáka (${p.tracks}/2).` : 'Dostaň Bahňáka od pramene: odlákej ho, zažeň, nebo poraz.';
      case 'q4': return G.sky.weather === 'clear' ? 'Počkej na déšť, mlhu nebo bouřku. Ve stanu v táboře můžeš počasí přečkat.' : 'Teď! Poraz nebo zažeň Bahňáka, dokud je venku.';
      case 'q5': return 'Najdi na pobřeží starého samce a poraz ho bez pastí.';
      case 'q6': return p.defeated ? `Seber bouřné pero (${st.mats.pero || 0}/1).` : up ? 'Dravec je ve vzduchu. Hledej ho nad Hromovým údolím.' : 'Dravec teď spí na hnízdě. Přijď v noci nebo za bouřky, nebo se k němu připliž.';
      default: return '';
    }
  }

  // přibližné místo pro kompas a mapu, nikdy přesná poloha příšery
  function target() {
    const q = def();
    if (!q || st.prog.done) return { x: world.camp.x, z: world.camp.z, r: 0, camp: true };
    if (q.id === 'q3' || q.id === 'q4') return { x: world.spring.x, z: world.spring.z, r: 50 };
    if (q.id === 'q6') return { x: REGIONS.rocks.x, z: REGIONS.rocks.z, r: 60 };
    const h = herdOf(q.region);
    return h ? { x: h.home.x, z: h.home.z, r: 60 } : { x: REGIONS[q.region].x, z: REGIONS[q.region].z, r: 60 };
  }

  function turnIn() {
    const q = def();
    if (!q || !st.prog.done) return null;
    const r = q.reward;
    st.done.push(q.id); st.active = null; st.prog = {};
    if (r.mats) for (const k in r.mats) st.mats[k] = (st.mats[k] || 0) + r.mats[k];
    if (r.unlock && !st.unlocked.includes(r.unlock)) st.unlocked.push(r.unlock);
    G.log(`Splněno: ${q.title}. ${r.text}`, false);
    const got = RECIPES.filter((x) => x.unlock === q.id).map((x) => (ITEMS[x.id] || WEAPONS[x.id] || ARMORS[x.id] || { n: 'Nabroušení zbraně' }).n);
    G.audio.sfx('quest');
    G.ui.refresh(); G.save();
    return { q, recipes: got, mats: r.mats ? Object.entries(r.mats).map(([k, v]) => `${v}× ${MATS[k]}`).join(', ') : '' };
  }

  function abandon() { st.active = null; st.prog = {}; G.ui.refresh(); G.save(); }

  return { reseed: () => { if (st.active && !st.prog.done) seed(st.active); }, def, next, accept, onEvent, update, stepText, target, turnIn, abandon, check };
}
