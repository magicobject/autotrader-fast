// Everything the extension remembers, kept in chrome.storage.local on this computer only.
// Values are validated with their schema when read back, so data written by an older version
// (or damaged) is treated as missing rather than trusted.
import * as z from 'zod/mini';
import { advertDetailsSchema, type AdvertDetails } from '../autotrader/advertDetails.ts';
import { motSummarySchema } from '../mot/motHistoryTypes.ts';
import { epochMsSchema, nowEpochMs, registrationSchema, type AdvertId, type EpochMs, type Registration } from './brands.ts';
import { MILLISECONDS_PER_DAY } from './numbers.ts';

const ADVERT_DETAILS_MAX_AGE_MS = 3 * MILLISECONDS_PER_DAY;
const MOT_SUMMARY_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const FORGET_UNSEEN_ADVERTS_AFTER_MS = 120 * MILLISECONDS_PER_DAY;

const storageKeys = {
  priceHistory: 'v1:price-history',
  searchVisits: 'v1:search-visits',
  advertPanelCollapsed: 'v1:advert-panel-collapsed',
  advertDetails: (advertId: AdvertId) => `v1:advert-details:${advertId}`,
  registration: (advertId: AdvertId) => `v1:registration:${advertId}`,
  motSummary: (registration: Registration) => `v1:mot-summary:${registration}`,
} as const;

async function readStored<Schema extends z.ZodMiniType>(key: string, schema: Schema): Promise<z.infer<Schema> | null> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(key);
  const parsed = schema.safeParse(stored[key]);
  return parsed.success ? parsed.data : null;
}

