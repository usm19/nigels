import { describe, expect, it } from "vitest";
import { moietyChaseLetter, notifiedSumLetter } from "@/lib/letters";

const ctx = {
  organisationName: "Mills Electrical Ltd",
  payerName: "BuildCo Midlands Ltd",
  contractTitle: "Walsall depot rewire",
};

describe("moietyChaseLetter", () => {
  it("reminder is polite and cites the amount and due date", () => {
    const l = moietyChaseLetter("reminder", ctx, {
      kind: "second",
      amountPence: 330_000,
      releaseDate: "2027-06-15",
    });
    expect(l.subject).toContain("Retention release now due");
    expect(l.bodyMarkdown).toContain("£3,300.00");
    expect(l.bodyMarkdown).toContain("15/06/2027");
    expect(l.bodyMarkdown).toContain("payment-control system");
    expect(l.bodyMarkdown).not.toContain("adjudication");
  });

  it("formal demand escalates and cites the Construction Act", () => {
    const l = moietyChaseLetter("formal-demand", ctx, {
      kind: "first",
      amountPence: 330_000,
      releaseDate: "2026-06-15",
    });
    expect(l.bodyMarkdown).toContain("14 days");
    expect(l.bodyMarkdown).toContain("Housing Grants, Construction and Regeneration Act 1996");
  });

  it("final stage threatens adjudication and late-payment interest", () => {
    const l = moietyChaseLetter("notice-before-action", ctx, {
      kind: "second",
      amountPence: 330_000,
      releaseDate: "2027-06-15",
    });
    expect(l.subject).toContain("Notice before adjudication");
    expect(l.bodyMarkdown).toContain("Late Payment of Commercial Debts");
  });
});

describe("notifiedSumLetter", () => {
  it("smash-and-grab letter cites s.110A/111 and the full notified sum", () => {
    const l = notifiedSumLetter(ctx, {
      applicationDate: "2026-08-25",
      notifiedSumPence: 6_100_000,
      finalDate: "2026-09-18",
      smashAndGrab: true,
      shortfallPence: 700_000,
    });
    expect(l.bodyMarkdown).toContain("sections 110A and 111");
    expect(l.bodyMarkdown).toContain("£61,000.00");
    expect(l.bodyMarkdown).toContain("£7,000.00");
    expect(l.bodyMarkdown).toContain("section 112");
  });

  it("plain overdue letter stays measured", () => {
    const l = notifiedSumLetter(ctx, {
      applicationDate: "2026-08-25",
      notifiedSumPence: 5_400_000,
      finalDate: "2026-09-18",
      smashAndGrab: false,
      shortfallPence: 400_000,
    });
    expect(l.bodyMarkdown).not.toContain("section 112");
    expect(l.bodyMarkdown).toContain("Late Payment of Commercial Debts");
  });
});
