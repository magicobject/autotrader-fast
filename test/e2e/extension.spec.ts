import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { advertPageData, advertPageHtml, searchListing } from '../fixtures/autotraderData.ts';
import { motHistoryPageHtml } from '../fixtures/motHistoryPage.ts';

const EXTENSION_FOLDER = resolve('dist');

const motPage = motHistoryPageHtml({
  makeAndModel: 'MAZDA MX-5',
  motDue: '7 February 2027',
  tests: [
    { date: '4 February 2026', result: 'PASS', odometer: '30,000 miles', expiry: '7 February 2027' },
    {
      date: '3 February 2025',
      result: 'PASS',
      odometer: '20,000 miles',
      expiry: '6 February 2026',
      defects: { advisory: ['Offside Sill corroded (5.3.3)'] },
    },
    { date: '2 February 2023', result: 'PASS', odometer: '10,000 miles', expiry: '1 February 2024' },
  ],
});

/** A results page that loads its listings the way Autotrader does: a POST to its gateway. */
const searchPage = `<!doctype html><html lang="en"><head><title>Search</title></head><body>
<div><div data-testid="pills-action-area">Filters</div><span data-testid="search-result-count">2 results</span><main id="results">Loading</main></div>
<script>
fetch('/at-gateway?opname=SearchResultsListingsGridQuery', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify([{ operationName: 'SearchResultsListingsGridQuery', variables: { page: 1, sortBy: 'relevance', filters: [{ filter: 'make', selected: ['Mazda'] }] } }]),
}).then(() => { document.getElementById('results').textContent = 'Loaded'; });
</script></body></html>`;

let context: BrowserContext;

test.beforeAll(async () => {
  process.env['PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS'] = '1';
  // Playwright's own Chromium allows loading an unpacked extension (branded Chrome no longer does).
  // CHROME_PATH points at another Chromium-based browser instead, e.g. where Playwright's isn't installed.
  const chromePath = process.env['CHROME_PATH'];
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'atfast-')), {
    ...(chromePath ? { executablePath: chromePath } : { channel: 'chromium' }),
    headless: true,
    args: [`--disable-extensions-except=${EXTENSION_FOLDER}`, `--load-extension=${EXTENSION_FOLDER}`],
  });
  await context.route('https://www.check-mot.service.gov.uk/**', (route) => route.fulfill({ contentType: 'text/html', body: motPage }));
  await context.route('https://www.autotrader.co.uk/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/at-gateway') {
      const page = JSON.parse(route.request().postData() ?? '[]')[0]?.variables?.page ?? 1;
      const listings =
        page === 1
          ? [
              searchListing({
                advertId: '100000000001',
                title: 'Mazda MX-5 cheap',
                price: '£1,995',
                trackingContext: { advertContext: { price: 1995, year: 2005 } },
              }),
              searchListing({
                advertId: '100000000002',
                title: 'Mazda MX-5 dear',
                price: '£9,995',
                trackingContext: { advertContext: { price: 9995, year: 2015 } },
              }),
            ]
          : page === 2
            ? [
                searchListing({
                  advertId: '100000000003',
                  title: 'Mazda MX-5 page two',
                  price: '£4,995',
                  trackingContext: { advertContext: { price: 4995, year: 2010 } },
                }),
              ]
            : [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ data: { searchResults: { listings } } }]) });
    }
    if (url.pathname.startsWith('/car-details/')) {
      const dataScript = advertPageHtml(advertPageData({ id: url.pathname.split('/')[2] ?? '' })).replace(
        /^<html><body>|<\/body><\/html>$/g,
        '',
      );
      const body = `<html lang="en"><head><title>Advert</title></head><body><main>
        <section data-testid="vehicle-information"><h1>2016 Mazda MX-5</h1></section>
        <section data-testid="overview"><h2>Overview</h2></section>
        <section data-testid="description"><h2>Description</h2><p>A lovely car.</p></section>
      </main>${dataScript}</body></html>`;
      return route.fulfill({ contentType: 'text/html', body });
    }
    return route.fulfill({ contentType: 'text/html', body: searchPage });
  });
});

test.afterAll(async () => {
  await context?.close(); // undefined if the browser never started; the real error is reported above
});

test('adds the MOT summary to the GOV.UK results page, cross-checked against the advert', async () => {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto('https://www.check-mot.service.gov.uk/results?registration=ZZ99ZZZ&checkRecalls=true&atfMiles=25000&atfMake=Mazda');
  const card = page.getByRole('region', { name: 'MOT history summary' });
  await expect(card).toContainText('RED ZZ99 ZZZ MAZDA MX-5');
  await expect(card).toContainText('Advert says 25,000 miles, but the last MOT recorded 30,000');
  await expect(card).toContainText('Corrosion (advisory, 3 Feb 2025): Offside Sill corroded');
  expect(errors).toEqual([]);
});

