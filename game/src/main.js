// IRONLINE — a 5v5 round-based tactical FPS. One fixed-step simulation (60 Hz) feeding a
// render at display rate; rendering, input and simulation stay in separate modules.
// Flow: menu -> buy phase (15 s, B opens the shop) -> live round (100 s, plant or eliminate)
// -> round end (slow-mo, banner, payouts) -> next buy, first to 8 rounds, max 15.
// The player is Amber (attack) and carries the charge; Cobalt bots defend, rotate and defuse.
// ?shot=start|play|end with &seed=N stages a deterministic frame, renders it twice, freezes
// it and sets window.__shotReady for the grader's screenshots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPONS } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const BOMB_TIME = 40;
const BUY_TIME = 15;
const WIN_ROUNDS = 8;
const MAX_ROUNDS = 15;
const PLANT_TIME = 3;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2027);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

const world = createWorld(scene);
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera);
const bots = createBots(scene, world.colliders, world.shootables, random);
const audio = createAudio();
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

// ---- game state: one place, everything the HUD and the bots read ----
const G = {
  phase: 'menu', prevPhase: 'menu', round: 1, scoreA: 0, scoreB: 0,
  money: 800, hp: 100, armor: 0, smokes: 1, primaryId: null,
  roundTimer: ROUND_TIME, buyTimer: BUY_TIME, elapsed: 0,
  kills: 0, deaths: 0, shots: 0, hits: 0, damage: 0,
  bomb: { carrier: 'player', planted: false, site: null, timer: BOMB_TIME, pos: new THREE.Vector3(), beepAt: 0 },
  plantProgress: 0, defuseBot: null, timeScale: 1, slowUntil: 0,
  spectate: null, lastDeathSite: null, lastDeathAt: 0, roundEnded: false,
  recoilPool: 0, stepAt: 0, heartAt: 0, menuAngle: 0,
};
const body = player.state;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

// ---- particles: one Points cloud, reused every frame (no per-frame allocation) ----
const P_MAX = 320;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(P_MAX * 3);
const pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3);
const pLife = new Float32Array(P_MAX);
const pMaxLife = new Float32Array(P_MAX);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
let pCursor = 0;
function spawnBurst(pos, color, count, speed, life, up = 0.5) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i += 1) {
    const j = pCursor;
    pCursor = (pCursor + 1) % P_MAX;
    pPos[j * 3] = pos.x; pPos[j * 3 + 1] = pos.y; pPos[j * 3 + 2] = pos.z;
    pCol[j * 3] = c.r; pCol[j * 3 + 1] = c.g; pCol[j * 3 + 2] = c.b;
    const a = random() * Math.PI * 2;
    const s = speed * (0.4 + random() * 0.8);
    pVel[j * 3] = Math.cos(a) * s;
    pVel[j * 3 + 1] = (random() * up + 0.2) * speed;
    pVel[j * 3 + 2] = Math.sin(a) * s;
    pLife[j] = pMaxLife[j] = life * (0.6 + random() * 0.7);
  }
}
function stepParticles(dt) {
  for (let j = 0; j < P_MAX; j += 1) {
    if (pLife[j] <= 0) { pPos[j * 3 + 1] = -100; continue; }
    pLife[j] -= dt;
    pVel[j * 3 + 1] -= 6 * dt;
    pPos[j * 3] += pVel[j * 3] * dt;
    pPos[j * 3 + 1] += pVel[j * 3 + 1] * dt;
    pPos[j * 3 + 2] += pVel[j * 3 + 2] * dt;
    if (pPos[j * 3 + 1] < 0.02) { pPos[j * 3 + 1] = 0.02; pVel[j * 3 + 1] *= -0.3; }
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

// ---- tracers: a small pool of fading lines ----
const tracers = [];
for (let i = 0; i < 20; i += 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const m = new THREE.LineBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0 });
  const line = new THREE.Line(g, m);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, ttl: 0 });
}
let tracerCursor = 0;
function spawnTracer(a, b, color = 0xffc861) {
  const t = tracers[tracerCursor];
  tracerCursor = (tracerCursor + 1) % tracers.length;
  const arr = t.line.geometry.attributes.position.array;
  arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.material.color.setHex(color);
  t.line.material.opacity = 0.9;
  t.ttl = 0.09;
}
function stepTracers(dt) {
  for (const t of tracers) {
    if (t.ttl <= 0) continue;
    t.ttl -= dt;
    t.line.material.opacity = Math.max(0, t.ttl / 0.09) * 0.9;
  }
}

