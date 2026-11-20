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

export async function writePriceHistory(history: PriceHistory): Promise<void> {
  const forgetBefore = nowEpochMs() - FORGET_UNSEEN_ADVERTS_AFTER_MS;
  const recent = Object.fromEntries(Object.entries(history).filter(([, seen]) => seen.lastSeenMs >= forgetBefore));
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
