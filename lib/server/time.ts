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
