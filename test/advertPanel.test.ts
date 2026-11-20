// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.autotrader.co.uk/car-details/202607314693714" }
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { AdvertPanel, advertIdFromPath } from '../src/autotrader/advertPanel.ts';
import { advertPageData, advertPageHtml } from './fixtures/autotraderData.ts';
import { installChromeStorageStub } from './support/chromeStorageStub.ts';

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 50 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
};

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
    document.body.innerHTML = advertPageHtml(advertPageData()).replace(/^<html><body>|<\/body><\/html>$/g, '');
  });

  it("shows the advert's figures from the page's own data, and remembers the reg from the description", async () => {
    const advertId = advertIdFromPath(location.pathname);
    if (!advertId) throw new Error('no advert id');
    await new AdvertPanel().showFor(advertId);
    const panelText = document.querySelector('.atf-panel')?.textContent ?? '';
    expect(panelText).toContain('0-62mph7.3 seconds');
    expect(panelText).toContain('Insurance group29E');
    expect(panelText).toContain('Owners7');
    expect(document.querySelector<HTMLInputElement>('.atf-reg')?.value).toBe('AB12CDE');
    expect(stored.get('v1:registration:202607314693714')).toBe('AB12CDE');
    await waitFor(() => document.querySelector('.atf-mot-out')?.textContent === 'Not available in tests.');
    expect(document.querySelector('.atf-mot-out')?.textContent).toBe('Not available in tests.');
  });

  it('has no axe violations', async () => {
    const advertId = advertIdFromPath(location.pathname);
    if (!advertId) throw new Error('no advert id');
    await new AdvertPanel().showFor(advertId);
    const panel = document.querySelector('.atf-panel');
    if (!panel) throw new Error('no panel');
    const results = await axe.run(panel, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);
  });
});
