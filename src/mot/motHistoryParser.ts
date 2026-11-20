// Reads the GOV.UK "Check MOT history" results page (https://www.check-mot.service.gov.uk/results).
// The page marks its data with data-test-id attributes; those are what this relies on.
import { firstNumberIn } from '../shared/numbers.ts';
import type { DefectSeverity, MotDefect, MotHistoryPageReading, MotTest, MotTestOutcome } from './motHistoryTypes.ts';

const KILOMETRES_TO_MILES = 0.621371;

const SEVERITY_BY_HEADING_ID: Readonly<Record<string, DefectSeverity>> = {
  'dangerous-defect-items-heading': 'dangerous',
  'major-defect-items-heading': 'major',
  'failure-defect-comments-heading': 'fail',
  'prs-defect-items-heading': 'prs',
  'minor-defect-items-heading': 'minor',
  'advisory-defect-comments-heading': 'advisory',
};

function collapsedText(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** GOV.UK writes dates as "4 February 2026". Noon avoids any daylight-saving edge. */
export function parseGovUkDate(text: string): Date | null {
  if (text === '') return null;
  const parsed = new Date(`${text} 12:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOutcome(text: string): MotTestOutcome {
  const upper = text.toUpperCase();
  if (upper.startsWith('PASS')) return 'pass';
  if (upper.startsWith('FAIL')) return 'fail';
  return 'unknown';
}

function parseOdometerMiles(text: string): number | null {
  const reading = firstNumberIn(text);
  if (reading === null) return null;
  return /\bkm\b/i.test(text) ? Math.round(reading * KILOMETRES_TO_MILES) : reading;
}

function parseDefects(testElement: Element): MotDefect[] {
  const defects: MotDefect[] = [];
  for (const heading of testElement.querySelectorAll<HTMLElement>('[data-test-id$="-heading"]')) {
    const headingId = heading.dataset['testId'] ?? '';
    const severity = SEVERITY_BY_HEADING_ID[headingId] ?? 'unknown';
    let list = heading.nextElementSibling;
    while (list !== null && list.tagName !== 'UL') list = list.nextElementSibling;
    if (list === null) continue;
    for (const item of list.children) {
      const description = collapsedText(item).replace(/\s*Dangerous\s*$/i, '');
      if (description !== '') defects.push({ severity, description });
    }
  }
  return defects;
}

function parseTest(testElement: Element): MotTest | null {
  const testDate = parseGovUkDate(collapsedText(testElement.querySelector('.govuk-caption-m + div')));
  if (testDate === null) return null;
  return {
    testDate,
    outcome: parseOutcome(collapsedText(testElement.querySelector('[data-test-id="test-result"]'))),
    odometerMiles: parseOdometerMiles(collapsedText(testElement.querySelector('[data-test-id="test-history-odometer"]'))),
    expiryDate: parseGovUkDate(collapsedText(testElement.querySelector('[data-test-id="expiry-date"]'))),
    defects: parseDefects(testElement),
  };
}

export function readMotHistoryPage(page: ParentNode): MotHistoryPageReading {
  const byTestId = (id: string): Element | null => page.querySelector(`[data-test-id="${id}"]`);
  const registrationShown = collapsedText(byTestId('vehicle-registration'));
  if (registrationShown === '') {
    const errorText = collapsedText(page.querySelector('.govuk-error-summary li') ?? page.querySelector('.govuk-error-summary'));
    return { kind: 'not-found', message: errorText || 'No MOT record found for that registration.' };
  }
  const tests = [...page.querySelectorAll('[data-test-id="test-history-item"]')]
    .map(parseTest)
    .filter((test): test is MotTest => test !== null)
    .sort((earlier, later) => earlier.testDate.getTime() - later.testDate.getTime());
  return {
    kind: 'found',
    history: {
      registrationShown,
      makeAndModel: collapsedText(byTestId('vehicle-make-model')),
      firstRegisteredDate: parseGovUkDate(collapsedText(byTestId('vehicle-date-registered'))),
      motValidUntil: parseGovUkDate(collapsedText(byTestId('mot-due-date'))),
      motStatusText: collapsedText(byTestId('mot-expiry-text')),
      tests,
    },
  };
}
