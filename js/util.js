export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (a) => a[(Math.random() * a.length) | 0];
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// nejkratší rozdíl úhlů b - a
export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeNoise(seed) {
  const r = mulberry(seed);
  const p = new Uint16Array(512);
  const g = new Float32Array(256);
  for (let i = 0; i < 256; i++) { p[i] = i; g[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const f = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = g[p[p[X] + Y] & 255], b = g[p[p[X + 1] + Y] & 255];
    const c = g[p[p[X] + Y + 1] & 255], d = g[p[p[X + 1] + Y + 1] & 255];
    const u = f(xf), v = f(yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

export function fbm(n, x, y, oct = 4) {
  let s = 0, a = 1, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2.03; }
  return s / t;
}

const DIRS = ['sever', 'severovýchod', 'východ', 'jihovýchod', 'jih', 'jihozápad', 'západ', 'severozápad'];
// sever je -z, východ +x
export function compassName(dx, dz) {
  const a = (Math.atan2(dx, -dz) + TAU) % TAU;
  return DIRS[Math.round(a / (TAU / 8)) % 8];
}

export function fmtHour(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
