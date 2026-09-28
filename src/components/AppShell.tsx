"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { initials } from "@/components/player/PlayerBits";
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
        <div className="flex h-16 items-center gap-10 px-6">
          <Link href={inSetup ? "/setup" : "/"} className="shrink-0 leading-tight">
            <span className="block font-display text-body font-bold tracking-wide">SHIFT</span>
            <span className="block text-overline uppercase text-nav-ink-muted">Streaming Command Center</span>
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
                    className={`relative flex h-11 items-center rounded-control px-4 text-body font-medium ${
                      active
                        ? "bg-nav-active text-nav-ink after:absolute after:inset-x-3 after:-bottom-0.5 after:h-0.5 after:rounded-pill after:bg-nav-accent"
                        : "text-nav-ink-muted hover:bg-nav-active/60 hover:text-nav-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-pill border border-nav-active px-2.5 py-0.5 text-caption text-nav-ink-muted">
              Private alpha
            </span>
            {!inSetup && hydrated && (
              <Link
                href="/settings"
                className="flex h-11 items-center gap-2.5 rounded-control px-2 hover:bg-nav-active/60"
                title="League Settings"
              >
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-pill bg-nav-accent text-caption font-semibold text-white"
                >
                  {initials(state.settings.teamName)}
                </span>
                <span className="max-w-48 truncate text-body font-medium">{state.settings.teamName}</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      {loadStatus === "corrupt" && (
        <div role="alert" className="border-b border-warn-line bg-warn-soft px-6 py-2.5 text-body-sm text-warn-strong">
          Saved data couldn&apos;t be read, so the app started fresh. A copy of the unreadable data was kept in browser
          storage.
        </div>
      )}
      {loadStatus === "migrated" && removedDemoPlayers > 0 && (
        <div role="status" className="border-b border-line bg-info-soft px-6 py-2.5 text-body-sm text-primary-strong">
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
