/* mania! — app controller: screen lifecycle, render loop, resize, boot. */
(function () {
  'use strict';

  const A = window.Mania.Audio;
  const O = window.Mania.Options;
  const R = window.Mania.Renderer;
  const Input = window.Mania.Input;
  const SC = window.Mania.Screens;

  const ENDS_RUN = { title: 1, select: 1, results: 1 };

  const app = {
    state: {
      songId: 'neon-pulse',
      diffIndex: 2,
      lastResult: null
    },
    params: {},
    current: null,
    currentName: null,
    gameScreen: null,
    pauseScreen: null
  };

  const root = document.getElementById('screen-root');
  const stage = document.getElementById('stage');
  const rotateHint = document.getElementById('rotate-hint');

  function detach(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function discardGame() {
    const g = app.gameScreen;
    if (!g) return;
    if (g.onExit) g.onExit();
    detach(g.el || g);
    app.gameScreen = null;
    if (app.current === g) { app.current = null; app.currentName = null; }
  }

  function closePause() {
    const p = app.pauseScreen;
    if (!p) return;
    if (p.onExit) p.onExit();
    detach(p.el || p);
    app.pauseScreen = null;
  }

  app.go = function (name, params) {
    params = params || {};
    const prev = this.current;

    /* Screens read their construction params during SC[name]() below, before
       onEnter() runs, so expose them on the app for that window. */
    this.pendingParams = params;

    /* ---- pause is an overlay stacked over the live game ---- */
    if (name === 'pause') {
      if (this.pauseScreen) return;
      const s = SC.pause(this);
      s.el = s;
      this.pauseScreen = s;
      this.current = s;
      this.currentName = 'pause';
      root.appendChild(s);
      if (s.onEnter) s.onEnter(params);
      updateRotateHint();
      return;
    }

    closePause();

    /* ---- resuming an in-progress run ---- */
    if (name === 'game' && !params.fresh && this.gameScreen && this.gameScreen.isLive && this.gameScreen.isLive()) {
      const g = this.gameScreen;
      if (!(g.el || g).parentNode) root.appendChild(g.el || g);
      this.current = g;
      this.currentName = 'game';
      if (g.onResume) g.onResume(params);
      updateRotateHint();
      return;
    }

    /* ---- leaving a screen ---- */
    if (prev) {
      if (prev !== this.gameScreen && prev.onExit) prev.onExit();
      detach(prev.el || prev);
    }

    /* Hide (but keep) a live run whenever a full screen is shown. */
    if (this.gameScreen && name !== 'game') {
      detach(this.gameScreen.el || this.gameScreen);
    }

    /* ---- end the run when appropriate ---- */
    if (this.gameScreen && (ENDS_RUN[name] || (name === 'game' && params.fresh))) {
      discardGame();
    }

    /* ---- build the next screen ---- */
    if (name === 'game' && this.gameScreen) discardGame();
    let screen;
    if (name === 'game') {
      screen = SC.game(this);
      this.gameScreen = screen;
    } else {
      screen = SC[name](this);
    }
    if (!screen) return;
    screen.el = screen;
    this.current = screen;
    this.currentName = name;
    root.appendChild(screen);
    if (screen.onEnter) screen.onEnter(params);
    updateRotateHint();
  };

  app.screenByName = function (name) {
    if (name === 'game') return this.gameScreen;
    if (name === 'pause') return this.pauseScreen;
    return null;
  };

  /* ---------- rotate hint ---------- */

  let rotateDismissed = false;
  const rotateDismiss = document.getElementById('rotate-dismiss');
  if (rotateDismiss) {
    rotateDismiss.addEventListener('click', function () {
      rotateDismissed = true;
      rotateHint.classList.add('hidden');
      A.ui('select');
    });
  }

  function updateRotateHint() {
    if (rotateDismissed) { rotateHint.classList.add('hidden'); return; }
    const portrait = window.innerHeight > window.innerWidth;
    const narrow = Math.min(window.innerWidth, window.innerHeight) < 560;
    const show = portrait && narrow && (app.currentName === 'game' || app.currentName === 'pause');
    rotateHint.classList.toggle('hidden', !show);
  }

  /* ---------- loop ---------- */

  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const scr = app.current;
    if (scr) {
      if (scr.update) scr.update(now, dt);
      if (scr.draw) scr.draw(now, dt);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- resize ---------- */

  let resizeTimer = null;
  function handleResize() {
    const all = O.all();
    R.resize({ keys: all.keys, laneWidth: all.laneWidth, dir: all.scrollDir });
    Input.setGeometry(R.geometry());
    if (app.current && app.current.resize) app.current.resize();
    if (app.gameScreen && app.gameScreen !== app.current && app.gameScreen.resize) app.gameScreen.resize();
    updateRotateHint();
  }

  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 90);
  });
  window.addEventListener('orientationchange', function () { setTimeout(handleResize, 240); });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) return;
    const g = app.gameScreen;
    if (!g || !g.isLive || !g.isLive()) return;
    if (app.currentName === 'game' && g.pauseForBlur) g.pauseForBlur();
  });

  /* ---------- audio unlock ---------- */

  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    A.ensure().then(function () { O.applyAudio(); });
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  }
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock);

  /* ---------- boot ---------- */

  function boot() {
    O.load();
    document.documentElement.style.setProperty('--ui-scale', O.get('uiScale'));
    R.init(stage);
    handleResize();
    O.onChange(function (key) {
      if (key === 'uiScale') document.documentElement.style.setProperty('--ui-scale', O.get('uiScale'));
      if (key === 'volMaster' || key === 'volMusic' || key === 'volEffects') O.applyAudio();
    });
    app.go('title');
    requestAnimationFrame(frame);
  }

  window.Mania.app = app;
  window.Mania.boot = boot;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
