"use client";

import { useRouter } from "next/navigation";

export function AccountSwitcher({ accounts, current }: { accounts: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  return (
    <select
      className="input w-full py-1 text-[13px] font-medium"
      value={current}
      onChange={(e) => {
        if (e.target.value === "__new") router.push("/accounts#create");
        else router.push(`/a/${e.target.value}/command-center`);
      }}
      aria-label="Account"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      <option value="__new">+ Create new account</option>
    </select>
  );
}
