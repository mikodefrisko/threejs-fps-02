// The DOM HUD: every number the game shows is pushed in from main.js; this module never
// touches the simulation. It owns the crosshair spread, kill feed, banners, buy menu, overlays
// and the scoreboard, and reports button clicks back through callbacks.
import { BUY_ITEMS, WEAPONS } from './weapon.js';

function $(id) { return document.getElementById(id); }

export function createHud(callbacks) {
  const els = {
    overlay: $('overlay'), title: $('overlay-title'), copy: $('overlay-copy'), play: $('play'),
    buy: $('buyoverlay'), buyGrid: $('buy-grid'), buyMoney: $('buy-money'), buyRound: $('buy-round'),
    end: $('endoverlay'), help: $('helpoverlay'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), hitdir: $('hitdir'), dmg: $('dmgflash'),
    hp: $('hp'), hpbar: $('hpbar'), armor: $('armor'), armorbar: $('armorbar'),
    money: $('moneyval'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'), reloadhint: $('reloadhint'),
    scoreA: $('score-a'), scoreB: $('score-b'), timer: $('timer'), roundlabel: $('roundlabel'),
    bombstat: $('bombstat'), feed: $('feed'), objtext: $('objtext'),
    plantbar: $('plantbar'), plantfill: $('plantfill'), plantlabel: $('plantlabel'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    toast: $('toast'), scoreboard: $('scoreboard'), sbBody: $('sb-body'),
    mute: $('mutebtn'),
  };
  let hitTimer = 0;
  let bannerTimer = 0;
  let toastTimer = 0;
  let last = {};
  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  // Buy menu items, built once; refreshed per buy phase.
  const buyButtons = {};
  for (const item of BUY_ITEMS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buyitem';
    btn.innerHTML = `<span><span class="key">${item.key}</span><span class="nm">${item.label}</span><br><span class="ds">${item.desc}</span></span><span class="pr"></span>`;
    btn.addEventListener('click', () => callbacks.onBuy(item.id));
    els.buyGrid.appendChild(btn);
    buyButtons[item.id] = btn;
  }

  els.play.addEventListener('click', () => callbacks.onPlay());
  $('howto').addEventListener('click', () => { els.help.hidden = false; });
  $('help-close').addEventListener('click', () => { els.help.hidden = true; });
  $('buy-close').addEventListener('click', () => callbacks.onBuyClose());
  $('again').addEventListener('click', () => callbacks.onPlayAgain());
  $('end-menu').addEventListener('click', () => callbacks.onMenu());
  els.mute.addEventListener('click', () => callbacks.onMute());

  return {
    setHealth(hp, armor) {
      setText(els.hp, 'hp', String(Math.max(0, Math.ceil(hp))));
      els.hp.classList.toggle('low', hp <= 30);
      els.hpbar.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      setText(els.armor, 'armor', String(Math.round(armor)));
      els.armorbar.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    },
    setMoney(m) { setText(els.money, 'money', String(m)); },
    setAmmo(mag, reserve, name, reloading) {
      setText(els.ammoMag, 'mag', mag === Infinity ? '∞' : String(mag));
      setText(els.ammoReserve, 'res', reserve === 0 && mag === Infinity ? '' : `/ ${reserve}`);
      setText(els.weaponName, 'wname', name);
      els.ammoMag.classList.toggle('empty', mag === 0);
      setText(els.reloadhint, 'rh', reloading ? '— RELOADING —' : mag === 0 ? 'Press R to reload' : '');
    },
    setScore(a, b, round) {
      setText(els.scoreA, 'sa', String(a));
      setText(els.scoreB, 'sb', String(b));
      setText(els.roundlabel, 'rl', `ROUND ${Math.min(round, 15)}/15`);
    },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(els.timer, 't', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      els.timer.classList.toggle('low', s <= 10);
    },
    setBombStatus(text, defusing) {
      setText(els.bombstat, 'bs', text);
      els.bombstat.classList.toggle('defuse', !!defusing);
    },
    setObjective(html) { if (last.obj !== html) { last.obj = html; els.objtext.innerHTML = html; } },
    setSpread(spread) {
      const gap = 3 + Math.min(16, spread * 320);
      els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on'), holdMs);
    },
    hitDirection(angleDeg) {
      els.hitdir.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
      els.hitdir.classList.add('on');
      setTimeout(() => els.hitdir.classList.remove('on'), 450);
    },
    damageFlash() {
      els.dmg.style.opacity = '1';
      setTimeout(() => { els.dmg.style.opacity = '0'; }, 120);
    },
    feed(html, ms = 5000) {
      const div = document.createElement('div');
      div.innerHTML = html;
      els.feed.prepend(div);
      while (els.feed.children.length > 6) els.feed.lastChild.remove();
      setTimeout(() => div.remove(), ms);
    },
    banner(title, sub, kind = 'info', ms = 2600) {
      els.bannerTitle.textContent = title;
      els.bannerTitle.className = kind;
      els.bannerSub.textContent = sub;
      els.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms);
    },
    hideBanner() { els.banner.classList.remove('show'); },
    toast(text, ms = 2400) {
      els.toast.textContent = text;
      els.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
    },
    setPlant(progress, label) {
      if (progress == null) { els.plantbar.style.display = 'none'; els.plantlabel.style.display = 'none'; return; }
      els.plantbar.style.display = 'block';
      els.plantlabel.style.display = 'block';
      els.plantfill.style.width = `${Math.round(progress * 100)}%`;
      els.plantlabel.textContent = label;
    },
    showOverlay(mode) {
      els.end.hidden = true;
      els.buy.hidden = true;
      els.help.hidden = true;
      els.overlay.hidden = false;
      if (mode === 'paused') {
        els.title.innerHTML = 'IRON<span class="accent">LINE</span>';
        els.copy.textContent = 'Paused. Click to resume — your team is holding the line.';
        els.play.textContent = '▶ Resume';
      } else {
        els.title.innerHTML = 'IRON<span class="accent">LINE</span>';
        els.copy.textContent = 'Amber attacks, Cobalt defends. Plant the charge at Foundry or the Yard, or wipe the enemy team. First to 8 rounds takes the match. Money buys better steel between rounds — aim, don\'t spray.';
        els.play.textContent = '▶ Play — Amber attack';
      }
      els.play.focus();
    },
    hideOverlay() { els.overlay.hidden = true; },
    showBuy(round, money, owned, canAfford) {
      els.overlay.hidden = true;
      els.buy.hidden = false;
      setText(els.buyRound, 'br', String(round));
      setText(els.buyMoney, 'bm', `$${money}`);
      for (const item of BUY_ITEMS) {
        const btn = buyButtons[item.id];
        const price = item.id === 'armor' ? 650 : item.id === 'smoke' ? 300 : WEAPONS[item.id].price;
        btn.querySelector('.pr').textContent = `$${price}`;
        btn.disabled = !canAfford(item.id, price);
        btn.classList.toggle('owned', !!owned(item.id));
      }
      els.buyGrid.querySelector('.buyitem')?.focus();
    },
    hideBuy() { els.buy.hidden = true; },
    showEnd(won, title, copy, stats) {
      els.overlay.hidden = true;
      els.buy.hidden = true;
      els.end.hidden = false;
      $('end-title').textContent = title;
      $('end-copy').textContent = copy;
      $('end-tag').textContent = won ? 'Victory' : 'Defeat';
      $('st-kills').textContent = String(stats.kills);
      $('st-deaths').textContent = String(stats.deaths);
      $('st-acc').textContent = `${stats.accuracy}%`;
      $('st-dmg').textContent = String(stats.damage);
      $('again').focus();
    },
    hideEnd() { els.end.hidden = true; },
    showHelp() { els.help.hidden = false; },
    hideHelp() { els.help.hidden = true; },
    isHelpOpen() { return !els.help.hidden; },
    isBuyOpen() { return !els.buy.hidden; },
    setMute(muted) { els.mute.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; },
    setScoreboard(rows) {
      els.sbBody.innerHTML = rows.map((r) =>
        `<tr class="${r.you ? 'you' : ''}"><td class="${r.team === 'amber' ? 'a' : 'd'}">${r.name}${r.you ? ' (YOU)' : ''}</td><td>${r.team.toUpperCase()}</td><td>${r.kills}</td><td>${r.deaths}</td><td>$${r.money}</td></tr>`).join('');
    },
    showScoreboard(show) { els.scoreboard.classList.toggle('show', show); },
  };
}
