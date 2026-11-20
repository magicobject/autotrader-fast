// Content script for every autotrader.co.uk page. Autotrader is a single-page app, so this
// watches the address and shows the fast-table button on search results and the panel on adverts.
import '../shared/zodSetup.ts';
import { CONTENT_SCRIPT_SOURCE, pageHookMessageSchema, type ContentScriptMessage } from '../shared/messages.ts';
import { AdvertPanel, advertIdFromPath } from './advertPanel.ts';
import { QuickSortBar } from './quickSortBar.ts';
import { SearchTable } from './searchTable.ts';

const ADDRESS_CHECK_INTERVAL_MS = 700;

const searchTable = new SearchTable();
const advertPanel = new AdvertPanel();
const quickSortBar = new QuickSortBar();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window) return;
  const message = pageHookMessageSchema.safeParse(event.data);
  if (!message.success) return;
  const { data } = message;
  switch (data.kind) {
    case 'search-results-page':
      if (location.pathname.startsWith('/car-search')) void searchTable.addResultsPage(data);
      return;
    case 'load-progress':
    case 'load-finished':
      searchTable.handleLoadProgress(data);
      return;
    default: {
      const unhandled: never = data;
      throw new Error(`Unhandled message ${JSON.stringify(unhandled)}`);
    }
  }
});

// Esc closes the table; Alt+Shift+F opens it. A modifier is needed so the shortcut can't fire while
// someone types, or clash with speech-input software (WCAG 2.1.4).
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && searchTable.isOpen()) {
    searchTable.close();
    return;
  }
  const isOpenShortcut = event.code === 'KeyF' && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
  if (isOpenShortcut && location.pathname.startsWith('/car-search')) {
    event.preventDefault();
    searchTable.open();
  }
});

let lastPathname: string | null = null;
function followAddressChanges(): void {
  // Cheap when nothing changed; puts the bar back if the page redrew.
  quickSortBar.update().catch((error: unknown) => console.warn('[Autotrader Fast] quick sort', error));
  // Also cheap when already shown; puts the section back if the page redrew.
  const advertId = advertIdFromPath(location.pathname);
  if (advertId !== null) advertPanel.showFor(advertId).catch((error: unknown) => console.warn('[Autotrader Fast] advert panel', error));
  if (location.pathname === lastPathname) return;
  lastPathname = location.pathname;
  if (advertId === null) advertPanel.forget();
  searchTable.updateLauncher();
}

setInterval(followAddressChanges, ADDRESS_CHECK_INTERVAL_MS);
followAddressChanges();

// Ask the page hook to resend any results it caught before this script was ready.
const replayRequest: ContentScriptMessage = { source: CONTENT_SCRIPT_SOURCE, kind: 'replay-captured-pages' };
window.postMessage(replayRequest, location.origin);
