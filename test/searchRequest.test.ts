import { describe, expect, it } from 'vitest';
import { countCarsForSale, findSearchOperation, listingsIn, searchKeyFor, withPageNumber } from '../src/autotrader/searchRequest.ts';

const pageRequest = [
  {
    operationName: 'SearchResultsListingsGridQuery',
    query: 'query SearchResultsListingsGridQuery { … }',
    variables: {
      page: 2,
      sortBy: 'relevance',
      filters: [
        { filter: 'postcode', selected: ['HR6 8AA'] },
        { filter: 'make', selected: ['Mazda'] },
      ],
    },
  },
];

describe('search requests', () => {
  it('identifies a search by filters and sort, not page', () => {
    const operation = findSearchOperation(pageRequest);
    expect(operation && searchKeyFor(operation)).toBe('make=Mazda&postcode=HR6 8AA#sort=relevance');
  });

  it('copies the request with a new page number and keeps everything else', () => {
    const [changed] = withPageNumber(pageRequest, 7);
    expect(changed).toMatchObject({ query: 'query SearchResultsListingsGridQuery { … }', variables: { page: 7, sortBy: 'relevance' } });
    expect(pageRequest[0]?.variables.page).toBe(2); // the original is untouched
  });

  it('ignores other operations', () => {
    expect(findSearchOperation([{ operationName: 'UserLevelQuery', variables: {} }])).toBeNull();
  });

  it('finds listings in a response and counts the cars for sale', () => {
    const listings = listingsIn([
      { data: { other: true } },
      { data: { searchResults: { listings: [{ type: 'NATURAL_LISTING' }, { type: 'LEASING_LISTING' }] } } },
    ]);
    expect(listings).toHaveLength(2);
    expect(countCarsForSale(listings ?? [])).toBe(1);
    expect(listingsIn({ errors: [] })).toBeNull();
  });
});
