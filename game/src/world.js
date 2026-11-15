// Map "Ironworks Yard": an original 64 x 48 m industrial yard with two bombsites, three lanes
// (west long, mid, east long), crates for cover and climbable low boxes. Amber spawns south,
// Cobalt spawns north; Site A (Foundry, west) and Site B (Yard, east) sit behind the north wall.
// Every box is a collider and a bullet stop; floors carry distinct procedural textures per area.
import * as THREE from 'three';
import { makeTextures } from './textures.js';

export const SITES = {
  A: { name: 'Foundry', center: new THREE.Vector3(-23, 0, -13), radius: 5.2 },
  B: { name: 'Yard', center: new THREE.Vector3(23, 0, -13), radius: 5.2 },
};
export const SPAWNS = {
  amber: [[-3, 20], [-1, 21], [1, 21], [3, 20], [0, 18.5]],
  cobalt: [[-3, -20], [-1, -21], [1, -21], [3, -20], [0, -18.5]],
};
// Waypoint routes (x,z) from Amber spawn to each site, and Cobalt rotate routes to each site.
// Every leg passes through a door gap (z=+8 gaps at x -12/0/+12, z=-6 gaps at x -13/0/+13);
// no leg crosses a solid wall and no waypoint sits inside a crate.
export const ROUTES = {
  A_long: [[0, 19], [-8, 16], [-12, 11], [-12, 4], [-14, -2], [-13, -8], [-20, -11]],
  A_mid: [[0, 19], [0, 11], [0, 4], [-8, -3], [-13, -4], [-13, -8], [-22, -11]],
  B_long: [[0, 19], [8, 16], [12, 11], [12, 4], [14, -2], [13, -8], [20, -11]],
  B_mid: [[0, 19], [0, 11], [0, 4], [8, -3], [13, -4], [13, -8], [22, -11]],
  mid: [[0, 19], [0, 10], [0, 2]],
  rotA: [[0, -19], [-8, -16], [-16, -14], [-22, -12]],
  rotB: [[0, -19], [8, -16], [16, -14], [22, -12]],
  toMid: [[0, -19], [0, -10], [0, -3]],
};
export const HOLDS = {
  A: [[-19, -9], [-26, -16], [-20, -17.5], [-16, -14]],
  B: [[19, -9], [26, -16], [20, -17.5], [16, -14]],
  mid: [[0, -9], [6, -8], [-6, -8], [-10, 0], [10, 0]],
};

