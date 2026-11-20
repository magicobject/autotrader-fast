// The "At a glance" section on an Autotrader advert page: MOT summary, performance, running costs
// and history, so there's no need to dig into "View all spec and features". It sits in the page
// itself, just above Autotrader's "Overview", and folds up like any other section.
//
// MOT history: GOV.UK's service is behind bot protection, so the extension never fetches it.
// "Check" opens the GOV.UK results page in a new tab (as a person would); the content script there
// writes its summary to storage, and this section shows it as soon as it arrives.
import { parseAdvertId, type AdvertId, type Registration } from '../shared/brands.ts';
import { createElement, type ElementChild } from '../shared/dom.ts';
import { formatPounds, formatShortDate, formatWholeNumber } from '../shared/numbers.ts';
import { parseTypedRegistration } from '../shared/registration.ts';
import {
  onMotSummarySaved,
  readAdvertPanelCollapsed,
  readMotSummary,
  readPriceHistory,
  readRegistration,
  writeAdvertPanelCollapsed,
  writeRegistration,
  type CachedMotSummary,
} from '../shared/storage.ts';
import { motHistoryLinkFromAdvert } from '../mot/motLinks.ts';
import { createMotSummaryCard } from '../mot/motSummaryCard.ts';
import type { AdvertDetails } from './advertDetails.ts';
import { fetchAdvert, lookUpAdvertFromHtml } from './advertLookup.ts';

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
  return createElement('section', { className: 'atf-sec' }, createElement('h3', { className: 'atf-sec-t', text: title }), ...rows);
}

/** Details from this page's own data when it is for this advert, otherwise fetched afresh. */
async function detailsForThisPage(
  advertId: AdvertId,
): Promise<{ details: AdvertDetails; registrationFromDescription: Registration | null }> {
  const pageScript = [...document.scripts].find((script) => script.textContent?.includes('__staticRouterHydrationData'));
  const fromPage = pageScript?.textContent ? await lookUpAdvertFromHtml(advertId, pageScript.textContent) : null;
  return fromPage ?? fetchAdvert(advertId);
}

/** Where the section goes: just before Autotrader's Overview, else before the description. */
export function placeForPanel(): { readonly parent: Element; readonly before: Element } | null {
  const anchor = document.querySelector('[data-testid="overview"]') ?? document.querySelector('[data-testid="description"]');
  return anchor?.parentElement ? { parent: anchor.parentElement, before: anchor } : null;
}

interface MotSection {
  readonly element: HTMLElement;
  readonly registrationInput: HTMLInputElement;
  readonly showSummaryFor: (registration: Registration) => Promise<void>;
}

function buildMotSection(advertId: AdvertId, details: AdvertDetails, isStillShowing: () => boolean): MotSection {
  const registrationInput = createElement('input', {
    className: 'atf-in atf-reg',
    attributes: { placeholder: 'REG', maxlength: '8', 'aria-label': 'Registration number', autocomplete: 'off', spellcheck: 'false' },
  });
  const result = createElement('div', { className: 'atf-mot-out', attributes: { 'aria-live': 'polite' } });
  let stopWatching: (() => void) | null = null;

  const showCached = (registration: Registration, cached: CachedMotSummary): void => {
    result.replaceChildren(
      createMotSummaryCard(cached.summary),
      createElement(
        'p',
        { className: 'atf-muted', text: `From GOV.UK on ${formatShortDate(new Date(cached.checkedAtMs))}. ` },
        createElement('a', {
          text: 'Open it again ↗',
          attributes: { href: motHistoryLinkFromAdvert(registration, details.mileage, details.make), target: '_blank', rel: 'noopener' },
        }),
      ),
    );
  };

  /** Shows the stored summary for this reg, and keeps watching for one saved from a GOV.UK tab. */
  const showSummaryFor = async (registration: Registration): Promise<void> => {
    stopWatching?.();
    stopWatching = onMotSummarySaved(registration, (cached) => {
      if (isStillShowing()) showCached(registration, cached);
    });
    const cached = await readMotSummary(registration);
    if (cached && isStillShowing()) showCached(registration, cached);
  };

  const checkTypedRegistration = (): void => {
    const registration = parseTypedRegistration(registrationInput.value);
    if (registration === null) {
      result.replaceChildren(createElement('span', { className: 'atf-muted', text: 'Enter the reg (often visible in the photos).' }));
      return;
    }
    registrationInput.value = registration;
    // Opened straight from the click, so the browser treats it as the person's own navigation.
    window.open(motHistoryLinkFromAdvert(registration, details.mileage, details.make), '_blank', 'noopener');
    result.replaceChildren(
      createElement('span', {
        className: 'atf-muted',
        text: 'Opened GOV.UK in a new tab. The summary appears here as soon as that page has loaded.',
      }),
    );
    void writeRegistration(advertId, registration).then(() => showSummaryFor(registration));
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
      createElement('button', {
        className: 'atf-btn',
        text: 'Check on GOV.UK',
        title: 'Opens the GOV.UK MOT history in a new tab; its summary appears here',
        attributes: { type: 'button' },
        onClick: checkTypedRegistration,
      }),
    ),
    result,
  );
  return { element, registrationInput, showSummaryFor };
}

