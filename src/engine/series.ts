import { addDayToAgg, emptyAgg, FIELD_COUNT, type Agg, type DayRow } from "./metrics";
import { toDayNumber, type DateWindow } from "./dates";

/**
 * Daily series of one creative with prefix sums, so any window aggregate is O(log n).
 * Only active (reported) days are stored; gaps are simply absent days.
 */
export class CreativeSeries {
  readonly rows: DayRow[];
  readonly dayNums: Int32Array;
  private readonly prefix: Float64Array; // (n + 1) * FIELD_COUNT

  constructor(rows: DayRow[]) {
    this.rows = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const n = this.rows.length;
    this.dayNums = new Int32Array(n);
    this.prefix = new Float64Array((n + 1) * FIELD_COUNT);
    const scratch = emptyAgg();
    for (let i = 0; i < n; i++) {
      this.dayNums[i] = toDayNumber(this.rows[i].date);
      scratch.fill(0);
      addDayToAgg(scratch, this.rows[i]);
      const base = i * FIELD_COUNT;
      const next = (i + 1) * FIELD_COUNT;
      for (let f = 0; f < FIELD_COUNT; f++) this.prefix[next + f] = this.prefix[base + f] + scratch[f];
    }
  }

  get length(): number {
    return this.rows.length;
  }

  get firstDate(): string | null {
    return this.rows[0]?.date ?? null;
  }

  get lastDate(): string | null {
    return this.rows[this.rows.length - 1]?.date ?? null;
  }

  /** First spend date (> 0). */
  firstSpendDate(): string | null {
    for (const r of this.rows) if (r.spend > 0) return r.date;
    return null;
  }

  lastSpendDate(upTo?: string): string | null {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i];
      if (upTo && r.date > upTo) continue;
      if (r.spend > 0) return r.date;
    }
    return null;
  }

  /** Index of first row with dayNum >= d. */
  lowerBound(d: number): number {
    let lo = 0;
    let hi = this.dayNums.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.dayNums[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Aggregate over rows with index in [i, j). */
  aggIndex(i: number, j: number, out?: Agg): Agg {
    const a = out ?? emptyAgg();
    const bi = i * FIELD_COUNT;
    const bj = j * FIELD_COUNT;
    for (let f = 0; f < FIELD_COUNT; f++) a[f] = this.prefix[bj + f] - this.prefix[bi + f];
    return a;
  }

  /** Aggregate over an inclusive date window. */
  agg(w: DateWindow, out?: Agg): Agg {
    const i = this.lowerBound(toDayNumber(w.from));
    const j = this.lowerBound(toDayNumber(w.to) + 1);
    return this.aggIndex(i, Math.max(i, j), out);
  }

  /** Aggregate by day numbers (inclusive). */
  aggDays(fromDay: number, toDay: number, out?: Agg): Agg {
    const i = this.lowerBound(fromDay);
    const j = this.lowerBound(toDay + 1);
    return this.aggIndex(i, Math.max(i, j), out);
  }

  /** Single field sum over day numbers (inclusive) without allocating. */
  sumField(field: number, fromDay: number, toDay: number): number {
    const i = this.lowerBound(fromDay);
    const j = Math.max(i, this.lowerBound(toDay + 1));
    return this.prefix[j * FIELD_COUNT + field] - this.prefix[i * FIELD_COUNT + field];
  }

  rowsIn(w: DateWindow): DayRow[] {
    const i = this.lowerBound(toDayNumber(w.from));
    const j = this.lowerBound(toDayNumber(w.to) + 1);
    return this.rows.slice(i, j);
  }
}
