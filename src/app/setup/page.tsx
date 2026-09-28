"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RosterTable } from "@/components/roster/RosterTable";
import { LeagueSettingsForm } from "@/components/settings/LeagueSettingsForm";
import { Button } from "@/components/ui/Button";
import { validateSettings } from "@/domain/settings";
import { useStore } from "@/state/store";

const STEPS = ["League & Lineup", "Add Roster", "Weekly Planner"];

export default function SetupPage() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(state.settings);
  const [errors, setErrors] = useState<string[]>([]);

  const next = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (errs.length) return;
    dispatch({ type: "settings/update", settings: draft });
    setStep(1);
  };

  const finish = () => {
    dispatch({ type: "setup/complete" });
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Set up your league</h1>
        <ol className="mt-3 flex gap-2 text-[13px]" aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
                i === step ? "border-brand bg-brand-soft font-semibold text-brand-strong" : i < step ? "border-line text-ink-2" : "border-line text-ink-3"
              }`}
            >
              <span className="tabular-nums">{i < step ? "✓" : i + 1}</span> {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? (
        <>
          <LeagueSettingsForm value={draft} onChange={setDraft} errors={errors} />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={finish}>
              Skip setup, use defaults
            </Button>
            <Button variant="primary" onClick={next}>
              Continue to roster
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]">
            <p className="text-ink-2">
              Add the players on your fantasy roster: name, NHL team and eligible positions. Their schedules fill in
              automatically. You can open the planner with a partial roster and add the rest later.
            </p>
            <p className="mt-1 font-medium tabular-nums" role="status">
              {state.roster.length === 0
                ? "No players added yet."
                : `${state.roster.length} ${state.roster.length === 1 ? "player" : "players"} added.`}
            </p>
          </div>
          <RosterTable />
          <div className="mt-5 flex justify-between gap-2">
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="primary" onClick={finish}>
              Open Weekly Planner
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
