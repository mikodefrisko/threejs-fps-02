// Keyboard + mouse + pointer lock. Plain browser APIs only. Pointer-lock failures are
// swallowed and reported as "not locked" so the game never hard-fails on headless or
// permission-denied loads; the menu Play button still starts the game in that case.
// Edge presses (B, G, H, R, E, Tab, digits) are queued so the game can consume them once.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };
  let hadLock = false;

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else keys.delete(event.code);
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  }
  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; state.aiming = false; });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    const was = hadLock;
    state.locked = document.pointerLockElement === canvas;
    hadLock = state.locked;
    if (!state.locked) { keys.clear(); state.firing = false; state.aiming = false; }
    onLockChange(state.locked, was);
  });
  document.addEventListener('pointerlockerror', () => {
    state.locked = false;
    onLockChange(false, false);
  });

  return {
    state,
    requestLock() {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => onLockChange(false, false));
      } catch { onLockChange(false, false); }
    },
    exitLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ } },
    takeLook() {
      const x = state.lookX; const y = state.lookY;
      state.lookX = 0; state.lookY = 0;
      return { x, y };
    },
    // True once per physical press; the caller consumes it.
    wasPressed(code) {
      if (pressed.has(code)) { pressed.delete(code); return true; }
      return false;
    },
    clearPressed() { pressed.clear(); },
  };
}
