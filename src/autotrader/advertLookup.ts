// Getting an advert's details (from cache, the current page, or by fetching its page) and
// checking a registration's MOT history through the background service worker.
import { nowEpochMs, type AdvertId, type Registration } from '../shared/brands.ts';
import { backgroundResponseSchema, type BackgroundRequest } from '../shared/messages.ts';
import { findRegistrationInDescription } from '../shared/registration.ts';
import {
  readAdvertDetails,
  readMotSummary,
  readRegistration,
  writeAdvertDetails,
  writeMotSummary,
  writeRegistration,
} from '../shared/storage.ts';
import { analyseMotHistory } from '../mot/motHistoryAnalysis.ts';
import { readMotHistoryPage } from '../mot/motHistoryParser.ts';
import type { MotSummary } from '../mot/motHistoryTypes.ts';
import { extractAdvertPageData, readAdvertPageData, type AdvertDetails } from './advertDetails.ts';

export interface AdvertLookupResult {
  readonly details: AdvertDetails;
  /** A registration found in the seller's description, if any. */
  readonly registrationFromDescription: Registration | null;
}

/** Stores the details, and remembers a registration from the description unless one is already saved. */
async function rememberAdvert(details: AdvertDetails, sellerDescription: string): Promise<AdvertLookupResult> {
  const registrationFromDescription = findRegistrationInDescription(sellerDescription);
  await writeAdvertDetails(details);
  if (registrationFromDescription !== null && (await readRegistration(details.advertId)) === null) {
    await writeRegistration(details.advertId, registrationFromDescription);
  }
  return { details, registrationFromDescription };
}

export async function lookUpAdvertFromHtml(advertId: AdvertId, html: string): Promise<AdvertLookupResult | null> {
  const reading = readAdvertPageData(extractAdvertPageData(html), advertId, nowEpochMs());
  if (reading === null || (reading.statedAdvertId !== null && reading.statedAdvertId !== advertId)) return null;
  return rememberAdvert(reading.details, reading.sellerDescription);
}

export async function fetchAdvert(advertId: AdvertId): Promise<AdvertLookupResult> {
  const response = await fetch(`/car-details/${advertId}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Autotrader answered ${response.status}.`);
  const result = await lookUpAdvertFromHtml(advertId, await response.text());
  if (result === null) throw new Error('The advert page no longer has the expected data.');
  return result;
}

export { readAdvertDetails as readCachedAdvertDetails };

export interface MotCheckRequest {
  readonly registration: Registration;
  readonly advertisedMileage: number | null;
  readonly advertisedMake: string | null;
  /** Ignore a cached summary and fetch the history again. */
  readonly isRefreshForced: boolean;
}

export async function checkMotHistory(request: MotCheckRequest): Promise<MotSummary> {
  if (!request.isRefreshForced) {
    const cached = await readMotSummary(request.registration);
    if (cached && cached.advertisedMileage === request.advertisedMileage) return cached.summary;
  }
  const message: BackgroundRequest = { kind: 'fetch-mot-history-page', registration: request.registration };
  const response = backgroundResponseSchema.parse(await chrome.runtime.sendMessage(message));
  if (response.kind === 'failed') throw new Error(response.reason);
  const reading = readMotHistoryPage(new DOMParser().parseFromString(response.html, 'text/html'));
  if (reading.kind === 'not-found') throw new Error(reading.message);
  const summary = analyseMotHistory(reading.history, {
    advertisedMileage: request.advertisedMileage,
    advertisedMake: request.advertisedMake,
  });
  await writeMotSummary(request.registration, { checkedAtMs: nowEpochMs(), advertisedMileage: request.advertisedMileage, summary });
  return summary;
}

export { readMotSummary as readCachedMotSummary, readRegistration as readSavedRegistration, writeRegistration as saveRegistration };
