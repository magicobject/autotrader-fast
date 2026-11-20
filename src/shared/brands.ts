// Dedicated types for values that must never be mixed up with other strings or numbers.
import * as z from 'zod/mini';

declare const brand: unique symbol;
type Brand<Base, Name extends string> = Base & { readonly [brand]: Name };

/** Autotrader's numeric advert id, e.g. "202607314693714". */
export type AdvertId = Brand<string, 'AdvertId'>;

/** A UK registration in canonical form: upper case, no spaces, e.g. "AB12CDE". */
export type Registration = Brand<string, 'Registration'>;

/** Milliseconds since the Unix epoch. */
export type EpochMs = Brand<number, 'EpochMs'>;

const ADVERT_ID_PATTERN = /^\d{6,20}$/;

export function parseAdvertId(candidate: string): AdvertId | null {
  return ADVERT_ID_PATTERN.test(candidate) ? (candidate as AdvertId) : null;
}

export function nowEpochMs(): EpochMs {
  return Date.now() as EpochMs;
}

export function epochMsOf(moment: Date): EpochMs {
  return moment.getTime() as EpochMs;
}

/** Validators for the branded types, for reading them back out of storage. */
export const advertIdSchema = z.custom<AdvertId>((value) => typeof value === 'string' && ADVERT_ID_PATTERN.test(value));
export const registrationSchema = z.custom<Registration>((value) => typeof value === 'string' && /^[A-Z0-9]{2,7}$/.test(value));
export const epochMsSchema = z.custom<EpochMs>((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
