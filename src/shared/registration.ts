// UK number plates: normalising what a person types, and spotting one in a seller's description.
import type { Registration } from './brands.ts';

/** Upper case with spaces and punctuation removed. Not yet checked to be a plate. */
export function normaliseRegistrationText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Current (AB12CDE), prefix (A123BCD) and suffix (ABC123D) plates.
 * Dateless and cherished plates are too easy to confuse with ordinary words, so they are
 * accepted only when typed in (see parseTypedRegistration), never found in free text.
 */
export function isDatedUkPlate(normalised: string): boolean {
  return (
    /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(normalised) || /^[A-Z]\d{1,3}[A-Z]{3}$/.test(normalised) || /^[A-Z]{3}\d{1,3}[A-Z]$/.test(normalised)
  );
}

/** What a person typed into the reg box: any 2–7 letters and digits with at least one digit. */
export function parseTypedRegistration(typed: string): Registration | null {
  const normalised = normaliseRegistrationText(typed);
  return /^[A-Z0-9]{2,7}$/.test(normalised) && /\d/.test(normalised) ? (normalised as Registration) : null;
}

const LABELLED_REGISTRATION = /\bREG(?:ISTRATION)?(?:\s*(?:NO|NUMBER|PLATE))?\.?\s*[:-]?\s*([A-Z0-9]{1,4}\s?[A-Z0-9]{1,4})\b/;
const CURRENT_STYLE_PLATE = /\b([A-Z]{2}(?:0[2-9]|[1-9]\d)\s?[A-Z]{3})\b/;

/** A plate written in an advert description, if the seller included one. */
export function findRegistrationInDescription(description: string): Registration | null {
  const upper = description.toUpperCase();
  const labelled = upper.match(LABELLED_REGISTRATION)?.[1];
  if (labelled !== undefined) {
    const normalised = normaliseRegistrationText(labelled);
    if (isDatedUkPlate(normalised)) return normalised as Registration;
  }
  const currentStyle = upper.match(CURRENT_STYLE_PLATE)?.[1];
  return currentStyle === undefined ? null : (normaliseRegistrationText(currentStyle) as Registration);
}
