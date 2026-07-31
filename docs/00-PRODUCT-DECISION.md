# Product Decision: What We Are Building

> **SUPERSEDED (31 July 2026):** Round-2 research (docs 05–07) found the Commercial
> Payments Bill will phase out construction retentions entirely and that retention
> recovery is one-and-done on the founder's now-primary criterion (customer retention).
> The current ranking and recommendation live in **`08-FINAL-RANKING.md`**. This
> document is kept as the round-1 record.

**Date:** 30 July 2026
**Status:** Superseded by `08-FINAL-RANKING.md`
**Inputs:** Four research streams (docs 01–04), all citation-backed.

---

## The decision in one paragraph

Build a **subcontractor-side retention-recovery and payment-control platform for UK
construction SMEs** — software that finds, tracks, and chases the retention money main
contractors owe them — sold by cold email to specialist subcontractors (M&E, electrical,
groundworks, steel, shopfitting, roofing; 5–80 staff) in and around Birmingham first.
Working title: **Moiety** (the legal term for each half of a retention payment;
alternatives: *Retained*, *SecondHalf*).

---

## 1. The industry: construction specialist subcontractors

Chosen over precision-engineering manufacturing (the region's densest cluster), recruitment,
food wholesale, haulage, HMO/property, and care. Section 4 explains each rejection.

The West Midlands has one of the UK's largest concentrations of construction SMEs
(the sector is ~870,000 firms nationally, 99.9% SMEs — doc 03), they are the UK's
worst-paid sector by payment behaviour, and their back office is a spreadsheet and one
overloaded office manager.

## 2. The really, really important issue

**Retention money.** Main contractors withhold 3–5% of every subcontract's value:
half is released at practical completion, the other half ("second moiety") 12–24 months
after the subcontractor has left site — but only if someone remembers to chase it.
The evidence (all cited in doc 03):

- **£3.2–5.9bn** is withheld across the sector annually (BEIS/Pye Tait).
- **44% of contractors have lost retention money** to an upstream insolvency;
  ~£220–240m is lost every year — **~£1m per working day** (ECA).
- The average firm carries **~£27,500 outstanding** at any time (ECA/BESA);
  other estimates put average subcontractor losses at ~£79,900 (LazyQS).
- The second moiety falls due long after the job ended. **Nobody diaries it. Main
  contractors do not volunteer it. It is only paid when chased.**
- ISG's 2024 collapse (£700m+ owed to the supply chain; administrators recovered
  ~£38.5m of £885m) made this loss vivid for every subcontractor in the country.
- Construction has led UK insolvencies four years running (~4,000/year) — every payer
  on a subbie's book is a live counterparty risk they have no way to monitor.

This is not "admin pain." It is **found money**: five figures per firm, recoverable
with a ledger, a diary, and a well-drafted chase letter.

**Why nobody has solved it:** Payapps serves the main contractor's side. Field-service
tools (simPRO, Joblogic) stop at job management. Xero thinks in invoices, but subbies are
paid via applications for payment under the Construction Act. The subcontractor-side
commercial layer — applications, certified-vs-applied deltas, notice deadlines,
retention moieties — lives in Excel. Early micro-movers (BuildQS, LazyQS, Site Samurai)
validate the space without owning it. Human retention-recovery services charge
contingency fees — proof of willingness to pay.

**Why now:** ISG aftershock; record adjudication volumes; the Reporting on Payment
Practices (Amendment) Regulations 2025 force large contractors to publish retention
practices (free public data we can exploit); government consultation on abolishing
retentions is years from biting and meanwhile keeps the topic in every trade magazine.

## 3. Why this fits the brief's three constraints

**Constraint 1 — sold by cold email to Birmingham companies.** This is the decisive
advantage over every alternative. The email is not a software pitch, it is a
money-recovery pitch: *"Firms your size typically have £40–80k in unreleased retentions.
Send us your last three final accounts and we'll map yours for free."* A free
**Retention Health Check** is the lead magnet; the SaaS is the follow-on. List-building
is mechanical: Companies House free bulk data, SIC 41–43, B/WS/DY/WV/CV postcodes,
5–80 employees, cross-referenced with Constructionline, CHAS/SafeContractor, NICEIC and
Gas Safe public registers. (A follow-up phone call to non-responders fits the trade's
phone culture and is entirely doable locally.)

**Constraint 2 — solo + Claude Code, 1–2 months, built to perfection.** The v1 core is
a ledger, date arithmetic, document extraction, letter generation, and a public-API
monitor — no hard integrations, no safety-critical estimation, no real-time systems.
Claude-class models are genuinely strong at exactly the hard part (extracting retention
terms from subcontract PDFs). Contrast: the manufacturing quoting tool's hard part
(cycle-time estimation from drawings) is a research problem where a wrong answer costs
the customer a month's margin.

**Constraint 3 — really important issue.** Recovering a single forgotten second moiety
(routinely £5k–£30k) pays for years of subscription. In a sector with 1–2% margins and
4,000 insolvencies a year, this is survival money, not efficiency software.

## 4. Why not the runners-up