// ---- smoke grenades ----
const smokes = [];
const smokeGeo = new THREE.SphereGeometry(3.4, 14, 10);
function spawnSmoke(pos) {
  const mesh = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0x9aa4ad, transparent: true, opacity: 0.34, depthWrite: false }));
  mesh.position.set(pos.x, 1.6, pos.z);
  scene.add(mesh);
  smokes.push({ x: pos.x, y: 1.6, z: pos.z, r: 3.4, ttl: 14, mesh });
  audio.smoke();
}
const grenades = [];
function throwSmoke() {
  if (G.smokes <= 0 || G.phase !== 'live' || G.hp <= 0) { if (G.smokes <= 0) hud.toast('No smoke grenades — buy more [B] in the buy phase'); return; }
  G.smokes -= 1;
  camera.getWorldDirection(direction);
  grenades.push({
    pos: camera.position.clone(),
    vel: direction.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0)),
    ttl: 1.6,
  });
  audio.click();
}
function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    g.ttl -= dt;
    if (g.pos.y <= 0.1 || g.ttl <= 0) {
      spawnSmoke(new THREE.Vector3(g.pos.x, 0, g.pos.z));
      grenades.splice(i, 1);
    }
  }
  for (let i = smokes.length - 1; i >= 0; i -= 1) {
    const s = smokes[i];
    s.ttl -= dt;
    s.mesh.material.opacity = Math.min(0.34, s.ttl * 0.1);
    s.mesh.scale.setScalar(1 + (14 - s.ttl) * 0.01);
    if (s.ttl <= 0) { scene.remove(s.mesh); s.mesh.material.dispose(); smokes.splice(i, 1); }
  }
}

// ---- bomb mesh + site markers (objective must be unmistakable) ----
const bombMesh = new THREE.Group();
const bombBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 0.6 }));
bombMesh.add(bombBox);
const bombLight = new THREE.PointLight(0xff2a1a, 0, 8);
bombLight.position.y = 0.5;
bombMesh.add(bombLight);
bombMesh.visible = false;
scene.add(bombMesh);
function makeMarker(color) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
  m.renderOrder = 10;
  scene.add(m);
  return m;
}
const markerA = makeMarker(0xf0a830);
const markerB = makeMarker(0x3fa7ff);
markerA.position.set(SITES.A.center.x, 5.4, SITES.A.center.z);
markerB.position.set(SITES.B.center.x, 5.4, SITES.B.center.z);

// ---- HUD ----
const hud = createHud({
  onPlay: () => {
    audio.unlock();
    if (G.phase === 'menu' || G.phase === 'matchEnd') { startMatch(); return; }
    if (G.phase === 'paused') { resumeFromPause(); return; }
  },
  onBuy: (id) => buyItem(id),
  onBuyClose: () => { if (G.phase === 'buy') startRound(); },
  onPlayAgain: () => startMatch(),
  onMenu: () => { toMenu(); },
  onMute: () => { audio.setMuted(!audio.isMuted()); hud.setMute(audio.isMuted()); },
});
const input = createInput(renderer.domElement, onLockChange);

function onLockChange(locked, hadLock) {
  if (shot) return;
  if (locked) {
    if (G.phase === 'paused') resumeFromPause();
    else if (G.phase === 'live' || G.phase === 'buy') hud.hideOverlay();
    started = true;
  } else if (hadLock && G.phase === 'live' && G.hp > 0 && !hud.isHelpOpen() && !hud.isBuyOpen()) {
    // Only a lost lock pauses the game; a lock that never engaged (headless, denied)
    // must not freeze a live round.
    G.prevPhase = 'live';
    G.phase = 'paused';
    hud.showOverlay('paused');
  }
}
function resumeFromPause() {
  G.phase = 'live';
  hud.hideOverlay();
  input.requestLock();
}

