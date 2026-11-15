# AGENTS.md — mania!

Repository-specific knowledge for future agent sessions.

## What this is

A dependency-free browser prototype of **osu!mania** (vertical-scrolling rhythm game, 4K–7K).
Plain HTML + CSS + canvas + Web Audio. No build step, no npm packages, no external assets.
All music is synthesised at runtime and all charts are generated from that music.

## Running it

```bash
python3 -m http.server 12000     # serve from the repo root
```

Open `http://localhost:12000`. A static server is required (the app uses classic
`<script src>` tags, which `file://` blocks for module-adjacent reasons and for
`fetch`-free but still origin-sensitive APIs).

## Layout

- `index.html` — defines the script load order. **Adding a module means adding a `<script>` tag here.**
- `css/style.css` — one stylesheet, CSS custom properties for theming, responsive via
  media queries and `clamp()`.
- `js/*.js` — 12 IIFE modules attached to the `window.Mania` namespace.
- `tests/*.test.js` — Node test suites (see below).

## Conventions

- Every JS file is an IIFE: `(function () { 'use strict'; ... })();`
- Modules read their dependencies from `window.Mania.X` at the top of the IIFE.
- Cross-module wiring happens through the `window.Mania` namespace, never through globals.
- DOM helpers live in `js/utils.js` (`U.el`, `U.icon`, `U.fmt`, `U.clamp`, `U.rng`, ...).
- Tuning constants live in `js/config.js` — prefer editing `Config` over hard-coding numbers.
- Comments explain *why*, not *what*. Keep them sparse.

## Architecture invariants (easy to break)

- **The render loop lives in `main.js`.** It calls `screen.draw(now)` on the current screen.
  The pause screen re-draws the game behind it via `app.screenByName('game').draw(...)`.
- **Pause is an overlay, not a screen swap.** `app.go('pause')` stacks an overlay and keeps the
  live `gameScreen`. `app.go('game')` resumes it if `gameScreen.isLive()`.
- **Screens read construction params from `app.pendingParams`** (set by `app.go`), because
  `SC[name](app)` runs *before* `screen.onEnter(params)`. Don't read params only in `onEnter`.
- **`ENDS_RUN`** in `main.js` lists screens that end the current run (`title`, `select`, `results`).
- **Charts are cached and shared** (`Beatmap.cached`). The engine **clones** the note list before
  applying Mirror/Random, so mods never mutate the cache. Keep it that way.
- **The engine clock comes from audio** when a song is playing (`Audio.songTime()`); otherwise it
  falls back to `performance.now()`. Tests drive it manually via `engine.start(true)` + `engine.update(now)`.
- **`Audio.hit()` and `Audio.ui()` are no-ops before `Audio.ensure()` resolves** (first user gesture
  unlocks the AudioContext). Never assume audio is ready.

## Testing

All suites run under plain Node with a small DOM/`performance`/`AudioContext` stub at the top of
each file:

```bash
node tests/logic.test.js        # song + beatmap generation
node tests/difficulty.test.js   # difficulty progression
node tests/audio.test.js        # synth scheduling against a mock AudioContext
node tests/engine.test.js       # judgement, scoring, long notes, health, autoplay
node tests/cache.test.js        # mods must not corrupt the shared chart cache
```

Browser-level checks were done with headless Chromium over the Chrome DevTools Protocol
(`--headless=new --remote-debugging-port=...`) driving `Runtime.evaluate` and
`Input.dispatchKeyEvent`. This is the reliable way to smoke-test the UI here because the audio
context cannot start in headless mode — verify audio through `tests/audio.test.js` instead.

## Gotchas discovered

- `document.hidden` must be guarded with `typeof document !== 'undefined'` in any code path the
  Node tests touch (the audio scheduler does this).
- A manual `song.stop()` must clear the module-level `session` reference or `Audio.currentSong()`
  keeps returning a dead session.
- Long notes are judged on release *and* on reaching the tail (`updateHoldNotes`); dropping one
  early must count as a miss.
- Canvas sizing is DPR-aware; always read geometry from `Renderer.geometry()` rather than assuming
  CSS pixels.
- `.scrim` carries `backdrop-filter`, so it paints in the positioned layer. Without `z-index: -1`
  and `pointer-events: none` it covers the static menu buttons, blurring them and eating clicks.
  Each `.screen` also sets `isolation: isolate` so that negative z-index cannot escape behind the
  canvas.
- JS `.click()` bypasses hit-testing, so it will happily "pass" on a button that is actually
  covered or off-screen. Smoke-test navigation with real input events
  (`Input.dispatchMouseEvent`) and assert `document.elementFromPoint` resolves to the target
  button. This is what caught both the scrim overlay and the below-the-fold Play button.
- On song select the info panels scroll inside `.select-side-scroll` while `.select-actions` stays
  pinned; on mobile the list caps at `max-height: 42%` so the action bar is always reachable.
- `app.go('pause')` stacks an overlay over the live game. Any screen shown *from* pause (Options)
  replaces the pause overlay, so the pause branch must detach the previous screen and re-attach the
  live game screen. Otherwise the stale menu stays in `#screen-root` underneath and "menus just
  stay there". `#rotate-hint` also carries class `overlay`, so never count overlays by class alone.
- Long notes: a key already held when the head enters the window is latched by `latchHeld`, and the
  head is judged when it reaches the line (not on the first key event). This is what makes an early
  press score MAX instead of dropping the note. `laneDown` tracks physical key state separately
  from `holdNote`.
