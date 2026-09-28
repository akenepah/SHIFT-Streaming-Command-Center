"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Avatar, PositionList, TeamTag, matchupText } from "@/components/player/PlayerBits";
import { addDays, formatDayShort, todayISO } from "@/domain/dates";
import { toPlayerGame } from "@/domain/lineup/generateDailyLineup";
import { getScheduleProvider } from "@/domain/schedule/staticProvider";
import type { Player, RosterStatus } from "@/domain/types";
import { STATUS_LABEL, rosterCapacity, rosterCounts } from "@/state/selectors";
import { useStore } from "@/state/store";
import { AddPlayerDialog, DropPlayerDialog, EditPlayerDialog, RepairPlayersPanel } from "./PlayerDialogs";

const SECTIONS: RosterStatus[] = ["ACTIVE", "BENCH", "IR_PLUS"];

/** Roster status only sets priority; who starts each day is derived by the planner. */
const SECTION_HINT: Record<RosterStatus, string> = {
  ACTIVE: "first priority for open lineup slots",
  BENCH: "starts whenever a legal slot is still open",
  IR_PLUS: "never starts",
};

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function nextGameLabel(player: Player, from: string): string {
  const games = getScheduleProvider().getTeamGames(player.nhlTeamId, from, addDays(from, 30));
  const next = games[0];
  if (!next) return "No games in next 30 days";
  const g = toPlayerGame(next, player.nhlTeamId);
  return `${next.date === from ? "Today" : formatDayShort(next.date) + " " + next.date.slice(5).replace("-", "/")} ${matchupText(g)}`;
}

export function RosterTable() {
  const { state, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [dropping, setDropping] = useState<Player | null>(null);

  const today = todayISO();
  const weekEnd = addDays(today, 6);
  const counts = rosterCounts(state.roster);
  const capacity = rosterCapacity(state.settings);
  const provider = getScheduleProvider();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {SECTIONS.map((s) => {
          const over = counts[s] > capacity[s];
          return (
            <span
              key={s}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
                over ? "border-warn-line bg-warn-soft text-warn-strong" : "border-line bg-surface text-ink-2"
              }`}
            >
              {STATUS_LABEL[s]} {counts[s]} / {capacity[s]}
              {over && " · over capacity"}
            </span>
          );
        })}
        <Button variant="primary" className="ml-auto" onClick={() => setAdding(true)}>
          <span aria-hidden>+</span> Add player
        </Button>
      </div>

      <p className="mb-3 text-[12px] text-ink-2">
        Roster status sets priority, not who plays. Each day the planner starts every player whose team has a game, as
        long as a legal lineup slot is free. Active players get first pick when slots run out. IR+ players never start.
      </p>

      <RepairPlayersPanel />

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[860px] text-left text-[13px]">
          <thead className="border-b border-line text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-2.5">Player</th>
              <th scope="col" className="px-3 py-2.5">NHL team</th>
              <th scope="col" className="px-3 py-2.5">Positions</th>
              <th scope="col" className="px-3 py-2.5">Next 7 days</th>
              <th scope="col" className="px-3 py-2.5">Next game</th>
              <th scope="col" className="px-3 py-2.5">Roster status</th>
              <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          {SECTIONS.map((section) => {
            const rows = state.roster.filter((r) => r.rosterStatus === section);
            return (
              <tbody key={section} className="border-b border-line last:border-b-0">
                <tr className="bg-canvas/60">
                  <th scope="rowgroup" colSpan={7} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                    {STATUS_LABEL[section]} · {rows.length}
                    <span className="ml-2 font-normal normal-case tracking-normal text-ink-3">{SECTION_HINT[section]}</span>
                  </th>
                </tr>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 text-ink-3">
                      No players.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const p = state.players[r.playerId];
                  if (!p) return null;
                  return (
                    <tr key={p.id} className="border-t border-line first:border-t-0 hover:bg-canvas/40">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={p.headshot} name={p.name} />
                          <span className="font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <TeamTag teamId={p.nhlTeamId} />
                      </td>
                      <td className="px-3 py-2">
                        <PositionList positions={p.eligiblePositions} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">{plural(provider.getTeamGames(p.nhlTeamId, today, weekEnd).length, "game")}</td>
                      <td className="px-3 py-2 text-ink-2">{nextGameLabel(p, today)}</td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Roster status for ${p.name}`}
                          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px]"
                          value={r.rosterStatus}
                          onChange={(e) =>
                            dispatch({ type: "roster/setStatus", playerId: p.id, status: e.target.value as RosterStatus })
                          }
                        >
                          {SECTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDropping(p)} aria-label={`Drop ${p.name}`}>
                            Drop
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>

      <AddPlayerDialog open={adding} onClose={() => setAdding(false)} />
      <EditPlayerDialog key={editing?.id ?? "none"} player={editing} onClose={() => setEditing(null)} />
      <DropPlayerDialog player={dropping} onClose={() => setDropping(null)} />
    </div>
  );
}