export class AdvertPanel {
  private shownForAdvertId: AdvertId | null = null;
  private panel: HTMLElement | null = null;

  /** Called whenever the address may have changed; also puts the section back if the page redrew. */
  async showFor(advertId: AdvertId): Promise<void> {
    if (this.shownForAdvertId === advertId) {
      this.reattachIfRemoved();
      return;
    }
    this.shownForAdvertId = advertId;
    this.remove();
    const isStillShowing = (): boolean => this.shownForAdvertId === advertId; // the person may have moved on

    const body = createElement('div', { className: 'atf-panel-body', text: 'Loading…' });
    const panel = createElement(
      'details',
      { className: 'atf-panel' },
      createElement(
        'summary',
        { className: 'atf-panel-head' },
        // A heading inside the summary keeps the page's outline: Autotrader's own sections are h2s too.
        createElement(
          'h2',
          { className: 'atf-panel-title' },
          createElement('span', { text: '⚡ ', attributes: { 'aria-hidden': 'true' } }),
          'At a glance',
        ),
      ),
      body,
    );
    panel.open = !(await readAdvertPanelCollapsed());
    panel.addEventListener('toggle', () => void writeAdvertPanelCollapsed(!panel.open));
    if (!isStillShowing()) return;
    this.panel = panel;
    this.reattachIfRemoved();

    let lookup: Awaited<ReturnType<typeof detailsForThisPage>>;
    try {
      lookup = await detailsForThisPage(advertId);
    } catch (error: unknown) {
      body.textContent = `Could not read this advert: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    if (!isStillShowing()) return;
    const { details: advert, registrationFromDescription } = lookup;

    const mot = buildMotSection(advertId, advert, isStillShowing);
    const priceHistory = (await readPriceHistory())[advertId];
    const pricePoints = priceHistory && priceHistory.pricePoints.length > 1 ? priceHistory.pricePoints : null;

    body.replaceChildren(
      mot.element,
      createElement(
        'div',
        { className: 'atf-panel-grid' },
        section(
          'Performance',
          advert.performance.length > 0
            ? advert.performance.map((figure) => labelledValue(figure.name, figure.value))
            : createElement('div', { className: 'atf-muted', text: 'Not listed' }),
        ),
        section(
          'Running costs',
          labelledValue('MPG', advert.milesPerGallon),
          labelledValue('Insurance group', advert.insuranceGroup),
          labelledValue('Tax / year', advert.roadTaxPerYearGbp === null ? null : formatPounds(advert.roadTaxPerYearGbp)),
          labelledValue('CO₂', advert.co2GramsPerKm === null ? null : `${advert.co2GramsPerKm} g/km`),
        ),
        section(
          'History',
          labelledValue('Mileage', formatWholeNumber(advert.mileage)),
          labelledValue('Owners', advert.ownerCount),
          labelledValue('Service history', advert.serviceHistory),
          labelledValue('MOT', advert.motStatus),
          labelledValue(
            'Autotrader check',
            [advert.autotraderCheckText, advert.autotraderCheckProblems.join(', ')].filter(Boolean).join(': '),
          ),
          labelledValue('Gearbox', advert.gearbox),
          labelledValue('Drive', advert.drivetrain),
        ),
        ...(pricePoints
          ? [
              section(
                'Price history (seen by you)',
                pricePoints.map(([seenAt, price]) => labelledValue(formatShortDate(new Date(seenAt)), formatPounds(price))),
              ),
            ]
          : []),
      ),
    );

    const savedRegistration = await readRegistration(advertId);
    if (!isStillShowing()) return;
    if (savedRegistration === null) {
      mot.element.append(
        createElement('p', {
          className: 'atf-muted',
          text: "The seller hasn't put the reg in the description. Type it in from the photos, then Check.",
        }),
      );
      return;
    }
    mot.registrationInput.value = savedRegistration;
    if (registrationFromDescription !== null && registrationFromDescription === savedRegistration) {
      mot.registrationInput.title = "Found in the seller's description";
    }
    await mot.showSummaryFor(savedRegistration);
  }

  private reattachIfRemoved(): void {
    if (this.panel === null) return;
    const isFloating = this.panel.classList.contains('atf-floating');
    if (this.panel.isConnected && !isFloating) return;
    const place = placeForPanel();
    if (isFloating && this.panel.isConnected && place === null) return; // still waiting for the page
    if (place) {
      place.parent.insertBefore(this.panel, place.before);
      this.panel.classList.remove('atf-floating');
    } else {
      // Page layout not recognised: fall back to a floating panel rather than showing nothing.
      this.panel.classList.add('atf-floating');
      document.body.append(this.panel);
    }
  }

  remove(): void {
    this.panel?.remove();
    this.panel = null;
  }

  forget(): void {
    this.shownForAdvertId = null;
    this.remove();
  }
}
