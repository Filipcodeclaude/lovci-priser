import { clamp, rand } from './util.js';

// Všechen zvuk se skládá přímo v prohlížeči, žádné soubory.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null;
  const L = {};
  let muted = false, birdT = 2, bugT = 0, frogT = 3, gullT = 5;

  function loop(type, freq, q = 0.7) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { g, f };
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.75; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    L.wind = loop('lowpass', 420); L.rain = loop('highpass', 2400); L.rain2 = loop('bandpass', 900, 0.5);
    L.sea = loop('lowpass', 650); L.fire = loop('bandpass', 1800, 2); L.leaves = loop('bandpass', 3200, 0.6);
  }

  function out(pan) {
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(master); return p; }
    return master;
  }

  function tone(f0, f1, dur, type = 'sine', vol = 0.2, pan = 0, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, type, f0, f1, vol = 0.2, pan = 0, delay = 0, q = 1) {
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out(pan)); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  }

  const S = {
    step: (v, p) => noise(0.09, 'lowpass', 900, 300, 0.1 * v, p),
    splash: (v, p) => { noise(0.25, 'bandpass', 1400, 500, 0.16 * v, p); },
    swing: (v, p) => noise(0.16, 'bandpass', 900, 2600, 0.14 * v, p, 0, 1.5),
    swingHeavy: (v, p) => noise(0.3, 'bandpass', 400, 1800, 0.2 * v, p, 0, 1.2),
    hit: (v, p) => { noise(0.12, 'lowpass', 1600, 200, 0.4 * v, p); tone(160, 60, 0.14, 'triangle', 0.3 * v, p); },
    hitWeak: (v, p) => { noise(0.16, 'lowpass', 2600, 300, 0.45 * v, p); tone(520, 180, 0.2, 'square', 0.12 * v, p); tone(1040, 780, 0.18, 'sine', 0.12 * v, p, 0.03); },
    block: (v, p) => { tone(900, 700, 0.1, 'square', 0.1 * v, p); noise(0.08, 'highpass', 3000, 2000, 0.2 * v, p); },
    hurt: (v) => { tone(220, 90, 0.25, 'sawtooth', 0.18 * v); noise(0.15, 'lowpass', 800, 200, 0.3 * v); },
    dodge: (v) => noise(0.22, 'bandpass', 500, 1500, 0.1 * v, 0, 0, 0.8),
    pickup: (v) => { tone(660, 880, 0.09, 'sine', 0.16 * v); tone(990, 1320, 0.12, 'sine', 0.13 * v, 0, 0.07); },
    track: (v) => { tone(392, 392, 0.14, 'triangle', 0.15 * v); tone(523, 523, 0.14, 'triangle', 0.15 * v, 0, 0.11); tone(659, 659, 0.24, 'triangle', 0.15 * v, 0, 0.22); },
    craft: (v) => { for (let i = 0; i < 3; i++) { tone(1400, 900, 0.07, 'square', 0.08 * v, 0, i * 0.16); noise(0.05, 'highpass', 4000, 3000, 0.15 * v, 0, i * 0.16); } },
    quest: (v) => { [392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.32, 'triangle', 0.17 * v, 0, i * 0.13)); tone(196, 196, 0.8, 'sine', 0.14 * v); },
    ui: (v) => tone(520, 620, 0.05, 'sine', 0.08 * v),
    deny: (v) => tone(180, 140, 0.14, 'square', 0.07 * v),
    heal: (v) => { tone(440, 660, 0.3, 'sine', 0.13 * v); tone(660, 880, 0.3, 'sine', 0.1 * v, 0, 0.15); },
    trap: (v, p) => { noise(0.1, 'highpass', 2500, 1500, 0.3 * v, p); tone(300, 120, 0.2, 'square', 0.14 * v, p); },
    bang: (v, p) => { noise(0.5, 'lowpass', 5000, 150, 0.7 * v, p); tone(90, 40, 0.4, 'sine', 0.5 * v, p); },
    thunder: (v, p) => { noise(2.6, 'lowpass', 500, 50, 0.75 * v, p); noise(0.3, 'lowpass', 2500, 300, 0.4 * v, p); },
    thud: (v, p) => { tone(110, 40, 0.3, 'sine', 0.5 * v, p); noise(0.2, 'lowpass', 600, 100, 0.4 * v, p); },
    // Trnovec
    snort: (v, p) => { noise(0.28, 'bandpass', 500, 260, 0.5 * v, p, 0, 2); tone(140, 90, 0.26, 'sawtooth', 0.14 * v, p); },
    rattle: (v, p) => { for (let i = 0; i < 7; i++) noise(0.04, 'highpass', 3500, 2500, 0.3 * v, p, i * 0.07); },
    hooves: (v, p) => { for (let i = 0; i < 5; i++) tone(120, 60, 0.07, 'triangle', 0.3 * v, p, i * 0.11); },
    // Bahňák
    gurgle: (v, p) => { for (let i = 0; i < 5; i++) tone(rand(70, 130), rand(160, 260), 0.1, 'sine', 0.3 * v, p, i * 0.09 + rand(0.03)); },
    growl: (v, p) => { tone(75, 48, 0.8, 'sawtooth', 0.26 * v, p); noise(0.8, 'lowpass', 300, 120, 0.3 * v, p); },
    bubble: (v, p) => tone(rand(180, 300), rand(400, 600), 0.07, 'sine', 0.14 * v, p),
    spit: (v, p) => { noise(0.2, 'bandpass', 700, 1800, 0.3 * v, p); tone(200, 400, 0.12, 'sine', 0.15 * v, p); },
    // Bouřný dravec
    screech: (v, p) => { tone(1500, 650, 0.7, 'sawtooth', 0.16 * v, p); tone(1560, 700, 0.7, 'square', 0.07 * v, p, 0.02); noise(0.6, 'bandpass', 2400, 1300, 0.14 * v, p, 0, 3); },
    wing: (v, p) => noise(0.3, 'lowpass', 500, 150, 0.3 * v, p),
    hum: (v, p) => { tone(110, 440, 1.2, 'sawtooth', 0.1 * v, p); tone(220, 880, 1.2, 'sine', 0.12 * v, p); },
    // malá zvířata
    squeak: (v, p) => tone(1800, 2600, 0.07, 'sine', 0.08 * v, p),
  };

  function sfx(name, vol = 1, pan = 0) {
    if (!ctx || muted || vol <= 0.01 || !S[name]) return;
    S[name](vol, pan);
  }

  function update(dt, e) {
    if (!ctx) return;
    const t = ctx.currentTime, set = (l, v) => l.g.gain.setTargetAtTime(muted ? 0 : v, t, 0.4);
    set(L.wind, 0.05 + e.storm * 0.22 + e.rain * 0.05 + e.high * 0.07);
    L.wind.f.frequency.setTargetAtTime(380 + e.storm * 300 + Math.sin(t * 0.4) * 90, t, 0.5);
    set(L.rain, e.rain * 0.085); set(L.rain2, e.rain * 0.07);
    set(L.sea, e.coast * 0.22 * (0.7 + 0.3 * Math.sin(t * 0.55)));
    set(L.fire, e.camp * 0.05 * (0.6 + Math.random() * 0.8));
    set(L.leaves, e.jungle * (0.012 + e.storm * 0.04));
    if (muted) return;
    const dry = e.rain < 0.4;
    birdT -= dt;
    if (birdT <= 0) {
      birdT = rand(1.2, 5);
      if (dry && e.night < 0.5 && (e.jungle > 0.2 || e.camp > 0.2)) {
        const f = rand(1800, 3400), p = rand(-0.9, 0.9), n = (Math.random() * 4 + 1) | 0, v = 0.045 * Math.max(e.jungle, e.camp * 0.7);
        for (let i = 0; i < n; i++) tone(f * rand(0.9, 1.1), f * rand(1.05, 1.4), 0.08, 'sine', v, p, i * 0.13);
      } else if (e.night > 0.5 && dry && Math.random() < 0.3) {
        tone(420, 380, 0.5, 'sine', 0.05, rand(-0.8, 0.8)); tone(420, 370, 0.7, 'sine', 0.05, rand(-0.8, 0.8), 0.7);
      }
    }
    bugT -= dt;
    if (bugT <= 0) {
      bugT = rand(0.5, 1.6);
      const v = (e.night * 0.03 + e.swamp * 0.015) * (dry ? 1 : 0.3);
      if (v > 0.004) { const p = rand(-1, 1), f = rand(4200, 5200); for (let i = 0; i < 6; i++) tone(f, f, 0.03, 'square', v, p, i * 0.055); }
    }
    frogT -= dt;
    if (frogT <= 0) { frogT = rand(1.5, 6); if (e.swamp > 0.3) { const p = rand(-0.9, 0.9); tone(160, 110, 0.14, 'square', 0.035 * e.swamp, p); tone(170, 120, 0.16, 'square', 0.035 * e.swamp, p, 0.2); } }
    gullT -= dt;
    if (gullT <= 0) { gullT = rand(5, 13); if (e.coast > 0.4 && e.night < 0.5 && dry) { const p = rand(-0.9, 0.9); tone(1100, 800, 0.25, 'sawtooth', 0.02, p); tone(1200, 850, 0.3, 'sawtooth', 0.02, p, 0.3); } }
  }

  return { init, sfx, update, toggleMute() { muted = !muted; return muted; }, get muted() { return muted; } };
}
