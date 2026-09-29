"use client";

import { ArrowLeftRight, RotateCcw } from "lucide-react";
import { matchupText, shortName } from "@/components/player/PlayerBits";
import { formatDayLong, formatMonthDay } from "@/domain/dates";
import { benchRows, irPlusRows, type ReserveRow } from "@/domain/lineup/dayRows";
import { opportunityTone, type OpportunityTone } from "@/domain/lineup/openSlot";
import type { DailyLineup, PlannedTransaction, Player, SlotType } from "@/domain/types";
import { useStore } from "@/state/store";
import { SlotTile } from "./SlotTile";

type Props = {
  day: DailyLineup;
  isToday: boolean;
  isPast: boolean;
  movesToday: PlannedTransaction[];
  statusRows: number;
  players: Readonly<Record<string, Player>>;
  onMovePlayer: (player: Player, day: DailyLineup, anchor: HTMLElement) => void;
  onAddToSlot: (day: DailyLineup, position: SlotType) => void;
};

const OPPORTUNITY_BAR: Record<OpportunityTone, string> = {
  "very-high": "bg-opp-very-high",
  strong: "bg-opp-strong",
  moderate: "bg-opp-moderate",
  limited: "bg-opp-limited",
  none: "bg-opp-none",
  na: "bg-opp-na",
};

const OPPORTUNITY_LABEL: Record<OpportunityTone, string> = {
  "very-high": "very high streaming opportunity",
  strong: "strong streaming opportunity",
  moderate: "moderate streaming opportunity",
  limited: "limited streaming opportunity",
  none: "lineup full, no streaming opportunity",
  na: "no NHL games",
};

const SLOT_NAME: Record<SlotType, string> = {
  C: "center",
  LW: "left wing",
  RW: "right wing",
  D: "defense",
  UTIL: "utility",
  G: "goalie",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 mt-3 border-t border-line px-0.5 pt-2 font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-secondary first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </h4>
  );
}

const GROUP_OF = (t: SlotType) => (t === "C" || t === "LW" || t === "RW" ? "FORWARDS" : t === "D" ? "DEFENSE" : t === "UTIL" ? "UTILITY" : "GOALTENDER");

