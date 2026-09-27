"use client";

import { useState } from "react";
import { Avatar, SlotBadge, fullMatchup, matchupText, shortName } from "@/components/player/PlayerBits";
import { formatDayShort, formatMonthDay } from "@/domain/dates";
import type { DailyLineup, PlannedTransaction, Player, SlotType } from "@/domain/types";
import { useStore } from "@/state/store";

type Props = {
  day: DailyLineup;
  isToday: boolean;
  isPast: boolean;
  movesToday: PlannedTransaction[];
  onMovePlayer: (player: Player, day: DailyLineup) => void;
};

function groupOpenSlots(day: DailyLineup): [SlotType, number][] {
  const counts = new Map<SlotType, number>();
  for (const s of day.openSlots) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  return [...counts];
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h4 className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${className}`}>{children}</h4>;
}

export function DayCard({ day, isToday, isPast, movesToday, onMovePlayer }: Props) {
  const { state, dispatch } = useStore();
  const [showNoGame, setShowNoGame] = useState(false);
  const players = state.players;
  const starting = day.activeSlots.filter((a) => a.playerId);
  const hasOverrides = day.appliedOverrides.length > 0 || day.ignoredOverrides.length > 0;
  const name = (id: string) => players[id]?.name ?? "Unknown player";

  return (
    <section
      aria-label={`${formatDayShort(day.date)} ${formatMonthDay(day.date)}`}
      className={`flex min-w-0 flex-col rounded-xl border bg-surface ${isToday ? "border-brand ring-1 ring-brand" : "border-line"} ${
        isPast ? "opacity-75" : ""
      }`}
    >
      <header className="border-b border-line px-3 pb-2 pt-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-bold">
            {formatDayShort(day.date)} <span className="font-medium text-ink-2">{formatMonthDay(day.date)}</span>
          </h3>
          {isToday && <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">Today</span>}
        </div>
        <p className="mt-0.5 text-[12px] text-ink-2">
          <span className="font-semibold text-ink tabular-nums">{day.nhlGameCount}</span> NHL{" "}
          {day.nhlGameCount === 1 ? "game" : "games"}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-ink-3 tabular-nums">
          <span>{starting.length} starting</span>
          {day.benchedGames.length > 0 && <span className="font-semibold text-warn">{day.benchedGames.length} benched</span>}
          {day.openSlots.length > 0 && <span>{day.openSlots.length} open</span>}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-2.5">
        {movesToday.length > 0 && (
          <div className="rounded-md border border-brand/30 bg-brand-soft px-2 py-1.5 text-[11px] text-brand-strong">
            <span className="font-semibold">Planned move</span>
            {movesToday.map((t) => (
              <div key={t.id} className="truncate">
                {t.addPlayerId && <>+ {shortName(name(t.addPlayerId))} </>}
                {t.dropPlayerId && <>− {shortName(name(t.dropPlayerId))}</>}
              </div>
            ))}
          </div>
        )}

        <div>
          <SectionLabel className="text-ink-2">Starting — games today · {starting.length}</SectionLabel>
          {starting.length === 0 ? (
            <p className="text-[12px] text-ink-3">{day.nhlGameCount === 0 ? "No NHL games." : "Nobody plays today."}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {starting.map((a) => {
                const p = players[a.playerId!];
                if (!p) return null;
                return (
                  <li key={a.slot.id}>
                    <button
                      type="button"
                      onClick={() => onMovePlayer(p, day)}
                      className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-canvas"
                      aria-label={`${p.name}, ${a.slot.type}, ${a.game ? matchupText(a.game) : ""}${a.overridden ? ", set manually" : ""}. Change lineup spot`}
                    >
                      <SlotBadge type={a.slot.type} />
                      <Avatar src={p.headshot} name={p.name} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium leading-tight">{shortName(p.name)}</span>
                        <span className="block truncate text-[11px] leading-tight text-ink-3">
                          {a.game ? matchupText(a.game) : ""}
                        </span>
                      </span>
                      {a.overridden && (
                        <span className="text-[10px] font-semibold text-brand" title="Set manually for this day">
                          Manual
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {day.benchedGames.length > 0 && (
          <div className="rounded-md border border-warn-line bg-warn-soft p-2">
            <SectionLabel className="text-warn-strong">
              <span aria-hidden>⚠ </span>Benched games · {day.benchedGames.length}
            </SectionLabel>
            <ul className="flex flex-col gap-1.5">
              {day.benchedGames.map((b) => {
                const p = players[b.playerId];
                if (!p) return null;
                return (
                  <li key={b.playerId}>
                    <button
                      type="button"
                      onClick={() => onMovePlayer(p, day)}
                      className="w-full rounded px-1 py-0.5 text-left hover:bg-white/60"
                      aria-label={`${p.name} has a game but is benched. Change lineup spot`}
                    >
                      <span className="block truncate text-[12px] font-medium leading-tight text-ink">{p.name}</span>
                      <span className="block truncate text-[11px] leading-tight text-warn-strong">
                        {b.game ? fullMatchup(p.nhlTeamId, b.game) : ""} · {p.eligiblePositions.join(" / ")}
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
            <SectionLabel className="text-ink-2">Open slots · {day.openSlots.length}</SectionLabel>
            <ul className="flex flex-wrap gap-1">
              {groupOpenSlots(day).map(([type, count]) => (
                <li
                  key={type}
                  className="rounded border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-ink-2"
                >
                  Open {type}
                  {count > 1 && <span className="text-ink-3"> ×{count}</span>}
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
              className="flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3 hover:text-ink-2"
            >
              <span aria-hidden className={`inline-block transition-transform ${showNoGame ? "rotate-90" : ""}`}>
                ▸
              </span>
              No game · {day.noGame.length}
            </button>
            {showNoGame && (
              <ul className="mt-1 flex flex-col gap-0.5 pl-3 text-[11px] text-ink-3">
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
          <div className="text-[11px] text-ink-3">
            <span className="font-semibold uppercase tracking-[0.08em]">IR+ · {day.irPlus.length}</span>
            <span className="block truncate">{day.irPlus.map((e) => shortName(name(e.playerId))).join(", ")}</span>
          </div>
        )}

        {hasOverrides && (
          <button
            type="button"
            onClick={() => dispatch({ type: "override/resetDay", date: day.date })}
            className="mt-auto self-start text-[11px] font-medium text-brand underline-offset-2 hover:underline"
          >
            Reset day lineup
          </button>
        )}
      </div>
    </section>
  );
}