test('builds the fast table from the search data and loads further pages', async () => {
  const page = await context.newPage();
  await page.goto('https://www.autotrader.co.uk/car-search?make=Mazda');
  await expect(page.locator('.atf-launch')).toHaveText('⚡ Fast table · 2 cars');
  await page.keyboard.press('Alt+Shift+F');
  const table = page.getByRole('dialog', { name: 'Fast table' });
  await expect(table.locator('.atf-car > a')).toHaveText(['Mazda MX-5 cheap', 'Mazda MX-5 dear']);
  await table.getByRole('button', { name: 'Load all pages' }).click();
  await expect(table.locator('.atf-status')).toHaveText('Showing 3 of 3 loaded (2 on Autotrader) · Done · 3 cars');
  await table.getByRole('button', { name: 'Price', exact: true }).click();
  await expect(table.locator('.atf-car > a')).toHaveText(['Mazda MX-5 cheap', 'Mazda MX-5 page two', 'Mazda MX-5 dear']);
  await table.getByRole('button', { name: 'Get specs' }).click();
  await expect(table.locator('tbody tr').first().locator('td').nth(8)).toHaveText('158');
  await page.keyboard.press('Escape');
  await expect(table).toBeHidden();
});

test('shows At a glance in the page, and the MOT summary from the GOV.UK tab that Check opens', async () => {
  const page = await context.newPage();
  await page.goto('https://www.autotrader.co.uk/car-details/202607314693714');
  const panel = page.locator('details.atf-panel');
  await expect(panel).toContainText('0-62mph7.3 seconds');
  // In the page, above Overview, not floating over the description
  await expect(page.locator('details.atf-panel + section[data-testid="overview"]')).toHaveCount(1);
  await expect(panel).not.toHaveClass(/atf-floating/);

  // Folds up and stays folded on the next advert
  await panel.locator('summary').click();
  await expect(panel).not.toHaveAttribute('open', '');
  await page.reload();
  await expect(page.locator('details.atf-panel')).toBeVisible();
  await expect(page.locator('details.atf-panel')).not.toHaveAttribute('open', '');
  await page.locator('details.atf-panel summary').click();

  await expect(panel.getByRole('textbox', { name: 'Registration number' })).toHaveValue('AB12CDE');
  const govUkTabOpening = context.waitForEvent('page');
  await panel.getByRole('button', { name: 'Check on GOV.UK' }).click();
  const govUkTab = await govUkTabOpening;
  await expect(govUkTab).toHaveURL(
    'https://www.check-mot.service.gov.uk/results?registration=AB12CDE&checkRecalls=true&atfMiles=26760&atfMake=Mazda',
  );
  await expect(govUkTab.getByRole('region', { name: 'MOT history summary' })).toContainText('Corrosion (advisory, 3 Feb 2025)');
  // ...and the same summary appears back on the advert
  await expect(panel.getByRole('region', { name: 'MOT history summary' })).toContainText('Corrosion (advisory, 3 Feb 2025)');
  await expect(panel).toContainText('From GOV.UK on');
});

test('sorts the search with one click, and applies a chosen default to later searches', async () => {
  const page = await context.newPage();
  await page.goto('https://www.autotrader.co.uk/car-search?make=Mazda');
  const quickSort = page.getByRole('navigation', { name: 'Quick sort' });
  await expect(quickSort.getByRole('button', { name: 'Best match' })).toHaveAttribute('aria-pressed', 'true');
  await quickSort.getByRole('button', { name: 'Lowest miles' }).click();
  await expect(page).toHaveURL('https://www.autotrader.co.uk/car-search?make=Mazda&sort=mileage');
  await expect(quickSort.getByRole('button', { name: 'Lowest miles' })).toHaveAttribute('aria-pressed', 'true');
  await quickSort.getByRole('button', { name: 'My default sort', pressed: false }).click();
  await expect(quickSort.getByRole('button', { name: 'My default sort', pressed: true })).toBeVisible();

  await page.goto('https://www.autotrader.co.uk/car-search?make=BMW');
  await expect(page).toHaveURL('https://www.autotrader.co.uk/car-search?make=BMW&sort=mileage');
  await expect(quickSort.getByRole('button', { name: 'Lowest miles' })).toHaveAttribute('aria-pressed', 'true');

  // Leave no default behind for other tests.
  await quickSort.getByRole('button', { name: 'My default sort', pressed: true }).click();
  await expect(quickSort.getByRole('button', { name: 'My default sort', pressed: false })).toBeVisible();
});
