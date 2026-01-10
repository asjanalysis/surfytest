export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeNoise1D(seed = 1) {
  const rand = makeRng(seed);
  const table = Array.from({ length: 256 }, () => rand());
  return (x) => {
    const xi = Math.floor(x) & 255;
    const xf = x - Math.floor(x);
    const v1 = table[xi];
    const v2 = table[(xi + 1) & 255];
    return lerp(v1, v2, smoothstep(xf)) * 2 - 1;
  };
}

export function formatScore(value) {
  return Math.floor(value).toLocaleString();
}

export function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
