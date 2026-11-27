// The flight model: pure arithmetic, no renderer and no browser in it. The
// aircraft is a point with a heading, a pitch, a bank and a speed; step()
// advances one fixed step and returns what happened as bit flags. Lift grows
// with speed, so a slow wing stalls and the nose drops; turns are coordinated,
// so the heading follows the bank.
import { PLANE, WORLD, STEP } from './config.js';
import { heightAt } from './terrain.js';

export const EVENT_CRASH = 1;
export const EVENT_LANDED = 2;
export const EVENT_TOOK_OFF = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_DAMAGE = 16;

const { runway } = WORLD;
const GEAR_HEIGHT = 1.6;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Forward unit vector from heading (0 = north, -Z) and pitch. */
export function forwardVector(heading, pitch) {
  return {
    x: Math.sin(heading) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(heading) * Math.cos(pitch),
  };
}

export function createFlight(mission) {
  const startZ = runway.z + runway.length / 2 - 60;
  const state = {
    pos: { x: runway.x, y: heightAt(runway.x, startZ) + GEAR_HEIGHT, z: startZ },
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: mission.fuel,
    damage: 0,
    verticalSpeed: 0,
    onGround: true,
    landed: false,
    crashed: false,
    crashReason: '',
    fuelEmpty: false,
    elapsed: 0,
    warnedEdge: false,
  };

  function overRunway(x, z) {
    return (
      Math.abs(x - runway.x) < runway.width / 2 - 2 &&
      z > runway.z - runway.length / 2 + 10 &&
      z < runway.z + runway.length / 2 - 10
    );
  }

  function crash(reason) {
    state.crashed = true;
    state.crashReason = reason;
    state.speed = 0;
  }

  /**
   * One fixed step. `input` is { pitch: -1..1 (up positive), roll: -1..1
   * (right positive), throttle: -1..1 (up positive) }. `wind` is the mission
   * wind in m/s from the west, gusting with time.
   */
  function step(dt, input, wind) {
    let events = 0;
    if (state.crashed) return events;
    state.elapsed += dt;

    // Throttle and speed: the engine pulls toward its target, climbs bleed
    // speed and descents give it back.
    state.throttle = clamp(state.throttle + input.throttle * dt * 0.8, 0, 1);
    if (state.fuel <= 0 && !state.fuelEmpty) {
      state.fuelEmpty = true;
      events |= EVENT_FUEL_EMPTY;
    }
    const effectiveThrottle = state.fuelEmpty ? 0 : state.throttle;
    const targetSpeed = 8 + effectiveThrottle * (PLANE.maxSpeed - 8);
    state.speed += (targetSpeed - state.speed) * PLANE.throttleResponse * dt;
    state.speed -= Math.sin(state.pitch) * 9.8 * 0.4 * dt;
    if (state.onGround) state.speed = Math.max(0, state.speed - 2 * dt);
    state.speed = Math.max(0, state.speed);

    // Control authority fades as the wing slows.
    const authority = clamp((state.speed - PLANE.minControlSpeed) / (PLANE.cruiseSpeed - PLANE.minControlSpeed), 0, 1);
    const wantBank = input.roll * PLANE.maxBank;
    state.bank += clamp(wantBank - state.bank, -PLANE.rollRate * dt, PLANE.rollRate * dt) * (0.3 + 0.7 * authority);
    if (input.pitch !== 0) {
      state.pitch = clamp(state.pitch + input.pitch * PLANE.pitchRate * authority * dt, -PLANE.maxPitch, PLANE.maxPitch);
    } else {
      // Hands off, the nose eases back toward level flight.
      state.pitch += clamp(-state.pitch, -0.25 * dt, 0.25 * dt);
    }
    // Coordinated turn: the heading follows the bank.
    const turnRate = (Math.tan(state.bank) * 9.8) / Math.max(state.speed, 15);
    state.heading += turnRate * dt;

    // Wind pushes the airframe sideways and gusts.
    const gust = wind * (0.7 + 0.3 * Math.sin(state.elapsed * 0.7));
    state.pos.x += gust * dt;

    // Move along the forward vector; a slow wing sinks and drops its nose.
    const fwd = forwardVector(state.heading, state.pitch);
    const prevY = state.pos.y;
    state.pos.x += fwd.x * state.speed * dt;
    state.pos.z += fwd.z * state.speed * dt;
    state.pos.y += fwd.y * state.speed * dt;
    if (state.speed < PLANE.stallSpeed && !state.onGround) {
      const sink = (PLANE.stallSpeed - state.speed) * 1.1;
      state.pos.y -= sink * dt;
      state.pitch -= 0.25 * dt * (1 - state.speed / PLANE.stallSpeed);
    }
    state.verticalSpeed = (state.pos.y - prevY) / dt;

    // The valley edge: a warning, then the wind turns the nose home.
    const edge = Math.max(Math.abs(state.pos.x), Math.abs(state.pos.z));
    if (edge > WORLD.half + 300) {
      if (!state.warnedEdge) state.warnedEdge = true;
      const home = Math.atan2(-state.pos.x, -state.pos.z);
      let diff = home - state.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.heading += clamp(diff, -0.5 * dt, 0.5 * dt);
    } else {
      state.warnedEdge = false;
    }

    // Ground contact: the gear is GEAR_HEIGHT below the reference point.
    // While rolling, the plane stays on the ground until the wing is flying
    // and the nose is up; once airborne, only a descent back to the ground
    // counts as a touchdown.
    const ground = heightAt(state.pos.x, state.pos.z);
    if (state.onGround) {
      state.pos.y = ground + GEAR_HEIGHT;
      state.verticalSpeed = 0;
      if (state.speed > PLANE.stallSpeed + 4 && state.pitch > 0.06) {
        state.onGround = false;
        state.landed = false;
        events |= EVENT_TOOK_OFF;
      }
    } else if (state.pos.y <= ground + GEAR_HEIGHT) {
      state.pos.y = ground + GEAR_HEIGHT;
      const vs = state.verticalSpeed;
      const onStrip = overRunway(state.pos.x, state.pos.z);
      if (onStrip && vs > -PLANE.softTouchdown && state.speed < 48 && Math.abs(state.bank) < 0.3) {
        state.onGround = true;
        state.landed = true;
        events |= EVENT_LANDED;
      } else if (!onStrip && vs > -PLANE.softTouchdown && state.speed < 25 && Math.abs(state.bank) < 0.3) {
        // A gentle bush landing: it costs a dent, and the plane stops.
        state.onGround = true;
        state.damage += 1;
        events |= EVENT_DAMAGE;
        if (state.damage >= PLANE.maxDamage) crash('The airframe gave up after one rough landing too many.');
      } else if (vs < -PLANE.hardTouchdown || state.speed > 48) {
        crash(vs < -PLANE.hardTouchdown ? 'Came down far too hard.' : 'Hit the ground far too fast.');
      } else {
        // A firm arrival: a dent, a bounce, and a second chance.
        state.damage += 1;
        events |= EVENT_DAMAGE;
        state.pos.y = ground + GEAR_HEIGHT + 6;
        state.pitch = 0.12;
        state.speed *= 0.7;
        if (state.damage >= PLANE.maxDamage) crash('The airframe gave up after one rough landing too many.');
      }
    }

    // Fuel burns with the throttle; an empty tank glides.
    state.fuel = Math.max(0, state.fuel - (PLANE.fuelBurnBase + PLANE.fuelBurnThrottle * effectiveThrottle) * dt);

    return events;
  }

  function reset() {
    const startZ2 = runway.z + runway.length / 2 - 60;
    state.pos.x = runway.x;
    state.pos.z = startZ2;
    state.pos.y = heightAt(runway.x, startZ2) + GEAR_HEIGHT;
    state.heading = 0;
    state.pitch = 0;
    state.bank = 0;
    state.speed = 0;
    state.throttle = 0;
    state.fuel = mission.fuel;
    state.damage = 0;
    state.verticalSpeed = 0;
    state.onGround = true;
    state.landed = false;
    state.crashed = false;
    state.crashReason = '';
    state.fuelEmpty = false;
    state.elapsed = 0;
    state.warnedEdge = false;
  }

  return { state, step, reset, overRunway };
}