function feedKill(killer, victim, head, killerTeam, victimTeam) {
  const kc = killerTeam === 'amber' ? 'a' : 'd';
  const vc = victimTeam === 'amber' ? 'a' : 'd';
  hud.feed(`<span class="${kc}">${killer}</span> <span class="w">⌖</span> <span class="${vc}">${victim}</span>${head ? ' <span class="hs">HEADSHOT</span>' : ''}`);
}
function feedCallout(text, team) {
  const c = team === 'amber' ? 'a' : 'd';
  hud.feed(`<span class="${c}">▸ ${text}</span>`, 4200);
}

// ---- economy ----
const PRICE = { armor: 650, smoke: 300 };
function buyItem(id) {
  if (G.phase !== 'buy') return;
  if (id === 'armor') {
    if (G.money < PRICE.armor) { audio.denied(); return; }
    if (G.armor >= 100) { hud.toast('Armor already full'); return; }
    G.money -= PRICE.armor; G.armor = 100; audio.buy(); hud.toast('Kevlar vest equipped — armor 100');
  } else if (id === 'smoke') {
    if (G.money < PRICE.smoke) { audio.denied(); return; }
    G.money -= PRICE.smoke; G.smokes += 2; audio.buy(); hud.toast(`Smoke grenades +2 (now ${G.smokes})`);
  } else {
    const def = WEAPONS[id];
    if (!def) return;
    if (G.primaryId === id) { hud.toast(`${def.name} already owned`); return; }
    if (G.money < def.price) { audio.denied(); hud.toast('Not enough money'); return; }
    G.money -= def.price;
    G.primaryId = id;
    weapon.givePrimary(id);
    audio.buy();
    hud.toast(`${def.name} bought — press 2 to equip`);
  }
  refreshBuy();
  syncHud();
}
function refreshBuy() {
  hud.showBuy(G.round, G.money,
    (id) => (id === 'armor' ? G.armor >= 100 : id === 'smoke' ? false : G.primaryId === id),
    (id, price) => G.money >= price);
}

// ---- round / match flow ----
function toMenu() {
  G.phase = 'menu';
  G.scoreA = 0; G.scoreB = 0; G.round = 1;
  hud.hideEnd(); hud.hideBuy();
  hud.showOverlay('start');
  bots.resetRound(1, true);
  player.reset(0, 20, 0);
  syncCamera();
}
function startMatch() {
  G.scoreA = 0; G.scoreB = 0; G.round = 1;
  G.money = 800; G.kills = 0; G.deaths = 0; G.shots = 0; G.hits = 0; G.damage = 0;
  G.primaryId = null; G.smokes = 1; G.armor = 0; G.hp = 100;
  weapon.resetLoadout(null);
  hud.hideEnd(); hud.hideOverlay();
  startBuy();
}
function startBuy() {
  G.phase = 'buy';
  G.buyTimer = BUY_TIME;
  G.hp = 100;
  G.bomb = { carrier: 'player', planted: false, site: null, timer: BOMB_TIME, pos: new THREE.Vector3(), beepAt: 0 };
  bombMesh.visible = false;
  G.defuseBot = null;
  G.spectate = null;
  player.reset(0, 20, 0);
  weapon.refill();
  bots.resetRound(G.round, true);
  refreshBuy();
  hud.setObjective('Buy phase — press <b>B</b> for the shop, then plant at <b>Site A — Foundry</b> or <b>Site B — Yard</b>');
  hud.setBombStatus('');
  syncCamera();
  input.exitLock();
}
function startRound() {
  G.phase = 'live';
  G.roundTimer = ROUND_TIME;
  G.roundEnded = false;
  G.plantProgress = 0;
  hud.hideBuy();
  hud.banner(`ROUND ${G.round}`, 'Plant the charge at Site A — Foundry or Site B — Yard', 'info', 2600);
  hud.setObjective('Plant the charge at <b>Site A — Foundry</b> or <b>Site B — Yard</b> — or eliminate Cobalt');
  audio.click();
  input.requestLock();
}
function endRound(winner, reason) {
  if (G.roundEnded) return;
  G.roundEnded = true;
  G.phase = 'roundEnd';
  if (winner === 'amber') G.scoreA += 1; else G.scoreB += 1;
  const playerWon = winner === 'amber';
  G.money += playerWon ? 3250 : 1400;
  G.timeScale = 0.3; G.slowUntil = performance.now() + 1200;
  hud.hideBuy();
  hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, playerWon ? 'win' : 'lose', 3400);
  if (playerWon) audio.roundWin(); else audio.roundLose();
  input.exitLock();
  setTimeout(() => {
    if (G.phase !== 'roundEnd') return;
    if (G.scoreA >= WIN_ROUNDS || G.scoreB >= WIN_ROUNDS || G.round >= MAX_ROUNDS) endMatch();
    else { G.round += 1; startBuy(); }
  }, 4200);
}
function endMatch() {
  G.phase = 'matchEnd';
  const won = G.scoreA > G.scoreB;
  const draw = G.scoreA === G.scoreB;
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  syncHud();
  hud.setObjective(draw ? 'Match drawn' : won ? 'Match won — Amber takes the yard' : 'Match lost — Cobalt held the yard');
  hud.showEnd(won,
    draw ? 'DRAW' : won ? 'AMBER WINS THE MATCH' : 'COBALT WINS THE MATCH',
    draw ? `Dead even at ${G.scoreA}–${G.scoreB} after ${MAX_ROUNDS} rounds.`
      : won ? `Amber takes it ${G.scoreA}–${G.scoreB}. The charge did its work — or the rifles did.`
      : `Cobalt holds the yard ${G.scoreB}–${G.scoreA}. The charge never went off when it mattered.`,
    { kills: G.kills, deaths: G.deaths, accuracy: acc, damage: Math.round(G.damage) });
  if (won) audio.matchWin(); else audio.roundLose();
  input.exitLock();
}
function checkRoundEnd() {
  if (G.phase !== 'live' || G.roundEnded) return;
  const amberAlive = bots.aliveCount('amber') + (G.hp > 0 ? 1 : 0);
  const cobaltAlive = bots.aliveCount('cobalt');
  if (G.bomb.planted) {
    // No defenders left: the charge is going off, end it now instead of waiting out 40 s.
    if (cobaltAlive === 0) endRound('amber', 'Cobalt eliminated — the charge will detonate');
    return;
  }
  if (cobaltAlive === 0) endRound('amber', 'Cobalt team eliminated');
  else if (amberAlive === 0) endRound('cobalt', 'Amber team eliminated');
}

