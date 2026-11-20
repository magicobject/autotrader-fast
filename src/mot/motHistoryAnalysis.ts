// Turns an MOT history into a Red / Amber / Green summary with a dated reason for each concern.
// The thresholds and word lists below are the rules; README.md and the help page describe them
// in plain English, so change those too when you change these.
import { daysBetween, formatShortDate, formatWholeNumber } from '../shared/numbers.ts';
import {
  FAILING_SEVERITIES,
  type MotDefect,
  type MotFinding,
  type MotHistory,
  type MotSummary,
  type MotTest,
  type RagLevel,
} from './motHistoryTypes.ts';

export const MOT_RULES = {
  /** Defects older than this are ignored when choosing the colour. */
  recentDefectYears: 4,
  /** Days between one MOT expiring and the next test. */
  lapseAmberAfterDays: 31,
  lapseRedAfterDays: 90,
  /** A reading lower than the one before by more than this counts as going backwards. */
  mileageDropToleranceMiles: 50,
  /** A stretch this many times above or below the car's typical yearly mileage is unusual... */
  unusualMileageFactor: 3,
  /** ...as long as it also differs from typical by at least this many miles a year. */
  unusualMileageMinimumDifference: 5000,
  /** A stretch must cover at least this long to count towards yearly mileage. */
  minimumYearsForMileageRate: 0.5,
} as const;

const CONSUMABLE_WORDS =
  /\b(tyre|tyres|tread|brake pad|pads?|brake disc|discs?|wiper|washer|bulb|lamp|light|headlamp|indicator|reflector|registration plate|number plate|horn|windscreen|screen|mirror)\b/i;
const CORROSION_WORDS = /corro|rust/i;
const SERIOUS_CORROSION_WORDS =
  /excessive|seriously|structur|sill|subframe|sub-frame|chassis|floor|mounting|jacking|crossmember|cross member|load bearing|prescribed area|brake pipe|fuel pipe/i;
const POSITION_WORDS = /\b(nearside|offside|front|rear|inner|outer|centre|left|right|both|and|-)\b/gi;

export interface MotAnalysisContext {
  /** The mileage the advert claims, to compare with the last MOT reading. */
  readonly advertisedMileage?: number | null;
  /** The make the advert claims, to catch a mistyped reg. */
  readonly advertisedMake?: string | null;
  /** Injected for tests; defaults to now. */
  readonly today?: Date;
}

type DefectKind = 'corrosion' | 'consumable' | 'other';

export function classifyDefect(description: string): DefectKind {
  if (CORROSION_WORDS.test(description)) return 'corrosion';
  return CONSUMABLE_WORDS.test(description) ? 'consumable' : 'other';
}

/** The part a defect is about, without side/position words or the inspection manual reference. */
export function defectComponentKey(description: string): string {
  return description
    .replace(/\(.*?\)/g, '')
    .replace(POSITION_WORDS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 45);
}

interface OdometerReading {
  readonly readingDate: Date;
  readonly miles: number;
}

interface MileageStretch {
  readonly from: OdometerReading;
  readonly to: OdometerReading;
  readonly milesPerYear: number;
}

function assertNever(unexpected: never): never {
  throw new Error(`Unhandled case: ${String(unexpected)}`);
}

function addYears(date: Date, years: number): Date {
  const shifted = new Date(date);
  shifted.setFullYear(shifted.getFullYear() + years);
  return shifted;
}

function isSameDay(first: Date, second: Date): boolean {
  return first.toDateString() === second.toDateString();
}

function checkAdvertisedMake(history: MotHistory, advertisedMake: string | null | undefined): MotFinding[] {
  if (!advertisedMake || history.makeAndModel === '') return [];
  const firstWordOfMake = advertisedMake.toUpperCase().split(/[\s-]/)[0] ?? '';
  return history.makeAndModel.toUpperCase().includes(firstWordOfMake)
    ? []
    : [{ level: 'red', explanation: `MOT record is for a ${history.makeAndModel}, not a ${advertisedMake}. Check the reg.` }];
}

