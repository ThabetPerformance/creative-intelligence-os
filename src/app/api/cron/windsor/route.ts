import { windsorConfigured } from "@/windsor/client";
import { refreshRecent, stepBackfill, windsorAccounts } from "@/windsor/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily Windsor job (vercel.json cron). Requires Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!windsorConfigured()) return Response.json({ skipped: "WINDSOR_API_KEY not set" });
  const started = Date.now();
  const out: Record<string, unknown> = {};
  for (const id of await windsorAccounts()) {
    if (Date.now() - started > 45_000) {
      out[id] = "deferred (time budget)";
      continue;
    }
    try {
      const step = await stepBackfill(id, 20_000);
      const refresh = step.done ? await refreshRecent(id, 3) : null;
      out[id] = { backfill: step, refresh };
    } catch (e) {
      out[id] = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  return Response.json({ ok: true, accounts: out });
}
