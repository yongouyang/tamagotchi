'use strict';
// Test environment detection (Vitest sets process.env.VITEST = 'true')
const IS_TEST = typeof process !== 'undefined' && !!process.env.VITEST;

/* =====================================================
   CONFIGURATION
   ===================================================== */

const CONFIG = {
  TICK_INTERVAL_MS: 30000,           // 30 real seconds = 0.5 game hours
  HUNGER_DECAY_TICKS: 8,             // lose 1 hunger heart every 8 ticks
  HAPPY_DECAY_TICKS: 12,             // lose 1 happy heart every 12 ticks
  POOP_MIN_TICKS: 8,                 // poop spawns randomly every 8-16 ticks
  POOP_MAX_TICKS: 16,
  POOP_SICK_THRESHOLD: 3,            // 3 poops → get sick
  ATTENTION_MISTAKE_MS: 15 * 60 * 1000, // 15 min to respond
  LIGHT_MISTAKE_WINDOW_MS: 2 * 60 * 1000, // 2 min grace period
  WEIGHT_SICK_THRESHOLD: 15,
  SICK_DEATH_CHANCE: 0.20,           // 20% per tick if sick untreated > 10 min
  SICK_DEATH_DELAY_MS: 10 * 60 * 1000,
  MEDICINE_DOSES_NEEDED: 3,
  GAME_HOURS_PER_TICK: 0.5,
  SLEEP_START_HOUR: 20,
  SLEEP_END_HOUR: 9,
  STAGE_DURATIONS_MS: {
    egg:   5  * 60 * 1000,
    baby:  60 * 60 * 1000,
    child: 3  * 60 * 60 * 1000,
    teen:  8  * 60 * 60 * 1000,
  },
  MAX_CATCHUP_TICKS: 30,
};

/* =====================================================
   CHARACTER CONFIGS
   ===================================================== */

const CHARACTER_CONFIGS = {
  yoshi:        {},
  mendakotchi:  { HAPPY_DECAY_TICKS: 18 },
  mermarintchi: { SICK_DEATH_CHANCE: 0.30, WEIGHT_SICK_THRESHOLD: 12 },
  horhotchi:    { HUNGER_DECAY_TICKS: 6, SICK_DEATH_CHANCE: 0.10 },
};

const CHARACTER_META = {
  yoshi:        { displayName: 'Yoshi',        type: 'Dinosaur',         trait: 'Balanced stats',      description: 'A well-rounded green dinosaur. No advantages or disadvantages.' },
  mendakotchi:  { displayName: 'Mendakotchi',  type: 'Flapjack Octopus', trait: 'Slow happiness decay', description: 'An easy-going octopus. Stays happy longer but eats at a normal rate.' },
  mermarintchi: { displayName: 'Mermarintchi', type: 'Mermaid',          trait: 'Delicate health',      description: 'A loving mermaid. More prone to sickness and needs extra care.' },
  horhotchi:    { displayName: 'Horhotchi',    type: 'Owl',              trait: 'Always hungry',        description: 'A sharp-sensed owl. Gets hungry fast but rarely gets sick.' },
};

function getCharConfig(key) {
  const overrides = CHARACTER_CONFIGS[state.character] || {};
  return (key in overrides) ? overrides[key] : CONFIG[key];
}

/* =====================================================
   STATE
   ===================================================== */

let state = {
  stage: 'egg',
  hunger: 4,
  happy: 4,
  weight: 5,
  discipline: 0,
  careMistakes: 0,
  isSick: false,
  medicineCount: 0,
  sickSince: null,
  isSleeping: false,
  lightsOff: false,
  poopCount: 0,
  nextPoopTick: 10,
  ticksSinceLastPoop: 0,
  bornAt: null,
  stageStartedAt: null,
  lastTickAt: null,
  attentionSince: null,
  gameClockHours: 10,   // starts at 10 AM
  tickCount: 0,
  hungerTicksSinceLoss: 0,
  happyTicksSinceLoss: 0,
  isMisbehaving: false,
  pendingLightMistake: null,
  name: '',
  character: 'yoshi',
};

let gameLoopId = null;
let selectedCharacter = null;

/* =====================================================
   SOUND SYSTEM
   ===================================================== */

let _audioCtx = null;
let soundEnabled = true;

// Activity system
let _melodyGen      = 0;     // increment to cancel in-flight melody loops
let currentActivity = null;  // 'walk' | 'dance' | 'rest' | null
let _activityTimerId = null; // setTimeout handle for next activity

function _ctx() {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  } catch (e) { return null; }
}

function _note(freq, startOffset, duration, type, vol) {
  try {
    const ctx = _ctx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type || 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.05);
  } catch (e) { /* silence on error */ }
}

function _seq(notes) {
  notes.forEach(n => _note(n.f, n.d || 0, n.t, n.w || 'square', n.v || 0.12));
}

function playSound(name) {
  if (!soundEnabled) return;
  const fn = SOUNDS[name];
  if (fn) fn();
}

const SOUNDS = {
  // Classic Mario coin: B5 → E6
  coin:       () => _seq([{f:988,d:0,t:0.06},{f:1319,d:0.06,t:0.14}]),
  // Power-up ascending: C5 E5 G5 C6
  powerup:    () => _seq([{f:523,d:0,t:0.06},{f:659,d:0.07,t:0.06},{f:784,d:0.14,t:0.06},{f:1047,d:0.21,t:0.18}]),
  // Quick jump sweep
  jump:       () => _seq([{f:523,d:0,t:0.04},{f:784,d:0.04,t:0.07}]),
  // Mario death: descending 5 notes
  death:      () => _seq([{f:494,d:0,t:0.14},{f:370,d:0.16,t:0.14},{f:349,d:0.32,t:0.18},{f:277,d:0.52,t:0.24},{f:220,d:0.78,t:0.38}]),
  // 1-UP jingle: G5 C6 E6 G6 E6 G6
  oneup:      () => _seq([{f:784,d:0,t:0.06},{f:1047,d:0.07,t:0.06},{f:1319,d:0.14,t:0.06},{f:1568,d:0.21,t:0.06},{f:1319,d:0.28,t:0.06},{f:1568,d:0.35,t:0.18}]),
  // Stage evolve flourish
  evolve:     () => _seq([{f:523,d:0,t:0.07},{f:659,d:0.08,t:0.07},{f:784,d:0.16,t:0.07},{f:1047,d:0.24,t:0.18}]),
  // Egg hatch sparkle
  hatch:      () => _seq([{f:1047,d:0,t:0.05},{f:1319,d:0.06,t:0.05},{f:1568,d:0.12,t:0.05},{f:2093,d:0.18,t:0.12}]),
  // Yoshi three-note call: D5 G5 F#5
  yoshi:      () => _seq([{f:587,d:0,t:0.08},{f:784,d:0.09,t:0.06},{f:740,d:0.16,t:0.14}]),
  // Three attention beeps
  attention:  () => _seq([{f:880,d:0,t:0.09},{f:880,d:0.20,t:0.09},{f:880,d:0.40,t:0.09}]),
  // Sick descending
  sick:       () => _seq([{f:440,d:0,t:0.12},{f:349,d:0.14,t:0.12},{f:294,d:0.28,t:0.20}]),
  // Medicine tick
  medicine:   () => _seq([{f:1047,d:0,t:0.08},{f:1319,d:0.09,t:0.12}]),
  // Clean ascending whoosh
  clean:      () => _seq([{f:523,d:0,t:0.06},{f:659,d:0.07,t:0.06},{f:784,d:0.14,t:0.08},{f:1047,d:0.22,t:0.10}]),
  // Sleep two soft notes
  sleep:      () => _seq([{f:392,d:0,t:0.18,w:'sine',v:0.08},{f:349,d:0.20,t:0.28,w:'sine',v:0.06}]),
  // Wake rising
  wake:       () => _seq([{f:349,d:0,t:0.08},{f:440,d:0.09,t:0.08},{f:523,d:0.18,t:0.16}]),
  // Discipline thud
  discipline: () => _note(164, 0, 0.04, 'square', 0.18),
  // Game win fanfare
  gamewin:    () => _seq([{f:523,d:0,t:0.07},{f:659,d:0.08,t:0.07},{f:784,d:0.16,t:0.07},{f:659,d:0.24,t:0.07},{f:784,d:0.32,t:0.07},{f:1047,d:0.40,t:0.22}]),
  // Game lose sad
  gamelose:   () => _seq([{f:440,d:0,t:0.12},{f:392,d:0.14,t:0.12},{f:349,d:0.28,t:0.16},{f:294,d:0.46,t:0.30}]),
  // UI select blip
  select:     () => _note(784, 0, 0.05, 'square', 0.09),
};

