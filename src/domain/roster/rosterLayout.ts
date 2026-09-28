import { buildSlots, canPlaySlot } from "../config";
import { assignMaximumStarts } from "../lineup/assignment";
import type { Player, RosterConfiguration, RosterPlayer, SlotType } from "../types";

export type RosterGroupKey = "FORWARDS" | "DEFENSE" | "UTILITY" | "GOALTENDERS" | "BENCH" | "IR_PLUS";

export type RosterLayoutRow = {
  /** Badge shown in the Slot column. */
  slot: SlotType | "BN" | "IR+";
  /** The rostered player, or null for an open slot. */
  player: Player | null;
  rosterPlayer: RosterPlayer | null;
  /** Marked Active, but every slot they're eligible for is already taken in the baseline. */
  overflow?: boolean;
};

export type RosterLayoutGroup = {
  key: RosterGroupKey;
  label: string;
  filled: number;
  capacity: number;
  rows: RosterLayoutRow[];
};

const GROUPS: { key: RosterGroupKey; label: string; slotTypes: SlotType[] }[] = [
  { key: "FORWARDS", label: "Forwards", slotTypes: ["C", "LW", "RW"] },
  { key: "DEFENSE", label: "Defense", slotTypes: ["D"] },
  { key: "UTILITY", label: "Utility", slotTypes: ["UTIL"] },
  { key: "GOALTENDERS", label: "Goaltenders", slotTypes: ["G"] },
];

/**
 * The roster laid out by slot, as it would line up if every Active player had
 * a game: the Roster screen's baseline view. It's for display only. Daily
 * lineups are still derived per day from the real schedule.
 *
 * Active players are placed with the same maximum-start matching the planner
 * uses; any Active player who can't fit is listed with the bench as overflow.
 */
export function rosterLayout(
  roster: readonly RosterPlayer[],
  players: Readonly<Record<string, Player>>,
  config: RosterConfiguration,
): RosterLayoutGroup[] {
  const slots = buildSlots(config);
  const withPlayer = roster
    .map((r) => ({ r, p: players[r.playerId] }))
    .filter((x): x is { r: RosterPlayer; p: Player } => !!x.p);
  const active = withPlayer.filter((x) => x.r.rosterStatus === "ACTIVE");
  const assignment = assignMaximumStarts(
    active.map((x) => ({ playerId: x.p.id, positions: x.p.eligiblePositions })),
    slots,
  );
  const byId = new Map(withPlayer.map((x) => [x.p.id, x]));
  preferFlexibleInUtil(assignment, slots, byId);

  const groups: RosterLayoutGroup[] = GROUPS.map(({ key, label, slotTypes }) => {
    const groupSlots = slots.filter((s) => slotTypes.includes(s.type));
    const rows = groupSlots.map((s) => {
      const id = assignment.get(s.id);
      const x = id ? byId.get(id) : undefined;
      return { slot: s.type, player: x?.p ?? null, rosterPlayer: x?.r ?? null };
    });
    return { key, label, filled: rows.filter((r) => r.player).length, capacity: groupSlots.length, rows };
  });

  const placed = new Set(assignment.values());
  const overflow: RosterLayoutRow[] = active
    .filter((x) => !placed.has(x.p.id))
    .map((x) => ({ slot: "BN", player: x.p, rosterPlayer: x.r, overflow: true }));
  const bench: RosterLayoutRow[] = withPlayer
    .filter((x) => x.r.rosterStatus === "BENCH")
    .map((x) => ({ slot: "BN", player: x.p, rosterPlayer: x.r }));
  const benchRows = [...bench, ...overflow];
  for (let i = benchRows.length; i < config.benchSlots; i++) benchRows.push({ slot: "BN", player: null, rosterPlayer: null });
  groups.push({
    key: "BENCH",
    label: "Bench",
    filled: bench.length + overflow.length,
    capacity: config.benchSlots,
    rows: benchRows,
  });

  const ir: RosterLayoutRow[] = withPlayer
    .filter((x) => x.r.rosterStatus === "IR_PLUS")
    .map((x) => ({ slot: "IR+", player: x.p, rosterPlayer: x.r }));
  const irFilled = ir.length;
  for (let i = ir.length; i < config.irPlusSlots; i++) ir.push({ slot: "IR+", player: null, rosterPlayer: null });
  groups.push({ key: "IR_PLUS", label: "IR+", filled: irFilled, capacity: config.irPlusSlots, rows: ir });

  return groups;
}

/**
 * Display nicety for the baseline: when a single-position player sits in UTIL
 * while a more flexible player holds a slot the single-position player could
 * take, swap them. Same number of players placed; it just reads naturally.
 */
function preferFlexibleInUtil(
  assignment: Map<string, string>,
  slots: readonly { id: string; type: SlotType }[],
  byId: Map<string, { p: Player }>,
) {
  for (const util of slots.filter((s) => s.type === "UTIL")) {
    const holderId = assignment.get(util.id);
    const holder = holderId ? byId.get(holderId)?.p : undefined;
    if (!holder) continue;
    for (const slot of slots) {
      if (slot.type === "UTIL" || !canPlaySlot(holder.eligiblePositions, slot.type)) continue;
      const otherId = assignment.get(slot.id);
      const other = otherId ? byId.get(otherId)?.p : undefined;
      if (!other || other.eligiblePositions.length <= holder.eligiblePositions.length) continue;
      assignment.set(slot.id, holder.id);
      assignment.set(util.id, other.id);
      break;
    }
  }
}
