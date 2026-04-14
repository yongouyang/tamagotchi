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
