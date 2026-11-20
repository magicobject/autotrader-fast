// The fast table on Autotrader search results: every listing of the search in one sortable,
// filterable table, with specs, price changes and MOT colours added.
import { nowEpochMs, type AdvertId, type EpochMs, type Registration } from '../shared/brands.ts';
import { createElement, type ElementChild } from '../shared/dom.ts';
import { CONTENT_SCRIPT_SOURCE, PAGE_HOOK_SOURCE, type ContentScriptMessage, type PageHookMessage } from '../shared/messages.ts';
import { firstNumberIn, formatPounds, formatWholeNumber } from '../shared/numbers.ts';
import { readPriceHistory, recordSearchVisit, savePriceHistory, type PriceHistory } from '../shared/storage.ts';
import { RAG_LABEL } from '../mot/motSummaryCard.ts';
import type { MotSummary, RagLevel } from '../mot/motHistoryTypes.ts';
import type { AdvertDetails } from './advertDetails.ts';
import { fetchAdvert, readCachedAdvertDetails, readCachedMotSummary, readSavedRegistration } from './advertLookup.ts';
import { parseSearchListings, type SearchListing } from './searchListings.ts';
import { filtersPartOf } from './searchRequest.ts';
import { csvField } from '../shared/csv.ts';

const DEFAULT_PAGE_LIMIT = 30;
const DELAY_BETWEEN_RESULT_PAGES_MS = 600;
const DELAY_BETWEEN_ADVERT_FETCHES_MS = 350;
const SIMULTANEOUS_ADVERT_FETCHES = 2;
const PRICE_HISTORY_SAVE_DELAY_MS = 1000;
const LOAD_SILENCE_LIMIT_MS = 20_000;

type LoadFinishedMessage = Extract<PageHookMessage, { kind: 'load-finished' }>;

interface TableRow {
  readonly listing: SearchListing;
  readonly firstSeenMs: EpochMs;
  /** Current price minus the first price we saw; negative is a drop. */
  readonly priceChangeGbp: number;
  readonly isNewSinceLastVisit: boolean;
  details: AdvertDetails | null;
  registration: Registration | null;
  motSummary: MotSummary | null;
}

interface TableFilters {
  words: string;
  maxPriceGbp: string;
  maxMileage: string;
  minYear: string;
  minEnginePowerBhp: string;
  isTradeOnly: boolean;
  isNewOnly: boolean;
  isPriceDropsOnly: boolean;
  isMotRedHidden: boolean;
}

type SortDirection = 1 | -1;
type SortValue = number | string | null;

interface TableColumn {
  readonly id: string;
  readonly heading: string;
  readonly explanation?: string;
  /** Null for columns that can't be sorted (the photo). */
  readonly sortValue: ((row: TableRow) => SortValue) | null;
  readonly firstSortDirection: SortDirection;
  readonly cellClass?: string;
  readonly renderCell: (row: TableRow) => ElementChild | readonly ElementChild[];
}

const RAG_SORT_ORDER: Readonly<Record<RagLevel, number>> = { red: 0, amber: 1, green: 2 };
const PRICE_RATING_ORDER: Readonly<Record<string, number>> = {
  'Great price': 1,
  'Good price': 2,
  'Lower price': 2.5,
  'Fair price': 3,
  'Higher price': 4,
};
const ASCENDING: SortDirection = 1;
const DESCENDING: SortDirection = -1;

function milesPerYear(listing: SearchListing): number | null {
  if (listing.mileage === null || listing.year === null) return null;
  const ageInYears = Math.max(0.5, new Date().getFullYear() - listing.year + 0.5);
  return listing.mileage / ageInYears;
}

function numberCell(value: number | null, prefix = ''): string {
  return value === null ? '' : prefix + String(value);
}

