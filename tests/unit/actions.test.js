import { describe, it, expect, beforeEach, vi } from 'vitest';

let g;
beforeEach(() => {
  g = globalThis._game;
  g.resetState();
  localStorage.clear();
});

describe('feed(meal)', () => {
  it('increases hunger by 1', () => {
    g.setState({ stage: 'baby', hunger: 2 });
    g.feed('meal');
    expect(g.state.hunger).toBe(3);
  });
  it('increases weight by 1', () => {
    g.setState({ stage: 'baby', weight: 5, hunger: 2 });
    g.feed('meal');
    expect(g.state.weight).toBe(6);
  });
  it('clears attentionSince when hunger is restored', () => {
    g.setState({ stage: 'baby', hunger: 0, attentionSince: Date.now() - 1000 });
    g.feed('meal');
    expect(g.state.attentionSince).toBeNull();
  });
  it('does nothing when sick', () => {
    g.setState({ stage: 'baby', hunger: 2, isSick: true });
    g.feed('meal');
    expect(g.state.hunger).toBe(2);
  });
  it('does nothing when stage is egg', () => {
    g.setState({ stage: 'egg', hunger: 2 });
    g.feed('meal');
    expect(g.state.hunger).toBe(2);
  });
  it('caps hunger at 4', () => {
    g.setState({ stage: 'baby', hunger: 4 });
    // Force Math.random to avoid refusal branch
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    g.feed('meal');
    expect(g.state.hunger).toBe(4);
    vi.restoreAllMocks();
  });
  it('sets isMisbehaving when pet refuses meal at high hunger', () => {
    g.setState({ stage: 'baby', hunger: 3, isMisbehaving: false });
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.3 → refusal
    g.feed('meal');
    expect(g.state.isMisbehaving).toBe(true);
    vi.restoreAllMocks();
  });
  it('does not refuse when hunger < 3', () => {
    g.setState({ stage: 'baby', hunger: 2, isMisbehaving: false });
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    g.feed('meal');
    expect(g.state.isMisbehaving).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('feed(snack)', () => {
  it('increases happy by 1', () => {
    g.setState({ stage: 'baby', happy: 2 });
    g.feed('snack');
    expect(g.state.happy).toBe(3);
  });
  it('increases weight by 2', () => {
    g.setState({ stage: 'baby', weight: 5 });
    g.feed('snack');
    expect(g.state.weight).toBe(7);
  });
  it('caps happy at 4', () => {
    g.setState({ stage: 'baby', happy: 4 });
    g.feed('snack');
    expect(g.state.happy).toBe(4);
  });
  it('does not change hunger', () => {
    g.setState({ stage: 'baby', hunger: 2 });
    g.feed('snack');
    expect(g.state.hunger).toBe(2);
  });
});

describe('giveMedicine', () => {
  it('is a no-op when not sick', () => {
    g.setState({ isSick: false, medicineCount: 0 });
    g.giveMedicine();
    expect(g.state.medicineCount).toBe(0);
  });
  it('increments medicineCount when sick', () => {
    g.setState({ isSick: true, medicineCount: 0, sickSince: Date.now() });
    g.giveMedicine();
    expect(g.state.medicineCount).toBe(1);
    expect(g.state.isSick).toBe(true);
  });
  it('cures pet after 3 doses', () => {
    g.setState({ isSick: true, medicineCount: 2, sickSince: Date.now() });
    g.giveMedicine();
    expect(g.state.isSick).toBe(false);
    expect(g.state.medicineCount).toBe(0);
    expect(g.state.sickSince).toBeNull();
  });
  it('clears attention when cured', () => {
    g.setState({ isSick: true, medicineCount: 2, sickSince: Date.now(), attentionSince: Date.now() });
    g.giveMedicine();
    expect(g.state.attentionSince).toBeNull();
  });
});

describe('clean', () => {
  it('is a no-op when no poop', () => {
    g.setState({ poopCount: 0 });
    g.clean();
    expect(g.state.poopCount).toBe(0);
  });
  it('resets poopCount to 0', () => {
    g.setState({ poopCount: 2, attentionSince: Date.now() });
    g.clean();
    expect(g.state.poopCount).toBe(0);
  });
  it('clears attentionSince', () => {
    g.setState({ poopCount: 1, attentionSince: Date.now() });
    g.clean();
    expect(g.state.attentionSince).toBeNull();
  });
});

describe('discipline', () => {
  it('is a no-op when not misbehaving', () => {
    g.setState({ isMisbehaving: false, discipline: 1 });
    g.discipline();
    expect(g.state.discipline).toBe(1);
  });
  it('increments discipline and clears misbehaving flag', () => {
    g.setState({ isMisbehaving: true, discipline: 1 });
    g.discipline();
    expect(g.state.discipline).toBe(2);
    expect(g.state.isMisbehaving).toBe(false);
  });
  it('caps discipline at 4', () => {
    g.setState({ isMisbehaving: true, discipline: 4 });
    g.discipline();
    expect(g.state.discipline).toBe(4);
  });
});

describe('toggleLight', () => {
  it('wakes pet when sleeping', () => {
    g.setState({ isSleeping: true, lightsOff: true });
    g.toggleLight();
    expect(g.state.isSleeping).toBe(false);
    expect(g.state.lightsOff).toBe(false);
    expect(g.state.gameClockHours).toBe(9);
  });
  it('puts pet to sleep at valid bedtime hour (≥20)', () => {
    g.setState({ isSleeping: false, lightsOff: false, gameClockHours: 21 });
    g.toggleLight();
    expect(g.state.isSleeping).toBe(true);
    expect(g.state.lightsOff).toBe(true);
  });
  it('puts pet to sleep at early morning hour (<9)', () => {
    g.setState({ isSleeping: false, lightsOff: false, gameClockHours: 3 });
    g.toggleLight();
    expect(g.state.isSleeping).toBe(true);
    expect(g.state.lightsOff).toBe(true);
  });
  it('does not sleep at daytime hour', () => {
    g.setState({ isSleeping: false, lightsOff: false, gameClockHours: 14 });
    g.toggleLight();
    expect(g.state.isSleeping).toBe(false);
  });
  it('clears pendingLightMistake when player responds', () => {
    g.setState({ isSleeping: false, gameClockHours: 21, pendingLightMistake: Date.now() - 1000 });
    g.toggleLight();
    expect(g.state.pendingLightMistake).toBeNull();
  });
});
