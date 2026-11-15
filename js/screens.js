/* mania! — screens: title, song select, options, gameplay, pause, results. */
(function () {
  'use strict';

  const U = window.Mania.Utils;
  const C = window.Mania.Config;
  const A = window.Mania.Audio;
  const O = window.Mania.Options;
  const S = window.Mania.Songs;
  const B = window.Mania.Beatmap;
  const UI = window.Mania.UI;
  const R = window.Mania.Renderer;
  const Input = window.Mania.Input;
  const Engine = window.Mania.Engine;

  const SC = {};

  function keyHandlers(list) {
    const added = [];
    return {
      add: function (fn) { window.addEventListener('keydown', fn); added.push(fn); },
      remove: function () { added.forEach(function (fn) { window.removeEventListener('keydown', fn); }); added.length = 0; }
    };
  }

  function topbar(opts) {
    const bar = U.el('div', { class: 'topbar' });
    if (opts.onBack) {
      const b = U.el('button', { class: 'btn icon ghost', html: U.icon('back'), 'aria-label': 'Back' });
      b.addEventListener('click', function () { A.ui('back'); opts.onBack(); });
      bar.appendChild(b);
    }
    if (opts.brand) bar.appendChild(U.el('div', { class: 'brand', html: 'mania<span class="bang">!</span>' }));
    if (opts.title) bar.appendChild(U.el('div', { class: 'topbar-title', text: opts.title }));
    bar.appendChild(U.el('div', { class: 'spacer' }));
    (opts.right || []).forEach(function (n) { bar.appendChild(n); });
    return bar;
  }

  /* ============================================================
     TITLE
     ============================================================ */

  SC.title = function (app) {
    const root = U.el('div', { class: 'screen title-screen' });
    const scrim = U.el('div', { class: 'scrim' });
    root.appendChild(scrim);

    root.appendChild(U.el('div', { class: 'title-hint', text: 'Prototype build' }));
    root.appendChild(U.el('div', { class: 'title-logo', html: 'mania<span class="bang">!</span>' }));
    root.appendChild(U.el('div', { class: 'title-tag', text: 'vertical rhythm · 4K to 7K' }));

    const menu = U.el('div', { class: 'title-menu' });
    const play = U.el('button', { class: 'btn primary', html: U.icon('play') + '<span>Play</span>' });
    play.addEventListener('click', function () { A.ui('select'); app.go('select'); });
    const rand = U.el('button', { class: 'btn', html: U.icon('bolt') + '<span>Random song</span>' });
    rand.addEventListener('click', function () {
      A.ui('select');
      const r = Math.floor(Math.random() * S.LIST.length);
      app.state.songId = S.LIST[r].id;
      app.state.diffIndex = Math.min(app.state.diffIndex || 0, B.difficulties(S.LIST[r]).length - 1);
      app.go('select');
    });
    const opts = U.el('button', { class: 'btn', html: U.icon('gear') + '<span>Options</span>' });
    opts.addEventListener('click', function () { A.ui('select'); app.go('options', { from: 'title' }); });
    menu.appendChild(play);
    menu.appendChild(rand);
    menu.appendChild(opts);
    root.appendChild(menu);

    root.appendChild(U.el('div', { class: 'title-foot', text: C.APP.name + ' ' + C.APP.version + ' — all music synthesised live in your browser' }));

    root.draw = function (now) {
      R.drawIdle(now / 1000, { hue: 285, visualiser: true });
    };
    return root;
  };

  /* ============================================================
     SONG SELECT
     ============================================================ */

  SC.select = function (app) {
    const root = U.el('div', { class: 'screen select-screen' });
    root.appendChild(U.el('div', { class: 'scrim' }));

    let songIndex = 0;
    for (let i = 0; i < S.LIST.length; i++) if (S.LIST[i].id === app.state.songId) songIndex = i;
    let diffIndex = U.clamp(app.state.diffIndex || 0, 0, 4);
    let previewSong = null;
    let previewTimer = null;

    const keysChip = U.el('div', { class: 'chip', text: '' });
    const modsChip = U.el('div', { class: 'chip', text: '' });

    const modsBtn = U.el('button', { class: 'btn sm', html: U.icon('bolt') + '<span>Mods</span>' });
    modsBtn.addEventListener('click', function () { A.ui('select'); openMods(); });
    const optsBtn = U.el('button', { class: 'btn icon ghost', html: U.icon('gear'), 'aria-label': 'Options' });
    optsBtn.addEventListener('click', function () { A.ui('select'); app.go('options', { from: 'select' }); });

    root.appendChild(topbar({
      onBack: function () { stopPreview(); app.go('title'); },
      title: 'Song select',
      right: [keysChip, modsChip, modsBtn, optsBtn]
    }));

    const body = U.el('div', { class: 'select-body' });
    const list = U.el('div', { class: 'song-list', role: 'listbox', 'aria-label': 'Songs' });
    const side = U.el('div', { class: 'select-side' });
    const sideScroll = U.el('div', { class: 'select-side-scroll' });

    const cover = U.el('div', { class: 'big-cover' });
    const coverTitle = U.el('h2', {});
    const coverArtist = U.el('p', {});
    cover.appendChild(coverTitle);
    cover.appendChild(coverArtist);
    sideScroll.appendChild(cover);

    const diffPanel = U.el('div', { class: 'panel' });
    diffPanel.appendChild(U.el('h3', { text: 'Difficulty' }));
    const diffList = U.el('div', { class: 'diff-list' });
    diffPanel.appendChild(diffList);
    sideScroll.appendChild(diffPanel);

    const statPanel = U.el('div', { class: 'panel' });
    statPanel.appendChild(U.el('h3', { text: 'Chart' }));
    const statGrid = U.el('div', { class: 'stat-grid' });
    statPanel.appendChild(statGrid);
    const bestRow = U.el('div', { class: 'best-row' });
    statPanel.appendChild(bestRow);
    sideScroll.appendChild(statPanel);

    side.appendChild(sideScroll);

    const actions = U.el('div', { class: 'select-actions' });
    const playBtn = U.el('button', { class: 'btn primary play', html: U.icon('play') + '<span>Play</span>' });
    playBtn.addEventListener('click', function () { A.ui('select'); play(); });
    const previewBtn = U.el('button', { class: 'btn', html: U.icon('music') + '<span>Preview</span>' });
    previewBtn.addEventListener('click', function () {
      if (previewSong) { stopPreview(); A.ui('back'); }
      else { startPreview(); A.ui('select'); }
    });
    actions.appendChild(playBtn);
    actions.appendChild(previewBtn);
    side.appendChild(actions);

    body.appendChild(list);
    body.appendChild(side);
    root.appendChild(body);

    function currentSpec() { return S.LIST[songIndex]; }

    function diffs() { return B.difficulties(currentSpec()); }

    function buildList() {
      list.innerHTML = '';
      S.LIST.forEach(function (spec, i) {
        const card = U.el('div', {
          class: 'song-card' + (i === songIndex ? ' active' : ''),
          role: 'option',
          tabindex: '0',
          style: '--song-color:' + spec.color
        });
        card.appendChild(U.el('div', { class: 'song-thumb', text: spec.title.charAt(0) }));
        const meta = U.el('div', { class: 'song-meta' });
        meta.appendChild(U.el('div', { class: 'song-title', text: spec.title }));
        meta.appendChild(U.el('div', { class: 'song-artist', text: spec.artist + ' · ' + spec.bpm + ' BPM · ' + S.durationLabel(spec) }));
        const tags = U.el('div', { class: 'song-tags' });
        const dl = B.difficulties(spec);
        const maxDiff = dl[dl.length - 1];
        const chart = B.cached(spec, dl.length - 1, O.get('keys'));
        tags.appendChild(U.el('div', { class: 'chip', text: maxDiff.name }));
        if (O.get('showRatings')) tags.appendChild(U.el('div', { class: 'chip', text: UI.fmtStars(chart.rating) }));
        tags.appendChild(U.el('div', { class: 'chip', text: Math.round(chart.nps * 10) / 10 + ' nps' }));
        meta.appendChild(tags);
        card.appendChild(meta);
        card.addEventListener('click', function () { selectSong(i); });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSong(i); play(); }
        });
        list.appendChild(card);
      });
    }

    function buildDiffs() {
      diffList.innerHTML = '';
      const dl = diffs();
      if (diffIndex >= dl.length) diffIndex = dl.length - 1;
      dl.forEach(function (d, i) {
        const chart = B.cached(currentSpec(), i, O.get('keys'));
        const row = U.el('div', { class: 'diff-row' + (i === diffIndex ? ' active' : ''), tabindex: '0' });
        row.appendChild(U.el('div', { class: 'diff-badge', text: String(i + 1) }));
        row.appendChild(U.el('div', { class: 'diff-name', text: d.name }));
        if (O.get('showRatings')) row.appendChild(U.el('div', { class: 'diff-stars', text: UI.fmtStars(chart.rating) }));
        row.appendChild(U.el('div', { class: 'diff-nps', text: Math.round(chart.nps * 10) / 10 + ' nps' }));
        row.addEventListener('click', function () { setDiff(i); });
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDiff(i); play(); }
        });
        diffList.appendChild(row);
      });
    }

    function refreshSide() {
      const spec = currentSpec();
      const chart = B.cached(spec, diffIndex, O.get('keys'));
      cover.style.setProperty('--song-color', spec.color);
      coverTitle.textContent = spec.title;
      coverArtist.textContent = spec.artist + ' · ' + spec.bpm + ' BPM';

      statGrid.innerHTML = '';
      function stat(k, v) {
        const s = U.el('div', { class: 'stat' });
        s.appendChild(U.el('div', { class: 'k', text: k }));
        s.appendChild(U.el('div', { class: 'v', text: v }));
        statGrid.appendChild(s);
      }
      stat('Notes', U.fmt(chart.noteCount));
      stat('Max combo', U.fmt(chart.maxCombo));
      stat('Length', U.msToClock(chart.lengthMs));
      stat('Keys', chart.keys + 'K');
      stat('OD', chart.od.toFixed(1));
      if (O.get('showRatings')) stat('Rating', UI.fmtStars(chart.rating));

      const best = O.bestFor(spec.id, diffIndex, O.get('keys'));
      if (best) {
        bestRow.innerHTML = '';
        bestRow.appendChild(U.el('span', { text: 'Best: ' }));
        bestRow.appendChild(U.el('b', { text: UI.fmtScore(best.score) + ' · ' + UI.fmtAcc(best.acc) + ' · ' + best.grade }));
      } else {
        bestRow.textContent = 'No score yet — be the first.';
      }
    }

    function refreshChips() {
      keysChip.textContent = O.get('keys') + 'K';
      const mods = O.modsList();
      modsChip.textContent = mods.length ? mods.join(' ') : 'No mods';
      modsChip.classList.toggle('on', mods.length > 0);
    }

    function selectSong(i, silent) {
      if (i === songIndex && silent) return;
      songIndex = i;
      app.state.songId = S.LIST[i].id;
      const cards = list.children;
      for (let k = 0; k < cards.length; k++) cards[k].classList.toggle('active', k === i);
      const maxDiff = diffs().length - 1;
      if (diffIndex > maxDiff) diffIndex = maxDiff;
      buildDiffs();
      refreshSide();
      if (!silent) A.ui('move');
      scrollToActive();
      if (O.get('previewMusic')) startPreview();
    }

    function scrollToActive() {
      const card = list.children[songIndex];
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }

    function setDiff(i) {
      diffIndex = i;
      app.state.diffIndex = i;
      const rows = diffList.children;
      for (let k = 0; k < rows.length; k++) rows[k].classList.toggle('active', k === i);
      refreshSide();
      A.ui('move');
    }

    function stopPreview() {
      if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
      if (previewSong) { A.stopSong(); previewSong = null; }
      previewBtn.classList.remove('on');
      previewBtn.innerHTML = U.icon('music') + '<span>Preview</span>';
    }

    function startPreview() {
      stopPreview();
      if (!O.get('previewMusic')) return;
      previewTimer = setTimeout(function () {
        const built = S.preview(currentSpec(), 9);
        if (!A.isReady()) return;
        previewSong = A.playSong(built, { leadIn: 0.15, onEnd: function () { stopPreview(); } });
        previewBtn.innerHTML = U.icon('pause') + '<span>Stop</span>';
        previewBtn.classList.add('on');
      }, 420);
    }

    function play() {
      stopPreview();
      app.state.songId = currentSpec().id;
      app.state.diffIndex = diffIndex;
      A.ui('select');
      app.go('game');
    }

    function openMods() {
      const body = U.el('div', {});
      const schema = O.SCHEMA.filter(function (s) { return s.id === 'mods'; })[0];
      schema.items.forEach(function (item) {
        const row = U.el('div', { class: 'opt-row' });
        const lab = U.el('div', { class: 'opt-label' });
        lab.appendChild(U.el('div', { class: 'name', text: item.label }));
        if (item.hint) lab.appendChild(U.el('div', { class: 'hint', text: item.hint }));
        row.appendChild(lab);
        row.appendChild(UI.buildControl(item, {
          onChange: function () { refreshChips(); refreshSide(); buildDiffs(); buildList(); }
        }));
        body.appendChild(row);
      });
      UI.modal({
        title: 'Mods',
        subtitle: 'Quick modifiers for this session.',
        body: body,
        buttons: [{ label: 'Done', primary: true, onClick: function () { refreshChips(); refreshSide(); buildList(); } }]
      });
    }

    /* keyboard navigation */
    const keys = keyHandlers();
    const navHandler = function (e) {
      if (UI.activeModal && UI.activeModal.overlay && document.body.contains(UI.activeModal.overlay)) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = S.LIST.length;
        selectSong((songIndex + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = diffs().length;
        setDiff((diffIndex + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        play();
      } else if (e.key === 'm' || e.key === 'M') {
        openMods();
      }
    };

    root.draw = function (now) {
      const spec = currentSpec();
      R.drawIdle(now / 1000, { hue: hueOf(spec.color), visualiser: true });
    };

    root.onEnter = function () {
      window.addEventListener('keydown', navHandler);
      buildList();
      buildDiffs();
      refreshSide();
      refreshChips();
      scrollToActive();
      Input.setMode(O.get('keys'));
      if (O.get('previewMusic')) startPreview();
    };
    root.onExit = function () {
      window.removeEventListener('keydown', navHandler);
      stopPreview();
    };
    root.play = play;

    return root;
  };

  function hueOf(hex) {
    if (!hex || hex[0] !== '#') return 285;
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return Math.round(h * 360);
  }

  /* ============================================================
     OPTIONS
     ============================================================ */

  SC.options = function (app) {
    const root = U.el('div', { class: 'screen' });
    root.appendChild(U.el('div', { class: 'scrim' }));

    let activeTab = 'gameplay';
    const params = app.pendingParams || {};
    const from = params.from || 'title';

    const tabs = U.el('div', { class: 'opt-tabs' });
    const panel = U.el('div', { class: 'opt-panel' });
    const body = U.el('div', { class: 'options-body' });

    const searchWrap = U.el('div', { class: 'sel-wrap' });
    const search = U.el('input', { type: 'search', placeholder: 'Search settings…', 'aria-label': 'Search settings' });
    search.style.cssText = 'appearance:none;font-family:inherit;font-size:0.85em;color:var(--text);background:rgba(255,255,255,0.07);border:1px solid var(--line);border-radius:8px;padding:0.5em 0.9em;width:190px;';
    searchWrap.appendChild(search);

    root.appendChild(topbar({
      onBack: function () { A.ui('back'); app.go(from === 'game' ? 'pause' : from); },
      title: 'Options',
      right: [searchWrap]
    }));

    body.appendChild(tabs);
    body.appendChild(panel);
    root.appendChild(body);

    function renderTabs() {
      tabs.innerHTML = '';
      O.SCHEMA.forEach(function (sec) {
        const b = U.el('button', { class: 'opt-tab' + (sec.id === activeTab ? ' active' : ''), html: U.icon(sec.icon) + '<span>' + sec.title + '</span>' });
        b.addEventListener('click', function () { activeTab = sec.id; A.ui('move'); renderTabs(); renderPanel(); });
        tabs.appendChild(b);
      });
    }

    function renderPanel(filter) {
      panel.innerHTML = '';
      const sec = O.SCHEMA.filter(function (s) { return s.id === activeTab; })[0];
      if (!sec) return;
      panel.appendChild(U.el('h2', { text: sec.title }));

      const q = (filter || '').toLowerCase();
      const shown = [];
      const sectionsToShow = q ? O.SCHEMA : [sec];

      sectionsToShow.forEach(function (s) {
        const items = s.items.filter(function (it) {
          if (!q) return true;
          return (it.label + ' ' + (it.hint || '') + ' ' + s.title).toLowerCase().indexOf(q) >= 0;
        });
        if (!items.length) return;
        if (q) panel.appendChild(U.el('h3', { text: s.title, style: 'margin-top:0.6em;' }));
        items.forEach(function (item) {
          const row = U.el('div', { class: 'opt-row' });
          const lab = U.el('div', { class: 'opt-label' });
          lab.appendChild(U.el('div', { class: 'name', text: item.label }));
          if (item.hint) lab.appendChild(U.el('div', { class: 'hint', text: item.hint }));
          row.appendChild(lab);
          row.appendChild(UI.buildControl(item, {
            mode: O.get('keys'),
            difficultyOptions: difficultyOptions(),
            onChange: onOptionChanged
          }));
          panel.appendChild(row);
        });
      });
      if (!panel.children.length) panel.appendChild(U.el('p', { class: 'opt-desc', text: 'No settings match that search.' }));
    }

    function difficultyOptions() {
      const spec = S.byId(app.state.songId);
      const dl = B.difficulties(spec);
      return dl.map(function (d, i) { return { value: i, label: d.name + ' (' + (i + 1) + ')' }; });
    }

    function onOptionChanged(key, value) {
      if (key === 'keys') {
        Input.setMode(O.get('keys'));
        const cur = O.get('difficulty');
        const max = B.difficulties(S.byId(app.state.songId)).length - 1;
        if (cur > max) O.set('difficulty', max);
        renderPanel(search.value);
        return;
      }
      if (key === 'uiScale') {
        document.documentElement.style.setProperty('--ui-scale', O.get('uiScale'));
      }
      if (key === 'keybinds') Input.setMode(O.get('keys'));
      if (key === '*' || key === 'scores' || key === '') return;
      if (key === 'difficulty') { app.state.diffIndex = value; }
      renderPanel(search.value);
    }

    search.addEventListener('input', function () { renderPanel(search.value); });

    root.onEnter = function () {
      activeTab = params.tab || 'gameplay';
      renderTabs();
      renderPanel();
      Input.setMode(O.get('keys'));
    };

    root.draw = function (now) { R.drawIdle(now / 1000, { hue: 250, visualiser: true }); };
    return root;
  };

  /* ============================================================
     GAME
     ============================================================ */

  SC.game = function (app) {
    const root = U.el('div', { class: 'screen' });
    const hud = U.el('div', { class: 'hud' });
    root.appendChild(hud);

    const spec = S.byId(app.state.songId);
    const diffIndex = U.clamp(app.state.diffIndex || 0, 0, 4);
    const all = O.all();
    const eff = O.effective();
    const keys = all.keys;

    let chart = B.cached(spec, diffIndex, keys);
    let engine = null;
    let song = null;
    let paused = false;
    let ended = false;
    let fpsSmooth = 60;

    /* ---- HUD ---- */
    const top = U.el('div', { class: 'hud-top' });
    const left = U.el('div', { class: 'hud-left' });
    left.appendChild(U.el('div', { class: 'hud-song', text: spec.title }));
    const hudSub = U.el('div', { class: 'hud-sub', text: chart.difficulty.name + ' · ' + keys + 'K · ' + spec.bpm + ' BPM' });
    left.appendChild(hudSub);
    top.appendChild(left);

    const right = U.el('div', { class: 'hud-right' });
    const scoreBox = U.el('div', { class: 'score-box' });
    const scoreEl = U.el('div', { class: 'score', text: '0' });
    const accEl = U.el('div', { class: 'acc', text: '100.00%' });
    scoreBox.appendChild(scoreEl);
    scoreBox.appendChild(accEl);
    const pauseBtn = U.el('button', { class: 'btn icon ghost', html: U.icon('pause'), 'aria-label': 'Pause' });
    pauseBtn.addEventListener('click', function () { A.ui('select'); togglePause(true); });
    right.appendChild(scoreBox);
    right.appendChild(pauseBtn);
    top.appendChild(right);
    hud.appendChild(top);

    const mid = U.el('div', { class: 'hud-mid' });
    const judgeCounts = U.el('div', { class: 'judge-counts' });
    const jcEls = {};
    C.JUDGEMENTS.forEach(function (j) {
      const el = U.el('div', { class: 'jc' });
      el.appendChild(U.el('span', { text: j.short, style: 'color:' + j.color }));
      const v = U.el('span', { text: '0' });
      el.appendChild(v);
      jcEls[j.key] = v;
      judgeCounts.appendChild(el);
    });
    mid.appendChild(judgeCounts);
    if (all.judgeText) hud.appendChild(mid);

    const bottom = U.el('div', { class: 'hud-bottom' });
    const healthWrap = U.el('div', { class: 'health-wrap' });
    const healthBar = U.el('div', { class: 'health-bar' });
    healthWrap.appendChild(healthBar);
    bottom.appendChild(healthWrap);
    let progressWrap = null, progressBar = null;
    if (all.progressBar) {
      progressWrap = U.el('div', { class: 'progress-wrap' });
      progressBar = U.el('div', { class: 'progress-bar' });
      progressWrap.appendChild(progressBar);
      bottom.appendChild(progressWrap);
    }
    hud.appendChild(bottom);

    let fpsEl = null;
    if (all.showFps) { fpsEl = U.el('div', { class: 'fps', text: '60 fps' }); hud.appendChild(fpsEl); }

    /* ---- setup ---- */
    function build() {
      chart = B.cached(spec, diffIndex, keys);
      app.state.diffIndex = diffIndex;
      engine = Engine.create(chart, {
        effective: eff,
        offset: all.offset,
        scrollDir: all.scrollDir,
        mirror: all.mirror,
        random: all.random,
        hitsound: all.hitsound,
        hitsoundVolume: all.hitsoundVolume,
        particles: all.particles
      });
      engine.onEnd = finish;
      R.resize({ keys: keys, laneWidth: all.laneWidth, dir: all.scrollDir, noteScale: all.noteScale });
      Input.setGeometry(R.geometry());
      Input.setMode(keys);
      hudSub.textContent = chart.difficulty.name + ' · ' + keys + 'K · ' + spec.bpm + ' BPM' + (O.modsList().length ? ' · ' + O.modsList().join(' ') : '');
    }

    function startRun() {
      ended = false;
      paused = false;
      build();
      R.resize({ keys: keys, laneWidth: all.laneWidth, dir: all.scrollDir, noteScale: all.noteScale });
      const music = chart.music;
      song = A.playSong({ events: music.events, lengthMs: Math.max(chart.lengthMs, music.lengthMs) }, {
        leadIn: 1.6,
        onEnd: function () { /* engine decides the end */ }
      });
      engine.start(false);
    }

    function finish(success) {
      if (ended) return;
      ended = true;
      if (song) { song.stop(); song = null; }
      Input.releaseAll();
      A.stopSong();
      const result = {
        songId: spec.id,
        songTitle: spec.title,
        difficulty: chart.difficulty.name,
        diffIndex: diffIndex,
        keys: keys,
        score: engine.score,
        acc: engine.accuracy,
        grade: C.GRADE(engine.accuracy, !success),
        counts: Object.assign({}, engine.counts),
        maxCombo: engine.maxCombo,
        totalNotes: chart.noteCount,
        mods: O.modsList(),
        nps: chart.nps,
        rating: chart.rating,
        failed: !success,
        date: Date.now()
      };
      const prevBest = O.bestFor(spec.id, diffIndex, keys);
      result.isBest = !prevBest || result.score > prevBest.score;
      if (result.score > 0) O.addScore(result);
      app.state.lastResult = result;
      app.go('results');
    }

    function togglePause(force) {
      if (ended) return;
      if (paused && force) return;
      paused = true;
      engine.pause();
      Input.releaseAll();
      if (song) song.pause();
      app.go('pause');
    }

    /* ---- input ---- */
    /* Keyboard clicks are a separate layer from the note hitsound: they fire
       on every physical lane press/release, so the player hears their keys
       even when a tap misses every note. */
    Input.onDown(function (lane) {
      if (all.keyClickEnabled) A.keyDown();
      if (paused || ended || !engine) return;
      engine.press(lane);
    });
    Input.onUp(function (lane) {
      if (all.keyClickEnabled) A.keyUp();
      if (paused || ended || !engine) return;
      engine.release(lane);
    });

    const keys2 = keyHandlers();
    keys2.add(function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!paused && !ended) togglePause(true);
      }
    });

    /* ---- loop hooks ---- */
    root.update = function (now, dt) {
      if (!engine) return;
      engine.update(now);
      if (dt > 0) fpsSmooth = fpsSmooth * 0.92 + (1 / dt) * 0.08;
    };

    root.draw = function (now) {
      if (!engine) { R.clear(); return; }
      R.drawGame(engine, {
        hue: hueOf(spec.color),
        visualiser: all.bgAnimation,
        bgDim: all.bgDim,
        laneSkin: all.laneSkin,
        noteStyle: all.noteStyle,
        judgeScale: all.judgeScale,
        judgeText: all.judgeText,
        particles: all.particles,
        comboCounter: all.comboCounter
      });

      scoreEl.textContent = UI.fmtScore(engine.score);
      accEl.textContent = UI.fmtAcc(engine.accuracy);
      for (const k in jcEls) jcEls[k].textContent = String(engine.counts[k] || 0);
      const hp = U.clamp(engine.health, 0, 1);
      healthBar.style.width = (hp * 100) + '%';
      healthBar.classList.toggle('low', hp < 0.25);
      if (progressBar) progressBar.style.width = (engine.progress() * 100) + '%';
      if (fpsEl) fpsEl.textContent = Math.round(fpsSmooth) + ' fps';
    };

    root.onEnter = function (params) {
      Input.attach(document.getElementById('app'));
      Input.listen();
      R.resize({ keys: keys, laneWidth: all.laneWidth, dir: all.scrollDir, noteScale: all.noteScale });
      Input.setGeometry(R.geometry());
      Input.setMode(keys);
      Input.releaseAll();
      startRun();
    };

    root.onExit = function () {
      keys2.remove();
      Input.stop();
      if (song) { song.stop(); song = null; }
      A.stopSong();
      Input.clearHandlers();
    };

    root.isLive = function () {
      return !!engine && !ended && engine.state !== 'finished' && engine.state !== 'failed';
    };

    root.onResume = function () {
      if (!engine) return;
      paused = false;
      if (song) song.resume();
      engine.resume();
      Input.releaseAll();
    };

    root.pauseForBlur = function () { togglePause(true); };

    root.retry = function () {
      Input.releaseAll();
      if (song) { song.stop(); song = null; }
      A.stopSong();
      startRun();
    };

    root.resize = function () {
      R.resize({ keys: keys, laneWidth: all.laneWidth, dir: all.scrollDir, noteScale: all.noteScale });
      Input.setGeometry(R.geometry());
    };

    root.engine = function () { return engine; };
    root.chart = function () { return chart; };

    return root;
  };

  /* ============================================================
     PAUSE
     ============================================================ */

  SC.pause = function (app) {
    const root = U.el('div', { class: 'overlay' });
    const modal = U.el('div', { class: 'modal', style: 'width:min(380px,90vw)' });
    modal.appendChild(U.el('div', { class: 'pause-title', text: 'Paused' }));

    const menu = U.el('div', { class: 'pause-menu' });
    function mk(label, icon, fn, cls) {
      const b = U.el('button', { class: 'btn' + (cls ? ' ' + cls : ''), html: U.icon(icon) + '<span>' + label + '</span>' });
      b.addEventListener('click', function () { A.ui('select'); fn(); });
      menu.appendChild(b);
      return b;
    }

    mk('Resume', 'play', function () {
      app.go('game');
    }, 'primary');

    mk('Retry', 'refresh', function () {
      const game = app.screenByName('game');
      app.go('game');
      if (game && game.retry) game.retry();
    });

    mk('Options', 'gear', function () {
      app.go('options', { from: 'game', tab: 'gameplay' });
    });

    mk('Song select', 'chart', function () {
      A.stopSong();
      app.go('select');
    });

    mk('Quit to title', 'close', function () {
      function quit() { A.stopSong(); app.go('title'); }
      if (O.get('confirmExit')) UI.confirm('Quit?', 'Your current run will be lost.', quit, { danger: true, yesLabel: 'Quit' });
      else quit();
    }, 'danger');

    modal.appendChild(menu);
    modal.appendChild(U.el('p', { class: 'sub', style: 'text-align:center;margin-top:1em;margin-bottom:0', text: 'Press Esc to resume' }));
    root.appendChild(modal);

    const keys = keyHandlers();
    keys.add(function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        app.go('game');
      }
    });

    root.onEnter = function () {
      if (UI.activeModal && UI.activeModal.overlay && !document.body.contains(UI.activeModal.overlay)) UI.activeModal = null;
    };
    root.onExit = function () { keys.remove(); };

    root.draw = function () {
      const game = app.screenByName('game');
      if (game && game.draw) game.draw(performance.now());
    };

    return root;
  };

  /* ============================================================
     RESULTS
     ============================================================ */

  SC.results = function (app) {
    const res = app.state.lastResult || {};
    const root = U.el('div', { class: 'screen results-screen' });
    root.appendChild(U.el('div', { class: 'scrim' }));

    const card = U.el('div', { class: 'results-card' });

    const gradeColors = { SS: '#ffd43b', S: '#ffd43b', A: '#69db7c', B: '#4dabf7', C: '#b197fc', D: '#ffa94d', F: '#ff6b81' };
    const head = U.el('div', { class: 'results-head' });
    const grade = U.el('div', { class: 'grade', text: res.grade || 'F' });
    grade.style.setProperty('--grade-color', gradeColors[res.grade] || '#b197fc');
    head.appendChild(grade);
    const rtitle = U.el('div', { class: 'results-title' });
    rtitle.appendChild(U.el('h2', { text: res.songTitle || 'Unknown' }));
    rtitle.appendChild(U.el('p', { text: (res.difficulty || '') + ' · ' + (res.keys || 4) + 'K · ' + (res.failed ? 'Failed' : 'Cleared') }));
    if (res.mods && res.mods.length) {
      const m = U.el('div', { class: 'mods' });
      res.mods.forEach(function (mod) { m.appendChild(U.el('div', { class: 'chip mod', text: mod })); });
      rtitle.appendChild(m);
    }
    head.appendChild(rtitle);
    card.appendChild(head);

    card.appendChild(U.el('div', { class: 'results-score', text: UI.fmtScore(res.score) }));
    card.appendChild(U.el('div', { class: 'results-score-label', text: 'score' }));

    const jt = U.el('div', { class: 'judge-table' });
    C.JUDGEMENTS.forEach(function (j) {
      const cell = U.el('div', { class: 'judge-cell' });
      cell.appendChild(U.el('div', { class: 'jk', text: j.short, style: 'color:' + j.color }));
      cell.appendChild(U.el('div', { class: 'jv', text: U.fmt((res.counts && res.counts[j.key]) || 0) }));
      jt.appendChild(cell);
    });
    card.appendChild(jt);

    const st = U.el('div', { class: 'results-stats' });
    function stat(k, v) {
      const s = U.el('div', { class: 'stat' });
      s.appendChild(U.el('div', { class: 'k', text: k }));
      s.appendChild(U.el('div', { class: 'v', text: v }));
      st.appendChild(s);
    }
    stat('Accuracy', UI.fmtAcc(res.acc));
    stat('Max combo', U.fmt(res.maxCombo || 0) + ' / ' + U.fmt(res.totalNotes || 0));
    stat('Notes hit', U.fmt((res.counts ? (res.totalNotes - (res.counts.miss || 0)) : 0)));
    stat('Rating', UI.fmtStars(res.rating));
    card.appendChild(st);

    if (res.isBest) {
      card.appendChild(U.el('div', { class: 'best-row', html: '<span class="up">★ New personal best!</span>' }));
    }

    const actions = U.el('div', { class: 'results-actions' });
    function btn(label, icon, fn, cls) {
      const b = U.el('button', { class: 'btn' + (cls ? ' ' + cls : ''), html: U.icon(icon) + '<span>' + label + '</span>' });
      b.addEventListener('click', function () { A.ui('select'); fn(); });
      actions.appendChild(b);
      return b;
    }
    btn('Retry', 'refresh', function () {
      const game = app.screenByName('game');
      app.go('game');
      if (game && game.retry) game.retry();
    }, 'primary');
    btn('Song select', 'chart', function () { app.go('select'); });
    btn('Options', 'gear', function () { app.go('options', { from: 'results', tab: 'gameplay' }); });
    card.appendChild(actions);

    root.appendChild(card);

    root.draw = function (now) {
      const spec = S.byId(res.songId);
      R.drawIdle(now / 1000, { hue: hueOf(spec.color), visualiser: true });
    };

    const keys = keyHandlers();
    keys.add(function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const game = app.screenByName('game');
        app.go('game');
        if (game && game.retry) game.retry();
      } else if (e.key === 'Escape') {
        app.go('select');
      }
    });
    root.onExit = function () { keys.remove(); };

    return root;
  };

  window.Mania = window.Mania || {};
  window.Mania.Screens = SC;
})();
