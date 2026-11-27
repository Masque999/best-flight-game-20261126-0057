// The three.js view: sky, sun and fog, the valley from terrain.js, the
// aircraft from aircraft.js, and the mission rings. Two cameras: a chase
// camera that trails the plane and a cockpit camera over the nose. The
// renderer owns no rules — it paints what the flight model and the mission
// say, once a frame.
import * as THREE from '../vendor/three.min.js';
import { PALETTE, WORLD } from './config.js';
import { buildWorld, stepClouds } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { forwardVector } from './flight.js';

export const CAMERA_CHASE = 'chase';
export const CAMERA_COCKPIT = 'cockpit';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

export function createRenderer(canvas, dusk) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 6000);

  const sky = dusk ? PALETTE.skyDusk : PALETTE.skyDay;
  const fogColor = dusk ? PALETTE.fogDusk : PALETTE.fogDay;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(fogColor, 500, 2800);

  const hemi = new THREE.HemisphereLight(dusk ? 0xffd9b0 : 0xcfe8ff, 0x5a6b4a, dusk ? 0.55 : 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(dusk ? PALETTE.sunDusk : PALETTE.sunDay, dusk ? 1.6 : 2.2);
  sun.position.set(400, 500, 200);
  scene.add(sun);
  scene.add(sun.target);

  /** Swap the whole light between daylight and dusk when the mission changes. */
  function setDusk(isDusk) {
    scene.background.setHex(isDusk ? PALETTE.skyDusk : PALETTE.skyDay);
    scene.fog.color.setHex(isDusk ? PALETTE.fogDusk : PALETTE.fogDay);
    hemi.color.setHex(isDusk ? 0xffd9b0 : 0xcfe8ff);
    hemi.intensity = isDusk ? 0.55 : 0.9;
    sun.color.setHex(isDusk ? PALETTE.sunDusk : PALETTE.sunDay);
    sun.intensity = isDusk ? 1.6 : 2.2;
  }

  const { clouds } = buildWorld(scene);
  const aircraft = buildAircraft();
  scene.add(aircraft.group);

  let ringMeshes = [];
  let ringBeacons = [];
  let ringMats = [];

  function clearRings() {
    for (const mesh of ringMeshes) scene.remove(mesh);
    for (const beacon of ringBeacons) scene.remove(beacon);
    ringMeshes = [];
    ringBeacons = [];
    ringMats = [];
  }

  /** Build the glowing hoops for a mission: torus plus a light column. */
  function buildRings(mission) {
    clearRings();
    const rings = mission.state.rings;
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const mat = new THREE.MeshStandardMaterial({
        color: PALETTE.ringIdle, emissive: PALETTE.ringIdle, emissiveIntensity: 0.7,
        roughness: 0.4, metalness: 0.2,
      });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(15, 1.4, 10, 40), mat);
      mesh.position.set(ring.x, ring.y, ring.z);
      // Face the hoop at the leg that flies into it.
      const from = i === 0 ? { x: 0, y: 90, z: 500 } : rings[i - 1];
      const dir = new THREE.Vector3(ring.x - from.x, ring.y - from.y, ring.z - from.z).normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      scene.add(mesh);
      ringMeshes.push(mesh);
      ringMats.push(mat);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 130, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: PALETTE.ringNext, transparent: true, opacity: 0.10,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      beacon.position.set(ring.x, ring.y + 55, ring.z);
      scene.add(beacon);
      ringBeacons.push(beacon);
    }
  }

  const camPos = new THREE.Vector3(0, 120, 960);
  const camLook = new THREE.Vector3(0, 40, 800);
  const tmpForward = new THREE.Vector3();
  const tmpDesired = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  /**
   * Paint one frame: move the plane, colour the rings, drift the clouds,
   * place the camera and render. `mode` is CAMERA_CHASE or CAMERA_COCKPIT.
   */
  function draw(flight, mission, dt, elapsed, mode) {
    const f = flight.state;
    const m = mission.state;
    const group = aircraft.group;
    group.position.set(f.pos.x, f.pos.y, f.pos.z);
    group.rotation.order = 'YXZ';
    // The flight model measures heading clockwise from north (-Z); the
    // mesh turns the other way around Y, and banks the other way around Z.
    group.rotation.set(f.pitch, -f.heading, -f.bank);
    // A wreck does not sit level: it lists on its side, nose down.
    if (f.crashed) {
      group.rotation.x = 0.5;
      group.rotation.z = 0.9;
    }
    aircraft.prop.rotation.z += (2 + f.speed * 1.1) * dt;
    // From the cockpit the propeller is a blur across the whole view, so
    // the cockpit camera flies without it; the chase camera keeps it.
    aircraft.prop.visible = mode !== CAMERA_COCKPIT;
    const blink = Math.floor(elapsed * 1.5) % 2 === 0;
    const nav = blink ? 2.5 : 0.4;
    aircraft.navLeft.material.emissiveIntensity = nav;
    aircraft.navRight.material.emissiveIntensity = nav;
    aircraft.navTail.material.emissiveIntensity = blink ? 0.4 : 2.5;

    // Rings: the next one burns orange and pulses, passed ones go green,
    // the rest stay dim. Beacons show only on the next ring.
    for (let i = 0; i < ringMeshes.length; i += 1) {
      const mat = ringMats[i];
      if (m.rings[i].passed) {
        mat.color.setHex(PALETTE.ringDone);
        mat.emissive.setHex(PALETTE.ringDone);
        mat.emissiveIntensity = 0.5;
      } else if (i === m.nextRing) {
        mat.color.setHex(PALETTE.ringNext);
        mat.emissive.setHex(PALETTE.ringNext);
        mat.emissiveIntensity = 1.1 + Math.sin(elapsed * 4) * 0.5;
      } else {
        mat.color.setHex(PALETTE.ringIdle);
        mat.emissive.setHex(PALETTE.ringIdle);
        mat.emissiveIntensity = 0.45;
      }
      ringBeacons[i].visible = i === m.nextRing;
      if (i === m.nextRing) ringBeacons[i].material.opacity = 0.08 + Math.sin(elapsed * 4) * 0.03;
    }

    stepClouds(clouds, dt, mission.state.def.wind);
    sun.position.set(f.pos.x + 400, f.pos.y + 500, f.pos.z + 200);
    sun.target.position.set(f.pos.x, f.pos.y, f.pos.z);

    const fwd = forwardVector(f.heading, f.pitch);
    tmpForward.set(fwd.x, fwd.y, fwd.z);
    if (mode === CAMERA_COCKPIT) {
      tmpDesired.set(f.pos.x, f.pos.y, f.pos.z)
        .addScaledVector(tmpForward, 1.8);
      tmpDesired.y += 1.15;
      camPos.lerp(tmpDesired, 1 - Math.exp(-dt * 14));
      tmpLook.set(f.pos.x, f.pos.y, f.pos.z).addScaledVector(tmpForward, 80);
      camera.fov = 70;
    } else {
      tmpDesired.set(f.pos.x, f.pos.y, f.pos.z)
        .addScaledVector(tmpForward, -14);
      tmpDesired.y += 4.5;
      camPos.lerp(tmpDesired, 1 - Math.exp(-dt * 4.5));
      tmpLook.set(f.pos.x, f.pos.y, f.pos.z).addScaledVector(tmpForward, 26);
      tmpLook.y += 1;
      camera.fov = 62 + f.speed * 0.12;
    }
    camera.position.copy(camPos);
    camLook.lerp(tmpLook, 1 - Math.exp(-dt * 8));
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function snapCamera(flight, mode) {
    const f = flight.state;
    const fwd = forwardVector(f.heading, f.pitch);
    if (mode === CAMERA_COCKPIT) {
      camPos.set(f.pos.x + fwd.x * 1.8, f.pos.y + 1.15, f.pos.z + fwd.z * 1.8);
      camLook.set(f.pos.x + fwd.x * 80, f.pos.y + fwd.y * 80, f.pos.z + fwd.z * 80);
    } else {
      camPos.set(f.pos.x - fwd.x * 14, f.pos.y + 4.5, f.pos.z - fwd.z * 14);
      camLook.set(f.pos.x + fwd.x * 26, f.pos.y + 1, f.pos.z + fwd.z * 26);
    }
  }

  return { draw, buildRings, snapCamera, resize, setDusk };
}
