import "server-only";

// ============================================================================
//  NIGEL'S — ALWAYS-ON HALAL / HARAM + COMMISSION-ONLY EXCLUSION
//
//  This runs PERMANENTLY for every search, every source, and every tab. It is
//  applied in TWO places (fetch time, before storing; and read time, before
//  display) so nothing excluded can ever reach the screen. There is
//  deliberately NO setting, toggle, or option anywhere to turn it off, weaken
//  it, or disable a category — by design.
//
//  HONEST LIMITATION: this is heuristic keyword + employer matching. It is
//  strong and conservative (word-boundary matching plus carve-outs to avoid
//  false positives), but not mathematically perfect.
// ============================================================================

export interface ExcludableJob {
  title: string;
  company: string | null;
  description: string | null;
  industry?: string | null;
}

function haystack(job: ExcludableJob): string {
  return `${job.title} ${job.company ?? ""} ${job.industry ?? ""} ${job.description ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");
}

interface Category {
  name: string;
  /** If this matches, the category is skipped (protective carve-out). */
  carveOut?: RegExp;
  /** If this matches (and no carve-out did), the job is excluded. */
  pattern: RegExp;
}

// --- Halal / haram categories (order doesn't matter; any match excludes) -----
const CATEGORIES: Category[] = [
  {
    name: "banking_riba",
    // Sharia-compliant / Islamic finance and everyday non-finance uses of
    // "bank" (food bank, blood bank, etc.) are protected.
    carveOut:
      /\b(islamic|sharia|shariah|takaful)\b|al ?rayan|gatehouse bank|islamic finance|halal (?:finance|investment|mortgage|bank)|food ?bank|blood ?bank|bottle ?bank|data ?bank|bank holiday|river ?bank|piggy ?bank|seed ?bank|memory bank/,
    pattern: new RegExp(
      [
        String.raw`\bbank\b`,
        String.raw`\bbanking\b`,
        String.raw`\bbanker\b`,
        String.raw`\bmortgages?\b`,
        String.raw`\bloans?\b`,
        String.raw`\blending\b`,
        String.raw`\blender\b`,
        String.raw`\bpayday\b`,
        "hedge funds?",
        String.raw`\bbrokerage\b`,
        "stock ?broker",
        String.raw`\binsurance\b`,
        String.raw`\binsurer\b`,
        String.raw`\bunderwrit(?:er|ing|ers)\b`,
        String.raw`\bactuar(?:y|ial|ies)\b`,
        "building society",
        String.raw`\bbarclays\b`,
        String.raw`\bhsbc\b`,
        String.raw`\blloyds\b`,
        String.raw`\bnatwest\b`,
        String.raw`\bsantander\b`,
        String.raw`\bnationwide\b`,
        String.raw`\bhalifax\b`,
        "royal bank",
        String.raw`\brbs\b`,
        String.raw`\bmonzo\b`,
        String.raw`\bstarling\b`,
        String.raw`\brevolut\b`,
        "capital one",
        String.raw`\baviva\b`,
        String.raw`\baxa\b`,
        "legal (?:&|and) general",
        String.raw`\bprudential\b`,
        "direct line",
        "scottish widows",
        "standard life",
        "metro bank",
        String.raw`\btsb\b`,
      ].join("|"),
      "i"
    ),
  },
  {
    name: "alcohol",
    carveOut: /non[\s-]?alcoholic|alcohol[\s-]?free|alcohol (?:awareness|support|misuse|recovery|worker)/,
    pattern: new RegExp(
      [
        String.raw`\bbartender\b`,
        "bar staff",
        "bar manager",
        "bar supervisor",
        "bar team",
        String.raw`\bbarback\b`,
        String.raw`\bsommelier\b`,
        String.raw`\bmixologist\b`,
        String.raw`\bpub\b`,
        String.raw`\bbrewery\b`,
        String.raw`\bbrewer\b`,
        String.raw`\bdistillery\b`,
        String.raw`\bdistiller\b`,
        String.raw`\bwinery\b`,
        String.raw`\bwine\b`,
        String.raw`\bbeer\b`,
        String.raw`\bspirits\b`,
        String.raw`\bcocktail\b`,
        "off[\\s-]licence",
        "bottle shop",
        String.raw`\bnightclub\b`,
        "licensed premises",
        "wine merchant",
        String.raw`\bvodka\b`,
        String.raw`\bwhisk(?:y|ey)\b`,
        String.raw`\blager\b`,
      ].join("|"),
      "i"
    ),
  },
  {
    name: "gambling",
    // Video-game / software "game" roles are protected (gaming-in-the-
    // software-sense must not be caught).
    carveOut:
      /game (?:developer|designer|dev|programmer|artist|tester|producer|engineer)|games? (?:developer|designer|studio|programmer)|video ?game|game studio|gameplay|unity developer|unreal/,
    pattern: new RegExp(
      [
        String.raw`\bcasino\b`,
        String.raw`\bbetting\b`,
        String.raw`\bbookmakers?\b`,
        String.raw`\bgambling\b`,
        String.raw`\bwager(?:ing)?\b`,
        String.raw`\bpoker\b`,
        String.raw`\bbingo\b`,
        String.raw`\blottery\b`,
        String.raw`\bsportsbook\b`,
        "slot machine",
        "betting shop",
        String.raw`\bbet365\b`,
        "william hill",
        String.raw`\bladbrokes\b`,
        "paddy power",
        String.raw`\bbetfair\b`,
        "sky bet",
        String.raw`\bentain\b`,
        "gala bingo",
        "mecca bingo",
      ].join("|"),
      "i"
    ),
  },
  {
    name: "pork_non_halal",
    carveOut: /\bhalal\b/,
    pattern: new RegExp(
      [
        String.raw`\bpork\b`,
        String.raw`\bbacon\b`,
        String.raw`\bgammon\b`,
        String.raw`\bsausages?\b`,
        String.raw`\bcharcuterie\b`,
        "pig farm",
        "pig farming",
        "pork (?:production|processing)",
      ].join("|"),
      "i"
    ),
  },
  {
    name: "warehouse",
    pattern: new RegExp(
      [
        String.raw`\bwarehouse\b`,
        String.raw`\bwarehousing\b`,
        "warehouse operative",
        String.raw`\bpicker\b`,
        String.raw`\bpacker\b`,
        "pick (?:and|&) pack",
        "fulfilment (?:centre|operative)",
        "fulfillment (?:center|operative)",
        "distribution centre operative",
        "goods[\\s-]in operative",
      ].join("|"),
      "i"
    ),
  },
  {
    name: "retail_shop_floor",
    pattern: new RegExp(
      [
        "retail assistant",
        "shop assistant",
        "store assistant",
        "sales assistant",
        "retail sales assistant",
        "shop floor assistant",
        "customer assistant",
        String.raw`\bcashier\b`,
        String.raw`\bcheckout\b`,
        String.raw`\bsupermarket\b`,
      ].join("|"),
      "i"
    ),
  },
  {
    name: "adult_content",
    pattern: new RegExp(
      [
        "adult entertainment",
        "adult content",
        "adult film",
        "adult webcam",
        "webcam model",
        String.raw`\bstripper\b`,
        "exotic dancer",
        "escort agency",
        String.raw`\bbrothel\b`,
        "adult (?:store|shop)",
        "glamour model",
      ].join("|"),
      "i"
    ),
  },
];

// --- Commission-only -----------------------------------------------------------
// Permanent exclusion of roles with no real base pay. "Uncapped commission"
// ALONE is allowed (it usually sits on top of a base salary); only excluded
// when paired with a no-base signal.
const COMMISSION_ONLY = new RegExp(
  [
    "commission[\\s-]only",
    "100\\s*%\\s*commission",
    "commission[\\s-]based",
    "purely commission",
    "pure commission",
    "ote only",
    "ote[\\s-]only",
    "no basic salary",
    "no base salary",
    "nil basic",
    "self[\\s-]employed.{0,30}commission",
    "commission only role",
  ].join("|"),
  "i"
);

export interface ExclusionResult {
  excluded: boolean;
  reason: string | null;
}

/** The single shared exclusion check. Returns the matched category for tests. */
export function checkExclusion(job: ExcludableJob): ExclusionResult {
  const hay = haystack(job);

  for (const cat of CATEGORIES) {
    if (cat.carveOut && cat.carveOut.test(hay)) continue;
    if (cat.pattern.test(hay)) {
      return { excluded: true, reason: cat.name };
    }
  }

  // Commission-only checks title + description (pay terms live in the body).
  const payText = `${job.title} ${job.description ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (COMMISSION_ONLY.test(payText)) {
    return { excluded: true, reason: "commission_only" };
  }

  return { excluded: false, reason: null };
}

/** Convenience boolean used by the fetch-time and read-time gates. */
export function isExcluded(job: ExcludableJob): boolean {
  return checkExclusion(job).excluded;
}
