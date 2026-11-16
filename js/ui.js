import * as THREE from 'three';
import { clamp, angDiff, fmtHour, TAU } from './util.js';
import { REGIONS, MATS, ITEMS, ITEM_ORDER, WEAPONS, ARMORS, RECIPES, BEASTS, QUESTS, WEATHER_NAME, CONTROLS } from './data.js';

const $ = (id) => document.getElementById(id);
const ICON = {
  obklad: '<svg viewBox="0 0 40 40"><path d="M8 30C6 16 16 6 32 6c2 16-8 26-22 24z" fill="#5fae7a" stroke="#2b2117" stroke-width="2"/><path d="M10 29L27 12" stroke="#2b2117" stroke-width="2" fill="none"/></svg>',
  past: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="24" rx="14" ry="8" fill="none" stroke="#2b2117" stroke-width="3"/><path d="M8 22l3-9 3 8m5-10l3 10m5-9l2 9" stroke="#8a5a2a" stroke-width="2.5" fill="none"/></svg>',
  navnada: '<svg viewBox="0 0 40 40"><circle cx="16" cy="24" r="9" fill="#c9557a" stroke="#2b2117" stroke-width="2"/><circle cx="27" cy="20" r="6" fill="#e8a23a" stroke="#2b2117" stroke-width="2"/><path d="M17 15c1-5 4-7 7-8" stroke="#56682f" stroke-width="2.5" fill="none"/></svg>',
  traskavka: '<svg viewBox="0 0 40 40"><circle cx="20" cy="24" r="10" fill="#d8d2c4" stroke="#2b2117" stroke-width="2"/><path d="M20 14c0-5 4-4 5-8" stroke="#2b2117" stroke-width="2" fill="none"/><path d="M26 3l1 3 3-1-2 3 3 1-3 1" stroke="#e8862a" stroke-width="1.8" fill="none"/></svg>',
};

