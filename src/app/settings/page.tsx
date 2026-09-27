"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LeagueSettingsForm } from "@/components/settings/LeagueSettingsForm";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { validateSettings } from "@/domain/settings";
import { SCHEDULE_META } from "@/domain/schedule/staticProvider";
import { useStore } from "@/state/store";

export default function SettingsPage() {
  const { state, dispatch } = useStore();
  const router = useRouter();
  const [draft, setDraft] = useState(state.settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);

  const save = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (errs.length) return;
    dispatch({ type: "settings/update", settings: draft });
    setSaved(true);
  };

  const reset = (mode: "sample" | "empty") => {
    dispatch({ type: "data/reset", mode });
    setConfirmReset(false);
    router.push("/setup");
  };

  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="mb-5 flex items-end gap-4">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold tracking-tight">League Settings</h1>
          <p className="mt-1 text-ink-2">The planner rebuilds every day&apos;s lineup from these settings.</p>
        </div>
        <span role="status" className="text-[13px] text-ok">
          {saved && !dirty ? "✓ Saved" : ""}
        </span>
        <Button disabled={!dirty} onClick={() => { setDraft(state.settings); setErrors([]); }}>
          Discard changes
        </Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>
          Save settings
        </Button>
      </div>

      <LeagueSettingsForm
        value={draft}
        onChange={(s) => {
          setDraft(s);
          setSaved(false);
        }}
        errors={errors}
      />

      <section className="mt-5 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-[15px] font-bold">Schedule data</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          {SCHEDULE_META.season} NHL regular season · {SCHEDULE_META.gameCount.toLocaleString()} games ·{" "}
          {SCHEDULE_META.regularSeasonStart} to {SCHEDULE_META.regularSeasonEnd} · bundled with the app, retrieved{" "}
          {SCHEDULE_META.retrievedAt.slice(0, 10)} from the NHL public schedule API.
        </p>
      </section>

      <section className="mt-5 rounded-xl border border-danger/30 bg-surface p-5">
        <h2 className="text-[15px] font-bold">Reset local data</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          Everything is stored in this browser only. Resetting erases your roster, created players, planned moves,
          lineup overrides and settings.
        </p>
        <Button variant="danger" className="mt-3" onClick={() => setConfirmReset(true)}>
          Reset local data…
        </Button>
      </section>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        width="sm"
        title="Reset local data?"
        description="This can't be undone. You'll go through setup again."
        footer={<Button onClick={() => setConfirmReset(false)}>Cancel</Button>}
      >
        <div className="grid gap-2">
          <Button variant="danger" onClick={() => reset("empty")}>
            Erase everything and start with an empty roster
          </Button>
          <Button variant="secondary" onClick={() => reset("sample")}>
            Erase everything and load the sample roster
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
