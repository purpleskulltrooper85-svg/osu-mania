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
