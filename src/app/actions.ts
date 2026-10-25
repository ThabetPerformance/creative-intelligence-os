"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAccount, deleteAccount } from "@/server/accounts";
import { generateDemo } from "@/demo/generator";
import { demoToSheets, importSheets } from "@/server/workbook-import";
import { invalidateAccount } from "@/server/cache";

const NewAccount = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(1).max(64),
  targetRoas: z.coerce.number().positive(),
  cpoGuardrail: z.union([z.literal("").transform(() => null), z.coerce.number().positive()]),
  minPurchases: z.coerce.number().int().min(1).max(10000),
  minDaysLive: z.coerce.number().int().min(0).max(90),
  platforms: z.array(z.string()).default([]),
});

export async function createAccountAction(form: FormData) {
  const parsed = NewAccount.parse({
    name: form.get("name"),
    currency: form.get("currency"),
    timezone: form.get("timezone") || "UTC",
    targetRoas: form.get("targetRoas"),
    cpoGuardrail: form.get("cpoGuardrail") ?? "",
    minPurchases: form.get("minPurchases") || 10,
    minDaysLive: form.get("minDaysLive") || 5,
    platforms: form.getAll("platforms").map(String),
  });
  const id = await createAccount({ ...parsed, platforms: parsed.platforms.length ? parsed.platforms : ["meta"] });
  redirect(`/a/${id}/import`);
}

export async function createDemoAccountAction() {
  const d = generateDemo();
  const id = await createAccount({ name: String(d.config.brand_name), currency: "USD", timezone: "UTC", targetRoas: 2.5, cpoGuardrail: 28, platforms: ["meta", "tiktok", "snapchat"] });
  await importSheets(id, "USD", demoToSheets(d), "Creative_Intelligence_DEMO (server-generated)", { applyConfig: true });
  redirect(`/a/${id}/command-center`);
}

export async function deleteAccountAction(form: FormData) {
  const id = String(form.get("id"));
  if (form.get("confirm") !== "DELETE") throw new Error("Type DELETE to confirm.");
  await deleteAccount(id);
  invalidateAccount(id);
  revalidatePath("/accounts");
  redirect("/accounts");
}
