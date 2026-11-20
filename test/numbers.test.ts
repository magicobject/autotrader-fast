import { describe, expect, it } from 'vitest';
import { daysBetween, firstNumberIn, formatPounds, formatWholeNumber } from '../src/shared/numbers.ts';

describe('firstNumberIn', () => {
  it('reads numbers out of display text', () => {
    expect(firstNumberIn('26,760 miles')).toBe(26760);
    expect(firstNumberIn('£12,999')).toBe(12999);
    expect(firstNumberIn('7.3 seconds')).toBe(7.3);
    expect(firstNumberIn('29E')).toBe(29);
  });

  it('gives null when there is no number', () => {
    expect(firstNumberIn('Not recorded')).toBeNull();
    expect(firstNumberIn(null)).toBeNull();
    expect(firstNumberIn(Number.NaN)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats for a British reader', () => {
    expect(formatWholeNumber(12473.02)).toBe('12,473');
    expect(formatPounds(1495)).toBe('£1,495');
    expect(formatPounds(null)).toBe('');
  });

  it('counts days between dates', () => {
    expect(daysBetween(new Date('2026-01-01T12:00'), new Date('2026-01-31T12:00'))).toBe(30);
  });
});
