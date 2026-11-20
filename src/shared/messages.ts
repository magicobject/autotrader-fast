// Every message the extension's parts send each other, as discriminated unions with runtime
// validation. Window messages can be posted by any script on the page, so they are parsed with
// these schemas before anything trusts them.
import * as z from 'zod/mini';

export const PAGE_HOOK_SOURCE = 'atfast-page-hook';
/** Autotrader sends about 27 per page; anything far larger is not from Autotrader. */
export const MAX_LISTINGS_PER_PAGE = 200;
export const CONTENT_SCRIPT_SOURCE = 'atfast-content-script';

// ---- page hook (page's own JavaScript world) → content script --------------------------------

export const pageHookMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    source: z.literal(PAGE_HOOK_SOURCE),
    kind: z.literal('search-results-page'),
    pageNumber: z.number().check(z.int()).check(z.positive()),
    searchKey: z.string(),
    /** Raw listings exactly as Autotrader sent them; validated by parseSearchListings. */
    listings: z.array(z.unknown()).check(z.maxLength(MAX_LISTINGS_PER_PAGE)),
    loadRunId: z.optional(z.string()),
  }),
  z.object({
    source: z.literal(PAGE_HOOK_SOURCE),
    kind: z.literal('load-progress'),
    loadRunId: z.string(),
    pageNumber: z.number().check(z.int()),
  }),
  z.object({
    source: z.literal(PAGE_HOOK_SOURCE),
    kind: z.literal('load-finished'),
    loadRunId: z.string(),
    outcome: z.enum(['reached-last-page', 'reached-page-limit', 'no-search-captured-yet', 'failed']),
    failureReason: z.optional(z.string()),
  }),
]);
export type PageHookMessage = z.infer<typeof pageHookMessageSchema>;

// ---- content script → page hook ---------------------------------------------------------------

export const contentScriptMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    source: z.literal(CONTENT_SCRIPT_SOURCE),
    kind: z.literal('load-more-pages'),
    loadRunId: z.string(),
    firstPageNumber: z.number().check(z.int()).check(z.positive()),
    lastPageNumber: z.number().check(z.int()).check(z.positive()).check(z.maximum(100)),
    delayBetweenPagesMs: z.number().check(z.int()).check(z.minimum(250)).check(z.maximum(10_000)),
  }),
  z.object({
    source: z.literal(CONTENT_SCRIPT_SOURCE),
    kind: z.literal('replay-captured-pages'),
  }),
]);
export type ContentScriptMessage = z.infer<typeof contentScriptMessageSchema>;

// ---- content script → background service worker (chrome.runtime) -------------------------------

export const backgroundRequestSchema = z.object({
  kind: z.literal('fetch-mot-history-page'),
  registration: z.string().check(z.regex(/^[A-Z0-9]{2,7}$/)),
});
export type BackgroundRequest = z.infer<typeof backgroundRequestSchema>;

export const backgroundResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mot-history-page'), html: z.string() }),
  z.object({ kind: z.literal('failed'), reason: z.string() }),
]);
export type BackgroundResponse = z.infer<typeof backgroundResponseSchema>;
