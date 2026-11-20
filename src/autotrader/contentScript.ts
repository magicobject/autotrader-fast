// Content script for every autotrader.co.uk page. Autotrader is a single-page app, so this
// watches the address and shows the fast-table button on search results and the panel on adverts.
import '../shared/zodSetup.ts';
import { CONTENT_SCRIPT_SOURCE, pageHookMessageSchema, type ContentScriptMessage } from '../shared/messages.ts';
import { AdvertPanel, advertIdFromPath } from './advertPanel.ts';
import { SearchTable } from './searchTable.ts';

const ADDRESS_CHECK_INTERVAL_MS = 700;

const searchTable = new SearchTable();
const advertPanel = new AdvertPanel();

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

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (event.key === 'Escape' && searchTable.isOpen()) searchTable.close();
  const isPlainF = (event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (isPlainF && location.pathname.startsWith('/car-search')) searchTable.open();
});

let lastPathname: string | null = null;
function followAddressChanges(): void {
  if (location.pathname === lastPathname) return;
  lastPathname = location.pathname;
  const advertId = advertIdFromPath(location.pathname);
  if (advertId === null) advertPanel.forget();
  else void advertPanel.showFor(advertId);
  searchTable.updateLauncher();
}

setInterval(followAddressChanges, ADDRESS_CHECK_INTERVAL_MS);
followAddressChanges();

// Ask the page hook to resend any results it caught before this script was ready.
const replayRequest: ContentScriptMessage = { source: CONTENT_SCRIPT_SOURCE, kind: 'replay-captured-pages' };
window.postMessage(replayRequest, location.origin);
