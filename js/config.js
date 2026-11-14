/* mania! — static game configuration: judgements, key modes, palettes */
(function () {
  'use strict';

  const C = {};

  C.APP = {
    name: 'mania!',
    version: '0.1.0 prototype',
    storageKey: 'mania.settings.v3',
    scoresKey: 'mania.scores.v1'
  };

  /* Judgement tiers, strongest first. weight drives score + accuracy. */
  C.JUDGEMENTS = [
    { key: 'max',   name: 'MARVELOUS', short: 'MAX', weight: 320, color: '#ffe066', glow: '#ffd43b' },
    { key: 'p300',  name: 'PERFECT',   short: '300', weight: 300, color: '#c9f7c1', glow: '#7ee787' },
    { key: 'p200',  name: 'GREAT',     short: '200', weight: 200, color: '#a5d8ff', glow: '#4dabf7' },
    { key: 'p100',  name: 'GOOD',      short: '100', weight: 100, color: '#ffd8a8', glow: '#ffa94d' },
    { key: 'p50',   name: 'BAD',       short: '50',  weight: 50,  color: '#ffc9c9', glow: '#ff8787' },
    { key: 'miss',  name: 'MISS',      short: 'MISS', weight: 0,  color: '#ff6b81', glow: '#e03131' }
  ];

  C.judgement = function (key) {
    for (const j of C.JUDGEMENTS) if (j.key === key) return j;
    return C.JUDGEMENTS[0];
  };

  /* osu!mania style hit windows, scaled by Overall Difficulty (0-10). */
  C.windowsFor = function (od) {
    od = Math.max(0, Math.min(10, od));
    return {
      max: 16.5,
      p300: 64 - 3 * od,
      p200: 97 - 3 * od,
      p100: 127 - 3 * od,
      p50: 151 - 3 * od
    };
  };

  /* osu!mania column colours: white outer columns, blue inner columns and a
     yellow "special" (centre) column. */
  const W = '#f1f3f5', B = '#4dabf7', Y = '#ffd43b', R = '#ff6b81', P = '#b197fc', G = '#69db7c';

  C.KEY_MODES = {
    4: { label: '4K', keys: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'], colors: [W, B, B, W] },
    5: { label: '5K', keys: ['KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK'], colors: [W, B, Y, B, W] },
    6: { label: '6K', keys: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'], colors: [W, B, B, B, B, W] },
    7: { label: '7K', keys: ['KeyS', 'KeyD', 'KeyF', 'Space', 'KeyJ', 'KeyK', 'KeyL'], colors: [W, B, W, Y, W, B, W] }
  };

  C.modeInfo = function (n) {
    return C.KEY_MODES[n] || C.KEY_MODES[4];
  };

  C.allKeys = function (mode) {
    const set = new Set();
    for (const k in C.KEY_MODES) C.KEY_MODES[k].keys.forEach((c) => set.add(c));
    C.modeInfo(mode).keys.forEach((c) => set.add(c));
    return set;
  };

  C.DIFFICULTY_NAMES = ['Beginner', 'Easy', 'Normal', 'Hard', 'Insane', 'Expert', 'Lunatic'];

  C.ratingStars = function (nps) {
    return Math.max(0.5, Math.min(9.9, nps * 1.05));
  };

  C.PLAYFIELD = {
    widthRatio: 0.5,      /* lane area vs viewport width (clamped) */
    maxWidth: 560,
    minWidth: 240,
    hitLineRatio: 0.84    /* receptor position as fraction of playfield height */
  };

  C.NOTE = {
    heightRatio: 0.42,    /* note height relative to lane width (before the Note size option) */
    minHeight: 14,
    maxHeight: 72
  };

  C.SCROLL = {
    baseSpeed: 420,       /* px per second at 1.0x, before scale */
    speedScale: 1.0
  };

  C.GRADE = function (acc, failed) {
    if (failed) return 'F';
    if (acc >= 100) return 'SS';
    if (acc >= 99) return 'S';
    if (acc >= 95) return 'A';
    if (acc >= 90) return 'B';
    if (acc >= 80) return 'C';
    if (acc >= 70) return 'D';
    return 'F';
  };

  window.Mania = window.Mania || {};
  window.Mania.Config = C;
})();