// ---- damage ----
function damagePlayer(amount, fromPos, head) {
  if (G.phase !== 'live' || G.hp <= 0) return;
  let dmg = amount;
  if (G.armor > 0) { const absorbed = Math.min(G.armor, dmg * 0.5); G.armor -= absorbed; dmg -= absorbed; }
  G.hp -= dmg;
  hud.damageFlash();
  audio.hurt();
  const dx = fromPos.x - body.position.x;
  const dz = fromPos.z - body.position.z;
  const ang = Math.atan2(dx, dz) * 180 / Math.PI;
  const rel = ((ang - (-body.yaw * 180 / Math.PI)) % 360 + 360) % 360;
  hud.hitDirection(rel);
  if (G.hp <= 0) {
    G.hp = 0; G.deaths += 1;
    const mates = bots.aliveBots('amber');
    G.spectate = mates.length ? mates[0] : null;
    hud.toast(G.spectate ? `You are down — spectating ${G.spectate.name}` : 'You are down');
    audio.roundLose();
    checkRoundEnd();
  }
  syncHud();
}

// ---- shooting ----
function shoot(spread) {
  const def = weapon.def();
  if (def.melee) {
    camera.getWorldDirection(direction);
    raycaster.set(camera.position, direction);
    raycaster.far = def.range;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    if (hit && hit.object.userData.bot && hit.object.userData.bot.alive) {
      applyHit(hit, def.damage, false, def);
    }
    weapon.pullTrigger();
    return true;
  }
  if (!weapon.takeRound()) { audio.dryClick(); return false; }
  G.shots += def.pellets;
  camera.getWorldDirection(direction);
  scene.updateMatrixWorld(true);
  const muzzlePos = camera.localToWorld(muzzle.set(0.28, -0.23, -1.25));
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < def.pellets; p += 1) {
    const dir = direction.clone();
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    raycaster.set(camera.position, dir);
    raycaster.far = 90;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    const end = hit ? hit.point : camera.position.clone().addScaledVector(dir, 60);
    spawnTracer(muzzlePos, end);
    if (!hit) continue;
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      if (!bot.alive) continue;
      const head = hit.object.userData.part === 'head';
      const dist = hit.distance;
      const falloff = dist > def.falloffFar ? 0.55 : dist > def.falloffNear ? 0.85 : 1;
      const dmg = def.damage * falloff * (head ? def.headMult : 1);
      applyHit(hit, dmg, head, def);
      anyHit = true;
      if (bot.hp <= 0) anyKill = true;
    } else {
      spawnBurst(hit.point, 0xffc861, 5, 2.2, 0.35);
    }
  }
  if (anyHit) { G.hits += 1; hud.hitMarker(anyKill, shot ? 4000 : 90); audio.hit(); if (anyKill) audio.kill(); }
  weapon.pullTrigger();
  audio.shot(def.sound);
  bots.hear(body.position.x, body.position.z, 18, G.elapsed);
  player.recoil(def.kick * (shot ? 0 : 1), (random() * 2 - 1) * 0.003);
  G.recoilPool += def.kick;
  syncHud();
  return true;
}
function applyHit(hit, dmg, head, def) {
  const bot = hit.object.userData.bot;
  const killed = bots.damage(bot, dmg, null, head, botCtx);
  G.damage += dmg;
  if (killed) {
    feedKill('YOU', bot.name, head, 'amber', 'cobalt');
    G.kills += 1;
    G.money += 300;
    hud.toast(`+ $300 — ${bot.name} down${head ? ' (headshot)' : ''}`);
  }
  spawnBurst(hit.point, 0xff4d3d, 8, 2.6, 0.4);
  checkRoundEnd();
}

