/* mania! — Web Audio synth engine.
   Everything is generated: instruments, songs, hitsounds. No external files. */
(function () {
  'use strict';

  const A = {};
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null;
  let analyser = null, freqData = null, timeData = null;
  let noiseBuf = null;
  let ready = false;

  const vols = { master: 0.85, music: 0.65, effects: 0.8 };
  let session = null;

  const AC = window.AudioContext || window.webkitAudioContext;

  A.supported = !!AC;

  function makeNoiseBuffer() {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  A.ensure = function () {
    if (!AC) return Promise.resolve(null);
    if (!ctx) {
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      timeData = new Uint8Array(analyser.fftSize);

      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();

      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(analyser);
      analyser.connect(ctx.destination);

      noiseBuf = makeNoiseBuffer();
      A.applyVolumes();
      ready = true;
    }
    if (ctx.state === 'suspended') return ctx.resume().then(() => ctx);
    return Promise.resolve(ctx);
  };

  A.isReady = () => ready && ctx && ctx.state === 'running';
  A.context = () => ctx;

  A.setVolume = function (name, v) {
    vols[name] = Math.max(0, Math.min(1, v));
    A.applyVolumes();
  };
  A.getVolume = (name) => vols[name];

  A.applyVolumes = function () {
    if (!ctx) return;
    master.gain.value = vols.master;
    musicBus.gain.value = vols.music;
    sfxBus.gain.value = vols.effects;
  };

  A.getLevels = function () {
    if (!analyser) return null;
    analyser.getByteFrequencyData(freqData);
    return freqData;
  };
  A.getWaveform = function () {
    if (!analyser) return null;
    analyser.getByteTimeDomainData(timeData);
    return timeData;
  };

  /* ---------- primitive voices ---------- */

  function stopSoon(nodes, at) {
    for (const n of nodes) {
      try { n.stop(at); } catch (e) { /* already stopped */ }
    }
  }

  function tone(dest, t0, opts) {
    const type = opts.type || 'triangle';
    const freq = opts.freq || 440;
    const peak = (opts.gain === undefined ? 0.3 : opts.gain);
    const dur = opts.dur || 0.25;
    const attack = opts.attack === undefined ? 0.008 : opts.attack;
    const release = opts.release === undefined ? 0.16 : opts.release;
    const detune = opts.detune || 0;
    const glide = opts.glide || 0;
    const filter = opts.filter || 0;

    const g = ctx.createGain();
    let last = g;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.value = filter;
      bq.Q.value = opts.q || 1;
      g.connect(bq);
      bq.connect(dest);
      last = g;
    } else {
      g.connect(dest);
    }

    const voices = opts.voices || 1;
    const oscs = [];
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator();
      o.type = type;
      const spread = voices > 1 ? (i - (voices - 1) / 2) * 7 : 0;
      o.frequency.setValueAtTime(freq, t0);
      if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
      o.detune.value = detune + spread;
      o.connect(g);
      o.start(t0);
      oscs.push(o);
    }

    const hold = Math.max(dur, attack + 0.02);
    const g0 = g.gain;
    g0.cancelScheduledValues(t0);
    g0.setValueAtTime(0.0001, t0);
    g0.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
    if (opts.decay) {
      g0.exponentialRampToValueAtTime(Math.max(peak * opts.decay, 0.0001), t0 + attack + (opts.decayTime || hold));
    }
    const relAt = t0 + hold;
    g0.setValueAtTime(Math.max(peak * (opts.decay || 1), 0.0001), relAt);
    g0.exponentialRampToValueAtTime(0.0001, relAt + release);

    stopSoon(oscs, relAt + release + 0.02);
    return last;
  }

  function noiseBurst(dest, t0, opts) {
    const dur = opts.dur || 0.1;
    const peak = opts.gain === undefined ? 0.3 : opts.gain;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = opts.filterType || 'highpass';
    bq.frequency.value = opts.freq || 6000;
    bq.Q.value = opts.q || 0.9;
    const g = ctx.createGain();
    src.connect(bq);
    bq.connect(g);
    g.connect(dest);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + (opts.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.start(t0);
    stopSoon([src], t0 + dur + 0.02);
  }

  /* ---------- instruments ---------- */

  const INST = {
    lead: function (dest, t0, ev) {
      tone(dest, t0, {
        type: ev.type || 'triangle', freq: ev.freq, gain: (ev.gain || 0.22), dur: ev.dur || 0.22,
        voices: 2, detune: 6, release: 0.18, filter: ev.filter || 4200, q: 3
      });
    },
    pluck: function (dest, t0, ev) {
      tone(dest, t0, {
        type: 'triangle', freq: ev.freq, gain: (ev.gain || 0.26), dur: 0.12,
        voices: 2, detune: 10, decay: 0.35, decayTime: 0.18, release: 0.2, filter: 5200, q: 4
      });
    },
    bass: function (dest, t0, ev) {
      tone(dest, t0, {
        type: 'sine', freq: ev.freq, gain: (ev.gain || 0.4), dur: ev.dur || 0.2,
        attack: 0.006, decay: 0.6, decayTime: 0.12, release: 0.12, filter: 900, q: 2
      });
      tone(dest, t0, {
        type: 'square', freq: ev.freq, gain: (ev.gain || 0.4) * 0.14, dur: ev.dur || 0.2,
        attack: 0.006, decay: 0.5, decayTime: 0.1, release: 0.1, filter: 700
      });
    },
    pad: function (dest, t0, ev) {
      tone(dest, t0, {
        type: 'sawtooth', freq: ev.freq, gain: (ev.gain || 0.1), dur: ev.dur || 1.6,
        voices: 3, detune: 12, attack: 0.35, release: 0.7, filter: 1500, q: 1.4
      });
    },
    arp: function (dest, t0, ev) {
      tone(dest, t0, {
        type: 'square', freq: ev.freq, gain: (ev.gain || 0.12), dur: ev.dur || 0.1,
        attack: 0.004, decay: 0.5, decayTime: 0.1, release: 0.12, filter: 3600, q: 5
      });
    },
    kick: function (dest, t0, ev) {
      tone(dest, t0, {
        type: 'sine', freq: 150, glide: 0.28, gain: (ev.gain || 0.85), dur: 0.11,
        attack: 0.002, decay: 0.02, decayTime: 0.1, release: 0.06
      });
    },
    snare: function (dest, t0, ev) {
      noiseBurst(dest, t0, { dur: 0.16, gain: (ev.gain || 0.3), freq: 1700, filterType: 'bandpass', q: 0.8 });
      tone(dest, t0, { type: 'triangle', freq: 190, gain: (ev.gain || 0.3) * 0.5, dur: 0.08, attack: 0.002, release: 0.06 });
    },
    clap: function (dest, t0, ev) {
      const g = (ev.gain || 0.26);
      noiseBurst(dest, t0, { dur: 0.05, gain: g * 0.7, freq: 1400, filterType: 'bandpass', q: 1.2 });
      noiseBurst(dest, t0 + 0.012, { dur: 0.05, gain: g * 0.8, freq: 1500, filterType: 'bandpass', q: 1.2 });
      noiseBurst(dest, t0 + 0.026, { dur: 0.14, gain: g, freq: 1600, filterType: 'bandpass', q: 1.2 });
    },
    hat: function (dest, t0, ev) {
      noiseBurst(dest, t0, { dur: 0.045, gain: (ev.gain || 0.16), freq: 8200 });
    },
    openhat: function (dest, t0, ev) {
      noiseBurst(dest, t0, { dur: 0.2, gain: (ev.gain || 0.14), freq: 7600 });
    },
    crash: function (dest, t0, ev) {
      noiseBurst(dest, t0, { dur: 1.1, gain: (ev.gain || 0.24), freq: 3800, attack: 0.004 });
    },
    ride: function (dest, t0, ev) {
      noiseBurst(dest, t0, { dur: 0.3, gain: (ev.gain || 0.1), freq: 9000 });
    }
  };

  A.playEvent = function (ev, when) {
    if (!A.isReady()) return;
    const dest = ev.bus === 'sfx' ? sfxBus : musicBus;
    const fn = INST[ev.inst] || INST.lead;
    fn(dest, when === undefined ? ctx.currentTime + 0.001 : when, ev);
  };

  /* ---------- hitsounds ---------- */

  const HITSOUNDS = {
    default: function (t0, vol, strong) {
      tone(sfxBus, t0, {
        type: 'triangle', freq: strong ? 1150 : 900, gain: 0.3 * vol, dur: 0.035,
        attack: 0.001, decay: 0.2, decayTime: 0.03, release: 0.05
      });
      noiseBurst(sfxBus, t0, { dur: 0.03, gain: 0.12 * vol, freq: 4200 });
    },
    soft: function (t0, vol, strong) {
      tone(sfxBus, t0, {
        type: 'sine', freq: strong ? 720 : 560, gain: 0.34 * vol, dur: 0.05,
        attack: 0.002, release: 0.09
      });
    },
    clap: function (t0, vol, strong) {
      noiseBurst(sfxBus, t0, { dur: 0.06, gain: 0.26 * vol, freq: 2200, filterType: 'bandpass', q: 1 });
      tone(sfxBus, t0, { type: 'sine', freq: strong ? 900 : 700, gain: 0.16 * vol, dur: 0.03, attack: 0.001, release: 0.05 });
    }
  };

  A.hit = function (kind, vol, strong) {
    if (!A.isReady()) return;
    if (kind === 'none') return;
    const fn = HITSOUNDS[kind] || HITSOUNDS.default;
    fn(ctx.currentTime + 0.001, vol === undefined ? 1 : vol, !!strong);
  };

  A.ui = function (kind) {
    if (!A.isReady()) return;
    const t0 = ctx.currentTime + 0.001;
    if (kind === 'move') tone(sfxBus, t0, { type: 'sine', freq: 660, gain: 0.13, dur: 0.03, attack: 0.001, release: 0.04 });
    else if (kind === 'select') {
      tone(sfxBus, t0, { type: 'triangle', freq: 880, gain: 0.16, dur: 0.05, attack: 0.001, release: 0.07 });
      tone(sfxBus, t0 + 0.05, { type: 'triangle', freq: 1320, gain: 0.14, dur: 0.06, attack: 0.001, release: 0.08 });
    } else if (kind === 'back') {
      tone(sfxBus, t0, { type: 'triangle', freq: 520, gain: 0.15, dur: 0.05, attack: 0.001, release: 0.08 });
      tone(sfxBus, t0 + 0.05, { type: 'triangle', freq: 380, gain: 0.13, dur: 0.06, attack: 0.001, release: 0.09 });
    } else if (kind === 'error') {
      tone(sfxBus, t0, { type: 'square', freq: 220, gain: 0.12, dur: 0.1, attack: 0.001, release: 0.1 });
    }
  };

  /* ---------- song playback ---------- */

  /* build: { events:[{t(sec),inst,...}], lengthMs } */
  A.playSong = function (build, opts) {
    opts = opts || {};
    if (!A.isReady()) return null;
    if (session) A.stopSong();

    const lead = opts.leadIn === undefined ? 1.2 : opts.leadIn;
    const t0 = ctx.currentTime + 0.12;
    const events = build.events || [];
    const nodes = [];
    let idx = 0;
    let timer = null;
    let stopped = false;
    let endFired = false;
    const endTime = (build.lengthMs / 1000) + lead;

    const s = {
      t0: t0,
      lead: lead,
      lengthMs: build.lengthMs,
      getTime: function () {
        if (!ctx) return 0;
        return (ctx.currentTime - t0) - lead;
      },
      events: events,
      nodes: nodes
    };

    function lookahead() {
      if (stopped || !ctx) return;
      const hidden = (typeof document !== 'undefined') && document.hidden;
      const horizon = ctx.currentTime + (hidden ? 0.7 : 0.2);
      while (idx < events.length && (t0 + lead + events[idx].t) < horizon) {
        const ev = events[idx];
        const at = Math.max(t0 + lead + ev.t, ctx.currentTime + 0.001);
        if (ev.inst !== 'rest') {
          const dest = ev.bus === 'sfx' ? sfxBus : musicBus;
          const fn = INST[ev.inst] || INST.lead;
          fn(dest, at, ev);
        }
        idx++;
      }
      if (!endFired && s.getTime() * 1000 > build.lengthMs) {
        endFired = true;
        if (opts.onEnd) opts.onEnd();
      }
    }

    timer = setInterval(lookahead, 35);
    lookahead();

    s.pause = function () {
      if (stopped || !ctx) return;
      clearInterval(timer);
      timer = null;
      ctx.suspend();
    };
    s.resume = function () {
      if (stopped || !ctx) return;
      ctx.resume();
      if (!timer) timer = setInterval(lookahead, 35);
    };
    s.stop = function () {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      if (session === s) session = null;
    };
    s.endTime = endTime;

    session = s;
    return s;
  };

  A.stopSong = function () {
    if (session) {
      try { session.stop(); } catch (e) { /* noop */ }
      session = null;
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  A.currentSong = () => session;
  A.songTime = function () { return session ? session.getTime() : 0; };

  window.Mania = window.Mania || {};
  window.Mania.Audio = A;
})();
