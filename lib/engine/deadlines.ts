// The deadline engine: computes the statutory payment timeline for a cycle
// and judges what sum is legally payable ("the notified sum").
//
// Legal model (England & Wales, Construction Act as amended):
// - Payment due date and final date come from the contract, falling back to
//   the Scheme for Construction Contracts where the contract is silent.
// - The payer must serve a payment notice within `paymentNoticeDays` after
//   the due date. If it fails to, the payee's application stands as the
//   notified sum (s.110B) — the basis of "smash and grab" adjudication.
// - A pay-less notice served no later than `payLessNoticeDaysBeforeFinal`
//   days before the final date can reduce the sum payable.
// - Whatever the notified sum is, it must be paid by the final date.
//
// This module is deliberately pure: no I/O, no clock reads. Callers pass
// "today" in, which keeps every judgement reproducible and testable.

import { addDays, before, onOrBefore } from "./dates";
import {
  SCHEME_DEFAULTS,
  type CycleAssessment,
  type CycleEvents,
  type CycleTimeline,
  type ISODate,
  type PaymentTerms,
} from "./types";

export function resolveTerms(terms: PaymentTerms): Required<PaymentTerms> {
  return {
    applicationDayOfMonth: terms.applicationDayOfMonth,
    daysToDueDate: terms.daysToDueDate ?? SCHEME_DEFAULTS.daysToDueDate,
    daysDueToFinal: terms.daysDueToFinal ?? SCHEME_DEFAULTS.daysDueToFinal,
    paymentNoticeDays:
      terms.paymentNoticeDays ?? SCHEME_DEFAULTS.paymentNoticeDays,
    payLessNoticeDaysBeforeFinal:
      terms.payLessNoticeDaysBeforeFinal ??
      SCHEME_DEFAULTS.payLessNoticeDaysBeforeFinal,
  };
}

/** Compute the full statutory timeline for a cycle from its application date. */
export function computeTimeline(
  applicationDate: ISODate,
  terms: PaymentTerms,
): CycleTimeline {
  const t = resolveTerms(terms);
  const dueDate = addDays(applicationDate, t.daysToDueDate);
  const finalDateForPayment = addDays(dueDate, t.daysDueToFinal);
  return {
    applicationDate,
    dueDate,
    paymentNoticeDeadline: addDays(dueDate, t.paymentNoticeDays),
    payLessNoticeDeadline: addDays(
      finalDateForPayment,
      -t.payLessNoticeDaysBeforeFinal,
    ),
    finalDateForPayment,
  };
}

/**
 * Judge a cycle: what is the notified sum, was there a smash-and-grab
 * opportunity, and what shortfall exists?
 */
export function assessCycle(
  applicationDate: ISODate,
  terms: PaymentTerms,
  events: CycleEvents,
): CycleAssessment {
  const timeline = computeTimeline(applicationDate, terms);

  const validPaymentNotice =
    events.paymentNotice !== undefined &&
    onOrBefore(events.paymentNotice.date, timeline.paymentNoticeDeadline);

  const validPayLessNotice =
    events.payLessNotice !== undefined &&
    onOrBefore(events.payLessNotice.date, timeline.payLessNoticeDeadline);

  // Baseline notified sum: payer's valid payment notice, else the application.
  let notifiedSumPence: number;
  let basis: CycleAssessment["basis"];
  if (validPaymentNotice) {
    notifiedSumPence = events.paymentNotice!.amountPence;
    basis = "payment-notice";
  } else {
    notifiedSumPence = events.appliedPence;
    basis = "application";
  }

  // A valid pay-less notice overrides either baseline.
  if (validPayLessNotice) {
    notifiedSumPence = events.payLessNotice!.amountPence;
    basis = "pay-less-notice";
  }

  const smashAndGrab =
    !validPaymentNotice &&
    !validPayLessNotice &&
    events.appliedPence > events.paidPence;

  const shortfallPence = Math.max(0, notifiedSumPence - events.paidPence);

  return {
    timeline,
    notifiedSumPence,
    basis,
    smashAndGrab,
    shortfallPence,
    overdue: (today: ISODate) =>
      shortfallPence > 0 && before(timeline.finalDateForPayment, today),
  };
}
