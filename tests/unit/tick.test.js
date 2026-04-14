import { describe, it, expect, beforeEach, vi } from 'vitest';

let g;
beforeEach(() => {
  g = globalThis._game;
  g.resetState();
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('silentTick — hunger decay', () => {
  it('decrements hunger after HUNGER_DECAY_TICKS ticks', () => {
    g.setState({ stage: 'baby', hunger: 4, isSleeping: false, hungerTicksSinceLoss: 0 });
    for (let i = 0; i < g.CONFIG.HUNGER_DECAY_TICKS; i++) {
      g.silentTick();
    }
    expect(g.state.hunger).toBe(3);
  });

  it('does not decay below 0', () => {
    g.setState({ stage: 'baby', hunger: 0, isSleeping: false, hungerTicksSinceLoss: 0 });
    for (let i = 0; i < g.CONFIG.HUNGER_DECAY_TICKS * 2; i++) {
      g.silentTick();
    }
    expect(g.state.hunger).toBe(0);
  });

  it('does not decay while sleeping', () => {
    g.setState({ stage: 'baby', hunger: 4, isSleeping: true, hungerTicksSinceLoss: 0 });
    for (let i = 0; i < g.CONFIG.HUNGER_DECAY_TICKS * 2; i++) {
      g.silentTick();
    }
    expect(g.state.hunger).toBe(4);
  });
});

describe('silentTick — happy decay', () => {
  it('decrements happy after HAPPY_DECAY_TICKS ticks', () => {
    g.setState({ stage: 'baby', happy: 4, isSleeping: false, happyTicksSinceLoss: 0 });
    for (let i = 0; i < g.CONFIG.HAPPY_DECAY_TICKS; i++) {
      g.silentTick();
    }
    expect(g.state.happy).toBe(3);
  });

  it('does not decay while sleeping', () => {
    g.setState({ stage: 'baby', happy: 4, isSleeping: true, happyTicksSinceLoss: 0 });
    for (let i = 0; i < g.CONFIG.HAPPY_DECAY_TICKS * 2; i++) {
      g.silentTick();
    }
    expect(g.state.happy).toBe(4);
  });
});

describe('spawnPoop', () => {
  it('increments poopCount', () => {
    g.setState({ stage: 'baby', poopCount: 0 });
    g.spawnPoop();
    expect(g.state.poopCount).toBe(1);
  });
  it('does not spawn poop when stage is egg', () => {
    g.setState({ stage: 'egg', poopCount: 0 });
    g.spawnPoop();
    expect(g.state.poopCount).toBe(0);
  });
  it('resets ticksSinceLastPoop to 0', () => {
    g.setState({ stage: 'baby', ticksSinceLastPoop: 15 });
    g.spawnPoop();
    expect(g.state.ticksSinceLastPoop).toBe(0);
  });
  it('sets nextPoopTick within valid range', () => {
    g.setState({ stage: 'baby' });
    for (let i = 0; i < 20; i++) {
      g.spawnPoop();
      expect(g.state.nextPoopTick).toBeGreaterThanOrEqual(g.CONFIG.POOP_MIN_TICKS);
      expect(g.state.nextPoopTick).toBeLessThanOrEqual(g.CONFIG.POOP_MAX_TICKS);
    }
  });
  it('causes sickness when poopCount reaches threshold', () => {
    g.setState({ stage: 'baby', poopCount: g.CONFIG.POOP_SICK_THRESHOLD - 1, isSick: false });
    g.spawnPoop();
    expect(g.state.isSick).toBe(true);
  });
});

describe('tick — game clock', () => {
  it('advances gameClockHours by GAME_HOURS_PER_TICK', () => {
    g.setState({
      stage: 'baby', gameClockHours: 10,
      stageStartedAt: Date.now(),
      bornAt: Date.now(),
    });
    const initialHour = g.state.gameClockHours;
    g.tick();
    expect(g.state.gameClockHours).toBeCloseTo(initialHour + g.CONFIG.GAME_HOURS_PER_TICK, 5);
  });

  it('wraps clock at 24', () => {
    g.setState({
      stage: 'baby', gameClockHours: 23.8,
      stageStartedAt: Date.now(),
      bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.gameClockHours).toBeLessThan(24);
    expect(g.state.gameClockHours).toBeGreaterThanOrEqual(0);
  });
});

describe('tick — weight sickness', () => {
  it('makes pet sick when weight >= threshold', () => {
    g.setState({
      stage: 'baby', weight: g.CONFIG.WEIGHT_SICK_THRESHOLD, isSick: false,
      stageStartedAt: Date.now(),
      bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.isSick).toBe(true);
  });
  it('does not make sick again if already sick', () => {
    const ts = Date.now() - 1000;
    g.setState({
      stage: 'baby', weight: g.CONFIG.WEIGHT_SICK_THRESHOLD,
      isSick: true, sickSince: ts,
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.sickSince).toBe(ts); // unchanged
  });
});

describe('tick — sick death', () => {
  it('does NOT die before SICK_DEATH_DELAY_MS', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // below death chance
    g.setState({
      stage: 'baby',
      isSick: true,
      sickSince: Date.now() - (g.CONFIG.SICK_DEATH_DELAY_MS - 5000), // not yet elapsed
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.stage).not.toBe('dead');
  });
  it('can die after SICK_DEATH_DELAY_MS when random below threshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // 0.01 < 0.20
    g.setState({
      stage: 'baby',
      isSick: true,
      sickSince: Date.now() - g.CONFIG.SICK_DEATH_DELAY_MS - 1000,
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.stage).toBe('dead');
  });
  it('does NOT die when random above threshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 0.99 > 0.20
    g.setState({
      stage: 'baby',
      isSick: true,
      sickSince: Date.now() - g.CONFIG.SICK_DEATH_DELAY_MS - 1000,
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.stage).not.toBe('dead');
  });
});

describe('tick — attention timeout → care mistake', () => {
  it('logs care mistake when attention ignored too long', () => {
    const longAgo = Date.now() - g.CONFIG.ATTENTION_MISTAKE_MS - 1000;
    g.setState({
      stage: 'baby', attentionSince: longAgo, careMistakes: 0,
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.careMistakes).toBe(1);
    expect(g.state.attentionSince).toBeNull();
  });
  it('does NOT log mistake within attention window', () => {
    g.setState({
      stage: 'baby', attentionSince: Date.now() - 1000, careMistakes: 0,
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.careMistakes).toBe(0);
  });
});

describe('tick — light mistake', () => {
  it('logs care mistake when pendingLightMistake exceeds window', () => {
    const longAgo = Date.now() - g.CONFIG.LIGHT_MISTAKE_WINDOW_MS - 1000;
    g.setState({
      stage: 'baby', pendingLightMistake: longAgo, careMistakes: 0,
      stageStartedAt: Date.now(), bornAt: Date.now(),
    });
    g.tick();
    expect(g.state.careMistakes).toBe(1);
    expect(g.state.pendingLightMistake).toBeNull();
  });
});
