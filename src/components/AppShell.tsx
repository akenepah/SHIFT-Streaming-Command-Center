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
  const { state, hydrated, loadStatus, removedDemoPlayers, activeWorkspaceId } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const inSetup = pathname.startsWith("/setup");
  const needsSetup = hydrated && !state.setupComplete && !inSetup;

  useEffect(() => {
    if (needsSetup) router.replace("/setup?step=1");
    else if (hydrated && state.setupComplete && inSetup) router.replace("/");
  }, [needsSetup, router, hydrated, state.setupComplete, inSetup]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href={pathname === "/" ? "#week-grid" : "#main-content"}
        onClick={(e) => {
          const target = document.getElementById(pathname === "/" ? "week-grid" : "main-content") ?? document.getElementById("main-content");
          if (!target) return;
          e.preventDefault();
          target.focus();
          target.scrollIntoView({ block: "start" });
        }}
        className="sr-only z-50 rounded-control bg-surface px-4 py-3 font-semibold text-primary-strong focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:shadow-popover"
      >
        {pathname === "/" ? "Skip to week grid" : "Skip to main content"}
      </a>

      <header className="sticky top-0 z-30 border-b border-nav-ink/10 bg-nav text-nav-ink">
        <div className="flex min-h-14 flex-wrap items-center gap-x-6 px-4 sm:min-h-16 sm:px-6">
          <Link href={state.setupComplete ? "/" : "/setup?step=1"} aria-label="SHIFT, Weekly Planner" className="shrink-0">
            <ShiftWordmark />
          </Link>

          {!inSetup && (
            <nav aria-label="Main" className="order-last flex w-full items-center gap-5 border-t border-nav-ink/10 sm:order-none sm:w-auto sm:border-0">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center border-b-2 text-body-sm transition-colors sm:min-h-16 sm:text-body ${
                      active
                        ? "border-nav-accent font-semibold text-nav-ink"
                        : "border-transparent font-medium text-nav-ink-muted hover:text-nav-ink"
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
          Saved data couldn&apos;t be read, so the app started fresh. A copy of the unreadable data was kept in browser storage.
        </div>
      )}
      {loadStatus === "migrated" && removedDemoPlayers > 0 && (
        <div role="status" className="border-b border-line bg-secondary-soft px-6 py-2.5 text-body-sm text-secondary">
          This version no longer includes the sample roster. {removedDemoPlayers} sample players were removed. Players you created or edited were kept.
        </div>
      )}

      <main key={activeWorkspaceId ?? "no-team"} id="main-content" tabIndex={-1} className="w-full flex-1 focus:outline-none">
        {hydrated && !needsSetup ? children : <p className="px-6 py-6 text-body text-ink-3">Loading…</p>}
      </main>
    </div>
  );
}
