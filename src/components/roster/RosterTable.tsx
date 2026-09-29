"use client";

import { AlertTriangle, CircleCheck, Pause, Pencil, ShieldPlus, UserMinus } from "lucide-react";
import { useState } from "react";
import { PlayerIdentity, TeamTag } from "@/components/player/PlayerBits";
import { PositionBadge, StatusBadge } from "@/components/ui/Badges";
import { Select } from "@/components/ui/Field";
import { ActionMenu, MenuDivider, MenuItem } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { statusChangeBlocker } from "@/domain/roster/capacity";
import { rosterLayout, type RosterGroupKey } from "@/domain/roster/rosterLayout";
import { POSITIONS, type Player, type Position, type RosterStatus } from "@/domain/types";
import { rosterCounts, rosterSummary } from "@/state/selectors";
import { useStore } from "@/state/store";
import { DropPlayerDialog, ManagePlayerDialog, RepairPlayersPanel } from "./PlayerDialogs";

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const STATUS_ACTIONS: { status: RosterStatus; label: string; Icon: typeof CircleCheck }[] = [
  { status: "ACTIVE", label: "Set Active", Icon: CircleCheck },
  { status: "BENCH", label: "Move to Bench", Icon: Pause },
  { status: "IR_PLUS", label: "Move to IR+", Icon: ShieldPlus },
];