export function createUI(G) {
  const st = () => G.state;
  const overlay = $('overlay'), sheet = $('sheet');
  let open = null, tab = '', feedItems = [], hurtT = 0, lastHp = -1, mapTimer = 0;
  const v = new THREE.Vector3();

  if (G.input.isTouch) { $('touch').classList.remove('hidden'); document.body.classList.add('touch'); }

  /* ---------- hlášky ---------- */
  function toast(text, kind = 'info') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 4600 + text.length * 28);
    setTimeout(() => el.remove(), 5200 + text.length * 28);
  }
  // rada, která se ukáže jen jednou za hru
  function hint(key, text) {
    if (st().hints.includes(key)) return;
    st().hints.push(key);
    toast(text, 'info');
  }
  function feed(text) {
    const el = document.createElement('div');
    el.className = 'feedItem'; el.textContent = text;
    $('feed').appendChild(el);
    feedItems.push({ el, t: 9 });
    if (feedItems.length > 4) feedItems.shift().el.remove();
  }
  function prompt(text) {
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const html = (G.input.isTouch ? '<b>Akce</b> ' : '<b>E</b> ') + text;
    if (el.dataset.t !== html) { el.dataset.t = html; el.innerHTML = html; }
  }
  function hurt() { hurtT = 1; }

  /* ---------- HUD ---------- */
  function refresh() {
    const s = st(), q = G.quests.def();
    $('questTitle').textContent = q ? q.title : 'Bez úkolu';
    $('questStep').textContent = G.quests.stepText();
    $('slotIcon').innerHTML = ICON[s.sel];
    $('slotName').textContent = ITEMS[s.sel].n;
    $('slotCount').textContent = s.items[s.sel] || 0;
    $('slotCount').classList.toggle('zero', !s.items[s.sel]);
    $('slotHint').textContent = G.input.isTouch ? '' : 'Q použít · 1–4 výběr';
  }

  const cv = $('compass'), cx = cv.getContext('2d');
  function compass() {
    const p = G.player, w = cv.width, h = cv.height;
    const bearing = Math.atan2(Math.sin(p.camYaw), -Math.cos(p.camYaw));
    const span = 2.1;
    cx.clearRect(0, 0, w, h);
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const X = (b) => w / 2 + (angDiff(bearing, b) / span) * (w / 2);
    for (let i = 0; i < 24; i++) {
      const b = (i / 24) * TAU, x = X(b);
      if (x < 6 || x > w - 6) continue;
      const fade = 1 - Math.abs(x - w / 2) / (w / 2);
      cx.globalAlpha = 0.25 + fade * 0.75;
      cx.fillStyle = '#f4ead2';
      if (i % 6 === 0) { cx.font = '700 24px "Amatic SC", sans-serif'; cx.fillText('SVJZ'[i / 6], x, 16); }
      else cx.fillRect(x - 1, i % 3 === 0 ? 9 : 13, 2, i % 3 === 0 ? 14 : 6);
    }
    cx.globalAlpha = 1;
    const mark = (tx, tz, draw) => {
      const b = Math.atan2(tx - p.pos.x, -(tz - p.pos.z));
      const x = clamp(X(b), 10, w - 10);
      cx.save(); cx.translate(x, 33); draw(); cx.restore();
    };
    const t = G.quests.target();
    if (!p.inCamp) mark(G.world.camp.x, G.world.camp.z, () => { cx.fillStyle = '#e8c27a'; cx.beginPath(); cx.moveTo(-6, 5); cx.lineTo(0, -6); cx.lineTo(6, 5); cx.closePath(); cx.fill(); });
    if (!t.camp) mark(t.x, t.z, () => { cx.fillStyle = '#e2603a'; cx.rotate(Math.PI / 4); cx.fillRect(-4.5, -4.5, 9, 9); });
    cx.fillStyle = '#f4ead2'; cx.fillRect(w / 2 - 1, 0, 2, 5);
  }

  function update(dt) {
    for (let i = feedItems.length - 1; i >= 0; i--) { const f = feedItems[i]; f.t -= dt; if (f.t < 1) f.el.style.opacity = Math.max(0, f.t); if (f.t <= 0) { f.el.remove(); feedItems.splice(i, 1); } }
    const p = G.player;
    if (!p || G.mode !== 'play') return;
    $('hpFill').style.width = (p.hp / p.maxHp) * 100 + '%';
    $('staFill').style.width = p.sta + '%';
    if (lastHp !== p.maxHp) { lastHp = p.maxHp; document.querySelector('.bar.hp').style.width = Math.round(p.maxHp * 1.5) + 'px'; }
    hurtT = Math.max(0, hurtT - dt * 1.6);
    const low = p.hp < p.maxHp * 0.3 ? 0.35 + Math.sin(performance.now() / 200) * 0.12 : 0;
    $('vignette').style.opacity = Math.max(hurtT * 0.8, low);
    const sky = G.sky;
    $('clockTime').textContent = fmtHour(sky.hour);
    $('clockInfo').textContent = `den ${sky.day} · ${WEATHER_NAME[sky.weather]} · ${REGIONS[p.region || 'camp'].name}`;
    compass();
    // cíl zaměření a ukazatel zdraví příšery
    const ret = $('reticle'), tgt = p.lock || (p.lastTarget && p.lastTarget.alive && p.lastTarget.lastHit < 6 ? p.lastTarget : null);
    if (p.lock) {
      v.set(p.lock.pos.x, p.lock.model.group.position.y + 1.4, p.lock.pos.z).project(G.camera);
      ret.classList.toggle('hidden', v.z > 1);
      ret.style.transform = `translate(-50%,-50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px,${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
    } else ret.classList.add('hidden');
    $('boss').classList.toggle('hidden', !tgt);
    if (tgt) {
      $('bossName').textContent = st().know[tgt.kind] > 0 ? tgt.name : BEASTS[tgt.kind].unknown;
      $('bossFill').style.width = clamp(tgt.hp / tgt.maxHp, 0, 1) * 100 + '%';
    }
    if (open === 'map') { mapTimer -= dt; if (mapTimer <= 0) { mapTimer = 0.25; drawMap(); } }
  }

  /* ---------- okna ---------- */
  function show(kind, t) {
    open = kind; tab = t;
    overlay.classList.remove('hidden');
    overlay.dataset.kind = kind;
    G.input.unlock(); G.input.clear();
    render();
  }
  function close() {
    if (!open) return;
    open = null; overlay.classList.add('hidden'); G.input.clear();
    refresh();
  }
  const tabs = (list) => `<nav class="tabs">${list.map(([id, n]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${n}</button>`).join('')}<button data-act="close" class="x">Zavřít</button></nav>`;
  const cost = (c) => Object.entries(c).map(([k, n]) => `<span class="${(st().mats[k] || 0) >= n ? 'ok' : 'no'}">${MATS[k]} ${st().mats[k] || 0}/${n}</span>`).join('');
  const canPay = (c) => Object.entries(c).every(([k, n]) => (st().mats[k] || 0) >= n);
  const rname = (r) => (ITEMS[r.id] || WEAPONS[r.id] || ARMORS[r.id] || { n: 'Nabroušení zbraně', d: 'Zbraň, kterou máš právě v ruce, bude bít o čtvrtinu silněji.' });

  function questsTab() {
    const s = st(), q = G.quests.def(), n = G.quests.next();
    let h = '<div class="who"><b>Radovan</b><span>starý lovec, co na ostrově zůstal</span></div>';
    if (q) {
      h += `<article class="card"><h3>${q.title}</h3><p class="say">${q.brief}</p><p class="step">${G.quests.stepText()}</p>`;
      h += s.prog.done ? '<button class="btn" data-act="turnin">Odevzdat úkol</button>' : '<button class="btn ghost" data-act="abandon">Vzdát úkol</button>';
      h += '</article>';
    } else if (n) {
      h += `<article class="card"><h3>${n.title}</h3><p class="say">${n.brief}</p><p class="step">Oblast: ${REGIONS[n.region].name}</p><button class="btn" data-act="accept" data-id="${n.id}">Přijmout úkol</button></article>`;
    } else h += '<article class="card"><h3>Volný lov</h3><p class="say">„Víc tě nenaučím. Ostrov znáš, tak si hleď, ať na něm něco zůstane i pro ty po tobě.“</p></article>';
    if (s.done.length) h += '<h4>Splněno</h4><ul class="done">' + s.done.map((id) => `<li>${QUESTS.find((x) => x.id === id).title}</li>`).join('') + '</ul>';
    return h;
  }
  function gearTab() {
    const s = st();
    let h = '<h4>Zbraň</h4><div class="grid">';
    for (const id of s.weapons) h += `<button class="pick ${s.weapon === id ? 'on' : ''}" data-act="weapon" data-id="${id}"><b>${WEAPONS[id].n}${s.sharp[id] ? ' (nabroušeno)' : ''}</b><span>${WEAPONS[id].d}</span></button>`;
    h += '</div><h4>Oblečení</h4><div class="grid">';
    for (const id of s.armors) h += `<button class="pick ${s.armor === id ? 'on' : ''}" data-act="armor" data-id="${id}"><b>${ARMORS[id].n}</b><span>${ARMORS[id].d}</span></button>`;
    h += '</div><h4>V brašně</h4><div class="grid">';
    for (const id of ITEM_ORDER) h += `<div class="pick flat"><b>${ITEMS[id].n} <i>${s.items[id] || 0}/${ITEMS[id].max}</i></b><span>${ITEMS[id].d}</span></div>`;
    h += '</div><button class="btn" data-act="refill">Doplnit ze zásob tábora</button><p class="note">Tábor ti vždycky dá dva obklady a jednu past. Zbytek si vyrob v dílně.</p>';
    return h;
  }
  function craftTab() {
    const s = st();
    let h = '<div class="grid">';
    for (const r of RECIPES) {
      if (r.unlock && !s.done.includes(r.unlock)) continue;
      const it = rname(r);
      let state = '', dis = !canPay(r.cost);
      if (r.type === 'weapon' && s.weapons.includes(r.id)) { state = 'Už máš'; dis = true; }
      if (r.type === 'armor' && s.armors.includes(r.id)) { state = 'Už máš'; dis = true; }
      if (r.type === 'item' && (s.items[r.id] || 0) >= ITEMS[r.id].max) { state = 'Plná brašna'; dis = true; }
      if (r.type === 'upgrade' && s.sharp[s.weapon]) { state = 'Nabroušeno'; dis = true; }
      const cnt = r.type === 'item' ? ` <i>${s.items[r.id] || 0}/${ITEMS[r.id].max}</i>` : '';
      h += `<div class="pick flat"><b>${it.n}${cnt}</b><span>${it.d}</span><div class="cost">${cost(r.cost)}</div><button class="btn sm" data-act="craft" data-id="${r.id}" ${dis ? 'disabled' : ''}>${state || 'Vyrobit'}</button></div>`;
    }
    h += '</div><h4>Suroviny</h4><div class="mats">';
    const have = Object.keys(MATS).filter((k) => s.mats[k] > 0);
    h += have.length ? have.map((k) => `<span>${MATS[k]} <b>${s.mats[k]}</b></span>`).join('') : '<span>Zatím nic. Suroviny najdeš venku a u poražených příšer.</span>';
    return h + '</div>';
  }
  function beastsTab() {
    const s = st();
    let h = '';
    for (const k in BEASTS) {
      const B = BEASTS[k], n = s.know[k];
      h += `<article class="card beast"><h3>${n > 0 ? B.name : B.unknown}</h3>`;
      if (n === 0) h += '<p class="note">Zatím o něm nic nevíš. Hledej stopy.</p>';
      B.notes.forEach((nt) => {
        const got = n >= nt.need || (nt.need === 5 && s.weak[k]);
        h += got ? `<p>${nt.t}</p>` : `<p class="lockd">Další poznámka: ještě ${nt.need - n}× prozkoumat stopu nebo pozorovat z úkrytu.</p>`;
      });
      h += '</article>';
    }
    return h;
  }
  function restTab() {
    return `<article class="card"><h3>Stan</h3><p>Odpočinek ti doplní zdraví. Čas na ostrově mezitím běží dál a příšery se chovají podle něj.</p>
      <p class="step">Teď je ${fmtHour(G.sky.hour)}, ${WEATHER_NAME[G.sky.weather]}.</p>
      <div class="row"><button class="btn" data-act="rest" data-id="morning">Spát do rána</button><button class="btn" data-act="rest" data-id="night">Počkat do setmění</button><button class="btn" data-act="rest" data-id="weather">Přečkat počasí</button></div></article>`;
  }
  function logTab() {
    const l = st().log;
    return l.length ? '<ul class="log">' + l.slice().reverse().map((e) => `<li><i>${e.t}</i>${e.x}</li>`).join('') + '</ul>' : '<p class="note">Deník je prázdný.</p>';
  }
  function helpTab() {
    return '<div class="keys">' + CONTROLS.map(([k, d]) => `<div><b>${k}</b><span>${d}</span></div>`).join('') + '</div><p class="note">Na telefonu a tabletu: vlevo páčka na pohyb, tahem po obrazovce kamera, vpravo tlačítka.</p>';
  }
  function pauseTab() {
    return `<article class="card"><h3>Pauza</h3><div class="col"><button class="btn" data-act="close">Pokračovat</button><button class="btn ghost" data-act="mute">${G.audio.muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}</button><button class="btn ghost" data-act="newgame">Začít úplně znovu</button></div></article>` + helpTab();
  }

  function render() {
    let h = '';
    if (open === 'camp') {
      h = '<header><h2>Tábor</h2></header>' + tabs([['quests', 'Úkoly'], ['gear', 'Výbava'], ['craft', 'Dílna'], ['beasts', 'Příšery'], ['rest', 'Odpočinek']]);
      h += '<section>' + { quests: questsTab, gear: gearTab, craft: craftTab, beasts: beastsTab, rest: restTab }[tab]() + '</section>';
    } else if (open === 'journal') {
      h = '<header><h2>Deník</h2></header>' + tabs([['log', 'Zápisky'], ['beasts', 'Příšery'], ['quest', 'Úkol'], ['help', 'Ovládání']]);
      const q = G.quests.def();
      const qh = q ? `<article class="card"><h3>${q.title}</h3><p class="say">${q.brief}</p><p class="step">${G.quests.stepText()}</p></article>` : `<p class="note">${G.quests.stepText()}</p>`;
      h += '<section>' + { log: logTab, beasts: beastsTab, quest: () => qh, help: helpTab }[tab]() + '</section>';
    } else if (open === 'map') {
      h = '<header><h2>Mapa ostrova</h2></header><nav class="tabs"><button data-act="close" class="x">Zavřít</button></nav><section class="mapwrap"><canvas id="mapc" width="640" height="640"></canvas><p class="note">Oranžový kruh je jen přibližná oblast úkolu. Tečky jsou stopy, které jsi prozkoumal.</p></section>';
    } else if (open === 'pause') {
      h = '<header><h2>Menu</h2></header><section>' + pauseTab() + '</section>';
    } else if (open === 'msg') h = tab;
    sheet.innerHTML = h;
    if (open === 'map') drawMap();
  }

  function drawMap() {
    const c = document.getElementById('mapc');
    if (!c) return;
    const x = c.getContext('2d'), S = c.width, W = G.world.size, s = st(), p = G.player;
    const M = (wx, wz) => [((wx + W / 2) / W) * S, ((wz + W / 2) / W) * S];
    x.imageSmoothingEnabled = true;
    x.drawImage(G.world.mapCanvas, 0, 0, S, S);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const k in REGIONS) {
      const [mx, my] = M(REGIONS[k].x, REGIONS[k].z);
      const lock = !s.unlocked.includes(k);
      if (lock) { x.fillStyle = 'rgba(43,33,23,.55)'; x.beginPath(); x.arc(mx, my, 78, 0, TAU); x.fill(); }
      x.font = '700 30px "Amatic SC", sans-serif';
      x.lineWidth = 4; x.strokeStyle = 'rgba(244,234,210,.85)'; x.fillStyle = '#2b2117';
      const name = lock ? '? ? ?' : REGIONS[k].name;
      x.strokeText(name, mx, my - (k === 'camp' ? 22 : 0)); x.fillText(name, mx, my - (k === 'camp' ? 22 : 0));
    }
    const t = G.quests.target();
    if (!t.camp) { const [mx, my] = M(t.x, t.z); x.strokeStyle = '#e2603a'; x.lineWidth = 3; x.setLineDash([8, 6]); x.beginPath(); x.arc(mx, my, (t.r / W) * S, 0, TAU); x.stroke(); x.setLineDash([]); }
    const cols = { trnovec: '#b8741a', bahnak: '#4a5a2a', dravec: '#2f4f9a' };
    for (const m of s.marks) { const [mx, my] = M(m.x, m.z); x.fillStyle = cols[m.k]; x.beginPath(); x.arc(mx, my, 4, 0, TAU); x.fill(); x.strokeStyle = '#f4ead2'; x.lineWidth = 1; x.stroke(); }
    { const [mx, my] = M(G.world.camp.x, G.world.camp.z); x.fillStyle = '#a4472a'; x.strokeStyle = '#2b2117'; x.lineWidth = 2; x.beginPath(); x.moveTo(mx - 9, my + 7); x.lineTo(mx, my - 9); x.lineTo(mx + 9, my + 7); x.closePath(); x.fill(); x.stroke(); }
    { const [mx, my] = M(p.pos.x, p.pos.z); x.save(); x.translate(mx, my); x.rotate(Math.PI - p.yaw); x.fillStyle = '#fff'; x.strokeStyle = '#2b2117'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 8); x.lineTo(0, 4); x.lineTo(-7, 8); x.closePath(); x.fill(); x.stroke(); x.restore(); }
    x.fillStyle = '#2b2117'; x.font = '700 26px "Amatic SC", sans-serif'; x.fillText('S', S - 28, 26);
    x.beginPath(); x.moveTo(S - 28, 40); x.lineTo(S - 34, 58); x.lineTo(S - 22, 58); x.closePath(); x.fill();
  }

  function craft(id) {
    const s = st(), r = RECIPES.find((x) => x.id === id);
    if (!r || !canPay(r.cost)) { G.audio.sfx('deny'); return; }
    for (const k in r.cost) s.mats[k] -= r.cost[k];
    if (r.type === 'item') s.items[id] = (s.items[id] || 0) + 1;
    else if (r.type === 'weapon') { s.weapons.push(id); s.weapon = id; }
    else if (r.type === 'armor') { s.armors.push(id); s.armor = id; }
    else s.sharp[s.weapon] = true;
    G.player.equip();
    G.audio.sfx('craft');
    G.log(r.type === 'upgrade' ? `Nabrousil jsi zbraň: ${WEAPONS[s.weapon].n}.` : `Vyrobeno: ${rname(r).n}.`, false);
    G.save();
  }

  sheet.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const s = st(), id = b.dataset.id;
    if (b.dataset.tab) { tab = b.dataset.tab; G.audio.sfx('ui'); render(); return; }
    switch (b.dataset.act) {
      case 'close': G.audio.sfx('ui'); close(); return;
      case 'accept': G.quests.accept(id); close(); return;
      case 'abandon': G.quests.abandon(); break;
      case 'turnin': {
        const r = G.quests.turnIn();
        if (r) {
          tab = `<header><h2>Úkol splněn</h2></header><section><article class="card"><h3>${r.q.title}</h3><p class="say">${r.q.reward.text}</p>${r.mats ? `<p class="step">Dostal jsi: ${r.mats}</p>` : ''}${r.recipes.length ? `<p class="step">Nové v dílně: ${r.recipes.join(', ')}</p>` : ''}<button class="btn" data-act="back">Dobře</button></article></section>`;
          open = 'msg';
        }
        break;
      }
      case 'back': open = 'camp'; tab = 'quests'; break;
      case 'weapon': s.weapon = id; G.player.equip(); G.audio.sfx('ui'); G.save(); break;
      case 'armor': s.armor = id; G.player.equip(); G.audio.sfx('ui'); G.save(); break;
      case 'refill': {
        s.items.obklad = Math.max(s.items.obklad || 0, 2);
        if (s.done.includes('q1')) s.items.past = Math.max(s.items.past || 0, 1);
        G.audio.sfx('pickup'); G.save(); break;
      }
      case 'craft': craft(id); break;
      case 'rest': G.rest(id); close(); return;
      case 'mute': G.audio.toggleMute(); break;
      case 'newgame': if (b.dataset.sure) { G.newGame(); return; } b.dataset.sure = '1'; b.textContent = 'Opravdu? Postup se smaže. Klikni znovu.'; return;
    }
    render();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  return {
    toast, hint, feed, prompt, hurt, refresh, update, close,
    isOpen: () => !!open,
    openCamp: (t) => show('camp', t),
    openJournal: (t = 'log') => show('journal', t),
    openMap: () => show('map', ''),
    openPause: () => show('pause', ''),
  };
}