const TABLE_COLUMNS: readonly TableColumn[] = [
  {
    id: 'photo',
    heading: '',
    sortValue: null,
    firstSortDirection: ASCENDING,
    renderCell: (row) =>
      row.listing.thumbnailUrl
        ? createElement(
            'a',
            { attributes: { href: row.listing.advertUrl, target: '_blank', rel: 'noopener' } },
            createElement('img', {
              className: 'atf-thumb',
              attributes: { src: row.listing.thumbnailUrl, loading: 'lazy', alt: `Photo: ${row.listing.title} ${row.listing.subtitle}` },
            }),
          )
        : null,
  },
  {
    id: 'car',
    heading: 'Car',
    sortValue: (row) => `${row.listing.title} ${row.listing.subtitle}`,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-car',
    renderCell: (row) => [
      createElement('a', { text: row.listing.title, attributes: { href: row.listing.advertUrl, target: '_blank', rel: 'noopener' } }),
      row.isNewSinceLastVisit ? createElement('span', { className: 'atf-pill', text: 'NEW' }) : null,
      createElement('div', { className: 'atf-sub', text: row.listing.subtitle }),
      createElement('div', {
        className: 'atf-muted',
        text: [row.listing.location, row.listing.otherBadges.join(', ')].filter(Boolean).join(' · '),
      }),
    ],
  },
  {
    id: 'price',
    heading: 'Price',
    sortValue: (row) => row.listing.priceGbp,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => formatPounds(row.listing.priceGbp),
  },
  {
    id: 'price-change',
    heading: 'Δ£',
    explanation: 'Price change since you first saw it',
    sortValue: (row) => row.priceChangeGbp || null,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) =>
      row.priceChangeGbp === 0
        ? ''
        : createElement('span', {
            className: row.priceChangeGbp < 0 ? 'atf-down' : 'atf-up',
            text: `${row.priceChangeGbp < 0 ? '↓' : '↑'}${formatWholeNumber(Math.abs(row.priceChangeGbp))}`,
          }),
  },
  {
    id: 'year',
    heading: 'Year',
    sortValue: (row) => row.listing.year,
    firstSortDirection: DESCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.listing.year),
  },
  {
    id: 'mileage',
    heading: 'Miles',
    sortValue: (row) => row.listing.mileage,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => formatWholeNumber(row.listing.mileage),
  },
  {
    id: 'miles-per-year',
    heading: 'Mi/yr',
    explanation: 'Average miles a year',
    sortValue: (row) => milesPerYear(row.listing),
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => formatWholeNumber(milesPerYear(row.listing)),
  },
  {
    id: 'distance',
    heading: 'Dist',
    explanation: 'Distance in miles',
    sortValue: (row) => row.listing.distanceMiles,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.listing.distanceMiles),
  },
  {
    id: 'power',
    heading: 'BHP',
    sortValue: (row) => row.details?.enginePowerBhp ?? null,
    firstSortDirection: DESCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.enginePowerBhp ?? null),
  },
  {
    id: 'acceleration',
    heading: '0-62',
    explanation: 'Seconds from 0 to 62 mph',
    sortValue: (row) => row.details?.zeroTo62Seconds ?? null,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.zeroTo62Seconds ?? null),
  },
  {
    id: 'top-speed',
    heading: 'Top',
    explanation: 'Top speed, mph',
    sortValue: (row) => row.details?.topSpeedMph ?? null,
    firstSortDirection: DESCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.topSpeedMph ?? null),
  },
  {
    id: 'torque',
    heading: 'Nm',
    explanation: 'Torque, newton metres',
    sortValue: (row) => row.details?.torqueNm ?? null,
    firstSortDirection: DESCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.torqueNm ?? null),
  },
  {
    id: 'mpg',
    heading: 'MPG',
    sortValue: (row) => row.details?.milesPerGallon ?? null,
    firstSortDirection: DESCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.milesPerGallon ?? null),
  },
  {
    id: 'insurance',
    heading: 'Ins',
    explanation: 'Insurance group',
    sortValue: (row) => row.details?.insuranceGroupNumber ?? null,
    firstSortDirection: ASCENDING,
    renderCell: (row) => row.details?.insuranceGroup ?? '',
  },
  {
    id: 'tax',
    heading: 'Tax',
    explanation: 'Road tax per year',
    sortValue: (row) => row.details?.roadTaxPerYearGbp ?? null,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.roadTaxPerYearGbp ?? null, '£'),
  },
  {
    id: 'owners',
    heading: 'Own',
    explanation: 'Previous owners',
    sortValue: (row) => row.details?.ownerCount ?? null,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-num',
    renderCell: (row) => numberCell(row.details?.ownerCount ?? null),
  },
  {
    id: 'gearbox',
    heading: 'Box',
    explanation: 'Gearbox',
    sortValue: (row) => row.details?.gearbox ?? null,
    firstSortDirection: ASCENDING,
    renderCell: (row) => row.details?.gearbox ?? '',
  },
  {
    id: 'fuel',
    heading: 'Fuel',
    sortValue: (row) => row.details?.fuelType ?? null,
    firstSortDirection: ASCENDING,
    renderCell: (row) => row.details?.fuelType ?? '',
  },
  {
    id: 'body',
    heading: 'Body',
    sortValue: (row) => row.details?.bodyType ?? null,
    firstSortDirection: ASCENDING,
    renderCell: (row) => row.details?.bodyType ?? '',
  },
  {
    id: 'service',
    heading: 'Service',
    explanation: 'Service history',
    sortValue: (row) => row.details?.serviceHistory ?? null,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-small',
    renderCell: (row) => row.details?.serviceHistory ?? '',
  },
  {
    id: 'autotrader-check',
    heading: 'Check',
    explanation: "Autotrader's basic history check (stolen, scrapped, written off…)",
    sortValue: (row) =>
      row.details === null || row.details.autotraderCheck === 'unknown' ? null : row.details.autotraderCheck === 'passed' ? 1 : 0,
    firstSortDirection: ASCENDING,
    renderCell: (row) => {
      if (row.details === null || row.details.autotraderCheck === 'unknown') return '';
      const passed = row.details.autotraderCheck === 'passed';
      return createElement('span', {
        text: passed ? '✓' : '⚠',
        title: passed ? (row.details.autotraderCheckText ?? 'Passed') : row.details.autotraderCheckProblems.join(', '),
        attributes: { 'aria-label': passed ? 'Check passed' : 'Check flagged a problem' },
      });
    },
  },
  {
    id: 'mot',
    heading: 'MOT',
    explanation: 'MOT history summary, for cars you have checked on GOV.UK from their advert',
    sortValue: (row) => (row.motSummary ? RAG_SORT_ORDER[row.motSummary.overall] : null),
    firstSortDirection: ASCENDING,
    renderCell: (row) =>
      row.motSummary
        ? createElement('span', {
            className: `atf-rag atf-rag-${row.motSummary.overall}`,
            text: RAG_LABEL[row.motSummary.overall].charAt(0),
            title:
              row.motSummary.findings
                .filter((finding) => finding.level !== 'green')
                .map((finding) => finding.explanation)
                .join('\n') || 'No concerns',
            attributes: { 'aria-label': `MOT ${RAG_LABEL[row.motSummary.overall]}` },
          })
        : row.registration
          ? createElement('span', { className: 'atf-muted', text: row.registration })
          : '',
  },
  {
    id: 'seller',
    heading: 'Seller',
    sortValue: (row) => row.listing.sellerKind,
    firstSortDirection: ASCENDING,
    renderCell: (row) =>
      `${row.listing.sellerKind === 'private' ? 'Private' : 'Trade'}${row.listing.dealerRating === null ? '' : ` ${row.listing.dealerRating}★`}`,
  },
  {
    id: 'price-rating',
    heading: 'Price rating',
    explanation: "Autotrader's price indicator",
    sortValue: (row) => PRICE_RATING_ORDER[row.listing.priceRating] ?? null,
    firstSortDirection: ASCENDING,
    cellClass: 'atf-small',
    renderCell: (row) => row.listing.priceRating,
  },
];

