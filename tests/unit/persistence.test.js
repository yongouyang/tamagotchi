import { describe, it, expect, beforeEach, vi } from 'vitest';

let g;
beforeEach(() => {
  g = globalThis._game;
  g.resetState();
  localStorage.clear();
});

describe('save and load', () => {
  it('round-trips all key state fields', () => {
    g.setState({
      stage: 'child', hunger: 2, happy: 3, weight: 9, discipline: 1,
      careMistakes: 2, isSick: true, medicineCount: 1, poopCount: 1,
      gameClockHours: 15,
    });
    g.save();
    const loaded = g.load();
    expect(loaded.stage).toBe('child');
    expect(loaded.hunger).toBe(2);
    expect(loaded.happy).toBe(3);
    expect(loaded.weight).toBe(9);
    expect(loaded.careMistakes).toBe(2);
    expect(loaded.isSick).toBe(true);
    expect(loaded.medicineCount).toBe(1);
    expect(loaded.poopCount).toBe(1);
    expect(loaded.gameClockHours).toBe(15);
  });

  it('returns null when localStorage is empty', () => {
    expect(g.load()).toBeNull();
  });

  it('returns null and warns on malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('tamagotchi_save', 'NOT_JSON{{{');
    expect(g.load()).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('applyCatchUpTicks', () => {
  it('applies the correct number of ticks for elapsed time', () => {
    g.setState({ stage: 'baby', hunger: 4, isSleeping: false, hungerTicksSinceLoss: 0 });
    const twoTicks = g.CONFIG.TICK_INTERVAL_MS * 2;
    const hungerBefore = g.state.hunger;
    g.applyCatchUpTicks(twoTicks);
    // 2 ticks out of 8 needed for decay — hunger should not have changed yet
    expect(g.state.tickCount).toBeGreaterThanOrEqual(2);
  });

  it('caps at MAX_CATCHUP_TICKS', () => {
    g.setState({ stage: 'baby', tickCount: 0 });
    const hugeMs = g.CONFIG.TICK_INTERVAL_MS * (g.CONFIG.MAX_CATCHUP_TICKS + 50);
    g.applyCatchUpTicks(hugeMs);
    expect(g.state.tickCount).toBeLessThanOrEqual(g.CONFIG.MAX_CATCHUP_TICKS);
  });

  it('applies zero ticks for zero elapsed time', () => {
    g.setState({ stage: 'baby', tickCount: 5 });
    g.applyCatchUpTicks(0);
    expect(g.state.tickCount).toBe(5);
  });

  it('decrements hunger after enough catch-up ticks', () => {
    g.setState({
      stage: 'baby', hunger: 4, isSleeping: false,
      hungerTicksSinceLoss: 0, tickCount: 0,
    });
    const enoughMs = g.CONFIG.TICK_INTERVAL_MS * g.CONFIG.HUNGER_DECAY_TICKS;
    g.applyCatchUpTicks(enoughMs);
    expect(g.state.hunger).toBe(3);
  });
});
