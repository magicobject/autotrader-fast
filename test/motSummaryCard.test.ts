// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createMotSummaryCard } from '../src/mot/motSummaryCard.ts';

describe('createMotSummaryCard', () => {
  it('shows the colour in words for screen readers as well as colour', () => {
    const card = createMotSummaryCard({
      overall: 'red',
      findings: [
        { level: 'red', explanation: 'Mileage went down.' },
        { level: 'green', explanation: 'MOT valid until 7 Feb 2027.' },
      ],
      testCount: 21,
      failedTestCount: 7,
      registrationShown: 'ZZ99 ZZZ',
      makeAndModel: 'MAZDA MX-5',
    });
    expect(card.getAttribute('aria-label')).toBe('MOT history summary');
    expect(card.textContent).toContain('RED ZZ99 ZZZ MAZDA MX-5 · 21 tests, 7 fails');
    expect([...card.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'RED: Mileage went down.',
      'GREEN: MOT valid until 7 Feb 2027.',
    ]);
  });

  it('never interprets text as HTML', () => {
    const card = createMotSummaryCard({
      overall: 'green',
      findings: [{ level: 'green', explanation: '<img src=x onerror=alert(1)>' }],
      testCount: 0,
      failedTestCount: 0,
      registrationShown: 'ZZ99 ZZZ',
      makeAndModel: 'X',
    });
    expect(card.querySelector('img')).toBeNull();
  });
});
