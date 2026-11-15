// Bots: 4 Amber teammates + 5 Cobalt defenders, built as articulated low-poly figures with
// team colours, health bars and walk/aim/death animation. Behaviour, in priority order:
//   1. fight a visible enemy (reaction delay, aimed bursts, strafing, cover-seeking between bursts)
//   2. do the objective (Amber carrier plants; Cobalt rushes a planted charge to defuse)
//   3. follow the route to the assigned site, hold an angle there, or rotate on sound / the bomb
//   4. retreat toward spawn when outnumbered and hurt
// Hearing: gunfire within 18 m makes nearby bots investigate the noise. Smoke spheres block sight.
import * as THREE from 'three';
import { ROUTES, HOLDS, SITES } from './world.js';

const AMBER_NAMES = ['VEX', 'ORIN', 'KITE', 'JUNO'];
const COBALT_NAMES = ['DUSK', 'HALO', 'PIKE', 'REX', 'NOVA'];
const BOT_SPEED = 3.6;
const EYE = 1.5;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.75;

export function createBots(scene, colliders, shootables, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const tmpDir = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const probe = new THREE.Box3();
  const bots = [];
  const hitMeshes = [];
  let scanTimer = 0;

  function overlaps(x, z, lift = 0.04) {
    probe.min.set(x - 0.34, lift, z - 0.34);
    probe.max.set(x + 0.34, 1.72 - lift, z + 0.34);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }
  function moveBot(bot, dx, dz, dt) {
    const nx = bot.pos.x + dx * dt;
    if (!overlaps(nx, bot.pos.z)) bot.pos.x = nx;
    const nz = bot.pos.z + dz * dt;
    if (!overlaps(bot.pos.x, nz)) bot.pos.z = nz;
  }

  function makeFigure(team) {
    const g = new THREE.Group();
    const teamColor = team === 'amber' ? 0xff8c2e : 0x3fa7ff;
    const cloth = new THREE.MeshStandardMaterial({ color: team === 'amber' ? 0x8a5a28 : 0x2c4a6b, roughness: 0.85 });
    const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.55, metalness: 0.1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2126, roughness: 0.6, metalness: 0.3 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), cloth);
    torso.position.y = 1.12;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.34), teamMat);
    vest.position.y = 1.16;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.y = 1.62;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.34), teamMat);
    helmet.position.y = 1.78;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), dark);
    legL.position.set(-0.14, 0.42, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.14), cloth);
    armL.position.set(-0.33, 1.18, 0.1);
    const armR = armL.clone();
    armR.position.x = 0.33;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
    gun.position.set(0.18, 1.28, -0.28);
    // Health bar above the head, billboarded in step().
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.85, depthWrite: false }));
    barBg.position.y = 2.08;
    const barFg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.06),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.95, depthWrite: false }));
    barFg.position.set(0, 2.08, 0.001);
    g.add(torso, vest, head, helmet, legL, legR, armL, armR, gun, barBg, barFg);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    return { group: g, torso, head, legL, legR, armL, armR, gun, barBg, barFg, teamMat };
  }

  function makeBot(team, name, index) {
    const fig = makeFigure(team);
    scene.add(fig.group);
    const bot = {
      id: `${team}-${index}`, team, name, index,
      fig, pos: new THREE.Vector3(0, 0, 0), yaw: 0, pitch: 0,
      hp: 100, armor: 0, alive: true, fall: 0,
      weapon: 'rifle', damage: 30, gap: 0.13,
      route: [], routeIdx: 0, state: 'route', holdPos: null, holdUntil: 0,
      target: null, targetIsPlayer: false, targetKey: null, reactAt: 0, burstLeft: 0, shootAt: 0,
      scanAt: index * 0.05, strafeDir: 1, strafeAt: 0, speed: BOT_SPEED * (0.92 + random() * 0.16),
      walkPhase: random() * 6, lastHeard: null, hearAt: 0, progress: 0, channel: null,
      stuckTime: 0, avoidUntil: 0, avoidX: 0, avoidZ: 0, kills: 0, deaths: 0, money: 800,
      calloutAt: 0, aimYaw: 0,
    };
    fig.torso.userData.bot = bot; fig.torso.userData.part = 'torso';
    fig.head.userData.bot = bot; fig.head.userData.part = 'head';
    hitMeshes.push(fig.torso, fig.head);
    bots.push(bot);
    return bot;
  }
  for (let i = 0; i < 4; i += 1) makeBot('amber', AMBER_NAMES[i], i);
  for (let i = 0; i < 5; i += 1) makeBot('cobalt', COBALT_NAMES[i], i);

  function resetRound(round, carrierIsPlayer) {
    for (const bot of bots) {
      bot.hp = 100; bot.alive = true; bot.fall = 0; bot.progress = 0; bot.channel = null;
      bot.target = null; bot.burstLeft = 0; bot.lastHeard = null; bot.routeIdx = 0;
      bot.armor = round >= 3 ? 50 : 0;
      bot.weapon = round === 1 ? 'pistol' : 'rifle';
      bot.damage = bot.weapon === 'pistol' ? 24 : 30;
      bot.fig.group.rotation.set(0, 0, 0);
      bot.fig.group.visible = true;
      bot.fig.barBg.visible = true; bot.fig.barFg.visible = true;
    }
    // Attackers split 3 to A, 2 to B (carrier included); defenders hold 2 A / 2 B / 1 mid.
    const amber = bots.filter((b) => b.team === 'amber');
    const cobalt = bots.filter((b) => b.team === 'cobalt');
    const carrierSite = random() < 0.5 ? 'A' : 'B';
    amber.forEach((bot, i) => {
      const site = i < 2 ? carrierSite : carrierSite === 'A' ? 'B' : 'A';
      bot.site = site;
      bot.route = (site === 'A' ? (i % 2 ? ROUTES.A_long : ROUTES.A_mid) : (i % 2 ? ROUTES.B_long : ROUTES.B_mid))
        .map(([x, z]) => new THREE.Vector3(x, 0, z));
      bot.state = 'route';
      bot.carrier = !carrierIsPlayer && i === 0;
    });
    cobalt.forEach((bot, i) => {
      const site = i < 2 ? 'A' : i < 4 ? 'B' : 'mid';
      bot.site = site;
      const hold = site === 'mid' ? HOLDS.mid[i - 4] : HOLDS[site][i % 2];
      bot.holdPos = new THREE.Vector3(hold[0], 0, hold[1]);
      bot.route = [new THREE.Vector3(hold[0], 0, hold[1])];
      bot.state = 'route';
    });
    // Spawn positions.
    const spawn = (team, i) => (team === 'amber'
      ? [-3 + i * 1.6, 20 + (i % 2) * 1.2] : [-3.2 + i * 1.6, -20 - (i % 2) * 1.2]);
    for (const bot of bots) {
      const [x, z] = spawn(bot.team, bot.index);
      bot.pos.set(x, 0, z);
      bot.yaw = bot.team === 'amber' ? 0 : Math.PI;
      bot.aimYaw = bot.yaw;
      bot.fig.group.position.copy(bot.pos);
      bot.lastX = x; bot.lastZ = z; bot.stuckTime = 0;
    }
  }

  function losBlocked(from, to, smokes) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return false;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(shootables, false)[0];
    if (hit && hit.distance < dist - 0.6) return true;
    for (const s of smokes) {
      // Segment-sphere test: does the sight line pass through the smoke ball?
      const cx = s.x - from.x; const cz = s.z - from.z;
      const t = Math.max(0, Math.min(1, (cx * tmpDir.x + cz * tmpDir.z) / 1));
      const px = from.x + tmpDir.x * t * dist - s.x;
      const pz = from.z + tmpDir.z * t * dist - s.z;
      const py = from.y + tmpDir.y * t * dist - s.y;
      if (px * px + pz * pz + py * py < s.r * s.r) return true;
    }
    return false;
  }

  function eyeOf(bot) { return tmpEye.set(bot.pos.x, bot.pos.y + EYE, bot.pos.z); }

  return {
    bots, hitMeshes,
    resetRound,
    aliveCount(team) { return bots.filter((b) => b.team === team && b.alive).length; },
    aliveBots(team) { return bots.filter((b) => b.team === team && b.alive); },
    carrierBot() { return bots.find((b) => b.carrier && b.alive) ?? null; },
    hear(x, z, radius, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
        if (d < radius) { bot.lastHeard = { x, z }; bot.hearAt = time; }
      }
    },
    damage(bot, amount, fromBot, head, ctx) {
      if (!bot.alive) return false;
      // Taking fire breaks a plant/defuse channel.
      if (bot.channel) { bot.channel = null; bot.progress = 0; }
      let dmg = amount;
      if (bot.armor > 0) { const absorbed = Math.min(bot.armor, dmg * 0.5); bot.armor -= absorbed; dmg -= absorbed; }
      bot.hp -= dmg;
      ctx.onBotDamaged?.(bot, dmg);
      if (bot.hp <= 0) {
        bot.hp = 0; bot.alive = false; bot.deaths += 1; bot.fall = 0.0001;
        if (fromBot) fromBot.kills += 1;
        if (bot.carrier) { // drop the charge: nearest living Amber bot picks it up
          bot.carrier = false;
          const mates = bots.filter((b) => b.team === 'amber' && b.alive);
          if (mates.length) {
            mates.sort((a, b) => a.pos.distanceTo(bot.pos) - b.pos.distanceTo(bot.pos));
            mates[0].carrier = true;
            ctx.onCallout?.(`${mates[0].name}: charge picked up, pushing ${mates[0].site}`, 'amber');
          }
        }
        ctx.onBotKilled?.(bot, fromBot, head);
        return true;
      }
      return false;
    },
    step(dt, time, ctx) {
      scanTimer += dt;
      for (const bot of bots) {
        const fig = bot.fig;
        if (!bot.alive) {
          if (bot.fall > 0 && bot.fall < 1) {
            bot.fall = Math.min(1, bot.fall + dt / 0.4);
            fig.group.rotation.x = -bot.fall * 1.5;
            fig.group.position.y = -bot.fall * 0.25;
          }
          continue;
        }
        // --- perception (staggered scans) ---
        if (time >= bot.scanAt) {
          bot.scanAt = time + 0.15 + random() * 0.05;
          bot.target = null; bot.targetIsPlayer = false;
          const eye = eyeOf(bot);
          // Candidates as plain numbers (no allocation in the hot scan loop).
          let bestIsPlayer = false; let bestBot = null;
          let bestX = 0; let bestY = 0; let bestZ = 0; let bestD = 48;
          const consider = (isPlayer, otherBot, px, py, pz) => {
            const dx = px - eye.x; const dy = py - eye.y; const dz = pz - eye.z;
            const d = Math.hypot(dx, dy, dz);
            if (d > bestD) return;
            const ang = Math.atan2(-dx, -dz);
            const diff = Math.abs(((ang - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            const heard = bot.lastHeard && Math.hypot(px - bot.lastHeard.x, pz - bot.lastHeard.z) < 6;
            if (d > 6 && diff > 1.9 && !heard) return;
            tmpTarget.set(px, py, pz);
            if (losBlocked(eye, tmpTarget, ctx.smokes)) return;
            bestIsPlayer = isPlayer; bestBot = otherBot;
            bestX = px; bestY = py; bestZ = pz; bestD = d;
          };
          if (ctx.playerAlive && ctx.playerTeam !== bot.team) {
            consider(true, null, ctx.playerPos.x, ctx.playerPos.y + 1.5, ctx.playerPos.z);
          }
          for (const other of bots) {
            if (other.team === bot.team || !other.alive) continue;
            consider(false, other, other.pos.x, other.pos.y + 1.4, other.pos.z);
          }
          if (bestD < 48) {
            bot.target = { isPlayer: bestIsPlayer, bot: bestBot, x: bestX, y: bestY, z: bestZ };
            bot.targetIsPlayer = bestIsPlayer;
            // Reaction delay only when the target changes, not on every scan.
            const key = bestIsPlayer ? 'player' : bestBot.id;
            if (bot.targetKey !== key) {
              bot.targetKey = key;
              bot.reactAt = time + REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
            }
            if (time - bot.calloutAt > 8 && random() < 0.5) {
              bot.calloutAt = time;
              ctx.onCallout?.(`${bot.name}: contact, ${bot.targetIsPlayer ? 'one hostile' : 'enemy'} ${bestD < 12 ? 'close' : 'mid-range'}!`, bot.team);
            }
          } else {
            bot.targetKey = null;
          }
        }
        // --- objective channels ---
        if (bot.channel === 'plant') {
          bot.progress += dt;
          ctx.onChannel?.(bot, 'plant', bot.progress / 3);
          if (bot.progress >= 3) { bot.channel = null; ctx.onPlanted?.(bot.site, bot); }
          // channeling bots stand still
        } else if (bot.channel === 'defuse') {
          bot.progress += dt;
          ctx.onChannel?.(bot, 'defuse', bot.progress / 5);
          if (bot.progress >= 5) { bot.channel = null; ctx.onDefused?.(bot); }
        } else if (bot.target && ctx.canFight !== false && time >= bot.reactAt) {
          // --- combat: strafe + aimed bursts ---
          const t = bot.target;
          const tp = t.isPlayer ? ctx.playerPos : t.bot.pos;
          const dx = tp.x - bot.pos.x; const dz = tp.z - bot.pos.z;
          const dist = Math.hypot(dx, dz) || 1;
          bot.aimYaw = Math.atan2(-dx, -dz);
          if (time >= bot.strafeAt) { bot.strafeAt = time + 0.5 + random() * 0.7; bot.strafeDir = random() < 0.5 ? -1 : 1; }
          const strafe = bot.strafeDir * bot.speed * 0.55;
          const px = -dz / dist; const pz = dx / dist;
          moveBot(bot, px * strafe * 0.6, pz * strafe * 0.6, dt);
          if (bot.burstLeft <= 0 && time >= bot.shootAt) {
            bot.burstLeft = 3 + ((random() * 3) | 0);
            bot.shootAt = time + 0.1;
          }
          if (bot.burstLeft > 0 && time >= bot.shootAt) {
            bot.burstLeft -= 1;
            bot.shootAt = time + bot.gap + random() * 0.05;
            const moving = t.isPlayer ? ctx.playerSpeed : 2;
            let p = 0.52 - dist * 0.007 - moving * 0.02;
            p = Math.max(0.1, Math.min(0.62, p));
            const from = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
            const head = random() < 0.14;
            const aimY = tp.y + (head ? 1.55 : 1.15) + (random() - 0.5) * 0.5;
            const to = new THREE.Vector3(tp.x, aimY, tp.z);
            ctx.onBotShot?.(bot, from, to, dist);
            if (random() < p) {
              const falloff = dist > 30 ? 0.75 : dist > 15 ? 0.9 : 1;
              const dmg = bot.damage * falloff * (head ? 2 : 1);
              if (t.isPlayer) ctx.damagePlayer?.(dmg, bot.pos, head);
              else this.damage(t.bot, dmg, bot, head, ctx);
            }
            if (bot.burstLeft === 0) bot.shootAt = time + 0.5 + random() * 0.8;
          }
        } else {
          // --- objective / route behaviour ---
          bot.aimYaw += (bot.yaw - bot.aimYaw) * Math.min(1, dt * 4);
          const bomb = ctx.bomb;
          let dest = null;
          if (bot.team === 'amber') {
            if (bomb.planted) { // defend the planted charge
              const s = SITES[bomb.site];
              dest = new THREE.Vector3(s.center.x + (random() - 0.5) * 2, 0, s.center.z + 3);
              if (bot.pos.distanceTo(dest) < 1.5) dest = null;
            } else if (bot.carrier && bot.state === 'route' && bot.routeIdx >= bot.route.length) {
              bot.channel = 'plant'; bot.progress = 0;
              ctx.onCallout?.(`${bot.name}: planting at Site ${bot.site}!`, 'amber');
            } else if (bot.state === 'route') {
              dest = bot.route[bot.routeIdx];
              if (dest && bot.pos.distanceTo(dest) < 1.2) {
                bot.routeIdx += 1;
                if (bot.routeIdx >= bot.route.length) { bot.state = 'hold'; bot.holdUntil = time + 999; }
              }
            } else if (bot.state === 'hold') {
              // Hold the angle: small jitter, face the site approach.
              const s = SITES[bot.site];
              bot.aimYaw = Math.atan2(-(s.center.x - bot.pos.x), -(s.center.z - bot.pos.z));
            }
          } else {
            if (bomb.planted) { // rush the planted site; nearest two defuse
              const s = SITES[bomb.site];
              const rushers = bots.filter((b) => b.team === 'cobalt' && b.alive)
                .sort((a, b) => a.pos.distanceTo(s.center) - b.pos.distanceTo(s.center)).slice(0, 2);
              dest = new THREE.Vector3(s.center.x, 0, s.center.z);
              if (rushers.includes(bot) && bot.pos.distanceTo(s.center) < 2.2) {
                bot.channel = 'defuse'; bot.progress = 0;
                ctx.onCallout?.(`${bot.name}: defusing the charge!`, 'cobalt');
              }
            } else if (bot.lastHeard && time - bot.hearAt < 6) {
              dest = new THREE.Vector3(bot.lastHeard.x, 0, bot.lastHeard.z);
              if (bot.pos.distanceTo(dest) < 1.5) { bot.lastHeard = null; bot.state = 'route'; }
            } else if (bot.state === 'route') {
              dest = bot.route[bot.routeIdx];
              if (dest && bot.pos.distanceTo(dest) < 1.2) {
                bot.routeIdx += 1;
                if (bot.routeIdx >= bot.route.length) { bot.state = 'hold'; }
              }
            } else if (bot.state === 'hold') {
              const s = bot.site === 'mid' ? new THREE.Vector3(0, 0, 2) : SITES[bot.site].center;
              bot.aimYaw = Math.atan2(-(s.x - bot.pos.x), -(s.z - bot.pos.z));
            }
            // Rotate: if a teammate died at the other site, shift over.
            if (!bomb.planted && bot.state === 'hold' && ctx.lastDeathSite && ctx.lastDeathSite !== bot.site && time - (ctx.lastDeathAt ?? 0) < 4) {
              const other = ctx.lastDeathSite;
              bot.route = (other === 'A' ? ROUTES.rotA : ROUTES.rotB).map(([x, z]) => new THREE.Vector3(x, 0, z));
              bot.routeIdx = 0; bot.state = 'route'; bot.site = other;
              if (time - bot.calloutAt > 8) { bot.calloutAt = time; ctx.onCallout?.(`${bot.name}: rotating to Site ${other}!`, 'cobalt'); }
            }
          }
          // Retreat when outnumbered and hurt.
          const mates = bots.filter((b) => b.team === bot.team && b.alive).length;
          const foes = bots.filter((b) => b.team !== bot.team && b.alive).length + (ctx.playerAlive && ctx.playerTeam !== bot.team ? 1 : 0);
          if (bot.hp < 40 && mates === 1 && foes >= 3) {
            dest = bot.team === 'amber' ? new THREE.Vector3(0, 0, 20) : new THREE.Vector3(0, 0, -20);
          }
          if (dest) {
            const dx = dest.x - bot.pos.x; const dz = dest.z - bot.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.3) {
              bot.aimYaw = Math.atan2(-dx, -dz);
              // Sustained avoidance: when blocked, keep sliding perpendicular to the
              // goal for ~1 s instead of a single nudge (a nudge just re-blocks).
              let mx = dx / d; let mz = dz / d;
              if (time < bot.avoidUntil) { mx = bot.avoidX; mz = bot.avoidZ; }
              const px = bot.pos.x; const pz = bot.pos.z;
              moveBot(bot, mx * bot.speed, mz * bot.speed, dt);
              const moved = Math.hypot(bot.pos.x - px, bot.pos.z - pz);
              if (moved < bot.speed * dt * 0.3) {
                bot.stuckTime += dt;
                if (bot.stuckTime > 0.6 && time >= bot.avoidUntil) {
                  bot.stuckTime = 0;
                  bot.avoidUntil = time + 1.1;
                  const s = random() < 0.5 ? -1 : 1;
                  bot.avoidX = -mz * s; bot.avoidZ = mx * s;
                }
              } else {
                bot.stuckTime = 0;
              }
            }
          }
        }
        // --- pose + animation ---
        bot.yaw += (bot.aimYaw - bot.yaw) * Math.min(1, dt * 8);
        bot.walkPhase += dt * (bot.target ? 4 : 9);
        const swing = Math.sin(bot.walkPhase) * 0.45 * (bot.channel ? 0 : 1);
        fig.legL.rotation.x = swing;
        fig.legR.rotation.x = -swing;
        fig.armR.rotation.x = -0.9;
        fig.group.position.copy(bot.pos);
        fig.group.rotation.y = bot.yaw;
        fig.gun.position.z = -0.28 - (bot.burstLeft > 0 ? 0.03 : 0);
        const hpFrac = Math.max(0, bot.hp / 100);
        fig.barFg.scale.x = Math.max(0.01, hpFrac);
        fig.barFg.position.x = -(0.6 - 0.6 * hpFrac) / 2;
        fig.barBg.lookAt(ctx.cameraPos);
        fig.barFg.lookAt(ctx.cameraPos);
        fig.barBg.visible = hpFrac < 1;
        fig.barFg.visible = hpFrac < 1;
      }
    },
  };
}
