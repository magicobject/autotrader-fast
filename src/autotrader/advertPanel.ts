// The "At a glance" panel on an Autotrader advert page: MOT check, performance, running costs
// and history, so there's no need to dig into "View all spec and features".
import { parseAdvertId, type AdvertId, type Registration } from '../shared/brands.ts';
import { createElement, type ElementChild } from '../shared/dom.ts';
import { formatPounds, formatShortDate, formatWholeNumber } from '../shared/numbers.ts';
import { parseTypedRegistration } from '../shared/registration.ts';
import { readAdvertPanelCollapsed, readPriceHistory, writeAdvertPanelCollapsed } from '../shared/storage.ts';
import { motHistoryLinkFromAdvert } from '../mot/motLinks.ts';
import { createMotSummaryCard } from '../mot/motSummaryCard.ts';
import type { AdvertDetails } from './advertDetails.ts';
import { checkMotHistory, fetchAdvert, lookUpAdvertFromHtml, readSavedRegistration, saveRegistration } from './advertLookup.ts';

const ADVERT_PATH = /^\/car-details\/(\d+)/;

export function advertIdFromPath(pathname: string): AdvertId | null {
  const digits = pathname.match(ADVERT_PATH)?.[1];
  return digits === undefined ? null : parseAdvertId(digits);
}

function labelledValue(label: string, value: string | number | null): HTMLDivElement | null {
  if (value === null || value === '') return null;
  return createElement('div', { className: 'atf-kv' }, createElement('span', { text: label }), createElement('b', { text: String(value) }));
}

function section(title: string, ...rows: readonly (ElementChild | readonly ElementChild[])[]): HTMLElement {
  return createElement('section', { className: 'atf-sec' }, createElement('h2', { className: 'atf-sec-t', text: title }), ...rows);
}

/** Details from this page's own data when it is for this advert, otherwise fetched afresh. */
async function detailsForThisPage(
  advertId: AdvertId,
): Promise<{ details: AdvertDetails; registrationFromDescription: Registration | null }> {
  const pageScript = [...document.scripts].find((script) => script.textContent?.includes('__staticRouterHydrationData'));
  const fromPage = pageScript?.textContent ? await lookUpAdvertFromHtml(advertId, pageScript.textContent) : null;
  return fromPage ?? fetchAdvert(advertId);
}

function buildMotSection(
  advertId: AdvertId,
  details: AdvertDetails,
): {
  element: HTMLElement;
  checkRegistration: (registration: Registration, isRefreshForced: boolean) => Promise<void>;
  registrationInput: HTMLInputElement;
} {
  const registrationInput = createElement('input', {
    className: 'atf-in atf-reg',
    attributes: { placeholder: 'REG', maxlength: '8', 'aria-label': 'Registration number', autocomplete: 'off', spellcheck: 'false' },
  });
  const result = createElement('div', { className: 'atf-mot-out', attributes: { 'aria-live': 'polite' } });
  const govUkLink = createElement('a', {
    className: 'atf-small',
    text: 'Open the GOV.UK MOT page ↗',
    attributes: { target: '_blank', rel: 'noopener' },
  });
  govUkLink.hidden = true;

  const checkRegistration = async (registration: Registration, isRefreshForced: boolean): Promise<void> => {
    await saveRegistration(advertId, registration);
    govUkLink.href = motHistoryLinkFromAdvert(registration, details.mileage, details.make);
    govUkLink.hidden = false;
    result.replaceChildren(createElement('span', { className: 'atf-muted', text: 'Checking MOT history…' }));
    try {
      const summary = await checkMotHistory({
        registration,
        advertisedMileage: details.mileage,
        advertisedMake: details.make,
        isRefreshForced,
      });
      result.replaceChildren(createMotSummaryCard(summary));
    } catch (error: unknown) {
      result.replaceChildren(
        createElement('span', { className: 'atf-r-red', text: error instanceof Error ? error.message : String(error) }),
      );
    }
  };
  const checkTypedRegistration = (): void => {
    const registration = parseTypedRegistration(registrationInput.value);
    if (registration === null) {
      result.replaceChildren(createElement('span', { className: 'atf-muted', text: 'Enter the reg (often visible in the photos).' }));
      return;
    }
    void checkRegistration(registration, true);
  };
  registrationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') checkTypedRegistration();
  });
  const element = section(
    'MOT history',
    createElement(
      'div',
      { className: 'atf-row' },
      registrationInput,
      createElement('button', { className: 'atf-btn', text: 'Check', onClick: checkTypedRegistration }),
      govUkLink,
    ),
    result,
  );
  return { element, checkRegistration, registrationInput };
}

