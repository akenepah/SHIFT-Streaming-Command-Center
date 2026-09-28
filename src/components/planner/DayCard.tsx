"use client";

import { AlertTriangle, ArrowLeftRight, ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Avatar, matchupText, shortName } from "@/components/player/PlayerBits";
import { POSITION_TONE, PositionBadge } from "@/components/ui/Badges";
import { formatDayLong, formatMonthDay } from "@/domain/dates";
import type { DailyLineup, PlannedTransaction, Player, SlotType } from "@/domain/types";
import { useStore } from "@/state/store";

type Props = {
  day: DailyLineup;
  isToday: boolean;
  isPast: boolean;
  movesToday: PlannedTransaction[];
  onMovePlayer: (player: Player, day: DailyLineup, anchor: HTMLElement) => void;
};

function groupOpenSlots(day: DailyLineup): [SlotType, number][] {
  const counts = new Map<SlotType, number>();
  for (const s of day.openSlots) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  return [...counts];
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h4 className={`mb-2 text-overline uppercase ${className}`}>{children}</h4>;
}

export function DayCard({ day, isToday, isPast, movesToday, onMovePlayer }: Props) {
  const { state, dispatch } = useStore();
  const [showNoGame, setShowNoGame] = useState(false);
  const players = state.players;
  const starting = day.activeSlots.filter((a) => a.playerId);
  const slotCount = day.activeSlots.length;
  const hasOverrides = day.appliedOverrides.length > 0 || day.ignoredOverrides.length > 0;
  const name = (id: string) => players[id]?.name ?? "Unknown player";
  const fill = slotCount ? (starting.length / slotCount) * 100 : 0;
  const wasting = day.benchedGames.length > 0;

  return (
    <section
      aria-label={`${formatDayLong(day.date)} ${formatMonthDay(day.date)}`}
      className={`flex min-w-0 flex-col rounded-panel border bg-surface ${isToday ? "border-primary ring-1 ring-primary" : "border-line"} ${
        isPast ? "opacity-70" : ""
      }`}
    >
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-display text-card-title text-ink">{formatDayLong(day.date)}</h3>
          {isToday && <span className="rounded-pill bg-primary px-2 py-0.5 text-overline uppercase text-white">Today</span>}
        </div>
        <p className="mt-0.5 text-caption text-ink-3 tabular-nums">
          {formatMonthDay(day.date)} · {day.nhlGameCount} NHL {day.nhlGameCount === 1 ? "game" : "games"}
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-pill bg-surface-muted" aria-hidden>
          <div className={`h-full rounded-pill ${wasting ? "bg-warn" : "bg-primary"}`} style={{ width: `${fill}%` }} />
        </div>
        <p className="mt-2 text-body-sm text-ink tabular-nums">
          {starting.length} / {slotCount} starting
        </p>
        <p className="text-caption text-ink-3 tabular-nums">
          {day.openSlots.length} open ·{" "}
          <span className={wasting ? "font-semibold text-warn" : ""}>{day.benchedGames.length} benched</span>
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-4 border-t border-line px-2 pb-3 pt-3 2xl:px-2.5">
        {movesToday.length > 0 && (
          <div className="rounded-control border border-primary/25 bg-primary-soft px-2.5 py-2 text-caption text-primary-strong">
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

        <div>
          <SectionLabel className="px-1 text-ink-2">Starting — games today</SectionLabel>
          {starting.length === 0 ? (
            <p className="px-1 text-body-sm text-ink-3">{day.nhlGameCount === 0 ? "No NHL games today." : "Nobody plays today."}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {starting.map((a) => {
                const p = players[a.playerId!];
                if (!p) return null;
                return (
                  <li key={a.slot.id}>
                    <button
                      type="button"
                      onClick={(e) => onMovePlayer(p, day, e.currentTarget)}
                      className={`flex h-12 w-full items-center gap-1.5 rounded-card border px-1.5 text-left transition-colors hover:border-line-strong 2xl:gap-2 2xl:px-2 ${POSITION_TONE[a.slot.type].tile}`}
                      aria-label={`${p.name}, ${a.slot.type}, ${a.game ? matchupText(a.game) : ""}${a.overridden ? ", set manually" : ""}. Change lineup spot`}
                    >
                      <PositionBadge kind={a.slot.type} compact />
                      <span className="hidden 3xl:contents">
                        <Avatar src={p.headshot} name={p.name} size={24} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-medium leading-tight text-ink" title={p.name}>
                          {shortName(p.name)}
                        </span>
                        <span className="block truncate text-caption leading-tight text-ink-3">
                          {a.game ? matchupText(a.game) : ""}
                          {a.overridden && <span className="font-semibold text-primary"> · Manual</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {day.benchedGames.length > 0 && (
          <div className="rounded-card border border-warn-line bg-warn-soft p-2">
            <SectionLabel className="flex items-center gap-1.5 px-1 text-warn-strong">
              <AlertTriangle aria-hidden className="size-3.5" />
              Benched games · {day.benchedGames.length}
            </SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {day.benchedGames.map((b) => {
                const p = players[b.playerId];
                if (!p) return null;
                return (
                  <li key={b.playerId}>
                    <button
                      type="button"
                      onClick={(e) => onMovePlayer(p, day, e.currentTarget)}
                      className="flex h-12 w-full items-center gap-1.5 rounded-control border border-warn-line bg-surface px-1.5 text-left hover:border-warn 2xl:gap-2 2xl:px-2"
                      aria-label={`${p.name} has a game but is benched. Change lineup spot`}
                    >
                      <PositionBadge kind="BN" compact />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-medium leading-tight text-ink" title={p.name}>
                          {shortName(p.name)}
                        </span>
                        <span className="block truncate text-caption leading-tight text-warn-strong">
                          {b.game ? matchupText(b.game) : ""} · {p.eligiblePositions.join("/")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {day.openSlots.length > 0 && (
          <div>
            <SectionLabel className="px-1 text-ink-2">Open slots · {day.openSlots.length}</SectionLabel>
            <ul className="flex flex-wrap gap-1.5">
              {groupOpenSlots(day).map(([type, count]) => (
                <li
                  key={type}
                  className="inline-flex h-7 items-center gap-1 rounded-control border border-dashed border-line-strong bg-surface px-2 text-caption font-medium text-ink-2"
                >
                  Open {type}
                  {count > 1 && <span className="text-ink-3">×{count}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {day.noGame.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowNoGame((v) => !v)}
              aria-expanded={showNoGame}
              className="flex h-7 w-full items-center gap-1 rounded-control px-1 text-overline uppercase text-ink-3 hover:text-ink-2"
            >
              <ChevronRight aria-hidden className={`size-3.5 transition-transform ${showNoGame ? "rotate-90" : ""}`} />
              No game · {day.noGame.length}
            </button>
            {showNoGame && (
              <ul className="mt-1 flex flex-col gap-0.5 pl-6 text-caption text-ink-3">
                {day.noGame.map((n) => (
                  <li key={n.playerId} className="truncate">
                    {shortName(name(n.playerId))}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {day.irPlus.length > 0 && (
          <div className="px-1 text-caption text-ink-3">
            <span className="text-overline uppercase text-pos-ir">IR+ · {day.irPlus.length}</span>
            <span className="block truncate">{day.irPlus.map((e) => shortName(name(e.playerId))).join(", ")}</span>
          </div>
        )}

        {hasOverrides && (
          <button
            type="button"
            onClick={() => dispatch({ type: "override/resetDay", date: day.date })}
            className="mt-auto inline-flex h-8 items-center gap-1.5 self-start rounded-control px-1 text-caption font-semibold text-primary hover:bg-primary-soft"
          >
            <RotateCcw aria-hidden className="size-3.5" /> Reset day lineup
          </button>
        )}
      </div>
    </section>
  );
}
