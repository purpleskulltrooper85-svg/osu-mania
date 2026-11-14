# mania!

A browser prototype of **osu!mania** — a vertical-scrolling rhythm game with 4, 5, 6 and 7 key modes.

Everything is generated at runtime. The music is synthesised live with the Web Audio API and the
beatmaps are generated from the music's own event grid, so there are **no audio files, no images and
no dependencies**. Open `index.html` and play.

```
python3 -m http.server 12000     # then open http://localhost:12000
```

A static server is only needed so the browser will load the ES-free `<script>` modules; the game
itself is plain HTML, CSS and canvas.

## Controls

| Action | Key |
| --- | --- |
| Play a note | `D` `F` `J` `K` (4K default) |
| 5K / 6K / 7K | extra keys are added inward — see **Options → Input** |
| Pause | `Esc` |
| Menu navigation | arrow keys / `Enter` / `Esc` |
| Touch | tap the lanes directly |

Keys are fully rebindable in **Options → Input**; click a key chip and press the key you want.

## Features

- **Four key modes** (4K–7K) with per-mode keybinds.
- **Five songs**, each with five difficulties (Beginner → Lunatic) — 100 charts in total.
- **Long notes** (hold notes) with head/tail judgement and partial-hold scoring.
- **Mods**: No Fail, Auto play, Hidden, Mirror, Random, Hard Rock, Half Time, Double Time.
- **Full options menu**: Gameplay, Mods, Input, Visuals, Audio, Interface, About — 41 settings,
  live search, and persistence to `localStorage`.
- **Scoring**: osu!-style weighted accuracy, 1,000,000 max score, SS–F grades, combo, health drain.
- **Results screen** with per-judgement breakdown, max combo and new-personal-best detection.
- **Responsive** from 320px phones to ultrawide, with device-pixel-ratio aware canvas rendering and
  a rotate hint for narrow portrait screens.
- **Accessibility / quality of life**: auto-pause when the tab loses focus, FPS counter,
  adjustable note speed, scroll direction, background dim, particles and more.

## Architecture

The code is a set of small, single-purpose modules that communicate through the `window.Mania`
namespace. Load order is defined in `index.html`.

| Module | Responsibility |
| --- | --- |
| `js/utils.js` | DOM helpers, math/clamp, formatting, seeded RNG |
| `js/config.js` | Tuning constants: key layouts, judgements, timing windows, star rating |
| `js/audio.js` | Web Audio synth engine, instrument voices, lookahead scheduler, analyser |
| `js/songs.js` | Procedural song generation (melody, bass, pads, drums) |
| `js/beatmap.js` | Chart generation from song events, difficulty thinning, LRU cache |
| `js/options.js` | Settings schema, defaults, validation, persistence, effective mods |
| `js/input.js` | Unified keyboard / pointer / touch input mapped to lanes |
| `js/engine.js` | Timing, note state, judgement, scoring, health, long notes, autoplay |
| `js/renderer.js` | Canvas playfield: lanes, notes, receptors, effects, background |
| `js/ui.js` | Toasts, modals, option controls, formatting |
| `js/screens.js` | Screen builders: title, select, options, game, pause, results |
| `js/main.js` | App controller: screen lifecycle, render loop, resize, boot |

### How the music and charts stay in sync

`songs.js` generates a deterministic list of timestamped instrument events for each song.
`beatmap.js` reads that same event list and turns musically important events (kicks, snares, leads)
into notes, which guarantees the chart lines up with what you hear. The engine drives its clock from
the audio context (`Audio.songTime()`), so visuals stay locked to playback rather than to wall time.

## Tests

The engine, audio scheduler and chart generator are pure enough to test in Node with a small DOM
stub:

```
node tests/logic.test.js        # song + beatmap generation
node tests/difficulty.test.js   # difficulty progression across songs
node tests/audio.test.js        # synth scheduling with a mock AudioContext
node tests/engine.test.js       # judgement, scoring, long notes, health, autoplay
node tests/cache.test.js        # mods must not corrupt the shared chart cache
```

## Notes

This is a prototype, not a clone of osu!. It implements the feel and structure of osu!mania
(judgements, scoring, long notes, mods, options) with original synthesised content.
