import { describe, expect, it } from 'vitest';
import { analyseMotHistory, classifyDefect, defectComponentKey } from '../src/mot/motHistoryAnalysis.ts';
import type { DefectSeverity, MotHistory, MotTest } from '../src/mot/motHistoryTypes.ts';

const TODAY = new Date('2026-11-20T12:00');
const day = (isoDate: string): Date => new Date(`${isoDate}T12:00`);

function passedTest(isoDate: string, miles: number | null, defects: readonly [DefectSeverity, string][] = []): MotTest {
  const expiry = day(isoDate);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return {
    testDate: day(isoDate),
    outcome: 'pass',
    odometerMiles: miles,
    expiryDate: expiry,
    defects: defects.map(([severity, description]) => ({ severity, description })),
  };
}

function history(tests: readonly MotTest[], overrides: Partial<MotHistory> = {}): MotHistory {
  return {
    registrationShown: 'ZZ99 ZZZ',
    makeAndModel: 'MAZDA MX-5',
    firstRegisteredDate: day('2016-06-30'),
    motValidUntil: day('2027-06-01'),
    motStatusText: '',
    tests,
    ...overrides,
  };
}

/** Yearly tests from 2019 to 2026 at about 8,000 miles a year. */
function steadyTests(extraDefectsOnLatest: readonly [DefectSeverity, string][] = []): MotTest[] {
  return [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year, index, years) =>
    passedTest(`${year}-06-01`, 20_000 + index * 8000, index === years.length - 1 ? extraDefectsOnLatest : []),
  );
}

const levels = (tests: readonly MotTest[], context = {}) =>
  analyseMotHistory(history(tests), { today: TODAY, ...context }).findings.map((finding) => finding.level);

