// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { motHistoryPageHtml } from './fixtures/motHistoryPage.ts';
import { installChromeStorageStub } from './support/chromeStorageStub.ts';

const page = motHistoryPageHtml({
  motDue: '7 February 2027',
  tests: [{ date: '4 February 2026', result: 'PASS', odometer: '30,000 miles', expiry: '7 February 2027' }],
});

async function runContentScriptAt(url: string): Promise<void> {
  window.history.replaceState(null, '', url);
  document.documentElement.innerHTML = page.replace(/^<!doctype html><html>|<\/html>$/g, '');
  vi.resetModules();
  await import('../src/mot/motResultsPage.ts');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('GOV.UK results page script', () => {
  let stored: Map<string, unknown>;
  beforeEach(() => {
    stored = installChromeStorageStub();
  });

  it('adds the card and saves the summary under the registration the page shows', async () => {
    await runContentScriptAt('/results?registration=zz99zzz&checkRecalls=true&atfMiles=31000&atfMake=Mazda');
    expect(document.querySelector('.atf-on-gov')?.textContent).toContain('ZZ99 ZZZ');
    expect(stored.get('v1:mot-summary:ZZ99ZZZ')).toMatchObject({
      advertisedMileage: 31000,
      summary: { registrationShown: 'ZZ99 ZZZ', testCount: 1 },
    });
  });

  it('saves nothing when the page shows a different registration from the one asked for', async () => {
    await runContentScriptAt('/results?registration=AB12CDE&checkRecalls=true');
    expect(document.querySelector('.atf-on-gov')).not.toBeNull();
    expect([...stored.keys()]).toEqual([]);
  });
});
