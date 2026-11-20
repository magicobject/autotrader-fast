// The Red / Amber / Green card shown on advert pages and at the top of the GOV.UK MOT page.
import { createElement } from '../shared/dom.ts';
import type { MotSummary, RagLevel } from './motHistoryTypes.ts';

export const RAG_LABEL: Readonly<Record<RagLevel, string>> = { red: 'RED', amber: 'AMBER', green: 'GREEN' };

export function createMotSummaryCard(summary: MotSummary): HTMLDivElement {
  const testCountText = summary.testCount > 0 ? ` · ${summary.testCount} tests, ${summary.failedTestCount} fails` : '';
  const heading = createElement(
    'div',
    { className: 'atf-mot-head' },
    createElement('span', { className: `atf-rag atf-rag-${summary.overall}`, text: RAG_LABEL[summary.overall] }),
    createElement('strong', { text: ` ${summary.registrationShown} ${summary.makeAndModel}` }),
    testCountText ? createElement('span', { className: 'atf-muted', text: testCountText }) : null,
  );
  const findingList = createElement(
    'ul',
    { className: 'atf-reasons' },
    summary.findings.map((finding) =>
      createElement(
        'li',
        { className: `atf-r-${finding.level}` },
        createElement('span', { className: 'atf-dot', attributes: { 'aria-hidden': 'true' } }),
        createElement('span', { className: 'atf-visually-hidden', text: `${RAG_LABEL[finding.level]}: ` }),
        finding.explanation,
      ),
    ),
  );
  return createElement(
    'div',
    { className: 'atf-mot-card', attributes: { role: 'region', 'aria-label': 'MOT history summary' } },
    heading,
    findingList,
  );
}
