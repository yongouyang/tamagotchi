import { describe, it, expect, beforeEach } from 'vitest';

let g;
beforeEach(() => {
  g = globalThis._game;
  g.resetState();
  localStorage.clear();
});

describe('sound toggle', () => {
  it('soundEnabled is true by default', () => {
    expect(globalThis._game.state).toBeDefined(); // game loaded
    // After initSound with no localStorage entry, soundEnabled should be true
    localStorage.removeItem('tamagotchi_sound');
    g.initSound();
    expect(g.getSoundEnabled()).toBe(true);
  });

  it('toggleSound flips soundEnabled to false', () => {
    g.initSound(); // ensure true
    g.toggleSound();
    expect(g.getSoundEnabled()).toBe(false);
  });

  it('toggleSound twice returns to true', () => {
    g.initSound();
    g.toggleSound();
    g.toggleSound();
    expect(g.getSoundEnabled()).toBe(true);
  });

  it('toggleSound persists state to localStorage', () => {
    g.initSound();
    g.toggleSound(); // → false
    expect(localStorage.getItem('tamagotchi_sound')).toBe('false');
    g.toggleSound(); // → true
    expect(localStorage.getItem('tamagotchi_sound')).toBe('true');
  });

  it('initSound reads false from localStorage', () => {
    localStorage.setItem('tamagotchi_sound', 'false');
    g.initSound();
    expect(g.getSoundEnabled()).toBe(false);
  });

  it('playSound does not throw when enabled', () => {
    g.initSound();
    expect(() => g.playSound('coin')).not.toThrow();
    expect(() => g.playSound('death')).not.toThrow();
    expect(() => g.playSound('oneup')).not.toThrow();
  });

  it('playSound does not throw when disabled', () => {
    g.initSound();
    g.toggleSound(); // disable
    expect(() => g.playSound('coin')).not.toThrow();
  });

  it('playSound with unknown key does not throw', () => {
    expect(() => g.playSound('this_does_not_exist')).not.toThrow();
  });
});