export class AdvertPanel {
  private shownForAdvertId: AdvertId | null = null;

  async showFor(advertId: AdvertId): Promise<void> {
    if (this.shownForAdvertId === advertId) return;
    this.shownForAdvertId = advertId;
    this.remove();

    const body = createElement('div', { className: 'atf-panel-body', text: 'Loading…' });
    const panel = createElement(
      'aside',
      { className: 'atf-panel', attributes: { 'aria-label': 'At a glance' } },
      createElement(
        'div',
        { className: 'atf-panel-head' },
        createElement('strong', { text: '⚡ At a glance' }),
        createElement('button', {
          className: 'atf-x',
          text: '–',
          title: 'Collapse or expand',
          attributes: { 'aria-label': 'Collapse or expand the panel' },
          onClick: () => void writeAdvertPanelCollapsed(panel.classList.toggle('atf-collapsed')),
        }),
      ),
      body,
    );
    const isStillShowing = (): boolean => this.shownForAdvertId === advertId; // the person may have moved on
    if (await readAdvertPanelCollapsed()) panel.classList.add('atf-collapsed');
    if (!isStillShowing()) return;
    document.body.append(panel);

    let lookup: Awaited<ReturnType<typeof detailsForThisPage>>;
    try {
      lookup = await detailsForThisPage(advertId);
    } catch (error: unknown) {
      body.textContent = `Could not read this advert: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    if (!isStillShowing()) return;
    const { details, registrationFromDescription } = lookup;

    const mot = buildMotSection(advertId, details);
    const priceHistory = (await readPriceHistory())[advertId];
    const pricePoints = priceHistory && priceHistory.pricePoints.length > 1 ? priceHistory.pricePoints : null;

    body.replaceChildren(
      mot.element,
      section(
        'Performance',
        details.performance.length > 0
          ? details.performance.map((figure) => labelledValue(figure.name, figure.value))
          : createElement('div', { className: 'atf-muted', text: 'Not listed' }),
      ),
      section(
        'Running costs',
        labelledValue('MPG', details.milesPerGallon),
        labelledValue('Insurance group', details.insuranceGroup),
        labelledValue('Tax / year', details.roadTaxPerYearGbp === null ? null : formatPounds(details.roadTaxPerYearGbp)),
        labelledValue('CO₂', details.co2GramsPerKm === null ? null : `${details.co2GramsPerKm} g/km`),
      ),
      section(
        'History',
        labelledValue('Mileage', formatWholeNumber(details.mileage)),
        labelledValue('Owners', details.ownerCount),
        labelledValue('Service history', details.serviceHistory),
        labelledValue('MOT', details.motStatus),
        labelledValue(
          'Autotrader check',
          [details.autotraderCheckText, details.autotraderCheckProblems.join(', ')].filter(Boolean).join(': '),
        ),
        labelledValue('Gearbox', details.gearbox),
        labelledValue('Drive', details.drivetrain),
      ),
      ...(pricePoints
        ? [
            section(
              'Price history (seen by you)',
              pricePoints.map(([seenAt, price]) => labelledValue(formatShortDate(new Date(seenAt)), formatPounds(price))),
            ),
          ]
        : []),
    );

    const savedRegistration = await readSavedRegistration(advertId);
    if (!isStillShowing()) return;
    if (savedRegistration === null) {
      mot.element.append(
        createElement('p', {
          className: 'atf-muted',
          text: "The seller hasn't put the reg in the description. Type it in from the photos to check the MOT history.",
        }),
      );
      return;
    }
    mot.registrationInput.value = savedRegistration;
    if (registrationFromDescription !== null && registrationFromDescription === savedRegistration)
      mot.registrationInput.title = "Found in the seller's description";
    await mot.checkRegistration(savedRegistration, false);
  }

  remove(): void {
    document.querySelector('.atf-panel')?.remove();
  }

  forget(): void {
    this.shownForAdvertId = null;
    this.remove();
  }
}
