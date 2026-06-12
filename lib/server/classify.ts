import "server-only";
import type { ExperienceLevel, Sector } from "@/lib/types";

// --- Sector classification ----------------------------------------------------
// HONEST LIMITATION: there is no single official "government jobs" feed, so
// this is employer-pattern detection on the employer name and job title.
//
// Three buckets:
//  - government: working directly for a government body — HM Civil Service,
//    central departments/ministries/agencies, local councils/authorities,
//    Parliament.
//  - public_sector: publicly funded but not core government — NHS, schools/
//    colleges/universities, police, fire & ambulance, other public bodies.
//  - private: everything else.

const GOVERNMENT_ANYWHERE = new RegExp(
  [
    "civil service",
    String.raw`\bhmrc\b`,
    "hm revenue",
    "hm prison",
    "hm courts",
    "hm treasury",
    "hm land registry",
    "hm passport",
    String.raw`\bhm government\b`,
    "home office",
    "cabinet office",
    "foreign office",
    "ministry of",
    String.raw`\bministerial\b`,
    String.raw`department (?:for|of) `,
    String.raw`\bdwp\b`,
    String.raw`\bdvla\b`,
    String.raw`\bdvsa\b`,
    String.raw`\bdefra\b`,
    String.raw`\bdfe\b`,
    String.raw`\bmod\b`,
    String.raw`\bofsted\b`,
    String.raw`\bofcom\b`,
    String.raw`\bofgem\b`,
    String.raw`\bofqual\b`,
    String.raw`\bcity council\b`,
    String.raw`\bcounty council\b`,
    String.raw`\bdistrict council\b`,
    String.raw`\bborough council\b`,
    String.raw`\bparish council\b`,
    String.raw`\btown council\b`,
    String.raw`\bcouncils?\b`,
    "borough of",
    "local authority",
    "combined authority",
    "metropolitan borough",
    String.raw`\bparliament\b`,
    "house of commons",
    "house of lords",
    "crown prosecution",
    "government department",
    "government agency",
    String.raw`\bgov\.uk\b`,
    String.raw`\.gov\b`,
  ].join("|"),
  "i"
);

// Words that only signal "government body" inside an EMPLOYER NAME.
const GOVERNMENT_COMPANY_ONLY = new RegExp(
  [String.raw`\bauthority\b`, String.raw`\bcouncil\b`].join("|"),
  "i"
);

const PUBLIC_SECTOR_ANYWHERE = new RegExp(
  [
    String.raw`\bnhs\b`,
    "foundation trust",
    String.raw`\bnhs trust\b`,
    "national health service",
    String.raw`\bpolice\b`,
    "constabulary",
    "police force",
    String.raw`fire (?:service|and rescue|& rescue|brigade)`,
    "ambulance service",
    "ambulance trust",
    "environment agency",
    "national highways",
    "probation service",
    "prison service",
    "public sector",
    "public health",
    "local authority",
  ].join("|"),
  "i"
);

// Words that only signal "public body" inside an EMPLOYER NAME (in a job
// title they'd misfire, e.g. "University Challenge Quiz Host").
const PUBLIC_SECTOR_COMPANY_ONLY = new RegExp(
  [
    String.raw`\buniversit(?:y|ies)\b`,
    String.raw`\bcolleges?\b`,
    String.raw`\bschool\b`,
    String.raw`\bacademy\b`,
    "academy trust",
    String.raw`\bnursery\b`,
    String.raw`\bhospital\b`,
    String.raw`\bhospice\b`,
  ].join("|"),
  "i"
);

export function classifySector(
  company: string | null,
  title: string
): Sector {
  const both = `${company ?? ""} ${title}`;
  if (GOVERNMENT_ANYWHERE.test(both)) return "government";
  if (company !== null && GOVERNMENT_COMPANY_ONLY.test(company)) {
    return "government";
  }
  if (PUBLIC_SECTOR_ANYWHERE.test(both)) return "public_sector";
  if (company !== null && PUBLIC_SECTOR_COMPANY_ONLY.test(company)) {
    return "public_sector";
  }
  return "private";
}

/** Back-compat boolean kept alongside the richer sector field. */
export function isGovernment(company: string | null, title: string): boolean {
  return classifySector(company, title) === "government";
}

// --- Experience level ----------------------------------------------------------
// HONEST LIMITATION: neither source exposes a structured experience level, so
// this is a best-effort classification from the job title.
const ENTRY_PATTERN =
  /\b(graduate|trainee|apprentice(?:ship)?|intern(?:ship)?|entry[ -]?level|junior|no experience|school leaver)\b/i;
const SENIOR_PATTERN = /\b(senior|lead|principal|head of|director|chief)\b/i;

export function classifyExperience(title: string): ExperienceLevel {
  if (ENTRY_PATTERN.test(title)) return "entry";
  if (SENIOR_PATTERN.test(title)) return "senior";
  return "mid";
}