const sleep = (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs));

function compareSortValues(first: SortValue, second: SortValue, direction: SortDirection): number {
  if (first === null && second === null) return 0;
  if (first === null) return 1; // blanks always last
  if (second === null) return -1;
  const comparison = typeof first === 'number' && typeof second === 'number' ? first - second : String(first).localeCompare(String(second));
  return comparison * direction;
}

export class SearchTable {
  private currentSearchKey: string | null = null;
  private previousVisitMs: EpochMs | null = null;
  private readonly sessionStartMs = nowEpochMs();
  private readonly rowsByAdvertId = new Map<AdvertId, TableRow>();
  private highestPageNumber = 0;
  private priceHistory: PriceHistory | null = null;
  private priceHistorySaveTimer: ReturnType<typeof setTimeout> | undefined;
  private launcherButton: HTMLButtonElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private statusText: HTMLSpanElement | null = null;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private sortColumnId: string | null = null;
  private sortDirection: SortDirection = ASCENDING;
  private activeTask: 'loading-pages' | 'fetching-specs' | null = null;
  private readonly filters: TableFilters = {
    words: '',
    maxPriceGbp: '',
    maxMileage: '',
    minYear: '',
    minEnginePowerBhp: '',
    isTradeOnly: false,
    isNewOnly: false,
    isPriceDropsOnly: false,
    isMotRedHidden: false,
  };

