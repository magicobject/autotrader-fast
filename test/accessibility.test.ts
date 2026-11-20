// @vitest-environment jsdom
// axe-core checks of the help page and the interface pieces the extension adds to pages.
// jsdom has no layout, so colour contrast is covered by contrast.test.ts instead.
import { readFileSync } from 'node:fs';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { createMotSummaryCard } from '../src/mot/motSummaryCard.ts';

async function violationsIn(context: Element | Document): Promise<string[]> {
  const results = await axe.run(context, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('accessibility', () => {
  it('the help page has no axe violations', async () => {
    document.documentElement.innerHTML = readFileSync('static/help.html', 'utf8')
      .replace(/^<!doctype html>\s*<html lang="en">/i, '')
      .replace(/<\/html>\s*$/, '');
    document.documentElement.lang = 'en';
    expect(await violationsIn(document)).toEqual([]);
  });

  it('the MOT summary card has no axe violations', async () => {
    document.body.innerHTML = '<main><h1>Advert</h1></main>';
    document.querySelector('main')?.append(
      createMotSummaryCard({
        overall: 'amber',
        findings: [{ level: 'amber', explanation: 'Corrosion advisory (4 Feb 2025): Rear Coil spring corroded' }],
        testCount: 3,
        failedTestCount: 1,
        registrationShown: 'ZZ99 ZZZ',
        makeAndModel: 'MAZDA MX-5',
      }),
    );
    expect(await violationsIn(document)).toEqual([]);
  });
});
