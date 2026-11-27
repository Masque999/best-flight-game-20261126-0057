// The mission: a wandering line of glowing rings over the valley, a clock,
// a fuel tank and a score. The next ring is the objective; pass them all and
// the objective becomes the runway — land on the strip to bank the bonus.
import { RING, WORLD } from './config.js';
import { heightAt } from './terrain.js';
import { createRandom } from './random.js';

export const EVENT_RING = 1;
export const EVENT_FINISH = 2;
export const EVENT_FAIL = 4;

function placeRings(def, random) {
  const rings = [];
  // Start near the airfield, then wander: each leg turns a little and runs
  // four to six hundred metres, climbing and falling with the ground.
  let x = 0;
  let z = 500;
  let heading = 0;
  for (let i = 0; i < def.rings; i += 1) {
    heading += (random() - 0.5) * 1.9;
    // Wandering too far north parks the rest of the course on the map edge,
    // so a ring far from the centre bends the course back toward it.
    const fromCentre = Math.hypot(x, z);
    if (fromCentre > 900) {
      const home = Math.atan2(-x, -z);
      let diff = home - heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      heading += diff * 0.7;
    }
    const leg = 420 + random() * 260;
    x = Math.max(-1500, Math.min(1500, x + Math.sin(heading) * leg));
    z = Math.max(-1500, Math.min(1500, z - Math.cos(heading) * leg));
    const ground = heightAt(x, z);
    const y = Math.max(60, ground + def.ringHeight + random() * 45);
    rings.push({ x, y, z, passed: false });
  }
  return rings;
}

export function createMission(def, seed) {
  const random = createRandom(seed);
  const rings = placeRings(def, random);
  const state = {
    def,
    rings,
    nextRing: 0,
    score: 0,
    timeLeft: def.timeLimit,
    finished: false,
    failed: false,
    failReason: '',
    ringsPassed: 0,
    landedHome: false,
  };

  function distanceToNext(pos) {
    if (state.nextRing >= rings.length) return Infinity;
    const r = rings[state.nextRing];
    return Math.hypot(pos.x - r.x, pos.y - r.y, pos.z - r.z);
  }

  /**
   * One fixed step. `flight` is the flight model's state; `events` are the
   * flags its step just returned (a landing matters here). Returns mission
   * events: a ring, the finish, or a failure.
   */
  function step(dt, flight, flightEvents) {
    let events = 0;
    if (state.finished || state.failed) return events;
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.failed = true;
      state.failReason = 'Out of time — the rings are still out there.';
      return EVENT_FAIL;
    }
    if (flight.crashed) {
      state.failed = true;
      state.failReason = flight.crashReason;
      return EVENT_FAIL;
    }
    if (flight.fuelEmpty && flight.onGround && state.nextRing < rings.length) {
      state.failed = true;
      state.failReason = 'Out of fuel, short of the rings.';
      return EVENT_FAIL;
    }
    // Ring check: inside the hoop, it counts.
    if (state.nextRing < rings.length) {
      const ring = rings[state.nextRing];
      const d = Math.hypot(flight.pos.x - ring.x, flight.pos.y - ring.y, flight.pos.z - ring.z);
      if (d < RING.radius) {
        ring.passed = true;
        state.nextRing += 1;
        state.ringsPassed += 1;
        state.score += RING.points;
        events |= EVENT_RING;
      }
    }
    // All rings done: land on the strip to finish.
    if (state.nextRing >= rings.length && !state.landedHome) {
      if (flight.landed && flight.onGround) {
        state.landedHome = true;
        state.finished = true;
        state.score += def.landingBonus;
        state.score += Math.max(0, Math.round(state.timeLeft)) * RING.timeBonusPerSecond;
        return events | EVENT_FINISH;
      }
    }
    return events;
  }

  function objective() {
    if (state.finished) return 'Mission complete — welcome home.';
    if (state.nextRing >= rings.length) return 'All rings flown — land on the runway.';
    return `Fly through ring ${state.nextRing + 1} of ${rings.length}.`;
  }

  return { state, step, objective, distanceToNext };
}
