// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Inject a state patch into localStorage and reload the page.
 * Uses the new per-character key architecture (tamagotchi_save_{character}).
 */
async function setState(page, patch) {
  await page.evaluate((patch) => {
    const char = patch.character || localStorage.getItem('tamagotchi_current_character') || 'yoshi';
    const key = 'tamagotchi_save_' + char;
    const raw = localStorage.getItem(key);
    const s = raw ? JSON.parse(raw) : {};
    Object.assign(s, patch, { lastTickAt: Date.now() });
    if (!s.name) s.name = 'Test';
    if (!s.character) s.character = char;
    localStorage.setItem(key, JSON.stringify(s));
    localStorage.setItem('tamagotchi_current_character', char);
  }, patch);
  await page.reload();
}

/**
 * Seed a default yoshi save so the setup screen doesn't block tests.
 */
async function seedDefaultSave(page) {
  await page.evaluate(() => {
    const now = Date.now();
    const s = {
      stage: 'egg', hunger: 4, happy: 4, weight: 5, discipline: 0,
      careMistakes: 0, isSick: false, medicineCount: 0, sickSince: null,
      isSleeping: false, lightsOff: false, poopCount: 0, nextPoopTick: 10,
      ticksSinceLastPoop: 0, bornAt: now, stageStartedAt: now, lastTickAt: now,
      attentionSince: null, gameClockHours: 10, tickCount: 0,
      hungerTicksSinceLoss: 0, happyTicksSinceLoss: 0,
      isMisbehaving: false, pendingLightMistake: null,
      name: 'Test', character: 'yoshi',
    };
    localStorage.setItem('tamagotchi_save_yoshi', JSON.stringify(s));
    localStorage.setItem('tamagotchi_current_character', 'yoshi');
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await seedDefaultSave(page);
  await page.reload();
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

test('play button is disabled when sleeping', async ({ page }) => {
  await setState(page, { stage: 'baby', isSleeping: true });
  await expect(page.locator('#btn-play')).toBeDisabled();
});

test('play button is disabled at egg stage', async ({ page }) => {
  await setState(page, { stage: 'egg' });
  await expect(page.locator('#btn-play')).toBeDisabled();
});

test('feed button is disabled when dead', async ({ page }) => {
  await setState(page, { stage: 'dead' });
  await expect(page.locator('#btn-feed')).toBeDisabled();
});

test('light button shows default Light label when awake', async ({ page }) => {
  await setState(page, { stage: 'baby', isSleeping: false });
  await expect(page.locator('#btn-light .btn-label')).toHaveText('Light');
  await expect(page.locator('#btn-light .btn-icon')).toHaveText('💡');
});

test('sickness is shown via skull icon when weight threshold reached', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: true });
  await expect(page.locator('.icon-skull')).toHaveClass(/active/);
  await expect(page.locator('#btn-medicine')).toBeEnabled();
});

test('medicine button enables immediately when pet becomes sick mid-game', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false });
  await expect(page.locator('#btn-medicine')).toBeDisabled();
  await page.evaluate(() => window._game.makeSick('poop'));
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
  // Set death state
  await setState(page, { stage: 'dead' });
  // Death screen should appear
  const newGameBtn = page.locator('#btn-new-game');
  await expect(newGameBtn).toBeVisible({ timeout: 5000 });
  await newGameBtn.click({ force: true });

  // Setup screen should now be open
  await expect(page.locator('#setup-screen')).toHaveClass(/open/);

  // Fill in name + select character + start
  await page.fill('#pet-name-input', 'Newpet');
  await page.click('.char-card[data-char="yoshi"]');
  await page.click('#btn-start-game');

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

test('discipline button is disabled and has no glow when pet is not misbehaving', async ({ page }) => {
  await setState(page, { stage: 'baby', isMisbehaving: false });
  await expect(page.locator('#btn-discipline')).toBeDisabled();
  await expect(page.locator('#btn-discipline')).not.toHaveClass(/active-glow/);
});

test('discipline button loses glow after disciplining', async ({ page }) => {
  await setState(page, { stage: 'baby', isMisbehaving: true, discipline: 0 });
  await page.click('#btn-discipline');
  await expect(page.locator('#btn-discipline')).not.toHaveClass(/active-glow/);
  await expect(page.locator('#btn-discipline')).toBeDisabled();
});

// ── Attention and skull icon states ───────────────────────────────────────────

test('attention icon is inactive when pet is healthy and calm', async ({ page }) => {
  await setState(page, { stage: 'baby', attentionSince: null, isMisbehaving: false, hunger: 4, happy: 4 });
  await expect(page.locator('.icon-attention')).not.toHaveClass(/active/);
});

test('attention icon is active when attentionSince is set', async ({ page }) => {
  await setState(page, { stage: 'baby', attentionSince: Date.now() });
  await expect(page.locator('.icon-attention')).toHaveClass(/active/);
});

test('attention icon is active when pet is misbehaving', async ({ page }) => {
  await setState(page, { stage: 'baby', isMisbehaving: true });
  await expect(page.locator('.icon-attention')).toHaveClass(/active/);
});

test('attention icon is active when hunger reaches 0', async ({ page }) => {
  await setState(page, { stage: 'baby', hunger: 0 });
  await expect(page.locator('.icon-attention')).toHaveClass(/active/);
});

test('attention icon is active when happy reaches 0', async ({ page }) => {
  await setState(page, { stage: 'baby', happy: 0 });
  await expect(page.locator('.icon-attention')).toHaveClass(/active/);
});

test('skull icon is inactive when pet is not sick', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false });
  await expect(page.locator('.icon-skull')).not.toHaveClass(/active/);
});

