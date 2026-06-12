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
  if (BIRMINGHAM_WORD.test(locationText)) return true;
  for (const match of locationText.matchAll(B_POSTCODE_PATTERN)) {
    if (isBirminghamPostcodeDistrict(Number(match[1]))) return true;
  }
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
