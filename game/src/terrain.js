// The valley itself: one height function the flight model and the renderer
// share, and the meshes built from it — terrain, lake, runway, airfield,
// trees and clouds. Nothing here knows about missions or the aircraft.
import * as THREE from '../vendor/three.min.js';
import { WORLD, PALETTE } from './config.js';
import { createFractalNoise, createRandom } from './random.js';

const { size, half, ridge, water, airfield, runway } = WORLD;

/** The seeded noise behind the hills; one field for the whole valley. */
const hills = createFractalNoise(20261126);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Ground height in metres at (x, z). Pure arithmetic: the flight model calls
 * the same function the mesh is built from, so what you see is what you hit.
 */
export function heightAt(x, z) {
  const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
  let h = hills(x / 900 + 7.3, z / 900 + 2.9) * 70;
  h += smoothstep(0.55, 1.0, edge) * ridge;
  h += smoothstep(0.35, 0.75, edge) * 40;
  // The lake basin in the north-east: a bowl sunk below the water line.
  const lakeDx = x - 1200;
  const lakeDz = z + 1250;
  const lakeD = Math.sqrt(lakeDx * lakeDx + lakeDz * lakeDz);
  h -= (1 - smoothstep(220, 520, lakeD)) * 26;
  // The airfield is graded flat so takeoffs and landings read.
  const afDx = x - airfield.x;
  const afDz = z - airfield.z;
  const afD = Math.sqrt(afDx * afDx + afDz * afDz);
  h *= smoothstep(140, airfield.flattenRadius, afD);
  return h;
}

/** Slope (rise over run) at (x, z), from central differences. */
export function slopeAt(x, z) {
  const e = 6;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.sqrt(dx * dx + dz * dz);
}

function colorFor(height, slope, variation) {
  const c = new THREE.Color();
  if (height < water + 2.5) c.setHex(PALETTE.sand);
  else if (height < 55) c.setHex(variation > 0.5 ? PALETTE.meadow : PALETTE.grass);
  else if (height < 150) c.setHex(PALETTE.grass).lerp(new THREE.Color(PALETTE.rock), smoothstep(70, 150, height));
  else if (height < 230) c.setHex(PALETTE.rock);
  else c.setHex(PALETTE.rock).lerp(new THREE.Color(PALETTE.snow), smoothstep(230, 300, height));
  if (slope > 0.55) c.lerp(new THREE.Color(PALETTE.rock), smoothstep(0.55, 0.9, slope) * 0.8);
  return c;
}

function buildTerrainMesh() {
  const segments = 150;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const vary = createFractalNoise(77);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const v = vary(x / 260 + 3.1, z / 260 + 8.4);
    tmp.copy(colorFor(h, slopeAt(x, z), v));
    // A whisper of variation so the ground does not read as flat colour.
    const shade = 0.92 + v * 0.16;
    colors[i * 3] = tmp.r * shade;
    colors[i * 3 + 1] = tmp.g * shade;
    colors[i * 3 + 2] = tmp.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  return new THREE.Mesh(geo, mat);
}

function buildLake() {
  const geo = new THREE.CircleGeometry(470, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.water, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(1200, water, -1250);
  return mesh;
}

function buildRunway() {
  const group = new THREE.Group();
  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(runway.width, 0.6, runway.length),
    new THREE.MeshStandardMaterial({ color: PALETTE.runway, roughness: 0.95 }),
  );
  asphalt.position.set(runway.x, 0.3, runway.z);
  group.add(asphalt);
  // Centreline dashes and threshold bars.
  const lineMat = new THREE.MeshStandardMaterial({ color: PALETTE.runwayLine, roughness: 0.8 });
  for (let i = -8; i <= 8; i += 1) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 18), lineMat);
    dash.position.set(runway.x, 0.65, runway.z + i * 34);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 14), lineMat);
      bar.position.set(runway.x + k * 6, 0.65, runway.z + end * (runway.length / 2 - 14));
      group.add(bar);
    }
  }
  // Edge lights: small lit domes, bright at dusk.
  const lightGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffe9a8, emissive: 0xffc94d, emissiveIntensity: 1.6,
  });
  for (let i = -9; i <= 9; i += 1) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(runway.x + side * (runway.width / 2 + 2), 1.0, runway.z + i * 32);
      group.add(lamp);
    }
  }
  return group;
}

