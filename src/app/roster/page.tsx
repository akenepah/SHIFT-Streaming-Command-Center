"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AddPlayerDialog } from "@/components/roster/PlayerDialogs";
import { RosterTable } from "@/components/roster/RosterTable";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Page";
import { useStore } from "@/state/store";

export default function RosterPage() {
  const { state } = useStore();
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto grid max-w-page gap-8 px-10 py-10">
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
      <RosterTable />
      <AddPlayerDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