  /** Results pages are handled one at a time, in arrival order, so none can overwrite another's work. */
  private resultsQueue: Promise<void> = Promise.resolve();

  addResultsPage(message: Extract<PageHookMessage, { kind: 'search-results-page' }>): Promise<void> {
    this.resultsQueue = this.resultsQueue.then(() => this.processResultsPage(message)).catch(() => undefined);
    return this.resultsQueue;
  }

  private async processResultsPage(message: Extract<PageHookMessage, { kind: 'search-results-page' }>): Promise<void> {
    if (message.searchKey !== this.currentSearchKey) {
      if (message.loadRunId !== undefined) return; // pages still arriving for a search we've left
      this.currentSearchKey = message.searchKey;
      this.rowsByAdvertId.clear();
      this.highestPageNumber = 0;
      this.previousVisitMs = await recordSearchVisit(filtersPartOf(message.searchKey));
    }
    this.highestPageNumber = Math.max(this.highestPageNumber, message.pageNumber);
    this.priceHistory ??= await readPriceHistory();
    const seenAt = nowEpochMs();
    const newRows: TableRow[] = [];
    for (const listing of parseSearchListings(message.listings)) {
      const seen = (this.priceHistory[listing.advertId] ??= { firstSeenMs: seenAt, lastSeenMs: seenAt, pricePoints: [] });
      const lastPrice = seen.pricePoints.at(-1)?.[1];
      if (lastPrice !== listing.priceGbp) seen.pricePoints.push([seenAt, listing.priceGbp]);
      seen.lastSeenMs = seenAt;
      const firstPrice = seen.pricePoints[0]?.[1] ?? listing.priceGbp;
      const existing = this.rowsByAdvertId.get(listing.advertId);
      const row: TableRow = {
        listing,
        firstSeenMs: seen.firstSeenMs,
        priceChangeGbp: listing.priceGbp - firstPrice,
        isNewSinceLastVisit: this.previousVisitMs !== null && seen.firstSeenMs >= this.sessionStartMs,
        details: existing?.details ?? null,
        registration: existing?.registration ?? null,
        motSummary: existing?.motSummary ?? null,
      };
      this.rowsByAdvertId.set(listing.advertId, row);
      if (existing === undefined) newRows.push(row);
    }
    this.savePriceHistorySoon();
    await this.attachCachedExtras(newRows);
    this.updateLauncher();
    this.scheduleRender();
  }

  /** Adds anything already known about each new car: specs, a saved reg, a recent MOT summary. */
  private async attachCachedExtras(newRows: readonly TableRow[]): Promise<void> {
    await Promise.all(
      newRows.map(async (row) => {
        row.details = await readCachedAdvertDetails(row.listing.advertId);
        row.registration ??= await readSavedRegistration(row.listing.advertId);
        if (row.registration !== null) row.motSummary = (await readCachedMotSummary(row.registration))?.summary ?? null;
      }),
    );
  }

  private savePriceHistorySoon(): void {
    clearTimeout(this.priceHistorySaveTimer);
    this.priceHistorySaveTimer = setTimeout(() => {
      if (this.priceHistory === null) return;
      // Merged with a fresh read when saving, so another tab's prices are never overwritten.
      void savePriceHistory(this.priceHistory);
    }, PRICE_HISTORY_SAVE_DELAY_MS);
  }

