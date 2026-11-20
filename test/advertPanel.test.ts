// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.autotrader.co.uk/car-details/202607314693714" }
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvertPanel, advertIdFromPath } from '../src/autotrader/advertPanel.ts';
import type { AdvertId } from '../src/shared/brands.ts';
import { advertPageData, advertPageHtml } from './fixtures/autotraderData.ts';
import { installChromeStorageStub, listenerCount } from './support/chromeStorageStub.ts';

const summary = {
  overall: 'amber',
  findings: [{ level: 'amber', explanation: 'Corrosion advisory (3 Feb 2025): Rear Coil spring corroded' }],
  testCount: 3,
  failedTestCount: 0,
  registrationShown: 'AB12 CDE',
  makeAndModel: 'MAZDA MX-5',
};

function thisAdvert(): AdvertId {
  const advertId = advertIdFromPath(location.pathname);
  if (!advertId) throw new Error('no advert id');
  return advertId;
}

/** Autotrader's advert page, reduced to the parts the section relies on. */
function advertPage(): string {
  const dataScript = advertPageHtml(advertPageData()).replace(/^<html><body>|<\/body><\/html>$/g, '');
  return `<main><section data-testid="vehicle-information"><h1>2016 Mazda MX-5</h1></section>
    <section data-testid="overview"><h2>Overview</h2></section>
    <section data-testid="description"><h2>Description</h2></section></main>${dataScript}`;
}

describe('advertIdFromPath', () => {
  it('reads the id from an advert address only', () => {
    expect(advertIdFromPath('/car-details/202607314693714')).toBe('202607314693714');
    expect(advertIdFromPath('/car-search')).toBeNull();
  });
});

describe('AdvertPanel', () => {
  let stored: Map<string, unknown>;
  beforeEach(() => {
    stored = installChromeStorageStub();
    document.body.innerHTML = advertPage();
  });

  it('sits in the page just above Overview, open, with the figures from the page’s own data', async () => {
    await new AdvertPanel().showFor(thisAdvert());
    const panel = document.querySelector('details.atf-panel');
    expect(panel?.nextElementSibling?.getAttribute('data-testid')).toBe('overview');
    expect(panel?.hasAttribute('open')).toBe(true);
    const text = panel?.textContent ?? '';
    expect(text).toContain('0-62mph7.3 seconds');
    expect(text).toContain('Insurance group29E');
    expect(text).toContain('Owners7');
  });

  it('folds up, remembers that, and is put back if the page redraws', async () => {
    const advertPanel = new AdvertPanel();
    await advertPanel.showFor(thisAdvert());
    const panel = document.querySelector<HTMLDetailsElement>('details.atf-panel');
    if (!panel) throw new Error('no panel');
    panel.open = false;
    panel.dispatchEvent(new Event('toggle'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stored.get('v1:advert-panel-collapsed')).toBe(true);

    panel.remove(); // as when Autotrader's page redraws that part
    await advertPanel.showFor(thisAdvert());
    expect(document.querySelector('details.atf-panel')?.nextElementSibling?.getAttribute('data-testid')).toBe('overview');
  });

  it('opens GOV.UK in a tab on Check, and shows the summary when that tab saves it', async () => {
    const opened = vi.fn();
    vi.stubGlobal('open', opened);
    await new AdvertPanel().showFor(thisAdvert());
    expect(document.querySelector<HTMLInputElement>('.atf-reg')?.value).toBe('AB12CDE'); // from the description
    [...document.querySelectorAll<HTMLButtonElement>('.atf-btn')].find((button) => button.textContent === 'Check on GOV.UK')?.click();
    expect(opened).toHaveBeenCalledWith(
      'https://www.check-mot.service.gov.uk/results?registration=AB12CDE&checkRecalls=true&atfMiles=26760&atfMake=Mazda',
      '_blank',
      'noopener,noreferrer',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // what the GOV.UK tab's content script writes:
    await chrome.storage.local.set({ 'v1:mot-summary:AB12CDE': { checkedAtMs: Date.now(), advertisedMileage: 26760, summary } });
    expect(document.querySelector('.atf-mot-out')?.textContent).toContain('AMBER AB12 CDE MAZDA MX-5');
    // ...and the colour shows in the heading, which stays visible when the section is folded
    expect(document.querySelector('.atf-panel-head .atf-panel-mot')?.textContent).toBe('MOT AMBER');
  });

  it('shows a summary saved earlier straight away', async () => {
    stored.set('v1:registration:202607314693714', 'AB12CDE');
    stored.set('v1:mot-summary:AB12CDE', { checkedAtMs: Date.now(), advertisedMileage: 26760, summary });
    await new AdvertPanel().showFor(thisAdvert());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.atf-mot-out')?.textContent).toContain('Corrosion advisory');
  });

  it('says when a saved summary was checked against a different advertised mileage', async () => {
    stored.set('v1:registration:202607314693714', 'AB12CDE');
    stored.set('v1:mot-summary:AB12CDE', { checkedAtMs: Date.now(), advertisedMileage: 20000, summary });
    await new AdvertPanel().showFor(thisAdvert());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('.atf-mot-out')?.textContent).toContain(
      'Its mileage check used 20,000 miles; this advert says 26,760, so check again.',
    );
  });

  it('stops listening for GOV.UK summaries when you leave the advert', async () => {
    stored.set('v1:registration:202607314693714', 'AB12CDE');
    const advertPanel = new AdvertPanel();
    await advertPanel.showFor(thisAdvert());
    await new Promise((resolve) => setTimeout(resolve, 0));
    advertPanel.forget();
    await chrome.storage.local.set({ 'v1:mot-summary:AB12CDE': { checkedAtMs: Date.now(), advertisedMileage: 26760, summary } });
    expect(document.querySelector('.atf-panel')).toBeNull();
    expect(listenerCount()).toBe(0);
  });

  it('floats only when the page layout isn’t recognised', async () => {
    document.body.innerHTML = '<main>Something else</main>';
    await new AdvertPanel().showFor(thisAdvert());
    expect(document.querySelector('details.atf-panel')?.classList.contains('atf-floating')).toBe(true);
  });

  it('has no axe violations', async () => {
    await new AdvertPanel().showFor(thisAdvert());
    const panel = document.querySelector('.atf-panel');
    if (!panel) throw new Error('no panel');
    const results = await axe.run(panel, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);
  });
});