// ── Looping SMW Melodies ──────────────────────────────────

const MELODIES = {
  // SMW Overworld Theme — 7-note iconic loop (2 s)
  walk: {
    notes: [
      {f:659,d:0.0,t:0.10},{f:659,d:0.2,t:0.10},{f:659,d:0.4,t:0.10},
      {f:523,d:0.6,t:0.10},{f:659,d:0.8,t:0.10},{f:784,d:1.0,t:0.20},
      {f:392,d:1.5,t:0.20},
    ],
    loopMs: 2000,
  },
  // SMW Athletic Theme — 11-note fast loop (1.6 s)
  dance: {
    notes: [
      {f:784,d:0.0,t:0.07},{f:740,d:0.1,t:0.07},{f:698,d:0.2,t:0.07},
      {f:622,d:0.3,t:0.07},{f:659,d:0.4,t:0.07},{f:415,d:0.5,t:0.07},
      {f:440,d:0.65,t:0.07},{f:523,d:0.8,t:0.07},{f:440,d:0.95,t:0.07},
      {f:523,d:1.1,t:0.07},{f:587,d:1.25,t:0.12},
    ],
    loopMs: 1600,
  },
  // Gentle Yoshi's Island ascending — sine-wave, soft (2.1 s)
  rest: {
    notes: [
      {f:523,d:0.0,t:0.22,w:'sine',v:0.09},{f:659,d:0.3,t:0.22,w:'sine',v:0.09},
      {f:784,d:0.6,t:0.22,w:'sine',v:0.09},{f:1047,d:0.9,t:0.28,w:'sine',v:0.09},
      {f:784,d:1.2,t:0.22,w:'sine',v:0.08},{f:659,d:1.5,t:0.22,w:'sine',v:0.07},
    ],
    loopMs: 2100,
  },
};

function _melodyLoop(notes, loopMs, gen) {
  if (gen !== _melodyGen || !soundEnabled) return;
  _seq(notes);
  setTimeout(() => _melodyLoop(notes, loopMs, gen), loopMs);
}
function playMelody(key) {
  if (!soundEnabled) return;
  const m = MELODIES[key];
  if (!m) return;
  _melodyGen++;
  _melodyLoop(m.notes, m.loopMs, _melodyGen);
}
function stopMelody() { _melodyGen++; }

// ── Activity scheduler ────────────────────────────────────

const ACTIVITY_MAP = {
  walk:  { cls: 'walking',    dur: 6000 },
  dance: { cls: 'dancing',    dur: 5000 },
  rest:  { cls: 'lying-down', dur: 8000 },
};

function _canDoActivity() {
  return state.stage !== 'egg' && state.stage !== 'dead'
      && !state.isSleeping && !state.isSick;
}

function stopCurrentActivity() {
  stopMelody();
  if (_activityTimerId) { clearTimeout(_activityTimerId); _activityTimerId = null; }
  const petEl = document.querySelector('.pet');
  if (currentActivity && petEl) {
    petEl.classList.remove(ACTIVITY_MAP[currentActivity].cls);
    if (state.stage !== 'dead') petEl.classList.add('idle');
  }
  currentActivity = null;
}

function startRandomActivity() {
  if (!_canDoActivity()) { scheduleNextActivity(); return; }
  stopCurrentActivity();
  const keys = Object.keys(ACTIVITY_MAP);
  const key  = keys[Math.floor(Math.random() * keys.length)];
  const act  = ACTIVITY_MAP[key];
  currentActivity = key;
  const petEl = document.querySelector('.pet');
  if (petEl) {
    petEl.classList.remove('idle');
    void petEl.offsetWidth; // force reflow so CSS animation state clears
    petEl.classList.add(act.cls);
  }
  playMelody(key);
  _activityTimerId = setTimeout(() => {
    stopCurrentActivity();
    scheduleNextActivity();
  }, act.dur);
}

function scheduleNextActivity() {
  const delay = 20000 + Math.random() * 20000; // 20–40 s
  _activityTimerId = setTimeout(startRandomActivity, delay);
}

// ─────────────────────────────────────────────────────────

function initSound() {
  soundEnabled = localStorage.getItem('tamagotchi_sound') !== 'false';
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('tamagotchi_sound', String(soundEnabled));
  renderSoundBtn();
  if (soundEnabled) playSound('select');
}

function renderSoundBtn() {
  const btn = document.getElementById('btn-sound');
  if (!btn) return;
  const icon  = btn.querySelector('.btn-icon');
  const label = btn.querySelector('.btn-label');
  if (icon)  icon.textContent  = soundEnabled ? '🔊' : '🔇';
  if (label) label.textContent = soundEnabled ? 'Sound' : 'Muted';
}

/* =====================================================
   PERSISTENCE
   ===================================================== */

function save() {
  const toSave = Object.assign({}, state, { lastTickAt: Date.now() });
  localStorage.setItem('tamagotchi_save_' + (state.character || 'yoshi'), JSON.stringify(toSave));
  localStorage.setItem('tamagotchi_current_character', state.character || 'yoshi');
}

