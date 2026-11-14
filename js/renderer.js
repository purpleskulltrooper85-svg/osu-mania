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
  R.skinColors = skinColors;

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

    R.computeGeometry(opts.keys || 4, opts.laneWidth, opts.dir);
    return geom;
  };

  R.computeGeometry = function (keys, laneWidth, dir) {
    keys = keys || geom.keys;
    laneWidth = laneWidth === undefined ? 0.6 : laneWidth;
    dir = dir || geom.dir || 'down';

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
    geom.noteH = U.clamp(geom.laneW * C.NOTE.heightRatio, C.NOTE.minHeight, C.NOTE.maxHeight);
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

  function drawBackground(t, opts) {
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    const hue = opts.hue === undefined ? 280 : opts.hue;
    grad.addColorStop(0, 'hsl(' + hue + ' 45% 9%)');
    grad.addColorStop(0.55, 'hsl(' + ((hue + 30) % 360) + ' 40% 6%)');
    grad.addColorStop(1, '#050308');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

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
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, h);
    ctx.clip();

    /* lane panels */
    for (let i = 0; i < keys; i++) {
      const lx = x + i * laneW;
      const shade = i % 2 === 0 ? 0.5 : 0.62;
      ctx.fillStyle = 'rgba(0,0,0,' + shade * 0.55 + ')';
      ctx.fillRect(lx, 0, laneW, h);

      const held = engine && engine.holdNote && engine.holdNote[i] ? 1 : 0;
      const glow = engine ? (engine.laneGlow[i] || 0) : 0;
      if (glow > 0.01 || held) {
        const g = ctx.createLinearGradient(0, geom.dir === 'up' ? 0 : h, 0, geom.dir === 'up' ? geom.hitY : geom.hitY);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, hexA(colors[i], 0.14 + glow * 0.18));
        ctx.fillStyle = g;
        ctx.fillRect(lx, 0, laneW, h);
      }
    }

    /* lane dividers */
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= keys; i++) {
      const lx = Math.round(x + i * laneW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
    }
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

  function drawNoteShape(c, x, y, w, h, color, style, alpha) {
    c.globalAlpha = alpha;
    if (style === 'bar') {
      c.fillStyle = color;
      roundRect(c, x + 2, y, w - 4, h, Math.min(4, h / 2));
      c.fill();
      c.globalAlpha = alpha * 0.9;
      c.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(c, x + 4, y + h * 0.3, w - 8, Math.max(2, h * 0.16), 2);
      c.fill();
    } else if (style === 'flat') {
      c.fillStyle = color;
      roundRect(c, x + 1, y, w - 2, h, 6);
      c.fill();
      c.globalAlpha = alpha * 0.55;
      c.fillStyle = '#ffffff';
      roundRect(c, x + 3, y + 2, w - 6, Math.max(2, h * 0.22), 4);
      c.fill();
    } else {
      c.shadowColor = color;
      c.shadowBlur = 12;
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, color);
      g.addColorStop(1, shade(color, 0.55));
      c.fillStyle = g;
      roundRect(c, x + 1, y, w - 2, h, 6);
      c.fill();
      c.shadowBlur = 0;
      c.globalAlpha = alpha * 0.9;
      c.fillStyle = 'rgba(255,255,255,0.9)';
      roundRect(c, x + 3, y + 1.5, w - 6, Math.max(2, h * 0.2), 3);
      c.fill();
    }
    c.globalAlpha = 1;
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
    const style = opts.noteStyle || 'glow';
    const cullTop = -80, cullBot = vh + 80;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, h);
    ctx.clip();

    for (let col = 0; col < geom.keys; col++) {
      const list = engine.colNotes[col];
      const lx = x + col * laneW;
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (n.state === 2) continue;
        const headY = noteY(n.t, now, speed);
        if (!n.ln) {
          if (headY < cullTop || headY > cullBot) continue;
          let alpha = 1;
          if (engine.hidden) {
            const prog = geom.dir === 'up' ? (headY - geom.hitY) / (h * 0.7) : (geom.hitY - headY) / (h * 0.7);
            alpha = U.clamp(1 - prog, 0, 1);
            if (alpha <= 0.02) continue;
          }
          drawNoteShape(ctx, lx, headY - noteH / 2, laneW, noteH, colors[col], style, alpha);
        } else {
          const tailY = noteY(n.end, now, speed);
          const top = Math.min(headY, tailY);
          const bot = Math.max(headY, tailY);
          if (bot < cullTop || top > cullBot) continue;
          let alpha = 1;
          if (engine.hidden) {
            const prog = geom.dir === 'up' ? (headY - geom.hitY) / (h * 0.7) : (geom.hitY - headY) / (h * 0.7);
            alpha = U.clamp(1 - prog, 0, 1);
            if (alpha <= 0.02) continue;
          }
          const holding = n.state === 1;
          ctx.globalAlpha = alpha * (holding ? 0.95 : 0.62);
          const g = ctx.createLinearGradient(lx, top, lx, bot);
          g.addColorStop(0, hexA(colors[col], 0.85));
          g.addColorStop(1, hexA(colors[col], 0.3));
          ctx.fillStyle = g;
          roundRect(ctx, lx + laneW * 0.22, top, laneW * 0.56, bot - top, laneW * 0.2);
          ctx.fill();
          ctx.globalAlpha = alpha * 0.7;
          ctx.strokeStyle = hexA(colors[col], 0.9);
          ctx.lineWidth = 2;
          roundRect(ctx, lx + laneW * 0.22, top, laneW * 0.56, bot - top, laneW * 0.2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          drawNoteShape(ctx, lx, headY - noteH / 2, laneW, noteH, colors[col], style, alpha);
          if (n.state === 1) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ffffff';
            roundRect(ctx, lx + laneW * 0.22, tailY - 3, laneW * 0.56, 6, 3);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    ctx.restore();
  }

  function drawReceptors(engine, colors, opts) {
    const { x, laneW, hitY, keys } = geom;
    const bindKeys = (window.Mania.Options.all().keybinds[keys] || C.modeInfo(keys).keys);
    const scale = opts.judgeScale || 1;
    const rh = geom.noteH * 1.05 * scale;

    ctx.save();
    for (let i = 0; i < keys; i++) {
      const lx = x + i * laneW;
      const flash = engine ? engine.laneFlash[i] : 0;
      const held = engine ? (engine.laneGlow[i] || 0) : 0;
      const cx = lx + laneW / 2;

      ctx.globalAlpha = 0.28 + flash * 0.7;
      ctx.fillStyle = colors[i];
      roundRect(ctx, lx + 2, hitY - rh / 2, laneW - 4, rh, 6);
      ctx.fill();

      if (flash > 0.01) {
        ctx.globalAlpha = flash * 0.85;
        ctx.shadowColor = colors[i];
        ctx.shadowBlur = 26 * flash;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, lx + 2, hitY - rh / 2, laneW - 4, rh, 6);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 0.9;

      const label = keyLabel(bindKeys[i]);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + flash * 0.45) + ')';
      ctx.font = '600 ' + Math.round(U.clamp(geom.laneW * 0.24, 9, 17)) + 'px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, hitY + (geom.dir === 'up' ? rh * 0.95 : -rh * 0.95));
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* hit line */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, hitY + 0.5);
    ctx.lineTo(x + geom.w, hitY + 0.5);
    ctx.stroke();
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
        const life = 240;
        const t = U.clamp(age / life, 0, 1);
        ctx.globalAlpha = (1 - t) * 0.4;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, x + fx.lane * laneW + 2, geom.hitY - geom.noteH / 2, laneW - 4, geom.noteH, 6);
        ctx.fill();
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
    const colors = skinColors(geom.keys, opts.laneSkin);
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
