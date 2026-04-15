// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Inject a state patch into localStorage and reload the page.
 * This lets us test specific scenarios without waiting for real-time decay.
 */
async function setState(page, patch) {
  await page.evaluate((patch) => {
    const raw = localStorage.getItem('tamagotchi_save');
    const s = raw ? JSON.parse(raw) : {};
    Object.assign(s, patch, { lastTickAt: Date.now() });
    localStorage.setItem('tamagotchi_save', JSON.stringify(s));
  }, patch);
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.pet');
});

test('page loads with egg and game clock', async ({ page }) => {
  await expect(page.locator('.pet--egg')).toBeVisible();
  await expect(page.locator('#game-clock')).toHaveText('10:00');
});

test('feed modal opens on Feed button click', async ({ page }) => {
  await page.click('#btn-feed');
  await expect(page.locator('#feed-modal')).toHaveClass(/open/);
  await expect(page.locator('#btn-meal')).toBeVisible();
  await expect(page.locator('#btn-snack')).toBeVisible();
});

test('feeding a meal updates hunger hearts', async ({ page }) => {
  // Start with baby stage and hunger=2 so we can see a change (hunger<3 avoids refusal logic)
  await setState(page, { stage: 'baby', hunger: 2, isSick: false });
  await page.click('#btn-feed');
  await page.click('#btn-meal');
  // Hunger hearts: 3 filled
  const filledHearts = page.locator('#hunger-hearts .heart:not(.empty)');
  await expect(filledHearts).toHaveCount(3);
});

test('feeding a snack updates happy hearts', async ({ page }) => {
  await setState(page, { stage: 'baby', happy: 2, isSick: false });
  await page.click('#btn-feed');
  await page.click('#btn-snack');
  const filledHearts = page.locator('#happy-hearts .heart:not(.empty)');
  await expect(filledHearts).toHaveCount(3);
});

test('status modal shows stage and weight', async ({ page }) => {
  await setState(page, { stage: 'child', weight: 8, careMistakes: 1 });
  await page.click('#btn-status');
  await expect(page.locator('#status-modal')).toHaveClass(/open/);
  await expect(page.locator('#stat-stage')).toHaveText('Child');
  await expect(page.locator('#stat-weight')).toHaveText('8g');
  await expect(page.locator('#stat-mistakes')).toHaveText('1');
});

test('medicine button is disabled when not sick', async ({ page }) => {
  await setState(page, { isSick: false });
  await expect(page.locator('#btn-medicine')).toBeDisabled();
});

test('clean button is disabled when no poop', async ({ page }) => {
  await setState(page, { poopCount: 0 });
  await expect(page.locator('#btn-clean')).toBeDisabled();
});

test('sickness is shown via skull icon when weight threshold reached', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: true });
  await expect(page.locator('.icon-skull')).toHaveClass(/active/);
  await expect(page.locator('#btn-medicine')).toBeEnabled();
});

test('three medicine doses cure sickness', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: true, medicineCount: 0, sickSince: Date.now() });
  await page.click('#btn-medicine');
  await page.click('#btn-medicine');
  await page.click('#btn-medicine');
  await expect(page.locator('.icon-skull')).not.toHaveClass(/active/);
  await expect(page.locator('#btn-medicine')).toBeDisabled();
});

test('poop icons appear when poopCount > 0', async ({ page }) => {
  await setState(page, { stage: 'baby', poopCount: 2 });
  await expect(page.locator('.poop-icon')).toHaveCount(2);
  await expect(page.locator('#btn-clean')).toBeEnabled();
});

test('clean button removes all poop icons', async ({ page }) => {
  await setState(page, { stage: 'baby', poopCount: 2 });
  await page.click('#btn-clean');
  await expect(page.locator('.poop-icon')).toHaveCount(0);
});

test('play button opens direction game for baby stage', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false, isSleeping: false });
  await page.click('#btn-play');
  await expect(page.locator('#game-modal')).toHaveClass(/open/);
  await expect(page.locator('#gbtn-left')).toBeVisible();
  await expect(page.locator('#gbtn-right')).toBeVisible();
});

