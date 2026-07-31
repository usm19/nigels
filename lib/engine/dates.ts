// Date-only arithmetic on ISO strings, immune to timezones and DST.

import type { ISODate } from "./types";

export function parseISO(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) throw new Error(`Invalid ISO date: ${d}`);
  return { y, m, day };
}

function toUTC(d: ISODate): number {
  const { y, m, day } = parseISO(d);
  return Date.UTC(y, m - 1, day);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: ISODate, days: number): ISODate {
  return fromUTC(toUTC(d) + days * 86_400_000);
}

/**
 * Add calendar months, clamping to the last day of the target month
 * (e.g. 31 Jan + 1 month = 28/29 Feb).
 */
export function addMonths(d: ISODate, months: number): ISODate {
  const { y, m, day } = parseISO(d);
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return fromUTC(Date.UTC(targetYear, targetMonth, clamped));
}

/** a <= b */
export function onOrBefore(a: ISODate, b: ISODate): boolean {
  return toUTC(a) <= toUTC(b);
}

/** a < b */
export function before(a: ISODate, b: ISODate): boolean {
  return toUTC(a) < toUTC(b);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}
