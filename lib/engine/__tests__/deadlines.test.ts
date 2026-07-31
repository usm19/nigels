import { describe, expect, it } from "vitest";
import { assessCycle, computeTimeline } from "../deadlines";
import { addDays, addMonths } from "../dates";
import { computeMoieties } from "../retention";

// Scheme-default contract: apply on the 25th, due +7, final +17 from due,
// payment notice within 5 days of due, pay-less no later than 7 days before final.
const SCHEME_TERMS = { applicationDayOfMonth: 25 };

describe("computeTimeline (Scheme defaults)", () => {
  it("computes the statutory ladder from the application date", () => {
    const t = computeTimeline("2026-08-25", SCHEME_TERMS);
    expect(t.dueDate).toBe("2026-09-01"); // +7
    expect(t.paymentNoticeDeadline).toBe("2026-09-06"); // due +5
    expect(t.finalDateForPayment).toBe("2026-09-18"); // due +17
    expect(t.payLessNoticeDeadline).toBe("2026-09-11"); // final -7
  });

  it("honours contract overrides", () => {
    const t = computeTimeline("2026-08-25", {
      applicationDayOfMonth: 25,
      daysToDueDate: 14,
      daysDueToFinal: 28,
      payLessNoticeDaysBeforeFinal: 10,
    });
    expect(t.dueDate).toBe("2026-09-08");
    expect(t.finalDateForPayment).toBe("2026-10-06");
    expect(t.payLessNoticeDeadline).toBe("2026-09-26");
  });
});

describe("assessCycle — the notified sum", () => {
  it("no notices at all → application stands, smash-and-grab flagged", () => {
    const a = assessCycle("2026-08-25", SCHEME_TERMS, {
      appliedPence: 6_100_000,
      paidPence: 0,
    });
    expect(a.basis).toBe("application");
    expect(a.notifiedSumPence).toBe(6_100_000);
    expect(a.smashAndGrab).toBe(true);
    expect(a.shortfallPence).toBe(6_100_000);
  });

  it("valid payment notice in time → payer's figure stands", () => {
    const a = assessCycle("2026-08-25", SCHEME_TERMS, {
      appliedPence: 6_100_000,
      paymentNotice: { date: "2026-09-05", amountPence: 5_400_000 },
      paidPence: 5_400_000,
    });
    expect(a.basis).toBe("payment-notice");
    expect(a.notifiedSumPence).toBe(5_400_000);
    expect(a.smashAndGrab).toBe(false);
    expect(a.shortfallPence).toBe(0);
  });

  it("LATE payment notice → treated as absent; application stands", () => {
    const a = assessCycle("2026-08-25", SCHEME_TERMS, {
      appliedPence: 6_100_000,
      // deadline was 2026-09-06
      paymentNotice: { date: "2026-09-07", amountPence: 5_400_000 },
      paidPence: 5_400_000,
    });
    expect(a.basis).toBe("application");
    expect(a.notifiedSumPence).toBe(6_100_000);
    expect(a.smashAndGrab).toBe(true);
    expect(a.shortfallPence).toBe(700_000);
  });

  it("valid pay-less notice overrides even a missing payment notice", () => {
    const a = assessCycle("2026-08-25", SCHEME_TERMS, {
      appliedPence: 6_100_000,
      // pay-less deadline is 2026-09-11
      payLessNotice: { date: "2026-09-10", amountPence: 4_000_000 },
      paidPence: 4_000_000,
    });
    expect(a.basis).toBe("pay-less-notice");
    expect(a.notifiedSumPence).toBe(4_000_000);
    expect(a.smashAndGrab).toBe(false);
  });

  it("LATE pay-less notice is ignored", () => {
    const a = assessCycle("2026-08-25", SCHEME_TERMS, {
      appliedPence: 6_100_000,
      payLessNotice: { date: "2026-09-12", amountPence: 4_000_000 },
      paidPence: 4_000_000,
    });
    expect(a.basis).toBe("application");
    expect(a.notifiedSumPence).toBe(6_100_000);
    expect(a.shortfallPence).toBe(2_100_000);
  });

  it("overdue only after the final date has passed with money owing", () => {
    const a = assessCycle("2026-08-25", SCHEME_TERMS, {
      appliedPence: 1_000_000,
      paidPence: 0,
    });
    expect(a.overdue("2026-09-18")).toBe(false); // final date itself
    expect(a.overdue("2026-09-19")).toBe(true);
  });
});

describe("date arithmetic", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("addMonths clamps to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29"); // leap year
  });
});

describe("computeMoieties", () => {
  it("splits 3% retention half-and-half with a 12-month second release", () => {
    const s = computeMoieties({
      percent: 3,
      contractValuePence: 22_000_000, // £220k
      practicalCompletion: "2026-06-15",
      defectsPeriodMonths: 12,
    });
    expect(s.totalRetentionPence).toBe(660_000); // £6,600
    expect(s.firstMoiety.amountPence).toBe(330_000);
    expect(s.firstMoiety.releaseDate).toBe("2026-06-15");
    expect(s.secondMoiety.amountPence).toBe(330_000);
    expect(s.secondMoiety.releaseDate).toBe("2027-06-15");
  });

  it("no practical completion yet → no release dates", () => {
    const s = computeMoieties({
      percent: 5,
      contractValuePence: 10_000_000,
      defectsPeriodMonths: 12,
    });
    expect(s.firstMoiety.releaseDate).toBeUndefined();
    expect(s.secondMoiety.releaseDate).toBeUndefined();
    expect(s.totalRetentionPence).toBe(500_000);
  });

  it("rejects implausible retention percentages", () => {
    expect(() =>
      computeMoieties({
        percent: 40,
        contractValuePence: 1_000_000,
        defectsPeriodMonths: 12,
      }),
    ).toThrow();
  });
});