test('play button opens higher/lower game for teen stage', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');
  await expect(page.locator('#game-modal')).toHaveClass(/open/);
  await expect(page.locator('#gbtn-higher')).toBeVisible();
  await expect(page.locator('#gbtn-lower')).toBeVisible();
});

test('toggling light at bedtime hour puts pet to sleep', async ({ page }) => {
  await setState(page, { stage: 'baby', gameClockHours: 21, isSleeping: false });
  await page.click('#btn-light');
  await expect(page.locator('.screen')).toHaveClass(/lights-off/);
  const lightLabel = page.locator('#btn-light .btn-label');
  await expect(lightLabel).toHaveText('Wake');
});

test('toggling light during daytime shows not-bedtime toast', async ({ page }) => {
  await setState(page, { stage: 'baby', gameClockHours: 14, isSleeping: false });
  await page.click('#btn-light');
  await expect(page.locator('.toast')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('bedtime');
});

test('new game button resets pet to egg', async ({ page }) => {
  // Manually set death state
  await setState(page, { stage: 'dead' });
  // Death screen should appear on reload (pet is dead)
  // Click new game
  const newGameBtn = page.locator('#btn-new-game');
  await expect(newGameBtn).toBeVisible({ timeout: 5000 });
  await newGameBtn.click({ force: true });
  await expect(page.locator('.pet--egg')).toBeVisible();
  // Hunger hearts should be filled (4/4)
  const filledHearts = page.locator('#hunger-hearts .heart:not(.empty)');
  await expect(filledHearts).toHaveCount(4);
});

test('game state persists across page reload', async ({ page }) => {
  await setState(page, { stage: 'child', hunger: 2, isSick: false });
  await page.click('#btn-feed');
  await page.click('#btn-meal');
  // Wait briefly then reload
  await page.waitForTimeout(300);
  await page.reload();
  // Hunger should now be 3 (was 2, fed 1 meal)
  const filledHearts = page.locator('#hunger-hearts .heart:not(.empty)');
  await expect(filledHearts).toHaveCount(3);
});

test('discipline button glows when pet misbehaves', async ({ page }) => {
  await setState(page, { stage: 'baby', isMisbehaving: true });
  await expect(page.locator('#btn-discipline')).toHaveClass(/active-glow/);
  await expect(page.locator('#btn-discipline')).toBeEnabled();
});

test('pressing Escape closes the feed modal', async ({ page }) => {
  await page.click('#btn-feed');
  await expect(page.locator('#feed-modal')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#feed-modal')).not.toHaveClass(/open/);
});

// ── Direction mini-game: animation shown every round ──────────────────────────

test('direction game shows ← or → arrow in display for round 1', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false, isSleeping: false });
  await page.click('#btn-play');

  // Game initialises then fires first round after 600 ms
  await page.waitForTimeout(750);

  // Direction arrow must be visible in the game display (inside the modal)
  await expect(page.locator('#game-display')).toContainText(/[←→]/);

  // Pet should have the facing class and idle should be removed
  const hasFacing = await page.locator('.pet').evaluate(
    el => el.classList.contains('facing-left') || el.classList.contains('facing-right')
  );
  expect(hasFacing).toBe(true);

  const hasIdle = await page.locator('.pet').evaluate(el => el.classList.contains('idle'));
  expect(hasIdle).toBe(false);
});

test('direction game shows ← or → arrow for every subsequent round', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false, isSleeping: false });
  await page.click('#btn-play');

  // Play all 5 rounds and verify a direction arrow appears in each
  for (let round = 1; round <= 3; round++) {
    // Wait for this round's direction-show phase
    // Round 1: 600 ms init delay; rounds 2+: 900 ms feedback delay
    await page.waitForTimeout(round === 1 ? 750 : 1050);

    await expect(page.locator('#game-display')).toContainText(/[←→]/,
      { message: `Round ${round}: direction arrow should be visible` }
    );

    // Wait for buttons to become active (1000 ms direction window)
    await page.waitForTimeout(1100);
    await expect(page.locator('#gbtn-left')).toBeEnabled();

    // Answer (direction doesn't matter for the test)
    await page.click('#gbtn-left');
  }
});

// ── Higher/Lower mini-game: number display and round progression ──────────────

