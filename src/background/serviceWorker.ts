// Background service worker: opens the help page from the toolbar icon, and tidies expired cache
// entries. (It fetches nothing: GOV.UK's MOT pages are only ever opened by Greg in a tab.)
import '../shared/zodSetup.ts';
import { pruneExpiredStorage } from '../shared/storage.ts';

chrome.runtime.onStartup.addListener(() => void pruneExpiredStorage());
chrome.runtime.onInstalled.addListener(() => void pruneExpiredStorage());

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
});
