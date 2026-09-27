"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar, PositionList, TeamTag } from "@/components/player/PlayerBits";
import { PlayerForm, inputClass, labelClass } from "@/components/player/PlayerForm";
import {
  draftFromPlayer,
  emptyPlayerDraft,
  playerFromDraft,
  validatePlayerDraft,
  type PlayerDraft,
} from "@/domain/roster/playerDraft";
import type { Player, RosterStatus } from "@/domain/types";
import { newId } from "@/state/reducer";
import { STATUS_LABEL } from "@/state/selectors";
import { useStore } from "@/state/store";

const STATUSES: RosterStatus[] = ["ACTIVE", "BENCH", "IR_PLUS"];

function StatusSelect({ value, onChange, id }: { value: RosterStatus; onChange: (s: RosterStatus) => void; id: string }) {
  return (
    <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as RosterStatus)}>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function AddPlayerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RosterStatus>("BENCH");
  const [draft, setDraft] = useState<PlayerDraft>(emptyPlayerDraft);
  const [errors, setErrors] = useState<string[]>([]);

  const available = useMemo(() => {
    const rostered = new Set(state.roster.map((r) => r.playerId));
    const q = query.trim().toLowerCase();
    return Object.values(state.players)
      .filter((p) => !rostered.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.nhlTeamId.toLowerCase() === q)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.players, state.roster, query]);

  const close = () => {
    setQuery("");
    setDraft(emptyPlayerDraft());
    setErrors([]);
    onClose();
  };

  const addExisting = (p: Player) => {
    dispatch({ type: "roster/add", playerId: p.id, status });
  };

  const create = () => {
    const errs = validatePlayerDraft(draft);
    setErrors(errs);
    if (errs.length) return;
    const player = playerFromDraft(draft, newId("player"), true);
    dispatch({ type: "player/upsert", player });
    dispatch({ type: "roster/add", playerId: player.id, status });
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add player"
      description="Add a player to your fantasy roster. Their NHL team determines their schedule."
      width="md"
      footer={
        mode === "create" ? (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" onClick={create}>
              Create and add
            </Button>
          </>
        ) : (
          <Button onClick={close}>Done</Button>
        )
      }
    >
      <div role="tablist" aria-label="Add player method" className="mb-4 inline-flex rounded-md border border-line p-0.5">
        {(
          [
            ["existing", "Choose a player"],
            ["create", "Create player manually"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium ${mode === m ? "bg-nav text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 w-48">
        <label htmlFor="add-status" className={labelClass}>
          Add to
        </label>
        <StatusSelect id="add-status" value={status} onChange={setStatus} />
      </div>

      {mode === "existing" ? (
        <div>
          <label htmlFor="add-search" className={labelClass}>
            Search players
          </label>
          <input
            id="add-search"
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or team code"
            autoComplete="off"
          />
          <ul className="mt-3 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {available.length === 0 && (
              <li className="px-3 py-4 text-[13px] text-ink-3">
                No matching players.{" "}
                <button type="button" className="font-medium text-brand underline" onClick={() => setMode("create")}>
                  Create one manually
                </button>
              </li>
            )}
            {available.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar src={p.headshot} name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="flex gap-3 text-[12px]">
                    <TeamTag teamId={p.nhlTeamId} />
                    <PositionList positions={p.eligiblePositions} />
                  </div>
                </div>
                <Button size="sm" variant="primary" onClick={() => addExisting(p)} aria-label={`Add ${p.name}`}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <PlayerForm draft={draft} onChange={setDraft} errors={errors} />
      )}
    </Dialog>
  );
}

export function EditPlayerDialog({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { dispatch } = useStore();
  const [draft, setDraft] = useState<PlayerDraft>(() => (player ? draftFromPlayer(player) : emptyPlayerDraft()));
  const [errors, setErrors] = useState<string[]>([]);

  const save = () => {
    if (!player) return;
    const errs = validatePlayerDraft(draft);
    setErrors(errs);
    if (errs.length) return;
    dispatch({ type: "player/upsert", player: playerFromDraft(draft, player.id, !!player.custom) });
    onClose();
  };

  return (
    <Dialog
      open={!!player}
      onClose={onClose}
      title={player ? `Edit ${player.name}` : "Edit player"}
      description="Changing the NHL team immediately changes this player's schedule in the planner."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save changes
          </Button>
        </>
      }
    >
      <PlayerForm draft={draft} onChange={setDraft} errors={errors} />
    </Dialog>
  );
}

export function DropPlayerDialog({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const { dispatch } = useStore();
  return (
    <Dialog
      open={!!player}
      onClose={onClose}
      width="sm"
      title={player ? `Drop ${player.name}?` : "Drop player"}
      description="This removes the player from your roster now. To plan a future drop instead, use Plan a move on the Weekly Planner."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (player) dispatch({ type: "roster/drop", playerId: player.id });
              onClose();
            }}
          >
            Drop player
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-ink-2">The player stays in your player list, so you can add them back later.</p>
    </Dialog>
  );
}
