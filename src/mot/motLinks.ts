// Addresses on the GOV.UK MOT history service.
import type { Registration } from '../shared/brands.ts';

export const MOT_HISTORY_ORIGIN = 'https://www.check-mot.service.gov.uk';

/** Extra query parameters our own content script reads on the results page; GOV.UK ignores them. */
export const ADVERTISED_MILEAGE_PARAMETER = 'atfMiles';
export const ADVERTISED_MAKE_PARAMETER = 'atfMake';

/** The results page for one registration (the same address the GOV.UK search form submits to). */
export function motHistoryResultsUrl(registration: Registration): string {
  return `${MOT_HISTORY_ORIGIN}/results?registration=${encodeURIComponent(registration)}&checkRecalls=true`;
}

export function motHistoryLinkFromAdvert(
  registration: Registration,
  advertisedMileage: number | null,
  advertisedMake: string | null,
): string {
  const url = new URL(motHistoryResultsUrl(registration));
  if (advertisedMileage !== null) url.searchParams.set(ADVERTISED_MILEAGE_PARAMETER, String(advertisedMileage));
  if (advertisedMake) url.searchParams.set(ADVERTISED_MAKE_PARAMETER, advertisedMake);
  return url.toString();
}
