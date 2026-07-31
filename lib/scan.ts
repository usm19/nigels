// The daily scan: the system's autopilot. Idempotent — safe to run any number
// of times. For every organisation it:
//   1. promotes retention moieties whose release date has arrived and lays
//      down their escalating chase-letter ladder,
//   2. detects missed payer notices (smash-and-grab) and overdue cycles,
//      generating the statutory letters,
//   3. raises deadline-approaching alerts,
//   4. refreshes Companies House risk signals on every watched payer and
//      raises danger alerts.
// Triggered by POST /api/scan (cron, token-protected) or the in-app button.

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { assessCycle } from "@/lib/engine/deadlines";
import { DEFAULT_CHASE_LADDER } from "@/lib/engine/retention";
import { addDays, daysBetween, onOrBefore } from "@/lib/engine/dates";
import type { PaymentTerms } from "@/lib/engine/types";
import { moietyChaseLetter, notifiedSumLetter } from "@/lib/letters";
import { checkCompany } from "@/lib/companies-house";
import { todayISO } from "@/lib/format";

export interface ScanResult {
  moietiesDue: number;
  lettersScheduled: number;
  alertsRaised: number;
  payersChecked: number;
}

async function raiseAlert(
  db: Awaited<ReturnType<typeof getDb>>,
  alert: {
    organisationId: string;
    kind: "smash-and-grab" | "moiety-due" | "payer-risk" | "deadline-approaching";
    title: string;
    detail: string;
    contractId?: string;
    payerId?: string;
  },
): Promise<boolean> {
  // Dedupe: one live (unacknowledged) alert per kind+title+org.
  const existing = await db
    .select({ id: schema.alerts.id })
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.organisationId, alert.organisationId),
        eq(schema.alerts.kind, alert.kind),
        eq(schema.alerts.title, alert.title),
        isNull(schema.alerts.acknowledgedAt),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;
  await db.insert(schema.alerts).values(alert);
  return true;
}