export function createWorld(scene) {
  const T = makeTextures();
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function mat(map, opts = {}) {
    return new THREE.MeshStandardMaterial({ map, roughness: opts.rough ?? 0.92, metalness: opts.metal ?? 0.04 });
  }
  const mGround = mat(T.ground);
  const mConcrete = mat(T.concrete);
  const mMetal = mat(T.metal, { rough: 0.6, metal: 0.35 });
  const mCrate = mat(T.crate, { rough: 0.85 });
  const mHazard = mat(T.hazard, { rough: 0.8 });
  const mRust = mat(T.rust);
  const mYard = mat(T.yard);
  const mSiteA = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.5, emissive: 0xf0a830, emissiveIntensity: 0.35 });
  const mSiteB = new THREE.MeshStandardMaterial({ color: 0x3fa7ff, roughness: 0.5, emissive: 0x3fa7ff, emissiveIntensity: 0.35 });

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function flat(w, d, x, z, material) { // floor plate, no collider (ground plane handles it)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), material);
    mesh.position.set(x, 0.03, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }

  // Ground + site floors with distinct identities.
  box(66, 0.4, 50, 0, -0.2, 0, mGround);
  flat(15, 13, -23, -13, mRust);   // Foundry floor
  flat(15, 13, 23, -13, mYard);   // Yard floor
  flat(10, 8, 0, 2, mConcrete);   // mid plaza

  // Perimeter walls (4.6 m).
  box(66, 4.6, 0.6, 0, 2.3, -24.3, mConcrete);
  box(66, 4.6, 0.6, 0, 2.3, 24.3, mConcrete);
  box(0.6, 4.6, 50, -32.3, 2.3, 0, mConcrete);
  box(0.6, 4.6, 50, 32.3, 2.3, 0, mConcrete);

  // Mid wall (z = +8) with three door gaps: west (-14..-10), mid (-2..2), east (10..14).
  box(18, 4.6, 0.6, -23, 2.3, 8, mConcrete);
  box(18, 4.6, 0.6, 23, 2.3, 8, mConcrete);
  box(8, 4.6, 0.6, -6, 2.3, 8, mMetal);
  box(8, 4.6, 0.6, 6, 2.3, 8, mMetal);
  // Lintels over the three doors.
  box(4.4, 1.4, 0.6, -12, 3.9, 8, mHazard);
  box(4.4, 1.4, 0.6, 0, 3.9, 8, mHazard);
  box(4.4, 1.4, 0.6, 12, 3.9, 8, mHazard);
  // Second wall (z = -6) with gaps at the same lanes; creates the mid cross.
  box(18, 4.6, 0.6, -23, 2.3, -6, mMetal);
  box(18, 4.6, 0.6, 23, 2.3, -6, mMetal);
  box(10, 4.6, 0.6, -7, 2.3, -6, mConcrete);
  box(10, 4.6, 0.6, 7, 2.3, -6, mConcrete);
  box(4.4, 1.4, 0.6, -12, 3.9, -6, mHazard);
  box(4.4, 1.4, 0.6, 12, 3.9, -6, mHazard);

  // Site A — Foundry: furnace block, pipe stack, crates. Site B — Yard: container, crates.
  box(5, 3.4, 2, -28, 1.7, -18, mRust);                    // furnace
  box(1.2, 5.4, 1.2, -27, 2.7, -10, mMetal);               // chimney
  box(1.2, 5.4, 1.2, -18, 2.7, -19.5, mMetal);             // pipe
  box(6, 3, 2.4, 28, 1.5, -19, mMetal);                    // container B
  box(2.4, 2.4, 2.4, 28, 1.2, -8.5, mCrate);

  // Crates: low (0.85, jumpable) and tall (1.7) cover, spread over lanes, mid and sites.
  const crates = [
    [-14, 4, 1.7], [-6, 13, 0.85], [-18, 6, 0.85], [-16, -3, 1.7], [-24, -8, 0.85],
    [-26, -12, 1.7], [-20, -16, 0.85], [14, 4, 1.7], [6, 13, 0.85], [18, 6, 0.85],
    [16, -3, 1.7], [24, -8, 0.85], [26, -12, 1.7], [20, -16, 0.85],
    [-5.5, 0.5, 1.7], [5, 4.5, 0.85], [-7, 3, 0.85], [7, 3, 0.85], [3, -11, 0.85],
    [-11, 19, 1.7], [11, 19, 0.85], [4.5, 13, 1.7], [-12, -12, 0.85], [12, -12, 0.85],
  ];
  for (const [x, z, h] of crates) box(1.7, h, 1.7, x, h / 2, z, mCrate);
  // Stacked doubles at the sites (climbable to peek over the mid wall line).
  box(1.7, 0.85, 1.7, -14.8, 2.12, 4, mCrate);
  box(1.7, 0.85, 1.7, 14.8, 2.12, 4, mCrate);
  box(1.7, 0.85, 1.7, -3.8, 2.12, 0, mCrate);

  // Site markers: glowing pads + letter boards on the north wall.
  const padA = box(3.4, 0.12, 3.4, -23, 0.08, -13, mSiteA, false);
  const padB = box(3.4, 0.12, 3.4, 23, 0.08, -13, mSiteB, false);
  padA.userData.site = 'A'; padB.userData.site = 'B';
  const boardA = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: T.letterA }));
  boardA.position.set(-23, 2.6, -23.95); group.add(boardA);
  const boardB = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: T.letterB }));
  boardB.position.set(23, 2.6, -23.95); group.add(boardB);
  // Spawn banners.
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ map: T.hazard }));
  banner.position.set(0, 3.4, 23.95); banner.rotation.y = Math.PI; group.add(banner);

  // Skybox: inverted sphere with a dusk gradient + skyline silhouette; sun light matches it.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 24, 16),
    new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0x2a2f36, 30, 110);

  const hemi = new THREE.HemisphereLight(0x8fa8c0, 0x3a2e22, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.7);
  sun.position.set(28, 34, 18);
  sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 110; sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x6f86a8, 0.5);
  fill.position.set(-24, 18, 24);
  scene.add(fill);
  // Warm site lights so both bombsites read at a glance.
  const lightA = new THREE.PointLight(0xf0a830, 22, 16);
  lightA.position.set(-23, 4, -13); scene.add(lightA);
  const lightB = new THREE.PointLight(0x3fa7ff, 22, 16);
  lightB.position.set(23, 4, -13); scene.add(lightB);

  return { colliders, shootables, group, padA, padB, lightA, lightB };
}
