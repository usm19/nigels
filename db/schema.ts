// Moiety database schema (Postgres, Drizzle ORM).
//
// Money is always integer pence. Dates that drive legal deadlines are
// date-only. Every table belongs to an organisation (the subcontractor firm);
// payers (main contractors) are shared per-organisation records that also
// feed the cross-customer risk radar via their company number.

import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  companyNumber: text("company_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A main contractor / employer the organisation works for. */
export const payers = pgTable("payers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  /** Companies House number — the key that powers the risk radar. */
  companyNumber: text("company_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  payerId: uuid("payer_id")
    .notNull()
    .references(() => payers.id),
  title: text("title").notNull(),
  /** Contract value in pence. */
  valuePence: bigint("value_pence", { mode: "number" }).notNull(),
  /** PaymentTerms JSON — see lib/engine/types.ts. */
  paymentTerms: jsonb("payment_terms").notNull(),
  /** RetentionTerms JSON, null when no retention is held. */
  retentionTerms: jsonb("retention_terms"),
  practicalCompletion: date("practical_completion"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One monthly application/claim cycle on a contract. */
export const cycles = pgTable("cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  applicationDate: date("application_date").notNull(),
  appliedPence: bigint("applied_pence", { mode: "number" }).notNull(),
  paymentNoticeDate: date("payment_notice_date"),
  paymentNoticePence: bigint("payment_notice_pence", { mode: "number" }),
  payLessNoticeDate: date("pay_less_notice_date"),
  payLessNoticePence: bigint("pay_less_notice_pence", { mode: "number" }),
  paidPence: bigint("paid_pence", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moietyKind = pgEnum("moiety_kind", ["first", "second"]);
export const moietyStatus = pgEnum("moiety_status", [
  "accruing",
  "due",
  "chasing",
  "released",
  "written-off",
]);

/** A tracked retention moiety with its release date and chase state. */
export const moieties = pgTable("moieties", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id),
  kind: moietyKind("kind").notNull(),
  amountPence: bigint("amount_pence", { mode: "number" }).notNull(),
  releaseDate: date("release_date"),
  status: moietyStatus("status").notNull().default("accruing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chaseStage = pgEnum("chase_stage", [
  "reminder",
  "formal-demand",
  "notice-before-action",
]);

/** Every chase letter generated/sent, forming the audit trail. */
export const chaseActions = pgTable("chase_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  moietyId: uuid("moiety_id").references(() => moieties.id),
  cycleId: uuid("cycle_id").references(() => cycles.id),
  stage: chaseStage("stage").notNull(),
  scheduledFor: date("scheduled_for").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  bodyMarkdown: text("body_markdown").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertKind = pgEnum("alert_kind", [
  "smash-and-grab",
  "moiety-due",
  "payer-risk",
  "deadline-approaching",
]);

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  kind: alertKind("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  contractId: uuid("contract_id").references(() => contracts.id),
  payerId: uuid("payer_id").references(() => payers.id),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Companies House watch state per payer company number. */
export const payerWatch = pgTable("payer_watch", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyNumber: text("company_number").notNull().unique(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  /** Latest snapshot of risk signals (accounts overdue, charges, insolvency filings). */
  signals: jsonb("signals"),
});
