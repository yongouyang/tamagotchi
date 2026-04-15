# Testing Guide

Lessons captured from bug investigations and test coverage gaps in this project.

---

## Test architecture at a glance

| Layer | Tool | What it covers |
|---|---|---|
| Unit (`tests/unit/`) | Vitest + jsdom | State mutations, game logic, calculations |
| E2E (`tests/e2e/`) | Playwright (Chromium) | What the user actually sees and can interact with |

The two layers are deliberately separate. Unit tests call game functions directly via `globalThis._game` and inspect `state`. E2E tests only interact through the browser DOM and assert on visible content.

---

## The core gap: testing entry points is not testing behaviour

The most common test coverage gap in this codebase is writing a test that verifies a feature *opens* but not one that verifies it *works*.

**Example — what was originally tested for the Higher/Lower game:**

```js
test('play button opens higher/lower game for teen stage', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');
  await expect(page.locator('#game-modal')).toHaveClass(/open/);
  await expect(page.locator('#gbtn-higher')).toBeVisible();
  await expect(page.locator('#gbtn-lower')).toBeVisible();
});
```

This test passes even if the game is completely broken after the first click. It only checks that the modal opened and the buttons exist.

**The bug that went uncaught as a result:**  
After guessing, the revealed next number was shown in 20px unlabelled text (`5 → 7`). Players missed it entirely. The code was *logically* correct — the number was present in the DOM — but the presentation was invisible in practice. No test asserted what was *displayed* in the game display element, so the regression went unnoticed.

**Rule of thumb:** For any interactive feature, write at least one test for each distinct phase the user passes through, not just the first one.

---

## Testing multi-phase UI flows

Many features in this game have a clear phase structure. Map the phases before writing tests.

**Higher/Lower game phases:**

1. **Open** — display shows current number + "Higher or lower?" prompt
2. **After guess** — display shows result emoji + revealed next number (prominently)
3. **Next round** — display shows the revealed number as the new current number

Phase 1 was tested. Phases 2 and 3 were not. The bug lived entirely in phase 2.

**Direction game phases (well-covered example to follow):**

1. Round starts → arrow visible, pet facing left/right, idle class removed
2. Arrow hidden after 1 s → `❓` shown, buttons enabled
3. After guess → result shown, next round starts after 900 ms

The direction game tests explicitly check all three phases, which is why that feature had no similar gap.

---

## Data-continuity tests

When a feature reveals data in one phase that seeds the next phase, test that the data actually carries over. This is the most valuable edge case to cover for game-like flows.

**Pattern:**

```js
// 1. Trigger the action that reveals data
await page.click('#gbtn-higher');

// 2. Capture the revealed value from the display
const feedbackText = await page.locator('#game-display').textContent();
const revealedNum = feedbackText.match(/[1-9]/g).pop();

// 3. Wait for the transition
await page.waitForTimeout(1700); // feedback duration + buffer

// 4. Assert that revealed value is now the seed for the next phase
const nextRoundText = await page.locator('#game-display').textContent();
expect(nextRoundText).toContain(revealedNum);
```

This test would have caught the Higher/Lower bug immediately: if the number wasn't displayed prominently in feedback, `revealedNum` would be empty or wrong, and the assertion would fail.

---

## Timing in e2e tests

Async UI phases require explicit waits. Use values derived from the game's actual timeout constants rather than arbitrary sleeps.

**Where timeouts are defined:**  
`game.js` — `CONFIG` object at the top (for tick rates), and inline `setTimeout` calls within mini-game functions.

**Current timing reference:**

| Event | Duration |
|---|---|
| Direction shown before hiding | 1000 ms |
| Direction game feedback before next round | 900 ms |
| Higher/Lower feedback before next round | 1500 ms |
| Direction game initial delay (round 1) | 600 ms |

When writing a wait, add ~200 ms buffer over the raw timeout to account for jsdom/browser scheduling jitter:

```js
await page.waitForTimeout(1700); // 1500 ms feedback + 200 ms buffer
```