function buildAirfield() {
  const group = new THREE.Group();
  // Hangar: red walls, pitched grey roof, open dark doorway facing the strip.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(46, 14, 30),
    new THREE.MeshStandardMaterial({ color: PALETTE.hangar, roughness: 0.85 }),
  );
  walls.position.set(48, 7, runway.z + 120);
  group.add(walls);
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 46, 3, 1),
    new THREE.MeshStandardMaterial({ color: PALETTE.roof, roughness: 0.7 }),
  );
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.scale.set(1, 1, 0.62);
  roof.position.set(48, 14, runway.z + 120);
  group.add(roof);
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 10),
    new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 1 }),
  );
  door.position.set(48, 5, runway.z + 120 - 15.1);
  door.rotation.y = Math.PI;
  group.add(door);
  // Windsock on a pole beside the threshold.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.6 }),
  );
  pole.position.set(-30, 6, runway.z - runway.length / 2 + 30);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 7, 10),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8, emissive: 0x903a00, emissiveIntensity: 0.25 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(-26.5, 11.4, runway.z - runway.length / 2 + 30);
  group.add(sock);
  return group;
}

function buildTrees() {
  const random = createRandom(4242);
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const coneGeo = new THREE.ConeGeometry(4.2, 13, 7);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 1 });
  const count = 520;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const crowns = new THREE.InstancedMesh(coneGeo, coneMat, count);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 40) {
    guard += 1;
    const x = (random() * 2 - 1) * (half - 120);
    const z = (random() * 2 - 1) * (half - 120);
    const h = heightAt(x, z);
    if (h < water + 3 || h > 170) continue;
    if (slopeAt(x, z) > 0.5) continue;
    // Keep the strip and its approaches clear.
    if (Math.abs(x - runway.x) < 70 && z > runway.z - runway.length / 2 - 200 && z < runway.z + runway.length / 2 + 200) continue;
    const lakeD = Math.hypot(x - 1200, z + 1250);
    if (lakeD < 500) continue;
    const s = 0.8 + random() * 0.9;
    dummy.position.set(x, h + 2.2 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (2.2 + 6.5) * s;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  const group = new THREE.Group();
  group.add(trunks);
  group.add(crowns);
  return group;
}

function buildClouds() {
  const random = createRandom(777);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(random() * 3);
    for (let p = 0; p < puffs; p += 1) {
      const r = 14 + random() * 22;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      puff.position.set((random() - 0.5) * 70, (random() - 0.5) * 8, (random() - 0.5) * 36);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set((random() * 2 - 1) * 1800, 260 + random() * 160, (random() * 2 - 1) * 1800);
    cloud.userData.speed = 2 + random() * 3;
    group.add(cloud);
    clouds.push(cloud);
  }
  return { group, clouds };
}

/** Build the whole static world and return its meshes plus the clouds to drift. */
export function buildWorld(scene) {
  scene.add(buildTerrainMesh());
  scene.add(buildLake());
  scene.add(buildRunway());
  scene.add(buildAirfield());
  scene.add(buildTrees());
  const { group, clouds } = buildClouds();
  scene.add(group);
  return { clouds };
}

/** Drift the clouds with the wind; wrap them around the valley edge. */
export function stepClouds(clouds, dt, wind) {
  for (const cloud of clouds) {
    cloud.position.x += (cloud.userData.speed + wind) * dt;
    if (cloud.position.x > half + 200) cloud.position.x = -half - 200;
  }
}
