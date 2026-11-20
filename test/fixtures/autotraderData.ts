// Made-up Autotrader data in the shapes the live site sent on 20 Nov 2026 (only the fields the
// extension reads, plus a few it should ignore). No real advert or seller.

export function searchListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'NATURAL_LISTING',
    advertId: '202611177980608',
    title: 'Mazda MX-5',
    subTitle: '2.0i Sport Euro 4 2dr',
    attentionGrabber: 'Full history',
    price: '£3,495',
    vehicleLocation: 'Leominster (1 mile)',
    images: ['https://m.atcdn.co.uk/a/media/{resize}/abc123.jpg'],
    sellerType: 'TRADE',
    dealerReview: { overallReviewRating: 4.6, __typename: 'BasicListingDealerReview' },
    fpaLink: '/car-details/202611177980608?sort=relevance&searchId=0000',
    badges: [
      { type: 'PI_GOOD', displayText: 'Good price' },
      { type: 'MILEAGE', displayText: '84,958 miles' },
      { type: 'REGISTERED_YEAR', displayText: '2006 (56 reg)' },
      { type: 'CAT_S', displayText: 'Cat S' },
    ],
    trackingContext: { advertContext: { price: 3495, year: 2006 }, distance: { distance: 1 } },
    __typename: 'SearchListing',
    ...overrides,
  };
}

export function advertPageData(overrides: { description?: string | string[]; id?: string } = {}): unknown {
  return {
    loaderData: {
      'car-details': {
        advertData: { id: overrides.id ?? '202607314693714', description: overrides.description ?? ['A lovely car.', 'Reg: AB12 CDE'] },
        vehicleData: {
          registration: 'Vehicle registered: 30/06/2016',
          keySpecification: [
            { specKey: 'MILEAGE', label: 'Mileage', value: '26,760 miles' },
            { specKey: 'FUELTYPE', label: 'Fuel type', value: 'Petrol' },
            { specKey: 'BODYTYPE', label: 'Body type', value: 'Convertible' },
            { specKey: 'GEARBOX', label: 'Gearbox', value: 'Manual' },
          ],
          specifications: [
            {
              category: 'Performance',
              count: '7',
              items: [
                { name: '0-62mph', value: '7.3 seconds' },
                { name: 'Top speed', value: '133mph' },
                { name: 'Engine power', value: '158BHP' },
                { name: 'Engine torque', value: '201NM' },
                { name: 'Miles per gallon', value: '40.9mpg' },
              ],
            },
          ],
          runningCosts: [
            { key: 'Insurance', label: 'Insurance group', value: '29E' },
            { key: 'Tax', label: 'Tax per year', value: '£275' },
            { key: 'Emission', label: 'CO₂ emissions', value: '161g/km' },
          ],
        },
        advert: {
          history: {
            ownersData: { title: 'Owners', value: '7', key: 'HAS_OWNERS' },
            serviceHistory: { description: 'Full service history', historyType: 'FULL' },
            mot: { status: '12 months MOT included' },
            vehicleCheck: {
              status: 'PASSED',
              statusText: '5 checks passed',
              detailChecks: [{ id: 'STOLEN', label: 'Not recorded as stolen', status: 'PASSED' }],
            },
          },
          advertTrackingData: {
            advertContext: { make: 'Mazda', model: 'MX-5', mileage: 26760, year: 2016, price: 12999 },
            vehicleContext: { standardMake: 'Mazda', standardDrivetrain: 'Rear Wheel Drive', colour: 'Grey' },
          },
        },
      },
    },
  };
}

/** Wraps page data the way the advert page embeds it: JSON inside a JavaScript string literal. */
export function advertPageHtml(pageData: unknown): string {
  return `<html><body><script nonce="">window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(JSON.stringify(pageData))});</script></body></html>`;
}
