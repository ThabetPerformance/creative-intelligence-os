/** Date helpers. All engine dates are ISO calendar dates (YYYY-MM-DD) handled in UTC to avoid DST drift. */

const DAY_MS = 86_400_000;

export function toDayNumber(iso: string): number {
  return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS);
}

export function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

export function diffDays(a: string, b: string): number {
  return toDayNumber(a) - toDayNumber(b);
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** ISO week start (Monday) of a date. */
export function weekStart(iso: string): string {
  const n = toDayNumber(iso);
  const dow = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // 0 = Monday
  return fromDayNumber(n - dow);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function isoWeekLabel(iso: string): string {
  const d = new Date(toDayNumber(iso) * DAY_MS);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface DateWindow {
  from: string;
  to: string;
}

export function windowDays(w: DateWindow): number {
  return diffDays(w.to, w.from) + 1;
}

export function trailingWindow(asOf: string, days: number): DateWindow {
  return { from: addDays(asOf, -(days - 1)), to: asOf };
}

export function shiftWindow(w: DateWindow, days: number): DateWindow {
  return { from: addDays(w.from, days), to: addDays(w.to, days) };
}

export function previousEqualWindow(w: DateWindow): DateWindow {
  const len = windowDays(w);
  return shiftWindow(w, -len);
}
