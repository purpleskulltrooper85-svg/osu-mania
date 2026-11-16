# mania!

A browser prototype of **osu!mania** — a vertical-scrolling rhythm game with 4, 5, 6 and 7 key modes.

Everything is generated at runtime. The music is synthesised live with the Web Audio API and the
beatmaps are generated from the music's own event grid, so there are **no audio files, no images and
no dependencies**. Open `index.html` and play — it is a single self-contained file.

## Play it

**https://purpleskulltrooper85-svg.github.io/osu-mania/** — no install, works on desktop and mobile.

To run it locally, just open `index.html` in a browser. No server is required.

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
- **Songs**, each with several difficulties — all charts generated from the music's event grid.
- **Long notes** (hold notes) with head/tail judgement and partial-hold scoring.
- **Mods**: No Fail, Auto play, Hidden, Mirror, Random, Hard Rock, Half Time, Double Time.
- **Full options menu**: Gameplay, Mods, Input, Visuals, Audio, Interface, About — live search and
  persistence to `localStorage`.
- **Hitsounds**: Pop, Soft, Tick and Keyboard (the creamy-keyboard sample), one click per hit.
- **Scoring**: osu!-style weighted accuracy, 1,000,000 max score, SS–F grades, combo, health drain.
- **Results screen** with per-judgement breakdown, max combo and new-personal-best detection.
- **Responsive** from 320px phones to ultrawide, with device-pixel-ratio aware canvas rendering and
  a rotate hint for narrow portrait screens.
- **Accessibility / quality of life**: auto-pause when the tab loses focus, FPS counter,
  adjustable note speed, scroll direction, background dim, particles and more.

## Notes

This is a prototype, not a clone of osu!. It implements the feel and structure of osu!mania
(judgements, scoring, long notes, mods, options) with original synthesised content.

The whole game lives in `index.html`: markup, a compiled Tailwind `<style>` block and the script are
all inline, and the two audio samples are embedded as base64 `data:` URIs. Editing the markup means
regenerating the inlined Tailwind CSS:

```
npx tailwindcss@3.4.17 -i input.css -o out.css --content ./index.html --minify
```

then paste `out.css` between the first `<style>...</style>` pair.
