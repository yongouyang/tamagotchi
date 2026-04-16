import { describe, it, expect, beforeEach } from 'vitest';

const { hourCrossed, randBetween } = globalThis._game;

describe('hourCrossed', () => {
  it('detects forward crossing', () => {
    expect(hourCrossed(8.5, 9.0, 9)).toBe(true);
  });
  it('detects no crossing when target not passed', () => {
    expect(hourCrossed(8.0, 8.5, 9)).toBe(false);
  });
  it('detects midnight wrap crossing', () => {
    // Goes from 23.5 to 0.0 (wrapped), should cross target=0
    expect(hourCrossed(23.5, 0.0, 0)).toBe(true);
  });
  it('does not falsely cross with exact start value', () => {
    expect(hourCrossed(9.0, 9.5, 9)).toBe(false);
  });
  it('handles crossing from just before to target exactly', () => {
    expect(hourCrossed(19.5, 20.0, 20)).toBe(true);
  });
});

describe('randBetween', () => {
  it('always returns value in [min, max]', () => {
    for (let i = 0; i < 100; i++) {
      const v = randBetween(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
  it('works when min equals max', () => {
    expect(randBetween(7, 7)).toBe(7);
  });
  it('returns integer', () => {
    for (let i = 0; i < 20; i++) {
      expect(Number.isInteger(randBetween(1, 9))).toBe(true);
    }
  });
});

describe('setSpeed', () => {
  const { setSpeed, checkEvolution, CONFIG } = globalThis._game;

  beforeEach(() => {
    globalThis._game.resetState();
  });

  it('setSpeed(2) updates state.speed to 2', () => {
    setSpeed(2);
    expect(globalThis._game.state.speed).toBe(2);
  });

  it('setSpeed(4) updates state.speed to 4', () => {
    setSpeed(4);
    expect(globalThis._game.state.speed).toBe(4);
  });

  it('setSpeed(1) resets state.speed to 1', () => {
    setSpeed(4);
    setSpeed(1);
    expect(globalThis._game.state.speed).toBe(1);
  });
});

describe('checkEvolution with speed scaling', () => {
  const { checkEvolution, CONFIG } = globalThis._game;

  beforeEach(() => {
    globalThis._game.resetState();
  });

  it('does not evolve egg before stage duration at 1×', () => {
    const halfDuration = CONFIG.STAGE_DURATIONS_MS.egg / 2;
    globalThis._game.setState({
      stage: 'egg',
      stageStartedAt: Date.now() - halfDuration,
      speed: 1,
    });
    checkEvolution();
    expect(globalThis._game.state.stage).toBe('egg');
  });

  it('evolves egg to baby once real duration elapsed at 1×', () => {
    globalThis._game.setState({
      stage: 'egg',
      stageStartedAt: Date.now() - CONFIG.STAGE_DURATIONS_MS.egg - 1000,
      speed: 1,
    });
    checkEvolution();
    expect(globalThis._game.state.stage).toBe('baby');
  });

  it('evolves egg to baby at 2× after half the real duration', () => {
    const halfDuration = CONFIG.STAGE_DURATIONS_MS.egg / 2;
    globalThis._game.setState({
      stage: 'egg',
      stageStartedAt: Date.now() - halfDuration - 1000,
      speed: 2,
    });
    checkEvolution();
    expect(globalThis._game.state.stage).toBe('baby');
  });

  it('does not evolve egg at 2× before half the real duration', () => {
    const quarterDuration = CONFIG.STAGE_DURATIONS_MS.egg / 4;
    globalThis._game.setState({
      stage: 'egg',
      stageStartedAt: Date.now() - quarterDuration,
      speed: 2,
    });
    checkEvolution();
    expect(globalThis._game.state.stage).toBe('egg');
  });

  it('evolves egg to baby at 4× after quarter of the real duration', () => {
    const quarterDuration = CONFIG.STAGE_DURATIONS_MS.egg / 4;
    globalThis._game.setState({
      stage: 'egg',
      stageStartedAt: Date.now() - quarterDuration - 1000,
      speed: 4,
    });
    checkEvolution();
    expect(globalThis._game.state.stage).toBe('baby');
  });
});
