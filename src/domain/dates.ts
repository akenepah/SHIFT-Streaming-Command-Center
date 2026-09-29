/**
 * Date helpers.
 *
 * Every date is an NHL calendar-date string "YYYY-MM-DD". Arithmetic runs on
 * UTC midnight timestamps and formats back with UTC getters, so neither the
 * browser's time zone nor DST can shift a date. "Today" is read from the
 * user's local wall clock (see todayISO).
 */

import type { ISODate } from "./types";

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUTC(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

/** First day of the fantasy week containing `date`. */
export function startOfWeek(date: ISODate, weekStartsOn = 1): ISODate {
  const offset = (dayOfWeek(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export function weekDates(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

/** The user's local calendar date (not UTC). */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const da = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDayShort(date: ISODate): string {
  return DOW_SHORT[dayOfWeek(date)];
}

export function formatDayLong(date: ISODate): string {
  return DOW_LONG[dayOfWeek(date)];
}

export function formatMonthDay(date: ISODate): string {
  const [, m, d] = date.split("-");
  return `${MONTH_SHORT[+m - 1]} ${+d}`;
}

export function formatWeekRange(weekStart: ISODate): string {
  return `${formatMonthDay(weekStart)} – ${formatMonthDay(addDays(weekStart, 6))}`;
}

export function weekdayName(dayIndex: number): string {
  return DOW_LONG[((dayIndex % 7) + 7) % 7];
}
