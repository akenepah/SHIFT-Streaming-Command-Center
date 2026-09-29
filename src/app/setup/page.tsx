"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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
    <ol aria-label="Setup steps" className="flex flex-wrap gap-3">
      {STEPS.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            aria-current={i === step ? "step" : undefined}
            onClick={() => onSelect(i)}
            disabled={i > step}
            className={`flex h-11 min-w-0 items-center justify-center gap-2 rounded-control border px-5 text-body font-semibold ${
              i === step ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-3"
            }`}
          >
            {i < step ? <Check aria-hidden className="size-4 text-success" /> : null}
            <span className="tabular-nums">{i + 1}</span> {label}
            {i < step && <span className="sr-only">(complete)</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}

export default function SetupPage() {
  return <Suspense fallback={<p>Loading setup…</p>}><SetupFlow /></Suspense>;
}

function SetupFlow() {
  const { state, dispatch, creatingWorkspace, cancelNewWorkspace } = useStore();
  // "Add another team": a new, separate workspace. Cancel returns to the previous team; nothing was saved.
  const cancelNewTeam = async () => {
    await cancelNewWorkspace();
    router.push("/");
  };
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const step = params.get("step") === "2" ? 1 : 0;
  const setStep = (n: number) => router.push(`/setup?step=${n + 1}`);
  const [draft, setDraft] = useState(state.settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const next = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (errs.length) { requestAnimationFrame(() => (document.querySelector("[aria-invalid=true]") as HTMLElement | null)?.focus()); return; }
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
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-10">
        <PageHeader
          eyebrow={creatingWorkspace ? "Add another team" : "Get started"}
          title={creatingWorkspace ? "Set up your new team" : "Set up your league"}
          subtitle={creatingWorkspace ? "A separate team with its own league settings, roster and moves. Your other teams stay as they are." : "Set your roster rules once. Start planning your week."}
          actions={creatingWorkspace ? <Button onClick={() => void cancelNewTeam()}>Cancel</Button> : undefined}
        />
        <div className="mt-6">
          <StepIndicator step={step} onSelect={setStep} />
        </div>
        <div className="mt-6 layout-form-rail">
          <section className="rounded-panel border border-line bg-surface p-6">
            <h2 className="font-display text-section-title text-ink">League &amp; lineup</h2>
            <div className="mt-6 grid gap-6">
              <LeagueTeamFields showErrors={errors.length > 0} value={draft} onChange={setDraft} withSeason />
              <div>
                <h3 className="mb-4 text-body font-semibold text-ink">Daily lineup slots</h3>
                <LineupSlotFields value={draft} onChange={setDraft} />
              </div>
              <RulesFields showErrors={errors.length > 0} value={draft} onChange={setDraft} timingLabel="Default move timing" />
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
    <div className="mx-auto grid max-w-page gap-8 px-4 py-6 sm:px-10 sm:py-10">
      <PageHeader
        eyebrow={creatingWorkspace ? "Add another team · Step 2 of 2" : "Step 2 of 2"}
        title="Add your roster"
        subtitle={`${state.settings.leagueName} · ${summary.regular} / ${summary.regularCapacity} rostered · ${summary.irPlus} / ${summary.irPlusCapacity} IR+`}
        actions={
          <div className="flex flex-wrap gap-2">
            {creatingWorkspace && <Button onClick={() => void cancelNewTeam()}>Cancel new team</Button>}
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden /> Add Player
            </Button>
          </div>
        }
      />
      <p className="-mt-4 text-body text-ink-2">
        Add each player&apos;s name, NHL team and eligible positions. You can open the planner with a partial roster and
        add the rest later.
      </p>
      <StepIndicator step={step} onSelect={setStep} />
      <RosterTable />
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-surface p-4">
        <Button className="min-w-28" onClick={() => setStep(0)}>
          ← Back to League &amp; Lineup
        </Button>
        <span className="ml-auto text-body-sm">{summary.regular} of {summary.regularCapacity} rostered</span>
        <Button variant="primary" className="min-w-56" onClick={finish}>
          Open Weekly Planner →
        </Button>
      </div>
      <AddPlayerDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
