import { describe, expect, it } from 'vitest';
import { csvField } from '../src/shared/csv.ts';

describe('csvField', () => {
  it('leaves plain values alone', () => {
    expect(csvField('Mazda MX-5')).toBe('Mazda MX-5');
    expect(csvField(1995)).toBe('1995');
    expect(csvField(-500)).toBe('-500'); // a negative price change is a number, not a formula
    expect(csvField(null)).toBe('');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('Leominster, Herefordshire')).toBe('"Leominster, Herefordshire"');
    expect(csvField('The "best" one')).toBe('"The ""best"" one"');
    expect(csvField('two\r\nlines')).toBe('"two\r\nlines"');
  });

  it('stops seller text being run as a spreadsheet formula', () => {
    expect(csvField('=HYPERLINK("http://example.com")')).toBe(`"'=HYPERLINK(""http://example.com"")"`);
    expect(csvField('+44 sale')).toBe("'+44 sale");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});
