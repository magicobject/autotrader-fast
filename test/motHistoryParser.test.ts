// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readMotHistoryPage } from '../src/mot/motHistoryParser.ts';
import { motHistoryPageHtml, NOT_FOUND_PAGE_HTML } from './fixtures/motHistoryPage.ts';

const parse = (html: string) => readMotHistoryPage(new DOMParser().parseFromString(html, 'text/html'));

describe('readMotHistoryPage', () => {
  it('reads the vehicle and every test, oldest first', () => {
    const reading = parse(
      motHistoryPageHtml({
        motDue: '7 February 2027',
        tests: [
          {
            date: '4 February 2026',
            result: 'PASS',
            odometer: '179,051 miles',
            expiry: '7 February 2027',
            defects: { advisory: ['Nearside Front Tyre worn close to legal limit (5.2.3 (e))'] },
          },
          {
            date: '3 February 2025',
            result: 'FAIL',
            odometer: '160,428 miles',
            defects: { dangerous: ['Offside Rear Brake pipe excessively corroded (1.1.11 (c)) Dangerous'] },
          },
          { date: '1 March 2024', result: 'PASS', odometer: '100,000 km', expiry: '28 February 2025' },
        ],
      }),
    );
    expect(reading.kind).toBe('found');
    if (reading.kind !== 'found') return;
    const { history } = reading;
    expect(history.registrationShown).toBe('ZZ99 ZZZ');
    expect(history.makeAndModel).toBe('MAZDA MX-5');
    expect(history.motValidUntil?.toDateString()).toBe(new Date(2027, 1, 7).toDateString());
    expect(history.tests.map((test) => test.outcome)).toEqual(['pass', 'fail', 'pass']);
    expect(history.tests[0]?.odometerMiles).toBe(62137); // kilometres converted
    expect(history.tests[1]?.defects).toEqual([
      { severity: 'dangerous', description: 'Offside Rear Brake pipe excessively corroded (1.1.11 (c))' },
    ]);
    expect(history.tests[2]?.defects[0]?.severity).toBe('advisory');
  });

  it('puts a same-day fail before its retest, so the pass counts as the latest test', () => {
    const reading = parse(
      motHistoryPageHtml({
        tests: [
          { date: '3 February 2024', result: 'PASS', odometer: '158,065 miles', expiry: '2 February 2025' },
          {
            date: '3 February 2024',
            result: 'FAIL',
            odometer: '158,065 miles',
            defects: { major: ['Rear Shock absorber leaking (5.3.2)'] },
          },
          { date: '8 February 2023', result: 'PASS', odometer: '154,607 miles', expiry: '7 February 2024' },
        ],
      }),
    );
    expect(reading.kind === 'found' && reading.history.tests.map((test) => test.outcome)).toEqual(['pass', 'fail', 'pass']);
  });

  it('ignores the per-test V5C log-book boxes', () => {
    const reading = parse(motHistoryPageHtml({ tests: [{ date: '4 February 2026', result: 'PASS', odometer: '1,000 miles' }] }));
    expect(reading.kind === 'found' && reading.history.tests[0]?.defects).toEqual([]);
  });

  it('reports a registration GOV.UK does not know', () => {
    expect(parse(NOT_FOUND_PAGE_HTML)).toEqual({
      kind: 'not-found',
      message: 'Check that the registration you entered is correct.',
    });
  });
});
