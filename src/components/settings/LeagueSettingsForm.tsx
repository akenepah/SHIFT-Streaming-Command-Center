"use client";

import type { ReactNode } from "react";
import { PositionBadge, type BadgeKind } from "@/components/ui/Badges";
import { Field, Input, Select, Stepper } from "@/components/ui/Field";
import { activeSlotCount } from "@/domain/config";
import { weekdayName } from "@/domain/dates";
import { SLOT_TYPES, type LeagueSettings, type MoveTiming } from "@/domain/types";

type Props = { value: LeagueSettings; onChange: (s: LeagueSettings) => void };

export function LeagueTeamFields({ value, onChange, withSeason = false }: Props & { withSeason?: boolean }) {
  const set = (patch: Partial<LeagueSettings>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
      <Field id="league-name" label="League name">
        <Input id="league-name" value={value.leagueName} onChange={(e) => set({ leagueName: e.target.value })} />
      </Field>
      <Field id="team-name" label="Team name">
        <Input id="team-name" value={value.teamName} onChange={(e) => set({ teamName: e.target.value })} />
      </Field>
      {withSeason && (
        <>
          <Field id="season" label="Season" help="The bundled NHL schedule covers 2026–27.">
            <Select id="season" value={value.season} onChange={(e) => set({ season: e.target.value })}>
              <option value="2026-27">2026–27</option>
            </Select>
          </Field>
          <Field id="team-count" label="Number of teams">
            <Input
              id="team-count"
              type="number"
              inputMode="numeric"
              min={2}
              max={32}
              value={Number.isFinite(value.numberOfTeams) ? value.numberOfTeams : ""}
              onChange={(e) => set({ numberOfTeams: e.target.value === "" ? NaN : Number(e.target.value) })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

/** Lineup counters: position label above a minus / count / plus control. */
export function LineupSlotFields({ value, onChange }: Props) {
  const setRoster = (patch: Partial<LeagueSettings["roster"]>) => onChange({ ...value, roster: { ...value.roster, ...patch } });
  const cells: { kind: BadgeKind; label: string; value: number; set: (n: number) => void; max: number }[] = [
    ...SLOT_TYPES.map((t) => ({
      kind: t as BadgeKind,
      label: `${t} slots`,
      value: value.roster.slots[t],
      set: (n: number) => setRoster({ slots: { ...value.roster.slots, [t]: n } }),
      max: 10,
    })),
    { kind: "BN", label: "bench slots", value: value.roster.benchSlots, set: (n) => setRoster({ benchSlots: n }), max: 20 },
    { kind: "IR+", label: "IR+ slots", value: value.roster.irPlusSlots, set: (n) => setRoster({ irPlusSlots: n }), max: 10 },
  ];
  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-6">
      {cells.map((c) => (
        <div key={c.kind}>
          <label htmlFor={`slot-${c.kind}`} className="mb-2 flex">
            <PositionBadge kind={c.kind} />
            <span className="sr-only">{c.label}</span>
          </label>
          <Stepper id={`slot-${c.kind}`} label={c.label} value={c.value} onChange={c.set} max={c.max} />
        </div>
      ))}
    </div>
  );
}

export function RulesFields({ value, onChange, timingLabel = "Default effective date" }: Props & { timingLabel?: string }) {
  const set = (patch: Partial<LeagueSettings>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-5">
      <Field id="move-timing" label={timingLabel} help="You can choose a different effective date for each planned move." className="max-w-[452px]">
        <Select
          id="move-timing"
          value={value.defaultMoveTiming}
          onChange={(e) => set({ defaultMoveTiming: e.target.value as MoveTiming })}
        >
          <option value="NEXT_DAY">Next day</option>
          <option value="TODAY">Same day</option>
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-6">
        <Field id="acq-limit" label="Weekly acquisition limit">
          <Input
            id="acq-limit"
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            value={Number.isFinite(value.weeklyAcquisitionLimit) ? value.weeklyAcquisitionLimit : ""}
            onChange={(e) => set({ weeklyAcquisitionLimit: e.target.value === "" ? NaN : Number(e.target.value) })}
          />
        </Field>
        <Field id="acq-reset" label="Acquisition reset">
          <Select id="acq-reset" value={value.weekStartsOn} onChange={(e) => set({ weekStartsOn: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                {weekdayName(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="goalie-min" label="Minimum goalie appearances">
          <Select
            id="goalie-min"
            value={value.minGoalieAppearances}
            onChange={(e) => set({ minGoalieAppearances: Number(e.target.value) })}
          >
            {Array.from({ length: 8 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "None" : `${n} per week`}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  );
}

/** Right-rail summary that reflects edits immediately. */
export function LineupSummary({
  value,
  irOccupied,
  title,
  variant = "settings",
  footer,
}: {
  value: LeagueSettings;
  irOccupied?: number;
  title: string;
  variant?: "settings" | "setup";
  footer?: ReactNode;
}) {
  const active = activeSlotCount(value.roster);
  const n = (x: number) => (Number.isFinite(x) ? x : "–");
  const rules = (
    <div className="grid gap-1 text-body-sm text-ink-2 tabular-nums">
      {variant === "setup" && (
        <p>
          {value.season.replace("-", "–")} · {n(value.numberOfTeams)} teams
        </p>
      )}
      <p>
        {n(value.weeklyAcquisitionLimit)} weekly adds · resets {weekdayName(value.weekStartsOn)}
      </p>
      <p>{value.minGoalieAppearances ? `${value.minGoalieAppearances} minimum goalie appearances` : "No goalie minimum"}</p>
    </div>
  );
  return (
    <aside className="rounded-panel border border-line bg-surface p-6 lg:sticky lg:top-24">
      <h2 className="font-display text-section-title text-ink">{title}</h2>
      {variant === "setup" ? (
        <>
          <p className="mt-4 text-body text-ink-2">Monday through Sunday, with independent daily lineup cards.</p>
          <p className="mt-5 text-body font-medium text-primary tabular-nums">
            {n(active)} active · {n(value.roster.benchSlots)} bench · {n(value.roster.irPlusSlots)} IR+
          </p>
          <p className="mt-5 text-body text-ink-2">
            Next, add your players. Their NHL schedules fill your daily lineups: anyone with a game takes a legal slot,
            and extra games show up as Benched Games.
          </p>
          <div className="mt-5">{rules}</div>
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-1 text-body text-ink">
            <p className="tabular-nums">{n(active)} active slots</p>
            <p className="tabular-nums">{n(value.roster.benchSlots)} bench slots</p>
            <p className="tabular-nums">
              {n(value.roster.irPlusSlots)} IR+ slots{irOccupied !== undefined && ` · ${irOccupied} occupied`}
            </p>
          </div>
          <p className="mt-5 text-body-sm text-ink-3">UTIL accepts any skater. IR+ stays separate from your active roster.</p>
          <div className="mt-5">{rules}</div>
        </>
      )}
      {footer && <div className="mt-5 border-t border-line pt-5 text-body-sm text-ink-3">{footer}</div>}
    </aside>
  );
}
