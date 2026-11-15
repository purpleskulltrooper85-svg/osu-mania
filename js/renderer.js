/* mania! — canvas renderer: lanes, receptors, notes, effects, background. */
(function () {
  'use strict';

  const U = window.Mania.Utils;
  const C = window.Mania.Config;
  const A = window.Mania.Audio;
  const R = {};

  let canvas = null, ctx = null;
  let vw = 0, vh = 0, dpr = 1;

  let geom = {
    x: 0, y: 0, w: 0, h: 0, keys: 4, laneW: 0, noteH: 20,
    hitY: 0, dir: 'down'
  };

  R.geometry = function () { return geom; };

  R.init = function (node) {
    canvas = node;
    ctx = canvas.getContext('2d', { alpha: false });
    R.resize();
  };

  function skinColors(keys, skin) {
    if (skin === 'mono') {
      const out = [];
      for (let i = 0; i < keys; i++) out.push(i % 2 === 0 ? '#e9ecef' : '#adb5bd');
      return out;
    }
    if (skin === 'rainbow') {
      const out = [];
      for (let i = 0; i < keys; i++) out.push('hsl(' + Math.round((i / keys) * 320) + ' 85% 68%)');
      return out;
    }
    if (skin === 'neon') {
      const palette = ['#39ff14', '#00f0ff', '#ff00e0', '#fff200', '#ff5c00', '#00ff9d', '#7c4dff'];
      const out = [];
      for (let i = 0; i < keys; i++) out.push(palette[i % palette.length]);
      return out;
    }
    return C.modeInfo(keys).colors.slice();
  }
  /* osu!mania lane colours: the outer columns are white, the inner columns
     take the mode's accent, and the special (centre) column is yellow. */
  R.skinColors = skinColors;

  function maniaLaneColor(keys, i, skin) {
    if (skin === 'rainbow') return 'hsl(' + Math.round((i / keys) * 320) + ' 85% 68%)';
    if (skin === 'mono') return i % 2 === 0 ? '#e9ecef' : '#adb5bd';
    if (skin === 'neon') {
      const palette = ['#39ff14', '#00f0ff', '#ff00e0', '#fff200', '#ff5c00', '#00ff9d', '#7c4dff'];
      return palette[i % palette.length];
    }
    const info = C.modeInfo(keys);
    return info.colors[i] || '#ffffff';
  }

  R.resize = function (opts) {
    opts = opts || {};
    const rect = canvas.parentElement.getBoundingClientRect();
    vw = Math.max(320, Math.round(rect.width));
    vh = Math.max(320, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    R.computeGeometry(opts.keys || 4, opts.laneWidth, opts.dir, opts.noteScale);
    return geom;
  };

  R.computeGeometry = function (keys, laneWidth, dir, noteScale) {
    keys = keys || geom.keys;
    laneWidth = laneWidth === undefined ? 0.6 : laneWidth;
    dir = dir || geom.dir || 'down';
    noteScale = noteScale === undefined ? 1 : noteScale;

    let w = vw * laneWidth;
    w = U.clamp(w, C.PLAYFIELD.minWidth, C.PLAYFIELD.maxWidth);
    const maxFit = vw - 24;
    if (w > maxFit) w = maxFit;
    const minLane = vh < 520 ? 30 : 40;
    if (w / keys < minLane) w = Math.min(maxFit, minLane * keys);

    geom.keys = keys;
    geom.w = w;
    geom.x = (vw - w) / 2;
    geom.y = 0;
    geom.h = vh;
    geom.laneW = w / keys;
    geom.dir = dir;
    geom.noteH = U.clamp(geom.laneW * C.NOTE.heightRatio * noteScale, C.NOTE.minHeight, C.NOTE.maxHeight);
    geom.hitY = vh * (dir === 'up' ? 0.17 : 0.84);
    return geom;
  };

  function pxPerSec(speed) {
    return (vh / 1.15) * (speed || 1);
  }

  function noteY(time, now, speed) {
    const dist = ((time - now) / 1000) * pxPerSec(speed);
    return geom.dir === 'up' ? geom.hitY + dist : geom.hitY - dist;
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* ---------- background ---------- */

  /* Persistent drifting orbs: sine wander + constant travel + wrap-around, so
     the backdrop reads as clearly alive even between audio beats. */
  let bgOrbs = null;
  function seedOrbs() {
    let s = 0x9e3779b9;
    const rnd = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    bgOrbs = [];
    for (let i = 0; i < 26; i++) {
      const big = i % 5 === 0;
      bgOrbs.push({
        bx: rnd(), by: rnd(),
        r: big ? 120 + rnd() * 140 : 20 + rnd() * 90,
        sp: 0.14 + rnd() * 0.5,
        ax: (rnd() * 2 - 1) * 70, ay: (rnd() * 2 - 1) * 62,
        vx: (rnd() * 2 - 1) * 16, vy: (rnd() * 2 - 1) * 13,
        ph: rnd() * Math.PI * 2, pulse: 1 + rnd() * 2.2,
        rot: (rnd() * 2 - 1) * 0.5, ring: rnd() > 0.42
      });
    }
  }

  function drawBackground(t, opts) {
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    const hue = opts.hue === undefined ? 280 : opts.hue;
    grad.addColorStop(0, 'hsl(' + hue + ' 45% 9%)');
    grad.addColorStop(0.55, 'hsl(' + ((hue + 30) % 360) + ' 40% 6%)');
    grad.addColorStop(1, '#050308');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

    if (opts.visualiser !== false) {
      if (!bgOrbs) seedOrbs();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const o of bgOrbs) {
        let cx = o.bx * vw + Math.sin(t * o.sp + o.ph) * o.ax + o.vx * t;
        let cy = o.by * vh + Math.cos(t * o.sp * 0.9 + o.ph) * o.ay + o.vy * t;
        const span = o.r * 2;
        cx = ((cx + span) % (vw + span * 2) + (vw + span * 2)) % (vw + span * 2) - span;
        cy = ((cy + span) % (vh + span * 2) + (vh + span * 2)) % (vh + span * 2) - span;
        const r = o.r * (1 + Math.sin(t * o.pulse + o.ph) * 0.16);
        const h = (hue + o.ph * 40) % 360;
        if (o.ring) {
          const a0 = t * o.rot + o.ph;
          ctx.beginPath();
          ctx.arc(cx, cy, r, a0, a0 + Math.PI * 1.25);
          ctx.strokeStyle = 'hsla(' + h + ' 90% 70% / 0.20)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        } else {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, 'hsla(' + h + ' 90% 62% / 0.14)');
          g.addColorStop(1, 'hsla(' + h + ' 90% 62% / 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    if (opts.visualiser && A.isReady()) {
      const data = A.getLevels();
      if (data) {
        const bars = 56;
        const step = Math.floor(data.length / bars) || 1;
        const bw = vw / bars;
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let k = 0; k < step; k++) sum += data[i * step + k] || 0;
          const v = (sum / step) / 255;
          const h = Math.pow(v, 1.5) * vh * 0.42;
          if (h < 1) continue;
          const g = ctx.createLinearGradient(0, vh, 0, vh - h);
          g.addColorStop(0, 'hsla(' + ((hue + i * 4) % 360) + ' 90% 60% / 0.5)');
          g.addColorStop(1, 'hsla(' + ((hue + i * 4) % 360) + ' 90% 65% / 0)');
          ctx.fillStyle = g;
          ctx.fillRect(i * bw, vh - h, bw - 1.5, h);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  function dimOverlay(amount) {
    if (amount <= 0) return;
    ctx.fillStyle = 'rgba(4,3,8,' + amount + ')';
    ctx.fillRect(0, 0, vw, vh);
  }

  /* ---------- playfield ---------- */

  function drawLanes(engine, colors, opts) {
    const { x, w, h, laneW, keys } = geom;

    /* Dark, slightly transparent backdrop so notes pop. */
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, h);
    ctx.clip();

    for (let i = 0; i < keys; i++) {
      const lx = x + i * laneW;
      const held = engine && engine.laneGlow && engine.laneGlow[i] > 0.01;
      const press = engine ? Math.max(engine.laneGlow[i] || 0, engine.laneFlash[i] || 0) : 0;

      /* subtle alternating lane tint */
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(lx, 0, laneW, h);
      }

      /* lane light column, brightest near the receptor */
      if (press > 0.01 || held) {
        const near = geom.dir === 'up' ? 0 : h;
        const far = geom.hitY;
        const g = ctx.createLinearGradient(0, near, 0, far);
        g.addColorStop(0, hexA(colors[i], 0));
        g.addColorStop(1, hexA(colors[i], 0.10 + press * 0.22));
        ctx.fillStyle = g;
        ctx.fillRect(lx, 0, laneW, h);
      }
    }

    /* column separators: crisp, like mania's lane borders */
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= keys; i++) {
      const lx = Math.round(x + i * laneW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
    }
    ctx.restore();

    /* playfield edge highlight */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.round(x) + 0.5, 0, Math.round(w), h);

    /* hit line across the playfield */
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, geom.hitY + 0.5);
    ctx.lineTo(x + w, geom.hitY + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function hexA(hex, a) {
    if (hex.indexOf('hsl') === 0 || hex.indexOf('rgb') === 0) {
      return hex.replace(')', ' / ' + a + ')').replace('hsl(', 'hsla(').replace('rgb(', 'rgba(');
    }
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* A mania note head. Notes ALWAYS span the lane width — the style only
     changes the corner rounding. A small corner radius reads as the classic
     osu!mania rectangle; a large one gives the rounded "pill" look. */
  function drawNoteShape(c, x, y, w, h, color, style, alpha) {
    const pad = Math.max(1.5, w * 0.035);
    const nx = x + pad;
    const ny = y + Math.max(0.5, h * 0.05);
    const nw = w - pad * 2;
    const nh = h - Math.max(1, h * 0.1);
    c.globalAlpha = alpha;

    const round = cornerRadius(style, nw, nh);
    const cx = nx + nw / 2;

    /* drop shadow for depth */
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = Math.min(12, nw * 0.12);
    c.shadowOffsetY = 2;
    c.fillStyle = color;
    roundRect(c, nx, ny, nw, nh, round);
    c.fill();
    c.restore();

    /* soft vertical gradient from a bright top to a darker bottom */
    const g = c.createLinearGradient(nx, ny, nx, ny + nh);
    g.addColorStop(0, hexA('#ffffff', 0.5));
    g.addColorStop(0.32, color);
    g.addColorStop(1, shade(color, 0.6));
    c.fillStyle = g;
    roundRect(c, nx, ny, nw, nh, round);
    c.fill();

    /* bright border — the signature mania note outline */
    c.lineWidth = Math.max(1.6, Math.min(nw, nh) * 0.09);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    roundRect(c, nx + c.lineWidth / 2, ny + c.lineWidth / 2,
      nw - c.lineWidth, nh - c.lineWidth, Math.max(1, round - c.lineWidth / 2));
    c.stroke();

    /* top gloss strip */
    c.globalAlpha = alpha * 0.45;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    const gw = nw * 0.72, gh = Math.max(1.5, nh * 0.16);
    roundRect(c, cx - gw / 2, ny + nh * 0.12, gw, gh, gh / 2);
    c.fill();
    c.globalAlpha = 1;
  }

  function cornerRadius(style, w, h) {
    if (style === 'circle' || style === 'pill') return Math.min(w, h) / 2;
    if (style === 'bar') return Math.max(2, h * 0.16);
    return Math.max(2, Math.min(w, h) * 0.2);   /* square = rounded rectangle */
  }

  function shade(hex, f) {
    if (hex.indexOf('#') !== 0) return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawNotes(engine, colors, opts) {
    const { x, w, h, laneW, noteH } = geom;
    const now = engine.time;
    const speed = engine.speed;
    const style = opts.noteStyle || 'circle';
    const cullTop = -120, cullBot = vh + 120;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, h);
    ctx.clip();

    for (let col = 0; col < geom.keys; col++) {
      const list = engine.colNotes[col];
      const lx = x + col * laneW;
      const color = colors[col];
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (n.state === 2) continue;
        const headY = noteY(n.t, now, speed);

        let alpha = 1;
        if (engine.hidden) {
          const prog = geom.dir === 'up' ? (headY - geom.hitY) / (h * 0.7) : (geom.hitY - headY) / (h * 0.7);
          alpha = U.clamp(1 - prog, 0, 1);
          if (alpha <= 0.02) continue;
        }

        if (!n.ln) {
          if (headY < cullTop || headY > cullBot) continue;
          drawNoteShape(ctx, lx, headY - noteH / 2, laneW, noteH, color, style, alpha);
        } else {
          const tailY = noteY(n.end, now, speed);
          const top = Math.min(headY, tailY);
          const bot = Math.max(headY, tailY);
          if (bot < cullTop || top > cullBot) continue;
          const holding = n.state === 1;
          drawHoldBody(lx, top, bot, laneW, color, alpha, holding);
          /* tail cap sits at the far end of the hold */
          drawHoldCap(lx, tailY, laneW, noteH, color, alpha, style);
          /* head is drawn last so it sits above the body */
          drawNoteShape(ctx, lx, headY - noteH / 2, laneW, noteH, color, style, alpha);
        }
      }
    }
    ctx.restore();
  }

  /* The long-note body: a rounded capsule down the middle of the lane with a
     bright rim, filled with the lane colour. */
  function drawHoldBody(lx, top, bot, laneW, color, alpha, holding) {
    const inset = laneW * 0.2;
    const bw = laneW - inset * 2;
    const r = Math.min(bw / 2, (bot - top) / 2);
    const grad = ctx.createLinearGradient(lx, top, lx, bot);
    grad.addColorStop(0, hexA(color, holding ? 0.85 : 0.6));
    grad.addColorStop(0.5, hexA(color, holding ? 0.7 : 0.42));
    grad.addColorStop(1, hexA(color, holding ? 0.85 : 0.6));

    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    roundRect(ctx, lx + inset, top, bw, bot - top, r);
    ctx.fill();

    ctx.lineWidth = Math.max(1.5, laneW * 0.05);
    ctx.strokeStyle = hexA('#ffffff', holding ? 0.95 : 0.6);
    roundRect(ctx, lx + inset, top, bw, bot - top, r);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* The long-note tail cap, shaped like a note head but slimmer. */
  function drawHoldCap(lx, tailY, laneW, noteH, color, alpha, style) {
    const pad = Math.max(1.5, laneW * 0.035);
    const capH = Math.max(6, noteH * 0.62);
    const nw = laneW - pad * 2;
    const round = cornerRadius(style, nw, capH);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    roundRect(ctx, lx + pad, tailY - capH / 2, nw, capH, round);
    ctx.fill();
    ctx.lineWidth = Math.max(1.4, capH * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    roundRect(ctx, lx + pad + ctx.lineWidth / 2, tailY - capH / 2 + ctx.lineWidth / 2,
      nw - ctx.lineWidth, capH - ctx.lineWidth, Math.max(1, round - ctx.lineWidth / 2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawReceptors(engine, colors, opts) {
    const { x, laneW, hitY, keys, noteH } = geom;
    const bindKeys = (window.Mania.Options.all().keybinds[keys] || C.modeInfo(keys).keys);
    const scale = opts.judgeScale || 1;
    const rh = Math.max(noteH * 1.02, laneW * 0.42) * scale;

    ctx.save();
    for (let i = 0; i < keys; i++) {
      const lx = x + i * laneW;
      const flash = engine ? engine.laneFlash[i] : 0;
      const held = engine ? (engine.laneGlow[i] || 0) : 0;
      const press = Math.max(flash, held);
      const cx = lx + laneW / 2;

      /* mania receptor: a lane-wide rounded bar, outlined and dim when idle,
         filled and glowing when pressed */
      const pad = Math.max(1.5, laneW * 0.05);
      const rx = lx + pad, rw = laneW - pad * 2;
      const ry = hitY - rh / 2;
      const rad = Math.max(3, rw * 0.16);

      ctx.fillStyle = 'rgba(0,0,0,' + (0.24 + press * 0.2) + ')';
      roundRect(ctx, rx, ry, rw, rh, rad);
      ctx.fill();

      if (press > 0.01) {
        ctx.globalAlpha = press * 0.35;
        ctx.fillStyle = colors[i];
        roundRect(ctx, rx, ry, rw, rh, rad);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.lineWidth = Math.max(1.6, rw * 0.06);
      ctx.strokeStyle = hexA(colors[i], 0.4 + press * 0.6);
      if (press > 0.01) { ctx.shadowColor = colors[i]; ctx.shadowBlur = 20 * press; }
      roundRect(ctx, rx + ctx.lineWidth / 2, ry + ctx.lineWidth / 2,
        rw - ctx.lineWidth, rh - ctx.lineWidth, Math.max(2, rad - ctx.lineWidth / 2));
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* key label just past the receptor, away from the note stream */
      const label = keyLabel(bindKeys[i]);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.42 + press * 0.5) + ')';
      ctx.font = '700 ' + Math.round(U.clamp(laneW * 0.26, 10, 18)) + 'px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, hitY + (geom.dir === 'up' ? rh * 1.25 : -rh * 1.25));
    }
    ctx.restore();
  }

  function keyLabel(code) {
    if (!code) return '';
    if (code === 'Space') return 'SPC';
    if (code.indexOf('Key') === 0) return code.slice(3);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Arrow') === 0) return code === 'ArrowUp' ? '↑' : code === 'ArrowDown' ? '↓' : code === 'ArrowLeft' ? '←' : '→';
    if (code === 'Semicolon') return ';';
    if (code === 'ShiftLeft') return 'L⇧';
    if (code === 'ShiftRight') return 'R⇧';
    if (code === 'ControlLeft') return 'L⌃';
    if (code === 'ControlRight') return 'R⌃';
    if (code === 'AltLeft') return 'L⌥';
    if (code === 'AltRight') return 'R⌥';
    return code.replace('Numpad', 'N');
  }
  R.keyLabel = keyLabel;

  function drawEffects(engine, opts) {
    const { x, laneW } = geom;
    const now = engine.time;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, geom.w, vh);
    ctx.clip();

    for (const fx of engine.effects) {
      const age = now - fx.born;
      const cx = x + fx.lane * laneW + laneW / 2;
      if (fx.type === 'judge') {
        if (!opts.judgeText) continue;
        const life = 620;
        const t = U.clamp(age / life, 0, 1);
        const j = C.judgement(fx.judgement);
        const scale = opts.judgeScale || 1;
        const size = U.clamp(laneW * 0.4, 12, 30) * scale * (1 + (1 - U.easeOut(t)) * 0.35);
        ctx.globalAlpha = 1 - U.easeIn(t);
        ctx.font = '800 ' + Math.round(size) + 'px "Trebuchet MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const y = geom.dir === 'up' ? geom.hitY + 46 * scale : geom.hitY - 46 * scale;
        const off = (geom.dir === 'up' ? -1 : 1) * t * 26;
        ctx.shadowColor = j.glow;
        ctx.shadowBlur = 14;
        ctx.fillStyle = j.color;
        ctx.fillText(j.short, cx, y + off);
        ctx.shadowBlur = 0;
      } else if (fx.type === 'burst' && opts.particles) {
        const life = 520;
        const t = U.clamp(age / life, 0, 1);
        const j = C.judgement(fx.judgement);
        ctx.globalAlpha = 1 - t;
        const n = 7;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + fx.lane;
          const r = t * laneW * 0.75;
          const px = cx + Math.cos(ang) * r;
          const py = geom.hitY + Math.sin(ang) * r * 0.7;
          ctx.fillStyle = j.color;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, 3 * (1 - t)), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.type === 'tap') {
        const life = 220;
        const t = U.clamp(age / life, 0, 1);
        const cx = x + fx.lane * laneW + laneW / 2;
        const rad = laneW * (0.32 + t * 0.3);
        ctx.globalAlpha = (1 - t) * (fx.empty ? 0.28 : 0.7);
        ctx.lineWidth = Math.max(1.5, laneW * 0.05);
        ctx.strokeStyle = fx.color || '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, geom.hitY, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawCombo(engine, opts) {
    if (!opts.comboCounter || engine.combo < 3) return;
    const size = U.clamp(geom.w * 0.1, 28, 64);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = geom.dir === 'up' ? geom.hitY + vh * 0.28 : geom.hitY - vh * 0.28;
    ctx.font = '800 ' + Math.round(size) + 'px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.fillText(String(engine.combo), geom.x + geom.w / 2, y);
    ctx.font = '700 ' + Math.round(size * 0.34) + 'px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('combo', geom.x + geom.w / 2, y + size * 0.62);
    ctx.restore();
  }

  /* ---------- public draw ---------- */

  R.drawIdle = function (t, opts) {
    opts = opts || {};
    drawBackground(t, { hue: opts.hue || 280, visualiser: opts.visualiser !== false });
    dimOverlay(0.25);
  };

  R.drawGame = function (engine, opts) {
    opts = opts || {};
    const hue = opts.hue === undefined ? 280 : opts.hue;
    drawBackground(performance.now() / 1000, { hue: hue, visualiser: opts.visualiser !== false });
    dimOverlay(opts.bgDim || 0);
    const colors = [];
    for (let i = 0; i < geom.keys; i++) colors.push(maniaLaneColor(geom.keys, i, opts.laneSkin));
    drawLanes(engine, colors, opts);
    drawNotes(engine, colors, opts);
    drawReceptors(engine, colors, opts);
    drawEffects(engine, opts);
    drawCombo(engine, opts);
  };

  R.clear = function (fill) {
    ctx.fillStyle = fill || '#050308';
    ctx.fillRect(0, 0, vw, vh);
  };

  R.size = function () { return { w: vw, h: vh }; };

  window.Mania = window.Mania || {};
  window.Mania.Renderer = R;
})();
