"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { overflowText, rosterCapacity } from "@/domain/roster/capacity";
import { rosterCounts } from "@/state/selectors";
import { useStore } from "@/state/store";
import { setUnsavedEdits } from "@/state/unsavedGuard";

export default function SettingsPage() {
  const { state, dispatch, user, externalRevision } = useStore();
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(state.settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  // Another tab changed settings: follow it when this form is clean; warn (never clobber) when dirty.
  const [base, setBase] = useState(state.settings);
  const [seenRevision, setSeenRevision] = useState(externalRevision);
  const [externalChange, setExternalChange] = useState(false);
  if (seenRevision !== externalRevision) {
    setSeenRevision(externalRevision);
    if (JSON.stringify(draft) === JSON.stringify(base)) setDraft(state.settings);
    else setExternalChange(true);
    setBase(state.settings);
  }
  const s = state.settings;
  const [confirmShrink, setConfirmShrink] = useState(false);
  const capacity = rosterCapacity(state.roster, draft.roster);
  useEffect(() => {
    setUnsavedEdits(dirty);
    return () => setUnsavedEdits(false);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const navigate = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a[href]");
      if (link && !window.confirm("Discard unsaved settings?")) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  const commit = () => {
    dispatch({ type: "settings/update", settings: draft });
    const saved = { ...draft, leagueName: draft.leagueName.trim(), teamName: draft.teamName.trim() };
    setDraft(saved);
    setBase(saved);
    setExternalChange(false);
    setConfirmShrink(false);
    toast(user ? "Settings updated. Saving to your account…" : "Settings saved. The planner has been updated.");
  };

  const save = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (errs.length) { requestAnimationFrame(() => (document.querySelector("[aria-invalid=true]") as HTMLElement | null)?.focus()); return; }
    if (capacity.regularOver || capacity.irOver) { setConfirmShrink(true); return; }
    commit();
  };

  const cancel = () => {
    setDraft(state.settings);
    setBase(state.settings);
    setExternalChange(false);
    setErrors([]);
  };

  const reset = () => {
    dispatch({ type: "data/reset" });
    setConfirmReset(false);
    toast("Local data erased.", "info");
    router.push("/setup");
  };

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-10">
      <PageHeader
        eyebrow={`${s.leagueName} · ${s.season.replace("-", "–")}`}
        title="League Settings"
        subtitle={`${s.teamName} · ${s.numberOfTeams} teams`}
      />

      <div className="mt-8 layout-form-rail">
        <div className="grid gap-6">
          <SectionCard title="League & team">
            <LeagueTeamFields showErrors={errors.length > 0} value={draft} onChange={setDraft} withSeason />
          </SectionCard>

          <SectionCard title="Daily lineup slots" description="One roster generates Monday–Sunday lineups using these limits.">
            <LineupSlotFields value={draft} onChange={setDraft} />
          </SectionCard>

          <SectionCard title="Acquisitions & league rules">
            <RulesFields showErrors={errors.length > 0} value={draft} onChange={setDraft} />
          </SectionCard>

          {externalChange && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-warn-line bg-warn-soft px-4 py-3 text-body-sm text-ink">
              <span>
                <strong className="font-semibold">Updated in another tab.</strong> Your unsaved edits here are kept; saving will replace those changes.
              </span>
              <Button onClick={cancel}>Load latest</Button>
            </div>
          )}

          <ErrorList errors={errors} />

          <div className="flex gap-3">
            <Button variant="primary" className="min-w-40" onClick={save} disabled={!dirty}>
              Save changes
            </Button>
            <Button className="min-w-28" onClick={cancel} disabled={!dirty}>
              Cancel
            </Button>
          </div>

          <SectionCard title={user ? "Account storage" : "Reset local data"} className="mt-4 border-danger-line">
            <p className="text-body text-ink-2">
              {user ? "Your league is saved to your account. Signing out preserves cloud data. Sign out before restarting a local setup." : "This setup lives in this browser. Resetting erases your local roster, players, moves, overrides and settings."}
            </p>
            <Button disabled={!!user} variant="quiet-danger" className="mt-4 border border-danger-line" onClick={() => setConfirmReset(true)}>
              Reset local data…
            </Button>
          </SectionCard>
        </div>

        <LineupSummary
          value={draft}
          irOccupied={rosterCounts(state.roster).IR_PLUS}
          title={`${draft.leagueName || "League"} lineup${dirty ? " · Unsaved" : ""}`}
          footer={
            <>
              NHL schedule: {SCHEDULE_META.season} regular season, {SCHEDULE_META.gameCount.toLocaleString()} games,
              bundled with the app.
            </>
          }
        />
      </div>

      <Dialog open={confirmShrink} onClose={() => setConfirmShrink(false)} title="Save reduced capacity?" description={`This will leave ${overflowText(capacity.regularOver, capacity.irOver)}. No players will be removed.`} footer={<><Button onClick={() => setConfirmShrink(false)}>Cancel</Button><Button variant="primary" onClick={commit}>Save anyway</Button></>}><p>Overflow remains visible until you adjust your roster.</p></Dialog>
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
