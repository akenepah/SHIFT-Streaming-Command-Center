"use client";

import { AccountControl } from "@/components/auth/AccountControl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ShiftWordmark } from "@/components/ui/ShiftMark";
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
    if (needsSetup) router.replace("/setup?step=1");
    else if (hydrated && state.setupComplete && inSetup) router.replace("/");
  }, [needsSetup, router, hydrated, state.setupComplete, inSetup]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-nav text-nav-ink">
        <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 sm:gap-8 sm:px-6">
          <Link href={state.setupComplete ? "/" : "/setup?step=1"} aria-label="SHIFT, Weekly Planner" className="shrink-0">
            <ShiftWordmark />
          </Link>
          {!inSetup && (
            <nav aria-label="Main" className="flex max-w-full items-center gap-0 overflow-x-auto sm:gap-2">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-10 items-center rounded-control px-2 text-body-sm sm:px-4 sm:text-body ${
                      active ? "font-semibold text-nav-ink" : "font-medium text-nav-ink-muted hover:bg-nav-hover hover:text-nav-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <AccountControl />
        </div>
      </header>
      {loadStatus === "corrupt" && (
        <div role="alert" className="border-b border-warn-line bg-warn-soft px-6 py-2.5 text-body-sm text-warn-strong">
          Saved data couldn&apos;t be read, so the app started fresh. A copy of the unreadable data was kept in browser
          storage.
        </div>
      )}
      {loadStatus === "migrated" && removedDemoPlayers > 0 && (
        <div role="status" className="border-b border-line bg-secondary-soft px-6 py-2.5 text-body-sm text-secondary">
          This version no longer includes the sample roster. {removedDemoPlayers} sample players were removed. Players you
          created or edited were kept.
        </div>
      )}
      <main className="w-full flex-1">
        {hydrated && !needsSetup ? children : <p className="px-6 py-6 text-body text-ink-3">Loading…</p>}
      </main>
    </div>
  );
}