| Vertical | Verdict | Killer reason (docs 01/02/04) |
|---|---|---|
| Precision engineering quoting co-pilot | Strong #2 | Owner-managed shops don't buy from cold email (phone/visits/trade shows); cycle-time AI is high-risk to build to "perfection" in 8 weeks; CloudNC Quote Agent already free-tier in the UK |
| Recruitment agencies (temp-desk compliance) | No | Cold-email native, but core ATS market saturated and SafeRec (7,000+ agencies) owns the April-2026 umbrella-liability wedge |
| Food wholesale order-entry AI | Wildcard, parked | Real revenue pain, thin competition — but phone/WhatsApp relationship culture dilutes cold email; revisit as product #2 |
| Haulage/logistics | No | Cheap entrenched compliance incumbents; target cohort in financial free-fall (400 insolvencies in 2025) |
| HMO landlords | No | COHO + micro-SaaS swarm, £30/mo price anchor, buyers not reachable by professional email |
| Care providers | No | Most saturated market of all, free-tier competitors, weakest ability to pay |

Scoring (1–10) against the constraint set — pain severity / revenue-tie / underservedness /
cold-email fit / 8-week buildability: retention platform **9/10/9/10/9**; quoting co-pilot
9/9/7/4/5; recruitment 7/7/4/9/7; food wholesale 8/9/8/4/6. No other candidate scores
above 6 on both cold-email fit and buildability.

## 5. Product scope — v1 (8 weeks)

1. **Contract ingestion.** Upload subcontract order/final account PDFs (or forward by
   email). AI extracts: payer entity, contract sum, retention %, cap, moiety split,
   practical-completion date, defects period, release triggers. Human-confirm screen —
   extraction is assistive, never silent.
2. **Retention ledger.** Every contract, both moieties, computed release dates.
   Dashboard: **£X releasable now / £Y due in 90 days / £Z at risk**. Portfolio total on
   the first screen — that number is the product.
3. **Recovery engine.** Escalating chase sequence (polite reminder → formal demand citing
   the contract and the Construction Act's notified-sum regime → notice before
   adjudication), generated per contract, sent on schedule, replies tracked.
4. **Payer risk monitor.** Companies House API watch on every main contractor on the
   ledger: overdue accounts, new charges, insolvency filings → "get your money out
   early" alerts. Enriched with the 2025 payment-practices public reporting data.
5. **Retention Health Check** (the growth loop): a standalone flow where a prospect
   uploads 2–3 final accounts and gets a one-page money map by email — free, no account
   needed, feeds the cold-email campaign directly.

**Explicit non-goals for v1:** full application-for-payment module (applied vs certified
vs paid + notice-deadline tracking — this is phase 2, same buyer, same data), Xero
integration, adjudication case management, main-contractor-side features.

**Pricing hypothesis:** £149/mo flat, unlimited contracts (founding customers £99);
optional launch tier: free + 5% of first recovered retention, converting to flat
subscription — makes the first yes riskless.

## 6. Risks and counters

- **"I don't want to upset the main contractor."** Position chasing as system-generated
  routine ("our platform flags this automatically") — the same social cover Payapps
  gives MCs. Tone settings on every letter.
- **Onboarding friction kills it.** The product is dead if setup takes hours; AI
  extraction + the health-check flow must make time-to-first-number under 15 minutes.
- **Regulatory horizon.** If retentions are abolished (earliest ~2027–28, consultation
  stage now), phase 2 (payment applications) is the same product for the same buyer with
  or without retentions.
- **Incumbent bolt-on / early movers.** Speed, subcontractor-side focus, and the
  recovery framing (not "project software") are the differentiation; local Birmingham
  density gives reference-customer defensibility.
- **Customer insolvency churn.** Real; priced in by flat low pricing and volume, and the
  payer-risk monitor is itself the retention aid.
- **Numbers hygiene.** All statistics above are as reported by cited sources; re-verify
  headline claims (£3.2–5.9bn, 44%, ISG figures) before using them in marketing copy.

## 7. Eight-week build plan (once approved)

- **Wk 1–2:** Data model (contracts, moieties, payers, chases), auth, ledger UI, manual
  entry path. Deploy from day one.
- **Wk 3–4:** AI contract extraction + confirm screen; Retention Health Check flow.
- **Wk 5:** Recovery engine — letter templates (reviewed against HGCRA/Scheme for
  Construction Contracts wording), scheduling, email sending, reply tracking.
- **Wk 6:** Companies House monitor + alerts; payment-practices data enrichment.
- **Wk 7:** Polish to perfection (design/UI skills now in `.claude/skills`), onboarding,
  empty states, PDF outputs.
- **Wk 8:** Hardening, security pass, seed data, first cold-email batch (100 West
  Midlands subcontractors) with the health check as the hook.

**Success metrics for the first 60 days after launch:** 30 health checks delivered;
5 paying firms; one documented recovered retention as the flagship case study.

## 8. Sources

Full citations live in the four research documents:
- `01-research-birmingham-landscape.md` — regional density, digital maturity, reachability
- `02-research-manufacturing-deep-dive.md` — the runner-up, kept warm for product #2
- `03-research-construction-deep-dive.md` — the winning vertical's evidence base
- `04-research-other-verticals.md` — recruitment, HMO, haulage, care, wildcards
