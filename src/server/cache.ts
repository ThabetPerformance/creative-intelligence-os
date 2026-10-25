import "server-only";

/**
 * Per-instance LRU cache for analysis results. Keys include the account's data_version, so any
 * import or recalculation invalidates naturally. Page renders never call external APIs.
 */
const MAX = 24;
const store = new Map<string, { at: number; value: unknown }>();
const TTL = 10 * 60 * 1000;

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > TTL) {
    store.delete(key);
    return undefined;
  }
  store.delete(key);
  store.set(key, e);
  return e.value as T;
}

export function cacheSet(key: string, value: unknown) {
  store.set(key, { at: Date.now(), value });
  while (store.size > MAX) store.delete(store.keys().next().value as string);
}

export function invalidateAccount(accountId: string) {
  for (const k of [...store.keys()]) if (k.startsWith(`${accountId}|`)) store.delete(k);
}

const inflight = new Map<string, Promise<unknown>>();
export async function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn()
    .then((v) => {
      cacheSet(key, v);
      return v;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
