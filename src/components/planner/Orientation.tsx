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
  return <section aria-label="Planner introduction" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary-line bg-primary-soft px-4 py-3">
    <div><h2 className="text-body font-semibold">Plan your week in 3 steps</h2><ol className="mt-1 list-inside list-decimal text-body-sm text-ink-2 sm:flex sm:flex-wrap sm:gap-x-5"><li>Find white Open Slots</li><li>Check Schedule Targets for teams that fit</li><li>Add a player or Plan a Move</li></ol></div>
    <Button size="sm" onClick={dismiss}>Got it</Button>
  </section>;
}