  /** Shows or hides the launcher button depending on whether this is a search page. */
  updateLauncher(): void {
    if (!location.pathname.startsWith('/car-search')) {
      this.launcherButton?.remove();
      this.launcherButton = null;
      if (this.overlay) this.overlay.hidden = true;
      return;
    }
    if (this.launcherButton === null) {
      this.launcherButton = createElement('button', {
        className: 'atf-launch',
        title: 'Open the fast table (Alt+Shift+F)',
        onClick: () => this.open(),
      });
      document.body.append(this.launcherButton);
    }
    const rows = [...this.rowsByAdvertId.values()];
    const newCount = rows.filter((row) => row.isNewSinceLastVisit).length;
    const priceDropCount = rows.filter((row) => row.priceChangeGbp < 0).length;
    this.launcherButton.textContent =
      `⚡ Fast table · ${rows.length} cars` +
      (newCount ? ` · ${newCount} new` : '') +
      (priceDropCount ? ` · ${priceDropCount} price drops` : '');
  }

  private focusBeforeOpening: HTMLElement | null = null;

  open(): void {
    if (this.overlay === null) this.overlay = this.buildOverlay();
    if (!this.overlay.hidden) return;
    this.focusBeforeOpening = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.overlay.hidden = false;
    this.overlay.querySelector<HTMLElement>('.atf-btn')?.focus();
    this.scheduleRender();
  }

  close(): void {
    if (this.overlay === null || this.overlay.hidden) return;
    this.overlay.hidden = true;
    (this.focusBeforeOpening ?? this.launcherButton)?.focus();
  }

  private buildOverlay(): HTMLDivElement {
    const textFilter = (
      key: 'words' | 'maxPriceGbp' | 'maxMileage' | 'minYear' | 'minEnginePowerBhp',
      label: string,
      widthPx: number,
    ): HTMLInputElement =>
      createElement('input', {
        className: 'atf-in',
        attributes: { placeholder: label, 'aria-label': label, style: `width:${widthPx}px`, value: this.filters[key] },
        onInput: (event) => {
          if (event.currentTarget instanceof HTMLInputElement) this.filters[key] = event.currentTarget.value;
          this.scheduleRender();
        },
      });
    const tickFilter = (key: 'isTradeOnly' | 'isNewOnly' | 'isPriceDropsOnly' | 'isMotRedHidden', label: string): HTMLLabelElement =>
      createElement(
        'label',
        { className: 'atf-chk' },
        createElement('input', {
          attributes: { type: 'checkbox' },
          onInput: (event) => {
            if (event.currentTarget instanceof HTMLInputElement) this.filters[key] = event.currentTarget.checked;
            this.scheduleRender();
          },
        }),
        label,
      );
    const pageLimitInput = createElement('input', {
      className: 'atf-in',
      title: 'Most result pages to load (about 25 cars each)',
      attributes: {
        type: 'number',
        min: '1',
        max: '100',
        value: String(DEFAULT_PAGE_LIMIT),
        style: 'width:56px',
        'aria-label': 'Page limit',
      },
    });
    this.statusText = createElement('span', { className: 'atf-status', attributes: { role: 'status' } });
    const button = (label: string, explanation: string, action: () => void): HTMLButtonElement =>
      createElement('button', { className: 'atf-btn', text: label, title: explanation, onClick: action });

    const toolbar = createElement(
      'div',
      { className: 'atf-bar' },
      createElement('strong', { className: 'atf-brand', text: '⚡ Fast table' }),
      button(
        'Load all pages',
        'Load every page of this search',
        () => void this.loadAllPages(firstNumberIn(pageLimitInput.value) ?? DEFAULT_PAGE_LIMIT),
      ),
      pageLimitInput,
      button('Get specs', 'Fill in performance, running costs and history for the cars shown', () => void this.fetchSpecsForShownCars()),
      textFilter('words', 'Filter words, -exclude', 170),
      textFilter('maxPriceGbp', 'Max £', 80),
      textFilter('maxMileage', 'Max miles', 80),
      textFilter('minYear', 'Min year', 70),
      textFilter('minEnginePowerBhp', 'Min BHP', 70),
      tickFilter('isTradeOnly', 'Trade only'),
      tickFilter('isNewOnly', 'New'),
      tickFilter('isPriceDropsOnly', 'Price drops'),
      tickFilter('isMotRedHidden', 'Hide MOT red'),
      button('CSV', 'Download the table as a spreadsheet file', () => this.downloadCsv()),
      this.statusText,
      createElement('button', {
        className: 'atf-x',
        text: '✕',
        title: 'Close (Esc)',
        attributes: { 'aria-label': 'Close the fast table' },
        onClick: () => this.close(),
      }),
    );
    const overlay = createElement(
      'div',
      { className: 'atf-overlay', attributes: { role: 'dialog', 'aria-label': 'Fast table' } },
      toolbar,
      createElement('div', { className: 'atf-tablewrap' }, createElement('table', { className: 'atf-table' })),
    );
    overlay.hidden = true; // open() shows it
    document.body.append(overlay);
    return overlay;
  }