function load() {
  try {
    const currentChar = localStorage.getItem('tamagotchi_current_character');
    if (currentChar) {
      const raw = localStorage.getItem('tamagotchi_save_' + currentChar);
      if (raw) return JSON.parse(raw);
    }
    // Legacy migration: move old single-slot save to new per-character key
    const legacy = localStorage.getItem('tamagotchi_save');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      parsed.character = parsed.character || 'yoshi';
      parsed.name = parsed.name || '';
      localStorage.setItem('tamagotchi_save_yoshi', JSON.stringify(parsed));
      localStorage.setItem('tamagotchi_current_character', 'yoshi');
      localStorage.removeItem('tamagotchi_save');
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn('Failed to load save:', e);
    return null;
  }
}

function loadCharacterSave(character) {
  try {
    const raw = localStorage.getItem('tamagotchi_save_' + character);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveHistoryEntry(cause, preDeathStage) {
  const entry = {
    name: state.name,
    character: state.character,
    bornAt: state.bornAt,
    diedAt: Date.now(),
    cause,
    careMistakes: state.careMistakes,
    finalStage: preDeathStage,
  };
  const key = 'tamagotchi_history_' + state.character;
  let hist = [];
  try {
    const r = localStorage.getItem(key);
    if (r) hist = JSON.parse(r);
  } catch (e) { /* ignore */ }
  hist.push(entry);
  if (hist.length > 50) hist = hist.slice(-50);
  localStorage.setItem(key, JSON.stringify(hist));
}

function loadHistory(character) {
  try {
    const raw = localStorage.getItem('tamagotchi_history_' + (character || state.character));
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

/* =====================================================
   INIT
   ===================================================== */

function initGame() {
  initSound();
  const saved = load();
  if (saved) {
    // Restore state with migration defaults
    Object.assign(state, saved);
    if (!state.character) state.character = 'yoshi';
    if (state.name === undefined) state.name = '';
    const missedMs = Date.now() - (saved.lastTickAt || Date.now());
    if (missedMs > 0 && state.stage !== 'dead') {
      applyCatchUpTicks(missedMs);
    }
    render();
    if (state.stage === 'dead') {
      // Restore char class on death-pet
      const deathPetEl = document.querySelector('.death-pet');
      if (deathPetEl) {
        Object.keys(CHARACTER_META).forEach(k => deathPetEl.classList.remove('char--' + k));
        if (state.character) deathPetEl.classList.add('char--' + state.character);
      }
      openOverlay('death-screen');
    }
  } else {
    // No save — show setup screen (or start directly in test env)
    if (!IS_TEST) {
      render();
      openSetupScreen();
    } else {
      startNewGame('', 'yoshi');
    }
  }
  startGameLoop();
}

function startNewGame(name, character) {
  const now = Date.now();
  const charKey = character || 'yoshi';
  const petName = (name || '').trim();
  state = {
    stage: 'egg',
    hunger: 4,
    happy: 4,
    weight: 5,
    discipline: 0,
    careMistakes: 0,
    isSick: false,
    medicineCount: 0,
    sickSince: null,
    isSleeping: false,
    lightsOff: false,
    poopCount: 0,
    nextPoopTick: 10,
    ticksSinceLastPoop: 0,
    bornAt: now,
    stageStartedAt: now,
    lastTickAt: now,
    attentionSince: null,
    gameClockHours: 10,
    tickCount: 0,
    hungerTicksSinceLoss: 0,
    happyTicksSinceLoss: 0,
    isMisbehaving: false,
    pendingLightMistake: null,
    name: petName,
    character: charKey,
  };
  save();
  render();
  playSound('yoshi');
}

function startGameLoop() {
  if (gameLoopId) clearInterval(gameLoopId);
  gameLoopId = setInterval(tick, CONFIG.TICK_INTERVAL_MS);
  scheduleNextActivity();
}

/* =====================================================
   SETUP SCREEN
   ===================================================== */

function openSetupScreen() {
  selectedCharacter = null;

  // Populate char grid
  const grid = document.getElementById('char-grid');
  if (grid) {
    grid.innerHTML = '';
    Object.keys(CHARACTER_META).forEach(key => {
      const meta = CHARACTER_META[key];
      const card = document.createElement('div');
      card.className = 'char-card';
      card.dataset.char = key;

      // Check if this character has an in-progress game
      const existing = loadCharacterSave(key);
      const inProgress = existing && existing.stage !== 'dead';
      const badgeHtml = inProgress
        ? '<span class="char-in-progress">In Progress</span>'
        : '';

      card.innerHTML = `
        <div class="char-card-preview char-preview--${key}"></div>
        <div class="char-card-name">${meta.displayName}</div>
        ${badgeHtml}
      `;
      card.addEventListener('click', () => selectCharacter(key));
      grid.appendChild(card);
    });
  }

  // Clear previous input + info
  const nameInput = document.getElementById('pet-name-input');
  if (nameInput) nameInput.value = '';

  const infoName  = document.getElementById('char-info-name');
  const infoType  = document.getElementById('char-info-type');
  const infoTrait = document.getElementById('char-info-trait');
  const infoDesc  = document.getElementById('char-info-desc');
  if (infoName)  infoName.textContent  = '';
  if (infoType)  infoType.textContent  = 'Select a character above';
  if (infoTrait) infoTrait.textContent = '';
  if (infoDesc)  infoDesc.textContent  = '';

  const startBtn = document.getElementById('btn-start-game');
  if (startBtn) startBtn.disabled = true;

  openOverlay('setup-screen');
}

function selectCharacter(charKey) {
  selectedCharacter = charKey;

  // Update selected class on cards
  document.querySelectorAll('.char-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.char === charKey);
  });

  updateCharInfo(charKey);
  validateSetup();
}

function updateCharInfo(charKey) {
  const meta = CHARACTER_META[charKey];
  if (!meta) return;
  const infoName  = document.getElementById('char-info-name');
  const infoType  = document.getElementById('char-info-type');
  const infoTrait = document.getElementById('char-info-trait');
  const infoDesc  = document.getElementById('char-info-desc');
  if (infoName)  infoName.textContent  = meta.displayName;
  if (infoType)  infoType.textContent  = meta.type;
  if (infoTrait) infoTrait.textContent = meta.trait;
  if (infoDesc)  infoDesc.textContent  = meta.description;
}

function validateSetup() {
  const nameInput = document.getElementById('pet-name-input');
  const startBtn  = document.getElementById('btn-start-game');
  if (!nameInput || !startBtn) return;
  const hasName = nameInput.value.trim().length > 0;
  startBtn.disabled = !(hasName && selectedCharacter);
}

function confirmSetup() {
  const nameInput = document.getElementById('pet-name-input');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name || !selectedCharacter) return;

  // Close setup screen
  const setupScreen = document.getElementById('setup-screen');
  if (setupScreen) {
    setupScreen.classList.remove('open');
    setupScreen.setAttribute('aria-hidden', 'true');
  }

  startNewGame(name, selectedCharacter);
  render();
}

/* =====================================================
   CATCH-UP TICKS (silent, no death/evolution)
   ===================================================== */

function applyCatchUpTicks(missedMs) {
  const ticksMissed = Math.min(
    Math.floor(missedMs / CONFIG.TICK_INTERVAL_MS),
    CONFIG.MAX_CATCHUP_TICKS
  );
  console.log(`Applying ${ticksMissed} catch-up ticks for ${Math.round(missedMs / 1000)}s offline`);
  for (let i = 0; i < ticksMissed; i++) {
    silentTick();
  }
}

function silentTick() {
  if (state.stage === 'dead') return;

  // Advance game clock
  state.gameClockHours = (state.gameClockHours + CONFIG.GAME_HOURS_PER_TICK) % 24;
  state.tickCount++;

  if (!state.isSleeping) {
    // Hunger decay
    state.hungerTicksSinceLoss++;
    if (state.hungerTicksSinceLoss >= getCharConfig('HUNGER_DECAY_TICKS')) {
      state.hunger = Math.max(0, state.hunger - 1);
      state.hungerTicksSinceLoss = 0;
    }
    // Happy decay
    state.happyTicksSinceLoss++;
    if (state.happyTicksSinceLoss >= getCharConfig('HAPPY_DECAY_TICKS')) {
      state.happy = Math.max(0, state.happy - 1);
      state.happyTicksSinceLoss = 0;
    }
  }

  // Poop
  state.ticksSinceLastPoop++;
  if (state.ticksSinceLastPoop >= state.nextPoopTick) {
    spawnPoop();
  }
}

/* =====================================================
   MAIN TICK
   ===================================================== */

function tick() {
  if (state.stage === 'dead') return;

  const prevHour = state.gameClockHours;
  state.gameClockHours = (state.gameClockHours + CONFIG.GAME_HOURS_PER_TICK) % 24;
  const newHour = state.gameClockHours;
  state.tickCount++;

  // Check sleep transitions
  const crossedSleepStart = hourCrossed(prevHour, newHour, CONFIG.SLEEP_START_HOUR);
  const crossedSleepEnd   = hourCrossed(prevHour, newHour, CONFIG.SLEEP_END_HOUR);

  if (crossedSleepStart && !state.lightsOff && !state.pendingLightMistake) {
    // Pet should be sleeping but lights are still on
    state.pendingLightMistake = Date.now();
  }

  if (crossedSleepEnd && state.lightsOff && !state.pendingLightMistake) {
    // It's morning but lights are still off
    state.pendingLightMistake = Date.now();
  }

  // Check pending light mistake timeout
  if (state.pendingLightMistake &&
      Date.now() - state.pendingLightMistake > CONFIG.LIGHT_MISTAKE_WINDOW_MS) {
    logCareMistake('lights');
    state.pendingLightMistake = null;
  }

  if (!state.isSleeping) {
    // Hunger decay
    state.hungerTicksSinceLoss++;
    if (state.hungerTicksSinceLoss >= getCharConfig('HUNGER_DECAY_TICKS')) {
      state.hunger = Math.max(0, state.hunger - 1);
      state.hungerTicksSinceLoss = 0;
      if (state.hunger === 0) triggerAttention('hunger');
    }

    // Happy decay
    state.happyTicksSinceLoss++;
    if (state.happyTicksSinceLoss >= getCharConfig('HAPPY_DECAY_TICKS')) {
      state.happy = Math.max(0, state.happy - 1);
      state.happyTicksSinceLoss = 0;
      if (state.happy === 0) triggerAttention('happy');
    }
  }

  // Attention timeout
  if (state.attentionSince &&
      Date.now() - state.attentionSince > CONFIG.ATTENTION_MISTAKE_MS) {
    logCareMistake('attention');
    state.attentionSince = null;
  }

  // Poop
  state.ticksSinceLastPoop++;
  if (state.ticksSinceLastPoop >= state.nextPoopTick) {
    spawnPoop();
  }

  // Weight sickness
  if (state.weight >= getCharConfig('WEIGHT_SICK_THRESHOLD') && !state.isSick) {
    makeSick('overweight');
  }

  // Sick death check
  if (state.isSick && state.sickSince &&
      Date.now() - state.sickSince > CONFIG.SICK_DEATH_DELAY_MS) {
    if (Math.random() < getCharConfig('SICK_DEATH_CHANCE')) {
      die('sickness');
      return;
    }
  }

  // Evolution
  checkEvolution();

  save();
  render();
}

/* Helper: did the clock cross a specific hour between prevHour and newHour? */
function hourCrossed(prev, next, target) {
  if (next > prev) {
    return prev < target && next >= target;
  } else {
    // wrapped midnight
    return prev < target || next >= target;
  }
}

/* =====================================================
   EVOLUTION
   ===================================================== */

function checkEvolution() {
  const now = Date.now();
  const stageDuration = CONFIG.STAGE_DURATIONS_MS[state.stage];
  if (!stageDuration) return; // adult stages don't evolve further

  const timeInStage = now - state.stageStartedAt;
  if (timeInStage < stageDuration) return;

  const transitions = {
    egg:   'baby',
    baby:  'child',
    child: 'teen',
    teen:  null, // → adult, pick type
  };

  if (state.stage === 'teen') {
    // Determine adult type based on care mistakes
    let adultStage;
    if (state.careMistakes === 0) {
      adultStage = 'adult-good';
    } else if (state.careMistakes <= 3) {
      adultStage = 'adult-avg';
    } else {
      adultStage = 'adult-bad';
    }
    evolve(adultStage);
    showToast('Your pet grew into an adult! 🎉', 3000);
  } else {
    const next = transitions[state.stage];
    if (next) {
      evolve(next);
      showToast(`Your pet became a ${next}! ✨`, 2500);
    }
  }
}

function evolve(newStage) {
  console.log(`Evolving from ${state.stage} to ${newStage}`);
  state.stage = newStage;
  state.stageStartedAt = Date.now();
  // Reset poop timer on evolution
  state.ticksSinceLastPoop = 0;
  state.nextPoopTick = randBetween(CONFIG.POOP_MIN_TICKS, CONFIG.POOP_MAX_TICKS);
  if (newStage === 'baby') {
    playSound('hatch');
  } else if (newStage.startsWith('adult')) {
    playSound('oneup');
  } else {
    playSound('evolve');
  }
}

/* =====================================================
   DEATH
   ===================================================== */

function die(cause) {
  stopCurrentActivity();
  console.log('Pet died from:', cause);
  const preDeathStage = state.stage;
  saveHistoryEntry(cause, preDeathStage);
  state.stage = 'dead';
  state.attentionSince = null;
  playSound('death');
  // Update char class on death-pet element
  const deathPetEl = document.querySelector('.death-pet');
  if (deathPetEl) {
    Object.keys(CHARACTER_META).forEach(k => deathPetEl.classList.remove('char--' + k));
    if (state.character) deathPetEl.classList.add('char--' + state.character);
  }
  save();
  render();

  const messages = {
    sickness: 'Your pet fell ill and couldn\'t recover.\nPlease give medicine sooner next time!',
    starvation: 'Your pet wasn\'t fed enough and passed away.',
    default: 'Your little one has gone to a better place.',
  };

  const el = document.getElementById('death-message');
  if (el) el.textContent = messages[cause] || messages.default;
  openOverlay('death-screen');
}

/* =====================================================
   ATTENTION
   ===================================================== */

function triggerAttention(reason) {
  if (state.attentionSince) return; // already waiting
  state.attentionSince = Date.now();
  console.log('Attention needed:', reason);
  render();
  playSound('attention');
}

/* =====================================================
   CARE MISTAKES
   ===================================================== */

function logCareMistake(reason) {
  state.careMistakes++;
  console.log(`Care mistake #${state.careMistakes}: ${reason}`);
}

/* =====================================================
   POOP
   ===================================================== */

function spawnPoop() {
  if (state.stage === 'egg') return;
  state.poopCount++;
  state.ticksSinceLastPoop = 0;
  state.nextPoopTick = randBetween(CONFIG.POOP_MIN_TICKS, CONFIG.POOP_MAX_TICKS);
  console.log(`Pooped! Total: ${state.poopCount}`);

  if (state.poopCount >= CONFIG.POOP_SICK_THRESHOLD && !state.isSick) {
    makeSick('poop');
    triggerAttention('sick');
  } else if (state.poopCount > 0) {
    triggerAttention('poop');
  }
}

/* =====================================================
   SICKNESS
   ===================================================== */

function makeSick(reason) {
  if (state.isSick) return;
  stopCurrentActivity();
  console.log('Got sick from:', reason);
  state.isSick = true;
  state.medicineCount = 0;
  state.sickSince = Date.now();
  playSound('sick');
  triggerAttention('sick');
}

/* =====================================================
   ACTIONS
   ===================================================== */

function feed(type) {
  stopCurrentActivity();
  if (state.isSick) {
    animatePet('shaking');
    showToast('Pet is sick! Give medicine first. 💊');
    return;
  }
  if (state.stage === 'egg') {
    showToast('The egg is not ready to eat yet!');
    return;
  }

  closeModal('feed-modal');

  if (type === 'meal') {
    // Misbehaviour check: if hunger >= 3 (nearly full), 30% chance refuses
    if (state.hunger >= 3 && Math.random() < 0.3) {
      state.isMisbehaving = true;
      animatePet('shaking');
      showToast('Pet refused the meal! 😤');
      save();
      render();
      return;
    }
    state.hunger = Math.min(4, state.hunger + 1);
    state.weight++;
    showToast('+1 Hunger 🍖');
    playSound('coin');
  } else if (type === 'snack') {
    state.happy = Math.min(4, state.happy + 1);
    state.weight += 2;
    showToast('+1 Happy 🍬');
    playSound('coin');
  }

  // Clear attention if it was for hunger/happy
  if (state.hunger > 0 && state.happy > 0) {
    state.attentionSince = null;
  }

  animatePet('bouncing');
  playSound('jump');
  save();
  render();
}

function play() {
  stopCurrentActivity();
  if (state.isSick) {
    showToast('Pet is too sick to play! 💊');
    return;
  }
  if (state.stage === 'egg') {
    showToast('The egg can\'t play yet!');
    return;
  }
  if (state.isSleeping) {
    showToast('Shhh! Pet is sleeping! 😴');
    return;
  }

  openModal('game-modal');

  if (state.stage === 'baby' || state.stage === 'child') {
    startGuessDirectionGame();
  } else {
    startHigherLowerGame();
  }
}

function giveMedicine() {
  stopCurrentActivity();
  if (!state.isSick) {
    showToast('Pet isn\'t sick!');
    return;
  }

  state.medicineCount++;
  console.log(`Medicine dose ${state.medicineCount} / ${CONFIG.MEDICINE_DOSES_NEEDED}`);

  if (state.medicineCount >= CONFIG.MEDICINE_DOSES_NEEDED) {
    state.isSick = false;
    state.sickSince = null;
    state.medicineCount = 0;
    state.attentionSince = null;
    showToast('Pet is all better! 💊✨', 3000);
    animatePet('bouncing');
    playSound('powerup');
  } else {
    const remaining = CONFIG.MEDICINE_DOSES_NEEDED - state.medicineCount;
    showToast(`Medicine given (${remaining} more needed)`);
    animatePet('shaking');
    playSound('medicine');
  }

  save();
  render();
}

function clean() {
  stopCurrentActivity();
  if (state.poopCount === 0) {
    showToast('Nothing to clean!');
    return;
  }

  state.poopCount = 0;
  state.attentionSince = null;
  showToast('All cleaned up! ✨');
  animatePet('bouncing');
  playSound('clean');
  save();
  render();
}

function toggleLight() {
  stopCurrentActivity();
  if (state.isSleeping) {
    // Wake up
    state.isSleeping = false;
    state.lightsOff = false;
    state.gameClockHours = CONFIG.SLEEP_END_HOUR; // Jump to 9 AM
    state.pendingLightMistake = null;
    showToast('Good morning! ☀️');
    playSound('wake');
  } else {
    const hour = state.gameClockHours;
    if (hour >= CONFIG.SLEEP_START_HOUR || hour < CONFIG.SLEEP_END_HOUR) {
      // Correct time to sleep
      stopCurrentActivity();
      state.isSleeping = true;
      state.lightsOff = true;
      state.pendingLightMistake = null;
      showToast('Good night! 🌙');
      playSound('sleep');
    } else {
      // Too early / not sleep time
      showToast('It\'s not bedtime yet!');
    }
  }

  save();
  render();
}

function discipline() {
  stopCurrentActivity();
  if (!state.isMisbehaving) {
    showToast('Pet is behaving fine!');
    return;
  }

  state.discipline = Math.min(4, state.discipline + 1);
  state.isMisbehaving = false;
  showToast('Disciplined! 👊');
  animatePet('shaking');
  playSound('discipline');
  save();
  render();
}

function showStatus() {
  playSound('select');

  const adultNames = {
    yoshi:        { good: 'Mametchi (Good)',    avg: 'Ginjirotchi (Avg)',  bad: 'Kuchipatchi (Bad)'  },
    mendakotchi:  { good: 'Menda-Star (Good)',  avg: 'Menda-Wave (Avg)',   bad: 'Menda-Drift (Bad)'  },
    mermarintchi: { good: 'Merma-Pearl (Good)', avg: 'Merma-Shell (Avg)',  bad: 'Merma-Kelp (Bad)'   },
    horhotchi:    { good: 'Horho-Sage (Good)',  avg: 'Horho-Dusk (Avg)',   bad: 'Horho-Sleepy (Bad)' },
  };
  const charAdults = adultNames[state.character] || adultNames.yoshi;

  const stageNames = {
    egg: 'Egg', baby: 'Baby', child: 'Child', teen: 'Teen',
    'adult-good': charAdults.good, 'adult-avg': charAdults.avg, 'adult-bad': charAdults.bad,
    dead: 'Passed Away',
  };

  const ageHrs = state.bornAt
    ? Math.floor((Date.now() - state.bornAt) / (1000 * 60 * 60))
    : 0;

  setEl('stat-name',      state.name || '—');
  setEl('stat-character', CHARACTER_META[state.character]?.displayName || state.character);
  setEl('stat-stage',     stageNames[state.stage] || state.stage);
  setEl('stat-age',       `${ageHrs} hrs`);
  setEl('stat-weight',    `${state.weight}g`);
  setEl('stat-mistakes',  String(state.careMistakes));

  // Discipline hearts
  const discEl = document.getElementById('stat-discipline');
  if (discEl) {
    discEl.innerHTML = Array.from({ length: 4 }, (_, i) =>
      `<span class="heart${i < state.discipline ? '' : ' empty'}">${i < state.discipline ? '♥' : '♡'}</span>`
    ).join('');
  }

  // Reset history view to stats view
  const tbl = document.getElementById('status-table');
  const hist = document.getElementById('history-list');
  if (tbl) tbl.style.display = '';
  if (hist) hist.style.display = 'none';

  openModal('status-modal');
}

function populateHistory() {
  const entries = loadHistory(state.character);
  const entriesEl = document.getElementById('history-entries');
  const emptyEl   = document.getElementById('history-empty');
  if (!entriesEl || !emptyEl) return;

  if (entries.length === 0) {
    entriesEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';
  entriesEl.innerHTML = entries.slice().reverse().map(e => {
    const lifeHrs = e.bornAt && e.diedAt
      ? Math.floor((e.diedAt - e.bornAt) / (1000 * 60 * 60))
      : 0;
    const charMeta = CHARACTER_META[e.character] || {};
    const stageName = e.finalStage || e.character || '?';
    const causeLabel = e.cause === 'sickness' ? 'Illness' : e.cause === 'starvation' ? 'Starvation' : 'Unknown';
    return `<div class="history-entry">
      <span class="history-name">${e.name || '—'}</span>
      <span class="history-detail">${charMeta.displayName || e.character} · ${stageName} · ${lifeHrs}h · ${causeLabel} · ${e.careMistakes} mistakes</span>
    </div>`;
  }).join('');
}

/* =====================================================
   MINI-GAME: GUESS DIRECTION
   ===================================================== */

let gameState = null;

function startGuessDirectionGame() {
  gameState = { type: 'direction', round: 0, correct: 0, direction: null, waiting: false };

  setEl('game-title', 'Guess the Direction!');
  setEl('game-score', 'Round: 0 / 5  |  Score: 0');
  setEl('game-display', '<span style="font-size:40px">👀</span>');

  const btns = document.getElementById('game-buttons');
  btns.innerHTML = `
    <button class="game-btn" id="gbtn-left">← Left</button>
    <button class="game-btn" id="gbtn-right">Right →</button>
  `;

  document.getElementById('gbtn-left').addEventListener('click',  () => guessDirection('left'));
  document.getElementById('gbtn-right').addEventListener('click', () => guessDirection('right'));

  setTimeout(nextDirectionRound, 600);
}

function nextDirectionRound() {
  if (!gameState || gameState.type !== 'direction') return;
  if (gameState.round >= 5) {
    endGame(gameState.correct >= 3);
    return;
  }

  gameState.direction = Math.random() < 0.5 ? 'left' : 'right';
  gameState.waiting = false;

  updateGameScore();

  const petEl = document.querySelector('.pet');
  const dirSymbol = gameState.direction === 'left' ? '←' : '→';

  // Show a clear directional arrow inside the game modal (visible regardless of pet CSS)
  setEl('game-display',
    `<div style="text-align:center">
       <div style="font-size:56px; color:#8bac0f; line-height:1">${dirSymbol}</div>
       <div style="font-size:11px; color:#306230; margin-top:6px; letter-spacing:1px">MEMORISE!</div>
     </div>`
  );

  // Remove .idle before adding facing class so the idle animation's transform
  // does not override .facing-left / .facing-right (CSS animations beat static rules)
  if (petEl) {
    petEl.classList.remove('idle', 'facing-left', 'facing-right');
    void petEl.offsetWidth; // force reflow so animation state is cleared
    petEl.classList.add(gameState.direction === 'left' ? 'facing-left' : 'facing-right');
  }

  // After direction has been shown, hide it and re-enable buttons
  setTimeout(() => {
    if (!gameState || gameState.type !== 'direction') return;
    gameState.waiting = true;
    setGameBtnsEnabled(true);
    setEl('game-display', '<span style="font-size:36px">❓</span>');
    if (petEl) {
      petEl.classList.remove('facing-left', 'facing-right');
      petEl.classList.add('idle'); // restore idle animation
    }
  }, 1000); // 1 s — enough time to read the direction
}

function guessDirection(guess) {
  if (!gameState || !gameState.waiting) return;
  gameState.waiting = false;
  gameState.round++;
  setGameBtnsEnabled(false);

  const correct = (guess === gameState.direction);
  if (correct) gameState.correct++;

  const symbol = correct ? '✅' : '❌';
  const dirSymbol = gameState.direction === 'left' ? '←' : '→';
  setEl('game-display',
    `<div style="text-align:center">
      <div style="font-size:32px">${symbol}</div>
      <div style="font-size:14px; color:#8bac0f; margin-top:4px">It was ${dirSymbol}</div>
     </div>`
  );
  updateGameScore();

  setTimeout(nextDirectionRound, 900);
}

/* =====================================================
   MINI-GAME: HIGHER OR LOWER
   ===================================================== */

function startHigherLowerGame() {
  const firstNum = randBetween(1, 9);
  gameState = {
    type: 'higherlower',
    round: 0,
    correct: 0,
    currentNum: firstNum,
    waiting: true,
  };

  setEl('game-title', 'Higher or Lower?');
  updateGameScore();

  const btns = document.getElementById('game-buttons');
  btns.innerHTML = `
    <button class="game-btn" id="gbtn-higher">Higher ↑</button>
    <button class="game-btn" id="gbtn-lower">Lower ↓</button>
  `;

  document.getElementById('gbtn-higher').addEventListener('click', () => guessHigherLower('higher'));
  document.getElementById('gbtn-lower').addEventListener('click',  () => guessHigherLower('lower'));

  renderHigherLowerDisplay();
}

function renderHigherLowerDisplay() {
  if (!gameState) return;
  setEl('game-display',
    `<div style="text-align:center">
       <div style="font-size:11px; color:#306230; margin-bottom:6px; letter-spacing:1px">Current Number</div>
       <div style="font-size:52px; color:#8bac0f; font-weight:bold">${gameState.currentNum}</div>
       <div style="font-size:11px; color:#306230; margin-top:6px; letter-spacing:1px">Higher or lower?</div>
     </div>`
  );
}

function guessHigherLower(guess) {
  if (!gameState || !gameState.waiting) return;
  gameState.waiting = false;
  gameState.round++;
  setGameBtnsEnabled(false);

  const nextNum = randBetween(1, 9);
  let correct;
  if (guess === 'higher') {
    correct = nextNum > gameState.currentNum;
  } else {
    correct = nextNum < gameState.currentNum;
  }
  // If equal, treat as incorrect
  if (nextNum === gameState.currentNum) correct = false;

  if (correct) gameState.correct++;

  const symbol = correct ? '✅' : '❌';
  setEl('game-display',
    `<div style="text-align:center">
       <div style="font-size:28px">${symbol}</div>
       <div style="font-size:11px; color:#306230; margin-top:4px; letter-spacing:1px">${gameState.currentNum} →</div>
       <div style="font-size:48px; color:#8bac0f; font-weight:bold">${nextNum}</div>
     </div>`
  );

  gameState.currentNum = nextNum;
  updateGameScore();

  if (gameState.round >= 5) {
    setTimeout(() => endGame(gameState.correct >= 3), 1500);
  } else {
    setTimeout(() => {
      if (!gameState) return;
      gameState.waiting = true;
      setGameBtnsEnabled(true);
      renderHigherLowerDisplay();
    }, 1500);
  }
}

/* =====================================================
   GAME HELPERS
   ===================================================== */

function updateGameScore() {
  if (!gameState) return;
  setEl('game-score', `Round: ${gameState.round} / 5  |  Score: ${gameState.correct}`);
}

function setGameBtnsEnabled(enabled) {
  document.querySelectorAll('.game-btn').forEach(btn => {
    btn.disabled = !enabled;
  });
}

function endGame(won) {
  gameState = null;
  closeModal('game-modal');

  // Restore idle animation
  const petEl = document.querySelector('.pet');
  if (petEl) petEl.classList.remove('facing-left', 'facing-right');

  if (won) {
    state.happy   = Math.min(4, state.happy + 1);
    state.weight  = Math.max(1, state.weight - 1);
    animatePet('bouncing');
    showToast('You won! +1 Happy 🎉', 2500);
    // Clear attention if was flagged for happiness
    if (state.happy > 0) state.attentionSince = null;
  } else {
    animatePet('shaking');
    showToast('Better luck next time!', 2000);
  }

  if (won) playSound('gamewin'); else playSound('gamelose');
  save();
  render();
}

/* =====================================================
   RENDER
   ===================================================== */

function render() {
  renderPet();
  renderName();
  renderStats();
  renderAlerts();
  renderButtons();
  renderGameClock();
  renderPoops();
  renderSoundBtn();
}

function renderName() {
  const el = document.getElementById('pet-name');
  if (el) el.textContent = state.name || '';
}

function renderPet() {
  const petEl = document.querySelector('.pet');
  if (!petEl) return;

  // Remove all stage / state classes
  const stageClasses = [
    'pet--egg', 'pet--baby', 'pet--child', 'pet--teen',
    'pet--adult-good', 'pet--adult-avg', 'pet--adult-bad',
    'pet--sleeping', 'pet--sick', 'pet--dead',
  ];
  stageClasses.forEach(c => petEl.classList.remove(c));

  // Remove all char-- classes then apply current character
  Object.keys(CHARACTER_META).forEach(k => petEl.classList.remove('char--' + k));
  petEl.classList.add('char--' + (state.character || 'yoshi'));

  // Map stage to CSS class
  const stageClass = `pet--${state.stage}`;
  petEl.classList.add(stageClass);

  if (state.isSleeping) petEl.classList.add('pet--sleeping');
  if (state.isSick)     petEl.classList.add('pet--sick');

  // Screen dimming
  const screen = document.querySelector('.screen');
  if (screen) {
    screen.classList.toggle('lights-off', state.lightsOff);
  }
}

function renderStats() {
  renderHearts('hunger-hearts', state.hunger);
  renderHearts('happy-hearts',  state.happy);
}

function renderHearts(containerId, value) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const spans = container.querySelectorAll('.heart');
  spans.forEach((span, i) => {
    if (i < value) {
      span.classList.remove('empty');
      span.textContent = '♥';
    } else {
      span.classList.add('empty');
      span.textContent = '♡';
    }
  });
}

function renderAlerts() {
  const attEl  = document.querySelector('.icon-attention');
  const skullEl = document.querySelector('.icon-skull');
  if (!attEl || !skullEl) return;

  const needsAttention = !!state.attentionSince || state.isMisbehaving;
  attEl.classList.toggle('active', needsAttention);

  const isDanger = state.isSick || state.hunger === 0 || state.happy === 0;
  skullEl.classList.toggle('active', isDanger);
}

function renderButtons() {
  const btnMed   = document.getElementById('btn-medicine');
  const btnDisc  = document.getElementById('btn-discipline');
  const btnClean = document.getElementById('btn-clean');
  const btnLight = document.getElementById('btn-light');
  const btnPlay  = document.getElementById('btn-play');
  const btnFeed  = document.getElementById('btn-feed');

  if (btnMed)  btnMed.disabled  = !state.isSick;
  if (btnDisc) {
    btnDisc.disabled = !state.isMisbehaving;
    btnDisc.classList.toggle('active-glow', state.isMisbehaving);
  }
  if (btnClean) btnClean.disabled = state.poopCount === 0;
  if (btnPlay)  btnPlay.disabled  = state.isSleeping || state.stage === 'egg';
  if (btnFeed)  btnFeed.disabled  = state.stage === 'dead';

  // Light button label
  if (btnLight) {
    const lightIcon = btnLight.querySelector('.btn-icon');
    const lightLabel = btnLight.querySelector('.btn-label');
    if (state.isSleeping) {
      if (lightIcon)  lightIcon.textContent  = '🌙';
      if (lightLabel) lightLabel.textContent = 'Wake';
    } else {
      if (lightIcon)  lightIcon.textContent  = '💡';
      if (lightLabel) lightLabel.textContent = 'Light';
    }
  }
}

function renderGameClock() {
  const el = document.getElementById('game-clock');
  if (!el) return;
  const hours   = Math.floor(state.gameClockHours);
  const minutes = (state.gameClockHours % 1) >= 0.5 ? '30' : '00';
  const hh = String(hours).padStart(2, '0');
  el.textContent = `${hh}:${minutes}`;
}

function renderPoops() {
  const area = document.querySelector('.poop-area');
  if (!area) return;
  area.innerHTML = '';
  for (let i = 0; i < state.poopCount; i++) {
    const span = document.createElement('span');
    span.className = 'poop-icon';
    span.textContent = '💩';
    area.appendChild(span);
  }
}

/* =====================================================
   ANIMATIONS
   ===================================================== */

function animatePet(animClass) {
  const petEl = document.querySelector('.pet');
  if (!petEl) return;

  petEl.classList.remove('idle', 'bouncing', 'shaking', 'walking', 'dancing', 'lying-down');

  // Force reflow so removing and re-adding works
  void petEl.offsetWidth;

  petEl.classList.add(animClass);

  // Determine animation duration based on CSS
  const durations = { bouncing: 1200, shaking: 1200 };
  const duration  = durations[animClass] || 2000;

  setTimeout(() => {
    petEl.classList.remove(animClass);
    if (state.stage !== 'dead') petEl.classList.add('idle');
  }, duration);
}

/* =====================================================
   MODAL HELPERS
   ===================================================== */

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }
}

