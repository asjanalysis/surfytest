// Small utilities used by the game. No dependencies.

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Deterministic hash -> [0,1)
export function hash1(n) {
  // integer-ish hash
  let x = n | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = x * 0x27d4eb2d;
  x = x ^ (x >>> 15);
  // convert to [0,1)
  return ((x >>> 0) % 1000000) / 1000000;
}

// Value noise 1D with smooth interpolation
export function noise1(t, seed = 0) {
  const i0 = Math.floor(t);
  const i1 = i0 + 1;
  const f = t - i0;
  const u = smoothstep(f);
  const a = hash1(i0 + seed * 1013);
  const b = hash1(i1 + seed * 1013);
  return lerp(a, b, u); // [0,1)
}

// A helper to format ints nicely
export function fmtInt(n) {
  return Math.max(0, Math.floor(n)).toString();
}
