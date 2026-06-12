import "server-only";
import type { ExperienceLevel } from "@/lib/types";

// --- Government / public sector -----------------------------------------------
// HONEST LIMITATION: no API cleanly labels "government" jobs, so this is a
// heuristic on the employer name and job title. It targets the civil
// service, NHS, councils, emergency services, universities/colleges and
// well-known public bodies.
const GOVERNMENT_ANYWHERE = new RegExp(
  [
    String.raw`\bnhs\b`,
    "foundation trust",
    "civil service",
    String.raw`\bhmrc\b`,
    "hm revenue",
    "hm prison",
    "hm courts",
    "hm treasury",
    "hm land registry",
    "hm passport",
    "home office",
    "cabinet office",
    "ministry of",
    String.raw`department (?:for|of) `,
    String.raw`\bdwp\b`,
    String.raw`\bdvla\b`,
    String.raw`\bdvsa\b`,
    String.raw`\bofsted\b`,
    String.raw`\bofcom\b`,
    String.raw`\bofgem\b`,
    String.raw`\bcouncils?\b`,
    "borough of",
    "local authority",
    "combined authority",
    String.raw`\bpolice\b`,
    "constabulary",
    String.raw`fire (?:service|and rescue|& rescue)`,
    "ambulance service",
    "environment agency",
    "national highways",
    "crown prosecution",
    "probation service",
    "prison service",
    String.raw`royal (?:navy|air force)`,
    "british army",
    "public sector",
    "government department",
    String.raw`\bgov\.uk\b`,
  ].join("|"),
  "i"
);

// These words only signal "public body" inside an EMPLOYER NAME — in a job
// title they'd misfire ("Sales Executive — uncapped commission!",
// "University of Life Coaching" courses, etc.).
const GOVERNMENT_COMPANY_ONLY = new RegExp(
  [
    String.raw`\buniversit(?:y|ies)\b`,
    String.raw`\bcolleges?\b`,
    String.raw`\bcommission\b`,
    String.raw`\bauthority\b`,
    "academy trust",
  ].join("|"),
  "i"
);

export function detectGovernment(
  company: string | null,
  title: string
): boolean {
  if (GOVERNMENT_ANYWHERE.test(`${company ?? ""} ${title}`)) return true;
  return company !== null && GOVERNMENT_COMPANY_ONLY.test(company);
}

// --- Experience level ----------------------------------------------------------
// HONEST LIMITATION: neither API exposes a structured experience level, so
// this is a best-effort classification from the job title.
const ENTRY_PATTERN =
  /\b(graduate|trainee|apprentice(?:ship)?|intern(?:ship)?|entry[ -]?level|junior|no experience|school leaver)\b/i;
const SENIOR_PATTERN =
  /\b(senior|lead|principal|head of|director|chief)\b/i;

export function classifyExperience(title: string): ExperienceLevel {
  if (ENTRY_PATTERN.test(title)) return "entry";
  if (SENIOR_PATTERN.test(title)) return "senior";
  return "mid";
}