export function DayCard({ day, isToday, isPast, movesToday, statusRows, players, onMovePlayer, onAddToSlot }: Props) {
  const { state, dispatch } = useStore();
  const { benchSlots, irPlusSlots } = state.settings.roster;
  const slotCount = day.activeSlots.length;
  const filled = day.activeSlots.filter((a) => a.playerId).length;
  const tone = opportunityTone(day);
  const hasOverrides = day.appliedOverrides.length > 0 || day.ignoredOverrides.length > 0;
  const name = (id: string) => players[id]?.name ?? "Unknown player";
  const dayName = formatDayLong(day.date);

  const reserveTile = (row: ReserveRow, badge: "BN" | "IR+", key: number) => {
    if (row.kind === "open") return <SlotTile key={key} kind="open" badge={badge} />;
    const p = players[row.playerId];
    if (!p) return null;
    const secondary = row.starting ? "Starting today" : row.game ? matchupText(row.game) : "No game";
    return (
      <SlotTile
        key={key}
        kind="player"
        badge={badge}
        player={p}
        secondary={row.benchedGame ? `${secondary} · BN game` : secondary}
        benched={row.benchedGame}
        muted={row.starting}
        // Only a benched game can be moved into the lineup; no-game and IR+ rows are informational.
        onSelect={row.benchedGame ? (anchor) => onMovePlayer(p, day, anchor) : undefined}
        ariaLabel={row.benchedGame ? `${p.name} has a game but is benched. Change lineup spot` : undefined}
      />
    );
  };

  return (
    <section
      aria-label={`${dayName} ${formatMonthDay(day.date)}`}
      className={`flex min-w-0 flex-col rounded-panel border bg-surface ${isToday ? "border-primary ring-1 ring-primary" : "border-line"} ${
        isPast ? "border-dashed" : ""
      }`}
    >
      <header className="px-3 pb-3 pt-4 2xl:px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h3 className="font-display text-card-title uppercase tracking-wide text-ink">{dayName}</h3>
          {isPast && <span className="text-caption text-ink-2">Past</span>}
          {isToday && <span className="rounded-pill bg-primary px-2 py-0.5 font-display text-overline uppercase text-on-primary">Today</span>}
        </div>
        <p className="text-caption text-ink-3 tabular-nums">
          {formatMonthDay(day.date)} · {day.nhlGameCount} NHL {day.nhlGameCount === 1 ? "game" : "games"}
        </p>
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-pill bg-surface-muted"
          title={`Active slots filled · ${OPPORTUNITY_LABEL[tone]}`}
          role="img"
          aria-label={`${filled} of ${slotCount} active slots filled: ${OPPORTUNITY_LABEL[tone]}`}
        >
          <div
            className={`h-full rounded-pill ${OPPORTUNITY_BAR[tone]}`}
            style={{ width: `${slotCount ? (filled / slotCount) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-2 flex items-center gap-1 text-body-sm text-ink tabular-nums">
          {filled === 0 && tone === "very-high" && <span aria-label="Very high opportunity" className="size-1.5 rounded-full bg-opp-very-high" />}
          {filled} / {slotCount} with games
        </p>
        <p className="text-caption text-ink-3 tabular-nums">
          {day.openSlots.length} open ·{" "}
          <span className={day.benchedGames.length ? "font-semibold text-warn-strong" : ""}>
            {day.benchedGames.length} BN {day.benchedGames.length === 1 ? "game" : "games"}
          </span>
        </p>
      </header>

      <div className="flex flex-1 flex-col px-2 pb-3 2xl:px-2.5">
        {statusRows > 0 && (
          // Reserved band: same height in every column so lineup rows stay aligned across days.
          <div style={{ height: 30 + statusRows * 36 }} className="mb-2">
            {movesToday.length > 0 && (
              <div className="h-full overflow-y-auto rounded-control border border-move-line bg-move-soft px-2.5 py-1.5 text-caption text-move-ink">
                <span className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-move-strong">
                  <ArrowLeftRight aria-hidden className="size-3.5" /> Planned move
                </span>
                {movesToday.map((t) => (
                  <span key={t.id} className="mt-0.5 block leading-4">
                    {t.addPlayerId && <span className="block truncate">+ {shortName(name(t.addPlayerId))}</span>}
                    {t.dropPlayerId && <span className="block truncate">− {shortName(name(t.dropPlayerId))}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <ul className="flex flex-col gap-1.5" aria-label={`${dayName} active lineup`}>
          {day.activeSlots.map((a, index) => {
            const group = GROUP_OF;
            const startsGroup = index === 0 || group(day.activeSlots[index - 1].slot.type) !== group(a.slot.type);
            const p = a.playerId ? players[a.playerId] : undefined;
            return (
              <li key={a.slot.id}>
                {startsGroup && <SectionLabel>{group(a.slot.type)} · {day.activeSlots.filter(b => group(b.slot.type) === group(a.slot.type)).length}</SectionLabel>}
                {p ? (
                  <SlotTile
                    kind="player"
                    badge={a.slot.type}
                    player={p}
                    secondary={a.game ? matchupText(a.game) : ""}
                    overridden={a.overridden}
                    onSelect={isPast ? undefined : (anchor) => onMovePlayer(p, day, anchor)}
                    ariaLabel={`${p.name}, ${a.slot.type}, ${a.game ? matchupText(a.game) : ""}${a.overridden ? ", set manually" : ""}. Change lineup spot`}
                  />
                ) : isPast || day.nhlGameCount === 0 ? <SlotTile kind="open" badge={a.slot.type} label={day.nhlGameCount === 0 ? "No games" : "Open slot"} /> : (
                  <SlotTile
                    kind="add"
                    badge={a.slot.type}
                    ariaLabel={`Add a player for ${dayName} ${formatMonthDay(day.date)} at ${SLOT_NAME[a.slot.type]}, slot ${day.activeSlots.slice(0, index + 1).filter(b => b.slot.type === a.slot.type).length} of ${day.activeSlots.filter(b => b.slot.type === a.slot.type).length}`}
                    onAdd={() => onAddToSlot(day, a.slot.type)}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <SectionLabel>Bench · {benchSlots}</SectionLabel>
        <div className="flex flex-col gap-1.5">{benchRows(day, benchSlots).map((row, i) => reserveTile(row, "BN", i))}</div>

        {irPlusSlots > 0 && (
          <>
            <SectionLabel>IR+ · {irPlusSlots}</SectionLabel>
            <div className="flex flex-col gap-1.5">{irPlusRows(day, irPlusSlots).map((row, i) => reserveTile(row, "IR+", i))}</div>
          </>
        )}

        {day.noGame.some(e => day.roster.some(r => r.playerId === e.playerId && r.rosterStatus === "ACTIVE")) && <details className="mt-4 text-body-sm text-ink-2"><summary className="cursor-pointer font-display">NOT PLAYING · {day.noGame.filter(e => day.roster.some(r => r.playerId === e.playerId && r.rosterStatus === "ACTIVE")).length}</summary><ul>{day.noGame.filter(e => day.roster.some(r => r.playerId === e.playerId && r.rosterStatus === "ACTIVE")).map(e => <li key={e.playerId} className="py-1">{name(e.playerId)}</li>)}</ul></details>}
        {hasOverrides && !isPast && (
          <button
            type="button"
            onClick={() => dispatch({ type: "override/resetDay", date: day.date })}
            className="mt-3 inline-flex h-8 items-center gap-1.5 self-start rounded-control px-1 text-caption font-semibold text-primary-strong hover:bg-primary-soft"
          >
            <RotateCcw aria-hidden className="size-3.5" /> Reset day lineup
          </button>
        )}
      </div>
    </section>
  );
}
