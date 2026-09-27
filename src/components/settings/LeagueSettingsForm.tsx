"use client";

import { inputClass, labelClass } from "@/components/player/PlayerForm";
import { activeSlotCount } from "@/domain/config";
import { weekdayName } from "@/domain/dates";
import { SLOT_TYPES, type LeagueSettings, type SlotType } from "@/domain/types";

const SLOT_HELP: Record<SlotType, string> = {
  C: "Center",
  LW: "Left wing",
  RW: "Right wing",
  D: "Defense",
  UTIL: "Any skater",
  G: "Goalie",
};

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 20,
  help,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  help?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        className={`${inputClass} tabular-nums`}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
      />
      {help && <p className="mt-1 text-[11px] text-ink-3">{help}</p>}
    </div>
  );
}

export function LeagueSettingsForm({
  value,
  onChange,
  errors,
}: {
  value: LeagueSettings;
  onChange: (s: LeagueSettings) => void;
  errors: string[];
}) {
  const set = (patch: Partial<LeagueSettings>) => onChange({ ...value, ...patch });
  const setRoster = (patch: Partial<LeagueSettings["roster"]>) => set({ roster: { ...value.roster, ...patch } });

  return (
    <div className="grid gap-5">
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-[15px] font-bold">League</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="league-name" className={labelClass}>
              League name
            </label>
            <input id="league-name" className={inputClass} value={value.leagueName} onChange={(e) => set({ leagueName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="team-name" className={labelClass}>
              Team name
            </label>
            <input id="team-name" className={inputClass} value={value.teamName} onChange={(e) => set({ teamName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="season" className={labelClass}>
              Season
            </label>
            <select id="season" className={inputClass} value={value.season} onChange={(e) => set({ season: e.target.value })}>
              <option value="2026-27">2026–27</option>
            </select>
            <p className="mt-1 text-[11px] text-ink-3">The bundled NHL schedule covers 2026–27.</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">Lineup slots</h2>
          <p className="text-[12px] text-ink-3 tabular-nums">
            {Number.isNaN(activeSlotCount(value.roster)) ? "–" : activeSlotCount(value.roster)} active slots
          </p>
        </div>
        <div className="grid grid-cols-6 gap-3">
          {SLOT_TYPES.map((t) => (
            <NumberField
              key={t}
              id={`slot-${t}`}
              label={t}
              max={10}
              help={SLOT_HELP[t]}
              value={value.roster.slots[t]}
              onChange={(n) => setRoster({ slots: { ...value.roster.slots, [t]: n } })}
            />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-6 gap-3">
          <NumberField id="slot-bn" label="Bench (BN)" value={value.roster.benchSlots} onChange={(n) => setRoster({ benchSlots: n })} />
          <NumberField
            id="slot-ir"
            label="IR+"
            max={10}
            value={value.roster.irPlusSlots}
            onChange={(n) => setRoster({ irPlusSlots: n })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-4 text-[15px] font-bold">Weekly rules</h2>
        <div className="grid grid-cols-3 gap-4">
          <NumberField
            id="acq-limit"
            label="Weekly acquisition limit"
            max={50}
            value={value.weeklyAcquisitionLimit}
            onChange={(n) => set({ weeklyAcquisitionLimit: n })}
            help="Adds and Add + Drops count. Drops don't."
          />
          <div>
            <label htmlFor="acq-reset" className={labelClass}>
              Acquisitions reset (week starts)
            </label>
            <select
              id="acq-reset"
              className={inputClass}
              value={value.weekStartsOn}
              onChange={(e) => set({ weekStartsOn: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {weekdayName(d)}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            id="goalie-min"
            label="Minimum goalie appearances"
            max={14}
            value={value.minGoalieAppearances}
            onChange={(n) => set({ minGoalieAppearances: n })}
            help="Per week. Set 0 if your league has none."
          />
        </div>
      </section>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
