// Seeded randomness: the same seed gives the same valley, the same rings and
// the same screenshot, which is what makes the ?shot= scenes repeatable.
// mulberry32 for streams, value noise with smooth interpolation for terrain.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 2D value-noise field from a seeded lattice: smooth, repeatable, cheap. */
export function createNoise2D(seed) {
  const random = createRandom(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];

  function lattice(ix, iz) {
    return perm[(perm[ix & 255] + iz) & 255] / 255;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  /** Noise in [0, 1] at (x, z); scale the coordinates to taste per octave. */
  return function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = smooth(x - ix);
    const fz = smooth(z - iz);
    const a = lattice(ix, iz);
    const b = lattice(ix + 1, iz);
    const c = lattice(ix, iz + 1);
    const d = lattice(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

/** Fractal sum of the noise field: 4 octaves, each half the weight of the last. */
export function createFractalNoise(seed) {
  const octaves = [createNoise2D(seed), createNoise2D(seed + 101), createNoise2D(seed + 202), createNoise2D(seed + 303)];
  return function fractal(x, z) {
    let sum = 0;
    let weight = 0;
    let amp = 1;
    for (let i = 0; i < octaves.length; i += 1) {
      sum += octaves[i](x * (1 << i) * 0.5, z * (1 << i) * 0.5) * amp;
      weight += amp;
      amp *= 0.5;
    }
    return sum / weight;
  };
}
