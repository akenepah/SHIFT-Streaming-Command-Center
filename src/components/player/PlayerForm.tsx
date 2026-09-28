"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { POSITION_TONE } from "@/components/ui/Badges";
import { ErrorList, Field, Input, Select } from "@/components/ui/Field";
import { TEAMS_SORTED } from "@/domain/nhl/teams";
import type { PlayerDraft } from "@/domain/roster/playerDraft";
import { POSITIONS, type Position } from "@/domain/types";

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
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Field id={`${id}-name`} label="Player name">
          <Input
            id={`${id}-name`}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Full name"
            autoComplete="off"
          />
        </Field>
        <Field id={`${id}-team`} label="NHL team" help="Their schedule comes from this team.">
          <Select
            id={`${id}-team`}
            value={draft.nhlTeamId}
            onChange={(e) => onChange({ ...draft, nhlTeamId: e.target.value as PlayerDraft["nhlTeamId"] })}
          >
            <option value="">Choose a team…</option>
            {TEAMS_SORTED.map((t) => (
              <option key={t.id} value={t.id}>
                {t.city} {t.name} ({t.id})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-label text-ink">Eligible positions</legend>
        <div className="flex gap-2">
          {POSITIONS.map((p) => {
            const checked = draft.eligiblePositions.includes(p);
            return (
              <label
                key={p}
                className={`flex h-11 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-control border px-3.5 text-body font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                  checked ? POSITION_TONE[p].badge : "border-line bg-surface text-ink-2 hover:border-line-strong"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => togglePosition(p)} />
                {checked && <Check aria-hidden className="size-4" />}
                {p}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-caption text-ink-3">Pick every position the player is eligible for, such as C and RW.</p>
      </fieldset>
      <Field id={`${id}-headshot`} label={<>Headshot URL <span className="font-normal text-ink-3">(optional)</span></>}>
        <Input
          id={`${id}-headshot`}
          value={draft.headshot}
          onChange={(e) => onChange({ ...draft, headshot: e.target.value })}
          placeholder="https://…"
          autoComplete="off"
        />
      </Field>
      <ErrorList errors={errors} />
    </div>
  );
}