// ---- bot callbacks (the bots read these, main.js owns the consequences) ----
const botCtx = {
  get playerAlive() { return G.hp > 0 && (G.phase === 'live' || G.phase === 'roundEnd'); },
  get playerPos() { return body.position; },
  get playerSpeed() { return player.groundSpeed(); },
  get playerTeam() { return 'amber'; },
  get canFight() { return G.phase === 'live'; },
  get bomb() { return G.bomb; },
  get smokes() { return smokes; },
  get cameraPos() { return camera.position; },
  get lastDeathSite() { return G.lastDeathSite; },
  get lastDeathAt() { return G.lastDeathAt; },
  damagePlayer,
  onBotShot(bot, from, to, dist) {
    spawnTracer(from, to, bot.team === 'amber' ? 0xffc861 : 0x7fb8ff);
    audio.enemyShot(dist);
    bots.hear(from.x, from.z, 14, G.elapsed);
  },
  onBotDamaged() { /* hit feedback comes from the shooter's own ray */ },
  onBotKilled(bot, fromBot, head) {
    if (fromBot) feedKill(fromBot.name, bot.name, head, fromBot.team, bot.team);
    if (bot.team === 'cobalt') {
      G.lastDeathSite = bot.site; G.lastDeathAt = G.elapsed;
    }
    if (bot.team === 'amber' && G.spectate === bot) {
      const mates = bots.aliveBots('amber');
      G.spectate = mates.length ? mates[0] : null;
    }
    spawnBurst(new THREE.Vector3(bot.pos.x, 1.2, bot.pos.z), 0xff4d3d, 14, 3, 0.6);
    checkRoundEnd();
  },
  onPlanted(site, bot) {
    G.bomb.planted = true;
    G.bomb.site = site;
    G.bomb.timer = BOMB_TIME;
    G.bomb.pos.copy(SITES[site].center);
    G.bomb.carrier = null;
    bombMesh.visible = true;
    bombMesh.position.copy(SITES[site].center).setY(0.25);
    hud.banner('CHARGE PLANTED', `Site ${site} — ${SITES[site].name}. Hold it for 40 seconds!`, 'win', 3000);
    feedCallout(`${bot.name} planted the charge at Site ${site}!`, 'amber');
    audio.plantBeep();
    hud.setObjective(`Charge planted at <b>Site ${site} — ${SITES[site].name}</b> — defend it!`);
  },
  onDefused(bot) {
    G.bomb.planted = false;
    bombMesh.visible = false;
    endRound('cobalt', `${bot.name} defused the charge`);
  },
  onCallout(text, team) { feedCallout(text, team); },
  onChannel(bot, kind, progress) {
    if (kind === 'plant') hud.setPlant(progress, `${bot.name} is planting…`);
    else { G.defuseBot = bot; hud.setPlant(progress, `${bot.name} is DEFUSING the charge!`); hud.setBombStatus('⚠ DEFUSING!', true); }
  },
};

