// The shape of one vehicle's MOT history, as read from the GOV.UK "Check MOT history" page.
import * as z from 'zod/mini';

export type DefectSeverity = 'dangerous' | 'major' | 'fail' | 'prs' | 'minor' | 'advisory' | 'unknown';

/** Severities that mean the item failed the test (or would have, before the 2018 categories). */
export const FAILING_SEVERITIES: ReadonlySet<DefectSeverity> = new Set(['dangerous', 'major', 'fail', 'prs']);

export interface MotDefect {
  readonly severity: DefectSeverity;
  readonly description: string;
}

export type MotTestOutcome = 'pass' | 'fail' | 'unknown';

export interface MotTest {
  readonly testDate: Date;
  readonly outcome: MotTestOutcome;
  /** Converted to miles when the tester recorded kilometres. Null when unreadable or not recorded. */
  readonly odometerMiles: number | null;
  readonly expiryDate: Date | null;
  readonly defects: readonly MotDefect[];
}

export interface MotHistory {
  readonly registrationShown: string;
  readonly makeAndModel: string;
  readonly firstRegisteredDate: Date | null;
  readonly motValidUntil: Date | null;
  readonly motStatusText: string;
  /** Oldest first. */
  readonly tests: readonly MotTest[];
}

export type MotHistoryPageReading =
  { readonly kind: 'found'; readonly history: MotHistory } | { readonly kind: 'not-found'; readonly message: string };

export const ragLevelSchema = z.enum(['red', 'amber', 'green']);
export type RagLevel = z.infer<typeof ragLevelSchema>;

export const motFindingSchema = z.object({ level: ragLevelSchema, explanation: z.string() });
export type MotFinding = Readonly<z.infer<typeof motFindingSchema>>;

/** Plain data only (no Date objects) so it can be cached in chrome.storage and validated on the way back. */
export const motSummarySchema = z.object({
  overall: ragLevelSchema,
  findings: z.readonly(z.array(motFindingSchema)),
  testCount: z.number().check(z.int()),
  failedTestCount: z.number().check(z.int()),
  registrationShown: z.string(),
  makeAndModel: z.string(),
});
export type MotSummary = Readonly<z.infer<typeof motSummarySchema>>;