  private isRowShown(row: TableRow): boolean {
    const { filters } = this;
    const { listing, details } = row;
    if (filters.words.trim() !== '') {
      const searchableText = [
        listing.title,
        listing.subtitle,
        listing.attentionGrabber,
        listing.location,
        ...listing.otherBadges,
        details?.gearbox,
        details?.fuelType,
        details?.bodyType,
        details?.colour,
        details?.drivetrain,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      for (const word of filters.words.toLowerCase().split(/\s+/).filter(Boolean)) {
        const isExclusion = word.startsWith('-') && word.length > 1;
        if (isExclusion ? searchableText.includes(word.slice(1)) : !searchableText.includes(word)) return false;
      }
    }
    const maxPrice = firstNumberIn(filters.maxPriceGbp);
    const maxMileage = firstNumberIn(filters.maxMileage);
    const minYear = firstNumberIn(filters.minYear);
    const minPower = firstNumberIn(filters.minEnginePowerBhp);
    if (maxPrice !== null && listing.priceGbp > maxPrice) return false;
    if (maxMileage !== null && (listing.mileage ?? 0) > maxMileage) return false;
    if (minYear !== null && (listing.year ?? 0) < minYear) return false;
    if (minPower !== null && (details?.enginePowerBhp ?? 0) < minPower) return false;
    if (filters.isTradeOnly && listing.sellerKind === 'private') return false;
    if (filters.isNewOnly && !row.isNewSinceLastVisit) return false;
    if (filters.isPriceDropsOnly && row.priceChangeGbp >= 0) return false;
    if (filters.isMotRedHidden && row.motSummary?.overall === 'red') return false;
    return true;
  }

  private shownRows(): TableRow[] {
    const rows = [...this.rowsByAdvertId.values()].filter((row) => this.isRowShown(row));
    const sortColumn = TABLE_COLUMNS.find((column) => column.id === this.sortColumnId);
    const sortValue = sortColumn?.sortValue;
    if (sortValue) rows.sort((first, second) => compareSortValues(sortValue(first), sortValue(second), this.sortDirection));
    return rows;
  }

  private scheduleRender(): void {
    if (this.overlay === null || this.overlay.hidden) return;
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.render(), 60);
  }

  private sortBy(column: TableColumn): void {
    if (this.sortColumnId === column.id) {
      this.sortDirection = this.sortDirection === ASCENDING ? DESCENDING : ASCENDING;
    } else {
      this.sortColumnId = column.id;
      this.sortDirection = column.firstSortDirection;
    }
    this.render();
    // The headings are rebuilt, so put keyboard focus back on the one that was pressed.
    this.overlay?.querySelector<HTMLButtonElement>(`button[data-column="${column.id}"]`)?.focus();
  }

