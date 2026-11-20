// Getting an advert's details: from cache, the current page, or by fetching its page.
import { nowEpochMs, type AdvertId, type Registration } from '../shared/brands.ts';
import { findRegistrationInDescription } from '../shared/registration.ts';
import { readAdvertDetails, readMotSummary, readRegistration, writeAdvertDetails, writeRegistration } from '../shared/storage.ts';
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
  if (reading === null || reading.statedAdvertId !== advertId) return null;
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

export { readMotSummary as readCachedMotSummary, readRegistration as readSavedRegistration, writeRegistration as saveRegistration };
