/**
 * Optional shared-password gate (spec §103). Session cookies are HMAC-signed with
 * APP_ENCRYPTION_KEY using Web Crypto, so the same code runs in the proxy and in route handlers.
 */
export const SESSION_COOKIE = "cios_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

export function gateEnabled(): boolean {
  return !!process.env.APP_ACCESS_PASSWORD;
}

function secret(): string {
  return process.env.APP_ENCRYPTION_KEY || process.env.APP_ACCESS_PASSWORD || "";
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  return { value: `${exp}.${await hmac(exp)}`, maxAge: MAX_AGE_S };
}

export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  return safeEqual(sig, await hmac(exp));
}

export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.APP_ACCESS_PASSWORD ?? "";
  if (!expected) return false;
  // compare HMACs so timing does not leak the password length or content
  return safeEqual(await hmac(`pw:${input}`), await hmac(`pw:${expected}`));
}