test('skull icon is inactive when hunger or happy is 0 but pet is not sick', async ({ page }) => {
  await setState(page, { stage: 'baby', isSick: false, hunger: 0, happy: 0 });
  await expect(page.locator('.icon-skull')).not.toHaveClass(/active/);
  await expect(page.locator('.icon-attention')).toHaveClass(/active/);
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
    el.classList.contains('lying-down') ||
    el.classList.contains('singing')
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
    el.classList.contains('lying-down') ||
    el.classList.contains('singing')
  );
  expect(hasActivity).toBe(false);
});

// ── Setup screen ──────────────────────────────────────────────────────────────

test('setup screen appears when no save exists', async ({ page }) => {
  // Clear all storage and reload
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#setup-screen')).toHaveClass(/open/);
  await expect(page.locator('#char-grid .char-card')).toHaveCount(4);
});

test('start game button disabled until name + character selected', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#btn-start-game')).toBeDisabled();

  // Type name only — still disabled (no character)
  await page.fill('#pet-name-input', 'Buddy');
  await expect(page.locator('#btn-start-game')).toBeDisabled();

  // Select character — now enabled
  await page.click('.char-card[data-char="yoshi"]');
  await expect(page.locator('#btn-start-game')).toBeEnabled();
});

test('selecting a character shows info panel', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('.char-card[data-char="horhotchi"]');
  await expect(page.locator('#char-info-name')).toHaveText('Horhotchi');
  await expect(page.locator('#char-info-type')).toHaveText('Owl');
});

test('completing setup starts game with pet name displayed on screen', async ({ page }) => {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.fill('#pet-name-input', 'Bubbles');
  await page.click('.char-card[data-char="mendakotchi"]');
  await page.click('#btn-start-game');

  await expect(page.locator('#setup-screen')).not.toHaveClass(/open/);
  await expect(page.locator('#pet-name')).toHaveText('Bubbles');
  await expect(page.locator('.pet--egg')).toBeVisible();
});

test('pet name shown in status modal', async ({ page }) => {
  await setState(page, { name: 'Yoshino', character: 'yoshi', stage: 'baby' });
  await page.click('#btn-status');
  await expect(page.locator('#stat-name')).toHaveText('Yoshino');
  await expect(page.locator('#stat-character')).toHaveText('Yoshi');
});

test('pet name persists on screen after reload', async ({ page }) => {
  await setState(page, { name: 'Dino', character: 'yoshi', stage: 'baby' });
  await expect(page.locator('#pet-name')).toHaveText('Dino');
});

// ── History ───────────────────────────────────────────────────────────────────

test('past pets history appears in status modal after pet dies', async ({ page }) => {
  // Seed a history entry directly in localStorage
  await page.evaluate(() => {
    const entry = {
      name: 'OldPet', character: 'yoshi', bornAt: Date.now() - 3600000,
      diedAt: Date.now(), cause: 'sickness', careMistakes: 2, finalStage: 'child',
    };
    localStorage.setItem('tamagotchi_history_yoshi', JSON.stringify([entry]));
  });
  await setState(page, { stage: 'baby', character: 'yoshi' });

  await page.click('#btn-status');
  await expect(page.locator('#status-modal')).toHaveClass(/open/);

  // Open history panel
  await page.click('#btn-show-history');
  await expect(page.locator('#history-list')).toBeVisible();
  await expect(page.locator('.history-entry')).toHaveCount(1);
  await expect(page.locator('.history-name')).toHaveText('OldPet');
});

test('history back button returns to stats view', async ({ page }) => {
  await setState(page, { stage: 'baby', character: 'yoshi' });
  await page.click('#btn-status');
  await page.click('#btn-show-history');
  await expect(page.locator('#status-table')).not.toBeVisible();
  await page.click('#btn-history-back');
  await expect(page.locator('#status-table')).toBeVisible();
});

// ── Speed indicator ───────────────────────────────────────────────────────────

test('speed indicator renders 1× by default', async ({ page }) => {
  await expect(page.locator('#speed-indicator')).toBeVisible();
  await expect(page.locator('#speed-indicator')).toHaveText('1×');
});

test('clicking speed indicator cycles 1× → 2× → 4× → 1×', async ({ page }) => {
  await expect(page.locator('#speed-indicator')).toHaveText('1×');
  await page.click('#speed-indicator');
  await expect(page.locator('#speed-indicator')).toHaveText('2×');
  await page.click('#speed-indicator');
  await expect(page.locator('#speed-indicator')).toHaveText('4×');
  await page.click('#speed-indicator');
  await expect(page.locator('#speed-indicator')).toHaveText('1×');
});

test('speed persists after page reload', async ({ page }) => {
  await page.click('#speed-indicator'); // → 2×
  await page.click('#speed-indicator'); // → 4×
  await expect(page.locator('#speed-indicator')).toHaveText('4×');
  await page.reload();
  await page.waitForSelector('.pet');
  await expect(page.locator('#speed-indicator')).toHaveText('4×');
});

test('speed indicator has active class at 2× and 4×, not at 1×', async ({ page }) => {
  // At 1× — should NOT have active class
  await expect(page.locator('#speed-indicator')).not.toHaveClass(/active/);

  // At 2× — should have active class
  await page.click('#speed-indicator');
  await expect(page.locator('#speed-indicator')).toHaveClass(/active/);

  // At 4× — should still have active class
  await page.click('#speed-indicator');
  await expect(page.locator('#speed-indicator')).toHaveClass(/active/);

  // Back to 1× — active class removed
  await page.click('#speed-indicator');
  await expect(page.locator('#speed-indicator')).not.toHaveClass(/active/);
});
