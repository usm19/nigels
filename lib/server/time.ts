import "server-only";

// Birmingham runs on Europe/London time; the server (Render) runs on UTC.
// Date-only posting dates are judged against London's calendar, not UTC's.

const LONDON_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in London as "YYYY-MM-DD". */
export function londonTodayYmd(): string {
  return LONDON_DATE.format(new Date());
}

/**
 * Normalise an instant to midnight UTC of ITS Europe/London calendar date,
 * e.g. "2026-06-13T00:30:00+01:00" (00:30 London) → "2026-06-13T00:00:00.000Z".
 * Date-only stamps across Nigel's are stored this way (see reed.ts), so the UTC
 * date parts equal the London date. Demoting an Adzuna timestamp to date-only
 * must use this, or a BST job in the 00:00–01:00 window lands on the previous
 * UTC day and is wrongly dropped/mis-displayed.
 */
export function londonDateMidnightUtcIso(instantIso: string): string | null {
  const ms = Date.parse(instantIso);
  if (Number.isNaN(ms)) return null;
  return `${LONDON_DATE.format(new Date(ms))}T00:00:00.000Z`;
}

/** Days since epoch for London's current calendar date. */
export function londonTodayEpochDays(): number {
  return Math.floor(Date.parse(`${londonTodayYmd()}T00:00:00.000Z`) / 86_400_000);
}

/**
 * The cutoff timestamp for date-only jobs: anything stored before London's
 * midnight today (i.e. dated yesterday or earlier) is past the 24-hour rule.
 */
export function londonTodayStartIso(): string {
  return `${londonTodayYmd()}T00:00:00.000Z`;
}

const LONDON_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Minutes Europe/London is ahead of UTC at a given instant (+60 in BST, 0 in GMT). */
function londonOffsetMinutes(instantMs: number): number {
  const parts = LONDON_PARTS.formatToParts(new Date(instantMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return Math.round((localAsUtc - instantMs) / 60_000);
}

/**
 * Convert a timestamp whose wall-clock components are Europe/London local time
 * into the true UTC instant (ISO string).
 *
 * Adzuna returns `created` as London wall-clock time but suffixes it with "Z"
 * (e.g. "2026-06-12T17:04:13Z" when the real UTC instant is 16:04:13Z during
 * BST). Parsing that as UTC pushes fresh jobs ~1 hour into the future, which
 * the age display floors to "just now". Re-interpreting the wall clock as
 * London local fixes it year-round (−1h in BST, −0h in GMT).
 */
export function londonWallClockToUtcIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    value.trim()
  );
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const wallAsUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0")
  );
  if (Number.isNaN(wallAsUtc)) return null;
  // London = UTC + offset, so the true UTC instant = wallClock − offset.
  const trueUtcMs = wallAsUtc - londonOffsetMinutes(wallAsUtc) * 60_000;
  return new Date(trueUtcMs).toISOString();
}