export async function runScan(organisationId?: string): Promise<ScanResult> {
  const db = await getDb();
  const today = todayISO();
  const result: ScanResult = {
    moietiesDue: 0,
    lettersScheduled: 0,
    alertsRaised: 0,
    payersChecked: 0,
  };

  const orgs = organisationId
    ? [{ id: organisationId, name: "" }]
    : await db
        .select({ id: schema.organisations.id, name: schema.organisations.name })
        .from(schema.organisations);

  for (const org of orgs) {
    const orgName =
      org.name ||
      (
        await db
          .select({ name: schema.organisations.name })
          .from(schema.organisations)
          .where(eq(schema.organisations.id, org.id))
      )[0]?.name ||
      "";

    const contracts = await db
      .select({
        id: schema.contracts.id,
        title: schema.contracts.title,
        paymentTerms: schema.contracts.paymentTerms,
        payerId: schema.contracts.payerId,
        payerName: schema.payers.name,
      })
      .from(schema.contracts)
      .innerJoin(schema.payers, eq(schema.contracts.payerId, schema.payers.id))
      .where(
        and(
          eq(schema.contracts.organisationId, org.id),
          eq(schema.contracts.archived, false),
        ),
      );

    for (const contract of contracts) {
      const ctx = {
        organisationName: orgName,
        payerName: contract.payerName,
        contractTitle: contract.title,
      };

      // ---- 1. Moieties falling due + chase ladders ----
      const moieties = await db
        .select()
        .from(schema.moieties)
        .where(eq(schema.moieties.contractId, contract.id));

      for (const m of moieties) {
        if (!m.releaseDate) continue;
        const due = onOrBefore(m.releaseDate, today);
        if (due && m.status === "accruing") {
          await db
            .update(schema.moieties)
            .set({ status: "chasing" })
            .where(eq(schema.moieties.id, m.id));
          result.moietiesDue++;

          if (
            await raiseAlert(db, {
              organisationId: org.id,
              kind: "moiety-due",
              title: `Retention due: ${contract.title} (${m.kind} half)`,
              detail: `The ${m.kind} moiety became releasable on ${m.releaseDate}. The chase sequence has been prepared.`,
              contractId: contract.id,
              payerId: contract.payerId,
            })
          ) {
            result.alertsRaised++;
          }

          // Lay down the full ladder, one action per stage.
          for (const step of DEFAULT_CHASE_LADDER) {
            const scheduledFor = addDays(m.releaseDate, step.offsetDays);
            const dupe = await db
              .select({ id: schema.chaseActions.id })
              .from(schema.chaseActions)
              .where(
                and(
                  eq(schema.chaseActions.moietyId, m.id),
                  eq(schema.chaseActions.stage, step.stage),
                  eq(schema.chaseActions.scheduledFor, scheduledFor),
                ),
              )
              .limit(1);
            if (dupe.length > 0) continue;
            const letter = moietyChaseLetter(step.stage, ctx, {
              kind: m.kind,
              amountPence: m.amountPence,
              releaseDate: m.releaseDate,
            });
            await db.insert(schema.chaseActions).values({
              moietyId: m.id,
              stage: step.stage,
              scheduledFor,
              bodyMarkdown: `Subject: ${letter.subject}\n\n${letter.bodyMarkdown}`,
            });
            result.lettersScheduled++;
          }
        }
      }

      // ---- 2 & 3. Cycle assessment ----
      const cycles = await db
        .select()
        .from(schema.cycles)
        .where(eq(schema.cycles.contractId, contract.id));

      for (const c of cycles) {
        const a = assessCycle(
          c.applicationDate,
          contract.paymentTerms as PaymentTerms,
          {
            appliedPence: c.appliedPence,
            paymentNotice:
              c.paymentNoticeDate && c.paymentNoticePence !== null
                ? { date: c.paymentNoticeDate, amountPence: c.paymentNoticePence }
                : undefined,
            payLessNotice:
              c.payLessNoticeDate && c.payLessNoticePence !== null
                ? { date: c.payLessNoticeDate, amountPence: c.payLessNoticePence }
                : undefined,
            paidPence: c.paidPence,
          },
        );

        // Smash-and-grab: only actionable once the payer's notice window shut.
        if (
          a.smashAndGrab &&
          onOrBefore(a.timeline.payLessNoticeDeadline, today)
        ) {
          if (
            await raiseAlert(db, {
              organisationId: org.id,
              kind: "smash-and-grab",
              title: `Notice missed by ${contract.payerName}: full application payable — ${contract.title}`,
              detail: `No valid payment or pay-less notice was served for the application of ${c.applicationDate}. The full applied sum is the notified sum and is payable by ${a.timeline.finalDateForPayment}. A statutory letter has been prepared.`,
              contractId: contract.id,
              payerId: contract.payerId,
            })
          ) {
            result.alertsRaised++;
          }
          const dupe = await db
            .select({ id: schema.chaseActions.id })
            .from(schema.chaseActions)
            .where(
              and(
                eq(schema.chaseActions.cycleId, c.id),
                eq(schema.chaseActions.stage, "formal-demand"),
              ),
            )
            .limit(1);
          if (dupe.length === 0) {
            const letter = notifiedSumLetter(ctx, {
              applicationDate: c.applicationDate,
              notifiedSumPence: a.notifiedSumPence,
              finalDate: a.timeline.finalDateForPayment,
              smashAndGrab: true,
              shortfallPence: a.shortfallPence,
            });
            await db.insert(schema.chaseActions).values({
              cycleId: c.id,
              stage: "formal-demand",
              scheduledFor: today,
              bodyMarkdown: `Subject: ${letter.subject}\n\n${letter.bodyMarkdown}`,
            });
            result.lettersScheduled++;
          }
        } else if (a.overdue(today)) {
          if (
            await raiseAlert(db, {
              organisationId: org.id,
              kind: "deadline-approaching",
              title: `Payment overdue on ${contract.title}: application of ${c.applicationDate}`,
              detail: `The final date for payment (${a.timeline.finalDateForPayment}) has passed with a shortfall against the notified sum. A chase letter has been prepared.`,
              contractId: contract.id,
              payerId: contract.payerId,
            })
          ) {
            result.alertsRaised++;
          }
          const dupe = await db
            .select({ id: schema.chaseActions.id })
            .from(schema.chaseActions)
            .where(
              and(
                eq(schema.chaseActions.cycleId, c.id),
                eq(schema.chaseActions.stage, "reminder"),
              ),
            )
            .limit(1);
          if (dupe.length === 0) {
            const letter = notifiedSumLetter(ctx, {
              applicationDate: c.applicationDate,
              notifiedSumPence: a.notifiedSumPence,
              finalDate: a.timeline.finalDateForPayment,
              smashAndGrab: false,
              shortfallPence: a.shortfallPence,
            });
            await db.insert(schema.chaseActions).values({
              cycleId: c.id,
              stage: "reminder",
              scheduledFor: today,
              bodyMarkdown: `Subject: ${letter.subject}\n\n${letter.bodyMarkdown}`,
            });
            result.lettersScheduled++;
          }
        } else if (
          a.shortfallPence > 0 &&
          daysBetween(today, a.timeline.finalDateForPayment) >= 0 &&
          daysBetween(today, a.timeline.finalDateForPayment) <= 5
        ) {
          if (
            await raiseAlert(db, {
              organisationId: org.id,
              kind: "deadline-approaching",
              title: `Final date within 5 days: ${contract.title} — application of ${c.applicationDate}`,
              detail: `The final date for payment is ${a.timeline.finalDateForPayment} and the notified sum is not yet fully paid.`,
              contractId: contract.id,
              payerId: contract.payerId,
            })
          ) {
            result.alertsRaised++;
          }
        }
      }
    }

    // ---- 4. Payer radar ----
    const payers = await db
      .select()
      .from(schema.payers)
      .where(eq(schema.payers.organisationId, org.id));
    for (const p of payers) {
      if (!p.companyNumber) continue;
      const signals = await checkCompany(p.companyNumber);
      if (!signals) continue;
      result.payersChecked++;
      await db
        .insert(schema.payerWatch)
        .values({
          companyNumber: p.companyNumber,
          signals,
          lastCheckedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.payerWatch.companyNumber,
          set: { signals, lastCheckedAt: new Date() },
        });
      if (signals.level === "danger") {
        if (
          await raiseAlert(db, {
            organisationId: org.id,
            kind: "payer-risk",
            title: `Payer risk: ${p.name} — ${signals.reasons[0]}`,
            detail: `Companies House shows: ${signals.reasons.join("; ")}. Consider chasing all outstanding sums and retentions with this payer immediately.`,
            payerId: p.id,
          })
        ) {
          result.alertsRaised++;
        }
      }
    }
  }

  return result;
}
