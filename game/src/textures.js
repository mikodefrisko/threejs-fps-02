// Procedural canvas textures: every surface in the game is drawn here, no external assets.
// One helper builds a THREE.CanvasTexture from a 2D painter; each painter is deterministic.
import * as THREE from 'three';

function tex(size, painter, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, s, n, colors, aMin, aMax) {
  for (let i = 0; i < n; i += 1) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = aMin + Math.random() * (aMax - aMin);
    const r = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const concrete = tex(256, (ctx, s) => {
    ctx.fillStyle = '#3a4046'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ['#2c3136', '#4a5158', '#565e66'], 0.15, 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  }, [10, 8]);
  const ground = tex(512, (ctx, s) => {
    ctx.fillStyle = '#33383d'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2600, ['#262b2f', '#454b52', '#51585f', '#1d2124'], 0.12, 0.45);
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo((i * s) / 4, 0); ctx.lineTo((i * s) / 4, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i * s) / 4); ctx.lineTo(s, (i * s) / 4); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(240,168,48,.10)';
    ctx.fillRect(s * 0.1, s * 0.42, s * 0.8, 10);
  }, [8, 6]);
  const metal = tex(256, (ctx, s) => {
    ctx.fillStyle = '#4b5560'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      ctx.fillStyle = y % 16 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.16)';
      ctx.fillRect(0, y, s, 4);
    }
    speckle(ctx, s, 300, ['#39414a', '#5d6873'], 0.2, 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, s - 2, s - 2);
  });
  const crate = tex(256, (ctx, s) => {
    ctx.fillStyle = '#7a5a33'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, y, s, 3);
      ctx.fillStyle = 'rgba(255,220,150,.08)'; ctx.fillRect(0, y + 3, s, 5);
    }
    ctx.strokeStyle = '#4a3419'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, s - 10, s - 10);
    ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(s - 5, s - 5); ctx.moveTo(s - 5, 5); ctx.lineTo(5, s - 5);
    ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = 'rgba(240,168,48,.85)'; ctx.font = 'bold 34px monospace';
    ctx.fillText('07', s / 2 - 20, s / 2 + 12);
  });
  const hazard = tex(256, (ctx, s) => {
    ctx.fillStyle = '#c9a227'; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#15181c';
    for (let x = -s; x < s * 2; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, s); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, s); ctx.fill();
    }
  }, [4, 1]);
  const rust = tex(256, (ctx, s) => {
    ctx.fillStyle = '#5a3a28'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1400, ['#6e4a30', '#3d2718', '#8a5f3a', '#2c1c10'], 0.2, 0.6);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(s, i * 64); ctx.stroke(); }
  }, [6, 4]);
  const yard = tex(256, (ctx, s) => {
    ctx.fillStyle = '#3d4a3a'; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1600, ['#2e3a2c', '#4c5c46', '#5d6e55', '#26301f'], 0.2, 0.55);
  }, [8, 6]);
  const sky = tex(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#27405e'); g.addColorStop(0.45, '#7d94a8');
    g.addColorStop(0.62, '#e8b96a'); g.addColorStop(0.75, '#c97e3f'); g.addColorStop(1, '#5a3a28');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,240,200,.9)';
    ctx.beginPath(); ctx.arc(s * 0.72, s * 0.58, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,.25)';
    ctx.beginPath(); ctx.arc(s * 0.72, s * 0.58, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,36,.55)';
    for (let i = 0; i < 9; i += 1) {
      const x = (i * 67) % s; const w = 30 + ((i * 37) % 50); const h = 40 + ((i * 53) % 70);
      ctx.fillRect(x, s - h, w, h);
    }
  });
  function letter(ch, color) {
    return tex(256, (ctx, s) => {
      ctx.fillStyle = '#14181d'; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = color; ctx.font = 'bold 170px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ch, s / 2, s / 2 + 8);
      ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(8, 8, s - 16, s - 16);
    });
  }
  return { concrete, ground, metal, crate, hazard, rust, yard, sky, letterA: letter('A', '#f0a830'), letterB: letter('B', '#3fa7ff') };
}
