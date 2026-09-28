"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddPlayerDialog } from "@/components/roster/PlayerDialogs";
import { RosterTable } from "@/components/roster/RosterTable";
import {
  LeagueTeamFields,
  LineupSlotFields,
  LineupSummary,
  RulesFields,
} from "@/components/settings/LeagueSettingsForm";
import { Button } from "@/components/ui/Button";
import { ErrorList } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { useToast } from "@/components/ui/Toast";
import { validateSettings } from "@/domain/settings";
import { rosterSummary } from "@/state/selectors";
import { useStore } from "@/state/store";

const STEPS = ["League & lineup", "Add your roster"];

function StepIndicator({ step, onSelect }: { step: number; onSelect: (i: number) => void }) {
  return (
    <ol aria-label="Setup steps" className="flex gap-4">
      {STEPS.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            aria-current={i === step ? "step" : undefined}
            onClick={() => onSelect(i)}
            disabled={i > step}
            className={`flex h-11 min-w-48 items-center justify-center gap-2 rounded-control border px-5 text-body font-semibold ${
              i === step ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink disabled:cursor-default"
            }`}
          >
            <span className="tabular-nums">{i + 1}</span> {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function SetupPage() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(state.settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const next = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (errs.length) return;
    dispatch({ type: "settings/update", settings: draft });
    setStep(1);
  };

  const finish = () => {
    dispatch({ type: "setup/complete" });
    toast("Setup complete. Your planner is ready.");
    router.push("/");
  };

  if (step === 0) {
    return (
      <div className="mx-auto max-w-page px-10 py-10">
        <PageHeader title="Set up your league" subtitle="Set your roster rules once. Start planning your week." />
        <div className="mt-6">
          <StepIndicator step={step} onSelect={setStep} />
        </div>
        <div className="mt-6 layout-form-rail">
          <section className="rounded-panel border border-line bg-surface p-6">
            <h2 className="font-display text-section-title text-ink">League &amp; lineup</h2>
            <div className="mt-6 grid gap-6">
              <LeagueTeamFields value={draft} onChange={setDraft} withSeason />
              <div>
                <h3 className="mb-4 text-body font-semibold text-ink">Daily lineup slots</h3>
                <LineupSlotFields value={draft} onChange={setDraft} />
              </div>
              <RulesFields value={draft} onChange={setDraft} timingLabel="Default move timing" />
              <ErrorList errors={errors} />
              <div>
                <Button variant="primary" className="min-w-56" onClick={next}>
                  Continue to roster <ArrowRight aria-hidden />
                </Button>
              </div>
            </div>
          </section>
          <LineupSummary value={draft} title="Your weekly planner" variant="setup" />
        </div>
      </div>
    );
  }

  const summary = rosterSummary(state.roster, state.settings);
  return (
    <div className="mx-auto grid max-w-page gap-8 px-10 py-10">
      <PageHeader
        title="Add your roster"
        subtitle={`Step 2 of 2 · ${state.settings.leagueName} · ${summary.regular} / ${summary.regularCapacity} rostered · ${summary.irPlus} / ${summary.irPlusCapacity} IR+`}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add Player
          </Button>
        }
      />
      <p className="-mt-4 text-body text-ink-2">
        Add each player&apos;s name, NHL team and eligible positions. You can open the planner with a partial roster and
        add the rest later.
      </p>
      <RosterTable />
      <div className="flex gap-3">
        <Button className="min-w-28" onClick={() => setStep(0)}>
          Back
        </Button>
        <Button variant="primary" className="min-w-56" onClick={finish}>
          Open Weekly Planner
        </Button>
      </div>
      <AddPlayerDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
