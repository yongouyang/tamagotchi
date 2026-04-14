import { describe, it, expect, beforeEach } from 'vitest';

const G = globalThis._game;

describe('Activity system', () => {
  beforeEach(() => {
    G.setState({ stage: 'baby', isSick: false, isSleeping: false });
    G.stopCurrentActivity(); // ensure clean slate
  });

  it('startRandomActivity sets currentActivity to a valid key', () => {
    G.startRandomActivity();
    expect(['walk', 'dance', 'rest']).toContain(G.getCurrentActivity());
  });

  it('stopCurrentActivity clears currentActivity', () => {
    G.startRandomActivity();
    G.stopCurrentActivity();
    expect(G.getCurrentActivity()).toBeNull();
  });

  it('does not start activity when isSleeping is true', () => {
    G.setState({ isSleeping: true });
    G.startRandomActivity();
    expect(G.getCurrentActivity()).toBeNull();
  });

  it('does not start activity when isSick is true', () => {
    G.setState({ isSick: true });
    G.startRandomActivity();
    expect(G.getCurrentActivity()).toBeNull();
  });

  it('does not start activity on egg stage', () => {
    G.setState({ stage: 'egg' });
    G.startRandomActivity();
    expect(G.getCurrentActivity()).toBeNull();
  });

  it('does not start activity on dead stage', () => {
    G.setState({ stage: 'dead' });
    G.startRandomActivity();
    expect(G.getCurrentActivity()).toBeNull();
  });

  it('playMelody does not throw when sound is enabled', () => {
    expect(() => G.playMelody('walk')).not.toThrow();
  });

  it('stopMelody does not throw after playMelody', () => {
    G.playMelody('dance');
    expect(() => G.stopMelody()).not.toThrow();
  });
});
