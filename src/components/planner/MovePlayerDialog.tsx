"use client";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SlotBadge, fullMatchup, shortName } from "@/components/player/PlayerBits";
import { formatDayLong, formatMonthDay } from "@/domain/dates";
import { generateDailyLineup } from "@/domain/lineup/generateDailyLineup";
import type { WeekInput } from "@/domain/lineup/generateWeek";
import { legalTargets, setOverride } from "@/domain/lineup/overrides";
import { BENCH_TARGET, type DailyLineup, type Player } from "@/domain/types";
import { useStore } from "@/state/store";

const startsOf = (d: DailyLineup) => d.activeSlots.filter((a) => a.playerId).length;

/** One-day lineup change for a single player. */
export function MovePlayerDialog({
  target,
  weekInput,
  onClose,
}: {
  target: { player: Player; day: DailyLineup } | null;
  weekInput: WeekInput;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const player = target?.player;
  const day = target?.day;
  const targets = player && day ? legalTargets(day, player) : [];
  const current = day?.activeSlots.find((a) => a.playerId === player?.id);
  const game = current?.game ?? day?.benchedGames.find((b) => b.playerId === player?.id)?.game ?? null;
  const existing = day && player ? state.overrides.find((o) => o.date === day.date && o.playerId === player.id) : undefined;

  const preview = (targetSlotId: string) => {
    if (!day || !player) return 0;
    const next = generateDailyLineup({
      ...weekInput,
      date: day.date,
      overrides: setOverride(state.overrides, { date: day.date, playerId: player.id, targetSlotId }),
    });
    return startsOf(next) - startsOf(day);
  };

  const choose = (targetSlotId: string) => {
    if (!day || !player) return;
    dispatch({ type: "override/set", override: { date: day.date, playerId: player.id, targetSlotId } });
    onClose();
  };

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      width="sm"
      title={player ? `Move ${player.name}` : "Move player"}
      description={
        day && player ? (
          <>
            {formatDayLong(day.date)}, {formatMonthDay(day.date)} only
            {game && <> · {fullMatchup(player.nhlTeamId, game)}</>}
            {current ? <> · now in {current.slot.type}</> : <> · now benched</>}
          </>
        ) : undefined
      }
      footer={
        <>
          {existing && day && player && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                dispatch({ type: "override/remove", date: day.date, playerId: player.id });
                onClose();
              }}
            >
              Return to automatic
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      {targets.length === 0 ? (
        <p className="text-[13px] text-ink-2">No other legal lineup spots for this player today.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {targets.map((t) => {
            const delta = preview(t.targetSlotId);
            const occupant = t.occupantId ? state.players[t.occupantId] : null;
            return (
              <li key={t.targetSlotId}>
                <button
                  type="button"
                  onClick={() => choose(t.targetSlotId)}
                  className="flex w-full items-center gap-3 rounded-md border border-line px-3 py-2 text-left hover:border-brand hover:bg-brand-soft"
                >
                  {t.targetSlotId === BENCH_TARGET ? (
                    <span className="inline-flex h-5 min-w-8 items-center justify-center rounded bg-canvas px-1 text-[10px] font-bold text-ink-2">
                      BN
                    </span>
                  ) : (
                    <SlotBadge type={day!.activeSlots.find((a) => a.slot.id === t.targetSlotId)!.slot.type} />
                  )}
                  <span className="flex-1 text-[13px]">
                    {t.targetSlotId === BENCH_TARGET ? "Sit on bench" : `Move to ${t.label}`}
                    {occupant ? (
                      <span className="text-ink-3"> · replaces {shortName(occupant.name)}</span>
                    ) : (
                      t.targetSlotId !== BENCH_TARGET && <span className="text-ink-3"> · open slot</span>
                    )}
                  </span>
                  <span
                    className={`text-[12px] font-semibold tabular-nums ${
                      delta < 0 ? "text-warn" : delta > 0 ? "text-ok" : "text-ink-3"
                    }`}
                  >
                    {delta === 0 ? "No change in starts" : `${delta > 0 ? "+" : ""}${delta} ${Math.abs(delta) === 1 ? "start" : "starts"}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-ink-3">
        Anyone displaced is re-placed automatically to keep as many games started as possible.
      </p>
    </Dialog>
  );
}
