// Background service worker: fetches the public GOV.UK MOT history page for one registration
// when an Autotrader content script asks (content scripts can't read another site directly).
import '../shared/zodSetup.ts';
import { backgroundRequestSchema, type BackgroundResponse } from '../shared/messages.ts';
import type { Registration } from '../shared/brands.ts';
import { parseTypedRegistration } from '../shared/registration.ts';
import { motHistoryResultsUrl } from '../mot/motLinks.ts';

async function fetchMotHistoryPage(registration: Registration): Promise<BackgroundResponse> {
  try {
    const response = await fetch(motHistoryResultsUrl(registration), { credentials: 'omit' });
    if (!response.ok) return { kind: 'failed', reason: `GOV.UK answered ${response.status}.` };
    return { kind: 'mot-history-page', html: await response.text() };
  } catch (error: unknown) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: BackgroundResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  const request = backgroundRequestSchema.safeParse(message);
  const registration = request.success ? parseTypedRegistration(request.data.registration) : null;
  if (registration === null) {
    sendResponse({ kind: 'failed', reason: 'Not a valid registration.' });
    return false;
  }
  void fetchMotHistoryPage(registration).then(sendResponse);
  return true; // the response is sent asynchronously
});

// Clicking the toolbar icon opens the plain-English help page.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
});
