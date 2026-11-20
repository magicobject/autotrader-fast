// Reading numbers out of display text ("26,760 miles", "£12,999", "7.3 seconds") and formatting them back.

/** The first number in a piece of text, ignoring thousands separators. Null when there is none. */
export function firstNumberIn(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

export function formatWholeNumber(value: number | null): string {
  return value === null || Number.isNaN(value) ? '' : Math.round(value).toLocaleString('en-GB');
}

export function formatPounds(value: number | null): string {
  return value === null || Number.isNaN(value) ? '' : '£' + Math.round(value).toLocaleString('en-GB');
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const MILLISECONDS_PER_DAY = 86_400_000;

export function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / MILLISECONDS_PER_DAY;
}
