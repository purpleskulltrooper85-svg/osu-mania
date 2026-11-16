# AGENTS.md — mania! (osu!mania prototype)

## What this is

A dependency-free browser prototype of **osu!mania** (vertical-scrolling rhythm game, 4K–7K).

It is a **single self-contained file**: `index.html` holds the markup, a compiled Tailwind
`<style>` block, and the entire game script inline. The two audio samples are embedded as base64
`data:audio/mpeg` URIs, so there are no external assets and no build step to run the game.

## Running it

Just open `index.html` in a browser — no server needed (everything is inline). To serve it:

```
python3 -m http.server 12000     # then open http://localhost:12000
```

## Layout

- `index.html` — the whole game (markup + inlined CSS + inlined script + inlined audio).
- `README.md` — player-facing description.

There is **no** `js/`, `css/` or `tests/` tree: the modular build was removed in favour of the
single file.

## Conventions

- One big IIFE `(function () { 'use strict'; ... })();` holds the game script.
- Tuning constants live together near the top of the script (timing windows, judgements, defaults).
- Comments explain *why*, not *what*. Keep them sparse.
- The compiled Tailwind CSS is inlined in the first `<style>` block. **If you add new Tailwind
  classes to the markup you must regenerate it** or the classes silently do nothing:
  `npx tailwindcss@3.4.17 -i input.css -o out.css --content ./index.html --minify`, then paste
  `out.css` between the first `<style>...</style>` pair. Custom (non-Tailwind) rules live in the
  second `<style>` block.

## Architecture invariants (easy to break)

- **Audio cannot start before a user gesture.** `Audio.init()`/`unlockAudio` run on the first
  pointer/key event; before that the AudioContext is suspended and every sound is a no-op. Never
  assume audio is ready.
- **Two distinct sound categories** — keep them separate:
  1. **Hitsound** (`playHit`) — for **notes only**. `handleLaneDown` calls `playHit()` *after* a
     candidate note is found, so an empty tap makes no hitsound. Styles: `pop` | `soft` | `tick` |
     `keyboard`; `keyboard` plays the inlined creamy-keyboard sample. There is **no** release
     sound — exactly one click per hit.
  2. **UI click** (`playUI`) — a short blip for menu buttons, tabs, song selection, launch. Never
     reuse `playHit` for a button.
- **The creamy-keyboard sample opens with ~115ms of silence.** Its click transient is at
  `CLICK_OFFSET` (0.115s); play from there for `CLICK_TAIL` (0.030s) and fade only the final 12ms.
  Cutting from offset 0 plays silence — this regressed once and made the hitsound inaudible.
- **Inlined audio**: `ASSETS.keyClick` and `ASSETS.menuMusic` are base64 `data:audio/mpeg` URIs,
  decoded by `SoundEngine._loadSamples()` via `fetch(dataURI)` + `decodeAudioData`. Never reference
  the raw `.mp3` files — that would break the "one file, no assets" rule. The base64 blob is
  ~3.7 MB, so it dominates the file and makes `grep` noisy; exclude it when searching
  (e.g. `grep -v base64`).
- **Menu music** (BossaBossa) loops on the song-select screen and stops elsewhere. `setMenuMusicVolume`
  ramps the live gain; `_pendingMenuMusic` defers the start until the sample finishes decoding.
- **Canvas sizing is DPR-aware**; read geometry from the layout helper rather than assuming CSS
  pixels.
- **Note heads always span the lane width** — in mania the note style only changes corner rounding.
  Never branch the note geometry on the style.
- **Long notes** are judged on release *and* on reaching the tail; dropping one early counts as a
  miss.

## Testing

There is no test harness in this repo. Verify changes by:

- Parsing the inline script: extract `<script>` bodies and `new Function(...)` each (Node).
- Driving the real page headless (Chromium via CDP): click through the UI and assert state.
  Audio can't be heard headless, so instrument `AudioContext.prototype.createBufferSource` and
  record each `start(when, offset, duration)` call to confirm which sound fired and how long it is.
- Rendering a click offline with `OfflineAudioContext` and measuring peak/RMS to prove it is
  audible (not just "code ran").

## Gotchas discovered

- JS `.click()` bypasses hit-testing, so it happily "passes" on a covered or off-screen button.
  Smoke-test navigation with real input events and check `document.elementFromPoint`.
- The song wheel updates cards **in place** (class/margin toggles) rather than rebuilding
  `innerHTML`, so the CSS spring transitions animate. Rebuilding snaps instead of gliding.
- `document.hidden` is guarded with `typeof document !== 'undefined'` where the scheduler touches it.
