import "server-only";

// --- Birmingham gate -------------------------------------------------------
// This is location-TEXT matching, not council-boundary matching. Two clues
// count as Birmingham:
//  1. The word "Birmingham" anywhere in the location text.
//  2. A postcode in a district that belongs to Birmingham city — Reed often
//     returns raw postcodes like "B4 6AJ" or "B46AJ" instead of a town name.
//     The wider "B" postcode area also covers Solihull (B90s), Bromsgrove
//     (B60s), West Bromwich (B70/71) etc., so only genuine Birmingham
//     districts are accepted: B1–B21, B23–B38, B42–B45 and Sutton
//     Coldfield's B72–B76.
// Combined with the small search radius passed to both APIs, this keeps
// results firmly within Birmingham.
const BIRMINGHAM_WORD = /\bbirmingham\b/i;
const B_POSTCODE_PATTERN = /\bB(\d{1,2})\s?(?:\d[A-Z]{2})?\b/gi;
// There are Birminghams in the USA (Alabama, Michigan). The aggregator
// sources (Jooble, JSearch) can occasionally surface them, so any clear
// non-UK signal vetoes the match.
const NON_UK = /\balabama\b|\bmichigan\b|united states|\bu\.?s\.?a\.?\b/i;

function isBirminghamPostcodeDistrict(district: number): boolean {
  return (
    (district >= 1 && district <= 21) ||
    (district >= 23 && district <= 38) ||
    (district >= 42 && district <= 45) ||
    (district >= 72 && district <= 76)
  );
}

export function isBirminghamLocation(
  locationText: string | null | undefined
): boolean {
  if (!locationText) return false;
  if (NON_UK.test(locationText)) return false;
  if (BIRMINGHAM_WORD.test(locationText)) return true;
  for (const match of locationText.matchAll(B_POSTCODE_PATTERN)) {
    if (isBirminghamPostcodeDistrict(Number(match[1]))) return true;
  }
  return false;
}

/**
 * Birmingham gate for the aggregator sources (Jooble, JSearch) whose
 * structured location field is sparse or vague.
 *
 * The postcode-district heuristic is applied ONLY to the location text —
 * tokens like "B12" (vitamin), "B2B", "B7" appear constantly in titles and
 * descriptions and must NOT be read as Birmingham postcodes. The literal word
 * "Birmingham" is accepted in the location OR the title. The non-UK veto runs
 * on the location only (a UK job whose advert mentions "USA" is still UK).
 * Descriptions are deliberately not used — too noisy to be a reliable signal.
 */
export function mentionsBirmingham(
  location: string | null | undefined,
  title: string | null | undefined
): boolean {
  // location: full strength (word OR postcode district), with non-UK veto.
  if (isBirminghamLocation(location)) return true;
  // title: only the explicit word counts (no postcode-token matching).
  if (title && !NON_UK.test(title) && BIRMINGHAM_WORD.test(title)) return true;
  return false;
}

// --- Remote / hybrid detection ---------------------------------------------
// Neither API offers a reliable remote/hybrid flag, so this is best-effort
// keyword matching on the title + description, as agreed.
const REMOTE_PATTERN =
  /\bremote\b|work(?:ing)?\s+from\s+home|\bwfh\b|home[\s-]?based|home[\s-]?working/i;
const HYBRID_PATTERN = /\bhybrid\b/i;

export function detectRemote(text: string): boolean {
  return REMOTE_PATTERN.test(text);
}

export function detectHybrid(text: string): boolean {
  return HYBRID_PATTERN.test(text);
}
