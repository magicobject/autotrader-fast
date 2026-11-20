// One-click sort buttons above Autotrader's search results, instead of opening "Filter and sort",
// scrolling to Sort, choosing and closing. Also lets Greg make one order his default, applied to
// every search that doesn't choose its own.
import { createElement } from '../shared/dom.ts';
import { readDefaultSortOrder, writeDefaultSortOrder } from '../shared/storage.ts';
import { SORT_ORDERS, hasSortInUrl, sortOrderInUrl, urlWithSortOrder, type SortOrder } from './sortOrders.ts';

export interface PageNavigation {
  readonly currentHref: () => string;
  /** Opens an address; `replace` swaps the current history entry instead of adding one. */
  readonly goTo: (href: string, replace: boolean) => void;
}

const browserNavigation: PageNavigation = {
  currentHref: () => location.href,
  goTo: (href, replace) => (replace ? location.replace(href) : location.assign(href)),
};

/** Remembers, for this browser tab, the searches already given the default sort, so it never loops. */
const DEFAULT_APPLIED_KEY = 'atfast-default-sort-applied';

function alreadyAppliedDefaultTo(href: string): boolean {
  try {
    return sessionStorage.getItem(DEFAULT_APPLIED_KEY) === href;
  } catch {
    return false;
  }
}

function rememberAppliedDefault(href: string): void {
  try {
    sessionStorage.setItem(DEFAULT_APPLIED_KEY, href);
  } catch {
    // storage unavailable: at worst the default is applied once more
  }
}

/** Where the bar goes: just after Autotrader's own filter pills, or before the results list. */
function placeForBar(): { readonly parent: Element; readonly before: Element | null } | null {
  const pills =
    document.querySelector('[data-testid="pills-action-area"]') ?? document.querySelector('[data-testid="filter-pills-container"]');
  if (pills?.parentElement) return { parent: pills.parentElement, before: pills.nextElementSibling };
  const firstResult = document.querySelector('li[data-testid^="id-"]')?.parentElement;
  if (firstResult?.parentElement) return { parent: firstResult.parentElement, before: firstResult };
  return null;
}

export class QuickSortBar {
  private defaultSortOrder: SortOrder | null = null;
  private hasReadDefault = false;

  constructor(private readonly navigation: PageNavigation = browserNavigation) {}

  /**
   * Called whenever the address may have changed. Applies the default sort to a search that has
   * none, and (re)inserts the bar, which Autotrader's page can remove when it redraws.
   */
  async update(): Promise<void> {
    if (!this.hasReadDefault) {
      this.defaultSortOrder = await readDefaultSortOrder();
      this.hasReadDefault = true;
    }
    const href = this.navigation.currentHref();
    if (!new URL(href).pathname.startsWith('/car-search')) {
      document.querySelector('.atf-quicksort')?.remove();
      return;
    }
    if (this.defaultSortOrder !== null && !hasSortInUrl(href) && !alreadyAppliedDefaultTo(href)) {
      rememberAppliedDefault(href);
      this.navigation.goTo(urlWithSortOrder(href, this.defaultSortOrder), true);
      return;
    }
    const existing = document.querySelector<HTMLElement>('.atf-quicksort');
    if (existing?.dataset['href'] === href && existing.isConnected) return;
    existing?.remove();
    const place = placeForBar();
    if (place) place.parent.insertBefore(this.buildBar(href), place.before);
  }

  private buildBar(href: string): HTMLElement {
    const currentSortOrder = sortOrderInUrl(href) ?? (hasSortInUrl(href) ? null : 'relevance');
    const sortButtons = SORT_ORDERS.map((order) =>
      createElement('button', {
        className: 'atf-qs-btn',
        text: order.label,
        attributes: { type: 'button', 'aria-pressed': String(order.value === currentSortOrder), 'data-sort': order.value },
        onClick: () => {
          if (order.value !== currentSortOrder) this.navigation.goTo(urlWithSortOrder(href, order.value), false);
        },
      }),
    );
    const isCurrentTheDefault = currentSortOrder !== null && currentSortOrder === this.defaultSortOrder;
    const defaultButton = createElement('button', {
      className: 'atf-qs-default',
      text: isCurrentTheDefault ? '★ My default' : '☆ Make this my default',
      title: isCurrentTheDefault
        ? 'Every search you open is sorted this way. Press to go back to Autotrader’s own order.'
        : 'Sort every search this way unless you choose otherwise',
      attributes: { type: 'button', 'aria-pressed': String(isCurrentTheDefault) },
      onClick: () => void this.toggleDefault(currentSortOrder, isCurrentTheDefault),
    });
    const bar = createElement(
      'nav',
      { className: 'atf-quicksort', attributes: { 'aria-label': 'Quick sort' } },
      createElement('span', { className: 'atf-qs-label', text: '⚡ Sort:' }),
      sortButtons,
      currentSortOrder === null ? null : defaultButton,
    );
    bar.dataset['href'] = href;
    return bar;
  }

  private async toggleDefault(currentSortOrder: SortOrder | null, isCurrentTheDefault: boolean): Promise<void> {
    this.defaultSortOrder = isCurrentTheDefault ? null : currentSortOrder;
    await writeDefaultSortOrder(this.defaultSortOrder);
    document.querySelector('.atf-quicksort')?.remove();
    await this.update();
    document.querySelector<HTMLButtonElement>('.atf-qs-default')?.focus();
  }
}