- osu!mania visuals: lane colours are white outer / blue inner / yellow centre
  (`C.KEY_MODES[*].colors`, mirrored by `Renderer.maniaLaneColor` for skins); notes are
  rounded-square heads with a white border, long notes are a capsule body plus a tail cap; receptors
  are outlined lane-wide bars that fill and glow when pressed. Default scroll is **down**.
- Note heads must ALWAYS span the lane width — in mania the style only changes corner rounding.
  An earlier `circle` style drew a literal `arc()` with diameter = note height, which showed a tiny
  dot floating in a wide lane. `drawNoteShape` now always fills `roundRect(laneW, noteH)` and picks
  the radius via `cornerRadius(style, w, h)`. Never branch the note geometry on the style.
- Note height is `laneW * C.NOTE.heightRatio * noteScale`, where `noteScale` is the user-facing
  "Note size" option threaded through every `R.resize({...})` call. If you add a new resize call,
  pass `noteScale` too or the slider silently stops working.
- `index.html` links every script with a `?v=N` query string. GitHub Pages caches for ~10 minutes;
  without the stamp a fresh push looks unchanged in a browser that already loaded the old files.
  Bump `N` whenever you want to be sure clients pick up new JS.
- `osu_mania_4k_minimalist_rhythm_game.html` is a **single-file** variant of the game (all markup,
  CSS and JS inline) that someone drops in from outside. It does NOT use `index.html`/`js/`. It
  must stay self-contained: never depend on a runtime CDN. It once loaded
  `<script src="https://cdn.tailwindcss.com">`, and when that request failed (offline, adblocker,
  proxy) every utility class was missing, so the whole UI collapsed to `position:static` and the
  page showed only plain text. The fix is a compiled Tailwind (v3.4.17) `<style>` block inlined in
  `<head>`. If you edit the markup, regenerate that CSS (see below) or new classes will silently
  do nothing.
  - Regenerate: `npx tailwindcss@3.4.17 -i input.css -o out.css --content ./osu_mania_4k_minimalist_rhythm_game.html --minify`,
    then paste `out.css` between the first `<style>...</style>` pair. Verify by blocking
    `*cdn.tailwindcss.com*` in DevTools: the layout must not change.
- Verify a "looks broken / only text" report by diffing a CDN-blocked render against a CDN-allowed
  one — identical pixels means the inlined CSS is complete and the real problem is elsewhere.

## Single-file variant: song-select UX (recent work)

- The song wheel must **update cards in place**, not rebuild `innerHTML` on every selection. The
  list is rebuilt only when the visible set changes (filter / sort / search / first paint), keyed by
  a `dataset.sig` signature of the song ids. Selection changes just toggle `is-selected` / `is-near`
  classes and `margin-left`, which is what lets the CSS spring transitions animate. If you go back
  to rebuilding on each render, the selection snaps instead of gliding.
- Card styling (bg / border / shadow / opacity / stagger) lives in the in-place pass, not the class
  string, so both code paths agree. `is-selected` / `is-near` and the `.song-card` transition are
  defined in the custom `<style>` block (the second one), not in the compiled Tailwind block.
- Mouse proximity selection lives in the mousemove handler (`updateProximity`): it finds the nearest
  card within `PROXIMITY_PX` (52px), constrained to the wheel's column via the carousel's
  `getBoundingClientRect`. It's rAF-throttled and uses `selectSong(id, true)` (no hitsound) so
  hovering does not machine-gun the click. `nearSongId` tracks the highlighted card.
- `selectSong(id, fromPointer)` is the single entry point for changing `config.selectedSongId`;
  pointer, keyboard and random all route through it.
- The animated menu background is `#menuBgCanvas`, drawn at the end of the main `render()` loop only
  while `state.status === 'SONG_SELECT'`. It must stay transparent — the global `canvas {}` rule sets
  `background-color:#000`, so `#menuBgCanvas` overrides it to `transparent`. Circle positions come
  from `seedMenuCircles()` (seeded `mulberry32`, so the layout is stable across reloads) plus a
  time-based drift and a pointer parallax that reuses `lastProxX/lastProxY`.
- The options modal is tabbed (Gameplay / Input / Skin / Audio). `switchSettingsTab()` toggles the
  `.settings-panel` elements and restyles the `.settings-tab-btn`s. All control ids are unchanged
  from the pre-tab layout, so the existing bindings keep working. `openSettingsModal` re-applies the
  active tab so the modal reopens where the user left off.
- `config.noteScale` (default 1.15, range 0.85–1.5) scales note/receptor size and also widens the
  playfield in `getLayout()`; there is a "Note Size" slider in the Gameplay tab.
- Mechanical keyboard clicks are separate from hitsounds: `config.keyClickEnabled` +
  `config.keyClickVolume`, played by `sound.playKeyDown()` / `sound.playKeyUp()` from
  `handleLaneDown` / `handleLaneUp` (which run even outside `PLAYING` so the menu/song-select
  keystrokes click too). The buffers are synthesised in the audio engine alongside pop/soft/tick.
- Headless UI checks: `Network.setBlockedURLs {urls:['*cdn.tailwindcss.com*']}` proves the inlined
  CSS is complete. Audio cannot start in headless, so instrument `AudioContext.prototype.createBufferSource`
  and count `start()` calls to verify hitsounds / key clicks fire (with the toggle off and hitsound
  muted, expect zero sources).
