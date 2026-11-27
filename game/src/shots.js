// The screenshot scenes behind ?shot=start|play|cockpit|end. Each one plays
// the real rules forward from a fresh world for a fixed time, steered by a
// simple autopilot (bank toward the next ring, pitch for its height, full
// throttle on the strip, climb when the ground ahead rises), so the frame is
// what a short game really looks like and the same seed always gives the
// same frame.
import { STEP } from './config.js';
import { heightAt } from './terrain.js';
import { forwardVector } from './flight.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 0;
const PLAY_SECONDS = 42;
const COCKPIT_SECONDS = 26;
const END_LIMIT_SECONDS = 420;

/** Latched once the plane commits to its final: the approach fix is a
 * point on the way in, not a gate, so flying past it must never send the
 * plane back around for another lap. Reset by stageShot for each scene. */
let homeCommitted = false;
/** Which way the plane lands, latched when the home leg starts: the side
 * is read from the plane's position once, never again — re-reading it
 * mid-final flips the aim point to the far threshold the moment the plane
 * crosses the runway centre, and the plane turns back on itself. */
let homeSide = null;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Steer toward the next ring (or the runway once they are all flown). */
function autopilot(flight, mission) {
  const f = flight.state;
  const m = mission.state;
  let target;
  const onFinal = m.nextRing >= m.rings.length;
  if (!onFinal) {
    target = m.rings[m.nextRing];
  } else {
    // Home leg: land on the strip. First the approach fix on the same side
    // the plane is on, then the far threshold as the touchdown aim: the
    // plane lands somewhere along the strip, so the aim point must sit past
    // the touchdown, never short of it — a target the plane flies past
    // flips behind it and sends it around again. The commit latches: once
    // the plane is on final it stays on final, even when it flies past the
    // fix point itself.
    if (homeSide === null) homeSide = f.pos.z >= 900 ? 'south' : 'north';
    const southSide = homeSide === 'south';
    const fix = southSide ? { x: 0, y: 40, z: 1450 } : { x: 0, y: 40, z: 350 };
    const touchdown = southSide ? { x: 0, y: 2, z: 650 } : { x: 0, y: 2, z: 1150 };
    const fixDist = Math.hypot(f.pos.x - fix.x, f.pos.y - fix.y, f.pos.z - fix.z);
    if (fixDist < 150) homeCommitted = true;
    target = homeCommitted ? touchdown : fix;
  }
  const dx = target.x - f.pos.x;
  const dy = target.y - f.pos.y;
  const dz = target.z - f.pos.z;
  const horiz = Math.hypot(dx, dz);
  const dist = Math.hypot(dx, dy, dz);
  const wantHeading = Math.atan2(dx, -dz);
  const dh = wrapAngle(wantHeading - f.heading);
  // Close in, bank harder to line up — but once nearly on the ring, hold
  // the wings nearer level so the nose does not swing past the hoop.
  const near = dist < 300;
  const bankGain = near ? 1.7 : 1.1;
  const bankCap = dist < 120 ? 0.5 : 1.0;
  const wantBank = clamp(dh * bankGain, -bankCap, bankCap);
  const roll = clamp((wantBank - f.bank) * 2.2, -1, 1);
  const wantPitch = clamp(Math.atan2(dy, Math.max(30, horiz)), -0.32, 0.32);
  // Shallow glide on final: a steep descent dents the hull on touchdown,
  // so the whole home leg comes down no faster than a gentle -0.12 rad.
  const glidePitch = (m.nextRing >= m.rings.length)
    ? Math.max(wantPitch, -0.12)
    : wantPitch;
  let pitch = clamp((glidePitch - f.pitch) * 2.5, -1, 1);
  // Terrain ahead: climb out before the ridge does the deciding. On the
  // home leg below 120 m the runway is flat and the plane is landing, so
  // the same rule must not yank the nose up off the glide path.
  const fwd = forwardVector(f.heading, f.pitch);
  const ahead = heightAt(f.pos.x + fwd.x * 130, f.pos.z + fwd.z * 130);
  if (ahead + 55 > f.pos.y && !f.onGround && !(onFinal && f.pos.y < 120)) pitch = 1;
  // Throttle by distance: fast between rings, slow to thread one — a slow
  // wing turns far tighter than a fast one, and a tight turn is what
  // threads a fifteen-metre hoop. Wide off the nose, slow down to turn.
  let wantThrottle = 0.62;
  if (f.onGround) wantThrottle = 1;
  else if (dist < 150) wantThrottle = 0.32;
  else if (dist < 400) wantThrottle = 0.45;
  else if (Math.abs(dh) > 1.2) wantThrottle = 0.35;
  else if (f.speed > 52) wantThrottle = 0.5;
  else if (f.speed < 30) wantThrottle = 1;
  const throttle = clamp((wantThrottle - f.throttle) * 3, -1, 1);
  return { pitch, roll, throttle };
}

function flyFor(flight, mission, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = autopilot(flight, mission);
    const fe = flight.step(STEP, input, mission.state.def.wind);
    const me = mission.step(STEP, flight.state, fe);
    if (mission.state.finished || mission.state.failed) break;
  }
}

/**
 * Set the world to the named scene and return the screen to draw over it.
 * `view` is the camera the shot is taken with; the caller snaps it.
 */
export function stageShot(name, flight, mission) {
  homeCommitted = false;
  homeSide = null;
  flight.reset();
  const m = mission.state;
  m.nextRing = 0;
  m.score = 0;
  m.timeLeft = m.def.timeLimit;
  m.finished = false;
  m.failed = false;
  m.ringsPassed = 0;
  m.landedHome = false;
  for (const ring of m.rings) ring.passed = false;

  if (name === 'play') {
    flyFor(flight, mission, PLAY_SECONDS);
    return { screen: mission.state.failed ? SCREEN_OVER : SCREEN_PLAY };
  }
  if (name === 'cockpit') {
    flyFor(flight, mission, COCKPIT_SECONDS);
    return { screen: mission.state.failed ? SCREEN_OVER : SCREEN_PLAY };
  }
  if (name === 'end') {
    flyFor(flight, mission, END_LIMIT_SECONDS);
    return { screen: SCREEN_OVER };
  }
  // start: parked on the strip, title over the airfield.
  return { screen: SCREEN_TITLE };
}
