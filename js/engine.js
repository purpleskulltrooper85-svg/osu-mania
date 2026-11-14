/* mania! — gameplay engine: timing, judgement, scoring, health, long notes. */
(function () {
  'use strict';

  const U = window.Mania.Utils;
  const C = window.Mania.Config;
  const A = window.Mania.Audio;
  const E = {};

  const STATE = { PENDING: 0, HOLDING: 1, DONE: 2 };

  E.create = function (beatmap, settings) {
    settings = settings || {};
    const eff = settings.effective || {};
    const windows = C.windowsFor(beatmap.od);
    const keys = beatmap.keys;

    /* Charts are cached and shared, so clone the notes before any mod mutates
       columns or per-note state. */
    const notes = beatmap.notes.map(function (n) {
      return { t: n.t, col: n.col, end: n.end, ln: n.ln };
    });

    const clock = {
      start: 0, paused: 0, pauseAt: 0, running: false, manual: false
    };

    const engine = {
      beatmap: beatmap,
      keys: keys,
      windows: windows,
      notes: notes,
      time: 0,
      offset: settings.offset || 0,
      speed: eff.speed || 1,
      scrollDir: settings.scrollDir || 'up',
      hidden: !!eff.hidden,
      autoPlay: !!eff.autoPlay,
      noFail: !!eff.noFail,
      drainRate: eff.drain === undefined ? 1 : eff.drain,
      hitsound: settings.hitsound || 'default',
      hitsoundVolume: settings.hitsoundVolume === undefined ? 0.7 : settings.hitsoundVolume,

      state: 'idle',          /* idle | running | paused | finished | failed */
      health: 1,
      score: 0,
      combo: 0,
      maxCombo: 0,
      accuracy: 100,
      counts: { max: 0, p300: 0, p200: 0, p100: 0, p50: 0, miss: 0 },
      judged: 0,
      weightSum: 0,
      maxWeight: notes.length * 320,
      effects: [],
      laneFlash: new Array(keys).fill(0),
      laneGlow: new Array(keys).fill(0),
      lastHitAt: new Array(keys).fill(-1e9),
      notePointer: new Array(keys).fill(0),
      holdNote: new Array(keys).fill(null),
      finishedAt: 0
    };

    /* column pointers over the sorted note list */
    const colNotes = [];
    for (let c = 0; c < keys; c++) colNotes.push([]);
    for (const n of notes) colNotes[n.col].push(n);
    engine.colNotes = colNotes;

    /* pre-compute hold duration in ms for release tolerance */
    for (const n of notes) {
      n.state = STATE.PENDING;
      n.judgement = null;
      n.judgeTime = 0;
      n.missTime = 0;
      n.lnMs = n.ln ? Math.max(0, n.end - n.t) : 0;
    }

    if (settings.mirror) {
      for (const n of notes) n.col = keys - 1 - n.col;
      rebuildColumns();
    }
    if (settings.random) {
      const rand = U.rng((beatmap.song.seed || 1) + 99991);
      const perm = [];
      for (let i = 0; i < keys; i++) perm.push(i);
      U.shuffle(perm, rand);
      for (const n of notes) n.col = perm[n.col];
      rebuildColumns();
    }

    function rebuildColumns() {
      for (let c = 0; c < keys; c++) colNotes[c].length = 0;
      for (const n of notes) colNotes[n.col].push(n);
      for (let c = 0; c < keys; c++) colNotes[c].sort(function (a, b) { return a.t - b.t; });
      for (let c = 0; c < keys; c++) engine.notePointer[c] = 0;
    }

    /* ---------- effects (transient visuals for the renderer) ---------- */

    function addEffect(type, lane, payload) {
      const fx = Object.assign({ type: type, lane: lane, born: engine.time }, payload || {});
      engine.effects.push(fx);
      if (engine.effects.length > 64) engine.effects.shift();
      return fx;
    }

    /* ---------- scoring ---------- */

    function applyJudgement(note, key, time) {
      const j = C.judgement(key);
      note.state = STATE.DONE;
      note.judgement = key;
      note.judgeTime = time;
      engine.judged++;
      engine.counts[key]++;
      engine.weightSum += j.weight;

      if (key === 'miss') {
        engine.combo = 0;
        if (engine.drainRate > 0) engine.health -= 0.055 * engine.drainRate * (1 + Math.min(engine.maxCombo / 400, 1));
      } else {
        engine.combo++;
        if (engine.combo > engine.maxCombo) engine.maxCombo = engine.combo;
        const heal = key === 'max' ? 0.012 : key === 'p300' ? 0.01 : key === 'p200' ? 0.006 : key === 'p100' ? 0.002 : -0.002;
        engine.health += heal * (engine.drainRate === 0 ? 0 : 1);
      }
      engine.health = U.clamp(engine.health, 0, 1);

      engine.accuracy = engine.maxWeight ? (engine.weightSum / engine.maxWeight) * 100 : 100;
      engine.score = Math.round(1000000 * (engine.weightSum / engine.maxWeight));

      if (key !== 'miss') {
        engine.laneFlash[note.col] = 1;
        engine.laneGlow[note.col] = 1;
      }

      if (key !== 'miss' && engine.hitsound !== 'none') {
        A.hit(engine.hitsound, engine.hitsoundVolume, key === 'max' || key === 'p300');
      }

      addEffect('judge', note.col, {
        judgement: key,
        color: j.color,
        combo: engine.combo,
        t: time
      });
      if (key !== 'miss' && settings.particles) {
        addEffect('burst', note.col, { judgement: key, color: j.color, t: time });
      }
    }

    /* ---------- judgement windows ---------- */

    function windowFor(now, t) {
      const d = Math.abs(now - t);
      if (d <= windows.max) return 'max';
      if (d <= windows.p300) return 'p300';
      if (d <= windows.p200) return 'p200';
      if (d <= windows.p100) return 'p100';
      if (d <= windows.p50) return 'p50';
      return null;
    }

    function findHittable(lane, now) {
      const list = colNotes[lane];
      let i = engine.notePointer[lane];
      let best = null;
      let bestD = Infinity;
      for (; i < list.length; i++) {
        const n = list[i];
        if (n.state === STATE.DONE) continue;
        const d = n.t - now;
        if (d > windows.p50) break;
        if (d < -windows.p50) continue;
        if (n.state === STATE.HOLDING) continue;
        const ad = Math.abs(d);
        if (ad < bestD) { bestD = ad; best = n; }
      }
      return best;
    }

    /* ---------- press / release ---------- */

    function press(lane) {
      if (engine.state !== 'running') return;
      const now = engine.time;
      engine.lastHitAt[lane] = now;
      const n = findHittable(lane, now);
      if (!n) {
        addEffect('tap', lane, { t: now, empty: true });
        return;
      }
      const key = windowFor(now, n.t) || 'p100';
      if (n.ln) {
        n.state = STATE.HOLDING;
        n.headJudgement = key;
        n.headTime = now;
        engine.holdNote[lane] = n;
        if (engine.hitsound !== 'none') A.hit(engine.hitsound, engine.hitsoundVolume * 0.8, key === 'max' || key === 'p300');
        engine.laneFlash[lane] = 1;
        engine.laneGlow[lane] = 1;
        addEffect('lnstart', lane, { t: now, note: n });
      } else {
        applyJudgement(n, key, now);
      }
    }

    /* Finishes a long note: reachedEnd means the key was held all the way. */
    function completeHold(n, now, reachedEnd) {
      const remaining = n.end - now;
      const ratio = n.lnMs > 0 ? (now - n.headTime) / n.lnMs : 1;
      if (reachedEnd || remaining <= windows.p100) {
        applyJudgement(n, n.headJudgement || 'p300', now);
      } else if (ratio >= 0.6) {
        applyJudgement(n, 'p100', now);
      } else {
        applyJudgement(n, 'miss', now);
      }
    }

    function release(lane) {
      if (engine.state !== 'running') return;
      const now = engine.time;
      const n = engine.holdNote[lane];
      if (!n) return;
      engine.holdNote[lane] = null;
      completeHold(n, now, false);
    }

    /* Held long notes complete on their own once the tail is reached. */
    function updateHoldNotes(now) {
      for (let c = 0; c < keys; c++) {
        const n = engine.holdNote[c];
        if (!n) continue;
        if (now >= n.end) {
          engine.holdNote[c] = null;
          completeHold(n, now, true);
        }
      }
    }

    /* ---------- per-frame update ---------- */

    function computeTime() {
      if (clock.manual) {
        if (!clock.running) return engine.time;
        return performance.now() - clock.start - clock.paused;
      }
      const song = A.currentSong();
      if (song) return song.getTime() * 1000 + engine.offset;
      if (!clock.running) return engine.time;
      return performance.now() - clock.start - clock.paused;
    }

    function missExpired(now) {
      for (let c = 0; c < keys; c++) {
        const list = colNotes[c];
        let i = engine.notePointer[c];
        while (i < list.length) {
          const n = list[i];
          if (n.state === STATE.DONE) { i++; continue; }
          if (n.state === STATE.HOLDING) { i++; continue; }
          if (now - n.t > windows.p50) {
            applyJudgement(n, 'miss', now);
            i++;
            continue;
          }
          break;
        }
        engine.notePointer[c] = i;
      }
    }

    /* Auto play presses at the head and holds until the tail. */
    function autoPlayStep(now) {
      for (let c = 0; c < keys; c++) {
        if (engine.holdNote[c]) continue;
        const list = colNotes[c];
        let i = 0;
        while (i < list.length && list[i].state === STATE.DONE) i++;
        const n = list[i];
        if (!n) continue;
        if (n.state === STATE.PENDING && now >= n.t - 1) press(c);
      }
    }

    function decayEffects(dt) {
      for (let i = engine.effects.length - 1; i >= 0; i--) {
        const fx = engine.effects[i];
        const age = engine.time - fx.born;
        const life = fx.type === 'judge' ? 620 : fx.type === 'burst' ? 520 : 240;
        if (age > life) engine.effects.splice(i, 1);
      }
      for (let c = 0; c < keys; c++) {
        engine.laneFlash[c] = Math.max(0, engine.laneFlash[c] - dt * 5);
        engine.laneGlow[c] = Math.max(0, engine.laneGlow[c] - dt * 1.6);
      }
    }

    let lastFrame = 0;
    engine.update = function (nowMs) {
      if (engine.state !== 'running') return;
      const t = computeTime();
      const dt = lastFrame ? Math.min(0.1, (nowMs - lastFrame) / 1000) : 0;
      lastFrame = nowMs;
      engine.time = t;

      if (engine.autoPlay) autoPlayStep(t);
      updateHoldNotes(t);
      missExpired(t);

      if (engine.drainRate > 0 && t > 0) {
        engine.health -= 0.012 * engine.drainRate * dt;
        engine.health = U.clamp(engine.health, 0, 1);
      }

      decayEffects(dt);

      if (!engine.noFail && engine.health <= 0 && engine.judged > 0) {
        engine.state = 'failed';
        engine.finishedAt = nowMs;
        engine.onEnd && engine.onEnd(false);
        return;
      }
      if (t > beatmap.lengthMs + 1200) {
        engine.state = 'finished';
        engine.finishedAt = nowMs;
        engine.onEnd && engine.onEnd(true);
      }
    };

    /* ---------- lifecycle ---------- */

    engine.start = function (manualClock) {
      clock.manual = !!manualClock;
      clock.start = performance.now();
      clock.paused = 0;
      clock.running = true;
      lastFrame = 0;
      engine.state = 'running';
      engine.time = computeTime();
    };

    engine.pause = function () {
      if (engine.state !== 'running') return;
      engine.state = 'paused';
      clock.pauseAt = performance.now();
      clock.running = false;
      for (let c = 0; c < keys; c++) {
        if (engine.holdNote[c]) { engine.holdNote[c] = null; }
      }
    };

    engine.resume = function () {
      if (engine.state !== 'paused') return;
      clock.paused += performance.now() - clock.pauseAt;
      clock.running = true;
      lastFrame = 0;
      engine.state = 'running';
    };

    engine.press = press;
    engine.release = release;
    engine.forceReleaseAll = function () {
      for (let c = 0; c < keys; c++) {
        if (engine.holdNote[c]) release(c);
      }
    };

    engine.progress = function () {
      return U.clamp(engine.time / beatmap.lengthMs, 0, 1);
    };

    engine.remaining = function () {
      return Math.max(0, beatmap.lengthMs - engine.time);
    };

    engine.noteState = STATE;

    return engine;
  };

  E.STATE = STATE;

  window.Mania = window.Mania || {};
  window.Mania.Engine = E;
})();
