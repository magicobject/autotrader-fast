import { describe, expect, it } from 'vitest';
import { hasSortInUrl, sortOrderInUrl, urlWithSortOrder } from '../src/autotrader/sortOrders.ts';

const SEARCH = 'https://www.autotrader.co.uk/car-search?postcode=HR6+8AA&make=Mazda&page=3';

describe('sort orders in the address', () => {
  it('reads the sort order, ignoring ones the bar does not offer', () => {
    expect(sortOrderInUrl(`${SEARCH}&sort=mileage`)).toBe('mileage');
    expect(sortOrderInUrl(`${SEARCH}&sort=price-desc`)).toBeNull();
    expect(sortOrderInUrl(SEARCH)).toBeNull();
    expect(hasSortInUrl(`${SEARCH}&sort=price-desc`)).toBe(true);
    expect(hasSortInUrl(SEARCH)).toBe(false);
  });

  it('changes only the sort, and starts again from the first page', () => {
    const sorted = new URL(urlWithSortOrder(`${SEARCH}&sort=relevance`, 'price-asc'));
    expect(sorted.searchParams.get('sort')).toBe('price-asc');
    expect(sorted.searchParams.get('make')).toBe('Mazda');
    expect(sorted.searchParams.get('postcode')).toBe('HR6 8AA');
    expect(sorted.searchParams.has('page')).toBe(false);
  });
});
