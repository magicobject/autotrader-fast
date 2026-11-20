import { describe, expect, it } from 'vitest';
import { parseSearchListings } from '../src/autotrader/searchListings.ts';
import { searchListing } from './fixtures/autotraderData.ts';

describe('parseSearchListings', () => {
  it('turns a listing into a table row', () => {
    const [listing] = parseSearchListings([searchListing()]);
    expect(listing).toEqual({
      advertId: '202611177980608',
      placement: 'standard',
      title: 'Mazda MX-5',
      subtitle: '2.0i Sport Euro 4 2dr',
      attentionGrabber: 'Full history',
      priceGbp: 3495,
      year: 2006,
      mileage: 84958,
      distanceMiles: 1,
      location: 'Leominster',
      sellerKind: 'trade',
      dealerRating: 4.6,
      priceRating: 'Good price',
      otherBadges: ['Cat S'],
      thumbnailUrl: 'https://m.atcdn.co.uk/a/media/w260/abc123.jpg',
      advertUrl: 'https://www.autotrader.co.uk/car-details/202611177980608',
    });
  });

  it('leaves out leasing deals, malformed listings and bad ids', () => {
    expect(
      parseSearchListings([
        searchListing({ type: 'LEASING_LISTING' }),
        searchListing({ advertId: 'not-a-number' }),
        searchListing({ price: 42 }),
        null,
        'rubbish',
      ]),
    ).toEqual([]);
  });

  it('falls back to the badges and location text when tracking data is missing', () => {
    const [listing] = parseSearchListings([
      searchListing({
        trackingContext: null,
        vehicleLocation: 'Cannock (44 miles)',
        sellerType: null,
        badges: [
          { type: 'PRIVATE_SELLER', displayText: 'Private seller' },
          { type: 'REGISTERED_YEAR', displayText: '2007 (56 reg)' },
        ],
      }),
    ]);
    expect(listing).toMatchObject({
      priceGbp: 3495,
      year: 2007,
      distanceMiles: 44,
      location: 'Cannock',
      sellerKind: 'private',
      mileage: null,
      priceRating: '',
    });
  });

  it('keeps a listing whose badge has no text, without showing that badge', () => {
    const [listing] = parseSearchListings([searchListing({ badges: [{ type: 'NEW_KIND', displayText: null }] })]);
    expect(listing?.otherBadges).toEqual([]);
  });

  it('only links to Autotrader and only shows Autotrader images', () => {
    const [listing] = parseSearchListings([
      searchListing({ fpaLink: 'https://evil.example/car-details/1', images: ['javascript:alert(1)'] }),
    ]);
    expect(listing?.advertUrl).toBe('https://www.autotrader.co.uk/car-details/202611177980608');
    expect(listing?.thumbnailUrl).toBeNull();
  });

  it('marks featured listings', () => {
    expect(parseSearchListings([searchListing({ type: 'FEATURED_LISTING' })])[0]?.placement).toBe('featured');
  });
});
