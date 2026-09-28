"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LeagueTeamFields,
  LineupSlotFields,
  LineupSummary,
  RulesFields,
} from "@/components/settings/LeagueSettingsForm";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorList } from "@/components/ui/Field";
import { PageHeader, SectionCard } from "@/components/ui/Page";
import { useToast } from "@/components/ui/Toast";
import { SCHEDULE_META } from "@/domain/schedule/staticProvider";
import { validateSettings } from "@/domain/settings";
import { rosterCounts } from "@/state/selectors";
import { useStore } from "@/state/store";

export default function SettingsPage() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(state.settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const s = state.settings;

  const save = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (errs.length) return;
    dispatch({ type: "settings/update", settings: draft });
    toast("Settings saved. The planner has been updated.");
  };

  const cancel = () => {
    setDraft(state.settings);
    setErrors([]);
  };

  const reset = () => {
    dispatch({ type: "data/reset" });
    setConfirmReset(false);
    toast("Local data erased.", "info");
    router.push("/setup");
  };

  return (
    <div className="mx-auto max-w-page px-10 py-10">
      <PageHeader
        eyebrow={`${s.leagueName} · ${s.season.replace("-", "–")}`}
        title="League Settings"
        subtitle={`${s.teamName} · ${s.numberOfTeams} teams`}
      />

      <div className="mt-8 layout-form-rail">
        <div className="grid gap-6">
          <SectionCard title="League & team">
            <LeagueTeamFields value={draft} onChange={setDraft} />
          </SectionCard>

          <SectionCard title="Daily lineup slots" description="One roster generates Monday–Sunday lineups using these limits.">
            <LineupSlotFields value={draft} onChange={setDraft} />
          </SectionCard>

          <SectionCard title="Acquisitions & league rules">
            <RulesFields value={draft} onChange={setDraft} />
          </SectionCard>

          <ErrorList errors={errors} />

          <div className="flex gap-3">
            <Button variant="primary" className="min-w-40" onClick={save} disabled={!dirty}>
              Save changes
            </Button>
            <Button className="min-w-28" onClick={cancel} disabled={!dirty}>
              Cancel
            </Button>
          </div>

          <SectionCard title="Reset local data" className="mt-4 border-danger-line">
            <p className="text-body text-ink-2">
              Everything lives in this browser only. Resetting erases your roster, saved players, planned moves, lineup
              overrides and settings.
            </p>
            <Button variant="quiet-danger" className="mt-4 border border-danger-line" onClick={() => setConfirmReset(true)}>
              Reset local data…
            </Button>
          </SectionCard>
        </div>

        <LineupSummary
          value={draft}
          irOccupied={rosterCounts(state.roster).IR_PLUS}
          title={`${draft.leagueName || "League"} lineup`}
          footer={
            <>
              NHL schedule: {SCHEDULE_META.season} regular season, {SCHEDULE_META.gameCount.toLocaleString()} games,
              bundled with the app.
            </>
          }
        />
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        width="sm"
        title="Reset local data?"
        description="This can't be undone. You'll go through setup again."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" onClick={reset}>
              Erase all local data
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-ink-2">
          Your roster, players, planned moves, lineup overrides and settings will be deleted from this browser. The app
          will start again with an empty roster.
        </p>
      </Dialog>
    </div>
  );
}
