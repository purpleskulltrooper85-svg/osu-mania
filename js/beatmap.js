/* mania! — beatmap generation.
   Turns a song's music events into playable mania charts, one per difficulty. */
(function () {
  'use strict';

  const U = window.Mania.Utils;
  const C = window.Mania.Config;
  const Songs = window.Mania.Songs;
  const B = {};

  const DIFFS = [
    { name: 'Beginner', density: 0.30, minStrength: 1.00, grid: 4, chord: 0.00, ln: 0.18, od: 4.5, hp: 4, jack: 0.05 },
    { name: 'Easy',     density: 0.52, minStrength: 0.85, grid: 2, chord: 0.10, ln: 0.20, od: 6.0, hp: 5.5, jack: 0.10 },
    { name: 'Normal',   density: 0.72, minStrength: 0.66, grid: 1, chord: 0.22, ln: 0.18, od: 7.0, hp: 6.5, jack: 0.16 },
    { name: 'Hard',     density: 0.88, minStrength: 0.50, grid: 1, chord: 0.32, ln: 0.14, od: 8.0, hp: 7, jack: 0.24 },
    { name: 'Insane',   density: 1.00, minStrength: 0.40, grid: 1, chord: 0.42, ln: 0.10, od: 8.6, hp: 7.5, jack: 0.32 }
  ];

  B.DIFFS = DIFFS;

  /* Charts are deterministic, so cache them: song+difficulty+keymode. */
  const cache = new Map();
  const CACHE_MAX = 60;

  B.cached = function (spec, diffIndex, keys) {
    const id = spec.id + '|' + diffIndex + '|' + keys;
    if (cache.has(id)) return cache.get(id);
    const chart = B.generate(spec, diffIndex, keys);
    if (cache.size >= CACHE_MAX) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
    cache.set(id, chart);
    return chart;
  };

  B.difficulties = function (spec) {
    /* Harder songs expose fewer trivial charts; calm songs cap out lower. */
    const hardBias = Math.min(2, Math.max(0, Math.round((spec.bpm - 110) / 26)));
    let count = 4 + (hardBias > 0 ? 1 : 0);
    count = Math.min(count, DIFFS.length);
    const out = [];
    for (let i = 0; i < count; i++) out.push(DIFFS[i]);
    return out;
  };

  function quantize(ms, grid) { return Math.round(ms / grid) * grid; }

  /* ---------- note selection ---------- */

  function collectTimes(built, diff, rand) {
    const grid = built.stepMs * diff.grid;
    const byTime = new Map();

    for (const ev of built.chart) {
      if (ev.strength < diff.minStrength) continue;
      let t = quantize(ev.t, grid);
      if (t < 0) t = 0;
      const key = Math.round(t);
      let slot = byTime.get(key);
      if (!slot) { slot = { t: key, strength: 0, insts: [] }; byTime.set(key, slot); }
      slot.strength = Math.max(slot.strength, ev.strength);
      if (slot.insts.indexOf(ev.inst) < 0) slot.insts.push(ev.inst);
    }

    const groups = Array.from(byTime.values()).sort(function (a, b) { return a.t - b.t; });

    /* Thin dense sections to hit the difficulty's target density. */
    const kept = [];
    const keepChance = 0.30 + 0.70 * diff.density;
    for (const g of groups) {
      const keep = rand() < keepChance || g.strength > 0.95;
      if (!keep) continue;
      kept.push(g);
    }
    return kept;
  }

  /* ---------- column assignment ---------- */

  function makeAssigner(keys, rand, diff) {
    const mid = keys / 2;
    let lastCols = [];
    let jackStreak = 0;
    let lastDir = 0;
    let walk = Math.floor(rand() * keys);

    const jackLimit = 2;

    function mirroredSet(count) {
      const cols = [];
      if (count === 1) return null;
      if (count === 2) {
        const i = Math.floor(rand() * Math.floor(mid));
        cols.push(i, keys - 1 - i);
      } else if (count === 3) {
        if (keys >= 5) {
          cols.push(0, Math.floor(mid), keys - 1);
        } else {
          cols.push(0, keys - 1, Math.floor(rand() * keys));
        }
      } else {
        cols.push(0, Math.floor(mid) - 1, Math.floor(mid), keys - 1);
      }
      return Array.from(new Set(cols)).sort(function (a, b) { return a - b; });
    }

    function pickSingle() {
      let col;
      if (rand() < 0.42) {
        /* continue a staircase */
        const dir = lastDir !== 0 ? lastDir : (rand() < 0.5 ? 1 : -1);
        col = walk + dir;
        if (col < 0 || col >= keys) col = walk - dir;
        lastDir = dir;
      } else if (rand() < diff.jack && lastCols.length === 1 && jackStreak < jackLimit) {
        col = lastCols[0];
      } else {
        col = Math.floor(rand() * keys);
        lastDir = col > walk ? 1 : col < walk ? -1 : 0;
      }
      col = U.clamp(col, 0, keys - 1);
      walk = col;
      return [col];
    }

    return function (group, count) {
      let cols;
      if (count <= 1) {
        cols = pickSingle();
      } else {
        cols = mirroredSet(count);
        if (!cols || cols.length < count) cols = pickSingle();
        /* Avoid duplicating the entire previous chord. */
        if (lastCols.length === cols.length && cols.every(function (c, i) { return c === lastCols[i]; })) {
          cols = cols.map(function (c) { return U.clamp(c + (rand() < 0.5 ? 1 : -1), 0, keys - 1); });
          cols = Array.from(new Set(cols)).sort(function (a, b) { return a - b; });
        }
      }
      if (lastCols.length === 1 && cols.length === 1 && cols[0] === lastCols[0]) jackStreak++;
      else jackStreak = 0;
      lastCols = cols;
      return cols;
    };
  }

  /* ---------- main ---------- */

  B.generate = function (spec, diffIndex, keys, mods) {
    mods = mods || {};
    const built = Songs.build(spec);
    const diff = DIFFS[U.clamp(diffIndex, 0, DIFFS.length - 1)];
    const rand = U.rng((spec.seed || 1) * 7919 + diffIndex * 104729 + keys * 31);

    const groups = collectTimes(built, diff, rand);
    const assign = makeAssigner(keys, rand, diff);

    const notes = [];
    let combo = 0;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      /* chord size from intensity + difficulty */
      let count = 1;
      if (keys > 1) {
        const wantChord = rand() < diff.chord * (0.5 + g.strength * 0.6);
        if (wantChord) count = rand() < 0.72 ? 2 : Math.min(keys, 3);
        if (g.strength > 0.98 && rand() < 0.22 && keys >= 4) count = Math.max(count, 2);
      }
      const cols = assign(g, count);
      for (const col of cols) {
        notes.push({ t: g.t, col: col, end: 0, ln: false });
        combo++;
      }
    }

    notes.sort(function (a, b) { return a.t - b.t || a.col - b.col; });

    /* ---- long notes ---- */
    const byCol = {};
    for (let c = 0; c < keys; c++) byCol[c] = [];
    for (const n of notes) byCol[n.col].push(n);

    for (let c = 0; c < keys; c++) {
      const list = byCol[c];
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (rand() > diff.ln) continue;
        const next = list[i + 1];
        const maxEnd = n.t + built.beatMs * (1 + rand() * 2.2);
        const limit = next ? next.t - built.beatMs * 0.35 : n.t + built.beatMs * 2;
        const end = Math.min(maxEnd, limit);
        if (end - n.t > built.beatMs * 0.45) {
          n.end = Math.round(end);
          n.ln = true;
        }
      }
    }

    /* Avoid LN overlaps in the same column (stacked hold tails). */
    for (let c = 0; c < keys; c++) {
      const list = byCol[c];
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].ln && list[i].end > list[i + 1].t) {
          list[i].end = Math.max(list[i].t, list[i + 1].t - Math.round(built.stepMs));
          if (list[i].end - list[i].t < built.beatMs * 0.3) { list[i].ln = false; list[i].end = 0; }
        }
      }
    }

    /* Chart ends at the last note head, or the tail of the last hold. */
    let endT = 0;
    for (const n of notes) {
      const e = n.ln ? n.end : n.t;
      if (e > endT) endT = e;
    }
    const endMs = endT ? endT + 1500 : built.lengthMs;

    const noteCount = notes.length;
    const durationS = Math.max(1, endMs / 1000);
    const nps = noteCount / durationS;
    const rating = C.ratingStars(nps);

    let od = diff.od + (mods.od !== undefined ? mods.od : 0);
    od = U.clamp(od, 0, 10);

    return {
      song: spec,
      difficulty: diff,
      diffIndex: diffIndex,
      keys: keys,
      notes: notes,
      endMs: endMs,
      lengthMs: endMs,
      noteCount: noteCount,
      maxCombo: noteCount,
      nps: nps,
      rating: rating,
      od: od,
      hp: diff.hp,
      bpm: spec.bpm,
      beatMs: built.beatMs,
      barMs: built.barMs,
      stepMs: built.stepMs,
      music: built
    };
  };

  window.Mania = window.Mania || {};
  window.Mania.Beatmap = B;
})();
