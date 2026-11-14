/* mania! — song library + procedural music generator.
   Each song is synthesised at play time from a spec, and the same spec
   drives beatmap generation so notes always land on real music. */
(function () {
  'use strict';

  const U = window.Mania.Utils;
  const S = {};

  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10]
  };

  const ROOT = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

  const PROGRESSIONS = {
    minor: [[0, 5, 3, 4], [0, 3, 4, 4], [0, 6, 5, 4], [0, 4, 5, 3], [0, 2, 5, 4]],
    major: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 5], [0, 5, 1, 4]],
    dorian: [[0, 3, 4, 0], [0, 6, 3, 4]],
    phrygian: [[0, 1, 5, 4], [0, 5, 1, 0]]
  };

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function degToMidi(rootMidi, scale, degree, octave) {
    const n = scale.length;
    let d = degree;
    let oct = octave || 0;
    while (d < 0) { d += n; oct -= 1; }
    while (d >= n) { d -= n; oct += 1; }
    return rootMidi + scale[d] + 12 * oct;
  }

  /* ---------- song catalogue ---------- */

  S.LIST = [
    {
      id: 'neon-pulse',
      title: 'Neon Pulse',
      artist: 'mania! sound team',
      bpm: 150,
      root: 'A', scale: 'minor',
      mood: 'energetic', swing: 0, seed: 1337,
      color: '#ff66aa',
      structure: [
        { name: 'intro', bars: 4, i: 0.35 },
        { name: 'verse', bars: 8, i: 0.6 },
        { name: 'build', bars: 4, i: 0.75 },
        { name: 'chorus', bars: 8, i: 1.0 },
        { name: 'verse', bars: 8, i: 0.65 },
        { name: 'chorus', bars: 8, i: 1.0 },
        { name: 'outro', bars: 4, i: 0.35 }
      ]
    },
    {
      id: 'midnight-drive',
      title: 'Midnight Drive',
      artist: 'mania! sound team',
      bpm: 128,
      root: 'F', scale: 'dorian',
      mood: 'chill', swing: 0.12, seed: 4242,
      color: '#4dabf7',
      structure: [
        { name: 'intro', bars: 4, i: 0.3 },
        { name: 'verse', bars: 8, i: 0.5 },
        { name: 'verse', bars: 8, i: 0.62 },
        { name: 'chorus', bars: 8, i: 0.85 },
        { name: 'break', bars: 4, i: 0.3 },
        { name: 'chorus', bars: 8, i: 0.9 },
        { name: 'outro', bars: 4, i: 0.35 }
      ]
    },
    {
      id: 'hyperglyph',
      title: 'HYPERGLYPH',
      artist: 'mania! sound team',
      bpm: 174,
      root: 'D', scale: 'phrygian',
      mood: 'hardcore', swing: 0, seed: 9001,
      color: '#ffd43b',
      structure: [
        { name: 'intro', bars: 4, i: 0.45 },
        { name: 'drop', bars: 8, i: 0.85 },
        { name: 'break', bars: 4, i: 0.35 },
        { name: 'drop', bars: 8, i: 1.0 },
        { name: 'drop', bars: 8, i: 1.0 },
        { name: 'outro', bars: 4, i: 0.4 }
      ]
    },
    {
      id: 'glass-garden',
      title: 'Glass Garden',
      artist: 'mania! sound team',
      bpm: 110,
      root: 'C', scale: 'major',
      mood: 'calm', swing: 0, seed: 777,
      color: '#69db7c',
      structure: [
        { name: 'intro', bars: 4, i: 0.25 },
        { name: 'verse', bars: 8, i: 0.45 },
        { name: 'chorus', bars: 8, i: 0.7 },
        { name: 'verse', bars: 8, i: 0.5 },
        { name: 'chorus', bars: 8, i: 0.75 },
        { name: 'outro', bars: 4, i: 0.3 }
      ]
    },
    {
      id: 'voltage',
      title: 'Voltage',
      artist: 'mania! sound team',
      bpm: 160,
      root: 'G', scale: 'minor',
      mood: 'energetic', swing: 0, seed: 2024,
      color: '#b197fc',
      structure: [
        { name: 'intro', bars: 4, i: 0.4 },
        { name: 'verse', bars: 8, i: 0.7 },
        { name: 'chorus', bars: 8, i: 0.95 },
        { name: 'break', bars: 4, i: 0.3 },
        { name: 'chorus', bars: 8, i: 1.0 },
        { name: 'outro', bars: 4, i: 0.4 }
      ]
    }
  ];

  S.byId = function (id) {
    for (const s of S.LIST) if (s.id === id) return s;
    return S.LIST[0];
  };

  /* ---------- generator ---------- */

  /* Returns { events:[{t,inst,...}], chart:[{t(ms),strength,inst,pitch}],
                lengthMs, bpm, barMs, beatMs } */
  S.build = function (spec) {
    const rand = U.rng(spec.seed * 2654435761 % 4294967296);
    const scale = SCALES[spec.scale] || SCALES.minor;
    const progs = PROGRESSIONS[spec.scale] || PROGRESSIONS.minor;
    const progression = progs[Math.floor(rand() * progs.length)];
    const rootMidi = 48 + (ROOT[spec.root] || 0); /* C3-ish */
    const beatMs = 60000 / spec.bpm;
    const barMs = beatMs * 4;
    const stepMs = barMs / 16;
    const swing = spec.swing || 0;

    const events = [];
    const chart = [];

    let t = 0; /* ms, music start = 0 */
    let barIndex = 0;

    function stepTime(step) {
      let ms = t + step * stepMs;
      if (swing && step % 2 === 1) ms += stepMs * swing;
      return ms;
    }
    function pushEv(inst, ms, opts) {
      const ev = Object.assign({ inst: inst, t: ms / 1000 }, opts || {});
      events.push(ev);
      return ev;
    }
    function pushChart(ms, strength, inst, pitch) {
      chart.push({ t: ms, strength: strength, inst: inst, pitch: pitch || 0 });
    }

    let melodyDeg = Math.floor(rand() * 7);

    spec.structure.forEach(function (sec) {
      const I = sec.i;
      const heavy = I > 0.75;
      const mid = I > 0.5;

      for (let bar = 0; bar < sec.bars; bar++) {
        const chordDeg = progression[(barIndex + Math.floor(bar / 2)) % progression.length];
        const chordRootMidi = degToMidi(rootMidi, scale, chordDeg, 0);

        /* ---- pads / chord bed ---- */
        if (I > 0.35) {
          [0, 2, 4].forEach(function (off, k) {
            pushEv('pad', t, {
              freq: midiToFreq(degToMidi(rootMidi, scale, chordDeg + off, 1)),
              gain: 0.055 + I * 0.03,
              dur: (barMs / 1000) * 0.96
            });
          });
        }

        /* ---- bass ---- */
        const bassPattern = heavy
          ? [0, 2, 4, 6, 8, 10, 12, 14]
          : mid ? [0, 4, 8, 12] : [0, 8];
        bassPattern.forEach(function (st, k) {
          const deg = chordDeg + (k % 4 === 3 && heavy ? 4 : 0);
          pushEv('bass', stepTime(st), {
            freq: midiToFreq(degToMidi(rootMidi, scale, deg, -1)),
            gain: 0.3 + I * 0.14,
            dur: (stepMs / 1000) * (heavy ? 1.7 : 3.2)
          });
          if (st % 4 === 0) pushChart(stepTime(st), I * 0.5, 'bass', deg);
        });

        /* ---- drums ---- */
        const kickPat = heavy ? [0, 4, 6, 8, 10, 12, 14] : mid ? [0, 4, 8, 12] : [0, 8];
        const snarePat = heavy ? [4, 12] : mid ? [4, 12] : [12];
        kickPat.forEach(function (st) {
          pushEv('kick', stepTime(st), { gain: 0.7 + I * 0.22 });
          pushChart(stepTime(st), 1.0, 'kick', 0);
        });
        snarePat.forEach(function (st) {
          if (heavy && rand() < 0.5) pushEv('clap', stepTime(st), { gain: 0.24 + I * 0.1 });
          else pushEv('snare', stepTime(st), { gain: 0.26 + I * 0.12 });
          pushChart(stepTime(st), 1.0, 'snare', 0);
        });
        for (let st = 0; st < 16; st++) {
          if (I < 0.4) { if (st % 4 === 2) pushEv('hat', stepTime(st), { gain: 0.1 }); continue; }
          if (st % 2 === 0) pushEv('hat', stepTime(st), { gain: 0.1 + I * 0.07 });
          else if (heavy && rand() < 0.6) pushEv('hat', stepTime(st), { gain: 0.07 + I * 0.05 });
          if (st === 6 || st === 14) pushEv('openhat', stepTime(st), { gain: 0.1 + I * 0.05 });
        }
        if (bar === 0 || (sec.bars > 4 && bar === Math.floor(sec.bars / 2))) {
          pushEv('crash', t, { gain: 0.18 + I * 0.12 });
        }

        /* ---- lead melody ---- */
        if (I > 0.45) {
          const density = heavy ? 0.62 : 0.34;
          let st = heavy ? 0 : 2;
          while (st < 16) {
            if (rand() < density) {
              const stepChoice = rand();
              let move = stepChoice < 0.42 ? (rand() < 0.5 ? 1 : -1) : stepChoice < 0.78 ? (rand() < 0.5 ? 2 : -2) : (rand() < 0.5 ? 3 : -3);
              melodyDeg += move;
              if (melodyDeg < 0) melodyDeg += 7;
              if (melodyDeg > 9) melodyDeg -= 7;
              const oct = heavy ? 1 : 1;
              const m = degToMidi(rootMidi, scale, melodyDeg, oct);
              const len = rand() < 0.4 ? 2 : 1;
              pushEv(heavy && rand() < 0.4 ? 'pluck' : 'lead', stepTime(st), {
                freq: midiToFreq(m),
                gain: 0.14 + I * 0.07,
                dur: (stepMs / 1000) * (len * 1.6),
                type: rand() < 0.5 ? 'triangle' : 'square'
              });
              pushChart(stepTime(st), 0.62 + I * 0.34, 'lead', m);
              st += len * (heavy && rand() < 0.35 ? 1 : 2);
            } else {
              st += 2;
            }
          }
        }

        /* ---- arp sparkle on peaks ---- */
        if (heavy) {
          for (let st = 0; st < 16; st += 2) {
            if (rand() < 0.3) {
              pushEv('arp', stepTime(st), {
                freq: midiToFreq(degToMidi(rootMidi, scale, chordDeg + (st % 3), 2)),
                gain: 0.06 + I * 0.04
              });
            }
          }
        }

        t += barMs;
        barIndex++;
      }
    });

    /* tail so the last notes ring out */
    const lengthMs = t + 1800;

    /* Instruments are written per-bar in parallel, so sort before playback:
       the scheduler walks this array with a single forward pointer. */
    events.sort(function (a, b) { return a.t - b.t; });

    return {
      events: events,
      chart: chart,
      lengthMs: lengthMs,
      bpm: spec.bpm,
      beatMs: beatMs,
      barMs: barMs,
      stepMs: stepMs,
      sections: spec.structure
    };
  };

  /* Preview notes for song-select (short recognisable loop). */
  S.preview = function (spec, seconds) {
    const built = S.build(spec);
    const cut = (seconds || 9) * 1000;
    return {
      events: built.events.filter(function (e) { return e.t * 1000 < cut; }),
      lengthMs: cut,
      loop: true
    };
  };

  S.durationLabel = function (spec) {
    const built = S.build(spec);
    return U.msToClock(built.lengthMs);
  };

  window.Mania = window.Mania || {};
  window.Mania.Songs = S;
})();
