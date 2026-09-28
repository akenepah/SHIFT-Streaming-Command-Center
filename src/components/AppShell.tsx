"use client";

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
    if (needsSetup) router.replace("/setup");
  }, [needsSetup, router]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-nav text-nav-ink">
        <div className="flex h-14 items-center gap-16 px-6">
          <Link href={inSetup ? "/setup" : "/"} aria-label="SHIFT, Weekly Planner" className="shrink-0">
            <ShiftWordmark />
          </Link>
          {!inSetup && (
            <nav aria-label="Main" className="flex h-full items-center gap-2">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-10 items-center rounded-control px-4 text-body ${
                      active ? "font-semibold text-nav-ink" : "font-medium text-nav-ink-muted hover:bg-nav-hover hover:text-nav-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
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
