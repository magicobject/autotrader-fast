// Content script for the GOV.UK MOT results page. It adds the summary card above the history and
// saves the summary, so the advert the page was opened from can show it too.
// When opened from an advert, the link carries the advert's mileage and make (atfMiles, atfMake)
// so the summary can cross-check them; GOV.UK ignores the extra parameters.
import '../shared/zodSetup.ts';
import { nowEpochMs } from '../shared/brands.ts';
import { firstNumberIn } from '../shared/numbers.ts';
import { parseTypedRegistration } from '../shared/registration.ts';
import { writeMotSummary } from '../shared/storage.ts';
import { analyseMotHistory } from './motHistoryAnalysis.ts';
import { readMotHistoryPage } from './motHistoryParser.ts';
import { createMotSummaryCard } from './motSummaryCard.ts';
import { ADVERTISED_MAKE_PARAMETER, ADVERTISED_MILEAGE_PARAMETER } from './motLinks.ts';

async function addSummaryToResultsPage(): Promise<void> {
  // On GOV.UK's "Pardon Our Interruption" check page this finds nothing; the real page loads after it.
  const reading = readMotHistoryPage(document);
  if (reading.kind !== 'found') return;
  const parameters = new URLSearchParams(location.search);
  const advertisedMileage = firstNumberIn(parameters.get(ADVERTISED_MILEAGE_PARAMETER));
  const summary = analyseMotHistory(reading.history, { advertisedMileage, advertisedMake: parameters.get(ADVERTISED_MAKE_PARAMETER) });
  const card = createMotSummaryCard(summary);
  card.classList.add('atf-on-gov');
  (document.querySelector('main') ?? document.body).prepend(card);

  // File the summary under the registration this page actually shows (it must match the address, if given).
  const shown = parseTypedRegistration(reading.history.registrationShown);
  const asked = parameters.get('registration');
  const askedFor = asked === null ? null : parseTypedRegistration(asked);
  if (shown !== null && (asked === null || askedFor === shown)) {
    await writeMotSummary(shown, { checkedAtMs: nowEpochMs(), advertisedMileage, summary });
  }
}

addSummaryToResultsPage().catch((error: unknown) => console.warn('[Autotrader Fast] MOT summary', error));