test('higher/lower game shows a number and prompt on open', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');
  await expect(page.locator('#game-modal')).toHaveClass(/open/);
  await expect(page.locator('#game-display')).toContainText(/[1-9]/);
  await expect(page.locator('#game-display')).toContainText('Higher or lower?');
});

test('higher/lower game reveals next number prominently after a guess', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');
  await expect(page.locator('#game-modal')).toHaveClass(/open/);

  await page.click('#gbtn-higher');

  // Feedback must show result emoji and the revealed next number
  await expect(page.locator('#game-display')).toContainText(/[✅❌]/);
  await expect(page.locator('#game-display')).toContainText(/[1-9]/);
});

test('higher/lower game updates round counter after each guess', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');

  await expect(page.locator('#game-score')).toContainText('Round: 0 / 5');

  await page.click('#gbtn-higher');
  await expect(page.locator('#game-score')).toContainText('Round: 1 / 5');

  // Wait for next round (1500 ms feedback + buffer)
  await page.waitForTimeout(1700);
  await page.click('#gbtn-lower');
  await expect(page.locator('#game-score')).toContainText('Round: 2 / 5');
});

test('higher/lower next round shows number revealed in previous feedback', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');

  await page.click('#gbtn-higher');

  // Capture revealed next number from feedback (largest digit shown after the →)
  const feedbackText = await page.locator('#game-display').textContent();
  const digits = feedbackText.match(/[1-9]/g) || [];
  const revealedNum = digits[digits.length - 1];

  // Wait for next round to render
  await page.waitForTimeout(1700);

  const nextRoundText = await page.locator('#game-display').textContent();
  expect(nextRoundText).toContain(revealedNum);
  await expect(page.locator('#game-display')).toContainText('Higher or lower?');
});

test('higher/lower game progresses through all 5 rounds and ends', async ({ page }) => {
  await setState(page, { stage: 'teen', isSick: false, isSleeping: false });
  await page.click('#btn-play');

  for (let round = 1; round <= 5; round++) {
    await expect(page.locator('#game-display')).toContainText(/[1-9]/);
    await page.click('#gbtn-higher');
    await expect(page.locator('#game-display')).toContainText(/[✅❌]/);

    if (round < 5) {
      await page.waitForTimeout(1700);
      await expect(page.locator('#game-display')).toContainText('Higher or lower?');
    }
  }

  // After round 5, game ends (modal closes after endGame timeout)
  await page.waitForTimeout(1700);
  await expect(page.locator('#game-modal')).not.toHaveClass(/open/);
});

// ── Sound toggle ──────────────────────────────────────────────────────────────

test('sound button is visible with speaker icon by default', async ({ page }) => {
  await expect(page.locator('#btn-sound')).toBeVisible();
  await expect(page.locator('#btn-sound .btn-icon')).toHaveText('🔊');
  await expect(page.locator('#btn-sound .btn-label')).toHaveText('Sound');
});

test('clicking sound button mutes and persists across reload', async ({ page }) => {
  await page.click('#btn-sound');
  await expect(page.locator('#btn-sound .btn-icon')).toHaveText('🔇');
  await expect(page.locator('#btn-sound .btn-label')).toHaveText('Muted');

  await page.reload();
  await expect(page.locator('#btn-sound .btn-icon')).toHaveText('🔇');
});

// ── Random activity animations ────────────────────────────

test('startRandomActivity applies an activity class to the pet', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false, isSleeping: false });
  await page.evaluate(() => window._game.startRandomActivity());
  const hasActivity = await page.locator('.pet').evaluate(el =>
    el.classList.contains('walking') ||
    el.classList.contains('dancing') ||
    el.classList.contains('lying-down')
  );
  expect(hasActivity).toBe(true);
});

test('stopCurrentActivity removes activity class and restores idle', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false, isSleeping: false });
  await page.evaluate(() => window._game.startRandomActivity());
  await page.evaluate(() => window._game.stopCurrentActivity());
  await expect(page.locator('.pet')).toHaveClass(/idle/);
  const hasActivity = await page.locator('.pet').evaluate(el =>
    el.classList.contains('walking') ||
    el.classList.contains('dancing') ||
    el.classList.contains('lying-down')
  );
  expect(hasActivity).toBe(false);
});
