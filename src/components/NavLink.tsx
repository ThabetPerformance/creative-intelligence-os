"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const KEEP = ["range", "from", "to", "asOf", "cmp", "cfrom", "cto"];

/** Navigation link that carries the global period to the next page. */
export function NavLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = new URLSearchParams();
  for (const k of KEEP) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const qs = q.toString();
  return (
    <Link
      href={qs ? `${href}?${qs}` : href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${active ? "bg-ink text-white" : "text-ink-soft hover:bg-white"}`}
    >
      {children}
    </Link>
  );
}
