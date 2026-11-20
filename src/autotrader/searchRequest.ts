// Reading and rewriting Autotrader's search-results requests and responses (used by the page hook).
import * as z from 'zod/mini';

export const SEARCH_OPERATION_NAME = 'SearchResultsListingsGridQuery';

const searchOperationSchema = z.looseObject({
  operationName: z.literal(SEARCH_OPERATION_NAME),
  variables: z.looseObject({
    page: z.nullish(z.number().check(z.int()).check(z.positive())),
    sortBy: z.nullish(z.string()),
    filters: z.nullish(z.array(z.looseObject({ filter: z.string(), selected: z.nullish(z.array(z.string())) }))),
  }),
});
export type SearchOperation = z.infer<typeof searchOperationSchema>;

const searchResponsePartSchema = z.looseObject({
  data: z.looseObject({ searchResults: z.looseObject({ listings: z.array(z.unknown()) }) }),
});
const listingTypeSchema = z.looseObject({ type: z.string() });

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

export function findSearchOperation(rawOperations: readonly unknown[]): SearchOperation | null {
  for (const raw of rawOperations) {
    const parsed = searchOperationSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Identifies a search by its filters and sort order (not its page number). */
export function searchKeyFor(operation: SearchOperation): string {
  const filterText = (operation.variables.filters ?? [])
    .filter((filter) => filter.filter !== 'page')
    .map((filter) => `${filter.filter}=${(filter.selected ?? []).join('|')}`)
    .sort()
    .join('&');
  return `${filterText}#sort=${operation.variables.sortBy ?? ''}`;
}

export function listingsIn(responseBody: unknown): unknown[] | null {
  for (const part of asArray(responseBody)) {
    const parsed = searchResponsePartSchema.safeParse(part);
    if (parsed.success) return parsed.data.data.searchResults.listings;
  }
  return null;
}

export function countCarsForSale(listings: readonly unknown[]): number {
  return listings.filter((listing) => listingTypeSchema.safeParse(listing).data?.type === 'NATURAL_LISTING').length;
}

/** A copy of the page's request body with the search's page number changed. */
export function withPageNumber(rawOperations: readonly unknown[], pageNumber: number): unknown[] {
  return rawOperations.map((raw) => {
    const parsed = searchOperationSchema.safeParse(raw);
    return parsed.success ? { ...parsed.data, variables: { ...parsed.data.variables, page: pageNumber } } : raw;
  });
}
