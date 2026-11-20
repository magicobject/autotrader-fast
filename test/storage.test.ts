import { beforeEach, describe, expect, it } from 'vitest';
import { epochMsOf, type EpochMs } from '../src/shared/brands.ts';
import { mergePriceHistories, pruneExpiredStorage, readPriceHistory, savePriceHistory, type PriceHistory } from '../src/shared/storage.ts';
import { installChromeStorageStub } from './support/chromeStorageStub.ts';

const now = Date.now();
const at = (daysAgo: number): EpochMs => epochMsOf(new Date(now - daysAgo * 86_400_000));

describe('price history', () => {
  beforeEach(() => {
    installChromeStorageStub();
  });

  it("merges two tabs' records without losing either's adverts or prices", () => {
    const fromFirstTab: PriceHistory = {
      '1': {
        firstSeenMs: at(10),
        lastSeenMs: at(5),
        pricePoints: [
          [at(10), 5000],
          [at(5), 4800],
        ],
      },
    };
    const fromSecondTab: PriceHistory = {
      '1': {
        firstSeenMs: at(10),
        lastSeenMs: at(1),
        pricePoints: [
          [at(10), 5000],
          [at(1), 4500],
        ],
      },
      '2': { firstSeenMs: at(1), lastSeenMs: at(1), pricePoints: [[at(1), 9000]] },
    };
    const merged = mergePriceHistories(fromFirstTab, fromSecondTab);
    expect(merged['1']?.pricePoints.map(([, price]) => price)).toEqual([5000, 4800, 4500]);
    expect(merged['1']?.lastSeenMs).toBe(at(1));
    expect(merged['2']?.pricePoints).toHaveLength(1);
  });

  it('keeps what another tab saved when this tab saves', async () => {
    await savePriceHistory({ '1': { firstSeenMs: at(2), lastSeenMs: at(2), pricePoints: [[at(2), 1000]] } });
    await savePriceHistory({ '2': { firstSeenMs: at(1), lastSeenMs: at(1), pricePoints: [[at(1), 2000]] } });
    expect(Object.keys(await readPriceHistory()).sort()).toEqual(['1', '2']);
  });

  it('forgets adverts not seen for four months', async () => {
    await savePriceHistory({ '1': { firstSeenMs: at(200), lastSeenMs: at(130), pricePoints: [[at(200), 1000]] } });
    expect(await readPriceHistory()).toEqual({});
  });
});

describe('pruneExpiredStorage', () => {
  it('removes expired MOT summaries and registrations for forgotten adverts, and keeps the rest', async () => {
    const stored = installChromeStorageStub();
    const summary = { overall: 'green', findings: [], testCount: 0, failedTestCount: 0, registrationShown: 'ZZ99 ZZZ', makeAndModel: 'X' };
    stored.set('v1:mot-summary:OLD1ABC', { checkedAtMs: at(2), advertisedMileage: null, summary });
    stored.set('v1:mot-summary:NEW1ABC', { checkedAtMs: at(0), advertisedMileage: null, summary });
    stored.set('v1:registration:111111', 'AB12CDE');
    stored.set('v1:registration:222222', 'CD34EFG');
    stored.set('v1:price-history', { '222222': { firstSeenMs: at(1), lastSeenMs: at(1), pricePoints: [[at(1), 1000]] } });
    stored.set('v1:panel-something-else', true);
    await pruneExpiredStorage();
    expect([...stored.keys()].sort()).toEqual([
      'v1:mot-summary:NEW1ABC',
      'v1:panel-something-else',
      'v1:price-history',
      'v1:registration:222222',
    ]);
  });
});
