// @vitest-environment jsdom
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { QuickSortBar, type PageNavigation } from '../src/autotrader/quickSortBar.ts';
import { installChromeStorageStub } from './support/chromeStorageStub.ts';

const SEARCH = 'https://www.autotrader.co.uk/car-search?make=Mazda';

function fakeNavigation(startHref: string): PageNavigation & { readonly visits: { href: string; replace: boolean }[] } {
  const visits: { href: string; replace: boolean }[] = [];
  return { visits, currentHref: () => startHref, goTo: (href, replace) => visits.push({ href, replace }) };
}

const pressedLabels = () => [...document.querySelectorAll('.atf-qs-btn[aria-pressed="true"]')].map((button) => button.textContent);
const sortButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('.atf-qs-btn')].find((button) => button.textContent === label);

describe('QuickSortBar', () => {
  let stored: Map<string, unknown>;
  beforeEach(() => {
    stored = installChromeStorageStub();
    sessionStorage.clear();
    document.body.innerHTML =
      '<main><div><div data-testid="pills-action-area">Filters</div><ul><li data-testid="id-1">car</li></ul></div></main>';
  });

  it('sits after the filter pills and shows Autotrader’s own order as Best match', async () => {
    await new QuickSortBar(fakeNavigation(SEARCH)).update();
    const bar = document.querySelector('[data-testid="pills-action-area"] + nav.atf-quicksort');
    expect(bar?.getAttribute('aria-label')).toBe('Quick sort');
    expect(pressedLabels()).toEqual(['Best match']);
  });

  it('sorts with one click', async () => {
    const navigation = fakeNavigation(SEARCH);
    await new QuickSortBar(navigation).update();
    sortButton('Cheapest')?.click();
    expect(navigation.visits).toEqual([{ href: `${SEARCH}&sort=price-asc`, replace: false }]);
  });

  it('shows the current order as pressed', async () => {
    await new QuickSortBar(fakeNavigation(`${SEARCH}&sort=distance`)).update();
    expect(pressedLabels()).toEqual(['Nearest']);
  });

  it('saves a default and applies it, once, to searches that choose no order', async () => {
    await new QuickSortBar(fakeNavigation(`${SEARCH}&sort=mileage`)).update();
    document.querySelector<HTMLButtonElement>('.atf-qs-default')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored.get('v1:default-sort-order')).toBe('mileage');
    expect(document.querySelector('.atf-qs-default')?.textContent).toBe('★ My default');

    const unsorted = fakeNavigation(SEARCH);
    await new QuickSortBar(unsorted).update();
    expect(unsorted.visits).toEqual([{ href: `${SEARCH}&sort=mileage`, replace: true }]);

    const sameSearchAgain = fakeNavigation(SEARCH);
    await new QuickSortBar(sameSearchAgain).update();
    expect(sameSearchAgain.visits).toEqual([]); // never loops if the site drops the order
  });

  it('pressing the default again goes back to Autotrader’s order', async () => {
    stored.set('v1:default-sort-order', 'distance');
    await new QuickSortBar(fakeNavigation(`${SEARCH}&sort=distance`)).update();
    document.querySelector<HTMLButtonElement>('.atf-qs-default')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored.has('v1:default-sort-order')).toBe(false);
  });

  it('is not shown away from search results', async () => {
    await new QuickSortBar(fakeNavigation('https://www.autotrader.co.uk/car-details/123456789')).update();
    expect(document.querySelector('.atf-quicksort')).toBeNull();
  });

  it('has no axe violations', async () => {
    await new QuickSortBar(fakeNavigation(`${SEARCH}&sort=price-asc`)).update();
    const bar = document.querySelector('.atf-quicksort');
    if (!bar) throw new Error('no bar');
    const results = await axe.run(bar, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