  private render(): void {
    const table = this.overlay?.querySelector('table');
    if (!table) return;
    const rows = this.shownRows();
    const headingRow = createElement(
      'tr',
      {},
      TABLE_COLUMNS.map((column) => {
        const isSorted = this.sortColumnId === column.id;
        const arrow = isSorted ? (this.sortDirection === ASCENDING ? ' ▲' : ' ▼') : '';
        const ariaSort = isSorted ? (this.sortDirection === ASCENDING ? 'ascending' : 'descending') : 'none';
        if (column.sortValue === null)
          return createElement(
            'th',
            { attributes: { scope: 'col' } },
            createElement('span', { className: 'atf-visually-hidden', text: 'Photo' }),
          );
        return createElement(
          'th',
          { className: isSorted ? 'atf-sorted' : '', attributes: { scope: 'col', 'aria-sort': ariaSort } },
          createElement('button', {
            className: 'atf-sort',
            attributes: { 'data-column': column.id },
            text: column.heading + arrow,
            title: column.explanation ?? 'Sort by this column',
            onClick: () => this.sortBy(column),
          }),
        );
      }),
    );
    const bodyRows = rows.map((row) =>
      createElement(
        'tr',
        { className: [row.isNewSinceLastVisit ? 'atf-new' : '', row.listing.placement === 'featured' ? 'atf-feat' : ''].join(' ').trim() },
        TABLE_COLUMNS.map((column) =>
          createElement('td', column.cellClass === undefined ? {} : { className: column.cellClass }, column.renderCell(row)),
        ),
      ),
    );
    table.replaceChildren(createElement('thead', {}, headingRow), createElement('tbody', {}, bodyRows));
    if (this.activeTask === null) this.showStatus(this.idleStatus(rows.length));
  }

  private idleStatus(shownCount: number): string {
    const totalOnAutotrader = firstNumberIn(document.querySelector('[data-testid="search-result-count"]')?.textContent);
    return (
      `Showing ${shownCount} of ${this.rowsByAdvertId.size} loaded` +
      (totalOnAutotrader === null ? '' : ` (${totalOnAutotrader} on Autotrader)`) +
      (this.lastTaskOutcome === null ? '' : ` · ${this.lastTaskOutcome}`)
    );
  }

  /** How the last Load or Get specs ended, kept on show until the next one starts. */
  private lastTaskOutcome: string | null = null;

  private showStatus(text: string): void {
    if (this.statusText) this.statusText.textContent = text;
  }

  private showTaskOutcome(text: string): void {
    this.lastTaskOutcome = text;
    this.showStatus(text);
  }

  async loadAllPages(pageLimit: number): Promise<void> {
    if (this.activeTask !== null) return;
    const firstPageNumber = this.highestPageNumber + 1;
    // Pages hold about 25 cars but some slots are adverts, so the loader runs until a page comes
    // back empty rather than trusting a page count worked out from the total.
    if (firstPageNumber > pageLimit) return this.showStatus('All pages up to the limit are already loaded.');
    this.activeTask = 'loading-pages';
    const loadRunId = crypto.randomUUID();
    this.showStatus(`Loading pages ${firstPageNumber}–${pageLimit}…`);
    const finished = new Promise<LoadFinishedMessage>((resolve) => {
      this.pendingLoad = { loadRunId, resolve, watchdog: undefined };
      this.restartLoadWatchdog();
    });
    const request: ContentScriptMessage = {
      source: CONTENT_SCRIPT_SOURCE,
      kind: 'load-more-pages',
      loadRunId,
      firstPageNumber,
      lastPageNumber: Math.min(pageLimit, 100),
      delayBetweenPagesMs: DELAY_BETWEEN_RESULT_PAGES_MS,
    };
    window.postMessage(request, location.origin);
    const result = await finished;
    clearTimeout(this.pendingLoad?.watchdog);
    this.pendingLoad = null;
    this.activeTask = null;
    switch (result.outcome) {
      case 'reached-last-page':
      case 'reached-page-limit':
        this.showTaskOutcome(`Done · ${this.rowsByAdvertId.size} cars`);
        break;
      case 'no-search-captured-yet':
        this.showTaskOutcome('Scroll the Autotrader results once, then try again.');
        break;
      case 'failed':
        this.showTaskOutcome(`Stopped: ${result.failureReason ?? 'unknown problem'}`);
        break;
      default: {
        const unhandled: never = result.outcome;
        throw new Error(`Unhandled outcome ${String(unhandled)}`);
      }
    }
    this.scheduleRender();
  }

  private pendingLoad: {
    readonly loadRunId: string;
    readonly resolve: (message: LoadFinishedMessage) => void;
    watchdog: ReturnType<typeof setTimeout> | undefined;
  } | null = null;

  /** Gives up if the page hook goes quiet, so a lost reply can't leave the table stuck. */
  private restartLoadWatchdog(): void {
    const pending = this.pendingLoad;
    if (pending === null) return;
    clearTimeout(pending.watchdog);
    pending.watchdog = setTimeout(
      () =>
        pending.resolve({
          source: PAGE_HOOK_SOURCE,
          kind: 'load-finished',
          loadRunId: pending.loadRunId,
          outcome: 'failed',
          failureReason: `no reply from the page for ${LOAD_SILENCE_LIMIT_MS / 1000} seconds`,
        }),
      LOAD_SILENCE_LIMIT_MS,
    );
  }