// ---- plant / defuse channels for the player ----
function updatePlant(dt) {
  const bomb = G.bomb;
  const nearSite = (site) => {
    const c = SITES[site].center;
    return Math.hypot(body.position.x - c.x, body.position.z - c.z) < SITES[site].radius;
  };
  const planting = G.phase === 'live' && G.hp > 0 && !bomb.planted && bomb.carrier === 'player'
    && (nearSite('A') || nearSite('B')) && input.state.keys.has('KeyE');
  if (planting) {
    G.plantProgress += dt / PLANT_TIME;
    const site = nearSite('A') ? 'A' : 'B';
    hud.setPlant(G.plantProgress, `Planting charge at Site ${site}…`);
    if (Math.random() < dt * 2) audio.plantBeep();
    if (G.plantProgress >= 1) {
      G.plantProgress = 0;
      hud.setPlant(null);
      botCtx.onPlanted(site, { name: 'YOU' });
      G.money += 300;
      hud.toast('+ $300 — charge planted');
      syncHud();
    }
  } else {
    if (G.plantProgress > 0) G.plantProgress = 0;
    if (!G.defuseBot) hud.setPlant(null);
  }
  if (!bomb.planted) G.defuseBot = null;
  else if (!bots.bots.some((b) => b.channel === 'defuse' && b.alive)) {
    G.defuseBot = null;
    hud.setBombStatus(`● BOMB ${Math.ceil(bomb.timer)}s — Site ${bomb.site}`, false);
  }
}

