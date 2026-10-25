import "server-only";
import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, getPool, schema } from "@/lib/db/client";
import type { AccountSettingsInput, FatigueSensitivity, TargetRegime } from "@/engine/types";

export type Account = typeof schema.accounts.$inferSelect;
export type AccountSettings = typeof schema.accountSettings.$inferSelect;

export async function listAccounts() {
  return getDb().select().from(schema.accounts).orderBy(asc(schema.accounts.name));
}

export async function getAccount(id: string): Promise<{ account: Account; settings: AccountSettings; targets: (typeof schema.targetsHistory.$inferSelect)[] } | null> {
  const db = getDb();
  const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, id));
  if (!account) return null;
  const [settings] = await db.select().from(schema.accountSettings).where(eq(schema.accountSettings.accountId, id));
  const targets = await db.select().from(schema.targetsHistory).where(eq(schema.targetsHistory.accountId, id)).orderBy(asc(schema.targetsHistory.startDate));
  return { account, settings, targets };
}

export interface NewAccountInput {
  name: string;
  currency: string;
  timezone: string;
  targetRoas: number;
  cpoGuardrail: number | null;
  minPurchases?: number;
  minEvidenceSpend?: number;
  minDaysLive?: number;
  platforms?: string[];
  dataMode?: string;
}

export async function createAccount(input: NewAccountInput): Promise<string> {
  const id = randomUUID();
  const db = getDb();
  await db.insert(schema.accounts).values({
    id,
    name: input.name,
    currency: input.currency.toUpperCase(),
    timezone: input.timezone,
    platforms: input.platforms ?? ["meta"],
    dataMode: input.dataMode ?? process.env.DEFAULT_DATA_MODE ?? "FILE",
  });
  await db.insert(schema.accountSettings).values({
    accountId: id,
    targetRoas: input.targetRoas,
    cpoGuardrail: input.cpoGuardrail,
    minPurchases: input.minPurchases ?? 10,
    // starting heuristic: 3× the CPO guardrail when known, otherwise 300 in account currency
    minEvidenceSpend: input.minEvidenceSpend ?? (input.cpoGuardrail ? Math.round(input.cpoGuardrail * 3) : 300),
    minDaysLive: input.minDaysLive ?? 5,
  });
  return id;
}

export async function deleteAccount(id: string) {
  await getPool().query("DELETE FROM accounts WHERE id=$1", [id]);
}

export function toEngineSettings(account: Account, s: AccountSettings): AccountSettingsInput {
  return {
    currency: account.currency,
    targetRoas: s.targetRoas,
    cpoGuardrail: s.cpoGuardrail,
    grossMargin: s.grossMargin,
    minPurchases: s.minPurchases,
    minEvidenceSpend: s.minEvidenceSpend,
    evidenceSpendMultiple: s.evidenceSpendMultiple,
    minDaysLive: s.minDaysLive,
    freshnessWindowDays: s.freshnessWindowDays,
    fatigueSensitivity: (s.fatigueSensitivity as FatigueSensitivity) ?? "MEDIUM",
  };
}

export function toRegimes(t: (typeof schema.targetsHistory.$inferSelect)[]): TargetRegime[] {
  return t.map((r) => ({ startDate: r.startDate, endDate: r.endDate, targetRoas: r.targetRoas, cpoGuardrail: r.cpoGuardrail, optionalMargin: r.optionalMargin, notes: r.notes }));
}
