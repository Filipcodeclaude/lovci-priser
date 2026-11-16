import { clamp } from './util.js';

const KEYMAP = {
  Space: 'dodge', KeyE: 'interact', KeyQ: 'use', KeyR: 'lock', KeyM: 'map', KeyJ: 'journal', KeyC: 'crouch',
  Escape: 'esc', Digit1: 'item1', Digit2: 'item2', Digit3: 'item3', Digit4: 'item4', Tab: 'next', KeyF: 'interact',
};

export function createInput(G) {
  const canvas = G.renderer.domElement;
  const keys = {}, once = new Set();
  let lookX = 0, lookY = 0, locked = false, noLock = false, mouseDown = false;
  const isTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer:coarse)').matches;
  const joy = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
  let lookId = null, lx = 0, ly = 0;
  const playing = () => G.mode === 'play' && !G.ui.isOpen();

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys[e.code] = true;
    const a = KEYMAP[e.code];
    if (a) { once.add(a); if (e.code === 'Tab' || e.code === 'Space') e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (isTouch || !playing()) return;
    mouseDown = true;
    if (!locked && !noLock) {
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { noLock = true; }); } catch (err) { noLock = true; }
      return;
    }
    once.add(e.button === 2 ? 'heavy' : 'light');
  });
  addEventListener('mouseup', () => { mouseDown = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
  document.addEventListener('pointerlockerror', () => { noLock = true; });
  addEventListener('mousemove', (e) => {
    if (locked || (noLock && mouseDown)) { lookX += e.movementX; lookY += e.movementY; }
  });

  if (isTouch) {
    const joyEl = document.getElementById('joy'), knob = document.getElementById('joyKnob');
    const setKnob = () => { knob.style.transform = `translate(${joy.x * 38}px,${joy.y * 38}px)`; };
    joyEl.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; joy.id = t.identifier;
      const r = joyEl.getBoundingClientRect(); joy.ox = r.left + r.width / 2; joy.oy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) {
          let dx = (t.clientX - joy.ox) / 48, dy = (t.clientY - joy.oy) / 48;
          const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          joy.x = dx; joy.y = dy; setKnob();
        } else if (t.identifier === lookId) {
          lookX += (t.clientX - lx) * 2.2; lookY += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; setKnob(); }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      e.preventDefault();
    }, { passive: false });
    document.querySelectorAll('#touch [data-act]').forEach((b) => {
      b.addEventListener('touchstart', (e) => { once.add(b.dataset.act); b.classList.add('on'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
      b.addEventListener('touchend', () => b.classList.remove('on'));
    });
  }

  return {
    isTouch,
    move() {
      let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      let y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      if (joy.id !== null) { x = joy.x; y = -joy.y; }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      return { x, y, len: clamp(l, 0, 1) };
    },
    sprint() { return !!(keys.ShiftLeft || keys.ShiftRight) || (joy.id !== null && Math.hypot(joy.x, joy.y) > 0.92); },
    hit(a) { if (once.has(a)) { once.delete(a); return true; } return false; },
    clear() { once.clear(); lookX = lookY = 0; },
    look() { const r = [lookX, lookY]; lookX = lookY = 0; return r; },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    get locked() { return locked; },
  };
}
