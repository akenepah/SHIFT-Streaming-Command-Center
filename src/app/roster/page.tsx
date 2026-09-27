"use client";

import { RosterTable } from "@/components/roster/RosterTable";
import { useStore } from "@/state/store";

export default function RosterPage() {
  const { state } = useStore();
  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Roster</h1>
        <p className="mt-1 text-ink-2">
          {state.settings.teamName} · {state.settings.leagueName}. Keep this in sync with your fantasy league. The
          planner works out who plays each day.
        </p>
      </div>
      <RosterTable />
    </div>
  );
}
