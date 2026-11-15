// Synthesized WebAudio effects: no audio files, no network. A tiny noise buffer plus
// oscillators cover shots, reloads, hits, plant beeps, the accelerating bomb timer, the
// low-round-time heartbeat, round stings and UI clicks. Created lazily on first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = Math.random() * 2 - 1;
      return true;
    } catch { return false; }
  }
  function noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }
  function tone(freq, dur, gain, type = 'sine', slideTo = null, delay = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 900, 0.5); tone(140, 0.22, 0.35, 'sawtooth', 40); }
      else if (kind === 'shotgun') { noise(0.22, 700, 0.55); tone(110, 0.18, 0.4, 'square', 50); }
      else if (kind === 'smg') { noise(0.09, 1600, 0.3); tone(220, 0.07, 0.2, 'square', 90); }
      else if (kind === 'pistol') { noise(0.12, 1300, 0.38); tone(190, 0.09, 0.25, 'square', 70); }
      else { noise(0.13, 1100, 0.42); tone(160, 0.1, 0.28, 'sawtooth', 60); }
    },
    enemyShot(dist) { const g = Math.max(0.05, 0.3 - dist * 0.006); noise(0.1, 1000, g); },
    dryClick() { tone(1200, 0.03, 0.12, 'square'); },
    reload() { tone(500, 0.05, 0.15, 'square'); tone(700, 0.05, 0.15, 'square', null, 0.25); tone(900, 0.06, 0.18, 'square', null, 0.55); },
    hit() { tone(1400, 0.05, 0.22, 'sine'); },
    kill() { tone(1400, 0.05, 0.22, 'sine'); tone(1900, 0.09, 0.22, 'sine', null, 0.06); },
    hurt() { noise(0.15, 400, 0.3); tone(90, 0.18, 0.3, 'sawtooth', 50); },
    plantBeep() { tone(880, 0.07, 0.2, 'sine'); },
    bombBeep(urgent) { tone(urgent ? 1250 : 980, 0.08, 0.22, 'square'); },
    heartbeat() { tone(55, 0.12, 0.5, 'sine'); tone(50, 0.1, 0.35, 'sine', null, 0.16); },
    tick() { tone(1000, 0.04, 0.12, 'sine'); },
    explosion() { noise(0.9, 300, 0.8); tone(60, 0.8, 0.6, 'sine', 30); },
    smoke() { noise(0.4, 500, 0.25, 'bandpass'); },
    buy() { tone(660, 0.06, 0.18, 'sine'); tone(990, 0.08, 0.18, 'sine', null, 0.07); },
    denied() { tone(220, 0.12, 0.2, 'square', 160); },
    click() { tone(800, 0.04, 0.14, 'sine'); },
    roundWin() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 0.2, 'triangle', null, i * 0.11)); },
    roundLose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 0.2, 'triangle', null, i * 0.12)); },
    matchWin() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 0.22, 'triangle', null, i * 0.13)); },
    step() { noise(0.04, 500, 0.05); },
  };
}
