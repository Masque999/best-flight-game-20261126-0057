// Ridgeline Courier — every tuning number, colour and mission in one place.
// Units inside the simulation are metres, metres per second and radians;
// the HUD converts to knots and feet for display. The world is a 4000 m square
// valley; the airfield sits near its south edge at the origin of the runway.

export const STEP = 1 / 60;

/** The world: a square valley with a lake, a ridge and one airfield. */
export const WORLD = {
  size: 4000,
  half: 2000,
  /** Base height of the valley floor. */
  floor: 0,
  /** Height of the ridge line that rings the valley. */
  ridge: 320,
  /** Water level of the lake in the north-east corner. */
  water: 6,
  /** Where the airfield sits (valley floor, flattened). */
  airfield: { x: 0, z: 900, flattenRadius: 420 },
  /** Runway: 600 m long, 34 m wide, pointing north (-Z). */
  runway: { x: 0, z: 900, length: 600, width: 34, heading: 0 },
};

export const PLANE = {
  /** Top speed at full throttle, m/s (~117 kt). */
  maxSpeed: 60,
  /** Speed below which the wing stops lifting and the nose drops. */
  stallSpeed: 22,
  /** Cruise speed the throttle settles toward. */
  cruiseSpeed: 38,
  /** How fast the engine answers the throttle, per second. */
  throttleResponse: 0.9,
  /** Max bank in a turn, radians. */
  maxBank: 1.05,
  /** Roll rate toward the commanded bank, per second. */
  rollRate: 2.4,
  /** Pitch rate from the elevator, per second. */
  pitchRate: 0.9,
  /** Pitch authority fades below this fraction of cruise speed. */
  minControlSpeed: 14,
  /** Hardest climb the airframe holds, radians. */
  maxPitch: 0.55,
  /** Fuel burn: base per second plus throttle share. */
  fuelBurnBase: 0.045,
  fuelBurnThrottle: 0.075,
  /** Damage the airframe takes before it is a wreck. */
  maxDamage: 3,
  /** Touchdown is a landing below this vertical speed, m/s. */
  softTouchdown: 4.5,
  /** Touchdown above this vertical speed is a crash. */
  hardTouchdown: 9,
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Thread all 8 valley rings, then bring her home.',
    rings: 8,
    fuel: 100,
    timeLimit: 300,
    wind: 0,
    dusk: false,
    /** Rings wander this far from the valley centre line, metres. */
    spread: 900,
    /** Rings sit this high above the ground, metres. */
    ringHeight: 90,
    landingBonus: 250,
  },
  {
    id: 'ridge-rescue',
    name: 'Ridge Rescue',
    blurb: 'Six rings over the high ridge, thin fuel, gusty wind.',
    rings: 6,
    fuel: 78,
    timeLimit: 240,
    wind: 5,
    dusk: false,
    spread: 1300,
    ringHeight: 190,
    landingBonus: 400,
  },
  {
    id: 'dusk-delivery',
    name: 'Dusk Delivery',
    blurb: 'Ten rings at dusk. Land on the strip for the bonus.',
    rings: 10,
    fuel: 110,
    timeLimit: 360,
    wind: 2,
    dusk: true,
    spread: 1100,
    ringHeight: 120,
    landingBonus: 500,
  },
];

export const RING = {
  radius: 15,
  tube: 1.4,
  /** Points for a clean ring. */
  points: 100,
  /** Bonus per second left on the clock at the finish. */
  timeBonusPerSecond: 2,
};

export const PALETTE = {
  skyDay: 0x8ec7e8,
  skyDusk: 0xe8975a,
  fogDay: 0xa8c8de,
  fogDusk: 0xd99a6c,
  sunDay: 0xfff2d8,
  sunDusk: 0xff9a3c,
  grass: 0x5d8a4a,
  meadow: 0x7fae56,
  rock: 0x8a7d72,
  snow: 0xeef2f5,
  sand: 0xc9b489,
  water: 0x3f7fa8,
  runway: 0x3a3d42,
  runwayLine: 0xf2f2e8,
  hangar: 0xb8543f,
  roof: 0x5d6b7a,
  planeBody: 0x2e8f83,
  planeCream: 0xf2e8d5,
  planeAccent: 0xe86a2c,
  ringNext: 0xffa62b,
  ringDone: 0x3fae6a,
  ringIdle: 0x8fa8b8,
  hud: '#e8f2f8',
  hudDim: '#9fc3d4',
  hudWarn: '#ffb02e',
  hudBad: '#ff5a4e',
  panel: 'rgba(10, 22, 30, 0.78)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score per mission is kept between visits (this browser only). */
export const BEST_KEY_PREFIX = 'ridgeline-courier.best.';