function checkCurrentMot(history: MotHistory, today: Date): MotFinding[] {
  if (history.motValidUntil !== null) {
    return history.motValidUntil < today
      ? [{ level: 'amber', explanation: `MOT expired on ${formatShortDate(history.motValidUntil)}.` }]
      : [{ level: 'green', explanation: `MOT valid until ${formatShortDate(history.motValidUntil)}.` }];
  }
  return history.motStatusText ? [{ level: 'green', explanation: history.motStatusText }] : [];
}

function checkNoTestsYet(history: MotHistory, today: Date): MotFinding {
  const ageInYears = history.firstRegisteredDate ? daysBetween(history.firstRegisteredDate, today) / 365.25 : null;
  return ageInYears !== null && ageInYears > 3.1
    ? { level: 'red', explanation: 'No MOT tests on record for a car over 3 years old.' }
    : { level: 'green', explanation: 'No MOT tests yet (car under 3 years old).' };
}

function checkGapsBetweenTests(history: MotHistory): MotFinding[] {
  const findings: MotFinding[] = [];
  const { tests } = history;
  const firstTest = tests[0];
  if (history.firstRegisteredDate && firstTest) {
    const firstMotDue = addYears(history.firstRegisteredDate, 3);
    const daysLate = daysBetween(firstMotDue, firstTest.testDate);
    if (daysLate > MOT_RULES.lapseRedAfterDays) {
      findings.push({
        level: 'amber',
        explanation: `First MOT was ${Math.round(daysLate / 30)} months after it was due (${formatShortDate(firstTest.testDate)}). Could be an import or NI car, or a missing test.`,
      });
    }
  }
  for (const passedTest of tests.filter((test) => test.outcome === 'pass')) {
    if (passedTest.expiryDate === null) continue;
    const nextTest = tests.find((test) => test.testDate > passedTest.testDate && !isSameDay(test.testDate, passedTest.testDate));
    if (!nextTest) continue;
    const daysWithoutMot = daysBetween(passedTest.expiryDate, nextTest.testDate);
    const expired = formatShortDate(passedTest.expiryDate);
    const retested = formatShortDate(nextTest.testDate);
    if (daysWithoutMot > MOT_RULES.lapseRedAfterDays) {
      findings.push({
        level: 'red',
        explanation: `No MOT for about ${Math.round(daysWithoutMot / 30)} months: expired ${expired}, next test ${retested}.`,
      });
    } else if (daysWithoutMot > MOT_RULES.lapseAmberAfterDays) {
      findings.push({
        level: 'amber',
        explanation: `MOT lapsed for ${Math.round(daysWithoutMot)} days (expired ${expired}, retested ${retested}).`,
      });
    }
  }
  return findings;
}

/** One reading per test day (a fail and its same-day retest share a reading). */
function odometerReadings(tests: readonly MotTest[]): OdometerReading[] {
  const readings: OdometerReading[] = [];
  for (const test of tests) {
    if (test.odometerMiles === null) continue;
    const previous = readings.at(-1);
    if (previous && isSameDay(previous.readingDate, test.testDate)) continue;
    readings.push({ readingDate: test.testDate, miles: test.odometerMiles });
  }
  return readings;
}

