// The aircraft, built from primitives so it reads as a machine, not a shape:
// a bush plane in teal and cream with orange trim, a spinning propeller,
// navigation lights and fixed landing gear. No model file, no texture.
import * as THREE from '../vendor/three.min.js';
import { PALETTE } from './config.js';

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}

/** Build the plane. Returns the group plus the parts that move or blink. */
export function buildAircraft() {
  const group = new THREE.Group();
  const body = std(PALETTE.planeBody);
  const cream = std(PALETTE.planeCream);
  const accent = std(PALETTE.planeAccent);
  const dark = std(0x22262b, { roughness: 0.4, metalness: 0.5 });

  // Fuselage: a tapered cylinder along Z, nose forward (-Z is forward here).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.6, 12), body);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -2.9;
  group.add(nose);
  // Tail cone.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 10), body);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 3.9;
  group.add(tail);
  // Canopy: a tinted glasshouse the pilot sits under.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 }),
  );
  canopy.scale.set(1, 0.75, 1.7);
  canopy.position.set(0, 0.72, -0.6);
  group.add(canopy);
  // Main wing: one long slab with a slight dihedral, cream on top.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 1.9), cream);
  wing.position.set(0, 0.25, -0.4);
  wing.rotation.z = 0.03;
  group.add(wing);
  const wingStripe = new THREE.Mesh(new THREE.BoxGeometry(11.42, 0.06, 0.5), accent);
  wingStripe.position.set(0, 0.37, -1.1);
  group.add(wingStripe);
  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), cream);
  tailplane.position.set(0, 0.35, 4.4);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), body);
  fin.position.set(0, 0.9, 4.5);
  group.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 1.42), accent);
  finTip.position.set(0, 1.55, 4.5);
  group.add(finTip);
  // Propeller: a hub and two blades, spinning around Z at the nose.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.34, 2.6, 0.12);
  const blade1 = new THREE.Mesh(bladeGeo, dark);
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade1);
  prop.add(blade2);
  prop.position.z = -3.7;
  group.add(prop);
  // Fixed landing gear: two legs, two wheels, one tail wheel.
  const gearMat = dark;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), gearMat);
    leg.position.set(side * 0.9, -0.85, -0.9);
    leg.rotation.z = side * 0.35;
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.1, -1.35, -0.9);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.55, 4.2);
  group.add(tailWheel);
  // Navigation lights: red left, green right, white tail — they blink.
  const navLeft = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff2a1e, emissive: 0xff2a1e, emissiveIntensity: 2.5 }),
  );
  navLeft.position.set(-5.7, 0.3, -0.4);
  const navRight = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x2aff66, emissive: 0x2aff66, emissiveIntensity: 2.5 }),
  );
  navRight.position.set(5.7, 0.3, -0.4);
  const navTail = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.5 }),
  );
  navTail.position.set(0, 0.4, 5.0);
  group.add(navLeft, navRight, navTail);

  return { group, prop, navLeft, navRight, navTail };
}
