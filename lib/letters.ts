// Chase-letter generation. Letters are generated as Markdown, stored on the
// chase_actions audit trail, and rendered for sending/printing. Wording is
// deliberately firm-but-courteous at the early stages: subcontractors chase
// companies they want repeat work from, so the system supplies the social
// cover ("our payment-control system has flagged...").

import type { ChaseStage } from "@/lib/engine/retention";
import { gbpExact, ukDate } from "@/lib/format";

export interface LetterContext {
  organisationName: string;
  payerName: string;
  contractTitle: string;
}

export function moietyChaseLetter(
  stage: ChaseStage,
  ctx: LetterContext,
  moiety: { kind: "first" | "second"; amountPence: number; releaseDate: string },
): { subject: string; bodyMarkdown: string } {
  const half = moiety.kind === "first" ? "first" : "second";
  const amount = gbpExact(moiety.amountPence);
  const due = ukDate(moiety.releaseDate);
  const common = `**Re: ${ctx.contractTitle} — release of ${half} moiety of retention**\n\nDear Sirs,\n\n`;

  if (stage === "reminder") {
    return {
      subject: `Retention release now due — ${ctx.contractTitle}`,
      bodyMarkdown:
        common +
        `Our payment-control system has flagged that the ${half} moiety of retention on the above contract, in the sum of **${amount}**, fell due for release on **${due}**.\n\n` +
        `We should be grateful if you would arrange release of this sum with your next payment run. Please let us know if any information is required from us to process it.\n\n` +
        `Yours faithfully,\n${ctx.organisationName}`,
    };
  }
  if (stage === "formal-demand") {
    return {
      subject: `Formal request — outstanding retention of ${amount} — ${ctx.contractTitle}`,
      bodyMarkdown:
        common +
        `Further to our previous correspondence, the ${half} moiety of retention of **${amount}** due on **${due}** remains outstanding.\n\n` +
        `The contractual conditions for release have been satisfied and no notice withholding this sum has been served. We formally request payment within **14 days** of the date of this letter.\n\n` +
        `We would remind you that interest accrues on sums wrongfully withheld, and that under the Housing Grants, Construction and Regeneration Act 1996 we are entitled to refer any dispute to adjudication at any time.\n\n` +
        `Yours faithfully,\n${ctx.organisationName}`,
    };
  }
  return {
    subject: `Notice before adjudication — retention of ${amount} — ${ctx.contractTitle}`,
    bodyMarkdown:
      common +
      `Despite our reminder and formal request, the ${half} moiety of retention of **${amount}**, due on **${due}**, remains unpaid.\n\n` +
      `Unless payment is received within **7 days**, we intend to refer this dispute to adjudication under the Housing Grants, Construction and Regeneration Act 1996 and/or to commence proceedings for recovery of the debt, together with interest and compensation under the Late Payment of Commercial Debts (Interest) Act 1998, without further notice.\n\n` +
      `We remain willing to resolve this amicably on receipt of payment.\n\n` +
      `Yours faithfully,\n${ctx.organisationName}`,
  };
}

export function notifiedSumLetter(
  ctx: LetterContext,
  cycle: {
    applicationDate: string;
    notifiedSumPence: number;
    finalDate: string;
    smashAndGrab: boolean;
    shortfallPence: number;
  },
): { subject: string; bodyMarkdown: string } {
  const amount = gbpExact(cycle.shortfallPence);
  const notified = gbpExact(cycle.notifiedSumPence);
  const heading = `**Re: ${ctx.contractTitle} — application for payment dated ${ukDate(cycle.applicationDate)}**\n\nDear Sirs,\n\n`;

  if (cycle.smashAndGrab) {
    return {
      subject: `Notified sum of ${notified} payable — ${ctx.contractTitle}`,
      bodyMarkdown:
        heading +
        `No payment notice or pay less notice was served within the periods required by the contract and by sections 110A and 111 of the Housing Grants, Construction and Regeneration Act 1996 in respect of the above application.\n\n` +
        `In consequence, the sum applied for, **${notified}**, is the notified sum and became payable in full by the final date for payment, **${ukDate(cycle.finalDate)}**. **${amount}** remains outstanding.\n\n` +
        `We require payment of the outstanding sum forthwith. Failing payment within **7 days**, we reserve the right to refer the matter to adjudication and to exercise our statutory right to suspend performance under section 112 of the Act on further notice.\n\n` +
        `Yours faithfully,\n${ctx.organisationName}`,
    };
  }
  return {
    subject: `Outstanding balance of ${amount} — ${ctx.contractTitle}`,
    bodyMarkdown:
      heading +
      `The notified sum in respect of the above application is **${notified}**, of which **${amount}** remained unpaid after the final date for payment, **${ukDate(cycle.finalDate)}**.\n\n` +
      `Please arrange payment of the outstanding balance forthwith. Interest accrues on late commercial payments under the Late Payment of Commercial Debts (Interest) Act 1998.\n\n` +
      `Yours faithfully,\n${ctx.organisationName}`,
  };
}
