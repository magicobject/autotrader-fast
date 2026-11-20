// Autotrader's own sort orders, as its "Filter and sort" dialog sets them in the address
// (?sort=…). Checked against the live dialog on 20 Nov 2026.
import * as z from 'zod/mini';

export const SORT_ORDERS = [
  { value: 'price-asc', label: 'Cheapest' },
  { value: 'distance', label: 'Nearest' },
  { value: 'mileage', label: 'Lowest miles' },
  { value: 'year-dsc', label: 'Newest' },
  { value: 'most-recent', label: 'Just listed' },
  { value: 'relevance', label: 'Best match' },
] as const;

/** The sort orders the quick-sort bar offers (Autotrader also has price-desc and year-asc). */
export type SortOrder = (typeof SORT_ORDERS)[number]['value'];

export const sortOrderSchema = z.enum(['price-asc', 'distance', 'mileage', 'year-dsc', 'most-recent', 'relevance']);

export const SORT_PARAMETER = 'sort';

/** The sort order the address asks for, or null when it names none we offer. */
export function sortOrderInUrl(href: string): SortOrder | null {
  return sortOrderSchema.safeParse(new URL(href).searchParams.get(SORT_PARAMETER)).data ?? null;
}

export function hasSortInUrl(href: string): boolean {
  return new URL(href).searchParams.has(SORT_PARAMETER);
}

/** The same search with a different sort order, starting again from the first page. */
export function urlWithSortOrder(href: string, sortOrder: SortOrder): string {
  const url = new URL(href);
  url.searchParams.set(SORT_PARAMETER, sortOrder);
  url.searchParams.delete('page');
  return url.toString();
}
