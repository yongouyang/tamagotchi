# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See `tests/TESTING.md` for a guide on test patterns, coverage gaps to avoid, and how to write tests for multi-phase UI flows — informed by real bugs found in this codebase.

## Commands

```bash
# Run all tests (unit + e2e)
npm test

# Unit tests only (Vitest + jsdom)
npm run test:unit

# Unit tests in watch mode
npm run test:unit:watch

# E2E tests only (Playwright, auto-starts a local server on port 4321)
npm run test:e2e

# Run a single e2e test by title
npx playwright test -g "higher/lower game reveals next number"

# Run a single unit test file
npx vitest run tests/unit/logic.test.js

# Install Chromium for Playwright (one-time setup)
npm run install:browsers
```

No build step — the project is plain HTML/CSS/JS served statically.

## Architecture

The entire game lives in three files: `index.html`, `style.css`, and `game.js`. There is no bundler, no framework, and no modules at runtime.

### game.js structure

`game.js` is a single flat script (~1,100 lines) that runs directly in the browser. Sections (marked by banner comments) in order:

1. **CONFIG** — all tunable constants (tick rate, decay rates, stage durations, thresholds)
2. **STATE** — a single `state` object holding the full live game state
3. **SOUND SYSTEM** — Web Audio API synthesis (`_note`, `_seq`, `SOUNDS` map, `MELODIES` map, `playMelody`/`stopMelody`)
4. **Activity scheduler** — random walk/dance/rest animations (`startRandomActivity`, `scheduleNextActivity`, `stopCurrentActivity`)
5. **PERSISTENCE** — `save()`/`load()` via `localStorage` (`tamagotchi_save` key)
6. **INIT** — `initGame()`, `startNewGame()`, `startGameLoop()`
7. **CATCH-UP TICKS** — `applyCatchUpTicks` / `silentTick` run on page load to simulate offline time (capped at `CONFIG.MAX_CATCHUP_TICKS = 30`)
8. **MAIN TICK** — `tick()` fires every 30 real seconds; advances game clock, handles stat decay, attention timeout, light mistakes, sickness/death, evolution
9. **EVOLUTION** — `checkEvolution()` / `evolve()`: egg→baby→child→teen→adult-{good|avg|bad} based on `careMistakes`
10. **DEATH** — `die()` triggers death screen overlay
11. **CARE ACTIONS** — `feed()`, `play()`, `giveMedicine()`, `clean()`, `toggleLight()`, `discipline()`, `showStatus()`
12. **MINI-GAMES** — `startGuessDirectionGame()` / `nextDirectionRound()` / `guessDirection()` (baby+child), and `startHigherLowerGame()` / `renderHigherLowerDisplay()` / `guessHigherLower()` (teen+adult); shared `gameState` object; `endGame(won)`
13. **RENDERING** — `render()` drives all DOM updates from `state`; helper `setEl(id, html)`
14. **MODAL / OVERLAY helpers** — `openModal`, `closeModal`, `openOverlay`

### Test structure

Unit tests (`tests/unit/`) use **Vitest** with **jsdom**. `tests/setup.js` imports `game.js` (which populates `globalThis._game` with exported helpers) and sets up a minimal DOM skeleton + a mock `AudioContext`. Unit tests access game internals via `globalThis._game`.

E2E tests (`tests/e2e/game.spec.js`) use **Playwright** against a real Chromium browser. The `setState(page, patch)` helper writes directly to `localStorage` and reloads the page, letting tests jump to any game state instantly without waiting for real-time decay.

### Key patterns

- **`gameState`** (module-level `let`) is the live mini-game session object. It is `null` when no game is active. The modal close button and `stopCurrentActivity()` both null it out.
- **`waiting` flag** on `gameState` gates button clicks — `guessDirection`/`guessHigherLower` bail early if `!gameState.waiting`.
- **`window._game`** export: at the bottom of `game.js`, public functions are attached to `window._game` so unit tests and e2e tests can call them programmatically.
- The game clock (`state.gameClockHours`) is a float in `[0, 24)` that advances by 0.5 per tick. `hourCrossed(prev, next, target)` handles midnight wrap.
- Adult outcome is determined at teen→adult evolution by `careMistakes`: 0 → `adult-good`, 1–3 → `adult-avg`, 4+ → `adult-bad`.
- **Fast-forward speed** (`state.speed`): `1`, `2`, or `4`. A `<span id="speed-indicator">` badge next to the game clock cycles through these on click. `setSpeed(n)` updates state, restarts the game loop at the new interval (`CONFIG.TICK_INTERVAL_MS / state.speed`), and calls `render()`. `checkEvolution()` scales elapsed time by `state.speed` so stage durations shrink proportionally. Attention timeout, sick death delay, and light mistake window are intentionally **not** speed-scaled (they use raw `Date.now()` comparisons). Speed is persisted in the save and restored on reload; new games always start at 1×.