// ---- camera ----
function syncCamera() {
  if (G.phase === 'menu') {
    const a = G.menuAngle;
    camera.position.set(Math.sin(a) * 24, 8.5, Math.cos(a) * 18);
    camera.lookAt(0, 2.5, -6);
    return;
  }
  if (G.hp <= 0 && G.spectate && (G.phase === 'live' || G.phase === 'roundEnd')) {
    const b = G.spectate;
    camera.position.set(b.pos.x, b.pos.y + 1.7, b.pos.z);
    camera.rotation.set(0, b.yaw, 0, 'YXZ');
    return;
  }
  if (G.hp <= 0 && G.phase === 'live') {
    // Death cam: slump to the floor.
    camera.position.set(body.position.x, Math.max(0.35, body.position.y + 0.4), body.position.z);
    camera.rotation.set(-0.5, body.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}
function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

// ---- HUD sync ----
function syncHud() {
  const def = weapon.def();
  hud.setHealth(G.hp, G.armor);
  hud.setMoney(G.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, def.name, weapon.state.reloadLeft > 0);
  hud.setScore(G.scoreA, G.scoreB, G.round);
  hud.setTimer(G.bomb.planted ? G.bomb.timer : G.roundTimer, G.bomb.planted);
  hud.setSpread(weapon.spread(player.groundSpeed()));
}

// ---- fixed-step simulation ----
function step(dt) {
  G.elapsed += dt;
  if (G.phase === 'menu') {
    G.menuAngle += dt * 0.05;
    markerA.rotation.y += dt; markerB.rotation.y += dt;
    markerA.position.y = 5.4 + Math.sin(G.elapsed * 1.4) * 0.25;
    markerB.position.y = 5.4 + Math.cos(G.elapsed * 1.4) * 0.25;
    bots.step(dt, G.elapsed, { ...botCtx, playerAlive: false, playerPos: body.position, playerSpeed: 0 });
    stepParticles(dt);
    return;
  }
  if (G.phase === 'buy') {
    G.buyTimer -= dt;
    hud.setTimer(G.buyTimer, false);
    hud.setObjective('Buy phase — press <b>B</b> for the shop, then plant at <b>Site A — Foundry</b> or <b>Site B — Yard</b>');
    if (input.wasPressed('KeyB')) { if (hud.isBuyOpen()) { hud.hideBuy(); } else refreshBuy(); }
    if (input.wasPressed('Digit1')) buyItem('rifle');
    if (input.wasPressed('Digit2')) buyItem('smg');
    if (input.wasPressed('Digit3')) buyItem('sniper');
    if (input.wasPressed('Digit4')) buyItem('shotgun');
    if (input.wasPressed('Digit5')) buyItem('armor');
    if (input.wasPressed('Digit6')) buyItem('smoke');
    if (G.buyTimer <= 0) startRound();
    bots.step(dt, G.elapsed, { ...botCtx, playerAlive: false, playerPos: body.position, playerSpeed: 0 });
    stepParticles(dt);
    syncHud();
    return;
  }
  if (G.phase === 'paused' || G.phase === 'help') return;
  if (G.phase === 'roundEnd' || G.phase === 'matchEnd') {
    bots.step(dt, G.elapsed, { ...botCtx, playerAlive: false, playerPos: body.position, playerSpeed: 0 });
    stepParticles(dt); stepTracers(dt);
    return;
  }
  // ---- live ----
  const keys = input.state.keys;
  player.step(dt, keys);
  // Recoil recovery: the kick climbs, then the aim settles back.
  if (G.recoilPool > 0) {
    const rec = Math.min(G.recoilPool, dt * 0.055);
    body.pitch -= rec;
    G.recoilPool -= rec;
  }
  weapon.step(dt, player.groundSpeed(), input.state.lookX, input.state.lookY, input.state.aiming);
  // ADS: right mouse narrows the field of view and steadies the spread.
  const targetFov = input.state.aiming ? (weapon.state.current === 'sniper' ? 34 : 55) : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }
  // Timers: round clock, bomb clock, heartbeat tension.
  if (G.bomb.planted) {
    G.bomb.timer -= dt;
    const interval = 1.1 - (1 - G.bomb.timer / BOMB_TIME) * 0.85;
    if (G.elapsed >= G.bomb.beepAt) {
      G.bomb.beepAt = G.elapsed + interval;
      audio.bombBeep(G.bomb.timer < 10);
      bombLight.intensity = bombLight.intensity > 0 ? 0 : 26;
    }
    if (G.bomb.timer <= 0) {
      spawnBurst(G.bomb.pos, 0xff8c2e, 60, 9, 1.2, 1.4);
      spawnBurst(G.bomb.pos, 0xff4d3d, 40, 6, 0.9);
      audio.explosion();
      bombMesh.visible = false;
      G.bomb.planted = false;
      endRound('amber', 'The charge detonated at the site');
      return;
    }
  } else {
    G.roundTimer -= dt;
    if (G.roundTimer <= 10.5 && G.elapsed >= G.heartAt) {
      G.heartAt = G.elapsed + 1;
      audio.heartbeat();
      if (G.roundTimer <= 5) audio.tick();
    }
    if (G.roundTimer <= 0) { endRound('cobalt', 'Time expired — the charge was never planted'); return; }
  }
  updatePlant(dt);
  if (input.wasPressed('KeyG')) throwSmoke();
  if (input.wasPressed('KeyH')) { G.prevPhase = 'live'; G.phase = 'help'; hud.showHelp(); input.exitLock(); }
  if (input.wasPressed('KeyB')) hud.toast('Buy phase is over — next round, press B');
  if (input.wasPressed('Digit1')) { weapon.equip('pistol'); audio.click(); }
  if (input.wasPressed('Digit2') && weapon.primaryId()) { weapon.equip(weapon.primaryId()); audio.click(); }
  if (input.wasPressed('Digit3')) { weapon.equip('knife'); audio.click(); }
  if (input.wasPressed('KeyR')) weapon.reload();
  // Footsteps.
  if (player.groundSpeed() > 1 && G.elapsed >= G.stepAt) {
    G.stepAt = G.elapsed + (player.groundSpeed() > 4 ? 0.34 : 0.5);
    if (!keys.has('ShiftLeft') && !keys.has('ShiftRight')) audio.step();
  }
  bots.step(dt, G.elapsed, botCtx);
  stepGrenades(dt);
  stepParticles(dt);
  stepTracers(dt);
  markerA.rotation.y += dt; markerB.rotation.y += dt;
  markerA.position.y = 5.4 + Math.sin(G.elapsed * 1.4) * 0.25;
  markerB.position.y = 5.4 + Math.cos(G.elapsed * 1.4) * 0.25;
  bombBox.material.emissiveIntensity = 0.4 + Math.sin(G.elapsed * 10) * 0.4;
  // Scoreboard.
  hud.showScoreboard(keys.has('Tab'));
  if (keys.has('Tab')) {
    const rows = [{ name: 'YOU', team: 'amber', kills: G.kills, deaths: G.deaths, money: G.money, you: true }]
      .concat(bots.bots.map((b) => ({ name: b.name, team: b.team, kills: b.kills, deaths: b.deaths, money: b.money })));
    hud.setScoreboard(rows);
  }
  checkRoundEnd();
  syncHud();
}

// ---- per-frame: input, fixed steps, render ----
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    if (performance.now() > G.slowUntil && G.timeScale !== 1) G.timeScale = 1;
    const dt = rawDt * G.timeScale;
    const look = input.takeLook();
    if (G.phase === 'live' && G.hp > 0) {
      player.look(look.x, look.y);
      if (input.state.firing && weapon.ready()) shoot(weapon.spread(player.groundSpeed()) * (input.state.aiming ? 0.6 : 1));
      if (input.state.keys.has('KeyR')) weapon.reload();
    } else if (G.phase === 'live' && G.hp <= 0) {
      // Dead: spectate keys switch the bot being watched.
      if (input.wasPressed('Space') && bots.aliveBots('amber').length > 1) {
        const mates = bots.aliveBots('amber');
        const i = mates.indexOf(G.spectate);
        G.spectate = mates[(i + 1) % mates.length];
        hud.toast(`Spectating ${G.spectate.name}`);
      }
    }
    if (G.phase === 'help' && input.wasPressed('KeyH')) { hud.hideHelp(); G.phase = G.prevPhase; input.requestLock(); }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) { step(FIXED_STEP); accumulator -= FIXED_STEP; steps += 1; }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) { for (let i = 0; i < steps; i += 1) step(FIXED_STEP); }

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) { window.__shotReady = true; frozen = true; }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  audio.setMuted(true);
  if (name === 'start') {
    toMenu();
    body.position.set(0, 0, 20);
    G.menuAngle = 0.6;
    settle(30);
    syncCamera();
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'play') {
    startMatch();
    G.phase = 'live';
    G.roundTimer = 100;
    hud.hideBuy();
    // Stage a firefight: player in mid lane, three Cobalt ahead, one Amber mate beside.
    body.position.set(0, 0, 6);
    body.yaw = 0; body.pitch = 0;
    const foes = bots.bots.filter((b) => b.team === 'cobalt');
    const spots = [[-2.5, -6], [2, -8.5], [0.5, -4]];
    foes.slice(0, 3).forEach((b, i) => {
      b.pos.set(spots[i][0], 0, spots[i][1]);
      b.yaw = Math.PI; b.aimYaw = Math.PI;
      b.fig.group.position.copy(b.pos);
    });
    const mate = bots.bots.find((b) => b.team === 'amber');
    mate.pos.set(-2.2, 0, 3.5); mate.yaw = 0; mate.aimYaw = 0;
    mate.fig.group.position.copy(mate.pos);
    weapon.givePrimary('rifle');
    settle(20);
    aimAt(new THREE.Vector3(0.5, 1.2, -4));
    shoot(0);
    settle(2);
    aimAt(new THREE.Vector3(2, 1.3, -8.5));
    hud.setObjective('Plant the charge at <b>Site A — Foundry</b> or <b>Site B — Yard</b>');
    syncHud();
    paintTwiceThenReady();
    return;
  }
  // end: match-end screen.
  startMatch();
  G.scoreA = 8; G.scoreB = 5; G.round = 13;
  G.kills = 17; G.deaths = 9; G.shots = 210; G.hits = 96; G.damage = 3420;
  G.money = 5400;
  endMatch();
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

toMenu();
syncCamera();
syncHud();
// Debug/testing probe (read-only state for headless play-tests).
window.__game = G;
window.__bots = bots;
window.__probe = { body, weapon, input };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
