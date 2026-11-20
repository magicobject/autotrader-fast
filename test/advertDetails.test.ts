import { describe, expect, it } from 'vitest';
import { extractAdvertPageData, readAdvertPageData } from '../src/autotrader/advertDetails.ts';
import { findRegistrationInDescription } from '../src/shared/registration.ts';
import { nowEpochMs, parseAdvertId, type AdvertId } from '../src/shared/brands.ts';
import { advertPageData, advertPageHtml } from './fixtures/autotraderData.ts';

function requireAdvertId(text: string): AdvertId {
  const advertId = parseAdvertId(text);
  if (advertId === null) throw new Error(`Bad test advert id ${text}`);
  return advertId;
}

const ADVERT_ID = requireAdvertId('202607314693714');
const FETCHED_AT = nowEpochMs();

describe('extractAdvertPageData', () => {
  it('decodes the data embedded in the page', () => {
    expect(extractAdvertPageData(advertPageHtml(advertPageData()))).toEqual(advertPageData());
  });

  it('gives null when the page has no data or it is damaged', () => {
    expect(extractAdvertPageData('<html></html>')).toBeNull();
    expect(extractAdvertPageData('window.__staticRouterHydrationData = JSON.parse("{not json");')).toBeNull();
  });
});

describe('readAdvertPageData', () => {
  it('flattens the fields the table and panel use', () => {
    const reading = readAdvertPageData(advertPageData(), ADVERT_ID, FETCHED_AT);
    expect(reading?.statedAdvertId).toBe('202607314693714');
    expect(reading?.details).toMatchObject({
      advertId: ADVERT_ID,
      zeroTo62Seconds: 7.3,
      topSpeedMph: 133,
      enginePowerBhp: 158,
      torqueNm: 201,
      milesPerGallon: 40.9,
      insuranceGroup: '29E',
      insuranceGroupNumber: 29,
      roadTaxPerYearGbp: 275,
      co2GramsPerKm: 161,
      fuelType: 'Petrol',
      gearbox: 'Manual',
      bodyType: 'Convertible',
      drivetrain: 'Rear Wheel Drive',
      mileage: 26760,
      ownerCount: 7,
      serviceHistory: 'Full service history',
      autotraderCheck: 'passed',
      autotraderCheckProblems: [],
      make: 'Mazda',
      fetchedAtMs: FETCHED_AT,
    });
  });

  it('joins a description given as paragraphs, so a reg in it can be found', () => {
    const reading = readAdvertPageData(advertPageData(), ADVERT_ID, FETCHED_AT);
    expect(findRegistrationInDescription(reading?.sellerDescription ?? '')).toBe('AB12CDE');
  });

  it('gives null for data in an unexpected shape', () => {
    expect(readAdvertPageData({ loaderData: {} }, ADVERT_ID, FETCHED_AT)).toBeNull();
    expect(readAdvertPageData(null, ADVERT_ID, FETCHED_AT)).toBeNull();
  });
});