async function writeStored(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

// ---- price history: every price we've seen for each advert ---------------------------------

const pricePointSchema = z.tuple([epochMsSchema, z.number()]);
const seenAdvertSchema = z.object({
  firstSeenMs: epochMsSchema,
  lastSeenMs: epochMsSchema,
  pricePoints: z.array(pricePointSchema),
});
export type SeenAdvert = z.infer<typeof seenAdvertSchema>;
const priceHistorySchema = z.record(z.string(), seenAdvertSchema);
export type PriceHistory = z.infer<typeof priceHistorySchema>;

export async function readPriceHistory(): Promise<PriceHistory> {
  return (await readStored(storageKeys.priceHistory, priceHistorySchema)) ?? {};
}

/** Combines two records of the same adverts (e.g. from two open tabs) without losing either's prices. */
export function mergePriceHistories(first: PriceHistory, second: PriceHistory): PriceHistory {
  const merged: PriceHistory = { ...first };
  for (const [advertId, seen] of Object.entries(second)) {
    const existing = merged[advertId];
    if (!existing) {
      merged[advertId] = seen;
      continue;
    }
    const pointsByTime = new Map([...existing.pricePoints, ...seen.pricePoints].map((point) => [point[0], point]));
    const pricePoints = [...pointsByTime.values()]
      .sort((earlier, later) => earlier[0] - later[0])
      .filter((point, index, points) => index === 0 || point[1] !== points[index - 1]?.[1]);
    merged[advertId] = {
      firstSeenMs: existing.firstSeenMs <= seen.firstSeenMs ? existing.firstSeenMs : seen.firstSeenMs,
      lastSeenMs: existing.lastSeenMs >= seen.lastSeenMs ? existing.lastSeenMs : seen.lastSeenMs,
      pricePoints,
    };
  }
  return merged;
}

/** Saves this tab's view merged with whatever another tab has saved meanwhile. */
export async function savePriceHistory(changes: PriceHistory): Promise<void> {
  const forgetBefore = nowEpochMs() - FORGET_UNSEEN_ADVERTS_AFTER_MS;
  const merged = mergePriceHistories(await readPriceHistory(), changes);
  const recent = Object.fromEntries(Object.entries(merged).filter(([, seen]) => seen.lastSeenMs >= forgetBefore));
  await writeStored(storageKeys.priceHistory, recent);
}

// ---- when each search was last run (for "new since last visit") ---------------------------

const searchVisitsSchema = z.record(z.string(), epochMsSchema);

/** Records this visit and returns the time of the previous one, if any. */
export async function recordSearchVisit(searchKey: string): Promise<EpochMs | null> {
  const visits = (await readStored(storageKeys.searchVisits, searchVisitsSchema)) ?? {};
  const previousVisit = visits[searchKey] ?? null;
  visits[searchKey] = nowEpochMs();
  await writeStored(storageKeys.searchVisits, visits);
  return previousVisit;
}

// ---- advert details, registrations and MOT summaries -----------------------------------------

export async function readAdvertDetails(advertId: AdvertId): Promise<AdvertDetails | null> {
  const details = await readStored(storageKeys.advertDetails(advertId), advertDetailsSchema);
  return details && nowEpochMs() - details.fetchedAtMs < ADVERT_DETAILS_MAX_AGE_MS ? details : null;
}

export async function writeAdvertDetails(details: AdvertDetails): Promise<void> {
  await writeStored(storageKeys.advertDetails(details.advertId), details);
}

export async function readRegistration(advertId: AdvertId): Promise<Registration | null> {
  return readStored(storageKeys.registration(advertId), registrationSchema);
}

export async function writeRegistration(advertId: AdvertId, registration: Registration): Promise<void> {
  await writeStored(storageKeys.registration(advertId), registration);
}

const cachedMotSummarySchema = z.object({
  checkedAtMs: epochMsSchema,
  advertisedMileage: z.nullable(z.number()),
  summary: motSummarySchema,
});
export type CachedMotSummary = z.infer<typeof cachedMotSummarySchema>;

export async function readMotSummary(registration: Registration): Promise<CachedMotSummary | null> {
  const cached = await readStored(storageKeys.motSummary(registration), cachedMotSummarySchema);
  return cached && nowEpochMs() - cached.checkedAtMs < MOT_SUMMARY_MAX_AGE_MS ? cached : null;
}

export async function writeMotSummary(registration: Registration, cached: CachedMotSummary): Promise<void> {
  await writeStored(storageKeys.motSummary(registration), cached);
}

// ---- interface preferences ---------------------------------------------------------------------

export async function readAdvertPanelCollapsed(): Promise<boolean> {
  return (await readStored(storageKeys.advertPanelCollapsed, z.boolean())) ?? false;
}

export async function writeAdvertPanelCollapsed(isCollapsed: boolean): Promise<void> {
  await writeStored(storageKeys.advertPanelCollapsed, isCollapsed);
}

// ---- tidying up -----------------------------------------------------------------------------

/**
 * Removes advert details and MOT summaries past their age limit, and saved registrations for adverts
 * we no longer remember at all (not seen for FORGET_UNSEEN_ADVERTS_AFTER_MS and no cached details).
 */
export async function pruneExpiredStorage(): Promise<void> {
  const everything: Record<string, unknown> = await chrome.storage.local.get(null);
  const now = nowEpochMs();
  const priceHistory = priceHistorySchema.safeParse(everything[storageKeys.priceHistory]).data ?? {};
  const keysToRemove: string[] = [];
  const isFresh = (checkedAtMs: unknown, maxAgeMs: number): boolean => typeof checkedAtMs === 'number' && now - checkedAtMs < maxAgeMs;
  for (const [key, value] of Object.entries(everything)) {
    if (key.startsWith('v1:advert-details:')) {
      if (!isFresh(advertDetailsSchema.safeParse(value).data?.fetchedAtMs, ADVERT_DETAILS_MAX_AGE_MS)) keysToRemove.push(key);
    } else if (key.startsWith('v1:mot-summary:')) {
      if (!isFresh(cachedMotSummarySchema.safeParse(value).data?.checkedAtMs, MOT_SUMMARY_MAX_AGE_MS)) keysToRemove.push(key);
    } else if (key.startsWith('v1:registration:')) {
      const advertId = key.slice('v1:registration:'.length);
      if (!(advertId in priceHistory) && !(`v1:advert-details:${advertId}` in everything)) keysToRemove.push(key);
    }
  }
  if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);
}
