# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install dependencies (required before dev/build; predev/prebuild need node_modules)
npm run dev            # Vite dev server on http://localhost:5173 (main game at /, debug page at /debug/)
npm run build          # runs `tsc --noEmit` then `vite build` into dist/
npm run preview        # serve dist/ locally
```

- There is no test suite and no linter configured. Type-checking (`npm run build`, which runs `tsc --noEmit` with `strict`, `noUnusedLocals`, `noUnusedParameters`) is the only automated check.
- `predev` and `prebuild` run `scripts/copy-mediapipe-wasm.mjs`, which copies MediaPipe WASM into `public/wasm` (gitignored). If you run Vite directly instead of through npm, that directory will be missing and tracking will fail to load.
- The webcam only works on `localhost` or HTTPS. Manual testing requires a real camera and a browser with WebGL.

## Architecture

The app is a fully client-side Vite + TypeScript site with no backend. Three.js renders the museum, and MediaPipe Tasks Vision (face, pose, hands) reads the webcam. Two HTML entry points exist: `index.html` (the game) and `debug/index.html` (live tracking diagnostics); both are declared in `vite.config.ts` `rollupOptions.input`.

The main data flow for each video frame runs through `src/game/juego.ts` (`iniciarJuego`), which is the composition root:

1. `tracking/tracker.ts` runs the three MediaPipe detectors on the `<video>` and returns a `TrackingFrame` (face, pose, hands).
2. `tracking/` modules turn raw landmarks into signals: `metrics.ts` (head roll, knee-based step counter `LegAlternationCounter`, pinch/palm ratios), `gestures.ts` (clap detection, pinch, hand tilt, steering; pure functions that take and return their own state), `framing.ts` (knees must be visible before play starts).
3. `game/` holds the gameplay state machines: `calibracion.ts` (head-roll neutral, persisted in localStorage), `caminata.ts` (walking speed proportional to step cadence), `cursor.ts` (pointing cursor smoothing), `museo.ts` (museum state: selecting a showcase, the mentor's explanation, entering a mission), and `opciones.ts` (user settings, persisted).
4. `visual/museo.ts` is the Three.js scene. It owns the museum room, showcases, mentor, halo, and the Luna and Mars mission scenes. `game/museo.ts` deliberately imports nothing from Three.js and only talks to `visual.museo`; keep that separation.
5. `audio/voz.ts` wraps the Web Speech API behind a small `hablar`/`cancelar` interface so recorded audio can replace it later. The mentor speaks one sentence at a time, and the next sentence starts from `onend`, with a timer fallback when no voice is available.

Per-frame flow: `juego.ts` loop → tracker → `procesarFotograma` → gesture/metric functions → `Museo.actualizar` (gaze/pointing, selection, entry) → `visual.museo` (render). `Museo` emits `EventoMuseo` events that `juego.ts` turns into voice, subtitles, and UI prompts.

### Where things are defined

- Model placeholders and their node names live in `src/visual/config.ts` (`MODELOS`, `ESCENAS`). Swapping a placeholder for a real `.glb` changes only `ruta` and `escala`, and `src/visual/MODELS.md` documents the conventions. Node names must stay stable.
- Showcase positions are hard-coded in `src/visual/museo.ts` (`POSICION_VITRINA`), not in config.
- Tunable thresholds are exported constants at the top of each tracking/game module (e.g. `APLAUSO_*` in `gestures.ts`, `SEGUNDOS_SENALAR` and `DURACION_FUNDIDO_S` in `game/museo.ts`). Options exposed in the menu are defined in `game/opciones.ts`.
- All user-facing text is in `src/i18n/es.json`, accessed through `t()`. Only Spanish exists so far, even though SPEC.md mentions `en.json`.

## Project documents

- `SPEC.md` (in Spanish) is the authoritative product spec. It defines the gesture mapping, the flow of a museum artifact, the historical-accuracy rules, and the implementation checklist (section 14). Check it before changing gesture behavior or game flow, and update its checklist when a feature becomes done.
- `README.md` (in Spanish) covers deployment. Hosting needs a static host with HTTPS. If the site moves to a subpath, change `base` in `vite.config.ts` as well.

## Conventions specific to this repo

- The project is written in Spanish: UI strings, comments, specs, and commit messages. Keep new comments and user-facing text in Spanish to match.
- Historical accuracy is a requirement (SPEC §0, §8.6). Do not present invented facts, catalog numbers, or tools the Apollo astronauts did not use as fact.
- The game must never freeze or stall on a failed tracker, voice, or camera. Keep the fallbacks described in SPEC §6 and §7.2 when changing these paths.
- `src/state/` is empty and is reserved for persistence. Calibration and options already use localStorage with versioned keys (`museo-espacial:calibracion:v1`); bump the version when the stored shape changes.

## Commits
- Cuando Henry confirme que una función funciona, haz commit de ese cambio antes de empezar otra cosa.
- Un commit = una función o corrección. No mezcles varias sesiones en un mismo commit.
- Antes de hacer commit, ejecuta npm run build y confirma que compila. Si falla, no hagas commit.
- Propón un mensaje corto en español que diga qué funciona ahora (ej. "Cursor con dedo índice en museo") y espera la aprobación de Henry.
- Termina el mensaje con la línea: Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
- Nunca hagas commit de algo que Henry no haya confirmado. No hagas push.
