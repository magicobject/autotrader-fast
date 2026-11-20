// The plain-English descriptions of the MOT rules, and the changelog, stay in step with the code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOT_RULES } from '../src/mot/motHistoryAnalysis.ts';

const readme = readFileSync('README.md', 'utf8');
const helpPage = readFileSync('static/help.html', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const users: readonly { firstName: string; lastName: string }[] = JSON.parse(readFileSync('users.json', 'utf8'));

describe('MOT rules in the documentation', () => {
  it.each([
    ['README.md', readme],
    ['help.html', helpPage],
  ])('%s quotes the current thresholds', (_name, text) => {
    expect(text).toContain(`more than ${MOT_RULES.lapseRedAfterDays} days`);
    expect(text).toContain(`${MOT_RULES.lapseAmberAfterDays} to ${MOT_RULES.lapseRedAfterDays} days`);
    expect(text).toContain(`last ${MOT_RULES.recentDefectYears} years`);
    expect(text).toContain(`${MOT_RULES.unusualMileageFactor} times`);
    expect(text).toContain(`${MOT_RULES.unusualMileageMinimumDifference.toLocaleString('en-GB')} miles a year`);
    expect(text).toContain(`${MOT_RULES.mileageDropToleranceMiles} miles`);
    expect(text).toContain('over 3 years old');
  });
});

describe('changelog', () => {
  const entries = [...changelog.matchAll(/^## (\S+) · (.+?) · (.+)$/gm)];

  it('has entries with a build number, a known author and a date', () => {
    expect(entries.length).toBeGreaterThan(0);
    const authors = users.map((user) => `${user.firstName} ${user.lastName}`);
    for (const [, build = '', author = '', date = ''] of entries) {
      expect(build).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d{3}$/);
      expect(authors).toContain(author);
      expect(Number.isNaN(new Date(date).getTime())).toBe(false);
    }
  });

  it('lists builds newest first', () => {
    const builds = entries.map(([, build = '']) => build);
    expect(builds).toEqual([...builds].sort().reverse());
  });
});
