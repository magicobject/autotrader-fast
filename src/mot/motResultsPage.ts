// Content script for the GOV.UK MOT results page: adds the summary card above the history.
// When opened from an advert, the link carries the advert's mileage and make (atfMiles, atfMake)
// so the summary can cross-check them; GOV.UK ignores the extra parameters.
import '../shared/zodSetup.ts';
import { firstNumberIn } from '../shared/numbers.ts';
import { analyseMotHistory } from './motHistoryAnalysis.ts';
import { readMotHistoryPage } from './motHistoryParser.ts';
import { createMotSummaryCard } from './motSummaryCard.ts';
import { ADVERTISED_MAKE_PARAMETER, ADVERTISED_MILEAGE_PARAMETER } from './motLinks.ts';

function addSummaryToResultsPage(): void {
  const reading = readMotHistoryPage(document);
  if (reading.kind !== 'found') return;
  const parameters = new URLSearchParams(location.search);
  const summary = analyseMotHistory(reading.history, {
    advertisedMileage: firstNumberIn(parameters.get(ADVERTISED_MILEAGE_PARAMETER)),
    advertisedMake: parameters.get(ADVERTISED_MAKE_PARAMETER),
  });
  const card = createMotSummaryCard(summary);
  card.classList.add('atf-on-gov');
  (document.querySelector('main') ?? document.body).prepend(card);
}

addSummaryToResultsPage();