function openOverlay(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }
}

/* =====================================================
   TOAST
   ===================================================== */

function showToast(message, durationMs = 2000) {
  const existing = document.querySelectorAll('.toast');
  existing.forEach(t => t.remove());

  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  document.body.appendChild(div);

  setTimeout(() => {
    if (div.parentNode) div.remove();
  }, durationMs + 200);
}

/* =====================================================
   UTILITIES
   ===================================================== */

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function setEl(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/* =====================================================
   EVENT LISTENERS
   ===================================================== */

if (!IS_TEST) {
  document.addEventListener('DOMContentLoaded', () => {
  // Main buttons
  document.getElementById('btn-feed')
    .addEventListener('click', () => { openModal('feed-modal'); playSound('select'); });

  document.getElementById('btn-play')
    .addEventListener('click', play);

  document.getElementById('btn-medicine')
    .addEventListener('click', giveMedicine);

  document.getElementById('btn-clean')
    .addEventListener('click', clean);

  document.getElementById('btn-light')
    .addEventListener('click', toggleLight);

  document.getElementById('btn-status')
    .addEventListener('click', showStatus);

  document.getElementById('btn-discipline')
    .addEventListener('click', discipline);

  document.getElementById('btn-sound')
    .addEventListener('click', toggleSound);

  // Feed modal
  document.getElementById('btn-meal')
    .addEventListener('click', () => feed('meal'));

  document.getElementById('btn-snack')
    .addEventListener('click', () => feed('snack'));

  // Modal close buttons (data-close attribute)
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-close');
      closeModal(target);
      // Cancel any in-progress game cleanly
      if (target === 'game-modal') {
        gameState = null;
        const petEl = document.querySelector('.pet');
        if (petEl) petEl.classList.remove('facing-left', 'facing-right');
      }
    });
  });

  // Click outside modal to close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        const id = overlay.id;
        closeModal(id);
        if (id === 'game-modal') {
          gameState = null;
          const petEl = document.querySelector('.pet');
          if (petEl) petEl.classList.remove('facing-left', 'facing-right');
        }
      }
    });
  });

  // New game button → open setup screen
  document.getElementById('btn-new-game').addEventListener('click', () => {
    const deathScreen = document.getElementById('death-screen');
    if (deathScreen) {
      deathScreen.classList.remove('open');
      deathScreen.setAttribute('aria-hidden', 'true');
    }
    openSetupScreen();
  });

  // Setup screen: name input validation
  document.getElementById('pet-name-input')
    .addEventListener('input', validateSetup);

  // Setup screen: start game button
  document.getElementById('btn-start-game')
    .addEventListener('click', confirmSetup);

  // Status modal: history toggle
  document.getElementById('btn-show-history').addEventListener('click', () => {
    const tbl  = document.getElementById('status-table');
    const hist = document.getElementById('history-list');
    if (tbl)  tbl.style.display  = 'none';
    if (hist) hist.style.display = '';
    populateHistory();
  });

  document.getElementById('btn-history-back').addEventListener('click', () => {
    const tbl  = document.getElementById('status-table');
    const hist = document.getElementById('history-list');
    if (tbl)  tbl.style.display  = '';
    if (hist) hist.style.display = 'none';
  });

  // Click on pet → trigger a random activity immediately
  document.querySelector('.pet').addEventListener('click', () => {
    if (_canDoActivity()) startRandomActivity();
  });

  // Keyboard shortcut: Escape closes top modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal-overlay.open');
      if (openModals.length > 0) {
        const last = openModals[openModals.length - 1];
        last.classList.remove('open');
        last.setAttribute('aria-hidden', 'true');
        if (last.id === 'game-modal') {
          gameState = null;
          const petEl = document.querySelector('.pet');
          if (petEl) petEl.classList.remove('facing-left', 'facing-right');
        }
      }
    }
  });

  // Start the game
  initGame();

  // Apply idle animation after init
  const petEl = document.querySelector('.pet');
  if (petEl && state.stage !== 'dead') {
    petEl.classList.add('idle');
  }
  });
}

