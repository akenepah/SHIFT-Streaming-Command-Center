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
  return <h4 className="mb-1.5 mt-4 px-0.5 text-overline uppercase text-ink-2">{children}</h4>;
}

export function DayCard({ day, isToday, isPast, movesToday, players, onMovePlayer, onAddToSlot }: Props) {
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
    const secondary = row.game ? matchupText(row.game) : "No game";
    return (
      <SlotTile
        key={key}
        kind="player"
        badge={badge}
        player={p}
        secondary={row.benchedGame ? `${secondary} · BN game` : secondary}
        benched={row.benchedGame}
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
        isPast ? "opacity-70" : ""
      }`}
    >
      <header className="px-3 pb-3 pt-4 2xl:px-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-display text-card-title uppercase tracking-wide text-ink">{dayName}</h3>
          {isToday && <span className="rounded-pill bg-primary px-2 py-0.5 text-overline uppercase text-on-primary">Today</span>}
        </div>
        <p className="text-caption text-ink-3 tabular-nums">
          {formatMonthDay(day.date)} · {day.nhlGameCount} NHL {day.nhlGameCount === 1 ? "game" : "games"}
        </p>
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-pill bg-surface-muted"
          role="img"
          aria-label={`${filled} of ${slotCount} active slots filled: ${OPPORTUNITY_LABEL[tone]}`}
        >
          <div
            className={`h-full rounded-pill ${OPPORTUNITY_BAR[tone]}`}
            style={{ width: `${tone === "na" ? 100 : slotCount ? (filled / slotCount) * 100 : 0}%` }}
          />
        </div>
        <p className="mt-2 text-body-sm text-ink tabular-nums">
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
        {movesToday.length > 0 && (
          <div className="mb-2 rounded-control border border-primary-line bg-primary-soft px-2.5 py-2 text-caption text-primary-strong">
            <span className="flex items-center gap-1.5 font-semibold">
              <ArrowLeftRight aria-hidden className="size-3.5" /> Planned move
            </span>
            {movesToday.map((t) => (
              <span key={t.id} className="mt-0.5 block truncate">
                {t.addPlayerId && <>+ {shortName(name(t.addPlayerId))} </>}
                {t.dropPlayerId && <>− {shortName(name(t.dropPlayerId))}</>}
              </span>
            ))}
          </div>
        )}

        <ul className="flex flex-col gap-1.5" aria-label={`${dayName} active lineup`}>
          {day.activeSlots.map((a) => {
            const p = a.playerId ? players[a.playerId] : undefined;
            return (
              <li key={a.slot.id}>
                {p ? (
                  <SlotTile
                    kind="player"
                    badge={a.slot.type}
                    player={p}
                    secondary={a.game ? matchupText(a.game) : ""}
                    overridden={a.overridden}
                    onSelect={(anchor) => onMovePlayer(p, day, anchor)}
                    ariaLabel={`${p.name}, ${a.slot.type}, ${a.game ? matchupText(a.game) : ""}${a.overridden ? ", set manually" : ""}. Change lineup spot`}
                  />
                ) : (
                  <SlotTile
                    kind="add"
                    badge={a.slot.type}
                    ariaLabel={`Add a player for ${dayName} at ${SLOT_NAME[a.slot.type]}`}
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

        {hasOverrides && (
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
