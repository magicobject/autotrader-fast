// Autotrader's search results data (the SearchResultsListingsGridQuery the results page loads),
// validated at the boundary and turned into the rows the fast table shows.
import * as z from 'zod/mini';
import { parseAdvertId, type AdvertId } from '../shared/brands.ts';
import { firstNumberIn } from '../shared/numbers.ts';

export const AUTOTRADER_ORIGIN = 'https://www.autotrader.co.uk';

// Badges without text (Autotrader adds new kinds from time to time) are kept but never shown.
const badgeSchema = z.object({ type: z.string(), displayText: z.nullish(z.string()) });

const rawListingSchema = z.object({
  type: z.string(),
  advertId: z.string(),
  title: z.string(),
  subTitle: z.nullish(z.string()),
  attentionGrabber: z.nullish(z.string()),
  price: z.string(),
  vehicleLocation: z.nullish(z.string()),
  images: z.nullish(z.array(z.string())),
  sellerType: z.nullish(z.string()),
  dealerReview: z.nullish(z.object({ overallReviewRating: z.nullish(z.number()) })),
  fpaLink: z.nullish(z.string()),
  badges: z.nullish(z.array(badgeSchema)),
  trackingContext: z.nullish(
    z.object({
      advertContext: z.nullish(z.object({ price: z.nullish(z.number()), year: z.nullish(z.number()) })),
      distance: z.nullish(z.object({ distance: z.nullish(z.number()) })),
    }),
  ),
});
type RawListing = z.infer<typeof rawListingSchema>;

export type ListingPlacement = 'featured' | 'standard';
export type SellerKind = 'trade' | 'private';

export interface SearchListing {
  readonly advertId: AdvertId;
  readonly placement: ListingPlacement;
  readonly title: string;
  readonly subtitle: string;
  readonly attentionGrabber: string;
  readonly priceGbp: number;
  readonly year: number | null;
  readonly mileage: number | null;
  readonly distanceMiles: number | null;
  readonly location: string;
  readonly sellerKind: SellerKind;
  readonly dealerRating: number | null;
  /** Autotrader's own label, e.g. "Good price". Empty when it gives none. */
  readonly priceRating: string;
  /** Other badges worth seeing, e.g. "Cat S", "Private seller". */
  readonly otherBadges: readonly string[];
  readonly thumbnailUrl: string | null;
  readonly advertUrl: string;
}

const THUMBNAIL_WIDTH = 'w260'; // a size Autotrader's image server actually provides

function badgeText(listing: RawListing, badgeType: string): string | null {
  return listing.badges?.find((badge) => badge.type === badgeType)?.displayText ?? null;
}

/** The advert's address without the search-tracking query string. */
export function advertUrlFor(fpaLink: string | null | undefined, advertId: AdvertId): string {
  const url = new URL(fpaLink ?? `/car-details/${advertId}`, AUTOTRADER_ORIGIN);
  return url.origin + url.pathname;
}

function toSearchListing(listing: RawListing): SearchListing | null {
  const advertId = parseAdvertId(listing.advertId);
  if (advertId === null) return null;
  if (listing.type !== 'NATURAL_LISTING' && listing.type !== 'FEATURED_LISTING') return null; // leasing deals, adverts
  const priceGbp = listing.trackingContext?.advertContext?.price ?? firstNumberIn(listing.price);
  if (priceGbp === null) return null;
  const badges = listing.badges ?? [];
  const isPrivateSeller = listing.sellerType === 'PRIVATE' || badges.some((badge) => badge.type === 'PRIVATE_SELLER');
  const locationText = listing.vehicleLocation ?? '';
  return {
    advertId,
    placement: listing.type === 'FEATURED_LISTING' ? 'featured' : 'standard',
    title: listing.title,
    subtitle: listing.subTitle ?? '',
    attentionGrabber: listing.attentionGrabber ?? '',
    priceGbp,
    year: listing.trackingContext?.advertContext?.year ?? firstNumberIn(badgeText(listing, 'REGISTERED_YEAR')),
    mileage: firstNumberIn(badgeText(listing, 'MILEAGE')),
    distanceMiles: listing.trackingContext?.distance?.distance ?? firstNumberIn(locationText.match(/\((\d+) miles?\)/)?.[1]),
    location: locationText.replace(/\s*\(.*\)/, ''),
    sellerKind: isPrivateSeller ? 'private' : 'trade',
    dealerRating: listing.dealerReview?.overallReviewRating ?? null,
    priceRating: badges.find((badge) => badge.type.startsWith('PI_'))?.displayText ?? '',
    otherBadges: badges
      .filter((badge) => !/^(PI_|MILEAGE|REGISTERED_YEAR)/.test(badge.type))
      .flatMap((badge) => (badge.displayText ? [badge.displayText] : [])),
    thumbnailUrl: listing.images?.[0]?.replace('{resize}', THUMBNAIL_WIDTH) ?? null,
    advertUrl: advertUrlFor(listing.fpaLink, advertId),
  };
}

/** Listings that don't match the expected shape (or aren't cars for sale) are left out. */
export function parseSearchListings(rawListings: readonly unknown[]): SearchListing[] {
  const listings: SearchListing[] = [];
  for (const raw of rawListings) {
    const parsed = rawListingSchema.safeParse(raw);
    if (!parsed.success) continue;
    const listing = toSearchListing(parsed.data);
    if (listing) listings.push(listing);
  }
  return listings;
}