/** Roster toolbar + grouped table. Shared by the Roster screen and setup's Add Roster step. */
export function RosterTable() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Position | "ALL">("ALL");
  const [managing, setManaging] = useState<{ player: Player; status: RosterStatus } | null>(null);
  const [dropping, setDropping] = useState<Player | null>(null);

  const summary = rosterSummary(state.roster, state.settings);
  const counts = rosterCounts(state.roster);
  const groups = rosterLayout(state.roster, state.players, state.settings.roster);
  const matches = (p: Player | null) => filter === "ALL" || (!!p && p.eligiblePositions.includes(filter));

  const setStatus = (p: Player, status: RosterStatus) => {
    // Refused changes say why instead of showing a false success.
    const blocker = statusChangeBlocker(state.roster, state.settings.roster, status, { playerId: p.id, players: state.players });
    if (blocker) {
      toast(`${p.name} can't be moved: ${blocker}`, "info");
      return;
    }
    dispatch({ type: "roster/setStatus", playerId: p.id, status });
    toast(`${p.name} is now ${status === "IR_PLUS" ? "on IR+" : status === "BENCH" ? "on the bench" : "Active"}.`);
  };

  return (
    <div className="grid gap-4">
      <RepairPlayersPanel />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          aria-pressed={filter === "ALL"}
          className={`h-11 rounded-control border px-4 text-body font-semibold ${
            filter === "ALL" ? "border-line bg-surface text-ink" : "border-transparent text-ink-2 hover:text-ink"
          }`}
        >
          All players · {summary.rostered}
        </button>
        <div className="w-44">
          <label htmlFor="roster-position-filter" className="sr-only">
            Filter by position
          </label>
          <Select id="roster-position-filter" value={filter} onChange={(e) => setFilter(e.target.value as Position | "ALL")}>
            <option value="ALL">All positions</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        {summary.regular > summary.regularCapacity && (
          <p className="flex items-center gap-1.5 text-body-sm font-medium text-warn">
            <AlertTriangle aria-hidden className="size-4" />
            Over by {summary.regular - summary.regularCapacity}
          </p>
        )}
        <dl className="ml-auto flex divide-x divide-line" aria-label="Roster capacity">
          {[
            { label: "Rostered", value: `${summary.regular} / ${summary.regularCapacity}`, strong: true },
            { label: "Active", value: String(counts.ACTIVE) },
            { label: "Bench", value: String(counts.BENCH) },
            { label: "IR+", value: `${summary.irPlus} / ${summary.irPlusCapacity}` },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse px-5 last:pr-0">
              <dt className="text-overline uppercase tracking-widest text-ink-3">{stat.label}</dt>
              <dd className={`font-display text-card-title tabular-nums ${stat.strong ? "text-primary" : "text-ink"}`}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="overflow-x-auto rounded-panel border border-line bg-surface">
        <table className="w-full min-w-[880px] text-left">
          <thead className="bg-surface-muted text-overline uppercase text-ink-2">
            <tr>
              <th scope="col" className="w-16 py-3 pl-2 pr-2 text-center">Slot</th>
              <th scope="col" className="py-3 pr-4">Player</th>
              <th scope="col" className="w-36 py-3 pr-4">NHL team</th>
              <th scope="col" className="w-52 py-3 pr-4">Eligible positions</th>
              <th scope="col" className="w-40 py-3 pr-4">Status</th>
              <th scope="col" className="w-20 py-3 pr-5 text-right">Actions</th>
            </tr>
          </thead>
          {groups.map((group) => {
            const rows = group.rows.filter((r) => (r.player ? matches(r.player) : filter === "ALL"));
            if (rows.length === 0 && filter !== "ALL") return null;
            const ir = group.key === "IR_PLUS";
            return (
              <tbody key={group.key}>
                <tr className={ir ? "bg-pos-ir-soft" : "bg-surface-muted"}>
                  <th scope="rowgroup" colSpan={6} className="border-t border-line px-4 py-2.5 text-left">
                    <span className="text-label uppercase tracking-wide text-ink">{group.label}</span>
                    <span className="ml-2 text-label text-ink-3 tabular-nums">
                      {group.filled} / {group.capacity}
                    </span>
                    <span className="ml-3 text-caption font-normal normal-case text-ink-3">{GROUP_HINT[group.key]}</span>
                  </th>
                </tr>
                {rows.map((row, i) => {
                  const p = row.player;
                  const status = row.rosterPlayer?.rosterStatus;
                  if (!p || !status) {
                    return (
                      <tr key={`open-${i}`} className="border-t border-line">
                        <td className="py-2.5 pl-2 pr-2 text-center">
                          <PositionBadge kind={row.slot} />
                        </td>
                        <td colSpan={5} className="py-2.5 pr-4 text-body text-ink-3">
                          Open {row.slot === "BN" ? "bench" : row.slot} slot
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={p.id} className="border-t border-line hover:bg-surface-muted/60">
                      <td className="py-3 pl-2 pr-2 text-center">
                        <PositionBadge kind={row.slot} />
                      </td>
                      <td className="py-3 pr-4">
                        <PlayerIdentity name={p.name} headshot={p.headshot} />
                      </td>
                      <td className="py-3 pr-4">
                        <TeamTag teamId={p.nhlTeamId} />
                      </td>
                      <td className="py-3 pr-4 text-data text-ink">{p.eligiblePositions.join(" · ")}</td>
                      <td className="py-3 pr-4">
                        <span className="flex flex-col items-start gap-1">
                          <StatusBadge status={status} />
                          {row.overflow && <span className="text-caption text-warn">No free slot in baseline</span>}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <ActionMenu label={`Actions for ${p.name}`}>
                          {(close) => (
                            <>
                              <MenuItem
                                onSelect={() => {
                                  close();
                                  setManaging({ player: p, status });
                                }}
                              >
                                <Pencil aria-hidden /> Manage player
                              </MenuItem>
                              <MenuDivider />
                              {STATUS_ACTIONS.filter((a) => a.status !== status).map(({ status: s, label, Icon }) => (
                                <MenuItem
                                  key={s}
                                  onSelect={() => {
                                    close();
                                    setStatus(p, s);
                                  }}
                                >
                                  <Icon aria-hidden /> {label}
                                </MenuItem>
                              ))}
                              <MenuDivider />
                              <MenuItem
                                tone="danger"
                                onSelect={() => {
                                  close();
                                  setDropping(p);
                                }}
                              >
                                <UserMinus aria-hidden /> Drop player
                              </MenuItem>
                            </>
                          )}
                        </ActionMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>

      <p className="text-body-sm text-ink-3">
        {state.settings.season} · The Slot column is a baseline lineup. Each day the planner starts every player whose team
        has a game when a legal slot is free. Active means lineup priority, not a guaranteed daily slot: Active players get
        first pick, then Bench; IR+ never starts. Use ⋯ to manage a player.
      </p>

      <ManagePlayerDialog
        key={managing?.player.id ?? "none"}
        player={managing?.player ?? null}
        status={managing?.status ?? null}
        onClose={() => setManaging(null)}
        onDrop={(p) => {
          setManaging(null);
          setDropping(p);
        }}
      />
      <DropPlayerDialog player={dropping} onClose={() => setDropping(null)} />
    </div>
  );
}

const GROUP_HINT: Record<RosterGroupKey, string> = {
  FORWARDS: "",
  DEFENSE: "",
  UTILITY: "Any skater",
  GOALTENDERS: "",
  BENCH: "Starts when a slot is open",
  IR_PLUS: "Never starts",
};
