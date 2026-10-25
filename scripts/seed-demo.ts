import "./env";
/**
 * Seeds the synthetic demo account through the same server import pipeline as the UI.
 * Usage: npm run seed:demo   (requires DATABASE_URL)
 */
import { generateDemo } from "../src/demo/generator";
import { createAccount } from "../src/server/accounts";
import { demoToSheets, importSheets } from "../src/server/workbook-import";
import { recalculateAccount } from "../src/server/snapshots";
import { getPool } from "../src/lib/db/client";

async function main() {
  const t0 = Date.now();
  const d = generateDemo();
  const id = await createAccount({ name: String(d.config.brand_name), currency: "USD", timezone: "UTC", targetRoas: 2.5, cpoGuardrail: 28, platforms: ["meta", "tiktok", "snapchat"] });
  const out = await importSheets(id, "USD", demoToSheets(d), "Creative_Intelligence_DEMO (seed script)", { applyConfig: true });
  const rc = await recalculateAccount(id);
  console.log(JSON.stringify({ accountId: id, status: out.status, imported: out.imported, rejected: out.rejected, recalculate: rc, ms: Date.now() - t0 }, null, 2));
  await getPool().end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
