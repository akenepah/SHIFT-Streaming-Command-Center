"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useStore } from "@/state/store";

const NAV = [
  { href: "/", label: "Weekly Planner" },
  { href: "/roster", label: "Roster" },
  { href: "/settings", label: "League Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { state, hydrated, loadStatus, removedDemoPlayers } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const inSetup = pathname.startsWith("/setup");
  const needsSetup = hydrated && !state.setupComplete && !inSetup;

  // First run (or after a reset): walk through setup before the planner.
  useEffect(() => {
    if (needsSetup) router.replace("/setup");
  }, [needsSetup, router]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-nav text-white">
        <div className="mx-auto flex h-14 max-w-[1920px] items-center gap-8 px-6">
          <Link href="/" className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">SHIFT</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Streaming Command Center
            </span>
          </Link>
          {!inSetup && (
            <nav aria-label="Main" className="flex gap-1">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${
                      active ? "bg-nav-2 text-white" : "text-slate-300 hover:bg-nav-2/60 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <span className="ml-auto rounded bg-nav-2 px-2 py-0.5 text-[11px] font-medium text-slate-300">
            Private alpha
          </span>
        </div>
      </header>
      {loadStatus === "corrupt" && (
        <div role="alert" className="border-b border-warn-line bg-warn-soft px-6 py-2 text-[13px] text-warn-strong">
          Saved data couldn&apos;t be read, so the app started fresh. A copy of the unreadable data was kept in browser
          storage.
        </div>
      )}
      {loadStatus === "migrated" && removedDemoPlayers > 0 && (
        <div role="status" className="border-b border-brand/30 bg-brand-soft px-6 py-2 text-[13px] text-brand-strong">
          This version no longer includes the sample roster. {removedDemoPlayers} sample players were removed. Players you
          created or edited were kept.
        </div>
      )}
      <main className="mx-auto w-full max-w-[1920px] flex-1 px-6 py-6">
        {hydrated && !needsSetup ? children : <p className="text-ink-3">Loading…</p>}
      </main>
    </div>
  );
}
