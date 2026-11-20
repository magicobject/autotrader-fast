// A made-up vehicle laid out exactly like the GOV.UK "Check MOT history" results page
// (data-test-id attributes, headings followed by lists), checked against the live page on
// 20 Nov 2026. The registration ZZ99 ZZZ is not issued to any real vehicle.

export interface FixtureTest {
  readonly date: string;
  readonly result: 'PASS' | 'FAIL';
  readonly odometer: string;
  readonly expiry?: string;
  readonly defects?: Readonly<Partial<Record<'dangerous' | 'major' | 'minor' | 'advisory' | 'failure', readonly string[]>>>;
}

const HEADING_IDS = {
  dangerous: 'dangerous-defect-items-heading',
  major: 'major-defect-items-heading',
  minor: 'minor-defect-items-heading',
  advisory: 'advisory-defect-comments-heading',
  failure: 'failure-defect-comments-heading',
} as const;

function testHtml(test: FixtureTest, index: number): string {
  const severities = ['dangerous', 'major', 'failure', 'minor', 'advisory'] as const;
  const defectGroups = severities
    .map((severity) => {
      const items = test.defects?.[severity];
      if (!items) return '';
      return `
      <span class="govuk-caption-m" data-test-id="${HEADING_IDS[severity]}">Heading</span>
      <ul class="govuk-list govuk-list--bullet">${items.map((item) => `<li><span class="govuk-!-font-weight-bold">${item}</span></li>`).join('')}</ul>`;
    })
    .join('');
  return `
  <div class="govuk-grid-row" data-test-id="test-history-item">
    <div class="govuk-grid-column-one-third">
      <span class="govuk-caption-m">Date tested</span>
      <div class="govuk-heading-s govuk-!-margin-bottom-1">${test.date}</div>
      <div class="govuk-heading-xl" data-test-id="test-result">${test.result}</div>
    </div>
    <div class="govuk-grid-column-two-thirds">
      <span class="govuk-caption-m">Mileage</span>
      <div class="govuk-heading-s" data-test-id="test-history-odometer">${test.odometer}</div>
      <form id="document-reference-test-location-form-${index}"><input name="documentReference" type="text"></form>
      ${test.expiry ? `<span class="govuk-caption-m">Expiry date</span><div class="govuk-heading-s" data-test-id="expiry-date">${test.expiry}</div>` : ''}
      <div data-test-id="test-history-rfr-${index}">${defectGroups}</div>
    </div>
  </div>`;
}

/** Tests are given newest first, as GOV.UK lists them. */
export function motHistoryPageHtml(options: {
  readonly registrationShown?: string;
  readonly makeAndModel?: string;
  readonly registered?: string;
  readonly motDue?: string;
  readonly tests: readonly FixtureTest[];
}): string {
  return `<!doctype html><html><body><main>
    <span data-test-id="vehicle-registration" class="dvsa-vrm">${options.registrationShown ?? 'ZZ99 ZZZ'}</span>
    <h1 data-test-id="vehicle-make-model">${options.makeAndModel ?? 'MAZDA MX-5'}</h1>
    <span data-test-id="vehicle-date-registered">${options.registered ?? '30 June 2016'}</span>
    ${options.motDue ? `<span data-test-id="mot-due-date">${options.motDue}</span>` : ''}
    <div class="govuk-accordion__section-content">${options.tests.map(testHtml).join('')}</div>
  </main></body></html>`;
}

export const NOT_FOUND_PAGE_HTML = `<!doctype html><html><body><main>
  <div class="govuk-error-summary"><h2>There is a problem</h2><ul><li>Check that the registration you entered is correct.</li></ul></div>
  <form><input id="registration" name="registration"></form>
</main></body></html>`;