function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((smaller, larger) => smaller - larger);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function checkMileage(history: MotHistory, advertisedMileage: number | null | undefined): MotFinding[] {
  const findings: MotFinding[] = [];
  const readings = odometerReadings(history.tests);
  let isMileageConsistent = true;

  const stretches: MileageStretch[] = [];
  for (let index = 1; index < readings.length; index++) {
    const from = readings[index - 1];
    const to = readings[index];
    if (!from || !to) continue;
    if (to.miles < from.miles - MOT_RULES.mileageDropToleranceMiles) {
      isMileageConsistent = false;
      findings.push({
        level: 'red',
        explanation: `Mileage went down: ${formatWholeNumber(from.miles)} (${formatShortDate(from.readingDate)}) → ${formatWholeNumber(to.miles)} (${formatShortDate(to.readingDate)}).`,
      });
    }
    const years = daysBetween(from.readingDate, to.readingDate) / 365.25;
    if (years >= MOT_RULES.minimumYearsForMileageRate && to.miles >= from.miles) {
      stretches.push({ from, to, milesPerYear: (to.miles - from.miles) / years });
    }
  }

  const typicalMilesPerYear = median(stretches.map((stretch) => stretch.milesPerYear));
  if (typicalMilesPerYear !== null && stretches.length >= 3) {
    for (const unusual of unusualMileageRuns(stretches, typicalMilesPerYear)) {
      isMileageConsistent = false;
      const years = daysBetween(unusual.from.readingDate, unusual.to.readingDate) / 365.25;
      const milesPerYear = (unusual.to.miles - unusual.from.miles) / years;
      findings.push({
        level: 'amber',
        explanation: `${unusual.direction === 'low' ? 'Very low' : 'Very high'} mileage: about ${formatWholeNumber(milesPerYear)} miles a year from ${formatShortDate(unusual.from.readingDate)} to ${formatShortDate(unusual.to.readingDate)}, against a typical ${formatWholeNumber(typicalMilesPerYear)}.`,
      });
    }
  }

  const lastReading = readings.at(-1);
  if (advertisedMileage != null && lastReading && advertisedMileage < lastReading.miles - MOT_RULES.mileageDropToleranceMiles) {
    isMileageConsistent = false;
    findings.push({
      level: 'red',
      explanation: `Advert says ${formatWholeNumber(advertisedMileage)} miles, but the last MOT recorded ${formatWholeNumber(lastReading.miles)} on ${formatShortDate(lastReading.readingDate)}.`,
    });
  }
  if (isMileageConsistent && readings.length >= 2) {
    const typicalText = typicalMilesPerYear === null ? '' : ` (about ${formatWholeNumber(typicalMilesPerYear)} miles a year)`;
    findings.push({ level: 'green', explanation: `Mileage rises steadily across ${readings.length} readings${typicalText}.` });
  }
  return findings;
}

interface UnusualMileageRun {
  readonly direction: 'low' | 'high';
  readonly from: OdometerReading;
  readonly to: OdometerReading;
}

/** Consecutive unusual stretches in the same direction are merged into one run. */
function unusualMileageRuns(stretches: readonly MileageStretch[], typicalMilesPerYear: number): UnusualMileageRun[] {
  const runs: UnusualMileageRun[] = [];
  let currentRun: UnusualMileageRun | null = null;
  for (const stretch of stretches) {
    const isFarFromTypical = Math.abs(stretch.milesPerYear - typicalMilesPerYear) > MOT_RULES.unusualMileageMinimumDifference;
    const direction: UnusualMileageRun['direction'] | null = !isFarFromTypical
      ? null
      : stretch.milesPerYear > typicalMilesPerYear * MOT_RULES.unusualMileageFactor
        ? 'high'
        : stretch.milesPerYear < typicalMilesPerYear / MOT_RULES.unusualMileageFactor
          ? 'low'
          : null;
    if (direction !== null && currentRun !== null && currentRun.direction === direction && currentRun.to === stretch.from) {
      currentRun = { direction, from: currentRun.from, to: stretch.to };
      continue;
    }
    if (currentRun) runs.push(currentRun);
    currentRun = direction === null ? null : { direction, from: stretch.from, to: stretch.to };
  }
  if (currentRun) runs.push(currentRun);
  return runs;
}

function findingForDefect(defect: MotDefect, test: MotTest, isLatestTest: boolean): MotFinding | null {
  const testedOn = formatShortDate(test.testDate);
  const isFailingItem = FAILING_SEVERITIES.has(defect.severity);
  const kind = classifyDefect(defect.description);
  switch (kind) {
    case 'corrosion':
      return isFailingItem || SERIOUS_CORROSION_WORDS.test(defect.description)
        ? { level: 'red', explanation: `Corrosion (${defect.severity}, ${testedOn}): ${defect.description}` }
        : { level: 'amber', explanation: `Corrosion advisory (${testedOn}): ${defect.description}` };
    case 'other':
      if (defect.severity === 'dangerous') return { level: 'red', explanation: `Dangerous defect (${testedOn}): ${defect.description}` };
      if (isFailingItem) return { level: 'amber', explanation: `Failed on (${testedOn}): ${defect.description}` };
      return isLatestTest ? { level: 'amber', explanation: `Latest test ${defect.severity}: ${defect.description}` } : null;
    case 'consumable':
      return defect.severity === 'dangerous'
        ? {
            level: 'amber',
            explanation: `Dangerous ${defectComponentKey(defect.description)} (${testedOn}). Consumable, but suggests it was neglected.`,
          }
        : null;
    default:
      return assertNever(kind);
  }
}