/* =====================================================
   TEST EXPORTS — active in Vitest and in browser (for e2e)
   ===================================================== */
globalThis._game = {
    CONFIG,
    get state() { return state; },
    setState(patch) { Object.assign(state, patch); },
    resetState() {
      const now = Date.now();
      state = {
        stage: 'egg', hunger: 4, happy: 4, weight: 5, discipline: 0,
        careMistakes: 0, isSick: false, medicineCount: 0, sickSince: null,
        isSleeping: false, lightsOff: false, poopCount: 0, nextPoopTick: 10,
        ticksSinceLastPoop: 0, bornAt: now, stageStartedAt: now, lastTickAt: now,
        attentionSince: null, gameClockHours: 10, tickCount: 0,
        hungerTicksSinceLoss: 0, happyTicksSinceLoss: 0,
        isMisbehaving: false, pendingLightMistake: null,
        name: '', character: 'yoshi',
      };
    },
    hourCrossed, randBetween,
    feed, giveMedicine, clean, discipline, toggleLight,
    checkEvolution, evolve, die, spawnPoop, makeSick,
    logCareMistake, triggerAttention,
    tick, silentTick, applyCatchUpTicks,
    save, load, startNewGame, loadCharacterSave, saveHistoryEntry, loadHistory,
    CHARACTER_CONFIGS, CHARACTER_META, getCharConfig,
    getSoundEnabled: () => soundEnabled,
    initSound,
    toggleSound,
    playSound,
    playMelody,
    stopMelody,
    startRandomActivity,
    stopCurrentActivity,
    scheduleNextActivity,
    getCurrentActivity: () => currentActivity,
    openSetupScreen,
    selectCharacter,
    validateSetup,
    confirmSetup,
    renderName,
    populateHistory,
  };
