/** Small, dependency-free statistics helpers. Null / non-finite values are ignored. */

export function clean(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function median(values: (number | null | undefined)[]): number | null {
  const v = clean(values).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mean(values: (number | null | undefined)[]): number | null {
  const v = clean(values);
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export function quantile(values: (number | null | undefined)[], q: number): number | null {
  const v = clean(values).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Percentile rank of x within a sorted reference array (0..1, mid-rank for ties). */
export function percentileRank(sortedRef: number[], x: number | null): number | null {
  if (x === null || !Number.isFinite(x) || sortedRef.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of sortedRef) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return (below + equal / 2) / sortedRef.length;
}

export function sortedNumbers(values: (number | null | undefined)[]): number[] {
  return clean(values).sort((a, b) => a - b);
}

/** Ordinary least squares slope of y on x. */
export function olsSlope(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((s, x) => s + x, 0) / values.length;
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1));
}

export function sum(values: (number | null | undefined)[]): number {
  return clean(values).reduce((s, x) => s + x, 0);
}
