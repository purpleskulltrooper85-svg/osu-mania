/* mania! — settings schema, persistence, and score storage */
(function () {
  'use strict';

  const C = window.Mania.Config;
  const O = {};

  const listeners = [];
  let memory = {};

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return memory[key] || null; }
  }
  function storageSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { memory[key] = val; }
  }

  function defaultKeybinds() {
    const out = {};
    for (const k in C.KEY_MODES) out[k] = C.KEY_MODES[k].keys.slice();
    return out;
  }

  /* schema drives the options UI generation */
  O.SCHEMA = [
    {
      id: 'gameplay', title: 'Gameplay', icon: 'chart', items: [
        { key: 'keys', label: 'Key mode', type: 'select', options: [
          { value: 4, label: '4 keys' }, { value: 5, label: '5 keys' },
          { value: 6, label: '6 keys' }, { value: 7, label: '7 keys' }
        ], hint: 'Number of columns.' },
        { key: 'difficulty', label: 'Difficulty', type: 'select', options: 'difficulty', hint: 'Chart level for the selected song.' },
        { key: 'speed', label: 'Note speed', type: 'range', min: 0.6, max: 2.6, step: 0.05, format: 'x', hint: 'How fast notes travel down the lanes.' },
        { key: 'scrollDir', label: 'Scroll direction', type: 'select', options: [
          { value: 'up', label: 'Upwards' }, { value: 'down', label: 'Downwards' }
        ] },
        { key: 'od', label: 'Overall difficulty', type: 'range', min: 0, max: 10, step: 0.5, format: 'od', hint: 'Tightens the timing windows.' },
        { key: 'drain', label: 'Health drain', type: 'range', min: 0, max: 2, step: 0.1, format: 'x', hint: 'How quickly the health bar falls.' },
        { key: 'judgeScale', label: 'Judgement size', type: 'range', min: 0.7, max: 1.6, step: 0.05, format: 'x' }
      ]
    },
    {
      id: 'mods', title: 'Mods', icon: 'bolt', items: [
        { key: 'noFail', label: 'No Fail', type: 'toggle', hint: 'Never fail, even at zero health.' },
        { key: 'autoPlay', label: 'Auto play', type: 'toggle', hint: 'Watch the chart play itself.' },
        { key: 'hidden', label: 'Hidden', type: 'toggle', hint: 'Notes fade out before reaching the line.' },
        { key: 'mirror', label: 'Mirror', type: 'toggle', hint: 'Flips the chart left to right.' },
        { key: 'random', label: 'Random', type: 'toggle', hint: 'Shuffles the columns every play.' },
        { key: 'hardRock', label: 'Hard Rock', type: 'toggle', hint: 'Tighter windows, faster health drain.' },
        { key: 'halfTime', label: 'Half Time', type: 'toggle', hint: 'Slower notes for practice.' },
        { key: 'doubleTime', label: 'Double Time', type: 'toggle', hint: 'Faster notes for the brave.' }
      ]
    },
    {
      id: 'input', title: 'Input', icon: 'bolt', items: [
        { key: 'keybinds', label: 'Lane keys', type: 'keybinds' },
        { key: 'touchEnabled', label: 'Touch input', type: 'toggle', hint: 'Tap lanes on a touch screen.' },
        { key: 'keyRepeatGuard', label: 'Hold-key guard', type: 'toggle', hint: 'Ignore repeated key events while held.' }
      ]
    },
    {
      id: 'visual', title: 'Visuals', icon: 'star', items: [
        { key: 'laneWidth', label: 'Lane width', type: 'range', min: 0.4, max: 1, step: 0.02, format: 'pct' },
        { key: 'noteStyle', label: 'Note style', type: 'select', options: [
          { value: 'glow', label: 'Glow' }, { value: 'flat', label: 'Flat' }, { value: 'bar', label: 'Bar' }
        ] },
        { key: 'laneSkin', label: 'Lane skin', type: 'select', options: [
          { value: 'classic', label: 'Classic' }, { value: 'rainbow', label: 'Rainbow' },
          { value: 'mono', label: 'Monochrome' }, { value: 'neon', label: 'Neon' }
        ] },
        { key: 'bgDim', label: 'Background dim', type: 'range', min: 0, max: 0.95, step: 0.05, format: 'pct' },
        { key: 'bgAnimation', label: 'Audio visualiser', type: 'toggle', hint: 'Background reacts to the music.' },
        { key: 'flash', label: 'Hit flash', type: 'toggle' },
        { key: 'particles', label: 'Hit particles', type: 'toggle' },
        { key: 'judgeText', label: 'Judgement text', type: 'toggle' },
        { key: 'comboCounter', label: 'Combo counter', type: 'toggle' },
        { key: 'progressBar', label: 'Progress bar', type: 'toggle' },
        { key: 'showFps', label: 'FPS counter', type: 'toggle' },
        { key: 'offset', label: 'Audio offset (ms)', type: 'range', min: -150, max: 150, step: 5, format: 'ms', hint: 'Shift notes earlier or later.' }
      ]
    },
    {
      id: 'audio', title: 'Audio', icon: 'volume', items: [
        { key: 'volMaster', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.02, format: 'pct' },
        { key: 'volMusic', label: 'Music volume', type: 'range', min: 0, max: 1, step: 0.02, format: 'pct' },
        { key: 'volEffects', label: 'Effects volume', type: 'range', min: 0, max: 1, step: 0.02, format: 'pct' },
        { key: 'hitsound', label: 'Hitsound', type: 'select', options: [
          { value: 'default', label: 'Default' }, { value: 'soft', label: 'Soft' },
          { value: 'clap', label: 'Clap' }, { value: 'none', label: 'None' }
        ] },
        { key: 'hitsoundVolume', label: 'Hitsound volume', type: 'range', min: 0, max: 1, step: 0.02, format: 'pct' }
      ]
    },
    {
      id: 'interface', title: 'Interface', icon: 'gear', items: [
        { key: 'uiScale', label: 'UI scale', type: 'range', min: 0.85, max: 1.25, step: 0.05, format: 'x' },
        { key: 'previewMusic', label: 'Song previews', type: 'toggle', hint: 'Play a snippet while browsing.' },
        { key: 'showRatings', label: 'Show star ratings', type: 'toggle' },
        { key: 'confirmExit', label: 'Confirm before quitting', type: 'toggle' }
      ]
    },
    {
      id: 'about', title: 'About', icon: 'heart', items: [
        { key: '_about', label: 'About', type: 'about' },
        { key: '_reset', label: 'Reset everything', type: 'action', action: 'resetAll', danger: true, confirm: 'Reset all settings and scores?' }
      ]
    }
  ];

  O.DEFAULTS = {
    keys: 4,
    difficulty: 2,
    speed: 1.35,
    scrollDir: 'up',
    od: 8,
    drain: 1,
    judgeScale: 1,

    noFail: false,
    autoPlay: false,
    hidden: false,
    mirror: false,
    random: false,
    hardRock: false,
    halfTime: false,
    doubleTime: false,

    keybinds: defaultKeybinds(),
    touchEnabled: true,
    keyRepeatGuard: true,

    laneWidth: 0.6,
    noteStyle: 'glow',
    laneSkin: 'classic',
    bgDim: 0.6,
    bgAnimation: true,
    flash: true,
    particles: true,
    judgeText: true,
    comboCounter: true,
    progressBar: true,
    showFps: false,
    offset: 0,

    volMaster: 0.85,
    volMusic: 0.65,
    volEffects: 0.8,
    hitsound: 'default',
    hitsoundVolume: 0.7,

    uiScale: 1,
    previewMusic: true,
    showRatings: true,
    confirmExit: true
  };

  let current = null;

  function deepMerge(base, over) {
    const out = {};
    for (const k in base) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], (over && over[k]) || {});
      } else {
        out[k] = (over && over[k] !== undefined) ? over[k] : base[k];
      }
    }
    return out;
  }

  O.load = function () {
    let saved = null;
    const raw = storageGet(C.APP.storageKey);
    if (raw) { try { saved = JSON.parse(raw); } catch (e) { saved = null; } }
    current = deepMerge(O.DEFAULTS, saved);
    /* keybinds need a per-mode merge so new modes stay valid */
    const kb = defaultKeybinds();
    for (const k in kb) if (current.keybinds && Array.isArray(current.keybinds[k])) kb[k] = current.keybinds[k].slice();
    current.keybinds = kb;
    O.applyAudio();
    return current;
  };

  O.save = function () {
    storageSet(C.APP.storageKey, JSON.stringify(current));
  };

  O.all = function () { return current || O.load(); };
  O.get = function (key) { return O.all()[key]; };

  O.set = function (key, value, opts) {
    const all = O.all();
    if (all[key] === value) return value;
    all[key] = value;
    if (key === 'volMaster' || key === 'volMusic' || key === 'volEffects') O.applyAudio();
    O.save();
    if (!opts || !opts.silent) {
      listeners.forEach(function (fn) { fn(key, value, all); });
    }
    return value;
  };

  O.setKeybind = function (mode, index, code) {
    const all = O.all();
    if (!all.keybinds[mode]) all.keybinds[mode] = C.modeInfo(mode).keys.slice();
    /* Clear duplicates across all modes. */
    for (const m in all.keybinds) {
      const arr = all.keybinds[m];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === code && !(String(m) === String(mode) && i === index)) arr[i] = null;
      }
    }
    all.keybinds[mode][index] = code;
    O.save();
    listeners.forEach(function (fn) { fn('keybinds', all.keybinds, all); });
  };

  O.resetKeybinds = function () {
    O.all().keybinds = defaultKeybinds();
    O.save();
    listeners.forEach(function (fn) { fn('keybinds', O.all().keybinds, O.all()); });
  };

  O.resetAll = function () {
    current = deepMerge(O.DEFAULTS, {});
    current.keybinds = defaultKeybinds();
    storageSet(C.APP.scoresKey, '[]');
    O.save();
    O.applyAudio();
    listeners.forEach(function (fn) { fn('*', null, current); });
  };

  O.onChange = function (fn) { listeners.push(fn); };

  O.applyAudio = function () {
    const A = window.Mania.Audio;
    if (!A) return;
    A.setVolume('master', O.get('volMaster'));
    A.setVolume('music', O.get('volMusic'));
    A.setVolume('effects', O.get('volEffects'));
  };

  /* effective values once mods are folded in */
  O.effective = function () {
    const all = O.all();
    let speed = all.speed;
    if (all.halfTime) speed *= 0.7;
    if (all.doubleTime) speed *= 1.35;
    let od = all.od;
    if (all.hardRock) od += 2;
    let drain = all.drain;
    if (all.hardRock) drain *= 1.4;
    if (all.noFail) drain = 0;
    return {
      speed: speed, od: od, drain: drain,
      hidden: all.hidden, mirror: all.mirror, random: all.random,
      autoPlay: all.autoPlay, noFail: all.noFail
    };
  };

  O.modsList = function () {
    const all = O.all();
    const out = [];
    if (all.noFail) out.push('NF');
    if (all.autoPlay) out.push('AT');
    if (all.hidden) out.push('HD');
    if (all.mirror) out.push('MR');
    if (all.random) out.push('RD');
    if (all.hardRock) out.push('HR');
    if (all.halfTime) out.push('HT');
    if (all.doubleTime) out.push('DT');
    return out;
  };

  /* ---------- scores ---------- */

  O.scores = function () {
    const raw = storageGet(C.APP.scoresKey);
    if (!raw) return [];
    try { return JSON.parse(raw) || []; } catch (e) { return []; }
  };

  O.addScore = function (entry) {
    const list = O.scores();
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    storageSet(C.APP.scoresKey, JSON.stringify(list.slice(0, 200)));
    listeners.forEach(function (fn) { fn('scores', entry, null); });
    return entry;
  };

  O.bestFor = function (songId, diffIndex, keys) {
    const list = O.scores().filter(function (s) {
      return s.songId === songId && s.diffIndex === diffIndex && s.keys === keys;
    });
    list.sort(function (a, b) { return b.score - a.score; });
    return list[0] || null;
  };

  O.rankFor = function (songId, diffIndex, keys) {
    const list = O.scores().filter(function (s) {
      return s.songId === songId && s.diffIndex === diffIndex && s.keys === keys;
    });
    if (!list.length) return 0;
    let total = 0;
    list.forEach(function (s) { total += s.acc; });
    return total / list.length;
  };

  window.Mania = window.Mania || {};
  window.Mania.Options = O;
})();
