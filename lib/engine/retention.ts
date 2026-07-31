// Retention moiety computation and chase scheduling.
//
// Standard commercial pattern: the payer holds `percent`% of certified value;
// half is released at practical completion (first moiety), the remainder at
// the end of the defects/rectification period (second moiety). Both releases
// happen in practice only when requested — which is why the schedule feeds
// an automated chase engine.

import { addMonths } from "./dates";
import type { MoietySchedule, RetentionTerms } from "./types";

export function computeMoieties(terms: RetentionTerms): MoietySchedule {
  if (terms.percent < 0 || terms.percent > 10) {
    throw new Error(`Implausible retention percent: ${terms.percent}`);
  }
  const totalRetentionPence = Math.round(
    (terms.contractValuePence * terms.percent) / 100,
  );
  const firstFraction = terms.firstMoietyFraction ?? 0.5;
  const firstPence = Math.round(totalRetentionPence * firstFraction);
  const secondPence = totalRetentionPence - firstPence;

  return {
    totalRetentionPence,
    firstMoiety: {
      amountPence: firstPence,
      releaseDate: terms.practicalCompletion,
    },
    secondMoiety: {
      amountPence: secondPence,
      releaseDate: terms.practicalCompletion
        ? addMonths(terms.practicalCompletion, terms.defectsPeriodMonths)
        : undefined,
    },
  };
}

export type ChaseStage = "reminder" | "formal-demand" | "notice-before-action";

export interface ChaseStep {
  stage: ChaseStage;
  /** Days after the release date this step fires. */
  offsetDays: number;
}

/** Default escalation ladder for an unreleased moiety. */
export const DEFAULT_CHASE_LADDER: ChaseStep[] = [
  { stage: "reminder", offsetDays: 0 },
  { stage: "reminder", offsetDays: 14 },
  { stage: "formal-demand", offsetDays: 28 },
  { stage: "notice-before-action", offsetDays: 56 },
];