function checkDefects(history: MotHistory, today: Date): MotFinding[] {
  const findings: MotFinding[] = [];
  const cutoff = addYears(today, -MOT_RULES.recentDefectYears);
  const latestTest = history.tests.at(-1);
  const alreadyReported = new Set<string>();
  let recentNonConsumableCount = 0;
  let hasRecentCorrosion = false;

  for (const test of history.tests.filter((candidate) => candidate.testDate >= cutoff)) {
    for (const defect of test.defects) {
      const kind = classifyDefect(defect.description);
      if (kind === 'other') recentNonConsumableCount++;
      if (kind === 'corrosion') hasRecentCorrosion = true;
      const reportKey = `${defect.severity}|${defectComponentKey(defect.description)}`;
      if (alreadyReported.has(reportKey)) continue;
      const finding = findingForDefect(defect, test, test === latestTest);
      if (finding) {
        alreadyReported.add(reportKey);
        findings.push(finding);
      }
    }
  }

  findings.push(...checkNotFixedSincePreviousTest(history.tests));
  if (recentNonConsumableCount === 0 && !hasRecentCorrosion) {
    findings.push({
      level: 'green',
      explanation: `Only consumables (tyres, brakes, lights, wipers) flagged in the last ${MOT_RULES.recentDefectYears} years.`,
    });
  }
  return findings;
}

function checkNotFixedSincePreviousTest(tests: readonly MotTest[]): MotFinding[] {
  const latestTest = tests.at(-1);
  if (!latestTest) return [];
  const previousTest = [...tests]
    .reverse()
    .find((test) => test.testDate < latestTest.testDate && !isSameDay(test.testDate, latestTest.testDate));
  if (!previousTest) return [];
  const previouslyNoted = new Set(previousTest.defects.map((defect) => defectComponentKey(defect.description)));
  return latestTest.defects
    .filter((defect) => classifyDefect(defect.description) !== 'consumable' && previouslyNoted.has(defectComponentKey(defect.description)))
    .map((defect) => ({ level: 'amber', explanation: `Not fixed since ${formatShortDate(previousTest.testDate)}: ${defect.description}` }));
}

const RAG_ORDER: Readonly<Record<RagLevel, number>> = { red: 0, amber: 1, green: 2 };

function summarise(history: MotHistory, findings: readonly MotFinding[]): MotSummary {
  const seenExplanations = new Set<string>();
  const uniqueFindings = findings
    .filter((finding) => {
      const key = finding.level + finding.explanation;
      if (seenExplanations.has(key)) return false;
      seenExplanations.add(key);
      return true;
    })
    .sort((first, second) => RAG_ORDER[first.level] - RAG_ORDER[second.level]);
  const overall: RagLevel = uniqueFindings.some((finding) => finding.level === 'red')
    ? 'red'
    : uniqueFindings.some((finding) => finding.level === 'amber')
      ? 'amber'
      : 'green';
  return {
    overall,
    findings: uniqueFindings,
    testCount: history.tests.length,
    failedTestCount: history.tests.filter((test) => test.outcome === 'fail').length,
    registrationShown: history.registrationShown,
    makeAndModel: history.makeAndModel,
  };
}

export function analyseMotHistory(history: MotHistory, context: MotAnalysisContext = {}): MotSummary {
  const today = context.today ?? new Date();
  const findings: MotFinding[] = [...checkAdvertisedMake(history, context.advertisedMake), ...checkCurrentMot(history, today)];
  if (history.tests.length === 0) return summarise(history, [...findings, checkNoTestsYet(history, today)]);
  findings.push(...checkGapsBetweenTests(history), ...checkMileage(history, context.advertisedMileage), ...checkDefects(history, today));
  return summarise(history, findings);
}
