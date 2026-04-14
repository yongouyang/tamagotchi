import { describe, it, expect, beforeEach, vi } from 'vitest';

let g;
beforeEach(() => {
  g = globalThis._game;
  g.resetState();
  localStorage.clear();
  vi.useRealTimers();
});

describe('logCareMistake', () => {
  it('increments careMistakes by 1', () => {
    g.setState({ careMistakes: 2 });
    g.logCareMistake('test');
    expect(g.state.careMistakes).toBe(3);
  });
  it('starts from 0', () => {
    g.logCareMistake('test');
    expect(g.state.careMistakes).toBe(1);
  });
});

describe('triggerAttention', () => {
  it('sets attentionSince to a timestamp', () => {
    g.setState({ attentionSince: null });
    const before = Date.now();
    g.triggerAttention('hunger');
    expect(g.state.attentionSince).toBeGreaterThanOrEqual(before);
  });
  it('does not overwrite existing attentionSince', () => {
    const earlier = Date.now() - 5000;
    g.setState({ attentionSince: earlier });
    g.triggerAttention('hunger');
    expect(g.state.attentionSince).toBe(earlier);
  });
});

describe('makeSick', () => {
  it('sets isSick and records sickSince', () => {
    g.setState({ isSick: false });
    const before = Date.now();
    g.makeSick('poop');
    expect(g.state.isSick).toBe(true);
    expect(g.state.sickSince).toBeGreaterThanOrEqual(before);
    expect(g.state.medicineCount).toBe(0);
  });
  it('is a no-op if already sick', () => {
    const ts = Date.now() - 3000;
    g.setState({ isSick: true, sickSince: ts });
    g.makeSick('poop');
    expect(g.state.sickSince).toBe(ts);
  });
});

describe('evolve', () => {
  it('updates stage and resets stageStartedAt', () => {
    g.setState({ stage: 'egg' });
    const before = Date.now();
    g.evolve('baby');
    expect(g.state.stage).toBe('baby');
    expect(g.state.stageStartedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('checkEvolution', () => {
  it('does not evolve before duration elapses', () => {
    const now = Date.now();
    g.setState({ stage: 'egg', stageStartedAt: now });
    g.checkEvolution();
    expect(g.state.stage).toBe('egg');
  });

  it('evolves egg→baby after duration', () => {
    const past = Date.now() - g.CONFIG.STAGE_DURATIONS_MS.egg - 1000;
    g.setState({ stage: 'egg', stageStartedAt: past });
    g.checkEvolution();
    expect(g.state.stage).toBe('baby');
  });

  it('evolves baby→child after duration', () => {
    const past = Date.now() - g.CONFIG.STAGE_DURATIONS_MS.baby - 1000;
    g.setState({ stage: 'baby', stageStartedAt: past });
    g.checkEvolution();
    expect(g.state.stage).toBe('child');
  });

  it('evolves teen→adult-good with 0 care mistakes', () => {
    const past = Date.now() - g.CONFIG.STAGE_DURATIONS_MS.teen - 1000;
    g.setState({ stage: 'teen', stageStartedAt: past, careMistakes: 0 });
    g.checkEvolution();
    expect(g.state.stage).toBe('adult-good');
  });

  it('evolves teen→adult-avg with 3 care mistakes', () => {
    const past = Date.now() - g.CONFIG.STAGE_DURATIONS_MS.teen - 1000;
    g.setState({ stage: 'teen', stageStartedAt: past, careMistakes: 3 });
    g.checkEvolution();
    expect(g.state.stage).toBe('adult-avg');
  });

  it('evolves teen→adult-bad with 6+ care mistakes', () => {
    const past = Date.now() - g.CONFIG.STAGE_DURATIONS_MS.teen - 1000;
    g.setState({ stage: 'teen', stageStartedAt: past, careMistakes: 6 });
    g.checkEvolution();
    expect(g.state.stage).toBe('adult-bad');
  });

  it('does not evolve adult stages', () => {
    g.setState({ stage: 'adult-good', stageStartedAt: Date.now() - 99999999 });
    g.checkEvolution();
    expect(g.state.stage).toBe('adult-good');
  });
});

describe('die', () => {
  it('sets stage to dead', () => {
    g.setState({ stage: 'adult-good' });
    g.die('sickness');
    expect(g.state.stage).toBe('dead');
  });
  it('clears attentionSince', () => {
    g.setState({ attentionSince: Date.now() });
    g.die('sickness');
    expect(g.state.attentionSince).toBeNull();
  });
});
