"use client";

import { Info, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddPlayerDialog } from "@/components/roster/PlayerDialogs";
import { RosterTable } from "@/components/roster/RosterTable";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Page";
import { startOfWeek, todayISO } from "@/domain/dates";
import { useStore } from "@/state/store";

export default function RosterPage() {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  // This page edits the base roster; planned moves only apply in the Weekly Planner. Say so, or the two look contradictory.
  const weekStart = startOfWeek(todayISO(), state.settings.weekStartsOn);
  const plannedCount = state.transactions.filter((t) => t.status === "PLANNED" && t.effectiveDate >= weekStart).length;
  return (
    <div className="mx-auto grid max-w-page gap-8 px-4 py-6 sm:px-10 sm:py-10">
      <PageHeader
        eyebrow={`${state.settings.leagueName} · ${state.settings.season.replace("-", "–")}`}
        title="Roster"
        subtitle={state.settings.teamName}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add Player
          </Button>
        }
      />
      {plannedCount > 0 && (
        <p className="-mt-4 flex items-start gap-2 rounded-control border border-line bg-surface-muted px-3 py-2 text-body-sm text-ink-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" />
          <span>
            This is your roster before planned moves. You have {plannedCount} planned {plannedCount === 1 ? "move" : "moves"}, which
            apply from their effective dates in the{" "}
            <Link href="/" className="font-medium text-primary-strong underline underline-offset-2">
              Weekly Planner
            </Link>
            .
          </span>
        </p>
      )}
      <RosterTable />
      <AddPlayerDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
