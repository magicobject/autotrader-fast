// Runs in the Autotrader page's own JavaScript world (manifest "world": "MAIN") from
// document_start. It watches the search-results data the page already requests, passes it to
// the content script, and on request asks for further pages of the same search the same way
// the page's own infinite scroll does. It never sends anything anywhere else.
import '../shared/zodSetup.ts';
import { PAGE_HOOK_SOURCE, contentScriptMessageSchema, type ContentScriptMessage, type PageHookMessage } from '../shared/messages.ts';
import {
  SEARCH_OPERATION_NAME,
  asArray,
  countCarsForSale,
  findSearchOperation,
  listingsIn,
  searchKeyFor,
  withPageNumber,
  type SearchOperation,
} from './searchRequest.ts';

const MAX_REPLAY_BUFFER = 60;

interface CapturedSearchRequest {
  readonly url: string;
  readonly init: RequestInit;
  /** The request body's operations exactly as the page sent them. */
  readonly rawOperations: readonly unknown[];
}

declare global {
  interface Window {
    __atfastPageHookInstalled?: boolean;
  }
}

function installPageHook(): void {
  if (window.__atfastPageHookInstalled) return;
  window.__atfastPageHookInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const replayBuffer: PageHookMessage[] = [];
  let lastSearchRequest: CapturedSearchRequest | null = null;

  const post = (message: PageHookMessage): void => {
    if (message.kind === 'search-results-page') {
      replayBuffer.push(message);
      if (replayBuffer.length > MAX_REPLAY_BUFFER) replayBuffer.shift();
    }
    window.postMessage(message, location.origin);
  };

  /** Passes the listings on and returns how many cars for sale were on the page. */
  const reportListings = (responseBody: unknown, operation: SearchOperation, loadRunId?: string): number => {
    const listings = listingsIn(responseBody);
    if (listings === null) return 0;
    post({
      source: PAGE_HOOK_SOURCE,
      kind: 'search-results-page',
      pageNumber: operation.variables.page ?? 1,
      searchKey: searchKeyFor(operation),
      listings,
      ...(loadRunId === undefined ? {} : { loadRunId }),
    });
    return countCarsForSale(listings);
  };

  window.fetch = function watchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let operation: SearchOperation | null = null;
    if (url.includes('at-gateway') && url.includes(SEARCH_OPERATION_NAME) && typeof init?.body === 'string') {
      try {
        const rawOperations = asArray(JSON.parse(init.body));
        operation = findSearchOperation(rawOperations);
        if (operation) lastSearchRequest = { url, init: { ...init }, rawOperations };
      } catch {
        operation = null;
      }
    }
    const responsePromise = originalFetch(input, init);
    if (operation !== null) {
      const watchedOperation = operation;
      responsePromise
        .then((response) => response.clone().json())
        .then((body: unknown) => reportListings(body, watchedOperation))
        .catch(() => undefined);
    }
    return responsePromise;
  };

  type LoadOutcome = Extract<PageHookMessage, { kind: 'load-finished' }>['outcome'];

  async function loadMorePages(request: Extract<ContentScriptMessage, { kind: 'load-more-pages' }>): Promise<void> {
    const finish = (outcome: LoadOutcome, failureReason?: string): void =>
      post({
        source: PAGE_HOOK_SOURCE,
        kind: 'load-finished',
        loadRunId: request.loadRunId,
        outcome,
        ...(failureReason === undefined ? {} : { failureReason }),
      });

    const template = lastSearchRequest;
    if (template === null) return finish('no-search-captured-yet');
    for (let pageNumber = request.firstPageNumber; pageNumber <= request.lastPageNumber; pageNumber++) {
      const rawOperations = withPageNumber(template.rawOperations, pageNumber);
      const operation = findSearchOperation(rawOperations);
      if (operation === null) return finish('failed', 'The captured search could not be read.');
      try {
        const response = await originalFetch(template.url, { ...template.init, body: JSON.stringify(rawOperations) });
        if (!response.ok) return finish('failed', `Autotrader answered ${response.status}.`);
        const carsOnPage = reportListings(await response.json(), operation, request.loadRunId);
        if (carsOnPage === 0) return finish('reached-last-page');
      } catch (error: unknown) {
        return finish('failed', error instanceof Error ? error.message : String(error));
      }
      post({ source: PAGE_HOOK_SOURCE, kind: 'load-progress', loadRunId: request.loadRunId, pageNumber });
      await new Promise((resolve) => setTimeout(resolve, request.delayBetweenPagesMs));
    }
    return finish('reached-page-limit');
  }

  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window) return;
    const message = contentScriptMessageSchema.safeParse(event.data);
    if (!message.success) return;
    switch (message.data.kind) {
      case 'load-more-pages':
        void loadMorePages(message.data);
        return;
      case 'replay-captured-pages':
        for (const captured of replayBuffer) window.postMessage(captured, location.origin);
        return;
      default: {
        const unhandled: never = message.data;
        throw new Error(`Unhandled message ${JSON.stringify(unhandled)}`);
      }
    }
  });
}

installPageHook();
