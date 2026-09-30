"use client";
import { Help } from "@/components/ui/Help";

import { formatDayShort, formatMonthDay } from "@/domain/dates";
import { teamFullName } from "@/domain/nhl/teams";
import type { ScheduleTargetsResult } from "@/domain/scheduleTargets/scheduleTargets";
import type { NHLTeamId } from "@/domain/types";

export function ScheduleTargets({ result, onSelect }: {
  result: ScheduleTargetsResult; onSelect: (team: NHLTeamId) => void;
}) {
  const empty = {
    past: "This week has already ended.",
    "no-games": "No games remain for a new acquisition this week.",
    "no-fit": "No usable skater fits remain in the current catalog for this lineup.",
    ready: "",
  }[result.status];
  return (
    <section aria-labelledby="schedule-targets-title" className="rounded-panel border border-line bg-surface p-4">
      <div className="flex items-center justify-between"><h2 id="schedule-targets-title" className="font-display text-card-title text-ink">Schedule Targets</h2><Help label="Schedule Targets">Teams whose remaining games best fit the open spots in your lineup. B2B means back-to-back games on consecutive days.</Help></div>
      {empty ? <p className="mt-3 text-body-sm text-ink-2">{empty}</p> : <>
        <p className="mt-1 text-caption text-ink-2">Skater fits from {formatMonthDay(result.effectiveDate)}</p>
        {result.targets[0]?.opportunityGames === 1 && <p className="mt-2 text-caption text-ink-2">Very little streaming room remains this week.</p>}
        <ul className="mt-3 space-y-2">
          {result.targets.map(t => <li key={t.teamAbbrev}>
            <button type="button" onClick={() => onSelect(t.teamAbbrev)}
              aria-label={`Find ${teamFullName(t.teamAbbrev)} players. ${t.remainingGames} remaining games; ${t.reasons.join(". ")}. ${t.opportunityDates.map(formatDayShort).join(", ")}`}
              className="w-full rounded-control border border-line bg-surface p-3 text-left hover:border-primary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="flex items-center justify-between gap-2"><span className="text-body font-semibold text-ink">{t.teamAbbrev}</span><span className="text-caption text-ink-2">{t.remainingGames} remaining</span></span>
              <span className="mt-1 block text-body-sm font-medium text-primary-strong">{t.opportunityGames} fit your lineup</span>
              <span className="block text-caption text-ink-2">{t.opportunityDates.map(formatDayShort).join(" · ")}</span>
              {t.lowVolumeGames > 0 && <span className="block text-caption text-ink-2">{t.lowVolumeGames} low-volume {t.lowVolumeGames === 1 ? "night" : "nights"}</span>}
              {t.backToBackDates.length > 0 && <span className="mt-1 block text-caption text-ink-2">{t.backToBackDates.map(([a, b]) => `B2B ${formatDayShort(a)}–${formatDayShort(b)}`).join(" · ")}</span>}
            </button>
          </li>)}
        </ul>
        <p className="mt-3 text-caption text-ink-2">Fit depends on player eligibility. Check availability in your fantasy league.</p>
      </>}
    </section>
  );
}
