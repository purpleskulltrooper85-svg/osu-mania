/* mania! — unified input: keyboard, touch, pointer. Emits lane press/release. */
(function () {
  'use strict';

  const C = window.Mania.Config;
  const O = window.Mania.Options;
  const I = {};

  const handlers = { down: [], up: [] };
  const laneHeld = {};           /* lane -> true while physically held */
  let keyToLane = {};            /* code -> lane index */
  let pointerLanes = {};         /* pointerId -> lane */
  let listening = false;
  let target = null;

  I.attach = function (node) { target = node; };

  function emit(kind, lane, source) {
    handlers[kind].forEach(function (fn) { fn(lane, source); });
  }

  I.onDown = function (fn) { handlers.down.push(fn); };
  I.onUp = function (fn) { handlers.up.push(fn); };
  I.clearHandlers = function () { handlers.down = []; handlers.up = []; };

  I.setMode = function (mode) {
    const all = O.all();
    const binds = all.keybinds[mode] || C.modeInfo(mode).keys;
    keyToLane = {};
    for (let i = 0; i < binds.length; i++) {
      const code = binds[i];
      if (code) keyToLane[code] = i;
    }
  };

  I.laneHeld = function (lane) { return !!laneHeld[lane]; };
  I.anyHeld = function () { for (const k in laneHeld) if (laneHeld[k]) return true; return false; };
  I.heldLanes = function () {
    const out = [];
    for (const k in laneHeld) if (laneHeld[k]) out.push(Number(k));
    return out;
  };

  I.releaseAll = function () {
    for (const k in laneHeld) {
      if (laneHeld[k]) { laneHeld[k] = false; emit('up', Number(k), 'reset'); }
    }
    pointerLanes = {};
  };

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function onKeyDown(e) {
    if (isTyping(document.activeElement)) return;
    const code = e.code;
    if (code === 'Escape' || code === 'Enter' || code === 'Space' || code.indexOf('Arrow') === 0) {
      if (code === 'Space' && keyToLane[code] !== undefined) { /* fall through: it's a lane */ }
      else return;
    }
    const lane = keyToLane[code];
    if (lane === undefined) return;
    if (code === 'Space' || code.indexOf('Arrow') === 0) e.preventDefault();
    if (e.repeat && O.get('keyRepeatGuard')) return;
    if (laneHeld[lane]) return;
    laneHeld[lane] = true;
    emit('down', lane, 'key');
  }

  function onKeyUp(e) {
    const lane = keyToLane[e.code];
    if (lane === undefined) return;
    if (!laneHeld[lane]) return;
    laneHeld[lane] = false;
    emit('up', lane, 'key');
  }

  /* ---------- touch / pointer ---------- */

  let geom = null; /* {x, y, w, h, keys} playfield rect in CSS px */

  I.setGeometry = function (g) { geom = g; };

  function laneAt(clientX, clientY) {
    if (!geom) return -1;
    if (clientY < geom.y - 40 || clientY > geom.y + geom.h + 60) return -1;
    if (clientX < geom.x - 12 || clientX > geom.x + geom.w + 12) return -1;
    const rel = (clientX - geom.x) / geom.w;
    const lane = Math.floor(rel * geom.keys);
    return lane < 0 ? 0 : lane >= geom.keys ? geom.keys - 1 : lane;
  }

  function onPointerDown(e) {
    if (!O.get('touchEnabled')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const lane = laneAt(e.clientX, e.clientY);
    if (lane < 0) return;
    e.preventDefault();
    pointerLanes[e.pointerId] = lane;
    if (!laneHeld[lane]) {
      laneHeld[lane] = true;
      emit('down', lane, 'touch');
    }
  }

  function onPointerMove(e) {
    if (!O.get('touchEnabled')) return;
    if (pointerLanes[e.pointerId] === undefined) return;
    const lane = laneAt(e.clientX, e.clientY);
    const prev = pointerLanes[e.pointerId];
    if (lane < 0 || lane === prev) return;
    e.preventDefault();
    pointerLanes[e.pointerId] = lane;
    if (laneHeld[prev]) { laneHeld[prev] = false; emit('up', prev, 'touch'); }
    if (!laneHeld[lane]) { laneHeld[lane] = true; emit('down', lane, 'touch'); }
  }

  function onPointerUp(e) {
    const lane = pointerLanes[e.pointerId];
    if (lane === undefined) return;
    delete pointerLanes[e.pointerId];
    /* keep lane held if a keyboard key still holds it */
    if (laneHeld[lane]) {
      laneHeld[lane] = false;
      emit('up', lane, 'touch');
    }
  }

  I.listen = function () {
    if (listening) return;
    listening = true;
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { I.releaseAll(); });
    const node = target || window;
    node.addEventListener('pointerdown', onPointerDown, { passive: false });
    node.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  I.stop = function () {
    if (!listening) return;
    listening = false;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    const node = target || window;
    node.removeEventListener('pointerdown', onPointerDown);
    node.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    I.releaseAll();
  };

  window.Mania = window.Mania || {};
  window.Mania.Input = I;
})();