describe('analyseMotHistory', () => {
  it('is green for a steady history with only consumables', () => {
    const summary = analyseMotHistory(history(steadyTests([['advisory', 'Front Tyre worn close to legal limit (5.2.3 (e))']])), {
      today: TODAY,
    });
    expect(summary.overall).toBe('green');
    expect(summary.findings.map((finding) => finding.explanation)).toContainEqual(
      expect.stringMatching(/^Mileage rises steadily across 8 readings \(about 8,0\d\d miles a year\)\.$/),
    );
    expect(summary.testCount).toBe(8);
  });

  it('is red for a missing MOT year', () => {
    const tests = steadyTests().filter((test) => test.testDate.getFullYear() !== 2022);
    const summary = analyseMotHistory(history(tests), { today: TODAY });
    expect(summary.overall).toBe('red');
    expect(summary.findings[0]?.explanation).toMatch(/^No MOT for about 12 months: expired 1 Jun 2022, next test 1 Jun 2023\.$/);
  });

  it('is amber for a short lapse', () => {
    const tests = steadyTests();
    tests[3] = passedTest('2022-07-15', tests[3]?.odometerMiles ?? null);
    expect(levels(tests)).toContain('amber');
  });

  it('is red when the mileage goes backwards', () => {
    const tests = steadyTests();
    tests[5] = passedTest('2024-06-01', 10_000);
    expect(analyseMotHistory(history(tests), { today: TODAY }).overall).toBe('red');
  });

  it('is red when the advert claims fewer miles than the last MOT', () => {
    const summary = analyseMotHistory(history(steadyTests()), { today: TODAY, advertisedMileage: 50_000 });
    expect(summary.findings[0]).toEqual({
      level: 'red',
      explanation: 'Advert says 50,000 miles, but the last MOT recorded 76,000 on 1 Jun 2026.',
    });
  });

  it('flags a run of very low mileage once, as amber', () => {
    const tests = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024].map((year, index) =>
      passedTest(`${year}-06-01`, index < 5 ? index * 12_000 : 48_000 + (index - 4) * 300),
    );
    const unusual = analyseMotHistory(history(tests), { today: TODAY }).findings.filter((finding) =>
      finding.explanation.startsWith('Very low mileage'),
    );
    expect(unusual).toHaveLength(1);
    expect(unusual[0]?.level).toBe('amber');
  });

  it('treats structural or failing corrosion as red and other corrosion advisories as amber', () => {
    expect(analyseMotHistory(history(steadyTests([['advisory', 'Offside Sill corroded (5.3.3)']])), { today: TODAY }).overall).toBe('red');
    expect(analyseMotHistory(history(steadyTests([['major', 'Exhaust corroded (6.1.2)']])), { today: TODAY }).overall).toBe('red');
    expect(
      analyseMotHistory(history(steadyTests([['advisory', 'Rear Coil spring corroded (5.3.1 (b) (i))']])), { today: TODAY }).overall,
    ).toBe('amber');
  });

  it('treats a dangerous non-consumable as red and dangerous tyres as amber', () => {
    expect(analyseMotHistory(history(steadyTests([['dangerous', 'Steering rack insecure (2.1.3)']])), { today: TODAY }).overall).toBe(
      'red',
    );
    expect(
      analyseMotHistory(history(steadyTests([['dangerous', 'Nearside Rear Tyre tread depth below 1.6mm (5.2.3 (e))']])), { today: TODAY })
        .overall,
    ).toBe('amber');
  });

  it('notes a non-consumable advisory that was not fixed since the previous test', () => {
    const tests = steadyTests([['advisory', 'Oil leak, but not excessive (8.4.1 (a) (i))']]);
    tests[6] = passedTest('2025-06-01', 68_000, [['advisory', 'Oil leak, but not excessive (8.4.1 (a) (i))']]);
    const explanations = analyseMotHistory(history(tests), { today: TODAY }).findings.map((finding) => finding.explanation);
    expect(explanations).toContain('Not fixed since 1 Jun 2025: Oil leak, but not excessive (8.4.1 (a) (i))');
  });

  it('ignores defects older than the recent window when choosing the colour', () => {
    const tests = steadyTests();
    tests[0] = passedTest('2019-06-01', 20_000, [['dangerous', 'Steering rack insecure (2.1.3)']]);
    expect(analyseMotHistory(history(tests), { today: TODAY }).overall).toBe('green');
  });

  it('is red when the MOT record is for a different make', () => {
    expect(analyseMotHistory(history(steadyTests()), { today: TODAY, advertisedMake: 'Volkswagen' }).overall).toBe('red');
    expect(analyseMotHistory(history(steadyTests()), { today: TODAY, advertisedMake: 'Mazda' }).overall).toBe('green');
    // whole words only: a short make mustn't match part of another
    expect(
      analyseMotHistory(history(steadyTests(), { makeAndModel: 'NISSAN QASHQAI' }), { today: TODAY, advertisedMake: 'Kia' }).overall,
    ).toBe('red');
    expect(
      analyseMotHistory(history(steadyTests(), { makeAndModel: 'MERCEDES-BENZ E' }), { today: TODAY, advertisedMake: 'Mercedes-Benz' })
        .overall,
    ).toBe('green');
  });

  it('handles cars too new for an MOT, and old cars with none', () => {
    const newCar = analyseMotHistory(history([], { firstRegisteredDate: day('2025-01-01'), motValidUntil: null }), { today: TODAY });
    expect(newCar.overall).toBe('green');
    const oldCar = analyseMotHistory(history([], { motValidUntil: null }), { today: TODAY });
    expect(oldCar.overall).toBe('red');
  });

  it('is amber when the current MOT has expired', () => {
    expect(analyseMotHistory(history(steadyTests(), { motValidUntil: day('2026-06-01') }), { today: TODAY }).overall).toBe('amber');
  });

  it('lists red, then amber, then green, without repeats', () => {
    const summary = analyseMotHistory(
      history(
        steadyTests([
          ['advisory', 'Rear Coil spring corroded (5.3.1)'],
          ['advisory', 'Rear Coil spring corroded (5.3.1)'],
        ]),
      ),
      { today: TODAY, advertisedMileage: 1 },
    );
    const order = summary.findings.map((finding) => finding.level);
    expect(order).toEqual(
      [...order].sort((first, second) => ['red', 'amber', 'green'].indexOf(first) - ['red', 'amber', 'green'].indexOf(second)),
    );
    expect(new Set(summary.findings.map((finding) => finding.explanation)).size).toBe(summary.findings.length);
  });
});

describe('defect helpers', () => {
  it('classifies defects', () => {
    expect(classifyDefect('Brake pipe corroded')).toBe('corrosion');
    expect(classifyDefect('Nearside Front Tyre worn close to legal limit')).toBe('consumable');
    expect(classifyDefect('Rear Shock absorber leaking')).toBe('other');
  });

  it('treats nearside and offside of the same part as one component', () => {
    expect(defectComponentKey('Nearside Front Anti-roll bar linkage worn (5.3.4)')).toBe(
      defectComponentKey('Offside Front Anti-roll bar linkage worn (5.3.4)'),
    );
  });
});
