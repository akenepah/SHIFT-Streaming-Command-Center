"use client";

import { useId } from "react";
import { TEAMS_SORTED } from "@/domain/nhl/teams";
import type { PlayerDraft } from "@/domain/roster/playerDraft";
import { POSITIONS, type Position } from "@/domain/types";

export const inputClass =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3";
export const labelClass = "mb-1 block text-[12px] font-medium text-ink-2";

export function PlayerForm({
  draft,
  onChange,
  errors,
}: {
  draft: PlayerDraft;
  onChange: (d: PlayerDraft) => void;
  errors: string[];
}) {
  const id = useId();
  const togglePosition = (p: Position) =>
    onChange({
      ...draft,
      eligiblePositions: draft.eligiblePositions.includes(p)
        ? draft.eligiblePositions.filter((x) => x !== p)
        : [...draft.eligiblePositions, p],
    });

  return (
    <div className="grid gap-4">
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>
          Player name
        </label>
        <input
          id={`${id}-name`}
          className={inputClass}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Ryan Leonard"
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor={`${id}-team`} className={labelClass}>
          NHL team
        </label>
        <select
          id={`${id}-team`}
          className={inputClass}
          value={draft.nhlTeamId}
          onChange={(e) => onChange({ ...draft, nhlTeamId: e.target.value as PlayerDraft["nhlTeamId"] })}
        >
          <option value="">Choose a team…</option>
          {TEAMS_SORTED.map((t) => (
            <option key={t.id} value={t.id}>
              {t.city} {t.name} ({t.id})
            </option>
          ))}
        </select>
        <p className="mt-1 text-[12px] text-ink-3">The player&apos;s schedule comes from this team automatically.</p>
      </div>
      <fieldset>
        <legend className={labelClass}>Eligible positions</legend>
        <div className="flex gap-2">
          {POSITIONS.map((p) => {
            const checked = draft.eligiblePositions.includes(p);
            return (
              <label
                key={p}
                className={`flex h-9 min-w-12 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold ${
                  checked ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong text-ink-2"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => togglePosition(p)} />
                {checked && <span aria-hidden>✓</span>}
                {p}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-[12px] text-ink-3">Pick every position the player is eligible for, e.g. C and RW.</p>
      </fieldset>
      <div>
        <label htmlFor={`${id}-headshot`} className={labelClass}>
          Headshot URL <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <input
          id={`${id}-headshot`}
          className={inputClass}
          value={draft.headshot}
          onChange={(e) => onChange({ ...draft, headshot: e.target.value })}
          placeholder="https://…"
          autoComplete="off"
        />
      </div>
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