  handleLoadProgress(message: Extract<PageHookMessage, { kind: 'load-progress' | 'load-finished' }>): void {
    if (this.pendingLoad?.loadRunId !== message.loadRunId) return;
    if (message.kind === 'load-progress') {
      this.restartLoadWatchdog();
      this.showStatus(`Loaded page ${message.pageNumber} · ${this.rowsByAdvertId.size} cars`);
    } else {
      this.pendingLoad.resolve(message);
    }
  }

  private async fetchSpecsForShownCars(): Promise<void> {
    if (this.activeTask !== null) return;
    this.activeTask = 'fetching-specs';
    const waiting = this.shownRows().filter((row) => row.details === null);
    let doneCount = 0;
    let failedCount = 0;
    const fetchNextUntilDone = async (): Promise<void> => {
      for (let row = waiting.shift(); row !== undefined; row = waiting.shift()) {
        try {
          const result = await fetchAdvert(row.listing.advertId);
          row.details = result.details;
          row.registration ??= await readSavedRegistration(row.listing.advertId);
        } catch {
          failedCount++;
        }
        doneCount++;
        this.showStatus(`Specs ${doneCount}/${doneCount + waiting.length}` + (failedCount ? ` (${failedCount} failed)` : ''));
        this.scheduleRender();
        await sleep(DELAY_BETWEEN_ADVERT_FETCHES_MS);
      }
    };
    await Promise.all(Array.from({ length: SIMULTANEOUS_ADVERT_FETCHES }, fetchNextUntilDone));
    this.activeTask = null;
    this.showTaskOutcome(`Specs done for ${doneCount} cars` + (failedCount ? `, ${failedCount} failed` : ''));
  }

  private downloadCsv(): void {
    const csvColumns: readonly (readonly [heading: string, value: (row: TableRow) => string | number | null])[] = [
      ['Title', (row) => row.listing.title],
      ['Version', (row) => row.listing.subtitle],
      ['Price £', (row) => row.listing.priceGbp],
      ['Price change £', (row) => row.priceChangeGbp],
      ['Year', (row) => row.listing.year],
      ['Miles', (row) => row.listing.mileage],
      ['Distance', (row) => row.listing.distanceMiles],
      ['Location', (row) => row.listing.location],
      ['Seller', (row) => row.listing.sellerKind],
      ['Price rating', (row) => row.listing.priceRating],
      ['BHP', (row) => row.details?.enginePowerBhp ?? null],
      ['0-62 s', (row) => row.details?.zeroTo62Seconds ?? null],
      ['Top speed mph', (row) => row.details?.topSpeedMph ?? null],
      ['Torque Nm', (row) => row.details?.torqueNm ?? null],
      ['MPG', (row) => row.details?.milesPerGallon ?? null],
      ['Insurance group', (row) => row.details?.insuranceGroup ?? null],
      ['Tax £', (row) => row.details?.roadTaxPerYearGbp ?? null],
      ['Owners', (row) => row.details?.ownerCount ?? null],
      ['Gearbox', (row) => row.details?.gearbox ?? null],
      ['Fuel', (row) => row.details?.fuelType ?? null],
      ['Body', (row) => row.details?.bodyType ?? null],
      ['Service history', (row) => row.details?.serviceHistory ?? null],
      ['Reg', (row) => row.registration],
      ['MOT', (row) => row.motSummary?.overall ?? null],
      ['Link', (row) => row.listing.advertUrl],
    ];
    const lines = [
      csvColumns.map(([heading]) => heading).join(','),
      ...this.shownRows().map((row) => csvColumns.map(([, value]) => csvField(value(row))).join(',')),
    ];
    const downloadLink = createElement('a', {
      attributes: { href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })), download: 'autotrader-search.csv' },
    });
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(downloadLink.href), 10_000);
  }

  isOpen(): boolean {
    return this.overlay !== null && !this.overlay.hidden;
  }
}
