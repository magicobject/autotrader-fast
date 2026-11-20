// Every text/background colour pairing used by the extension meets WCAG AA, and the ratios
// recorded in static/styles.css match what the tokens actually give.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('static/styles.css', 'utf8');

function token(name: string): string {
  const value = styles.match(new RegExp(`--atf-${name}:\\s*(#[0-9a-f]{6});`, 'i'))?.[1];
  if (value === undefined) throw new Error(`No colour token --atf-${name}`);
  return value;
}

function relativeLuminance(hexColour: string): number {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hexColour.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const TEXT = 4.5;
const USER_INTERFACE = 3;

/** [foreground token, background token, minimum ratio] */
const PAIRINGS: readonly (readonly [string, string, number])[] = [
  ['ink', 'paper', TEXT],
  ['ink', 'canvas', TEXT],
  ['ink', 'heading-bg', TEXT],
  ['ink', 'heading-sorted', TEXT],
  ['ink', 'reg-yellow', TEXT],
  ['ink', 'amber', TEXT],
  ['ink', 'card', TEXT],
  ['ink', 'new-row', TEXT],
  ['ink', 'hover-row', TEXT],
  ['on-dark', 'navy', TEXT],
  ['on-dark', 'navy-hover', TEXT],
  ['on-dark', 'red', TEXT],
  ['on-dark', 'green', TEXT],
  ['on-dark', 'pill-green', TEXT],
  ['muted', 'paper', TEXT],
  ['muted', 'new-row', TEXT],
  ['muted', 'hover-row', TEXT],
  ['muted', 'card', TEXT],
  ['label', 'paper', TEXT],
  ['link', 'paper', TEXT],
  ['link', 'new-row', TEXT],
  ['link', 'hover-row', TEXT],
  ['price-down', 'paper', TEXT],
  ['price-down', 'new-row', TEXT],
  ['price-up', 'paper', TEXT],
  ['price-up', 'new-row', TEXT],
  ['red-text', 'card', TEXT],
  ['amber-dot', 'card', USER_INTERFACE],
  ['red', 'card', USER_INTERFACE],
  ['green', 'card', USER_INTERFACE],
  ['focus', 'paper', USER_INTERFACE],
  ['focus', 'canvas', USER_INTERFACE],
];

describe('colour contrast', () => {
  it.each(PAIRINGS)('%s on %s meets %s:1', (foreground, background, minimum) => {
    expect(contrastRatio(token(foreground), token(background))).toBeGreaterThanOrEqual(minimum);
  });

  it('input borders are visible (3:1 against the page)', () => {
    expect(contrastRatio('#8a919b', token('paper'))).toBeGreaterThanOrEqual(USER_INTERFACE);
  });

  it('the ratios written in the stylesheet are the real ones', () => {
    const recorded = [...styles.matchAll(/--atf-([a-z-]+) #[0-9a-f]{6} on --atf-([a-z-]+)(?: #[0-9a-f]{6})? (\d+\.\d\d)/g)];
    expect(recorded.length).toBeGreaterThan(5);
    for (const [, foreground = '', background = '', ratio = ''] of recorded) {
      expect(contrastRatio(token(foreground), token(background)).toFixed(2), `${foreground} on ${background}`).toBe(ratio);
    }
  });
});
