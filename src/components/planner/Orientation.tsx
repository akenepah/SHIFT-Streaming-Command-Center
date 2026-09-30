"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/state/store";
import { cloudClient } from "@/state/cloud/client";
import { orientationDismissed, orientationKey } from "@/state/orientation";

export function Orientation() {
  const { user } = useStore();
  const [dismissed, setDismissed] = useState(() => {
    try { return orientationDismissed(localStorage.getItem(orientationKey(user?.id)), user?.user_metadata); }
    catch { return orientationDismissed(null, user?.user_metadata); }
  });
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(orientationKey(user?.id), "dismissed"); } catch { /* Still dismissed for this visit. */ }
    if (user) void cloudClient()?.auth.updateUser({ data: { shiftPlannerOrientationDismissed: true } }).catch(() => { /* Local dismissal remains available offline. */ });
  };

  return (
    <section aria-label="Planner introduction" className="mt-5 flex flex-wrap items-start justify-between gap-3 border-y border-line py-3">
      <div className="max-w-4xl">
        <h2 className="text-body font-semibold text-ink">Plan your week in three moves</h2>
        <p className="mt-1 text-body-sm text-ink-2">
          Find an open slot, check which NHL schedules fit it, then add a player or plan a move.
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={dismiss}>Dismiss</Button>
    </section>
  );
}