**Do not use `page.waitForTimeout` as a substitute for asserting on state.** Use `waitForSelector` or `expect(...).toBeVisible()` when a DOM change is the right signal. Reserve `waitForTimeout` for phases where the DOM change is a *replacement* (same element, different content) rather than an *addition*.

---

## The `setState` helper (e2e)

`setState(page, patch)` is defined at the top of `game.spec.js`. It writes directly to `localStorage` and reloads, letting any test start from any game state without waiting for real-time decay.

```js
async function setState(page, patch) {
  await page.evaluate((patch) => {
    const raw = localStorage.getItem('tamagotchi_save');
    const s = raw ? JSON.parse(raw) : {};
    Object.assign(s, patch, { lastTickAt: Date.now() });
    localStorage.setItem('tamagotchi_save', JSON.stringify(s));
  }, patch);
  await page.reload();
}
```

Use it to test features that only appear in specific stages (`teen`, `adult-*`) without running the full game. Always set `isSick: false` and `isSleeping: false` when testing play/feed features unless the test is specifically about those states.

---

## Unit test patterns

### Mocking `Math.random` to test probabilistic branches

Several game mechanics have random branches (meal refusal, sick death). Use `vi.spyOn` to force a specific path:

```js
// Force the refusal branch (random < 0.3)
vi.spyOn(Math, 'random').mockReturnValue(0.1);
g.feed('meal');
expect(g.state.isMisbehaving).toBe(true);
vi.restoreAllMocks();
```

Always call `vi.restoreAllMocks()` after, or put it in `afterEach`. Leaving a spy active will corrupt tests that run after.

### Testing boundary values, not just the happy path

For any condition based on a threshold, test:
- Exactly at the threshold
- One below (should not trigger)
- One above (should trigger)

```js
// weight sickness threshold
it('makes sick at exactly the threshold', () => {
  g.setState({ weight: g.CONFIG.WEIGHT_SICK_THRESHOLD });
  g.tick();
  expect(g.state.isSick).toBe(true);
});
it('does not make sick one below threshold', () => {
  g.setState({ weight: g.CONFIG.WEIGHT_SICK_THRESHOLD - 1 });
  g.tick();
  expect(g.state.isSick).toBe(false);
});
```

Using `g.CONFIG.WEIGHT_SICK_THRESHOLD` instead of a hardcoded `15` means the test stays correct if the constant changes.

### Testing idempotency and guard clauses

Most action functions have guard clauses (`if (!state.isSick) return`). Test both sides:

```js
it('is a no-op when not sick', () => {
  g.setState({ isSick: false, medicineCount: 0 });
  g.giveMedicine();
  expect(g.state.medicineCount).toBe(0); // unchanged
});
```

This ensures the guard is actually guarding and not silently mutating state.

---

## What unit tests cannot catch (use e2e for these)

- **Display rendering**: whether `state.currentNum = 7` produces a visible `7` in `#game-display`
- **CSS classes applied correctly**: whether `facing-left` is added and `idle` removed
- **Button enable/disable state**: whether `setGameBtnsEnabled(false)` actually prevents clicks
- **Modal open/close**: whether `openModal` / `closeModal` produce the `open` CSS class
- **Timing sequences**: whether the feedback phase transitions correctly to the next game phase

If a bug would only be noticed by a user looking at the screen, it needs an e2e test.

---

## Checklist for testing a new feature

Before considering a feature tested, verify coverage for:

- [ ] **Entry guard**: the feature is blocked when preconditions aren't met (sick, sleeping, wrong stage, egg)
- [ ] **Initial state**: the correct initial display/content is shown when the feature opens
- [ ] **Each interactive phase**: every distinct phase the user passes through, not just the first
- [ ] **Data continuity**: data produced in one phase becomes the correct input for the next
- [ ] **Boundary values**: any threshold in CONFIG or logic is tested at ±1
- [ ] **No-op guards**: actions that should do nothing in certain states actually do nothing
- [ ] **Full sequence completion**: the feature ends in the correct final state (modal closes, stats updated, etc.)
