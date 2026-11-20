// Writing one value into a CSV file that will be opened in a spreadsheet.

/**
 * Quotes the value when it needs it, and stops a spreadsheet treating text as a formula: sellers write
 * advert titles and places, so text starting with = + - @ or a tab is prefixed with an apostrophe.
 */
export function csvField(value: string | number | null): string {
  const rawText = value === null ? '' : String(value);
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(rawText) ? `'${rawText}` : rawText;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
