import { describe, expect, it } from 'vitest';
import { backgroundRequestSchema, contentScriptMessageSchema, pageHookMessageSchema } from '../src/shared/messages.ts';

describe('message validation', () => {
  it('accepts well-formed messages', () => {
    expect(
      pageHookMessageSchema.safeParse({
        source: 'atfast-page-hook',
        kind: 'search-results-page',
        pageNumber: 1,
        searchKey: 'k',
        listings: [],
      }).success,
    ).toBe(true);
    expect(contentScriptMessageSchema.safeParse({ source: 'atfast-content-script', kind: 'replay-captured-pages' }).success).toBe(true);
  });

  it('rejects messages another script on the page might post', () => {
    expect(pageHookMessageSchema.safeParse({ source: 'someone-else', kind: 'search-results-page' }).success).toBe(false);
    expect(
      contentScriptMessageSchema.safeParse({
        source: 'atfast-content-script',
        kind: 'load-more-pages',
        loadRunId: 'x',
        firstPageNumber: 1,
        lastPageNumber: 100_000,
        delayBetweenPagesMs: 0,
      }).success,
    ).toBe(false);
  });

  it('only lets a plausible registration reach the background worker', () => {
    expect(backgroundRequestSchema.safeParse({ kind: 'fetch-mot-history-page', registration: 'AB12CDE' }).success).toBe(true);
    expect(backgroundRequestSchema.safeParse({ kind: 'fetch-mot-history-page', registration: 'AB12CDE&x=1' }).success).toBe(false);
  });
});
