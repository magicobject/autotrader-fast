// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.autotrader.co.uk/car-search?make=Mazda" }
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchTable } from '../src/autotrader/searchTable.ts';
import { PAGE_HOOK_SOURCE } from '../src/shared/messages.ts';
import { searchListing } from './fixtures/autotraderData.ts';
import { installChromeStorageStub } from './support/chromeStorageStub.ts';

const SEARCH_KEY = 'make=Mazda#sort=relevance';
const resultsPage = (listings: unknown[], pageNumber = 1) =>
  ({ source: PAGE_HOOK_SOURCE, kind: 'search-results-page', pageNumber, searchKey: SEARCH_KEY, listings }) as const;

const cheap = searchListing({
  advertId: '100000000001',
  title: 'Mazda MX-5 cheap',
  price: '£1,995',
  trackingContext: { advertContext: { price: 1995, year: 2005 } },
});
const dear = searchListing({
  advertId: '100000000002',
  title: 'Mazda MX-5 dear',
  price: '£9,995',
  trackingContext: { advertContext: { price: 9995, year: 2015 } },
  sellerType: 'PRIVATE',
});

const waitForRender = () => new Promise((resolve) => setTimeout(resolve, 100));
const shownTitles = () => [...document.querySelectorAll('.atf-car > a')].map((link) => link.textContent);

describe('SearchTable', () => {
  let table: SearchTable;
  beforeEach(() => {
    document.body.innerHTML = '<span data-testid="search-result-count">2 results</span>';
    installChromeStorageStub();
    table = new SearchTable();
  });

  it('shows a launcher with the car count, and a table of every car', async () => {
    await table.addResultsPage(resultsPage([cheap, dear]));
    expect(document.querySelector('.atf-launch')?.textContent).toBe('⚡ Fast table · 2 cars');
    table.open();
    await waitForRender();
    expect(shownTitles()).toEqual(['Mazda MX-5 cheap', 'Mazda MX-5 dear']);
    expect(document.querySelector('.atf-status')?.textContent).toBe('Showing 2 of 2 loaded (2 on Autotrader)');
  });

  it('sorts when a heading is pressed, and reverses on a second press', async () => {
    await table.addResultsPage(resultsPage([cheap, dear]));
    table.open();
    await waitForRender();
    const priceHeading = () =>
      [...document.querySelectorAll<HTMLButtonElement>('.atf-sort')].find((button) => button.textContent?.startsWith('Price'));
    priceHeading()?.click();
    expect(shownTitles()).toEqual(['Mazda MX-5 cheap', 'Mazda MX-5 dear']);
    expect(priceHeading()?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    priceHeading()?.click();
    expect(shownTitles()).toEqual(['Mazda MX-5 dear', 'Mazda MX-5 cheap']);
  });

  it('filters by price and by seller', async () => {
    await table.addResultsPage(resultsPage([cheap, dear]));
    table.open();
    const maxPrice = document.querySelector<HTMLInputElement>('input[aria-label="Max £"]');
    if (!maxPrice) throw new Error('no price filter');
    maxPrice.value = '5000';
    maxPrice.dispatchEvent(new Event('input'));
    await waitForRender();
    expect(shownTitles()).toEqual(['Mazda MX-5 cheap']);
  });

  it('shows a price drop when an advert comes back cheaper', async () => {
    await table.addResultsPage(resultsPage([dear]));
    await table.addResultsPage(
      resultsPage([{ ...dear, price: '£8,995', trackingContext: { advertContext: { price: 8995, year: 2015 } } }], 2),
    );
    expect(document.querySelector('.atf-launch')?.textContent).toBe('⚡ Fast table · 1 cars · 1 price drops');
    table.open();
    await waitForRender();
    expect(document.querySelector('.atf-down')?.textContent).toBe('↓1,000');
  });

  it('has no axe violations when open', async () => {
    await table.addResultsPage(resultsPage([cheap, dear]));
    table.open();
    await waitForRender();
    const overlay = document.querySelector('.atf-overlay');
    if (!overlay) throw new Error('no overlay');
    const results = await axe.run(overlay, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);
  });
});

describe('SearchTable keyboard and loading', () => {
  beforeEach(() => {
    document.body.innerHTML = '<span data-testid="search-result-count">2 results</span>';
    installChromeStorageStub();
  });

  it('moves focus into the table when opened, keeps it on a heading after sorting, and returns it when closed', async () => {
    const table = new SearchTable();
    await table.addResultsPage(resultsPage([cheap, dear]));
    const launcher = document.querySelector<HTMLButtonElement>('.atf-launch');
    launcher?.focus();
    table.open();
    expect(document.activeElement?.textContent).toBe('Load all pages');
    await waitForRender();
    document.querySelector<HTMLButtonElement>('button[data-column="price"]')?.click();
    expect(document.activeElement?.getAttribute('data-column')).toBe('price');
    table.close();
    expect(document.activeElement).toBe(launcher);
  });

  it('gives up loading pages if the page never answers', async () => {
    vi.useFakeTimers();
    try {
      const table = new SearchTable();
      await table.addResultsPage(resultsPage([cheap]));
      table.open();
      const loading = table.loadAllPages(5);
      await vi.advanceTimersByTimeAsync(20_500);
      await loading;
      await vi.advanceTimersByTimeAsync(200);
      expect(document.querySelector('.atf-status')?.textContent).toContain('Stopped: no reply from the page for 20 seconds');
    } finally {
      vi.useRealTimers();
    }
  });
});
