/* mania! — UI primitives: toasts, modals, option controls, formatting */
(function () {
  'use strict';

  const U = window.Mania.Utils;
  const C = window.Mania.Config;
  const A = window.Mania.Audio;
  const UI = {};

  let toastWrap = null;

  UI.mountToast = function () {
    if (toastWrap) return;
    toastWrap = U.el('div', { class: 'toast-wrap' });
    document.getElementById('app').appendChild(toastWrap);
  };

  UI.toast = function (msg, ms) {
    UI.mountToast();
    const t = U.el('div', { class: 'toast', text: msg });
    toastWrap.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity 0.25s, transform 0.25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(-12px)';
      setTimeout(function () { t.remove(); }, 260);
    }, ms || 1600);
  };

  /* ---------- modal ---------- */

  UI.modal = function (opts) {
    const app = document.getElementById('app');
    const overlay = U.el('div', { class: 'overlay' });
    const box = U.el('div', { class: 'modal' });

    if (opts.title) box.appendChild(U.el('h2', { text: opts.title }));
    if (opts.subtitle) box.appendChild(U.el('p', { class: 'sub', text: opts.subtitle }));
    if (opts.body) box.appendChild(opts.body);

    const actions = U.el('div', { class: 'modal-actions' });
    const buttons = opts.buttons || [{ label: 'Close' }];
    buttons.forEach(function (b) {
      const btn = U.el('button', {
        class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''),
        html: (b.icon ? U.icon(b.icon) : '') + '<span>' + b.label + '</span>'
      });
      btn.addEventListener('click', function () {
        A.ui('select');
        if (b.onClick && b.onClick() === false) return;
        close();
      });
      actions.appendChild(btn);
    });
    box.appendChild(actions);
    overlay.appendChild(box);
    app.appendChild(overlay);

    function onKey(e) {
      if (e.key === 'Escape' && opts.dismissable !== false) { close(); }
    }
    window.addEventListener('keydown', onKey);

    function close() {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
      if (opts.onClose) opts.onClose();
    }

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay && opts.dismissable !== false) close();
    });

    UI.activeModal = { close: close, overlay: overlay };
    return { close: close, box: box };
  };

  UI.confirm = function (title, message, onYes, opts) {
    opts = opts || {};
    UI.modal({
      title: title,
      body: U.el('p', { class: 'sub', text: message, style: 'margin:0' }),
      buttons: [
        { label: opts.cancelLabel || 'Cancel' },
        { label: opts.yesLabel || 'Confirm', primary: true, danger: opts.danger, onClick: onYes }
      ]
    });
  };

  /* ---------- formatting ---------- */

  UI.fmtScore = function (n) { return U.fmt(Math.round(n || 0)); };
  UI.fmtAcc = function (a) { return (a || 0).toFixed(2) + '%'; };
  UI.fmtStars = function (r) { return (r || 0).toFixed(1) + '★'; };
  UI.fmtVol = function (v) { return Math.round(v * 100) + '%'; };

  UI.rangeLabel = function (item, value) {
    if (item.format === 'pct') return UI.fmtVol(value);
    if (item.format === 'x') return (Math.round(value * 100) / 100).toFixed(2) + 'x';
    if (item.format === 'od') return (Math.round(value * 10) / 10).toFixed(1);
    if (item.format === 'ms') return (value > 0 ? '+' : '') + Math.round(value) + 'ms';
    return String(value);
  };

  /* ---------- option controls ---------- */

  UI.buildControl = function (item, opts) {
    const O = window.Mania.Options;
    const wrap = U.el('div', { class: 'opt-control' });

    if (item.type === 'toggle') {
      const t = U.el('div', {
        class: 'toggle' + (O.get(item.key) ? ' on' : ''),
        role: 'switch',
        tabindex: '0',
        'aria-checked': O.get(item.key) ? 'true' : 'false'
      });
      function flip() {
        const v = !O.get(item.key);
        O.set(item.key, v);
        t.classList.toggle('on', v);
        t.setAttribute('aria-checked', v ? 'true' : 'false');
        A.ui('select');
        if (opts && opts.onChange) opts.onChange(item.key, v);
      }
      t.addEventListener('click', flip);
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
      });
      wrap.appendChild(t);
      return wrap;
    }

    if (item.type === 'range') {
      const rw = U.el('div', { class: 'range-wrap' });
      const val = U.el('div', { class: 'range-val', text: UI.rangeLabel(item, O.get(item.key)) });
      const input = U.el('input', {
        type: 'range', min: item.min, max: item.max, step: item.step,
        value: O.get(item.key), 'aria-label': item.label
      });
      input.addEventListener('input', function () {
        const v = parseFloat(input.value);
        val.textContent = UI.rangeLabel(item, v);
        O.set(item.key, v, { silent: false });
      });
      rw.appendChild(input);
      rw.appendChild(val);
      wrap.appendChild(rw);
      return wrap;
    }

    if (item.type === 'select') {
      const sw = U.el('div', { class: 'sel-wrap' });
      const sel = U.el('select', { 'aria-label': item.label });
      const list = item.options === 'difficulty'
        ? (opts && opts.difficultyOptions) || []
        : item.options;
      list.forEach(function (o) {
        sel.appendChild(U.el('option', { value: o.value, text: o.label }));
      });
      const cur = O.get(item.key);
      sel.value = String(cur);
      if (sel.value !== String(cur) && list.length) sel.value = String(list[0].value);
      sel.addEventListener('change', function () {
        let v = sel.value;
        if (v === 'true') v = true; else if (v === 'false') v = false;
        else if (v !== '' && !isNaN(Number(v))) v = Number(v);
        O.set(item.key, v);
        A.ui('select');
        if (opts && opts.onChange) opts.onChange(item.key, v);
      });
      sw.appendChild(sel);
      wrap.appendChild(sw);
      return wrap;
    }

    if (item.type === 'keybinds') {
      const grid = U.el('div', { class: 'keybind-grid' });
      UI.buildKeybinds(grid, opts && opts.mode);
      wrap.style.width = '100%';
      wrap.appendChild(grid);
      return wrap;
    }

    if (item.type === 'about') {
      const box = U.el('div', { class: 'opt-about' });
      box.appendChild(U.el('div', { class: 'about-logo', text: C.APP.name }));
      box.appendChild(U.el('p', { text: 'A browser prototype of a four-to-seven key vertical rhythm game. Everything you hear is synthesised live with the Web Audio API — there are no audio files, no downloads and no dependencies.' }));
      box.appendChild(U.el('p', { html: 'Play with the keyboard (<span class="kbd">D</span> <span class="kbd">F</span> <span class="kbd">J</span> <span class="kbd">K</span> for 4K) or tap the lanes on a touch screen. Press <span class="kbd">Esc</span> to pause.' }));
      box.appendChild(U.el('p', { text: 'Version ' + C.APP.version }));
      wrap.style.width = '100%';
      wrap.appendChild(box);
      return wrap;
    }

    if (item.type === 'action') {
      const btn = U.el('button', {
        class: 'btn sm' + (item.danger ? ' danger' : ''),
        text: item.label
      });
      btn.addEventListener('click', function () {
        if (item.confirm) {
          UI.confirm(item.label, item.confirm, function () {
            if (item.action === 'resetAll') window.Mania.Options.resetAll();
            if (opts && opts.onChange) opts.onChange(item.key, null);
          }, { danger: true, yesLabel: 'Reset' });
        } else if (item.action === 'resetAll') {
          window.Mania.Options.resetAll();
        }
      });
      wrap.appendChild(btn);
      return wrap;
    }

    wrap.appendChild(U.el('span', { class: 'hint', text: '(unsupported)' }));
    return wrap;
  };

  UI.buildKeybinds = function (grid, mode) {
    const O = window.Mania.Options;
    grid.innerHTML = '';
    const all = O.all();
    const m = mode || all.keys;
    const binds = all.keybinds[m] || C.modeInfo(m).keys;
    const count = C.modeInfo(m).keys.length;
    for (let i = 0; i < count; i++) {
      (function (lane) {
        const cell = U.el('div', { class: 'keybind' });
        cell.appendChild(U.el('div', { class: 'kb-lane', text: 'Lane ' + (lane + 1) }));
        const btn = U.el('button', { text: window.Mania.Renderer.keyLabel(binds[lane]) || '—' });
        btn.addEventListener('click', function () {
          if (btn.classList.contains('listening')) return;
          btn.classList.add('listening');
          btn.textContent = 'press…';
          A.ui('move');
          function onKey(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') {
              window.removeEventListener('keydown', onKey, true);
              btn.classList.remove('listening');
              btn.textContent = window.Mania.Renderer.keyLabel(binds[lane]) || '—';
              return;
            }
            if (e.key === 'Tab') return;
            O.setKeybind(m, lane, e.code);
            window.removeEventListener('keydown', onKey, true);
            btn.classList.remove('listening');
            btn.textContent = window.Mania.Renderer.keyLabel(e.code) || e.code;
            A.ui('select');
            window.Mania.Input.setMode(O.get('keys'));
            if (window.Mania.Input.rebindUI) window.Mania.Input.rebindUI();
          }
          window.addEventListener('keydown', onKey, true);
        });
        cell.appendChild(btn);
        grid.appendChild(cell);
      })(i);
    }
  };

  window.Mania = window.Mania || {};
  window.Mania.UI = UI;
})();
