// Domain types for the payment-deadline engine.
//
// Terminology follows the Housing Grants, Construction and Regeneration Act
// 1996 ("the Construction Act") and the Scheme for Construction Contracts
// (England) Regulations. Dates are date-only ISO strings (YYYY-MM-DD) in the
// contract's local calendar; the engine never deals in times of day.

/** Date-only ISO string, e.g. "2026-08-25". */
export type ISODate = string;

/**
 * Payment terms for one subcontract. Every field that has a statutory
 * fallback is optional — omitted fields use the Scheme for Construction
 * Contracts defaults, which apply whenever the contract is silent.
 */
export interface PaymentTerms {
  /** Day of month the application/claim is made (1–28), e.g. 25. */
  applicationDayOfMonth: number;
  /**
   * Days from application to the payment DUE DATE.
   * Scheme default: 7 (payment due 7 days after the later of the end of the
   * relevant period or the making of the claim).
   */
  daysToDueDate?: number;
  /**
   * Days from due date to the FINAL DATE FOR PAYMENT.
   * Scheme default: 17.
   */
  daysDueToFinal?: number;
  /**
   * Days after the due date within which the payer must serve a PAYMENT
   * NOTICE. Statutory: 5 (s.110A(1)(a)).
   */
  paymentNoticeDays?: number;
  /**
   * Days BEFORE the final date for payment by which a PAY LESS NOTICE must
   * be served. Scheme default: 7 (the "prescribed period").
   */
  payLessNoticeDaysBeforeFinal?: number;
}

export const SCHEME_DEFAULTS: Required<
  Pick<
    PaymentTerms,
    | "daysToDueDate"
    | "daysDueToFinal"
    | "paymentNoticeDays"
    | "payLessNoticeDaysBeforeFinal"
  >
> = {
  daysToDueDate: 7,
  daysDueToFinal: 17,
  paymentNoticeDays: 5,
  payLessNoticeDaysBeforeFinal: 7,
};

/** The computed statutory timeline for a single payment cycle. */
export interface CycleTimeline {
  /** Date the application (payee's claim) is/was made. */
  applicationDate: ISODate;
  /** Payment due date. */
  dueDate: ISODate;
  /** Last day the payer can serve a valid payment notice. */
  paymentNoticeDeadline: ISODate;
  /** Last day the payer can serve a valid pay-less notice. */
  payLessNoticeDeadline: ISODate;
  /** Final date for payment. */
  finalDateForPayment: ISODate;
}

/** What actually happened in a cycle, as recorded by the user. */
export interface CycleEvents {
  /** Amount applied for, in pence. */
  appliedPence: number;
  /** Payment notice received? Date + amount if so. */
  paymentNotice?: { date: ISODate; amountPence: number };
  /** Pay-less notice received? Date + amount if so. */
  payLessNotice?: { date: ISODate; amountPence: number };
  /** Amount actually paid to date against this cycle, in pence. */
  paidPence: number;
}

export type NotifiedSumBasis =
  | "application" // no valid payment notice → the application is the notified sum
  | "payment-notice" // payer's notice stands
  | "pay-less-notice"; // a valid pay-less notice reset the sum

/** The engine's judgement on a cycle. */
export interface CycleAssessment {
  timeline: CycleTimeline;
  /** The sum that must legally be paid by the final date, in pence. */
  notifiedSumPence: number;
  basis: NotifiedSumBasis;
  /** True if the payer served no valid notice in time — full application payable. */
  smashAndGrab: boolean;
  /** Shortfall between what is legally payable and what was paid, in pence. */
  shortfallPence: number;
  /** True once the final date for payment has passed with a shortfall. */
  overdue: (today: ISODate) => boolean;
}

/** Retention terms for one subcontract. */
export interface RetentionTerms {
  /** Retention percentage, e.g. 3 or 5. */
  percent: number;
  /** Contract value in pence (used for cap calculations and estimates). */
  contractValuePence: number;
  /** Date of practical completion, once known. */
  practicalCompletion?: ISODate;
  /** Defects/rectification period in months (typically 12; sometimes 6 or 24). */
  defectsPeriodMonths: number;
  /**
   * Split of the retention released at practical completion, as a fraction.
   * Almost always 0.5 ("half at PC, half after defects").
   */
  firstMoietyFraction?: number;
}

export interface MoietySchedule {
  /** Total retention held at full certification, in pence. */
  totalRetentionPence: number;
  firstMoiety: { amountPence: number; releaseDate?: ISODate };
  secondMoiety: { amountPence: number; releaseDate?: ISODate };
}
